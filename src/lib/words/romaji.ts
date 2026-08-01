import { WORD_ANSWER_POLICY } from "./contracts.ts"
import { katakanaToHiragana } from "./surface.ts"
import { tokenizeSurface, type TokenDetail } from "./tokenizer.ts"

const CANONICAL_ROMAJI: Readonly<Record<string, string>> = {
	あ: "a",
	い: "i",
	う: "u",
	え: "e",
	お: "o",
	か: "ka",
	き: "ki",
	く: "ku",
	け: "ke",
	こ: "ko",
	さ: "sa",
	し: "shi",
	す: "su",
	せ: "se",
	そ: "so",
	た: "ta",
	ち: "chi",
	つ: "tsu",
	て: "te",
	と: "to",
	な: "na",
	に: "ni",
	ぬ: "nu",
	ね: "ne",
	の: "no",
	は: "ha",
	ひ: "hi",
	ふ: "fu",
	へ: "he",
	ほ: "ho",
	ま: "ma",
	み: "mi",
	む: "mu",
	め: "me",
	も: "mo",
	や: "ya",
	ゆ: "yu",
	よ: "yo",
	ら: "ra",
	り: "ri",
	る: "ru",
	れ: "re",
	ろ: "ro",
	わ: "wa",
	を: "wo",
	が: "ga",
	ぎ: "gi",
	ぐ: "gu",
	げ: "ge",
	ご: "go",
	ざ: "za",
	じ: "ji",
	ず: "zu",
	ぜ: "ze",
	ぞ: "zo",
	だ: "da",
	ぢ: "ji",
	づ: "zu",
	で: "de",
	ど: "do",
	ば: "ba",
	び: "bi",
	ぶ: "bu",
	べ: "be",
	ぼ: "bo",
	ぱ: "pa",
	ぴ: "pi",
	ぷ: "pu",
	ぺ: "pe",
	ぽ: "po",
	ゔ: "vu",
	きゃ: "kya",
	きゅ: "kyu",
	きょ: "kyo",
	しゃ: "sha",
	しゅ: "shu",
	しょ: "sho",
	ちゃ: "cha",
	ちゅ: "chu",
	ちょ: "cho",
	にゃ: "nya",
	にゅ: "nyu",
	にょ: "nyo",
	ひゃ: "hya",
	ひゅ: "hyu",
	ひょ: "hyo",
	みゃ: "mya",
	みゅ: "myu",
	みょ: "myo",
	りゃ: "rya",
	りゅ: "ryu",
	りょ: "ryo",
	ぎゃ: "gya",
	ぎゅ: "gyu",
	ぎょ: "gyo",
	じゃ: "ja",
	じゅ: "ju",
	じょ: "jo",
	ぢゃ: "ja",
	ぢゅ: "ju",
	ぢょ: "jo",
	びゃ: "bya",
	びゅ: "byu",
	びょ: "byo",
	ぴゃ: "pya",
	ぴゅ: "pyu",
	ぴょ: "pyo"
}

const ALIASES: Readonly<Record<string, readonly string[]>> = {
	し: ["shi", "si"],
	ち: ["chi", "ti"],
	つ: ["tsu", "tu"],
	ふ: ["fu", "hu"],
	じ: ["ji", "zi"],
	ぢ: ["ji", "di"],
	づ: ["zu", "du"],
	しゃ: ["sha", "sya"],
	しゅ: ["shu", "syu"],
	しょ: ["sho", "syo"],
	ちゃ: ["cha", "tya"],
	ちゅ: ["chu", "tyu"],
	ちょ: ["cho", "tyo"],
	じゃ: ["ja", "jya", "zya"],
	じゅ: ["ju", "jyu", "zyu"],
	じょ: ["jo", "jyo", "zyo"],
	ぢゃ: ["ja", "dya"],
	ぢゅ: ["ju", "dyu"],
	ぢょ: ["jo", "dyo"]
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)]
}

function aliasesForKana(token: string): readonly string[] {
	const canonical = CANONICAL_ROMAJI[token]
	if (!canonical) throw new Error("Unsupported romaji token: " + token)
	return ALIASES[token] ?? [canonical]
}

function startsWithVowelOrY(token: string): boolean {
	const romaji = CANONICAL_ROMAJI[token]
	return romaji ? /^[aeiouy]/.test(romaji) : false
}

function geminationPrefix(alias: string): string {
	return alias.startsWith("ch") ? "c" : alias[0]
}

function smallTsuAliases(next: TokenDetail | undefined): readonly string[] {
	if (!next || !CANONICAL_ROMAJI[next.text]) return []
	return unique(aliasesForKana(next.text).map(geminationPrefix))
}

function lastVowel(value: string): string | undefined {
	return [...value].reverse().find((character) => "aeiou".includes(character))
}

function aliasesForDetail(
	detail: TokenDetail,
	next: TokenDetail | undefined,
	previousOutput: string
): readonly string[] {
	if (detail.kind === "small-tsu") return smallTsuAliases(next)
	if (detail.kind === "prolonged-mark") {
		const vowel = lastVowel(previousOutput)
		return vowel ? [vowel] : []
	}
	if (detail.text === "ん") {
		return next && startsWithVowelOrY(next.text) ? ["n'", "n"] : ["n", "nn"]
	}
	if (detail.kind === "kana-token" || detail.kind === "yoon") {
		return aliasesForKana(detail.text)
	}
	return []
}

function tokenizedPronunciation(pronunciationKana: string): TokenDetail[] {
	const normalized = katakanaToHiragana(pronunciationKana.normalize("NFKC"))
	const tokenization = tokenizeSurface(normalized)
	if (
		tokenization.details.some(
			(detail) =>
				detail.kind === "foreign-combination" ||
				detail.kind === "unsupported-yoon" ||
				detail.kind === "unknown" ||
				detail.kind === "unsupported-small-kana"
		)
	) {
		throw new Error("Pronunciation contains an unsupported Phase 1 token")
	}
	return [...tokenization.details]
}

export function normalizePronunciationKana(pronunciationKana: string): string {
	return katakanaToHiragana(pronunciationKana.normalize("NFKC"))
}

export function canonicalRomaji(pronunciationKana: string): string {
	const details = tokenizedPronunciation(pronunciationKana)
	let output = ""

	for (const [index, detail] of details.entries()) {
		const aliases = aliasesForDetail(detail, details[index + 1], output)
		if (aliases.length === 0) {
			throw new Error("No romaji representation for token: " + detail.text)
		}
		output += aliases[0]
	}

	return output
}

export function answerPolicy(): typeof WORD_ANSWER_POLICY {
	return WORD_ANSWER_POLICY
}

function canonicalRomajiFromDetails(details: readonly TokenDetail[]): string {
	let output = ""
	for (const [index, detail] of details.entries()) {
		const aliases = aliasesForDetail(detail, details[index + 1], output)
		output += aliases[0] ?? ""
	}
	return output
}

export function isRomajiWordAnswer(
	input: string,
	pronunciationKana: string
): boolean {
	const trimmed = input.trim()
	if (!trimmed || /\s/.test(trimmed) || !/^[a-z']+$/i.test(trimmed)) {
		return false
	}
	const candidate = trimmed.toLowerCase()

	let details: TokenDetail[]
	try {
		details = tokenizedPronunciation(pronunciationKana)
	} catch {
		return false
	}

	const memo = new Map<string, boolean>()
	function matches(tokenIndex: number, inputIndex: number): boolean {
		const key = tokenIndex + ":" + inputIndex
		const cached = memo.get(key)
		if (cached !== undefined) return cached
		if (tokenIndex === details.length) return inputIndex === candidate.length

		const previousOutput = canonicalRomajiFromDetails(
			details.slice(0, tokenIndex)
		)
		const aliases = aliasesForDetail(
			details[tokenIndex],
			details[tokenIndex + 1],
			previousOutput
		)

		const result = aliases.some(
			(alias) =>
				candidate.startsWith(alias, inputIndex) &&
				matches(tokenIndex + 1, inputIndex + alias.length)
		)
		memo.set(key, result)
		return result
	}

	return matches(0, 0)
}
