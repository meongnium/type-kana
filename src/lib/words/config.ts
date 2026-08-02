import {
	WORD_COLLECTION_N5,
	type KanaReadingWordV1,
	type KanaType
} from "./contracts.ts"
import {
	SELECTOR_DAKUON_HIRAGANA_TOKENS,
	SELECTOR_DAKUON_YOON_HIRAGANA_TOKENS,
	SELECTOR_GOJUON_HIRAGANA_TOKENS,
	SELECTOR_YOON_GROUP_HIRAGANA_TOKENS
} from "./inventory.ts"
import { katakanaToHiragana, hiraganaToKatakana } from "./surface.ts"

export interface WordsConfig {
	collectionId: typeof WORD_COLLECTION_N5
	script: KanaType
	selectedCanonicalTokens: string[]
}

export type WordsKanaGroupId = "gojuon" | "dakuon" | "yoon" | "dakuon-yoon"

export interface WordsKanaGroup {
	id: WordsKanaGroupId
	label: string
	tokens: readonly string[]
}

export const WORD_KANA_GROUPS: readonly WordsKanaGroup[] = Object.freeze([
	{
		id: "gojuon",
		label: "Gojūon",
		tokens: SELECTOR_GOJUON_HIRAGANA_TOKENS
	},
	{
		id: "dakuon",
		label: "Dakuon",
		tokens: SELECTOR_DAKUON_HIRAGANA_TOKENS
	},
	{
		id: "yoon",
		label: "Yōon",
		tokens: SELECTOR_YOON_GROUP_HIRAGANA_TOKENS
	},
	{
		id: "dakuon-yoon",
		label: "Dakuon Yōon",
		tokens: SELECTOR_DAKUON_YOON_HIRAGANA_TOKENS
	}
])

export function createDefaultWordsConfig(): WordsConfig {
	return {
		collectionId: WORD_COLLECTION_N5,
		script: "hiragana",
		selectedCanonicalTokens: [
			...SELECTOR_GOJUON_HIRAGANA_TOKENS,
			...SELECTOR_DAKUON_HIRAGANA_TOKENS
		]
	}
}

export function canonicalSelectedTokens(
	config: Pick<WordsConfig, "selectedCanonicalTokens">
): Set<string> {
	return new Set(config.selectedCanonicalTokens.map(katakanaToHiragana))
}

export function isWordScriptEligible(
	word: Pick<KanaReadingWordV1, "script">,
	script: KanaType
): boolean {
	if (script === "both") return true
	return word.script === script
}

export function isWordEligible(
	word: KanaReadingWordV1,
	config: WordsConfig
): boolean {
	if (!word.collectionIds.includes(config.collectionId)) return false
	if (!isWordScriptEligible(word, config.script)) return false

	const selected = canonicalSelectedTokens(config)
	return word.requiredCanonicalTokens.every((token) =>
		selected.has(katakanaToHiragana(token))
	)
}

export function filterEligibleWords(
	words: readonly KanaReadingWordV1[],
	config: WordsConfig
): KanaReadingWordV1[] {
	return words.filter((word) => isWordEligible(word, config))
}

export function isGroupSelected(
	config: WordsConfig,
	group: WordsKanaGroup
): boolean {
	const selected = canonicalSelectedTokens(config)
	return group.tokens.every((token) => selected.has(token))
}

export function setGroupSelected(
	config: WordsConfig,
	group: WordsKanaGroup,
	selected: boolean
): WordsConfig {
	const current = canonicalSelectedTokens(config)
	for (const token of group.tokens) {
		const canonical = katakanaToHiragana(token)
		if (selected) current.add(canonical)
		else current.delete(canonical)
	}
	return {
		...config,
		selectedCanonicalTokens: [...current]
	}
}

export function setTokenSelected(
	config: WordsConfig,
	token: string,
	selected: boolean
): WordsConfig {
	const current = canonicalSelectedTokens(config)
	const canonical = katakanaToHiragana(token)
	if (selected) current.add(canonical)
	else current.delete(canonical)
	return {
		...config,
		selectedCanonicalTokens: [...current]
	}
}

export { hiraganaToKatakana }
