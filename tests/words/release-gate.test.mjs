import assert from "node:assert/strict"
import test from "node:test"
import { WORD_COLLECTION_N5 } from "../../src/lib/words/contracts.ts"
import {
	emitRuntimeArtifact,
	ArtifactReleaseError
} from "../../tools/words/artifact.ts"
import {
	createFormId,
	createLexemeId,
	createSourceRecordHash,
	createSourceRowKey
} from "../../tools/words/identity.ts"
import { mapOpenJlptRows } from "../../tools/words/mapping.ts"

const pin = {
	source: "openjlpt",
	releaseOrCommit: "synthetic-fixture-v1",
	assetFilename: "n5.json",
	sha256: "synthetic-fixture-sha256"
}

function form(entSeq, surface) {
	const lexemeId = createLexemeId(entSeq)
	return {
		formId: createFormId(lexemeId, surface, surface),
		lexemeId,
		writtenSurface: surface,
		reading: surface,
		writtenKind: "kana",
		restrictions: { appliesToWritten: [], appliesToReading: [] }
	}
}

function row(surface) {
	const base = {
		collectionId: WORD_COLLECTION_N5,
		sourceLevel: "N5",
		sourceWrittenSurface: surface,
		sourceReading: surface
	}
	return {
		sourceRowKey: createSourceRowKey(pin, base),
		sourceRecordHash: createSourceRecordHash(base),
		...base,
		sourcePin: pin
	}
}

function approved(surface = "あまり") {
	return mapOpenJlptRows(
		[row(surface)],
		[
			{
				lexemeId: "jmdict:gate",
				entSeq: "gate",
				forms: [form("gate", surface)],
				senses: [],
				sourcePin: {
					source: "jmdict-simplified",
					releaseOrCommit: "synthetic-fixture-v1",
					assetFilename: "jmdict-eng.json",
					sha256: "synthetic-jmdict-sha256"
				}
			}
		]
	).approvedMappings[0]
}

function emit(mappings, options = {}) {
	return emitRuntimeArtifact(mappings, {
		contentVersion: "synthetic-phase-0-v1",
		generatedAt: "2026-08-01T00:00:00.000Z",
		...options
	})
}

test("rejects forbidden surfaces and unsupported selector tokens at release", () => {
	const mapping = approved()
	mapping.word = { ...mapping.word, surface: "先生" }
	assert.throws(() => emit([mapping]), ArtifactReleaseError)

	const foreign = approved()
	foreign.word = { ...foreign.word, surface: "ティ" }
	assert.throws(() => emit([foreign]), ArtifactReleaseError)
})

test("rejects invalid runtime policy, duplicate membership, and coverage regression", () => {
	const mapping = approved()
	mapping.word = { ...mapping.word, answerPolicy: "wrong-policy" }
	assert.throws(() => emit([mapping]), ArtifactReleaseError)

	const duplicate = approved()
	assert.throws(() => emit([duplicate, duplicate]), ArtifactReleaseError)

	assert.throws(
		() => emit([approved()], { coverageBaseline: { minimumWordCount: 2 } }),
		ArtifactReleaseError
	)
})

test("rejects a forged deterministic form ID", () => {
	const mapping = approved()
	mapping.form = { ...mapping.form, formId: "jmdict-form:sha256:forged" }
	assert.throws(() => emit([mapping]), ArtifactReleaseError)
})
