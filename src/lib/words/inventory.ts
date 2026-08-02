import { hiragana } from "../db.ts"

type KanaTable = readonly (readonly (string | null)[])[]

function flattenKana(table: KanaTable): string[] {
	return table.flat().filter((kana): kana is string => kana !== null)
}

function toKatakana(value: string): string {
	return [...value]
		.map((character) => {
			const codePoint = character.codePointAt(0) ?? 0
			if (codePoint >= 0x3041 && codePoint <= 0x3096) {
				return String.fromCodePoint(codePoint + 0x60)
			}
			return character
		})
		.join("")
}

export const SELECTOR_GOJUON_HIRAGANA_TOKENS: readonly string[] = Object.freeze(
	flattenKana(hiragana.gojuon)
)

export const SELECTOR_DAKUON_HIRAGANA_TOKENS: readonly string[] = Object.freeze(
	flattenKana(hiragana.dakuon)
)

export const SELECTOR_YOON_GROUP_HIRAGANA_TOKENS: readonly string[] =
	Object.freeze(flattenKana(hiragana.yoon))

export const SELECTOR_DAKUON_YOON_HIRAGANA_TOKENS: readonly string[] =
	Object.freeze(flattenKana(hiragana.dakuonYoon))

export const SELECTOR_BASE_HIRAGANA_TOKENS: readonly string[] = Object.freeze([
	...SELECTOR_GOJUON_HIRAGANA_TOKENS,
	...SELECTOR_DAKUON_HIRAGANA_TOKENS
])

// Preserve the existing combined yōon selector inventory used by Phase 0.
export const SELECTOR_YOON_HIRAGANA_TOKENS: readonly string[] = Object.freeze([
	...SELECTOR_YOON_GROUP_HIRAGANA_TOKENS,
	...SELECTOR_DAKUON_YOON_HIRAGANA_TOKENS
])

export const SELECTOR_HIRAGANA_TOKENS: readonly string[] = Object.freeze([
	...SELECTOR_BASE_HIRAGANA_TOKENS,
	...SELECTOR_YOON_HIRAGANA_TOKENS
])

export const SELECTOR_KATAKANA_TOKENS: readonly string[] = Object.freeze(
	SELECTOR_HIRAGANA_TOKENS.map(toKatakana)
)

export const ALL_STANDARD_YOON_HIRAGANA_TOKENS: readonly string[] =
	Object.freeze([...SELECTOR_YOON_HIRAGANA_TOKENS, "ぢゃ", "ぢゅ", "ぢょ"])

export const UNSUPPORTED_YOON_HIRAGANA_TOKENS: readonly string[] =
	Object.freeze(
		ALL_STANDARD_YOON_HIRAGANA_TOKENS.filter(
			(token) => !SELECTOR_YOON_HIRAGANA_TOKENS.includes(token)
		)
	)

export const FOREIGN_HIRAGANA_TOKENS: readonly string[] = Object.freeze([
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
	"ぐぁ",
	"ぐぃ",
	"ぐぇ",
	"ぐぉ",
	"いぇ"
])

export const UNSUPPORTED_SMALL_HIRAGANA: readonly string[] = Object.freeze([
	..."ぁぃぅぇぉゃゅょ"
])

function charactersIn(tokens: readonly string[]): string[] {
	return tokens.flatMap((token) => [...token])
}

export const SURFACE_HIRAGANA_CHARACTERS: ReadonlySet<string> = new Set([
	...charactersIn(SELECTOR_HIRAGANA_TOKENS),
	...charactersIn(FOREIGN_HIRAGANA_TOKENS),
	...UNSUPPORTED_SMALL_HIRAGANA,
	"っ"
])

export const SURFACE_KATAKANA_CHARACTERS: ReadonlySet<string> = new Set(
	[...SURFACE_HIRAGANA_CHARACTERS].map(toKatakana)
)
