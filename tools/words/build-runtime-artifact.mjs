import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { acquirePinnedSources } from "./acquire-sources.mjs"
import { buildCanonicalLexemes } from "./jmdict-adapter.ts"
import { parseOpenJlptN5 } from "./openjlpt-adapter.ts"
import { mapOpenJlptRows } from "./mapping.ts"
import { emitRuntimeArtifact, validateRuntimeArtifact } from "./artifact.ts"
import { sha256Hex } from "./identity.ts"

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../.."
)
const OUTPUT_PATH = path.join(
	REPO_ROOT,
	"static",
	"words",
	"kana-reading-v1.json"
)
const CONTENT_VERSION = "words-kana-reading-v1-n5-101"

function runtimeSourceManifest(acquisition) {
	const sources = acquisition.manifest.sources.map((spec) => {
		const pin = spec.pin
		const isJmdict = spec.kind === "jmdict-tar-gz"
		return {
			source: pin.source,
			repositoryUrl: pin.repositoryUrl,
			releaseOrCommit: pin.releaseOrCommit,
			releaseCommit: pin.releaseCommit,
			gitBlobSha: pin.gitBlobSha,
			assetFilename: pin.assetFilename,
			immutableUrl: pin.immutableUrl,
			expectedSha256: pin.sha256,
			observedSha256: isJmdict
				? acquisition.jmdict.archiveSha256
				: acquisition.openJlpt.sha256,
			extractedSha256: isJmdict ? acquisition.jmdict.extractedSha256 : undefined
		}
	})
	return {
		schemaVersion: 1,
		importerVersion: acquisition.manifest.importerVersion,
		generatedAt: acquisition.importedAt,
		sources
	}
}

function runtimeAttribution() {
	return {
		collectionNotice:
			"JLPT N5 is an estimated, unofficial study grouping; it is not an official JLPT vocabulary list.",
		sources: [
			{
				name: "JMdict / EDRDG",
				url: "https://www.edrdg.org/edrdg/licence.html",
				license: "EDRDG JMdict licence"
			},
			{
				name: "jmdict-simplified",
				url: "https://github.com/scriptin/jmdict-simplified",
				license: "CC BY-SA 4.0 / upstream terms"
			},
			{
				name: "OpenJLPT",
				url: "https://github.com/evanclan/OpenJLPT",
				license: "CC BY-SA 4.0; preserve upstream notices"
			}
		]
	}
}

const acquisition = await acquirePinnedSources()
const jmdictInput = JSON.parse(
	await readFile(acquisition.jmdict.jsonPath, "utf8")
)
const openJlptInput = JSON.parse(
	await readFile(acquisition.openJlpt.path, "utf8")
)
const jmdict = buildCanonicalLexemes(jmdictInput, acquisition.jmdict.pin)
const openJlpt = parseOpenJlptN5(openJlptInput, acquisition.openJlpt.pin)
const mapping = mapOpenJlptRows(openJlpt.rows, jmdict.lexemes)

if (mapping.approvedMappings.length !== 101) {
	throw new Error(
		"Phase 1 release requires the currently approved 101 words; observed " +
			mapping.approvedMappings.length
	)
}

const emitted = emitRuntimeArtifact(mapping.approvedMappings, {
	contentVersion: CONTENT_VERSION,
	generatedAt: acquisition.importedAt
})
const baseArtifact = {
	...emitted,
	sourceManifest: runtimeSourceManifest(acquisition),
	attribution: runtimeAttribution()
}
const artifact = {
	...baseArtifact,
	artifactHash: "sha256:" + sha256Hex(JSON.stringify(baseArtifact))
}
const validationErrors = validateRuntimeArtifact(artifact)
if (validationErrors.length > 0) {
	throw new Error(
		"Production artifact validation failed: " + validationErrors.join(", ")
	)
}

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
await writeFile(OUTPUT_PATH, JSON.stringify(artifact) + "\n", "utf8")
console.log(
	JSON.stringify(
		{
			output: path.relative(REPO_ROOT, OUTPUT_PATH).replaceAll(path.sep, "/"),
			words: artifact.words.length,
			contentVersion: artifact.contentVersion,
			artifactHash: artifact.artifactHash,
			sourceChecksums: artifact.sourceManifest.sources.map((source) => ({
				source: source.source,
				expectedSha256: source.expectedSha256,
				observedSha256: source.observedSha256
			}))
		},
		null,
		2
	)
)
