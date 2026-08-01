# Words Phase 0

Phase 0 defines the build-time contracts and release gate for the future Words
feature. It does not add a Words route, a browser dataset, a session UI, or
changes to Character Practice.

## Boundary: importer versus browser runtime

The importer-side model is intentionally richer than the browser model. It may
contain:

- canonical JMdict lexemes identified by JMdict ent_seq;
- valid written-surface and pronunciation pairs, including restrictions;
- senses, glosses, parts of speech, and source provenance;
- original OpenJLPT rows and immutable source pins;
- mapping decisions, diagnostics, and reviewed manual overrides.

The versioned importer snapshot contract is WordImporterSnapshotV1 in
src/lib/words/contracts.ts. It is audit data and is not a browser payload.

The Phase 1 runtime contract is KanaReadingArtifactV1. Each runtime word has
only the fields needed for Kana Reading:

- formId and deterministic reading-typing cardId;
- exact source surface text;
- pronunciationKana, normalized to Hiragana for answer validation;
- surfaceTokens preserving the displayed script and mora units;
- requiredCanonicalTokens and eligibilityRequirements;
- script classification, answer policy, canonical answer, collection IDs,
  and minimal source references.

Complete JMdict senses, glosses, POS data, examples, OpenJLPT rows, and import
diagnostics are not shipped in the Phase 1 artifact.

Example runtime record:

```json
{
	"formId": "jmdict-form:sha256:<stable-hash>",
	"cardId": "reading-typing:v1:sha256:<form-hash>",
	"surface": "サッカー",
	"pronunciationKana": "さっかー",
	"script": "katakana",
	"surfaceTokens": ["サ", "ッ", "カ", "ー"],
	"requiredCanonicalTokens": ["さ", "つ", "か"],
	"eligibilityRequirements": [
		{ "kind": "kana-token", "surfaceToken": "サ", "canonicalToken": "さ" },
		{ "kind": "small-tsu", "surfaceToken": "ッ", "canonicalToken": "つ" },
		{ "kind": "kana-token", "surfaceToken": "カ", "canonicalToken": "か" },
		{ "kind": "prolonged-mark", "surfaceToken": "ー", "requiresPrevious": true }
	],
	"answerPolicy": "romaji-hepburn-ascii-v1",
	"canonicalAnswer": "sakkaa",
	"collectionIds": ["jlpt-n5-estimated"],
	"sourceRefs": ["jmdict:<ent_seq>", "openjlpt:<record-hash>"]
}
```

## Source-surface rule

OpenJLPT.word is authoritative for Phase 1 written-surface eligibility.

- A source row with word 先生 and reading せんせい is excluded because its
  source surface contains Kanji.
- A source row with word せんせい may be eligible and maps to the JMdict
  kana text せんせい when that exact spelling-reading relationship exists.
- A source row with 食べる, お茶, or any other Kanji surface is excluded.
- The importer never replaces a Kanji surface with its reading to synthesize a
  new kana display surface.
- JMdict kana elements are matched as canonical written forms when their text
  exactly matches the source surface. Phase 0 does not infer whether a JMdict
  kana element is a spelling or only a reading.

The permitted surface character policy is narrow and explicit:

- selector-derived Hiragana and Katakana tokens from src/lib/db.ts;
- small っ or ッ;
- the prolonged sound mark ー;
- known foreign-combination characters are allowed through surface validation
  only so the tokenizer can report them.

Middle dots, iteration marks, archaic kana not represented by the selector,
standalone unsupported small kana, whitespace, punctuation, Latin letters,
numerals, Kanji, and every other character are rejected. Foreign combinations
such as ティ, ファ, チェ, and ウィ are recognized for diagnostics but are not
eligible for the current selector.

## Tokenization and eligibility

Tokenization and selector eligibility are separate steps.

The tokenizer uses maximal munch and preserves the displayed units:

- きょう becomes きょ, う;
- びょういん becomes びょ, う, い, ん;
- しゃしん becomes しゃ, し, ん;
- きって becomes き, っ, て;
- サッカー becomes サ, ッ, カ, ー.

The eligibility resolver then derives selector requirements:

- っ or ッ remains unchanged in surfaceTokens but requires canonical つ;
- ー is a modifier that requires a preceding selectable mora and is not a
  selectable token;
- foreign combinations, unsupported yōon such as ぢゃ, unsupported small kana,
  and unknown tokens produce diagnostics and are excluded.

The existing selector model stores canonical Hiragana tokens. Katakana
selection is coupled to the same canonical tokens by the existing
game-config/dictionary mapping, so the resolver normalizes selected Katakana
tokens to their Hiragana equivalents. A word still has to satisfy the selected
script type: Hiragana is all Hiragana, Katakana is all Katakana, and Both Kana
allows Hiragana, Katakana, or mixed Kana without Kanji.

## Mapping and identity

JMdict is the canonical lexical source. OpenJLPT contributes collection
membership and an estimated level only; it is not concatenated as a second
canonical vocabulary table.

Only an exact normalized source surface plus reading pair is considered. The
mapper applies JMdict restrictions before accepting a candidate. It never makes
a Cartesian product of all written forms and readings. If multiple lexemes
still have the same valid pair, the result is ambiguous and must be reviewed.

The deterministic identity contract is:

- lexemeId = jmdict:<ent_seq>;
- formId = SHA-256 of a JSON-encoded tuple of lexeme ID, normalized written
  surface, and normalized reading;
- collection membership key = SHA-256 of a JSON-encoded collection ID/form ID
  tuple;
- reading card ID = reading-typing:v1 plus SHA-256 of form ID.

JSON tuple encoding is used instead of a delimiter, so embedded separators
cannot create equivalent identities. Source row hashes include the source
fields; source row keys also include source name, immutable release/commit,
asset filename, checksum, and optional source locator.

Duplicate OpenJLPT rows remain decisions and diagnostics, but collapse to one
collection membership after mapping to the same canonical form. Different
collections can share one runtime word while retaining separate membership
IDs and source references. Same readings, same surfaces with different
readings,
and identical text in different JMdict lexemes remain distinct.

## Decisions, diagnostics, and release gate

Import diagnostics are allowed to remain. A clean diagnostic report is not a
release requirement. The artifact emitter accepts only explicitly approved
exact or reviewed manual-override mappings and validates the mapping again
against the source row, canonical form restrictions, source surface, tokenizer,
eligibility metadata, and deterministic IDs.

The mapping statuses are:

- exact: one valid canonical form matched;
- manual-override: a versioned reviewed override selected a valid exact form;
- duplicate: a source row maps to an already-emitted membership;
- ambiguous: more than one valid lexeme remains;
- unmatched: no canonical exact pair exists;
- invalid-restriction: an exact text pair violates JMdict restrictions;
- invalid-manual-override: an override is malformed, duplicated, unknown, or
  selects an invalid form;
- invalid-surface: the source surface is forbidden;
- unsupported-selector-mora: the surface or pronunciation cannot be represented;
- conflicting-membership: one membership has conflicting source levels.

Unmatched, ambiguous, invalid, conflicting, and unsupported rows are excluded
from the runtime artifact and do not need to be manually resolved before a
build can exist. A release fails if an emitted mapping is not approved, its
surface or tokens are forbidden, deterministic IDs collide, runtime
membership is duplicated, schema validation fails, or an approved coverage
baseline regresses.

Manual overrides must contain the schema version, unique override ID, source
row key, selected canonical form ID, reason, reviewer, and version. Unknown
forms, blank audit fields, duplicate override IDs/source-row targets, and
source-pair or restriction mismatches are rejected.

## Romaji answer policy

Phase 0 uses romaji typing only. Input is trimmed, lowercased, ASCII letters
plus apostrophe, with internal whitespace and kana rejected. The comparator
uses pronunciationKana, not the displayed surface.

The bounded policy uses Hepburn as canonical output and only declared aliases:

- shi/si, chi/ti, tsu/tu, fu/hu, and ji/zi;
- selected yōon aliases already represented by the policy;
- small っ doubles the next consonant;
- ん before a vowel or y accepts n' or n, but not nn;
- ん elsewhere accepts n or nn;
- prolonged Katakana vowels use the preceding vowel, so コーヒー is koohii;
- macrons are rejected.

For しんよう, shin'you, shinyou, and sinyou are accepted. shinnyou,
shinyo, kana input, and macron input are rejected.

## Runtime boundary and Node execution

Node-only SHA-256 crypto is imported only by tools/words/identity.ts. The
src/lib/words modules are browser-safe and do not import tools/words, fs, path,
process, or node:crypto. The runtime contracts contain no importer-only data.

tsconfig.json keeps allowImportingTsExtensions because the project uses
noEmit and Phase 0 modules intentionally import explicit .ts extensions. The
synthetic tests run with:

node --experimental-strip-types tests/words/run-phase0.mjs

The explicit flag preserves compatibility with Node 22.13 through 22.17,
where native TypeScript stripping is not enabled by default. The public Node
engine declaration is restricted to:

```json
{ "node": "^22.13.0 || >=24.0.0" }
```

## Synthetic-only scope and deferred work

Phase 0 tests use only hand-written fixtures shaped like JMdict and OpenJLPT
records. They are not real JLPT assignments. No real dataset is downloaded or
imported.

Still deferred:

- Phase 1 Words route, selectors, session UI, and static runtime dataset;
- real JMdict/OpenJLPT source pins, importer execution, and artifact generation;
- Dexie, IndexedDB progress, FSRS, due queues, and long-term SRS;
- meaning cards, Kanji vocabulary practice, Kanji character practice, audio,
  contextual questions, JFT collections, and backend sync.
