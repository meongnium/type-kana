# Words Phase 0

This document defines the build-time vocabulary boundary for the future Words
feature. Phase 0 does not add Words routes or change Character Practice.

## Importer/runtime boundary

The importer may contain complete JMdict lexical data, OpenJLPT source rows,
restrictions, senses, provenance, diagnostics, and reviewed manual overrides.
The browser artifact contains only the fields needed by Kana Reading:

- `formId` and `cardId`;
- the exact OpenJLPT `word` as `surface`;
- `pronunciationKana` for answer validation;
- `surfaceTokens` and `requiredCanonicalTokens`;
- script classification, collection IDs, answer policy, and minimal source refs.

Senses, glosses, parts of speech, examples, and import diagnostics do not ship
to the browser in Phase 1.

## Source-surface rule

`OpenJLPT.word` is authoritative for the written surface.

- `先生` with reading `せんせい` is excluded because the source surface has
  Kanji.
- `せんせい` with reading `せんせい` may be eligible and must map to a
  corresponding canonical JMdict written form.
- A Kanji surface must never be replaced with its reading to create a new
  kana display surface.

The importer does not try to decide whether a JMdict kana element is “only a
reading.” It matches the source written surface to a canonical form and keeps
the source surface unchanged.

## Surface and token policy

Phase 1 allows explicitly listed Hiragana, Katakana, and `ー`. Middle dots,
iteration marks, spaces, punctuation, Latin characters, numerals, Kanji, and
other characters are excluded. The tokenizer uses maximal munch and preserves
display units such as `きょ`, `っ`, `ッ`, and `ー`.

Foreign combinations are recognized for diagnostics but are not selectable in
Phase 1. The eligibility resolver maps `っ`/`ッ` to the selector requirement
`つ` without modifying the surface token, and treats `ー` as a modifier.

## Mapping statuses and release gate

Diagnostics are allowed to remain in the import report. They do not enter the
runtime artifact. A record is releasable only when its mapping is explicitly
approved and the artifact checks pass.

The artifact emitter fails on:

- an unapproved mapping;
- a forbidden surface or unsupported token;
- deterministic ID collision;
- duplicate runtime membership;
- invalid artifact schema;
- a coverage regression below the approved baseline.

Unmatched, ambiguous, invalid, conflicting, and unsupported source rows do not
need to be manually resolved before an artifact can be released.

## Identity

```text
lexeme_id = jmdict:<ent_seq>
form_id = jmdict-form:sha256(lexeme_id + NFKC(written) + NFKC(reading))
membership = collection_id + "\\0" + form_id
card_id = reading-typing:v1:sha256(form_id)
```

The source row is retained for audit, but source row order is never an identity
for user progress or runtime content.

## Synthetic fixtures

The Phase 0 tests use small synthetic JMdict/OpenJLPT-shaped objects. Their
words are test cases only and are not presented as real JLPT assignments. No
real JMdict or OpenJLPT data is downloaded or imported by Phase 0.

## Deferred functionality

Phase 1 UI, collection browsing, long-term progress, Dexie, FSRS, meaning cards,
Kanji vocabulary, audio, JFT collections, and backend sync remain deferred.
