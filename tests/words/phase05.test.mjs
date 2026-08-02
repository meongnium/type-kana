import assert from "node:assert/strict"
import test from "node:test"
import { WORD_COLLECTION_N5 } from "../../src/lib/words/contracts.ts"
import { parseOpenJlptN5 } from "../../tools/words/openjlpt-adapter.ts"
import { buildCanonicalLexemes } from "../../tools/words/jmdict-adapter.ts"
import { createFormId, createLexemeId } from "../../tools/words/identity.ts"
import { mapOpenJlptRows } from "../../tools/words/mapping.ts"

const openJlptPin = {
	source: "openjlpt",
	repositoryUrl: "https://github.com/evanclan/OpenJLPT",
	releaseOrCommit: "synthetic-phase05-openjlpt-v1",
	assetFilename: "data/json/vocab/n5.json",
	immutableUrl: "https://example.invalid/openjlpt-phase05",
	sha256: "synthetic-openjlpt-sha256",
	importerVersion: "phase0.5-test"
}

const jmdictPin = {
	source: "jmdict-simplified",
	repositoryUrl: "https://github.com/scriptin/jmdict-simplified",
	releaseOrCommit: "synthetic-phase05-jmdict-v1",
	assetFilename: "jmdict-eng.json",
	immutableUrl: "https://example.invalid/jmdict-phase05",
	sha256: "synthetic-jmdict-sha256",
	importerVersion: "phase0.5-test"
}

function openRows(records) {
	return parseOpenJlptN5(records, openJlptPin).rows
}

function syntheticJmdict() {
	return {
		version: "synthetic",
		languages: ["eng"],
		commonOnly: false,
		dictDate: "synthetic",
		words: [
			{
				id: "1001",
				kanji: [{ text: "先生", common: true, tags: [] }],
				kana: [
					{
						text: "せんせい",
						common: true,
						tags: [],
						appliesToKanji: ["先生"]
					}
				],
				sense: [
					{
						partOfSpeech: ["n"],
						gloss: [{ lang: "eng", text: "teacher" }]
					}
				]
			},
			{
				id: "1002",
				kanji: [
					{ text: "甲", common: false, tags: [] },
					{ text: "乙", common: false, tags: [] }
				],
				kana: [
					{
						text: "こう",
						common: false,
						tags: [],
						appliesToKanji: ["甲"]
					},
					{
						text: "おつ",
						common: false,
						tags: [],
						appliesToKanji: []
					}
				],
				sense: [
					{
						partOfSpeech: ["n"],
						gloss: [{ lang: "eng", text: "synthetic fixture" }]
					}
				]
			},
			{
				id: "1003",
				kanji: [],
				kana: [
					{
						text: "あさって",
						common: true,
						tags: [],
						appliesToKanji: ["*"]
					}
				],
				sense: [
					{
						partOfSpeech: ["adv"],
						gloss: [{ lang: "eng", text: "day after tomorrow" }]
					}
				]
			}
		]
	}
}

function findForm(lexemes, entSeq, surface, reading = surface) {
	const lexeme = lexemes.find((item) => item.entSeq === entSeq)
	return lexeme?.forms.find(
		(form) => form.writtenSurface === surface && form.reading === reading
	)
}

test("derives effective readings for empty kana-only source readings", () => {
	const parsed = parseOpenJlptN5(
		[
			{ word: "あさって", reading: "", level: "N5", meanings: ["synthetic"] },
			{ word: "ホテル", reading: "", level: "N5", meanings: ["synthetic"] },
			{ word: "あア", reading: "", level: "N5", meanings: ["synthetic"] },
			{ word: "先生", reading: "", level: "N5", meanings: ["synthetic"] },
			{ word: "あ。", reading: "", level: "N5", meanings: ["synthetic"] }
		],
		openJlptPin
	)

	assert.deepEqual(
		parsed.rows
			.slice(0, 3)
			.map((row) => [
				row.rawSourceReading,
				row.effectiveReading,
				row.sourceReadingStatus
			]),
		[
			["", "あさって", "derived-from-surface"],
			["", "ホテル", "derived-from-surface"],
			["", "あア", "derived-from-surface"]
		]
	)
	assert.equal(parsed.rows[3].sourceReadingStatus, "invalid-source-reading")
	assert.equal(parsed.rows[3].effectiveReading, "")
	assert.equal(parsed.rows[4].sourceReadingStatus, "invalid-source-reading")
	assert.equal(parsed.rows[4].effectiveReading, "")
})

test("keeps non-empty source readings authoritative and hashes raw readings", () => {
	const derived = openRows([
		{ word: "あさって", reading: "", level: "N5", meanings: ["synthetic"] }
	])[0]
	const explicit = openRows([
		{
			word: "あさって",
			reading: "あさって",
			level: "N5",
			meanings: ["synthetic"]
		}
	])[0]

	assert.equal(derived.effectiveReading, "あさって")
	assert.equal(explicit.effectiveReading, "あさって")
	const explicitDifferent = openRows([
		{ word: "ホテル", reading: "ほてる", level: "N5", meanings: ["synthetic"] }
	])[0]
	assert.equal(explicitDifferent.effectiveReading, "ほてる")
	assert.equal(derived.rawSourceReading, "")
	assert.equal(explicit.rawSourceReading, "あさって")
	assert.notEqual(derived.sourceRecordHash, explicit.sourceRecordHash)
	assert.notEqual(derived.sourceRowKey, explicit.sourceRowKey)
	assert.equal(explicit.sourceReadingStatus, "explicit")
})

test("JMdict adapter emits kana text as its own canonical surface", () => {
	const result = buildCanonicalLexemes(syntheticJmdict(), jmdictPin)
	const kanaForm = findForm(result.lexemes, "1001", "せんせい")
	const kanjiForm = findForm(result.lexemes, "1001", "先生", "せんせい")

	assert.ok(kanaForm)
	assert.ok(kanjiForm)
	assert.equal(kanaForm.writtenKind, "kana")
	assert.equal(kanjiForm.writtenKind, "non-kana")
	assert.equal(
		kanaForm.formId,
		createFormId(createLexemeId("1001"), "せんせい", "せんせい")
	)
})

test("JMdict restrictions prevent written-reading Cartesian products", () => {
	const result = buildCanonicalLexemes(syntheticJmdict(), jmdictPin)
	assert.ok(findForm(result.lexemes, "1002", "甲", "こう"))
	assert.equal(findForm(result.lexemes, "1002", "乙", "こう"), undefined)
	assert.ok(findForm(result.lexemes, "1002", "甲", "おつ"))
	assert.ok(findForm(result.lexemes, "1002", "乙", "おつ"))
})

test("kana source surfaces match JMdict kana forms without Kanji synthesis", () => {
	const result = buildCanonicalLexemes(syntheticJmdict(), jmdictPin)
	const rows = openRows([
		{ word: "せんせい", reading: "", level: "N5", meanings: ["synthetic"] },
		{ word: "先生", reading: "せんせい", level: "N5", meanings: ["synthetic"] }
	])
	const mapped = mapOpenJlptRows(rows, result.lexemes)

	assert.equal(mapped.approvedMappings.length, 1)
	assert.equal(mapped.approvedMappings[0].row.sourceWrittenSurface, "せんせい")
	assert.equal(mapped.decisions[1].status, "invalid-surface")
	assert.equal(
		mapped.approvedMappings.some((item) => item.word.surface === "先生"),
		false
	)
})

test("empty readings reject non-kana source surfaces without deriving a replacement", () => {
	const rows = openRows([
		{ word: "先生", reading: "", level: "N5", meanings: ["synthetic"] },
		{ word: "あ。", reading: "", level: "N5", meanings: ["synthetic"] }
	])
	assert.equal(rows[0].effectiveReading, "")
	assert.equal(rows[1].effectiveReading, "")
	assert.equal(rows[0].sourceReadingStatus, "invalid-source-reading")
	assert.equal(rows[1].sourceReadingStatus, "invalid-source-reading")
	const result = mapOpenJlptRows(
		rows,
		buildCanonicalLexemes(syntheticJmdict(), jmdictPin).lexemes
	)
	assert.deepEqual(
		result.decisions.map((decision) => decision.status),
		["invalid-source-reading", "invalid-source-reading"]
	)
})

test("keeps source hashes stable while locators track input positions", () => {
	const rows = openRows([
		{ word: "あさって", reading: "", level: "N5", meanings: ["synthetic"] },
		{ word: "ホテル", reading: "", level: "N5", meanings: ["synthetic"] }
	])
	const reordered = openRows([
		{ word: "ホテル", reading: "", level: "N5", meanings: ["synthetic"] },
		{ word: "あさって", reading: "", level: "N5", meanings: ["synthetic"] }
	])
	const first = new Map(
		rows.map((row) => [row.sourceWrittenSurface, row.sourceRecordHash])
	)
	const second = new Map(
		reordered.map((row) => [row.sourceWrittenSurface, row.sourceRecordHash])
	)
	assert.deepEqual(first, second)
})

test("does not use OpenJLPT meanings to resolve ambiguous lexemes", () => {
	const duplicateEntries = {
		...syntheticJmdict(),
		words: [
			{
				id: "2001",
				kanji: [],
				kana: [{ text: "はし", appliesToKanji: [] }],
				sense: [
					{ partOfSpeech: ["n"], gloss: [{ lang: "eng", text: "bridge" }] }
				]
			},
			{
				id: "2002",
				kanji: [],
				kana: [{ text: "はし", appliesToKanji: [] }],
				sense: [
					{ partOfSpeech: ["n"], gloss: [{ lang: "eng", text: "chopsticks" }] }
				]
			}
		]
	}
	const lexemes = buildCanonicalLexemes(duplicateEntries, jmdictPin).lexemes
	const mapped = mapOpenJlptRows(
		openRows([
			{ word: "はし", reading: "", level: "N5", meanings: ["bridge"] }
		]),
		lexemes
	)
	assert.equal(mapped.decisions[0].status, "ambiguous")
	assert.equal(mapped.approvedMappings.length, 0)
})

test("uses the pinned collection identity for adapted source rows", () => {
	const row = openRows([
		{ word: "あさって", reading: "", level: "N5", meanings: ["synthetic"] }
	])[0]
	assert.equal(row.collectionId, WORD_COLLECTION_N5)
	assert.match(row.sourceLocator, /n5\.json#0$/)
})
