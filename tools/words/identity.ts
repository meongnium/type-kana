import { createHash } from "node:crypto"
import type {
	OpenJlptSourceRow,
	SourcePin
} from "../../src/lib/words/contracts.ts"

export function normalizeIdentityText(value: string): string {
	return value.normalize("NFKC")
}

export function sha256Hex(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex")
}

export function createLexemeId(entSeq: string): string {
	if (!entSeq.trim()) throw new Error("JMdict ent_seq must not be empty")
	return `jmdict:${entSeq.trim()}`
}

export function createFormId(
	lexemeId: string,
	writtenSurface: string,
	reading: string
): string {
	const identity = [lexemeId, writtenSurface, reading]
		.map(normalizeIdentityText)
		.join("\0")
	return `jmdict-form:sha256:${sha256Hex(identity)}`
}

export function createCollectionMembershipKey(
	collectionId: string,
	formId: string
): string {
	return `${collectionId}\0${formId}`
}

export function createReadingCardId(formId: string): string {
	return `reading-typing:v1:sha256:${sha256Hex(formId)}`
}

export function createSourceRecordHash(
	row: Pick<
		OpenJlptSourceRow,
		"collectionId" | "sourceLevel" | "sourceWrittenSurface" | "sourceReading"
	>
): string {
	const identity = [
		row.collectionId,
		row.sourceLevel,
		row.sourceWrittenSurface,
		row.sourceReading
	]
		.map(normalizeIdentityText)
		.join("\0")
	return sha256Hex(identity)
}

export function createSourceRowKey(
	pin: SourcePin,
	row: Pick<
		OpenJlptSourceRow,
		"collectionId" | "sourceLevel" | "sourceWrittenSurface" | "sourceReading"
	>
): string {
	return `openjlpt-row:sha256:${sha256Hex(
		[pin.releaseOrCommit, pin.assetFilename, createSourceRecordHash(row)].join(
			"\0"
		)
	)}`
}
