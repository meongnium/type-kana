import type { KanaReadingWordV1, KanaType } from "./contracts.ts"

export const WORD_SESSION_SCHEMA_VERSION = 1 as const
export const WORD_SESSION_MAX_WORDS = 20 as const
export const WORD_SESSION_MAX_RETRIES = 2 as const

export interface WordsSessionConfig {
	collectionId: string
	script: KanaType
	selectedCanonicalTokens: string[]
}

export interface WordResponse {
	answer: string
	correct: boolean
	durationMs: number
	at: number
}

export interface WordsSessionRecord {
	wordId: string
	responses: WordResponse[]
	retryCount: number
	status: "pending" | "correct" | "incorrect"
}

export interface WordsSessionState {
	schemaVersion: typeof WORD_SESSION_SCHEMA_VERSION
	status: "active" | "completed" | "abandoned"
	contentVersion: string
	config: WordsSessionConfig
	startedAt: number
	finishedAt?: number
	lastPresentedAt: number
	queue: string[]
	records: WordsSessionRecord[]
	maxWords: number
}

export interface WordAnswerOutcome {
	wordId: string
	correct: boolean
	willRetry: boolean
	attempts: number
	completed: boolean
}

export interface WordAnswerResult {
	state: WordsSessionState
	outcome: WordAnswerOutcome
}

export interface WordsSessionSummary {
	uniqueWordsPracticed: number
	firstAttemptCorrect: number
	firstAttemptAccuracy: number
	totalMistakes: number
	recoveredOnRetry: number
	durationSeconds: number
	remainedIncorrect: string[]
}

export type WordSessionWord = Pick<
	KanaReadingWordV1,
	"formId" | "surface" | "pronunciationKana"
>
