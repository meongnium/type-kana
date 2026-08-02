import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { resolveEligibility } from "../../src/lib/words/eligibility.ts"
import { classifySurface } from "../../src/lib/words/surface.ts"
import { tokenizeSurface } from "../../src/lib/words/tokenizer.ts"
import {
	createCollectionMembershipKey,
	createFormId,
	createReadingCardId,
	sha256Hex
} from "./identity.ts"
import { buildCanonicalLexemes } from "./jmdict-adapter.ts"
import { mapOpenJlptRows } from "./mapping.ts"
import { parseOpenJlptN5 } from "./openjlpt-adapter.ts"
import { acquirePinnedSources, SOURCE_CACHE_DIR } from "./acquire-sources.mjs"

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../.."
)
const REPORT_PATH = path.join(
	REPO_ROOT,
	"audit",
	"words",
	"n5-import-report.json"
)
const REPORT_SCHEMA_VERSION = 1
const SAMPLE_LIMIT = 20
const DUPLICATE_SAMPLE_LIMIT = 1000

function countBy(values) {
	const counts = {}
	for (const value of values) {
		counts[value] = (counts[value] ?? 0) + 1
	}
	return counts
}

function bounded(values, limit = SAMPLE_LIMIT) {
	return values.slice(0, limit)
}

function sourceRowSummary(row) {
	return {
		sourceRowKey: row.sourceRowKey,
		sourceRecordHash: row.sourceRecordHash,
		sourceLocator: row.sourceLocator,
		sourceWord: row.sourceWrittenSurface,
		rawSourceReading: row.rawSourceReading,
		effectiveReading: row.effectiveReading,
		sourceReadingStatus: row.sourceReadingStatus,
		sourceLevel: row.sourceLevel,
		meanings: [...row.sourceMeanings]
	}
}

function candidateSummary(form, lexemeById) {
	const lexeme = lexemeById.get(form.lexemeId)
	return {
		formId: form.formId,
		lexemeId: form.lexemeId,
		writtenSurface: form.writtenSurface,
		reading: form.reading,
		writtenKind: form.writtenKind,
		restrictions: form.restrictions,
		jmdictGlosses: [
			...new Set((lexeme?.senses ?? []).flatMap((sense) => sense.glosses))
		],
		jmdictPartsOfSpeech: [
			...new Set((lexeme?.senses ?? []).flatMap((sense) => sense.partsOfSpeech))
		]
	}
}

function decisionSample(decision, rowByKey, formById, lexemeById) {
	const row = rowByKey.get(decision.sourceRowKey)
	return {
		...sourceRowSummary(row),
		status: decision.status,
		approval: decision.approval,
		diagnosticCodes: [...decision.diagnosticCodes],
		candidateFormIds: [...decision.candidateFormIds],
		selectedFormId: decision.selectedFormId,
		candidates: decision.candidateFormIds
			.map((formId) => formById.get(formId))
			.filter(Boolean)
			.map((form) => candidateSummary(form, lexemeById))
	}
}

function tokenStats(rows) {
	const perRow = rows.map((row) => ({
		row,
		tokenization: tokenizeSurface(row.sourceWrittenSurface),
		eligibility: resolveEligibility(row.sourceWrittenSurface)
	}))
	const countDetails = (kind) =>
		perRow.reduce(
			(total, item) =>
				total +
				item.tokenization.details.filter((detail) => detail.kind === kind)
					.length,
			0
		)
	return {
		approvedHiraganaWords: 0,
		approvedKatakanaWords: 0,
		approvedMixedKanaWords: 0,
		excludedForeignCombinations: countDetails("foreign-combination"),
		excludedUnsupportedYoon: countDetails("unsupported-yoon"),
		excludedStandaloneSmallKana: countDetails("unsupported-small-kana"),
		unknownTokenDiagnostics: perRow.reduce(
			(total, item) =>
				total +
				item.tokenization.diagnostics.filter(
					(diagnostic) => diagnostic.code === "unknown-token"
				).length,
			0
		),
		invalidProlongedMarkDiagnostics: perRow.reduce(
			(total, item) =>
				total +
				item.eligibility.diagnostics.filter(
					(diagnostic) => diagnostic.code === "invalid-prolonged-mark"
				).length,
			0
		)
	}
}

function mappingCounts(decisions, approvedMappings) {
	const statusCounts = countBy(decisions.map((decision) => decision.status))
	const approved = decisions.filter(
		(decision) =>
			decision.approval === "approved" &&
			(decision.status === "exact" || decision.status === "manual-override")
	)
	return {
		exactApproved: approved.filter((decision) => decision.status === "exact")
			.length,
		duplicateSourceRow: statusCounts.duplicate ?? 0,
		ambiguous: statusCounts.ambiguous ?? 0,
		unmatched: statusCounts.unmatched ?? 0,
		invalidRestriction: statusCounts["invalid-restriction"] ?? 0,
		invalidSurface: statusCounts["invalid-surface"] ?? 0,
		invalidSourceReading: statusCounts["invalid-source-reading"] ?? 0,
		unsupportedSelectorMora: statusCounts["unsupported-selector-mora"] ?? 0,
		conflictingMembership: statusCounts["conflicting-membership"] ?? 0,
		manualOverride: statusCounts["manual-override"] ?? 0,
		invalidManualOverride: statusCounts["invalid-manual-override"] ?? 0,
		approvedRuntimeMemberships: approvedMappings.length,
		totalPotentialRuntimeWords: new Set(
			approvedMappings.map((mapping) => mapping.form.formId)
		).size,
		statusCounts
	}
}

function qualityChecks(lexemes, approvedMappings) {
	const formIds = new Map()
	let duplicateFormIds = 0
	let idCollisions = 0
	for (const lexeme of lexemes) {
		for (const form of lexeme.forms) {
			const expected = createFormId(
				form.lexemeId,
				form.writtenSurface,
				form.reading
			)
			if (expected !== form.formId) idCollisions += 1
			const identity = JSON.stringify([
				form.lexemeId,
				form.writtenSurface.normalize("NFKC"),
				form.reading.normalize("NFKC")
			])
			if (formIds.has(form.formId)) {
				duplicateFormIds += 1
				if (formIds.get(form.formId) !== identity) idCollisions += 1
			} else {
				formIds.set(form.formId, identity)
			}
		}
	}

	const membershipKeys = new Set()
	let duplicateRuntimeMemberships = 0
	let synthesizedKanjiToKanaSurfaces = 0
	let artifactRecordsWithUnsupportedTokens = 0
	let artifactSourceSurfaceMismatches = 0
	const approvedByForm = new Map()
	for (const mapping of approvedMappings) {
		const membershipKey = createCollectionMembershipKey(
			mapping.row.collectionId,
			mapping.form.formId
		)
		if (membershipKeys.has(membershipKey)) duplicateRuntimeMemberships += 1
		membershipKeys.add(membershipKey)
		if (!approvedByForm.has(mapping.form.formId)) {
			approvedByForm.set(mapping.form.formId, mapping)
		}
		if (mapping.word.surface !== mapping.row.sourceWrittenSurface) {
			artifactSourceSurfaceMismatches += 1
			if (
				classifySurface(mapping.row.sourceWrittenSurface) === "contains-kanji"
			) {
				synthesizedKanjiToKanaSurfaces += 1
			}
		}
		const eligibility = resolveEligibility(mapping.row.sourceWrittenSurface)
		if (!eligibility.acceptedForArtifact) {
			artifactRecordsWithUnsupportedTokens += 1
		}
	}

	const cardIds = new Set()
	let duplicateCardIds = 0
	for (const mapping of approvedByForm.values()) {
		const cardId = createReadingCardId(mapping.form.formId)
		if (cardIds.has(cardId)) duplicateCardIds += 1
		cardIds.add(cardId)
	}

	return {
		duplicateFormIds,
		duplicateCardIds,
		duplicateRuntimeMemberships,
		idCollisions,
		synthesizedKanjiToKanaSurfaces,
		artifactRecordsWithUnsupportedTokens,
		artifactSourceSurfaceMismatches
	}
}

function sampleBuckets(decisions, rowByKey, formById, lexemeById) {
	const bucket = (statuses, limit = SAMPLE_LIMIT) =>
		bounded(
			decisions
				.filter((decision) => statuses.includes(decision.status))
				.map((decision) =>
					decisionSample(decision, rowByKey, formById, lexemeById)
				),
			limit
		)
	return {
		ambiguous: bucket(["ambiguous"]),
		unmatched: bucket(["unmatched"]),
		unsupportedSelectorMora: bucket(["unsupported-selector-mora"]),
		invalidSurfaces: bucket(["invalid-surface"]),
		invalidSourceReadings: bucket(["invalid-source-reading"]),
		invalidRestrictions: bucket(["invalid-restriction"]),
		conflictingMemberships: bucket(["conflicting-membership"]),
		duplicateSourceRows: bucket(["duplicate"], DUPLICATE_SAMPLE_LIMIT),
		invalidManualOverrides: bucket(["invalid-manual-override"])
	}
}

function contentHash(rows, decisions, approvedMappings, lexemes) {
	const rowIdentity = rows
		.map((row) => ({
			sourceRecordHash: row.sourceRecordHash,
			sourceWord: row.sourceWrittenSurface,
			rawSourceReading: row.rawSourceReading,
			effectiveReading: row.effectiveReading,
			sourceLevel: row.sourceLevel,
			sourceMeanings: [...row.sourceMeanings]
		}))
		.sort((left, right) =>
			JSON.stringify(left).localeCompare(JSON.stringify(right))
		)
	const decisionIdentity = decisions
		.map((decision) => ({
			sourceRecordHash: decision.sourceRecordHash,
			rawSourceReading: decision.rawSourceReading,
			effectiveReading: decision.effectiveReading,
			status: decision.status,
			candidateFormIds: [...decision.candidateFormIds].sort(),
			selectedFormId: decision.selectedFormId
		}))
		.sort((left, right) =>
			JSON.stringify(left).localeCompare(JSON.stringify(right))
		)
	const formIdentity = lexemes
		.flatMap((lexeme) =>
			lexeme.forms.map((form) => ({
				formId: form.formId,
				lexemeId: form.lexemeId,
				writtenSurface: form.writtenSurface,
				reading: form.reading,
				restrictions: form.restrictions
			}))
		)
		.sort((left, right) => left.formId.localeCompare(right.formId))
	const approvedIdentity = approvedMappings
		.map((mapping) => ({
			formId: mapping.form.formId,
			sourceRecordHash: mapping.row.sourceRecordHash,
			collectionId: mapping.row.collectionId
		}))
		.sort((left, right) =>
			JSON.stringify(left).localeCompare(JSON.stringify(right))
		)
	return sha256Hex(
		JSON.stringify({
			rowIdentity,
			decisionIdentity,
			formIdentity,
			approvedIdentity
		})
	)
}

function relativePath(filePath) {
	return path.relative(REPO_ROOT, filePath).replaceAll(path.sep, "/")
}

async function main() {
	const acquisition = await acquirePinnedSources()
	const jmdictInput = JSON.parse(
		await readFile(acquisition.jmdict.jsonPath, "utf8")
	)
	const openJlptInput = JSON.parse(
		await readFile(acquisition.openJlpt.path, "utf8")
	)
	const jmdict = buildCanonicalLexemes(jmdictInput, acquisition.jmdict.pin)
	const openJlpt = parseOpenJlptN5(openJlptInput, acquisition.openJlpt.pin)
	const mapping = mapOpenJlptRows(openJlpt.rows, jmdict.lexemes)
	const rowByKey = new Map(openJlpt.rows.map((row) => [row.sourceRowKey, row]))
	const lexemeById = new Map(
		jmdict.lexemes.map((lexeme) => [lexeme.lexemeId, lexeme])
	)
	const formById = new Map(
		jmdict.lexemes.flatMap((lexeme) =>
			lexeme.forms.map((form) => [form.formId, form])
		)
	)
	const sourceSurfaceCounts = countBy(
		openJlpt.rows.map((row) => classifySurface(row.sourceWrittenSurface))
	)
	const sourceCounts = {
		totalOpenJlptN5Rows: openJlpt.totalRecords,
		rowsWithEmptyRawReading: openJlpt.rows.filter(
			(row) => row.rawSourceReading === ""
		).length,
		rowsWithExplicitReading: openJlpt.rows.filter(
			(row) => row.rawSourceReading !== ""
		).length,
		hiraganaSourceSurfaces: sourceSurfaceCounts.hiragana ?? 0,
		katakanaSourceSurfaces: sourceSurfaceCounts.katakana ?? 0,
		mixedKanaSourceSurfaces: sourceSurfaceCounts["mixed-kana"] ?? 0,
		kanjiContainingSourceSurfaces: sourceSurfaceCounts["contains-kanji"] ?? 0,
		invalidOrOtherSurfaces: sourceSurfaceCounts["unsupported/other"] ?? 0
	}
	const tokenCounts = tokenStats(openJlpt.rows)
	for (const mappingItem of mapping.approvedMappings) {
		if (mappingItem.word.script === "hiragana")
			tokenCounts.approvedHiraganaWords += 1
		else if (mappingItem.word.script === "katakana")
			tokenCounts.approvedKatakanaWords += 1
		else tokenCounts.approvedMixedKanaWords += 1
	}

	const checks = qualityChecks(jmdict.lexemes, mapping.approvedMappings)
	const decisions = mapping.decisions
	const samples = sampleBuckets(decisions, rowByKey, formById, lexemeById)
	const sourceSpecs = acquisition.manifest.sources
	const jmdictSpec = sourceSpecs.find(
		(source) => source.kind === "jmdict-tar-gz"
	)
	const openJlptSpec = sourceSpecs.find(
		(source) => source.kind === "openjlpt-json"
	)
	const reportContentHash = contentHash(
		openJlpt.rows,
		decisions,
		mapping.approvedMappings,
		jmdict.lexemes
	)
	const report = {
		reportSchemaVersion: REPORT_SCHEMA_VERSION,
		importerVersion: acquisition.manifest.importerVersion,
		generatedAt: acquisition.importedAt,
		sourceAcquisition: {
			cacheDirectory: relativePath(SOURCE_CACHE_DIR),
			importedAt: acquisition.importedAt,
			sources: [
				{
					repository: acquisition.jmdict.pin.repositoryUrl,
					releaseOrCommit: acquisition.jmdict.pin.releaseOrCommit,
					releaseCommit: jmdictSpec?.pin.releaseCommit,
					assetFilename: acquisition.jmdict.pin.assetFilename,
					immutableUrl: acquisition.jmdict.pin.immutableUrl,
					expectedSha256: acquisition.jmdict.pin.sha256,
					observedSha256: acquisition.jmdict.archiveSha256,
					extractedFilename: jmdictSpec?.extractedFilename,
					extractedSha256: acquisition.jmdict.extractedSha256
				},
				{
					repository: acquisition.openJlpt.pin.repositoryUrl,
					releaseOrCommit: acquisition.openJlpt.pin.releaseOrCommit,
					assetFilename: acquisition.openJlpt.pin.assetFilename,
					immutableUrl: acquisition.openJlpt.pin.immutableUrl,
					expectedSha256: acquisition.openJlpt.pin.sha256,
					observedSha256: acquisition.openJlpt.sha256,
					expectedGitBlobSha: openJlptSpec?.pin.gitBlobSha,
					observedGitBlobSha: acquisition.openJlpt.gitBlobSha
				}
			]
		},
		jmdictDocument: jmdict.documentMetadata,
		sourceCounts,
		mappingCounts: mappingCounts(decisions, mapping.approvedMappings),
		scriptAndTokenCounts: tokenCounts,
		qualityChecks: checks,
		samples,
		adapterDiagnostics: {
			openJlpt: countBy(openJlpt.diagnostics.map((item) => item.code)),
			jmdict: countBy(jmdict.diagnostics.map((item) => item.code)),
			pipeline: countBy(mapping.diagnostics.map((item) => item.code))
		},
		proposedCoverageBaseline: {
			active: false,
			sourceRowCount: openJlpt.totalRecords,
			approvedRuntimeWordCount: new Set(
				mapping.approvedMappings.map((item) => item.form.formId)
			).size,
			approvedCategoryCounts: {
				hiragana: tokenCounts.approvedHiraganaWords,
				katakana: tokenCounts.approvedKatakanaWords,
				mixedKana: tokenCounts.approvedMixedKanaWords
			},
			sourceChecksums: {
				jmdictArchiveSha256: acquisition.jmdict.archiveSha256,
				openJlptSha256: acquisition.openJlpt.sha256
			},
			contentHash: reportContentHash
		}
	}

	await mkdir(path.dirname(REPORT_PATH), { recursive: true })
	await writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8")
	console.log(
		JSON.stringify(
			{
				reportPath: relativePath(REPORT_PATH),
				sourceCounts: report.sourceCounts,
				mappingCounts: report.mappingCounts,
				scriptAndTokenCounts: report.scriptAndTokenCounts,
				qualityChecks: report.qualityChecks,
				proposedCoverageBaseline: report.proposedCoverageBaseline
			},
			null,
			2
		)
	)
	if (Object.values(checks).some((value) => value !== 0)) {
		throw new Error("Phase 0.5 quality checks are not all zero")
	}
}

await main()
