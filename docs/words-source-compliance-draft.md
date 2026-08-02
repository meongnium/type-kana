# Words source and compliance draft

Status: Phase 0.5 review draft. No generated vocabulary artifact is released by this phase.

This is an operational checklist, not legal advice. Before shipping a derived content file, re-check the pinned upstream notices and obtain any review the project needs.

## Separation boundary

- Application source remains under the repository's existing MIT license.
- JMdict/OpenJLPT-derived vocabulary content is treated as a separate data artifact with its own attribution and share-alike obligations.
- Future generated files should live in a clearly separated content/data area and carry a machine-readable source manifest plus a human-readable notice.
- Phase 0.5 does not add JMdict, OpenJLPT, Tatoeba, or any generated vocabulary file to the browser bundle.
- A future app release must have a visible Sources/About entry. It must acknowledge EDRDG/JMdict, link the applicable license notices, identify OpenJLPT and its upstream sources, and state that JLPT groupings are unofficial estimates.

## Source matrix

| Source                         | Phase 0.5 use                                                                          | License/provenance to preserve                                                                                         | Operational action                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| JMdict / EDRDG                 | Canonical lexemes, forms, readings, restrictions, English gloss context                | EDRDG JMdict licence; derived dictionary data is distributed under the source terms.                                   | Keep the EDRDG notice and link in the future Sources/About entry and data notice.                                 |
| jmdict-simplified              | Pinned full English JMdict JSON build, without examples                                | The repository describes its derived dictionary files as retaining the upstream terms and the project as CC-BY-SA-4.0. | Preserve the project notice, upstream EDRDG notice, pin, checksum, and artifact provenance.                       |
| OpenJLPT                       | N5 source surface, raw reading, meanings for audit context, estimated level membership | OpenJLPT documents dataset/code as CC BY-SA 4.0 and supplies NOTICE.md.                                                | Preserve OpenJLPT LICENSE and NOTICE.md information; retain its upstream attribution chain.                       |
| Jonathan Waller JLPT resources | Indirect provenance for OpenJLPT level membership                                      | OpenJLPT declares the level assignment source as CC BY.                                                                | Describe N5 as an unofficial/estimated grouping and retain the attribution in the data notice.                    |
| KANJIDIC2                      | Not used in Phase 0.5                                                                  | No Phase 0.5 artifact uses it.                                                                                         | Do not add a KANJIDIC2 notice until a future Kanji feature actually imports it.                                   |
| Tatoeba                        | Not used; examples are deliberately excluded                                           | No Phase 0.5 artifact contains Tatoeba sentences.                                                                      | Do not copy or redistribute examples in this phase; add Tatoeba attribution only if a later phase ships examples. |
| ts-fsrs                        | Not installed or used                                                                  | No Phase 0.5 dependency.                                                                                               | Revisit its license and package notice when Phase 2 is approved.                                                  |

## Immutable pins used by the dry run

### jmdict-simplified

- Repository: https://github.com/scriptin/jmdict-simplified
- Release tag: "3.6.2+20260727141257"
- Release commit: "b67b0fe"
- Asset: jmdict-eng-3.6.2+20260727141257.json.tgz
- URL: https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20260727141257/jmdict-eng-3.6.2%2B20260727141257.json.tgz
- Expected and observed archive SHA-256: 98a6d75c76fbdf129f2fa65075df94a827ff63bbf54c8d6c8e1e7ecdf8ae7e0f
- Selected build: full English JMdict, without examples and without common-only filtering.

### OpenJLPT

- Repository: https://github.com/evanclan/OpenJLPT
- Commit: "c42fd9fa3777bfc1775446f7c418d549dfd6e4cf"
- File: data/json/vocab/n5.json
- URL: https://raw.githubusercontent.com/evanclan/OpenJLPT/c42fd9fa3777bfc1775446f7c418d549dfd6e4cf/data/json/vocab/n5.json
- Expected and observed SHA-256: 3e606fc15fd5d177fa7c3928c17f28b0d34ac84ec6bdbfe0947b339d9d815a6d
- Expected and observed Git blob SHA: 61177335cf35c33b7ead4d0f0c344b73bd90ceb6
- The level grouping is an OpenJLPT-derived, unofficial approximation, not an official JLPT vocabulary list.

The machine-readable copy of these pins is tools/words/source-manifest.json.

## Required future compliance files

Before a runtime dataset is committed, create or update:

1. A generated-data notice next to the artifact with the artifact hash, importer version, generated timestamp, exact source pins, checksums, and attribution text.
2. A copied or linked notice containing the required EDRDG/JMdict, jmdict-simplified, OpenJLPT, Waller, and any actually included upstream notices.
3. A visible Sources/About entry in the app.
4. A release checklist confirming that examples, KANJIDIC2, JFT material, and other unapproved sources were not included accidentally.

The acquisition report records the observed checksums and cache location. Cache files and dry-run reports are ignored by Git and are not application runtime inputs.
