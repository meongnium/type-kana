import { persistent } from "$/lib/persistent"
import { createDefaultWordsConfig, type WordsConfig } from "$/lib/words/config"
import type { WordsSessionState } from "$/lib/words/session-types"

export const wordsConfig = persistent<WordsConfig>({
	key: "words-config-v1",
	storage_type: "sessionStorage",
	start_value: createDefaultWordsConfig()
})

export const wordsSession = persistent<WordsSessionState | null>({
	key: "words-session-v1",
	storage_type: "sessionStorage",
	start_value: null
})
