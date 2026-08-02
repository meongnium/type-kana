import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { isCorrectAnswer } from "../../src/lib/answer.ts"
import { filterEligibleWords } from "../../src/lib/words/config.ts"
import { WORD_COLLECTION_N5 } from "../../src/lib/words/contracts.ts"
import { isRomajiWordAnswer } from "../../src/lib/words/romaji.ts"
import {
	answerWordSession,
	createWordSession,
	getWordsSessionSummary,
	selectSessionWords
} from "../../src/lib/words/session.ts"
import { SELECTOR_HIRAGANA_TOKENS } from "../../src/lib/words/inventory.ts"

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../.."
)
const artifact = JSON.parse(
	await readFile(
		path.join(repoRoot, "static", "words", "kana-reading-v1.json"),
		"utf8"
	)
)

function allWordsConfig() {
	const selectedCanonicalTokens = [
		...new Set(artifact.words.flatMap((word) => word.requiredCanonicalTokens))
	]
	return {
		collectionId: WORD_COLLECTION_N5,
		script: "both",
		selectedCanonicalTokens
	}
}

test("loads and validates the 101-word production artifact", () => {
	assert.equal(artifact.schemaVersion, 1)
	assert.equal(artifact.contentVersion, "words-kana-reading-v1-n5-101")
	assert.match(artifact.artifactHash, /^sha256:[0-9a-f]{64}$/)
	assert.equal(artifact.words.length, 101)
	assert.equal(artifact.sourceManifest.sources.length, 2)
	assert.equal(artifact.attribution.sources.length, 3)

	const formIds = new Set()
	const cardIds = new Set()
	for (const word of artifact.words) {
		assert.ok(!formIds.has(word.formId))
		assert.ok(!cardIds.has(word.cardId))
		formIds.add(word.formId)
		cardIds.add(word.cardId)
		assert.deepEqual(
			Object.keys(word).sort(),
			[
				"answerPolicy",
				"canonicalAnswer",
				"cardId",
				"collectionIds",
				"eligibilityRequirements",
				"formId",
				"pronunciationKana",
				"requiredCanonicalTokens",
				"script",
				"sourceRefs",
				"surface",
				"surfaceTokens"
			].sort()
		)
		assert.equal(word.collectionIds[0], WORD_COLLECTION_N5)
		assert.ok(!("senses" in word))
		assert.ok(!("glosses" in word))
		assert.ok(!("diagnostics" in word))
	}
})

test("filters artifact words by script and keeps Both Kana additive", () => {
	const config = allWordsConfig()
	const hiragana = filterEligibleWords(artifact.words, {
		...config,
		script: "hiragana"
	})
	const katakana = filterEligibleWords(artifact.words, {
		...config,
		script: "katakana"
	})
	const both = filterEligibleWords(artifact.words, config)

	assert.ok(hiragana.length > 0)
	assert.ok(katakana.length > 0)
	assert.equal(both.length, hiragana.length + katakana.length)
	assert.ok(hiragana.every((word) => word.script === "hiragana"))
	assert.ok(katakana.every((word) => word.script === "katakana"))
})

test("requires every selected kana token and keeps small-tsu as canonical つ", () => {
	const word = artifact.words.find((item) => item.surface === "あさって")
	assert.ok(word)
	assert.deepEqual(word.requiredCanonicalTokens, ["あ", "さ", "つ", "て"])

	const complete = {
		...allWordsConfig(),
		script: "hiragana",
		selectedCanonicalTokens: [...word.requiredCanonicalTokens]
	}
	assert.equal(filterEligibleWords([word], complete).length, 1)

	const missingSmallTsu = {
		...complete,
		selectedCanonicalTokens: ["あ", "さ", "て"]
	}
	assert.equal(filterEligibleWords([word], missingSmallTsu).length, 0)
})

test("selects at most 20 unique eligible words", () => {
	const selected = selectSessionWords(
		artifact.words,
		allWordsConfig(),
		() => 0.5
	)
	assert.equal(selected.length, 20)
	assert.equal(new Set(selected.map((word) => word.formId)).size, 20)
})

test("reinserts a wrong word later when another word is available", () => {
	const selected = selectSessionWords(
		artifact.words,
		allWordsConfig(),
		() => 0.1,
		3
	)
	const nowValues = [1000]
	const session = createWordSession(
		selected,
		allWordsConfig(),
		artifact.contentVersion,
		() => nowValues[0],
		() => 0.1,
		3
	)
	assert.ok(session)
	const first = session.queue[0]
	const second = session.queue[1]
	const result = answerWordSession(session, first, "wrong", false, () => 1100)
	assert.equal(result.outcome.willRetry, true)
	assert.equal(result.state.queue[0], second)
	assert.equal(result.state.queue.at(-1), first)
})

test("allows at most two retries before marking a word incorrect", () => {
	const session = createWordSession(
		artifact.words,
		allWordsConfig(),
		artifact.contentVersion,
		() => 1000,
		() => 0.2,
		1
	)
	assert.ok(session)
	const wordId = session.queue[0]
	const first = answerWordSession(session, wordId, "x", false, () => 1100)
	assert.equal(first.outcome.willRetry, true)
	const second = answerWordSession(first.state, wordId, "x", false, () => 1200)
	assert.equal(second.outcome.willRetry, true)
	const third = answerWordSession(second.state, wordId, "x", false, () => 1300)
	assert.equal(third.outcome.willRetry, false)
	assert.equal(third.state.status, "completed")
	assert.equal(third.state.records[0].retryCount, 2)
	assert.equal(third.state.records[0].status, "incorrect")
})

test("integrates the word session with romaji-only validation", () => {
	const session = createWordSession(
		artifact.words,
		allWordsConfig(),
		artifact.contentVersion,
		() => 1000,
		() => 0.3,
		1
	)
	assert.ok(session)
	const word = artifact.words.find((item) => item.formId === session.queue[0])
	assert.ok(word)
	assert.equal(
		isRomajiWordAnswer(word.canonicalAnswer, word.pronunciationKana),
		true
	)
	assert.equal(isRomajiWordAnswer(word.surface, word.pronunciationKana), false)

	const correct = answerWordSession(
		session,
		word.formId,
		word.canonicalAnswer,
		true,
		() => 1100
	)
	assert.equal(correct.outcome.correct, true)
	assert.equal(correct.state.status, "completed")
})

test("computes summary metrics from first attempts and retries", () => {
	const selected = selectSessionWords(
		artifact.words,
		allWordsConfig(),
		() => 0.4,
		3
	)
	const session = createWordSession(
		selected,
		allWordsConfig(),
		artifact.contentVersion,
		() => 1000,
		() => 0.4,
		3
	)
	assert.ok(session)
	const first = session.queue[0]
	let state = answerWordSession(
		session,
		first,
		"correct",
		true,
		() => 2000
	).state
	const second = state.queue[0]
	state = answerWordSession(state, second, "wrong", false, () => 3000).state
	const third = state.queue[0]
	state = answerWordSession(state, third, "correct", true, () => 4000).state
	const retry = state.queue[0]
	state = answerWordSession(state, retry, "correct", true, () => 5000).state

	const summary = getWordsSessionSummary(state, artifact.words, () => 5000)
	assert.equal(summary.uniqueWordsPracticed, 3)
	assert.equal(summary.firstAttemptCorrect, 2)
	assert.equal(summary.firstAttemptAccuracy, 2 / 3)
	assert.equal(summary.totalMistakes, 1)
	assert.equal(summary.recoveredOnRetry, 1)
	assert.equal(summary.durationSeconds, 4)
	assert.deepEqual(summary.remainedIncorrect, [])
})

test("returns no session when the configuration has no eligible words", () => {
	const emptyConfig = {
		...allWordsConfig(),
		selectedCanonicalTokens: [],
		script: "hiragana"
	}
	assert.equal(
		createWordSession(
			artifact.words,
			emptyConfig,
			artifact.contentVersion,
			() => 1000
		),
		null
	)
	assert.equal(filterEligibleWords(artifact.words, emptyConfig).length, 0)
})

test("validates the bounded romaji policy for the required word examples", () => {
	const accepted = [
		["しゃしん", "shashin"],

		["きって", "kitte"],
		["しんよう", "shin'you"],
		["しんよう", "shinyou"],
		["しんよう", "sinyou"],
		["コーヒー", "koohii"],
		["サッカー", "sakkaa"]
	]
	for (const [kana, answer] of accepted) {
		assert.equal(isRomajiWordAnswer(answer, kana), true, kana + " " + answer)
	}

	const rejected = [
		["しゃしん", "しゃしん"],
		["きって", "ki tte"],
		["しんよう", "shinnyou"],
		["しんよう", "shinyo"],
		["しんよう", "しんよう"],
		["コーヒー", "kōhī"],
		["サッカー", "sakkā"],
		["サッカー", "sakka a"]
	]
	for (const [kana, answer] of rejected) {
		assert.equal(isRomajiWordAnswer(answer, kana), false, kana + " " + answer)
	}

	assert.equal(isRomajiWordAnswer(" SHASHIN ", "しゃしん"), true)
	assert.equal(isRomajiWordAnswer("shin you", "しんよう"), false)
})

test("smoke-tests the unchanged Character Practice answer helper", () => {
	assert.equal(isCorrectAnswer("a", "あ"), true)
	assert.equal(isCorrectAnswer("x", "あ"), false)
})

test("selector inventory remains available to Character Practice", () => {
	assert.ok(SELECTOR_HIRAGANA_TOKENS.includes("きょ"))
})
