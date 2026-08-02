import assert from "node:assert/strict"
import test from "node:test"
import {
	WORD_ARTIFACT_SCHEMA_VERSION,
	WORD_COLLECTION_N5
} from "../../src/lib/words/contracts.ts"
import {
	FOREIGN_HIRAGANA_TOKENS,
	SELECTOR_YOON_HIRAGANA_TOKENS,
	UNSUPPORTED_YOON_HIRAGANA_TOKENS
} from "../../src/lib/words/inventory.ts"
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
	emitRuntimeArtifact,
	validateRuntimeArtifact
} from "../../tools/words/artifact.ts"
import {
	mapOpenJlptRows,
	restrictionsAllow,
	validateManualOverride
} from "../../tools/words/mapping.ts"

const openJlptPin = {
	source: "openjlpt",
	repositoryUrl: "https://github.com/evanclan/OpenJLPT",
	immutableUrl: "https://example.invalid/openjlpt-synthetic",
	importerVersion: "phase0.5-test",
	releaseOrCommit: "synthetic-fixture-v1",
	assetFilename: "n5.json",
	sha256: "synthetic-fixture-sha256"
}

const jmdictPin = {
	source: "jmdict-simplified",
	repositoryUrl: "https://github.com/scriptin/jmdict-simplified",
	immutableUrl: "https://example.invalid/jmdict-synthetic",
	importerVersion: "phase0.5-test",
	releaseOrCommit: "synthetic-fixture-v1",
	assetFilename: "jmdict-eng.json",
	sha256: "synthetic-jmdict-sha256"
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
		sourcePin: jmdictPin
	}
}

function sourceRow(
	sourceWrittenSurface,
	sourceReading = sourceWrittenSurface,
	overrides = {}
) {
	const base = {
		collectionId: WORD_COLLECTION_N5,
		sourceLevel: "N5",
		sourceWrittenSurface,
		rawSourceReading: sourceReading,
		effectiveReading: overrides.effectiveReading ?? sourceReading,
		sourceReadingStatus: overrides.sourceReadingStatus ?? "explicit",
		sourceMeanings: overrides.sourceMeanings ?? [],
		...overrides
	}
	return {
		sourceRowKey: createSourceRowKey(openJlptPin, base),
		sourceIndex: overrides.sourceIndex ?? 0,
		sourceLocator: overrides.sourceLocator ?? "synthetic#0",
		sourceRecordHash: createSourceRecordHash(base),
		...base,
		sourcePin: openJlptPin
	}
}

function manualOverride(source, selectedFormId, overrides = {}) {
	return {
		schemaVersion: 1,
		overrideId: "override:synthetic-1",
		sourceRowKey: source.sourceRowKey,
		selectedFormId,
		reason: "Synthetic review fixture",
		reviewer: "phase0-test",
		version: "1",
		...overrides
	}
}

function emit(result, options = {}) {
	return emitRuntimeArtifact(result.approvedMappings, {
		contentVersion: "synthetic-phase-0-v1",
		generatedAt: "2026-08-01T00:00:00.000Z",
		...options
	})
}

function assertHasDiagnostic(result, code) {
	assert.ok(
		result.diagnostics.some((diagnostic) => diagnostic.code === code),
		"Expected diagnostic: " + code
	)
}

test("classifies every required source surface and forbidden character class", () => {
	assert.equal(classifySurface("あまり"), "hiragana")
	assert.equal(classifySurface("きれい"), "hiragana")
	assert.equal(classifySurface("ホテル"), "katakana")
	assert.equal(classifySurface("サッカー"), "katakana")
	assert.equal(classifySurface("サッカーをする"), "mixed-kana")
	assert.equal(classifySurface("先生"), "contains-kanji")
	assert.equal(classifySurface("食べる"), "contains-kanji")
	assert.equal(classifySurface("お茶"), "contains-kanji")
	assert.equal(classifySurface("せんせい"), "hiragana")
	assert.equal(validateSourceSurface("せんせい").allowed, true)
	assert.equal(validateSourceSurface("・").allowed, false)
	assert.equal(validateSourceSurface("abc").allowed, false)
	assert.equal(validateSourceSurface("あ1").allowed, false)
	assert.equal(validateSourceSurface("ゝ").allowed, false)
})

test("uses an explicit selector-derived surface inventory", () => {
	assert.ok(SELECTOR_YOON_HIRAGANA_TOKENS.includes("きょ"))
	assert.ok(!SELECTOR_YOON_HIRAGANA_TOKENS.includes("ぢゃ"))
	assert.ok(UNSUPPORTED_YOON_HIRAGANA_TOKENS.includes("ぢゃ"))
	assert.ok(FOREIGN_HIRAGANA_TOKENS.includes("てぃ"))
	assert.equal(validateSourceSurface("ぁ").allowed, true)
	assert.equal(resolveEligibility("ぁ").acceptedForArtifact, false)
	assert.equal(resolveEligibility("ゐ").acceptedForArtifact, false)
})

test("tokenizes yōon with maximal munch", () => {
	assert.deepEqual(tokenizeSurface("きょう").tokens, ["きょ", "う"])
	assert.deepEqual(tokenizeSurface("びょういん").tokens, [
		"びょ",
		"う",
		"い",
		"ん"
	])
	assert.deepEqual(tokenizeSurface("しゃしん").tokens, ["しゃ", "し", "ん"])
	assert.equal(tokenizeSurface("きょう").details[0].kind, "yoon")
})

test("preserves small tsu and prolonged sound marks in surface tokens", () => {
	assert.deepEqual(tokenizeSurface("きって").tokens, ["き", "っ", "て"])
	assert.deepEqual(tokenizeSurface("サッカー").tokens, ["サ", "ッ", "カ", "ー"])
	assert.deepEqual(tokenizeSurface("コーヒー").tokens, ["コ", "ー", "ヒ", "ー"])
	assert.equal(tokenizeSurface("きって").details[1].kind, "small-tsu")
	assert.equal(tokenizeSurface("サッカー").details[1].text, "ッ")
	assert.equal(tokenizeSurface("サッカー").details[3].kind, "prolonged-mark")
})

test("recognizes foreign combinations and reports unsupported selector mora", () => {
	for (const surface of ["ティ", "ファ", "チェ", "ウィ"]) {
		const tokenization = tokenizeSurface(surface)
		assert.deepEqual(tokenization.tokens, [surface])
		assert.equal(tokenization.details[0].kind, "foreign-combination")
		assertHasDiagnostic(
			resolveEligibility(surface),
			"unsupported-selector-mora"
		)
	}
	const unsupportedYoon = tokenizeSurface("ぢゃ")
	assert.deepEqual(unsupportedYoon.tokens, ["ぢゃ"])
	assert.equal(unsupportedYoon.details[0].kind, "unsupported-yoon")
	assertHasDiagnostic(resolveEligibility("ぢゃ"), "unsupported-selector-mora")
	const unsupportedSmall = tokenizeSurface("ぁ")
	assert.equal(unsupportedSmall.details[0].kind, "unsupported-small-kana")
	assertHasDiagnostic(resolveEligibility("ぁ"), "unsupported-selector-mora")
})

test("reports unknown tokenizer tokens instead of falling back", () => {
	const result = tokenizeSurface("あゝ")
	assert.deepEqual(result.tokens, ["あ", "ゝ"])
	assert.equal(result.details[1].kind, "unknown")
	assertHasDiagnostic(result, "unknown-token")
})

test("resolves strict selected-kana eligibility without changing surface units", () => {
	const soccer = resolveEligibility("サッカー", {
		kanaType: "katakana",
		selectedCanonicalTokens: ["サ", "ツ", "カ"]
	})
	assert.equal(soccer.acceptedForArtifact, true)
	assert.equal(soccer.selectedForConfiguration, true)
	assert.deepEqual(soccer.surfaceTokens, ["サ", "ッ", "カ", "ー"])
	assert.deepEqual(soccer.requiredCanonicalTokens, ["さ", "つ", "か"])
	assert.deepEqual(soccer.eligibilityRequirements, [
		{ kind: "kana-token", surfaceToken: "サ", canonicalToken: "さ" },
		{ kind: "small-tsu", surfaceToken: "ッ", canonicalToken: "つ" },
		{ kind: "kana-token", surfaceToken: "カ", canonicalToken: "か" },
		{ kind: "prolonged-mark", surfaceToken: "ー", requiresPrevious: true }
	])
	const missing = resolveEligibility("サッカー", {
		kanaType: "katakana",
		selectedCanonicalTokens: ["サ", "カ"]
	})
	assert.equal(missing.selectedForConfiguration, false)
	assertHasDiagnostic(missing, "missing-selected-kana")
	const yoonMissing = resolveEligibility("きょう", {
		kanaType: "hiragana",
		selectedCanonicalTokens: ["き", "よ", "う"]
	})
	assert.equal(yoonMissing.selectedForConfiguration, false)
	const yoonSelected = resolveEligibility("きょう", {
		kanaType: "hiragana",
		selectedCanonicalTokens: ["きょ", "う"]
	})
	assert.equal(yoonSelected.selectedForConfiguration, true)
})

test("applies Hiragana, Katakana, and Both Kana script semantics", () => {
	const hiragana = resolveEligibility("あまり", {
		kanaType: "hiragana",
		selectedCanonicalTokens: ["あ", "ま", "り"]
	})
	assert.equal(hiragana.selectedForConfiguration, true)
	const katakana = resolveEligibility("ホテル", {
		kanaType: "katakana",
		selectedCanonicalTokens: ["ホ", "テ", "ル"]
	})
	assert.equal(katakana.selectedForConfiguration, true)
	const wrongScript = resolveEligibility("あまり", {
		kanaType: "katakana",
		selectedCanonicalTokens: ["あ", "ま", "り"]
	})
	assert.equal(wrongScript.selectedForConfiguration, false)
	const mixed = resolveEligibility("あア", {
		kanaType: "both",
		selectedCanonicalTokens: ["あ"]
	})
	assert.equal(mixed.classification, "mixed-kana")
	assert.equal(mixed.selectedForConfiguration, true)
	const prolonged = resolveEligibility("サー", {
		kanaType: "katakana",
		selectedCanonicalTokens: ["サ"]
	})
	assert.equal(prolonged.selectedForConfiguration, true)
	assert.equal(resolveEligibility("ー").acceptedForArtifact, false)
	assertHasDiagnostic(resolveEligibility("ー"), "invalid-prolonged-mark")
})

test("keeps the Phase 1 romaji policy bounded and token-aware", () => {
	assert.equal(normalizePronunciationKana("コーヒー"), "こーひー")
	assert.equal(canonicalRomaji("しゃしん"), "shashin")
	assert.equal(canonicalRomaji("きって"), "kitte")
	assert.equal(canonicalRomaji("しんよう"), "shin'you")
	assert.equal(canonicalRomaji("コーヒー"), "koohii")
	assert.equal(canonicalRomaji("サッカー"), "sakkaa")
	for (const [kana, answers] of [
		["し", ["shi", "si"]],
		["ち", ["chi", "ti"]],
		["つ", ["tsu", "tu"]],
		["ふ", ["fu", "hu"]],
		["じ", ["ji", "zi"]]
	]) {
		for (const answer of answers) {
			assert.equal(isRomajiWordAnswer(answer, kana), true, answer)
		}
	}
})

test("validates しゃしん, capitalization, and surrounding whitespace", () => {
	for (const answer of ["shashin", "syashin", "shasin", " SHASHIN "]) {
		assert.equal(isRomajiWordAnswer(answer, "しゃしん"), true, answer)
	}
	assert.equal(isRomajiWordAnswer("sashin", "しゃしん"), false)
})

test("validates きって and small-tsu consonant doubling", () => {
	assert.equal(isRomajiWordAnswer("kitte", "きって"), true)
	assert.equal(isRomajiWordAnswer("kite", "きって"), false)
})

test("validates しんよう without accepting a different mora sequence", () => {
	for (const answer of ["shin'you", "shinyou", "sinyou"]) {
		assert.equal(isRomajiWordAnswer(answer, "しんよう"), true, answer)
	}
	for (const answer of ["shinnyou", "shinyo", "しんよう", "shinyō"]) {
		assert.equal(isRomajiWordAnswer(answer, "しんよう"), false, answer)
	}
})

test("validates prolonged katakana vowels and rejects macrons", () => {
	assert.equal(isRomajiWordAnswer("koohii", "コーヒー"), true)
	assert.equal(isRomajiWordAnswer("KOOHII", "コーヒー"), true)
	assert.equal(isRomajiWordAnswer("kōhī", "コーヒー"), false)
	assert.equal(isRomajiWordAnswer("sakkaa", "サッカー"), true)
	assert.equal(isRomajiWordAnswer("saka", "サッカー"), false)
})

test("rejects internal whitespace and non-romaji answers", () => {
	assert.equal(isRomajiWordAnswer("sha shin", "しゃしん"), false)
	assert.equal(isRomajiWordAnswer("しゃしん", "しゃしん"), false)
	assert.equal(isRomajiWordAnswer("shashin", "しゃしん"), true)
})

test("maps exact kana source surfaces to the corresponding JMdict kana text", () => {
	const kanaForm = form("1001", "せんせい", "せんせい")
	const kanjiForm = form("1002", "先生", "せんせい")
	const source = sourceRow("せんせい")
	const result = mapOpenJlptRows(
		[source],
		[lexeme(kanaForm), lexeme(kanjiForm)]
	)
	assert.equal(result.approvedMappings.length, 1)
	assert.equal(result.approvedMappings[0].form.formId, kanaForm.formId)
	assert.equal(result.decisions[0].sourceRecordHash, source.sourceRecordHash)
})

test("never synthesizes a kana surface from a Kanji source surface", () => {
	const result = mapOpenJlptRows(
		[
			sourceRow("先生", "せんせい"),
			sourceRow("食べる", "たべる"),
			sourceRow("お茶", "おちゃ")
		],
		[
			lexeme(form("2001", "先生", "せんせい")),
			lexeme(form("2002", "食べる", "たべる")),
			lexeme(form("2003", "お茶", "おちゃ")),
			lexeme(form("2004", "せんせい", "せんせい"))
		]
	)
	assert.equal(result.approvedMappings.length, 0)
	assert.equal(
		result.decisions.filter((decision) => decision.status === "invalid-surface")
			.length,
		3
	)
})

test("enforces unrestricted and restricted spelling-reading relationships", () => {
	const unrestricted = form("3001", "はし", "はし")
	const restricted = form("3002", "はし", "はし", {
		appliesToWritten: ["はし"],
		appliesToReading: ["はし"]
	})
	const invalidRestriction = form("3003", "はし", "はし", {
		appliesToWritten: ["ほし"],
		appliesToReading: ["はし"]
	})
	assert.equal(restrictionsAllow(restricted, sourceRow("はし")), true)
	assert.equal(restrictionsAllow(invalidRestriction, sourceRow("はし")), false)
	const result = mapOpenJlptRows(
		[sourceRow("はし")],
		[lexeme(unrestricted), lexeme(restricted), lexeme(invalidRestriction)]
	)
	assert.equal(result.decisions[0].status, "ambiguous")
	const restrictedOnly = mapOpenJlptRows(
		[sourceRow("はし")],
		[lexeme(invalidRestriction)]
	)
	assert.equal(restrictedOnly.decisions[0].status, "invalid-restriction")
})

test("does not create a Cartesian product of written forms and readings", () => {
	const forms = [
		form("3101", "はし", "はし"),
		form("3101", "はじ", "はじ"),
		form("3102", "はじ", "はし")
	]
	const result = mapOpenJlptRows(
		[sourceRow("はし", "はじ")],
		[lexeme(...forms)]
	)
	assert.equal(result.decisions[0].status, "unmatched")
})

test("keeps duplicate rows as audit decisions while collapsing one membership", () => {
	const canonical = lexeme(form("4001", "あまり"))
	const rows = [sourceRow("あまり"), sourceRow("あまり")]
	const result = mapOpenJlptRows(rows, [canonical])
	assert.equal(result.approvedMappings.length, 1)
	assert.equal(result.decisions[0].status, "exact")
	assert.equal(result.decisions[1].status, "duplicate")
	assert.equal(emit(result).words.length, 1)
})

test("keeps same-reading words and same-surface readings distinct", () => {
	const sameReading = mapOpenJlptRows(
		[sourceRow("はし", "はし"), sourceRow("はじ", "はし")],
		[lexeme(form("4101", "はし", "はし"), form("4101", "はじ", "はし"))]
	)
	assert.equal(sameReading.approvedMappings.length, 2)
	assert.notEqual(
		sameReading.approvedMappings[0].form.formId,
		sameReading.approvedMappings[1].form.formId
	)

	const sameSurface = mapOpenJlptRows(
		[sourceRow("かみ", "かみ"), sourceRow("かみ", "かむ")],
		[lexeme(form("4102", "かみ", "かみ"), form("4102", "かみ", "かむ"))]
	)
	assert.equal(sameSurface.approvedMappings.length, 2)
	assert.notEqual(
		sameSurface.approvedMappings[0].form.formId,
		sameSurface.approvedMappings[1].form.formId
	)
})

test("reports ambiguous candidates without silently choosing a lexeme", () => {
	const source = sourceRow("きれい")
	const result = mapOpenJlptRows(
		[source],
		[lexeme(form("5001", "きれい")), lexeme(form("5002", "きれい"))]
	)
	assert.equal(result.approvedMappings.length, 0)
	assert.equal(result.decisions[0].status, "ambiguous")
	assertHasDiagnostic(result, "ambiguous")
})

test("reports unmatched and conflicting collection membership", () => {
	const unmatched = mapOpenJlptRows(
		[sourceRow("ホテル")],
		[lexeme(form("6001", "あまり"))]
	)
	assert.equal(unmatched.decisions[0].status, "unmatched")
	assertHasDiagnostic(unmatched, "unmatched")

	const canonical = lexeme(form("6002", "あまり"))
	const conflict = mapOpenJlptRows(
		[
			sourceRow("あまり", "あまり", { sourceLevel: "N5" }),
			sourceRow("あまり", "あまり", { sourceLevel: "N4" })
		],
		[canonical]
	)
	assert.equal(conflict.decisions[0].status, "exact")
	assert.equal(conflict.decisions[1].status, "conflicting-membership")
	assertHasDiagnostic(conflict, "conflicting-membership")
})

test("validates and applies a reviewed manual override", () => {
	const first = form("7001", "きれい")
	const second = form("7002", "きれい")
	const source = sourceRow("きれい")
	const override = manualOverride(source, second.formId)
	assert.deepEqual(validateManualOverride(override, [first, second]), [])
	const result = mapOpenJlptRows(
		[source],
		[lexeme(first), lexeme(second)],
		[override]
	)
	assert.equal(result.approvedMappings.length, 1)
	assert.equal(result.approvedMappings[0].form.formId, second.formId)
	assert.equal(result.approvedMappings[0].decision.status, "manual-override")
})

test("rejects invalid and duplicate manual overrides", () => {
	const first = form("7101", "きれい")
	const source = sourceRow("きれい")
	const invalid = manualOverride(source, "jmdict:missing", {
		schemaVersion: 999,
		reason: "",
		reviewer: "",
		version: ""
	})
	const result = mapOpenJlptRows([source], [lexeme(first)], [invalid])
	assert.equal(result.approvedMappings.length, 0)
	assert.equal(result.decisions[0].status, "invalid-manual-override")
	assertHasDiagnostic(result, "invalid-manual-override")
	assert.ok(validateManualOverride(invalid, [first]).length > 0)
	const malformed = {
		schemaVersion: 1,
		sourceRowKey: source.sourceRowKey
	}
	const malformedResult = mapOpenJlptRows(
		[source],
		[lexeme(first)],
		[malformed]
	)
	assert.equal(malformedResult.decisions[0].status, "invalid-manual-override")

	const duplicate = manualOverride(source, first.formId, {
		overrideId: "override:duplicate"
	})
	const duplicateResult = mapOpenJlptRows(
		[source],
		[lexeme(first)],
		[manualOverride(source, first.formId), duplicate]
	)
	assert.equal(duplicateResult.decisions[0].status, "invalid-manual-override")
})

test("merges different collection memberships without merging words", () => {
	const canonical = lexeme(form("7201", "あまり"))
	const result = mapOpenJlptRows(
		[
			sourceRow("あまり", "あまり", {
				collectionId: "jlpt-n5-estimated",
				sourceLevel: "N5"
			}),
			sourceRow("あまり", "あまり", {
				collectionId: "topic-food-synthetic",
				sourceLevel: "synthetic"
			})
		],
		[canonical]
	)
	const artifact = emit(result)
	assert.equal(artifact.words.length, 1)
	assert.deepEqual(
		new Set(artifact.words[0].collectionIds),
		new Set(["jlpt-n5-estimated", "topic-food-synthetic"])
	)
})

test("keeps identity stable across source reordering and safe against separators", () => {
	const first = form("8001", "ホテル")
	const second = form("8002", "あまり")
	const rows = [sourceRow("ホテル"), sourceRow("あまり")]
	const firstArtifact = emit(
		mapOpenJlptRows(rows, [lexeme(first), lexeme(second)])
	)
	const secondArtifact = emit(
		mapOpenJlptRows([...rows].reverse(), [lexeme(first), lexeme(second)])
	)
	assert.deepEqual(firstArtifact, secondArtifact)
	assert.notEqual(
		createFormId("jmdict:a", "b\0c", "d"),
		createFormId("jmdict:a", "b", "c\0d")
	)
	assert.notEqual(
		createCollectionMembershipKey("a\0b", "c"),
		createCollectionMembershipKey("a", "b\0c")
	)
	assert.equal(
		createReadingCardId(firstArtifact.words[0].formId),
		firstArtifact.words[0].cardId
	)
})

test("emits only approved records and keeps diagnostics out of the browser artifact", () => {
	const exact = mapOpenJlptRows(
		[sourceRow("あまり"), sourceRow("きれい"), sourceRow("ホテル")],
		[lexeme(form("8101", "あまり"))]
	)
	const artifact = emit(exact)
	assert.equal(artifact.words.length, 1)
	assert.equal(artifact.schemaVersion, WORD_ARTIFACT_SCHEMA_VERSION)
	assert.equal(artifact.contentVersion, "synthetic-phase-0-v1")
	assert.deepEqual(Object.keys(artifact).sort(), [
		"contentVersion",
		"generatedAt",
		"schemaVersion",
		"words"
	])
	assert.equal("diagnostics" in artifact, false)
	assert.deepEqual(validateRuntimeArtifact(artifact), [])
})

test("excludes forbidden and unsupported records from release input", () => {
	const forbidden = mapOpenJlptRows(
		[sourceRow("先生", "せんせい")],
		[lexeme(form("8201", "先生", "せんせい"))]
	)
	const unsupported = mapOpenJlptRows(
		[sourceRow("ティ")],
		[lexeme(form("8202", "ティ", "てぃ"))]
	)
	assert.equal(forbidden.approvedMappings.length, 0)
	assert.equal(unsupported.approvedMappings.length, 0)
	assert.equal(emit(forbidden).words.length, 0)
	assert.equal(emit(unsupported).words.length, 0)
})
