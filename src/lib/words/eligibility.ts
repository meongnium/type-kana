import type {
	EligibilityRequirement,
	ImportDiagnostic,
	KanaType,
	ScriptClassification
} from "./contracts.ts"
import { katakanaToHiragana, validateSourceSurface } from "./surface.ts"
import { tokenizeSurface, type TokenizationResult } from "./tokenizer.ts"

export interface EligibilityOptions {
	kanaType?: KanaType
	selectedCanonicalTokens?: readonly string[]
}

export interface EligibilityResult {
	acceptedForArtifact: boolean
	selectedForConfiguration?: boolean
	classification: ScriptClassification
	surfaceTokens: readonly string[]
	requiredCanonicalTokens: readonly string[]
	eligibilityRequirements: readonly EligibilityRequirement[]
	diagnostics: readonly ImportDiagnostic[]
}

function addUnique(values: string[], value: string): void {
	if (!values.includes(value)) values.push(value)
}

function matchesKanaType(
	classification: ScriptClassification,
	kanaType: KanaType
): boolean {
	if (kanaType === "both") {
		return (
			classification === "hiragana" ||
			classification === "katakana" ||
			classification === "mixed-kana"
		)
	}
	return classification === kanaType
}

function tokenDiagnostic(
	code: string,
	message: string,
	token: string
): ImportDiagnostic {
	return { code, severity: "error", message, formIds: [token] }
}

function isSelectableMoraKind(
	kind: TokenizationResult["details"][number]["kind"]
): boolean {
	return kind === "kana-token" || kind === "yoon"
}

export function resolveEligibility(
	surface: string,
	options: EligibilityOptions = {}
): EligibilityResult {
	const validation = validateSourceSurface(surface)
	const tokenization = tokenizeSurface(surface)
	const diagnostics: ImportDiagnostic[] = validation.diagnostics.map(
		({ code, message, character }) => ({
			code,
			severity: "error",
			message,
			formIds: character ? [character] : undefined
		})
	)

	const requiredCanonicalTokens: string[] = []
	const eligibilityRequirements: EligibilityRequirement[] = []

	for (const [index, detail] of tokenization.details.entries()) {
		if (detail.kind === "foreign-combination") {
			diagnostics.push(
				tokenDiagnostic(
					"unsupported-selector-mora",
					"Foreign kana combinations are not selectable in Phase 1.",
					detail.text
				)
			)
			continue
		}

		if (detail.kind === "unsupported-small-kana" || detail.kind === "unknown") {
			diagnostics.push(
				tokenDiagnostic(
					"unsupported-selector-mora",
					"The surface contains a token unavailable to the Phase 1 selector.",
					detail.text
				)
			)
			continue
		}

		if (detail.kind === "prolonged-mark") {
			const previous = tokenization.details[index - 1]
			if (!previous || !isSelectableMoraKind(previous.kind)) {
				diagnostics.push(
					tokenDiagnostic(
						"invalid-prolonged-mark",
						"A prolonged sound mark must follow a valid mora.",
						detail.text
					)
				)
			}
			eligibilityRequirements.push({
				kind: "prolonged-mark",
				surfaceToken: "ー",
				requiresPrevious: true
			})
			continue
		}

		if (detail.kind === "small-tsu") {
			addUnique(requiredCanonicalTokens, "つ")
			eligibilityRequirements.push({
				kind: "small-tsu",
				surfaceToken: detail.text as "っ" | "ッ",
				canonicalToken: "つ"
			})
			continue
		}

		const canonicalToken = katakanaToHiragana(detail.text)
		addUnique(requiredCanonicalTokens, canonicalToken)
		eligibilityRequirements.push({
			kind: "kana-token",
			surfaceToken: detail.text,
			canonicalToken
		})
	}

	const acceptedForArtifact =
		validation.allowed &&
		diagnostics.every((diagnostic) => diagnostic.severity !== "error")

	let selectedForConfiguration: boolean | undefined
	if (options.kanaType && options.selectedCanonicalTokens) {
		const selected = new Set(options.selectedCanonicalTokens)
		const missingTokens = requiredCanonicalTokens.filter(
			(token) => !selected.has(token)
		)
		selectedForConfiguration =
			acceptedForArtifact &&
			matchesKanaType(validation.classification, options.kanaType) &&
			missingTokens.length === 0

		if (!matchesKanaType(validation.classification, options.kanaType)) {
			diagnostics.push({
				code: "script-mismatch",
				severity: "info",
				message: "The surface script does not match the selected kana type."
			})
		}
		if (missingTokens.length > 0) {
			diagnostics.push({
				code: "missing-selected-kana",
				severity: "info",
				message: `The selection is missing: ${missingTokens.join(", ")}.`,
				formIds: missingTokens
			})
		}
	}

	return {
		acceptedForArtifact,
		selectedForConfiguration,
		classification: validation.classification,
		surfaceTokens: tokenization.tokens,
		requiredCanonicalTokens,
		eligibilityRequirements,
		diagnostics
	}
}
