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
import { normalizePronunciationKana } from "../../src/lib/words/romaji.ts"
import { validateSourceSurface } from "../../src/lib/words/surface.ts"
import { createReadingCardId } from "./identity.ts"

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

function normalized(value: string): string {
	return value.normalize("NFKC")
}

function restrictionsAllow(
	form: CanonicalForm,
	row: OpenJlptSourceRow
): boolean {
	const writtenRestrictions = form.restrictions.appliesToWritten
	const readingRestrictions = form.restrictions.appliesToReading
	return (
		(writtenRestrictions.length === 0 ||
			writtenRestrictions.includes(row.sourceWrittenSurface)) &&
		(readingRestrictions.length === 0 ||
			readingRestrictions.includes(row.sourceReading))
	)
}

function sourceRef(row: OpenJlptSourceRow, form: CanonicalForm): string[] {
	return [
		`jmdict:${form.lexemeId.replace(/^jmdict:/, "")}`,
		`openjlpt:${row.sourceRecordHash}`
	]
}

function buildApprovedWord(
	row: OpenJlptSourceRow,
	form: CanonicalForm,
	decision: MappingDecision
): ApprovedWordMapping | undefined {
	const eligibility = resolveEligibility(row.sourceWrittenSurface)
	if (!eligibility.acceptedForArtifact) return undefined

	const pronunciationKana = normalizePronunciationKana(form.reading)
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
		answerPolicy: "romaji-hepburn-ascii-v1",
		canonicalAnswer: "",
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
		sourceRowKey: row.sourceRowKey,
		status,
		approval,
		candidateFormIds,
		diagnosticCodes,
		...extra
	}
}

export function mapOpenJlptRows(
	rows: readonly OpenJlptSourceRow[],
	lexemes: readonly CanonicalLexeme[],
	overrides: readonly ManualOverride[] = []
): MappingPipelineResult {
	const forms = lexemes.flatMap((lexeme) => lexeme.forms)
	const overrideByRow = new Map(
		overrides.map((override) => [override.sourceRowKey, override])
	)
	const membershipOwners = new Map<string, string>()
	const membershipLevels = new Map<string, string>()
	const decisions: MappingDecision[] = []
	const diagnostics: ImportDiagnostic[] = []
	const approvedMappings: ApprovedWordMapping[] = []

	for (const row of rows) {
		const candidates = forms.filter(
			(form) =>
				normalized(form.writtenSurface) ===
					normalized(row.sourceWrittenSurface) &&
				normalized(form.reading) === normalized(row.sourceReading)
		)
		const candidateFormIds = candidates.map((form) => form.formId)

		const sourceSurfaceValidation = validateSourceSurface(
			row.sourceWrittenSurface
		)
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
			diagnostics.push({
				code: hasKanji ? "contains-kanji" : "invalid-surface",
				severity: "warning",
				message:
					"The OpenJLPT source written surface is excluded from Phase 1.",
				sourceRowKey: row.sourceRowKey
			})
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
			diagnostics.push({
				code: status,
				severity: "warning",
				message: `No valid canonical form matched ${row.sourceWrittenSurface}.`,
				sourceRowKey: row.sourceRowKey,
				formIds: candidateFormIds
			})
			continue
		}

		const override = overrideByRow.get(row.sourceRowKey)
		const overrideForm = override
			? forms.find((form) => form.formId === override.selectedFormId)
			: undefined
		if (override && !overrideForm) {
			const current = makeDecision(
				row,
				"unmatched",
				"rejected",
				candidateFormIds,
				["invalid-manual-override"],
				{ overrideId: override.overrideId }
			)
			decisions.push(current)
			diagnostics.push({
				code: "invalid-manual-override",
				severity: "error",
				message: "The manual override points to an unknown form.",
				sourceRowKey: row.sourceRowKey
			})
			continue
		}
		if (
			overrideForm &&
			(!restrictionsAllow(overrideForm, row) ||
				normalized(overrideForm.writtenSurface) !==
					normalized(row.sourceWrittenSurface) ||
				normalized(overrideForm.reading) !== normalized(row.sourceReading))
		) {
			const current = makeDecision(
				row,
				"invalid-restriction",
				"rejected",
				candidateFormIds,
				["invalid-manual-override"],
				{ overrideId: override?.overrideId }
			)
			decisions.push(current)
			diagnostics.push({
				code: "invalid-manual-override",
				severity: "error",
				message: "The manual override does not preserve the source pair.",
				sourceRowKey: row.sourceRowKey
			})
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
			diagnostics.push({
				code: "ambiguous",
				severity: "warning",
				message: "More than one canonical JMdict form matched the source row.",
				sourceRowKey: row.sourceRowKey,
				formIds: current.candidateFormIds
			})
			continue
		}

		const matchedForm = resolvedCandidates[0]
		const eligibility = resolveEligibility(row.sourceWrittenSurface)
		if (!eligibility.acceptedForArtifact) {
			const codes = eligibility.diagnostics.map((item) => item.code)
			const current = makeDecision(
				row,
				"unsupported-selector-mora",
				"rejected",
				[matchedForm.formId],
				codes
			)
			decisions.push(current)
			for (const code of codes) {
				diagnostics.push({
					code,
					severity: "warning",
					message: `The mapped surface is not supported by the Phase 1 selector: ${code}.`,
					sourceRowKey: row.sourceRowKey,
					formIds: [matchedForm.formId]
				})
			}
			continue
		}

		const membershipKey = `${row.collectionId}\0${matchedForm.formId}`
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
			diagnostics.push({
				code: "conflicting-membership",
				severity: "warning",
				message:
					"The same collection membership has conflicting source levels.",
				sourceRowKey: row.sourceRowKey,
				formIds: [matchedForm.formId]
			})
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
			diagnostics.push({
				code: "duplicate-source-row",
				severity: "info",
				message: "The row maps to an already-emitted collection membership.",
				sourceRowKey: row.sourceRowKey,
				formIds: [matchedForm.formId]
			})
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
		const approved = buildApprovedWord(row, matchedForm, current)
		if (approved) approvedMappings.push(approved)
	}

	return { decisions, diagnostics, approvedMappings }
}
