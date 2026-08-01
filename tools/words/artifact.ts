import {
	WORD_ANSWER_POLICY,
	WORD_ARTIFACT_SCHEMA_VERSION
} from "../../src/lib/words/contracts.ts"
import type {
	KanaReadingArtifactV1,
	KanaReadingWordV1
} from "../../src/lib/words/contracts.ts"
import { resolveEligibility } from "../../src/lib/words/eligibility.ts"
import { canonicalRomaji } from "../../src/lib/words/romaji.ts"
import {
	createCollectionMembershipKey,
	createFormId,
	createReadingCardId
} from "./identity.ts"
import type { ApprovedWordMapping } from "./mapping.ts"

export interface ArtifactCoverageBaseline {
	minimumWordCount: number
	requiredFormIds?: readonly string[]
}

export interface ArtifactEmitOptions {
	contentVersion: string
	generatedAt: string
	coverageBaseline?: ArtifactCoverageBaseline
}

export class ArtifactReleaseError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "ArtifactReleaseError"
	}
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new ArtifactReleaseError(message)
}

export function validateRuntimeArtifact(
	artifact: KanaReadingArtifactV1
): readonly string[] {
	const errors: string[] = []
	if (artifact.schemaVersion !== WORD_ARTIFACT_SCHEMA_VERSION) {
		errors.push("invalid-schema-version")
	}
	if (!artifact.contentVersion || !artifact.generatedAt) {
		errors.push("missing-artifact-version")
	}
	const memberships = new Set<string>()
	const formIds = new Set<string>()

	for (const word of artifact.words) {
		if (!word.surface || !word.pronunciationKana) errors.push("missing-surface")
		if (word.answerPolicy !== WORD_ANSWER_POLICY) {
			errors.push(`unsupported-answer-policy:${word.formId}`)
		}
		const eligibility = resolveEligibility(word.surface)
		if (!eligibility.acceptedForArtifact) {
			errors.push(`forbidden-surface-or-token:${word.formId}`)
		}
		if (
			word.surfaceTokens.join("\0") !== eligibility.surfaceTokens.join("\0")
		) {
			errors.push(`surface-token-mismatch:${word.formId}`)
		}
		if (
			word.requiredCanonicalTokens.join("\0") !==
			eligibility.requiredCanonicalTokens.join("\0")
		) {
			errors.push(`eligibility-mismatch:${word.formId}`)
		}
		try {
			if (word.canonicalAnswer !== canonicalRomaji(word.pronunciationKana)) {
				errors.push(`canonical-answer-mismatch:${word.formId}`)
			}
		} catch {
			errors.push(`unsupported-pronunciation:${word.formId}`)
		}
		if (formIds.has(word.formId))
			errors.push(`duplicate-form-id:${word.formId}`)
		formIds.add(word.formId)
		for (const collectionId of word.collectionIds) {
			const key = createCollectionMembershipKey(collectionId, word.formId)
			if (memberships.has(key)) errors.push(`duplicate-membership:${key}`)
			memberships.add(key)
		}
	}

	return errors
}

export function emitRuntimeArtifact(
	approvedMappings: readonly ApprovedWordMapping[],
	options: ArtifactEmitOptions
): KanaReadingArtifactV1 {
	const words: KanaReadingWordV1[] = []
	const memberships = new Set<string>()
	const formOwners = new Map<string, string>()

	for (const mapping of approvedMappings) {
		assert(
			mapping.decision.approval === "approved",
			`Mapping is not explicitly approved: ${mapping.row.sourceRowKey}`
		)
		assert(
			mapping.decision.selectedFormId === mapping.form.formId,
			`Approved mapping has no matching selected form: ${mapping.row.sourceRowKey}`
		)
		assert(
			mapping.decision.status === "exact" ||
				mapping.decision.status === "manual-override",
			`Mapping status is not releasable: ${mapping.decision.status}`
		)
		assert(
			mapping.form.formId ===
				createFormId(
					mapping.form.lexemeId,
					mapping.form.writtenSurface,
					mapping.form.reading
				),
			`Form ID does not match its canonical identity: ${mapping.form.formId}`
		)
		assert(
			mapping.word.cardId === createReadingCardId(mapping.form.formId),
			`Card ID does not match its form ID: ${mapping.form.formId}`
		)
		assert(
			!formOwners.has(mapping.form.formId) ||
				formOwners.get(mapping.form.formId) === mapping.row.sourceRowKey,
			`Deterministic form ID collision: ${mapping.form.formId}`
		)

		for (const collectionId of mapping.word.collectionIds) {
			const membershipKey = createCollectionMembershipKey(
				collectionId,
				mapping.form.formId
			)
			assert(
				!memberships.has(membershipKey),
				`Duplicate runtime membership: ${membershipKey}`
			)
			memberships.add(membershipKey)
		}

		const word = {
			...mapping.word,
			canonicalAnswer: canonicalRomaji(mapping.pronunciationKana),
			pronunciationKana: mapping.pronunciationKana.normalize("NFKC")
		}
		formOwners.set(mapping.form.formId, mapping.row.sourceRowKey)
		words.push(word)
	}

	words.sort((a, b) => a.formId.localeCompare(b.formId))
	const artifact: KanaReadingArtifactV1 = {
		schemaVersion: WORD_ARTIFACT_SCHEMA_VERSION,
		contentVersion: options.contentVersion,
		generatedAt: options.generatedAt,
		words
	}

	const errors = validateRuntimeArtifact(artifact)
	assert(
		errors.length === 0,
		`Artifact schema validation failed: ${errors.join(", ")}`
	)
	if (options.coverageBaseline) {
		assert(
			artifact.words.length >= options.coverageBaseline.minimumWordCount,
			"Artifact coverage regressed below the approved minimum."
		)
		for (const formId of options.coverageBaseline.requiredFormIds ?? []) {
			assert(
				artifact.words.some((word) => word.formId === formId),
				`Artifact coverage is missing approved form: ${formId}`
			)
		}
	}

	return artifact
}
