import { createHash } from "node:crypto"
import type {
	OpenJlptSourceRow,
	SourcePin
} from "../../src/lib/words/contracts.ts"

export function normalizeIdentityText(value: string): string {
	return value.normalize("NFKC")
}

export function encodeIdentityParts(values: readonly string[]): string {
	return JSON.stringify(values.map(normalizeIdentityText))
}

export function encodeExactIdentityParts(values: readonly unknown[]): string {
	return JSON.stringify(values)
}

export function sha256Hex(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex")
}

export function createLexemeId(entSeq: string): string {
	const normalized = normalizeIdentityText(entSeq.trim())
	if (!normalized) throw new Error("JMdict ent_seq must not be empty")
	return "jmdict:" + normalized
}

export function createFormId(
	lexemeId: string,
	writtenSurface: string,
	reading: string
): string {
	const identity = encodeIdentityParts([lexemeId, writtenSurface, reading])
	return "jmdict-form:sha256:" + sha256Hex(identity)
}

export function createCollectionMembershipKey(
	collectionId: string,
	formId: string
): string {
	return (
		"membership:v1:sha256:" +
		sha256Hex(encodeIdentityParts([collectionId, formId]))
	)
}

export function createReadingCardId(formId: string): string {
	return "reading-typing:v1:sha256:" + sha256Hex(formId)
}

type SourceRecordIdentity = Pick<
	OpenJlptSourceRow,
	| "collectionId"
	| "sourceLevel"
	| "sourceWrittenSurface"
	| "rawSourceReading"
	| "sourceMeanings"
>

export function createSourceRecordHash(row: SourceRecordIdentity): string {
	return sha256Hex(
		encodeExactIdentityParts([
			row.collectionId,
			row.sourceLevel,
			row.sourceWrittenSurface,
			row.rawSourceReading,
			[...row.sourceMeanings]
		])
	)
}

export function createSourceRowKey(
	pin: SourcePin,
	row: SourceRecordIdentity & { sourceLocator?: string }
): string {
	const identity = encodeExactIdentityParts([
		pin.source,
		pin.releaseOrCommit,
		pin.assetFilename,
		pin.sha256,
		createSourceRecordHash(row),
		row.sourceLocator ?? ""
	])
	return "openjlpt-row:sha256:" + sha256Hex(identity)
}
