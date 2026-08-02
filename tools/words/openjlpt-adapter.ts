import {
	WORD_COLLECTION_N5,
	type ImportDiagnostic,
	type OpenJlptSourceRow,
	type SourcePin,
	type SourceReadingStatus
} from "../../src/lib/words/contracts.ts"
import { validateSourceSurface } from "../../src/lib/words/surface.ts"
import { createSourceRecordHash, createSourceRowKey } from "./identity.ts"

export interface EffectiveReadingResult {
	ok: boolean
	effectiveReading: string
	status: SourceReadingStatus
	error?: string
}

export interface OpenJlptAdapterResult {
	rows: readonly OpenJlptSourceRow[]
	diagnostics: readonly ImportDiagnostic[]
	totalRecords: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value : ""
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	return value.flatMap((item) => {
		if (typeof item === "string") return [item]
		if (isRecord(item)) {
			const text = stringValue(item.text ?? item.en ?? item.meaning)
			return text ? [text] : []
		}
		return []
	})
}

function isKanaClassification(
	classification: ReturnType<typeof validateSourceSurface>["classification"]
): boolean {
	return (
		classification === "hiragana" ||
		classification === "katakana" ||
		classification === "mixed-kana"
	)
}

export function deriveEffectiveReading(
	sourceWrittenSurface: string,
	rawSourceReading: string
): EffectiveReadingResult {
	if (rawSourceReading.length > 0) {
		return {
			ok: true,
			effectiveReading: rawSourceReading.normalize("NFKC"),
			status: "explicit"
		}
	}

	const validation = validateSourceSurface(sourceWrittenSurface)
	if (!validation.allowed || !isKanaClassification(validation.classification)) {
		const codes = validation.diagnostics.map((diagnostic) => diagnostic.code)
		return {
			ok: false,
			effectiveReading: "",
			status: "invalid-source-reading",
			error:
				"An empty OpenJLPT reading requires an exact valid kana-only source surface." +
				(codes.length > 0 ? " Diagnostics: " + codes.join(", ") + "." : "")
		}
	}

	return {
		ok: true,
		effectiveReading: sourceWrittenSurface.normalize("NFKC"),
		status: "derived-from-surface"
	}
}

export function parseOpenJlptN5(
	input: unknown,
	pin: SourcePin
): OpenJlptAdapterResult {
	if (!Array.isArray(input)) {
		throw new Error("OpenJLPT N5 source must be a JSON array")
	}

	const rows: OpenJlptSourceRow[] = []
	const diagnostics: ImportDiagnostic[] = []

	for (const [sourceIndex, value] of input.entries()) {
		const sourceLocator = pin.assetFilename + "#" + sourceIndex
		const record = isRecord(value) ? value : {}
		const sourceWrittenSurface = stringValue(record.word)
		const hasReading = Object.prototype.hasOwnProperty.call(record, "reading")
		const rawReadingValue = record.reading
		const rawSourceReading = stringValue(rawReadingValue)
		const sourceLevel = stringValue(record.level)
		const sourceMeanings = stringList(record.meanings)

		let sourceReadingStatus: SourceReadingStatus
		let effectiveReading = ""
		let sourceReadingError: string | undefined

		if (!isRecord(value) || !sourceWrittenSurface || !hasReading) {
			sourceReadingStatus = "invalid-source-reading"
			sourceReadingError =
				"OpenJLPT row is missing a string word or reading field."
			diagnostics.push({
				code: "invalid-openjlpt-record",
				severity: "error",
				message: sourceReadingError,
				sourceLocator
			})
		} else if (typeof rawReadingValue !== "string") {
			sourceReadingStatus = "invalid-source-reading"
			sourceReadingError = "OpenJLPT reading must be a string."
			diagnostics.push({
				code: "invalid-openjlpt-record",
				severity: "error",
				message: sourceReadingError,
				sourceLocator
			})
		} else {
			const effective = deriveEffectiveReading(
				sourceWrittenSurface,
				rawSourceReading
			)
			sourceReadingStatus = effective.status
			effectiveReading = effective.effectiveReading
			sourceReadingError = effective.error
		}

		const base = {
			collectionId: WORD_COLLECTION_N5,
			sourceLevel,
			sourceWrittenSurface,
			rawSourceReading,
			sourceMeanings,
			sourceLocator
		}
		const sourceRecordHash = createSourceRecordHash(base)
		const sourceRowKey = createSourceRowKey(pin, base)

		rows.push({
			sourceRowKey,
			sourceRecordHash,
			collectionId: WORD_COLLECTION_N5,
			sourceLevel,
			sourceWrittenSurface,
			rawSourceReading,
			effectiveReading,
			sourceReadingStatus,
			sourceReadingError,
			sourceMeanings,
			sourcePin: pin,
			sourceIndex,
			sourceLocator
		})
	}

	return { rows, diagnostics, totalRecords: input.length }
}
