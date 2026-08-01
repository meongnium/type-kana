import {
	WORD_ANSWER_POLICY,
	WORD_ARTIFACT_SCHEMA_VERSION,
	WORD_MAPPING_SCHEMA_VERSION
} from "../../src/lib/words/contracts.ts"
import type {
	KanaReadingArtifactV1,
	KanaReadingWordV1
} from "../../src/lib/words/contracts.ts"
import { resolveEligibility } from "../../src/lib/words/eligibility.ts"
import {
	canonicalRomaji,
	normalizePronunciationKana
} from "../../src/lib/words/romaji.ts"
import {
	createCollectionMembershipKey,
	createFormId,
	createReadingCardId,
	encodeIdentityParts
} from "./identity.ts"
import { restrictionsAllow, type ApprovedWordMapping } from "./mapping.ts"

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

function sameValues(
	left: readonly unknown[],
	right: readonly unknown[]
): boolean {
	return JSON.stringify(left) === JSON.stringify(right)
}

function addError(errors: string[], code: string): void {
	if (!errors.includes(code)) errors.push(code)
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
		if (
			typeof word.formId !== "string" ||
			typeof word.cardId !== "string" ||
			typeof word.surface !== "string" ||
			typeof word.pronunciationKana !== "string" ||
			!Array.isArray(word.surfaceTokens) ||
			!Array.isArray(word.requiredCanonicalTokens) ||
			!Array.isArray(word.eligibilityRequirements) ||
			!Array.isArray(word.collectionIds) ||
			!Array.isArray(word.sourceRefs)
		) {
			errors.push("invalid-runtime-word-shape")
			continue
		}
		if (!word.surface || !word.pronunciationKana)
			addError(errors, "missing-surface")
		if (word.answerPolicy !== WORD_ANSWER_POLICY) {
			addError(errors, "unsupported-answer-policy:" + word.formId)
		}
		if (word.cardId !== createReadingCardId(word.formId)) {
			addError(errors, "invalid-card-id:" + word.formId)
		}
		const eligibility = resolveEligibility(word.surface)
		if (!eligibility.acceptedForArtifact) {
			addError(errors, "forbidden-surface-or-token:" + word.formId)
		}
		if (word.script !== eligibility.classification) {
			addError(errors, "script-mismatch:" + word.formId)
		}
		if (!sameValues(word.surfaceTokens, eligibility.surfaceTokens)) {
			addError(errors, "surface-token-mismatch:" + word.formId)
		}
		if (
			!sameValues(
				word.requiredCanonicalTokens,
				eligibility.requiredCanonicalTokens
			)
		) {
			addError(errors, "eligibility-mismatch:" + word.formId)
		}
		if (
			!sameValues(
				word.eligibilityRequirements,
				eligibility.eligibilityRequirements
			)
		) {
			addError(errors, "eligibility-requirements-mismatch:" + word.formId)
		}
		if (
			word.pronunciationKana !==
			normalizePronunciationKana(word.pronunciationKana)
		) {
			addError(errors, "noncanonical-pronunciation:" + word.formId)
		}
		try {
			if (word.canonicalAnswer !== canonicalRomaji(word.pronunciationKana)) {
				addError(errors, "canonical-answer-mismatch:" + word.formId)
			}
		} catch {
			addError(errors, "unsupported-pronunciation:" + word.formId)
		}
		if (word.collectionIds.length === 0) {
			addError(errors, "missing-collection-membership:" + word.formId)
		}
		const collectionIds = new Set<string>()
		for (const collectionId of word.collectionIds) {
			if (collectionIds.has(collectionId)) {
				addError(errors, "duplicate-word-collection:" + word.formId)
			}
			collectionIds.add(collectionId)
			const key = createCollectionMembershipKey(collectionId, word.formId)
			if (memberships.has(key)) addError(errors, "duplicate-membership:" + key)
			memberships.add(key)
		}
		if (word.sourceRefs.length === 0) {
			addError(errors, "missing-source-reference:" + word.formId)
		}
		const sourceRefs = new Set<string>()
		for (const sourceRef of word.sourceRefs) {
			if (sourceRefs.has(sourceRef)) {
				addError(errors, "duplicate-source-reference:" + word.formId)
			}
			sourceRefs.add(sourceRef)
		}
		if (formIds.has(word.formId))
			addError(errors, "duplicate-form-id:" + word.formId)
		formIds.add(word.formId)
	}

	return errors
}

function assertMappingReleaseIntegrity(mapping: ApprovedWordMapping): void {
	const { decision, row, form, word } = mapping
	assert(
		decision.schemaVersion === WORD_MAPPING_SCHEMA_VERSION,
		"Mapping decision schema is not supported: " + row.sourceRowKey
	)
	assert(
		decision.sourceRowKey === row.sourceRowKey &&
			decision.sourceRecordHash === row.sourceRecordHash,
		"Mapping decision source provenance does not match its row: " +
			row.sourceRowKey
	)
	assert(
		decision.approval === "approved",
		"Mapping is not explicitly approved: " + row.sourceRowKey
	)
	assert(
		decision.selectedFormId === form.formId,
		"Approved mapping has no matching selected form: " + row.sourceRowKey
	)
	assert(
		decision.status === "exact" || decision.status === "manual-override",
		"Mapping status is not releasable: " + decision.status
	)
	assert(
		form.formId ===
			createFormId(form.lexemeId, form.writtenSurface, form.reading),
		"Form ID does not match its canonical identity: " + form.formId
	)
	assert(
		normalize(form.writtenSurface) === normalize(row.sourceWrittenSurface) &&
			normalize(form.reading) === normalize(row.sourceReading),
		"Mapping does not preserve the source spelling-reading pair: " +
			row.sourceRowKey
	)
	assert(
		restrictionsAllow(form, row),
		"Mapping violates canonical form restrictions: " + row.sourceRowKey
	)
	assert(
		word.formId === form.formId,
		"Runtime word form ID does not match its canonical form: " +
			row.sourceRowKey
	)
	assert(
		word.surface === row.sourceWrittenSurface,
		"Runtime surface is not the exact OpenJLPT source surface: " +
			row.sourceRowKey
	)
	assert(
		mapping.pronunciationKana === normalizePronunciationKana(form.reading) &&
			word.pronunciationKana === mapping.pronunciationKana,
		"Runtime pronunciation does not match the canonical reading: " +
			row.sourceRowKey
	)
	const eligibility = resolveEligibility(row.sourceWrittenSurface)
	assert(
		eligibility.acceptedForArtifact,
		"Mapping surface is not eligible for the runtime artifact: " +
			row.sourceRowKey
	)
	assert(
		word.script === eligibility.classification &&
			sameValues(word.surfaceTokens, eligibility.surfaceTokens) &&
			sameValues(
				word.requiredCanonicalTokens,
				eligibility.requiredCanonicalTokens
			) &&
			sameValues(
				word.eligibilityRequirements,
				eligibility.eligibilityRequirements
			),
		"Runtime eligibility metadata does not match the source surface: " +
			row.sourceRowKey
	)
	assert(
		word.cardId === createReadingCardId(form.formId),
		"Card ID does not match its form ID: " + form.formId
	)
	assert(
		Array.isArray(word.collectionIds) &&
			word.collectionIds.length === 1 &&
			word.collectionIds[0] === row.collectionId,
		"Runtime mapping must contribute exactly its source collection: " +
			row.sourceRowKey
	)
	assert(
		Array.isArray(word.sourceRefs) && word.sourceRefs.length > 0,
		"Runtime mapping must retain minimal source references: " + row.sourceRowKey
	)
}

function normalize(value: string): string {
	return value.normalize("NFKC")
}

export function emitRuntimeArtifact(
	approvedMappings: readonly ApprovedWordMapping[],
	options: ArtifactEmitOptions
): KanaReadingArtifactV1 {
	const wordsByForm = new Map<string, KanaReadingWordV1>()
	const memberships = new Set<string>()
	const formOwners = new Map<string, string>()

	for (const mapping of approvedMappings) {
		assertMappingReleaseIntegrity(mapping)
		const { form } = mapping
		const identity = encodeIdentityParts([
			form.lexemeId,
			form.writtenSurface,
			form.reading
		])
		const existingIdentity = formOwners.get(form.formId)
		assert(
			!existingIdentity || existingIdentity === identity,
			"Deterministic form ID collision: " + form.formId
		)
		formOwners.set(form.formId, identity)

		for (const collectionId of mapping.word.collectionIds) {
			const membershipKey = createCollectionMembershipKey(
				collectionId,
				form.formId
			)
			assert(
				!memberships.has(membershipKey),
				"Duplicate runtime membership: " + membershipKey
			)
			memberships.add(membershipKey)
		}

		const canonicalAnswer = canonicalRomaji(mapping.pronunciationKana)
		const existing = wordsByForm.get(form.formId)
		if (!existing) {
			wordsByForm.set(form.formId, {
				...mapping.word,
				canonicalAnswer,
				pronunciationKana: normalizePronunciationKana(mapping.pronunciationKana)
			})
			continue
		}

		assert(
			existing.surface === mapping.word.surface &&
				existing.pronunciationKana ===
					normalizePronunciationKana(mapping.pronunciationKana) &&
				existing.script === mapping.word.script &&
				sameValues(existing.surfaceTokens, mapping.word.surfaceTokens) &&
				sameValues(
					existing.requiredCanonicalTokens,
					mapping.word.requiredCanonicalTokens
				) &&
				sameValues(
					existing.eligibilityRequirements,
					mapping.word.eligibilityRequirements
				),
			"Conflicting runtime records share a form ID: " + form.formId
		)
		wordsByForm.set(form.formId, {
			...existing,
			collectionIds: [...existing.collectionIds, ...mapping.word.collectionIds],
			sourceRefs: [
				...new Set([...existing.sourceRefs, ...mapping.word.sourceRefs])
			]
		})
	}

	const words = [...wordsByForm.values()].sort((a, b) =>
		a.formId.localeCompare(b.formId)
	)
	const artifact: KanaReadingArtifactV1 = {
		schemaVersion: WORD_ARTIFACT_SCHEMA_VERSION,
		contentVersion: options.contentVersion,
		generatedAt: options.generatedAt,
		words
	}

	const errors = validateRuntimeArtifact(artifact)
	assert(
		errors.length === 0,
		"Artifact schema validation failed: " + errors.join(", ")
	)
	if (options.coverageBaseline) {
		assert(
			artifact.words.length >= options.coverageBaseline.minimumWordCount,
			"Artifact coverage regressed below the approved minimum."
		)
		for (const formId of options.coverageBaseline.requiredFormIds ?? []) {
			assert(
				artifact.words.some((word) => word.formId === formId),
				"Artifact coverage is missing approved form: " + formId
			)
		}
	}

	return artifact
}
