import { base } from "$app/paths"
import type { KanaReadingArtifactV1, KanaReadingWordV1 } from "./contracts.ts"

export const WORD_ARTIFACT_URL = `${base}/words/kana-reading-v1.json`
export const EXPECTED_WORD_ARTIFACT_COUNT = 101

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function validateRuntimeArtifactShape(
	value: unknown,
	expectedWordCount = EXPECTED_WORD_ARTIFACT_COUNT
): value is KanaReadingArtifactV1 {
	if (!isRecord(value)) return false
	if (value.schemaVersion !== 1) return false
	if (typeof value.contentVersion !== "string" || !value.contentVersion)
		return false
	if (typeof value.generatedAt !== "string" || !value.generatedAt) return false
	if (
		typeof value.artifactHash !== "string" ||
		!/^sha256:[0-9a-f]{64}$/.test(value.artifactHash)
	)
		return false
	if (!isRecord(value.sourceManifest) || !isRecord(value.attribution))
		return false
	if (!Array.isArray(value.words) || value.words.length !== expectedWordCount)
		return false

	return value.words.every((word) => {
		if (!isRecord(word)) return false
		return (
			typeof word.formId === "string" &&
			typeof word.cardId === "string" &&
			typeof word.surface === "string" &&
			typeof word.pronunciationKana === "string" &&
			(word.script === "hiragana" ||
				word.script === "katakana" ||
				word.script === "mixed-kana") &&
			Array.isArray(word.surfaceTokens) &&
			Array.isArray(word.requiredCanonicalTokens) &&
			Array.isArray(word.eligibilityRequirements) &&
			word.answerPolicy === "romaji-hepburn-ascii-v1" &&
			typeof word.canonicalAnswer === "string" &&
			Array.isArray(word.collectionIds) &&
			Array.isArray(word.sourceRefs)
		)
	})
}

export async function loadKanaReadingArtifact(
	fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): Promise<KanaReadingArtifactV1> {
	const response = await fetcher(WORD_ARTIFACT_URL)
	if (!response.ok) {
		throw new Error(
			`Words vocabulary could not be loaded (HTTP ${response.status}).`
		)
	}
	const value: unknown = await response.json()
	if (!validateRuntimeArtifactShape(value)) {
		throw new Error(
			"Words vocabulary artifact is invalid or has the wrong version."
		)
	}
	return value
}

export function wordById(
	words: readonly KanaReadingWordV1[]
): ReadonlyMap<string, KanaReadingWordV1> {
	return new Map(words.map((word) => [word.formId, word]))
}
