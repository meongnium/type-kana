import type {
	CanonicalForm,
	CanonicalLexeme,
	ImportDiagnostic,
	ImportSense,
	SourcePin
} from "../../src/lib/words/contracts.ts"
import { createFormId, createLexemeId, sha256Hex } from "./identity.ts"

export interface JmdictAdapterResult {
	lexemes: readonly CanonicalLexeme[]
	diagnostics: readonly ImportDiagnostic[]
	documentMetadata: {
		version: string
		dictDate: string
		languages: readonly string[]
		commonOnly: boolean
		wordCount: number
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value : ""
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	return value.filter((item): item is string => typeof item === "string")
}

function normalizeList(value: unknown): string[] {
	return stringList(value).map((item) => item.normalize("NFKC"))
}

function formKey(writtenSurface: string, reading: string): string {
	return JSON.stringify([
		writtenSurface.normalize("NFKC"),
		reading.normalize("NFKC")
	])
}

function mergeRestrictionList(
	left: readonly string[],
	right: readonly string[]
): string[] {
	if (left.length === 0 || right.length === 0) return []
	return [...new Set([...left, ...right])]
}

function mergeRestrictions(
	left: CanonicalForm["restrictions"],
	right: CanonicalForm["restrictions"]
): CanonicalForm["restrictions"] {
	return {
		appliesToWritten: mergeRestrictionList(
			left.appliesToWritten,
			right.appliesToWritten
		),
		appliesToReading: mergeRestrictionList(
			left.appliesToReading,
			right.appliesToReading
		)
	}
}

function restrictionAllows(
	restrictions: readonly string[],
	writtenSurface: string
): boolean {
	return (
		restrictions.length === 0 ||
		restrictions.includes("*") ||
		restrictions.includes(writtenSurface)
	)
}

function glossText(value: unknown): string {
	if (!isRecord(value)) return ""
	return stringValue(value.text)
}

function parseSenses(value: unknown): ImportSense[] {
	if (!Array.isArray(value)) return []
	return value.filter(isRecord).map((sense, sourceOrdinal) => {
		const glosses = Array.isArray(sense.gloss)
			? sense.gloss
					.filter(
						(gloss) => isRecord(gloss) && stringValue(gloss.lang) === "eng"
					)
					.map(glossText)
					.filter(Boolean)
			: []
		const partsOfSpeech = stringList(sense.partOfSpeech)
		return {
			sourceOrdinal,
			glosses,
			partsOfSpeech,
			fingerprint: sha256Hex(JSON.stringify([glosses, partsOfSpeech]))
		}
	})
}

function addForm(
	forms: Map<string, CanonicalForm>,
	lexemeId: string,
	writtenSurface: string,
	reading: string,
	writtenKind: CanonicalForm["writtenKind"],
	restrictions: CanonicalForm["restrictions"]
): void {
	const key = formKey(writtenSurface, reading)
	const formId = createFormId(lexemeId, writtenSurface, reading)
	const existing = forms.get(key)
	if (existing) {
		forms.set(key, {
			...existing,
			writtenKind:
				existing.writtenKind === "kana" || writtenKind === "kana"
					? "kana"
					: "non-kana",
			restrictions: mergeRestrictions(existing.restrictions, restrictions)
		})
		return
	}
	forms.set(key, {
		formId,
		lexemeId,
		writtenSurface,
		reading,
		writtenKind,
		restrictions
	})
}

export function buildCanonicalLexemes(
	input: unknown,
	pin: SourcePin
): JmdictAdapterResult {
	if (!isRecord(input)) {
		throw new Error("JMdict simplified source must be a JSON object")
	}
	const rawWords = input.words
	if (!Array.isArray(rawWords)) {
		throw new Error("JMdict simplified source must contain a words array")
	}

	const diagnostics: ImportDiagnostic[] = []
	const lexemes: CanonicalLexeme[] = []

	for (const [entryIndex, value] of rawWords.entries()) {
		if (!isRecord(value)) {
			diagnostics.push({
				code: "invalid-jmdict-entry",
				severity: "error",
				message: "JMdict entry is not an object."
			})
			continue
		}
		const entSeq = stringValue(value.id)
		if (!entSeq) {
			diagnostics.push({
				code: "invalid-jmdict-entry",
				severity: "error",
				message: "JMdict entry has no stable id."
			})
			continue
		}

		const lexemeId = createLexemeId(entSeq)
		const forms = new Map<string, CanonicalForm>()
		const rawKana = Array.isArray(value.kana) ? value.kana.filter(isRecord) : []
		const rawKanji = Array.isArray(value.kanji)
			? value.kanji.filter(isRecord)
			: []

		for (const kana of rawKana) {
			const reading = stringValue(kana.text)
			if (!reading) continue

			addForm(forms, lexemeId, reading, reading, "kana", {
				appliesToWritten: [],
				appliesToReading: []
			})

			const appliesToKanji = normalizeList(kana.appliesToKanji)
			for (const kanji of rawKanji) {
				const writtenSurface = stringValue(kanji.text)
				if (
					!writtenSurface ||
					!restrictionAllows(appliesToKanji, writtenSurface)
				) {
					continue
				}
				const writtenRestrictions = appliesToKanji.includes("*")
					? []
					: appliesToKanji
				addForm(forms, lexemeId, writtenSurface, reading, "non-kana", {
					appliesToWritten: writtenRestrictions,
					appliesToReading: []
				})
			}
		}

		const senses = parseSenses(value.sense)
		lexemes.push({
			lexemeId,
			entSeq,
			forms: [...forms.values()],
			senses,
			sourcePin: pin
		})

		if (forms.size === 0) {
			diagnostics.push({
				code: "jmdict-entry-without-forms",
				severity: "warning",
				message: "JMdict entry has no usable kana or written forms.",
				formIds: [lexemeId]
			})
		}

		if (entryIndex < 0) {
			throw new Error("Unreachable JMdict entry index")
		}
	}

	const documentMetadata = {
		version: stringValue(input.version),
		dictDate: stringValue(input.dictDate),
		languages: stringList(input.languages),
		commonOnly: input.commonOnly === true,
		wordCount: rawWords.length
	}

	return { lexemes, diagnostics, documentMetadata }
}
