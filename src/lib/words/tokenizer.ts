import type { ImportDiagnostic } from "./contracts.ts"
import {
	FOREIGN_HIRAGANA_TOKENS,
	SELECTOR_BASE_HIRAGANA_TOKENS,
	SELECTOR_YOON_HIRAGANA_TOKENS,
	UNSUPPORTED_SMALL_HIRAGANA,
	UNSUPPORTED_YOON_HIRAGANA_TOKENS
} from "./inventory.ts"
import { hiraganaToKatakana } from "./surface.ts"

export type TokenKind =
	| "kana-token"
	| "yoon"
	| "foreign-combination"
	| "unsupported-yoon"
	| "small-tsu"
	| "prolonged-mark"
	| "unsupported-small-kana"
	| "unknown"

export interface TokenDetail {
	text: string
	kind: TokenKind
}

export interface TokenizationResult {
	tokens: readonly string[]
	details: readonly TokenDetail[]
	diagnostics: readonly ImportDiagnostic[]
}

interface TokenPattern {
	text: string
	kind: TokenKind
}

function makePatterns(): TokenPattern[] {
	const patterns: TokenPattern[] = []
	const add = (texts: readonly string[], kind: TokenKind) => {
		for (const text of texts) {
			patterns.push({ text, kind })
			const katakana = hiraganaToKatakana(text)
			if (katakana !== text) patterns.push({ text: katakana, kind })
		}
	}

	add(FOREIGN_HIRAGANA_TOKENS, "foreign-combination")
	add(UNSUPPORTED_YOON_HIRAGANA_TOKENS, "unsupported-yoon")
	add(SELECTOR_YOON_HIRAGANA_TOKENS, "yoon")
	add(SELECTOR_BASE_HIRAGANA_TOKENS, "kana-token")
	add(["っ"], "small-tsu")
	patterns.push({ text: "ー", kind: "prolonged-mark" })
	add(UNSUPPORTED_SMALL_HIRAGANA, "unsupported-small-kana")

	return patterns.sort((a, b) => b.text.length - a.text.length)
}

const TOKEN_PATTERNS = makePatterns()

function diagnostic(
	code: string,
	message: string,
	character: string
): ImportDiagnostic {
	return { code, severity: "error", message, formIds: [character] }
}

export function tokenizeSurface(surface: string): TokenizationResult {
	const tokens: string[] = []
	const details: TokenDetail[] = []
	const diagnostics: ImportDiagnostic[] = []
	let offset = 0

	while (offset < surface.length) {
		const pattern = TOKEN_PATTERNS.find((candidate) =>
			surface.startsWith(candidate.text, offset)
		)

		if (pattern) {
			tokens.push(pattern.text)
			details.push({ text: pattern.text, kind: pattern.kind })
			if (
				pattern.kind === "unsupported-small-kana" ||
				pattern.kind === "unsupported-yoon"
			) {
				diagnostics.push(
					diagnostic(
						"unsupported-selector-mora",
						"The token is not representable by the Phase 1 selector.",
						pattern.text
					)
				)
			}
			if (pattern.kind === "foreign-combination") {
				diagnostics.push({
					code: "recognized-foreign-combination",
					severity: "warning",
					message:
						"The token is recognized but not representable by the Phase 1 selector.",
					formIds: [pattern.text]
				})
			}
			offset += pattern.text.length
			continue
		}

		const character = [...surface.slice(offset)][0]
		tokens.push(character)
		details.push({ text: character, kind: "unknown" })
		diagnostics.push(
			diagnostic(
				"unknown-token",
				"The tokenizer does not have a supported token for this surface text.",
				character
			)
		)
		offset += character.length
	}

	return { tokens, details, diagnostics }
}
