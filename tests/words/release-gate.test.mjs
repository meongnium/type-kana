import assert from "node:assert/strict"
import test from "node:test"
import {
	WORD_ANSWER_POLICY,
	WORD_COLLECTION_N5,
	WORD_MAPPING_SCHEMA_VERSION
} from "../../src/lib/words/contracts.ts"
import {
	emitRuntimeArtifact,
	ArtifactReleaseError,
	validateRuntimeArtifact
} from "../../tools/words/artifact.ts"
import {
	createFormId,
	createLexemeId,
	createReadingCardId,
	createSourceRecordHash,
	createSourceRowKey
} from "../../tools/words/identity.ts"
import { mapOpenJlptRows } from "../../tools/words/mapping.ts"

const pin = {
	source: "openjlpt",
	repositoryUrl: "https://github.com/evanclan/OpenJLPT",
	immutableUrl: "https://example.invalid/openjlpt-synthetic",
	importerVersion: "phase0.5-test",
	releaseOrCommit: "synthetic-fixture-v1",
	assetFilename: "n5.json",
	sha256: "synthetic-fixture-sha256"
}

function form(entSeq, surface, reading = surface) {
	const lexemeId = createLexemeId(entSeq)
	return {
		formId: createFormId(lexemeId, surface, reading),
		lexemeId,
		writtenSurface: surface,
		reading,
		writtenKind: /\p{Script=Han}/u.test(surface) ? "non-kana" : "kana",
		restrictions: { appliesToWritten: [], appliesToReading: [] }
	}
}

function row(surface, reading = surface, overrides = {}) {
	const base = {
		collectionId: WORD_COLLECTION_N5,
		sourceLevel: "N5",
		sourceWrittenSurface: surface,
		rawSourceReading: reading,
		effectiveReading: reading,
		sourceReadingStatus: "explicit",
		sourceMeanings: [],
		...overrides
	}
	return {
		sourceRowKey: createSourceRowKey(pin, base),
		sourceRecordHash: createSourceRecordHash(base),
		sourceIndex: overrides.sourceIndex ?? 0,
		sourceLocator: overrides.sourceLocator ?? "synthetic#0",
		...base,
		sourcePin: pin
	}
}

function approved(surface = "あまり", reading = surface) {
	const canonical = form("gate-" + surface, surface, reading)
	return mapOpenJlptRows(
		[row(surface, reading)],
		[
			{
				lexemeId: canonical.lexemeId,
				entSeq: canonical.lexemeId.replace("jmdict:", ""),
				forms: [canonical],
				senses: [],
				sourcePin: {
					source: "jmdict-simplified",
					repositoryUrl: "https://github.com/scriptin/jmdict-simplified",
					immutableUrl: "https://example.invalid/jmdict-synthetic",
					importerVersion: "phase0.5-test",
					releaseOrCommit: "synthetic-fixture-v1",
					assetFilename: "jmdict-eng.json",
					sha256: "synthetic-jmdict-sha256"
				}
			}
		]
	).approvedMappings[0]
}

function emit(mappings, options = {}) {
	return emitRuntimeArtifact(mappings, {
		contentVersion: "synthetic-phase-0-v1",
		generatedAt: "2026-08-01T00:00:00.000Z",
		...options
	})
}

function rejects(mapping) {
	assert.throws(() => emit([mapping]), ArtifactReleaseError)
}

test("rejects every non-releasable mapping status", () => {
	for (const status of [
		"ambiguous",
		"unmatched",
		"duplicate",
		"conflicting-membership",
		"invalid-restriction",
		"invalid-manual-override",
		"invalid-surface",
		"unsupported-selector-mora"
	]) {
		const mapping = approved()
		mapping.decision = {
			...mapping.decision,
			status,
			approval: status === "ambiguous" ? "pending" : "rejected"
		}
		rejects(mapping)
	}
})

test("rejects forbidden, invalid-surface, unsupported-token, and unknown-token runtime surfaces", () => {
	for (const surface of [
		"先生",
		"食べる",
		"お茶",
		"・",
		"abc",
		"あ1",
		"ゝ",
		"ティ",
		"あゝ"
	]) {
		const mapping = approved()
		mapping.word = { ...mapping.word, surface }
		rejects(mapping)
	}
})

test("rejects forged form identity, runtime IDs, source provenance, and metadata", () => {
	const forgedForm = approved()
	forgedForm.form = { ...forgedForm.form, formId: "jmdict-form:sha256:forged" }
	rejects(forgedForm)

	const forgedWordId = approved()
	forgedWordId.word = { ...forgedWordId.word, formId: "forged-form-id" }
	rejects(forgedWordId)

	const forgedCard = approved()
	forgedCard.word = { ...forgedCard.word, cardId: "forged-card-id" }
	rejects(forgedCard)

	const forgedSource = approved()
	forgedSource.row = {
		...forgedSource.row,
		sourceRecordHash: "forged-source-record-hash"
	}
	rejects(forgedSource)

	const forgedScript = approved()
	forgedScript.word = { ...forgedScript.word, script: "mixed-kana" }
	rejects(forgedScript)

	const forgedTokens = approved()
	forgedTokens.word = { ...forgedTokens.word, surfaceTokens: ["あ"] }
	rejects(forgedTokens)

	const forgedRequirements = approved()
	forgedRequirements.word = {
		...forgedRequirements.word,
		eligibilityRequirements: []
	}
	rejects(forgedRequirements)
})

test("rejects unsupported answer policy and schema-invalid runtime artifacts", () => {
	const mapping = approved()
	mapping.word = { ...mapping.word, answerPolicy: "wrong-policy" }
	rejects(mapping)

	const artifact = emit([approved()])
	const invalid = {
		...artifact,
		schemaVersion: 999,
		words: [
			{
				...artifact.words[0],
				cardId: "wrong-card",
				canonicalAnswer: "wrong-answer",
				collectionIds: []
			}
		]
	}
	const errors = validateRuntimeArtifact(invalid)
	assert.ok(errors.includes("invalid-schema-version"))
	assert.ok(errors.includes("invalid-card-id:" + artifact.words[0].formId))
	assert.ok(
		errors.includes("canonical-answer-mismatch:" + artifact.words[0].formId)
	)
	assert.ok(
		errors.includes("missing-collection-membership:" + artifact.words[0].formId)
	)
})

test("rejects duplicate runtime membership and coverage regression", () => {
	const mapping = approved()
	assert.throws(() => emit([mapping, mapping]), ArtifactReleaseError)
	assert.throws(
		() => emit([approved()], { coverageBaseline: { minimumWordCount: 2 } }),
		ArtifactReleaseError
	)
})

test("derives stable card IDs from the canonical form ID", () => {
	const mapping = approved()
	assert.equal(mapping.word.cardId, createReadingCardId(mapping.form.formId))
	assert.equal(mapping.decision.schemaVersion, WORD_MAPPING_SCHEMA_VERSION)
	assert.equal(mapping.word.answerPolicy, WORD_ANSWER_POLICY)
})
