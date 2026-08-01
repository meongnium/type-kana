export const WORD_ARTIFACT_SCHEMA_VERSION = 1 as const
export const WORD_COLLECTION_N5 = "jlpt-n5-estimated" as const
export const WORD_ANSWER_POLICY = "romaji-hepburn-ascii-v1" as const

export type SourceName = "jmdict-simplified" | "openjlpt"

export type KanaType = "hiragana" | "katakana" | "both"

export type WordScript = "hiragana" | "katakana" | "mixed-kana"

export type ScriptClassification =
	| WordScript
	| "contains-kanji"
	| "unsupported/other"

export interface SourcePin {
	source: SourceName
	releaseOrCommit: string
	assetFilename: string
	sha256: string
	importerVersion?: string
	generatedAt?: string
}

export interface FormRestrictions {
	appliesToWritten: readonly string[]
	appliesToReading: readonly string[]
}

export interface CanonicalForm {
	formId: string
	lexemeId: string
	writtenSurface: string
	reading: string
	writtenKind: "kana" | "non-kana"
	restrictions: FormRestrictions
}

export interface ImportSense {
	sourceOrdinal: number
	glosses: readonly string[]
	partsOfSpeech: readonly string[]
	fingerprint: string
}

export interface CanonicalLexeme {
	lexemeId: string
	entSeq: string
	forms: readonly CanonicalForm[]
	senses: readonly ImportSense[]
	sourcePin: SourcePin
}

export interface OpenJlptSourceRow {
	sourceRowKey: string
	sourceRecordHash: string
	collectionId: string
	sourceLevel: string
	sourceWrittenSurface: string
	sourceReading: string
	sourcePin: SourcePin
	sourceLocator?: string
}

export type MappingStatus =
	| "exact"
	| "manual-override"
	| "duplicate"
	| "ambiguous"
	| "unmatched"
	| "unsupported-selector-mora"
	| "invalid-surface"
	| "invalid-restriction"
	| "conflicting-membership"

export type MappingApproval = "approved" | "pending" | "rejected"

export interface MappingDecision {
	sourceRowKey: string
	status: MappingStatus
	approval: MappingApproval
	candidateFormIds: readonly string[]
	selectedFormId?: string
	diagnosticCodes: readonly string[]
	overrideId?: string
	duplicateOfSourceRowKey?: string
}

export interface ManualOverride {
	overrideId: string
	sourceRowKey: string
	selectedFormId: string
	reason: string
	reviewer: string
	version: string
}

export type DiagnosticSeverity = "info" | "warning" | "error"

export interface ImportDiagnostic {
	code: string
	severity: DiagnosticSeverity
	message: string
	sourceRowKey?: string
	formIds?: readonly string[]
}

export type EligibilityRequirement =
	| {
			kind: "kana-token"
			surfaceToken: string
			canonicalToken: string
	  }
	| {
			kind: "small-tsu"
			surfaceToken: "っ" | "ッ"
			canonicalToken: "つ"
	  }
	| {
			kind: "prolonged-mark"
			surfaceToken: "ー"
			requiresPrevious: true
	  }

export interface KanaReadingWordV1 {
	formId: string
	cardId: string
	surface: string
	pronunciationKana: string
	script: WordScript
	surfaceTokens: readonly string[]
	requiredCanonicalTokens: readonly string[]
	eligibilityRequirements: readonly EligibilityRequirement[]
	answerPolicy: typeof WORD_ANSWER_POLICY
	canonicalAnswer: string
	collectionIds: readonly string[]
	sourceRefs: readonly string[]
}

export interface KanaReadingArtifactV1 {
	schemaVersion: typeof WORD_ARTIFACT_SCHEMA_VERSION
	contentVersion: string
	generatedAt: string
	words: readonly KanaReadingWordV1[]
}
