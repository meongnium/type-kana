import type { ScriptClassification, WordScript } from "./contracts.ts"

const HIRAGANA_CHARACTERS = [
	..."あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん",
	..."がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゔ",
	..."ぁぃぅぇぉゃゅょっ"
]

const KATAKANA_CHARACTERS = [
	..."アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン",
	..."ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポヴ",
	..."ァィゥェォャュョッ"
]

export const SUPPORTED_HIRAGANA_CHARACTERS: ReadonlySet<string> = new Set(
	HIRAGANA_CHARACTERS
)

export const SUPPORTED_KATAKANA_CHARACTERS: ReadonlySet<string> = new Set(
	KATAKANA_CHARACTERS
)

export const PROLONGED_SOUND_MARK = "ー"

const HAN_CHARACTER = /\p{Script=Han}/u

export interface SurfaceDiagnostic {
	code:
		| "empty-surface"
		| "contains-kanji"
		| "unsupported-character"
		| "missing-kana-script"
	message: string
	character?: string
	index?: number
}

export interface SurfaceValidation {
	allowed: boolean
	classification: ScriptClassification
	diagnostics: readonly SurfaceDiagnostic[]
}

function isHiraganaCharacter(character: string): boolean {
	return SUPPORTED_HIRAGANA_CHARACTERS.has(character)
}

function isKatakanaCharacter(character: string): boolean {
	return SUPPORTED_KATAKANA_CHARACTERS.has(character)
}

export function isSupportedKanaCharacter(character: string): boolean {
	return isHiraganaCharacter(character) || isKatakanaCharacter(character)
}

export function hiraganaToKatakana(value: string): string {
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

export function katakanaToHiragana(value: string): string {
	return [...value]
		.map((character) => {
			const codePoint = character.codePointAt(0) ?? 0
			if (codePoint >= 0x30a1 && codePoint <= 0x30f6) {
				return String.fromCodePoint(codePoint - 0x60)
			}
			return character
		})
		.join("")
}

export function classifySurface(surface: string): ScriptClassification {
	return validateSourceSurface(surface).classification
}

export function validateSourceSurface(surface: string): SurfaceValidation {
	if (surface.length === 0) {
		return {
			allowed: false,
			classification: "unsupported/other",
			diagnostics: [
				{
					code: "empty-surface",
					message: "A source surface must not be empty."
				}
			]
		}
	}

	const characters = [...surface]
	const scripts = new Set<"hiragana" | "katakana">()
	const diagnostics: SurfaceDiagnostic[] = []

	for (const [index, character] of characters.entries()) {
		if (HAN_CHARACTER.test(character)) {
			diagnostics.push({
				code: "contains-kanji",
				message: "Kanji in the source written surface is not allowed.",
				character,
				index
			})
			continue
		}

		if (isHiraganaCharacter(character)) {
			scripts.add("hiragana")
			continue
		}

		if (isKatakanaCharacter(character)) {
			scripts.add("katakana")
			continue
		}

		if (character === PROLONGED_SOUND_MARK) continue

		diagnostics.push({
			code: "unsupported-character",
			message:
				"The source surface contains a character outside the Phase 1 whitelist.",
			character,
			index
		})
	}

	if (diagnostics.some((diagnostic) => diagnostic.code === "contains-kanji")) {
		return {
			allowed: false,
			classification: "contains-kanji",
			diagnostics
		}
	}

	if (diagnostics.length > 0) {
		return {
			allowed: false,
			classification: "unsupported/other",
			diagnostics
		}
	}

	let classification: ScriptClassification
	if (scripts.size === 0) {
		classification = "unsupported/other"
		diagnostics.push({
			code: "missing-kana-script",
			message: "A surface must contain at least one supported kana character."
		})
	} else if (scripts.size === 2) {
		classification = "mixed-kana"
	} else {
		classification = [...scripts][0] as WordScript
	}

	return {
		allowed: diagnostics.length === 0,
		classification,
		diagnostics
	}
}
