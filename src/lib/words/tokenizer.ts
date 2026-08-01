import type { ImportDiagnostic } from "./contracts.ts"
import { hiraganaToKatakana } from "./surface.ts"

export type TokenKind =
	| "kana-token"
	| "yoon"
	| "foreign-combination"
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

const BASE_TOKENS = [
	..."あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん",
	..."がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゔ"
]

const YŌON_TOKENS = [
	"きゃ",
	"きゅ",
	"きょ",
	"しゃ",
	"しゅ",
	"しょ",
	"ちゃ",
	"ちゅ",
	"ちょ",
	"にゃ",
	"にゅ",
	"にょ",
	"ひゃ",
	"ひゅ",
	"ひょ",
	"みゃ",
	"みゅ",
	"みょ",
	"りゃ",
	"りゅ",
	"りょ",
	"ぎゃ",
	"ぎゅ",
	"ぎょ",
	"じゃ",
	"じゅ",
	"じょ",
	"ぢゃ",
	"ぢゅ",
	"ぢょ",
	"びゃ",
	"びゅ",
	"びょ",
	"ぴゃ",
	"ぴゅ",
	"ぴょ"
]

const FOREIGN_TOKENS = [
	"てぃ",
	"でぃ",
	"とぅ",
	"どぅ",
	"ふぁ",
	"ふぃ",
	"ふぇ",
	"ふぉ",
	"うぃ",
	"うぇ",
	"うぉ",
	"しぇ",
	"じぇ",
	"ちぇ",
	"つぁ",
	"つぃ",
	"つぇ",
	"つぉ",
	"ゔぁ",
	"ゔぃ",
	"ゔぇ",
	"ゔぉ",
	"くぁ",
	"くぃ",
	"くぇ",
	"くぉ",
	"ぐぁ",
	"ぐぃ",
	"ぐぇ",
	"ぐぉ",
	"いぇ"
]

const UNSUPPORTED_SMALL_KANA = [..."ぁぃぅぇぉゃゅょ"]

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

	add(FOREIGN_TOKENS, "foreign-combination")
	add(YŌON_TOKENS, "yoon")
	add(BASE_TOKENS, "kana-token")
	add(["っ"], "small-tsu")
	add(["ー"], "prolonged-mark")
	add(UNSUPPORTED_SMALL_KANA, "unsupported-small-kana")

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
			if (pattern.kind === "unsupported-small-kana") {
				diagnostics.push(
					diagnostic(
						"unsupported-selector-mora",
						"A standalone small kana is not selectable in Phase 1.",
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
