import type { KanaReadingWordV1 } from "./contracts.ts"
import { filterEligibleWords, type WordsConfig } from "./config.ts"
import {
	WORD_SESSION_MAX_RETRIES,
	WORD_SESSION_MAX_WORDS,
	type WordAnswerResult,
	type WordsSessionConfig,
	type WordsSessionRecord,
	type WordsSessionState,
	type WordsSessionSummary
} from "./session-types.ts"

function shuffle<T>(values: readonly T[], rng: () => number): T[] {
	const shuffled = [...values]
	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(rng() * (index + 1))
		;[shuffled[index], shuffled[swapIndex]] = [
			shuffled[swapIndex],
			shuffled[index]
		]
	}
	return shuffled
}

function uniqueWords(words: readonly KanaReadingWordV1[]): KanaReadingWordV1[] {
	const seen = new Set<string>()
	return words.filter((word) => {
		if (seen.has(word.formId)) return false
		seen.add(word.formId)
		return true
	})
}

export function selectSessionWords(
	words: readonly KanaReadingWordV1[],
	config: WordsConfig,
	rng: () => number = Math.random,
	maxWords = WORD_SESSION_MAX_WORDS
): KanaReadingWordV1[] {
	return shuffle(uniqueWords(filterEligibleWords(words, config)), rng).slice(
		0,
		Math.max(0, maxWords)
	)
}

export function createWordSession(
	words: readonly KanaReadingWordV1[],
	config: WordsConfig,
	contentVersion: string,
	now: () => number = Date.now,
	rng: () => number = Math.random,
	maxWords = WORD_SESSION_MAX_WORDS
): WordsSessionState | null {
	const selected = selectSessionWords(words, config, rng, maxWords)
	if (selected.length === 0) return null

	const timestamp = now()
	const sessionConfig: WordsSessionConfig = {
		collectionId: config.collectionId,
		script: config.script,
		selectedCanonicalTokens: [...config.selectedCanonicalTokens]
	}
	return {
		schemaVersion: 1,
		status: "active",
		contentVersion,
		config: sessionConfig,
		startedAt: timestamp,
		lastPresentedAt: timestamp,
		queue: selected.map((word) => word.formId),
		records: selected.map(
			(word): WordsSessionRecord => ({
				wordId: word.formId,
				responses: [],
				retryCount: 0,
				status: "pending"
			})
		),
		maxWords: selected.length
	}
}

function cloneRecords(
	records: readonly WordsSessionRecord[]
): WordsSessionRecord[] {
	return records.map((record) => ({
		...record,
		responses: [...record.responses]
	}))
}

export function answerWordSession(
	state: WordsSessionState,
	wordId: string,
	answer: string,
	correct: boolean,
	now: () => number = Date.now
): WordAnswerResult {
	if (state.status !== "active") {
		throw new Error("Cannot answer an inactive Words session.")
	}
	if (state.queue[0] !== wordId) {
		throw new Error("The answered word is not the current session question.")
	}

	const timestamp = now()
	const records = cloneRecords(state.records)
	const record = records.find((item) => item.wordId === wordId)
	if (!record) throw new Error("The answered word is not in the session.")

	record.responses = [
		...record.responses,
		{
			answer,
			correct,
			durationMs: Math.max(0, timestamp - state.lastPresentedAt),
			at: timestamp
		}
	]

	const queue = state.queue.slice(1)
	let willRetry = false
	if (correct) {
		record.status = "correct"
	} else if (record.retryCount < WORD_SESSION_MAX_RETRIES) {
		record.retryCount += 1
		willRetry = true
		const insertionIndex = queue.length === 0 ? 0 : Math.min(2, queue.length)
		queue.splice(insertionIndex, 0, wordId)
	} else {
		record.status = "incorrect"
	}

	const completed = queue.length === 0
	const nextState: WordsSessionState = {
		...state,
		status: completed ? "completed" : "active",
		finishedAt: completed ? timestamp : undefined,
		lastPresentedAt: timestamp,
		queue,
		records
	}

	return {
		state: nextState,
		outcome: {
			wordId,
			correct,
			willRetry,
			attempts: record.responses.length,
			completed
		}
	}
}

export function finishWordSession(
	state: WordsSessionState,
	now: () => number = Date.now
): WordsSessionState {
	if (state.status !== "active") return state
	return {
		...state,
		status: "abandoned",
		finishedAt: now(),
		queue: []
	}
}

export function getWordsSessionSummary(
	state: WordsSessionState,
	words: readonly KanaReadingWordV1[],
	now: () => number = Date.now
): WordsSessionSummary {
	const surfaces = new Map(words.map((word) => [word.formId, word.surface]))
	const attempted = state.records.filter(
		(record) => record.responses.length > 0
	)
	const firstAttemptCorrect = attempted.filter(
		(record) => record.responses[0]?.correct
	).length
	const totalMistakes = attempted.reduce(
		(total, record) =>
			total + record.responses.filter((response) => !response.correct).length,
		0
	)
	const recoveredOnRetry = attempted.filter(
		(record) =>
			record.responses[0]?.correct === false &&
			record.responses.slice(1).some((response) => response.correct)
	).length
	const durationMs = Math.max(0, (state.finishedAt ?? now()) - state.startedAt)

	return {
		uniqueWordsPracticed: attempted.length,
		firstAttemptCorrect,
		firstAttemptAccuracy:
			attempted.length === 0 ? 0 : firstAttemptCorrect / attempted.length,
		totalMistakes,
		recoveredOnRetry,
		durationSeconds: Math.round(durationMs / 1000),
		remainedIncorrect: state.records
			.filter((record) => record.status === "incorrect")
			.map((record) => surfaces.get(record.wordId) ?? record.wordId)
	}
}
