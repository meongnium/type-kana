import {
	WORD_ANSWER_POLICY,
	WORD_MAPPING_SCHEMA_VERSION,
	WORD_MANUAL_OVERRIDE_SCHEMA_VERSION
} from "../../src/lib/words/contracts.ts"
import type {
	CanonicalForm,
	CanonicalLexeme,
	ImportDiagnostic,
	KanaReadingWordV1,
	ManualOverride,
	MappingApproval,
	MappingDecision,
	OpenJlptSourceRow
} from "../../src/lib/words/contracts.ts"
import { resolveEligibility } from "../../src/lib/words/eligibility.ts"
import {
	canonicalRomaji,
	normalizePronunciationKana
} from "../../src/lib/words/romaji.ts"
import { validateSourceSurface } from "../../src/lib/words/surface.ts"
import {
	createCollectionMembershipKey,
	createReadingCardId
} from "./identity.ts"

export interface ApprovedWordMapping {
	decision: MappingDecision
	row: OpenJlptSourceRow
	form: CanonicalForm
	pronunciationKana: string
	word: KanaReadingWordV1
}

export interface MappingPipelineResult {
	decisions: readonly MappingDecision[]
	diagnostics: readonly ImportDiagnostic[]
	approvedMappings: readonly ApprovedWordMapping[]
}

export interface ManualOverrideValidation {
	override: ManualOverride
	codes: readonly string[]
}

function normalized(value: string): string {
	return value.normalize("NFKC")
}

function formLookupKey(writtenSurface: string, reading: string): string {
	return JSON.stringify([normalized(writtenSurface), normalized(reading)])
}

export function restrictionsAllow(
	form: CanonicalForm,
	row: OpenJlptSourceRow
): boolean {
	const writtenRestrictions = form.restrictions.appliesToWritten.map(normalized)
	const readingRestrictions = form.restrictions.appliesToReading.map(normalized)
	const written = normalized(row.sourceWrittenSurface)
	const reading = normalized(row.effectiveReading)
	return (
		(writtenRestrictions.length === 0 ||
			writtenRestrictions.includes(written)) &&
		(readingRestrictions.length === 0 || readingRestrictions.includes(reading))
	)
}

function sourceRef(row: OpenJlptSourceRow, form: CanonicalForm): string[] {
	return [
		"jmdict:" + form.lexemeId.replace(/^jmdict:/, ""),
		"openjlpt:" + row.sourceRecordHash,
		"openjlpt-row:" + row.sourceRowKey
	]
}

function textValue(value: unknown): string {
	return typeof value === "string" ? value : ""
}
export function validateManualOverride(
	override: ManualOverride,
	forms: readonly CanonicalForm[]
): readonly string[] {
	if (!override || typeof override !== "object") {
		return ["invalid-override-shape"]
	}
	const codes: string[] = []
	const overrideId = textValue(override?.overrideId)
	const sourceRowKey = textValue(override?.sourceRowKey)
	const selectedFormId = textValue(override.selectedFormId)
	const reason = textValue(override.reason)
	const reviewer = textValue(override.reviewer)
	const version = textValue(override.version)
	if (override.schemaVersion !== WORD_MANUAL_OVERRIDE_SCHEMA_VERSION) {
		codes.push("invalid-override-schema")
	}
	if (!overrideId.trim()) codes.push("missing-override-id")
	if (!sourceRowKey.trim()) codes.push("missing-source-row-key")
	if (!selectedFormId.trim()) codes.push("missing-selected-form-id")
	if (!reason.trim()) codes.push("missing-override-reason")
	if (!reviewer.trim()) codes.push("missing-override-reviewer")
	if (!version.trim()) codes.push("missing-override-version")
	if (
		selectedFormId.trim() &&
		!forms.some((form) => form.formId === selectedFormId)
	) {
		codes.push("unknown-selected-form")
	}
	return [...new Set(codes)]
}
function indexManualOverrides(
	overrides: readonly ManualOverride[],
	forms: readonly CanonicalForm[],
	rows: readonly OpenJlptSourceRow[]
): {
	byRow: ReadonlyMap<string, ManualOverride>
	errorsByRow: ReadonlyMap<string, readonly string[]>
	diagnostics: readonly ImportDiagnostic[]
} {
	const byRow = new Map<string, ManualOverride>()
	const errorsByRow = new Map<string, string[]>()
	const diagnostics: ImportDiagnostic[] = []
	const overrideIdOwners = new Map<string, string>()
	const rowOwners = new Map<string, string>()

	const addError = (sourceRowKey: string, code: string) => {
		const current = errorsByRow.get(sourceRowKey) ?? []
		if (!current.includes(code)) current.push(code)
		errorsByRow.set(sourceRowKey, current)
	}

	for (const override of overrides) {
		const codes = [...validateManualOverride(override, forms)]
		const rowKey = textValue(override?.sourceRowKey)
		const overrideId = textValue(override?.overrideId)
		if (overrideId && overrideIdOwners.has(overrideId)) {
			codes.push("duplicate-override-id")
			addError(
				overrideIdOwners.get(overrideId) ?? rowKey,
				"duplicate-override-id"
			)
		} else if (overrideId) {
			overrideIdOwners.set(overrideId, rowKey)
		}
		if (rowKey && rowOwners.has(rowKey)) {
			codes.push("duplicate-source-row-override")
			addError(rowKey, "duplicate-source-row-override")
		} else if (rowKey) {
			rowOwners.set(rowKey, rowKey)
		}
		for (const code of [...new Set(codes)]) addError(rowKey, code)
		if (rowKey && !byRow.has(rowKey)) byRow.set(rowKey, override)
		if (codes.length > 0) {
			diagnostics.push({
				code: "invalid-manual-override",
				severity: "error",
				message: "Manual override validation failed: " + codes.join(", ") + ".",
				sourceRowKey: rowKey || undefined
			})
		}
	}

	const rowKeys = new Set(rows.map((row) => row.sourceRowKey))
	for (const override of overrides) {
		const rowKey = textValue(override?.sourceRowKey)
		if (rowKey && !rowKeys.has(rowKey)) {
			diagnostics.push({
				code: "orphan-manual-override",
				severity: "warning",
				message: "Manual override does not reference an imported source row.",
				sourceRowKey: rowKey
			})
		}
	}

	return { byRow, errorsByRow, diagnostics }
}

function buildApprovedWord(
	row: OpenJlptSourceRow,
	form: CanonicalForm,
	decision: MappingDecision,
	eligibility: ReturnType<typeof resolveEligibility>,
	pronunciationKana: string,
	canonicalAnswer: string
): ApprovedWordMapping {
	const word: KanaReadingWordV1 = {
		formId: form.formId,
		cardId: createReadingCardId(form.formId),
		surface: row.sourceWrittenSurface,
		pronunciationKana,
		script: eligibility.classification as
			| "hiragana"
			| "katakana"
			| "mixed-kana",
		surfaceTokens: eligibility.surfaceTokens,
		requiredCanonicalTokens: eligibility.requiredCanonicalTokens,
		eligibilityRequirements: eligibility.eligibilityRequirements,
		answerPolicy: WORD_ANSWER_POLICY,
		canonicalAnswer,
		collectionIds: [row.collectionId],
		sourceRefs: sourceRef(row, form)
	}

	return { decision, row, form, pronunciationKana, word }
}

function makeDecision(
	row: OpenJlptSourceRow,
	status: MappingDecision["status"],
	approval: MappingApproval,
	candidateFormIds: readonly string[],
	diagnosticCodes: readonly string[],
	extra: Partial<MappingDecision> = {}
): MappingDecision {
	return {
		schemaVersion: WORD_MAPPING_SCHEMA_VERSION,
		sourceRowKey: row.sourceRowKey,
		sourceRecordHash: row.sourceRecordHash,
		sourceLocator: row.sourceLocator,
		rawSourceReading: row.rawSourceReading,
		effectiveReading: row.effectiveReading,
		status,
		approval,
		candidateFormIds,
		diagnosticCodes,
		...extra
	}
}

function diagnosticForRow(
	row: OpenJlptSourceRow,
	code: string,
	message: string,
	formIds?: readonly string[]
): ImportDiagnostic {
	return {
		code,
		severity: code === "duplicate-source-row" ? "info" : "warning",
		message,
		sourceRowKey: row.sourceRowKey,
		formIds
	}
}

export function mapOpenJlptRows(
	rows: readonly OpenJlptSourceRow[],
	lexemes: readonly CanonicalLexeme[],
	overrides: readonly ManualOverride[] = []
): MappingPipelineResult {
	const forms = lexemes.flatMap((lexeme) => lexeme.forms)
	const formsBySurfaceReading = new Map<string, CanonicalForm[]>()
	for (const form of forms) {
		const key = formLookupKey(form.writtenSurface, form.reading)
		const bucket = formsBySurfaceReading.get(key) ?? []
		bucket.push(form)
		formsBySurfaceReading.set(key, bucket)
	}
	const overrideIndex = indexManualOverrides(overrides, forms, rows)
	const membershipOwners = new Map<string, string>()
	const membershipLevels = new Map<string, string>()
	const decisions: MappingDecision[] = []
	const diagnostics: ImportDiagnostic[] = [...overrideIndex.diagnostics]
	const approvedMappings: ApprovedWordMapping[] = []

	for (const row of rows) {
		const candidates =
			formsBySurfaceReading.get(
				formLookupKey(row.sourceWrittenSurface, row.effectiveReading)
			) ?? []
		const candidateFormIds = [...new Set(candidates.map((form) => form.formId))]
		const sourceSurfaceValidation = validateSourceSurface(
			row.sourceWrittenSurface
		)

		if (row.sourceReadingStatus === "invalid-source-reading") {
			const current = makeDecision(
				row,
				"invalid-source-reading",
				"rejected",
				candidateFormIds,
				["invalid-source-reading"]
			)
			decisions.push(current)
			diagnostics.push(
				diagnosticForRow(
					row,
					"invalid-source-reading",
					row.sourceReadingError ??
						"The OpenJLPT source reading cannot be used for canonical matching.",
					candidateFormIds
				)
			)
			continue
		}

		if (!sourceSurfaceValidation.allowed) {
			const hasKanji =
				sourceSurfaceValidation.classification === "contains-kanji"
			const current = makeDecision(
				row,
				"invalid-surface",
				"rejected",
				candidateFormIds,
				[hasKanji ? "contains-kanji" : "invalid-surface"]
			)
			decisions.push(current)
			diagnostics.push(
				diagnosticForRow(
					row,
					hasKanji ? "contains-kanji" : "invalid-surface",
					"The OpenJLPT source written surface is excluded from Phase 1."
				)
			)
			continue
		}

		const validCandidates = candidates.filter((form) =>
			restrictionsAllow(form, row)
		)
		if (validCandidates.length === 0) {
			const status = candidates.length > 0 ? "invalid-restriction" : "unmatched"
			const current = makeDecision(row, status, "rejected", candidateFormIds, [
				status
			])
			decisions.push(current)
			diagnostics.push(
				diagnosticForRow(
					row,
					status,
					"No valid canonical form matched the source surface and reading.",
					candidateFormIds
				)
			)
			continue
		}

		const override = overrideIndex.byRow.get(row.sourceRowKey)
		const overrideErrors = overrideIndex.errorsByRow.get(row.sourceRowKey) ?? []
		if (overrideErrors.length > 0) {
			const current = makeDecision(
				row,
				"invalid-manual-override",
				"rejected",
				candidateFormIds,
				overrideErrors,
				{ overrideId: override?.overrideId }
			)
			decisions.push(current)
			for (const code of overrideErrors) {
				diagnostics.push(
					diagnosticForRow(
						row,
						"invalid-manual-override",
						"Manual override is not releasable: " + code + ".",
						candidateFormIds
					)
				)
			}
			continue
		}

		const overrideForm = override
			? forms.find((form) => form.formId === override.selectedFormId)
			: undefined
		if (
			override &&
			(!overrideForm ||
				!validCandidates.some((form) => form.formId === overrideForm.formId))
		) {
			const current = makeDecision(
				row,
				"invalid-manual-override",
				"rejected",
				candidateFormIds,
				["invalid-manual-override"],
				{ overrideId: override.overrideId }
			)
			decisions.push(current)
			diagnostics.push(
				diagnosticForRow(
					row,
					"invalid-manual-override",
					"Manual override must select a valid exact spelling-reading form.",
					candidateFormIds
				)
			)
			continue
		}

		const resolvedCandidates = overrideForm ? [overrideForm] : validCandidates
		if (resolvedCandidates.length > 1) {
			const current = makeDecision(
				row,
				"ambiguous",
				"pending",
				resolvedCandidates.map((form) => form.formId),
				["ambiguous"]
			)
			decisions.push(current)
			diagnostics.push(
				diagnosticForRow(
					row,
					"ambiguous",
					"More than one canonical JMdict form matched the source row.",
					current.candidateFormIds
				)
			)
			continue
		}

		const matchedForm = resolvedCandidates[0]
		const eligibility = resolveEligibility(row.sourceWrittenSurface)
		if (!eligibility.acceptedForArtifact) {
			const codes = [
				...new Set(
					eligibility.diagnostics
						.filter((item) => item.severity === "error")
						.map((item) => item.code)
				)
			]
			const current = makeDecision(
				row,
				"unsupported-selector-mora",
				"rejected",
				[matchedForm.formId],
				codes
			)
			decisions.push(current)
			for (const code of codes) {
				diagnostics.push(
					diagnosticForRow(
						row,
						code,
						"The mapped source surface is not supported by the Phase 1 selector.",
						[matchedForm.formId]
					)
				)
			}
			continue
		}

		const pronunciationKana = normalizePronunciationKana(matchedForm.reading)
		let canonicalAnswer: string
		try {
			canonicalAnswer = canonicalRomaji(pronunciationKana)
		} catch {
			const current = makeDecision(
				row,
				"unsupported-selector-mora",
				"rejected",
				[matchedForm.formId],
				["unsupported-pronunciation"]
			)
			decisions.push(current)
			diagnostics.push(
				diagnosticForRow(
					row,
					"unsupported-pronunciation",
					"The canonical pronunciation cannot be answered by the Phase 1 romaji policy.",
					[matchedForm.formId]
				)
			)
			continue
		}

		const membershipKey = createCollectionMembershipKey(
			row.collectionId,
			matchedForm.formId
		)
		const previousLevel = membershipLevels.get(membershipKey)
		if (previousLevel && previousLevel !== row.sourceLevel) {
			const current = makeDecision(
				row,
				"conflicting-membership",
				"rejected",
				[matchedForm.formId],
				["conflicting-membership"]
			)
			decisions.push(current)
			diagnostics.push(
				diagnosticForRow(
					row,
					"conflicting-membership",
					"The same collection membership has conflicting source levels.",
					[matchedForm.formId]
				)
			)
			continue
		}

		const previousOwner = membershipOwners.get(membershipKey)
		if (previousOwner) {
			const current = makeDecision(
				row,
				"duplicate",
				"rejected",
				[matchedForm.formId],
				["duplicate-runtime-membership"],
				{ duplicateOfSourceRowKey: previousOwner }
			)
			decisions.push(current)
			diagnostics.push(
				diagnosticForRow(
					row,
					"duplicate-source-row",
					"The row maps to an already-emitted collection membership.",
					[matchedForm.formId]
				)
			)
			continue
		}

		const current = makeDecision(
			row,
			override ? "manual-override" : "exact",
			"approved",
			[matchedForm.formId],
			[],
			{
				selectedFormId: matchedForm.formId,
				overrideId: override?.overrideId
			}
		)
		membershipOwners.set(membershipKey, row.sourceRowKey)
		membershipLevels.set(membershipKey, row.sourceLevel)
		decisions.push(current)
		approvedMappings.push(
			buildApprovedWord(
				row,
				matchedForm,
				current,
				eligibility,
				pronunciationKana,
				canonicalAnswer
			)
		)
	}

	return { decisions, diagnostics, approvedMappings }
}
