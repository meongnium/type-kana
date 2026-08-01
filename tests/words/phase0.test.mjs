import assert from "node:assert/strict"
import test from "node:test"
import { WORD_COLLECTION_N5 } from "../../src/lib/words/contracts.ts"
import { resolveEligibility } from "../../src/lib/words/eligibility.ts"
import {
	canonicalRomaji,
	isRomajiWordAnswer,
	normalizePronunciationKana
} from "../../src/lib/words/romaji.ts"
import {
	classifySurface,
	validateSourceSurface
} from "../../src/lib/words/surface.ts"
import { tokenizeSurface } from "../../src/lib/words/tokenizer.ts"
import {
	createCollectionMembershipKey,
	createFormId,
	createLexemeId,
	createReadingCardId,
	createSourceRecordHash,
	createSourceRowKey
} from "../../tools/words/identity.ts"
import {
	ArtifactReleaseError,
	emitRuntimeArtifact
} from "../../tools/words/artifact.ts"
import { mapOpenJlptRows } from "../../tools/words/mapping.ts"

const pin = {
	source: "openjlpt",
	releaseOrCommit: "synthetic-fixture-v1",
	assetFilename: "n5.json",
	sha256: "synthetic-fixture-sha256"
}

function form(
	entSeq,
	writtenSurface,
	reading = writtenSurface,
	restrictions = {
		appliesToWritten: [],
		appliesToReading: []
	}
) {
	const lexemeId = createLexemeId(entSeq)
	return {
		formId: createFormId(lexemeId, writtenSurface, reading),
		lexemeId,
		writtenSurface,
		reading,
		writtenKind: /\p{Script=Han}/u.test(writtenSurface) ? "non-kana" : "kana",
		restrictions
	}
}

function lexeme(...forms) {
	return {
		lexemeId: forms[0].lexemeId,
		entSeq: forms[0].lexemeId.replace("jmdict:", ""),
		forms,
		senses: [],
		sourcePin: {
			source: "jmdict-simplified",
			releaseOrCommit: "synthetic-fixture-v1",
			assetFilename: "jmdict-eng.json",
			sha256: "synthetic-jmdict-sha256"
		}
	}
}

function row(sourceWrittenSurface, sourceReading = sourceWrittenSurface) {
	const base = {
		collectionId: WORD_COLLECTION_N5,
		sourceLevel: "N5",
		sourceWrittenSurface,
		sourceReading
	}
	return {
		sourceRowKey: createSourceRowKey(pin, base),
		sourceRecordHash: createSourceRecordHash(base),
		...base,
		sourcePin: pin
	}
}

function emit(result, options = {}) {
	return emitRuntimeArtifact(result.approvedMappings, {
		contentVersion: "synthetic-phase-0-v1",
		generatedAt: "2026-08-01T00:00:00.000Z",
		...options
	})
}

test("classifies the conservative source-surface policy", () => {
	assert.equal(classifySurface("あまり"), "hiragana")
	assert.equal(classifySurface("ホテル"), "katakana")
	assert.equal(classifySurface("サッカーをする"), "mixed-kana")
	assert.equal(classifySurface("先生"), "contains-kanji")
	assert.equal(classifySurface("お茶"), "contains-kanji")
	assert.equal(classifySurface("hello"), "unsupported/other")
	assert.equal(validateSourceSurface("・").allowed, false)
})

test("tokenizes mora units without rewriting the displayed surface", () => {
	assert.deepEqual(tokenizeSurface("きょう").tokens, ["きょ", "う"])
	assert.deepEqual(tokenizeSurface("びょういん").tokens, [
		"びょ",
		"う",
		"い",
		"ん"
	])
	assert.deepEqual(tokenizeSurface("サッカー").tokens, ["サ", "ッ", "カ", "ー"])
	const foreign = tokenizeSurface("ティ")
	assert.deepEqual(foreign.tokens, ["ティ"])
	assert.equal(foreign.details[0].kind, "foreign-combination")
})

test("resolves selector requirements separately from surface tokens", () => {
	const soccer = resolveEligibility("サッカー")
	assert.deepEqual(soccer.surfaceTokens, ["サ", "ッ", "カ", "ー"])
	assert.deepEqual(soccer.requiredCanonicalTokens, ["さ", "つ", "か"])
	assert.equal(soccer.acceptedForArtifact, true)

	const selected = resolveEligibility("サッカー", {
		kanaType: "katakana",
		selectedCanonicalTokens: ["さ", "つ", "か"]
	})
	assert.equal(selected.selectedForConfiguration, true)

	const foreign = resolveEligibility("ティ")
	assert.equal(foreign.acceptedForArtifact, false)
	assert.ok(
		foreign.diagnostics.some(
			(diagnostic) => diagnostic.code === "unsupported-selector-mora"
		)
	)
})

test("normalizes pronunciation and validates bounded romaji answers", () => {
	assert.equal(normalizePronunciationKana("コーヒー"), "こーひー")
	assert.equal(canonicalRomaji("しゃしん"), "shashin")
	assert.equal(canonicalRomaji("きって"), "kitte")
	assert.equal(canonicalRomaji("しんよう"), "shin'you")
	assert.equal(canonicalRomaji("コーヒー"), "koohii")
	assert.equal(canonicalRomaji("サッカー"), "sakkaa")

	for (const answer of ["shashin", "syashin", "shasin", " SHASHIN "]) {
		assert.equal(isRomajiWordAnswer(answer, "しゃしん"), true, answer)
	}
	for (const answer of ["sashin", "shashiin", "しゃしん", "sha shin"]) {
		assert.equal(isRomajiWordAnswer(answer, "しゃしん"), false, answer)
	}
	assert.equal(isRomajiWordAnswer("kitte", "きって"), true)
	assert.equal(isRomajiWordAnswer("kite", "きって"), false)
	assert.equal(isRomajiWordAnswer("shin'you", "しんよう"), true)
	assert.equal(isRomajiWordAnswer("shinyou", "しんよう"), true)
	assert.equal(isRomajiWordAnswer("shinyo", "しんよう"), false)
	assert.equal(isRomajiWordAnswer("koohii", "コーヒー"), true)
	assert.equal(isRomajiWordAnswer("kōhī", "コーヒー"), false)
	assert.equal(isRomajiWordAnswer("sakkaa", "サッカー"), true)
	assert.equal(isRomajiWordAnswer("saka", "サッカー"), false)
})

test("keeps identity distinct for lexemes, readings, and written forms", () => {
	assert.notEqual(
		createFormId("jmdict:1", "橋", "はし"),
		createFormId("jmdict:2", "箸", "はし")
	)
	assert.notEqual(
		createFormId("jmdict:3", "はし", "はし"),
		createFormId("jmdict:3", "はし", "はじ")
	)
})

test("maps kana source surfaces without synthesizing them from Kanji readings", () => {
	const kanaTeacher = form("1001", "せんせい", "せんせい")
	const kanjiTeacher = form("1002", "先生", "せんせい")
	const kanjiFood = form("1003", "お茶", "おちゃ")
	const result = mapOpenJlptRows(
		[row("せんせい"), row("先生", "せんせい"), row("お茶", "おちゃ")],
		[lexeme(kanaTeacher), lexeme(kanjiTeacher), lexeme(kanjiFood)]
	)
	assert.equal(result.approvedMappings.length, 1)
	assert.equal(result.approvedMappings[0].row.sourceWrittenSurface, "せんせい")
	assert.equal(
		result.decisions.filter((item) => item.status === "invalid-surface").length,
		2
	)
})

test("reports duplicates, same-reading words, same-surface readings, and ambiguity", () => {
	const bridge = form("2001", "はし", "はし")
	const chopsticks = form("2002", "はし", "はし")
	const bridgeReading = form("2003", "橋", "はし")
	const duplicateRows = [row("あまり"), row("あまり")]
	const result = mapOpenJlptRows(
		[...duplicateRows, row("はし"), row("橋", "はし"), row("あまり")],
		[
			lexeme(form("2000", "あまり")),
			lexeme(bridge),
			lexeme(chopsticks),
			lexeme(bridgeReading)
		]
	)
	assert.equal(
		result.decisions.filter((item) => item.status === "duplicate").length,
		2
	)
	assert.ok(result.decisions.some((item) => item.status === "ambiguous"))
	assert.ok(result.decisions.some((item) => item.status === "invalid-surface"))
})

test("keeps ambiguous and unmatched diagnostics out of the artifact", () => {
	const exact = form("3001", "あまり")
	const ambiguousA = form("3002", "きれい")
	const ambiguousB = form("3003", "きれい")
	const result = mapOpenJlptRows(
		[row("あまり"), row("きれい"), row("ホテル")],
		[lexeme(exact), lexeme(ambiguousA), lexeme(ambiguousB)]
	)
	const artifact = emit(result)
	assert.equal(artifact.words.length, 1)
	assert.equal(artifact.words[0].surface, "あまり")
	assert.ok(result.diagnostics.some((item) => item.code === "ambiguous"))
	assert.ok(result.diagnostics.some((item) => item.code === "unmatched"))
})

test("requires explicit approval before emitting a runtime record", () => {
	const sourceForm = form("4001", "きれい")
	const result = mapOpenJlptRows([row("きれい")], [lexeme(sourceForm)])
	const mapping = result.approvedMappings[0]
	assert.ok(mapping)
	mapping.decision = { ...mapping.decision, approval: "pending" }
	assert.throws(() => emit(result), ArtifactReleaseError)
})

test("validates manual overrides and keeps the selected canonical form", () => {
	const first = form("5001", "きれい")
	const second = form("5002", "きれい")
	const source = row("きれい")
	const override = {
		overrideId: "override:synthetic-1",
		sourceRowKey: source.sourceRowKey,
		selectedFormId: second.formId,
		reason: "Synthetic review fixture",
		reviewer: "test",
		version: "1"
	}
	const result = mapOpenJlptRows(
		[source],
		[lexeme(first), lexeme(second)],
		[override]
	)
	assert.equal(result.approvedMappings.length, 1)
	assert.equal(result.approvedMappings[0].form.formId, second.formId)
	assert.equal(result.approvedMappings[0].decision.status, "manual-override")
})

test("keeps artifact IDs and ordering stable when source rows are reordered", () => {
	const forms = [lexeme(form("6001", "ホテル")), lexeme(form("6002", "あまり"))]
	const rows = [row("ホテル"), row("あまり")]
	const first = emit(mapOpenJlptRows(rows, forms))
	const second = emit(mapOpenJlptRows([...rows].reverse(), forms))
	assert.deepEqual(first, second)
	assert.equal(
		createCollectionMembershipKey(WORD_COLLECTION_N5, first.words[0].formId),
		createCollectionMembershipKey(WORD_COLLECTION_N5, first.words[0].formId)
	)
	assert.equal(
		createReadingCardId(first.words[0].formId),
		first.words[0].cardId
	)
})
