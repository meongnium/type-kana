import { createHash } from "node:crypto"
import { gunzipSync } from "node:zlib"
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../.."
)
export const SOURCE_MANIFEST_PATH = path.join(
	REPO_ROOT,
	"tools",
	"words",
	"source-manifest.json"
)
export const SOURCE_CACHE_DIR = path.join(REPO_ROOT, ".cache", "words-sources")

function sha256HexBuffer(value) {
	return createHash("sha256").update(value).digest("hex")
}

function sha1GitBlobHex(value) {
	const header = Buffer.from("blob " + value.length + "\0", "utf8")
	return createHash("sha1")
		.update(Buffer.concat([header, value]))
		.digest("hex")
}

async function exists(filePath) {
	try {
		await access(filePath)
		return true
	} catch {
		return false
	}
}

async function readManifest() {
	return JSON.parse(await readFile(SOURCE_MANIFEST_PATH, "utf8"))
}

async function ensureVerifiedDownload(pin, targetPath) {
	await mkdir(path.dirname(targetPath), { recursive: true })
	if (await exists(targetPath)) {
		const value = await readFile(targetPath)
		const observedSha256 = sha256HexBuffer(value)
		if (observedSha256 !== pin.sha256) {
			throw new Error(
				"Checksum mismatch for existing cached source; refusing to replace " +
					targetPath +
					". Expected " +
					pin.sha256 +
					", observed " +
					observedSha256
			)
		}
		return { observedSha256, downloaded: false }
	}

	const partialPath = targetPath + ".part"
	if (await exists(partialPath)) {
		throw new Error(
			"Partial source download exists; refusing to replace " + partialPath
		)
	}

	const response = await fetch(pin.immutableUrl)
	if (!response.ok) {
		throw new Error(
			"Source download failed (" + response.status + "): " + pin.immutableUrl
		)
	}
	const value = Buffer.from(await response.arrayBuffer())
	const observedSha256 = sha256HexBuffer(value)
	if (observedSha256 !== pin.sha256) {
		throw new Error(
			"Checksum mismatch for downloaded source. Expected " +
				pin.sha256 +
				", observed " +
				observedSha256
		)
	}

	await writeFile(partialPath, value, { flag: "wx" })
	await rename(partialPath, targetPath)
	return { observedSha256, downloaded: true }
}

function tarString(value) {
	return value.toString("utf8").replace(/\0.*$/s, "")
}

function tarOctal(value) {
	const text = tarString(value).trim()
	return text ? parseInt(text, 8) : 0
}

function extractTarEntry(tarBuffer, expectedFilename) {
	let offset = 0
	while (offset + 512 <= tarBuffer.length) {
		const header = tarBuffer.subarray(offset, offset + 512)
		if (header.every((byte) => byte === 0)) break

		const name = tarString(header.subarray(0, 100))
		const prefix = tarString(header.subarray(345, 500))
		const filename = prefix ? prefix + "/" + name : name
		const size = tarOctal(header.subarray(124, 136))
		const type = tarString(header.subarray(156, 157)) || "0"
		const dataStart = offset + 512
		const dataEnd = dataStart + size
		if (type === "0" && filename === expectedFilename) {
			return tarBuffer.subarray(dataStart, dataEnd)
		}
		offset = dataStart + Math.ceil(size / 512) * 512
	}
	throw new Error(
		"Expected JSON member " +
			expectedFilename +
			" was not found in JMdict archive"
	)
}

async function ensureExtractedJson(archivePath, expectedFilename, targetPath) {
	const archive = await readFile(archivePath)
	const extracted = extractTarEntry(gunzipSync(archive), expectedFilename)
	await mkdir(path.dirname(targetPath), { recursive: true })

	if (await exists(targetPath)) {
		const current = await readFile(targetPath)
		if (!current.equals(extracted)) {
			throw new Error(
				"Extracted JMdict file differs from the pinned archive; refusing to replace " +
					targetPath
			)
		}
		return { extractedSha256: sha256HexBuffer(current), extracted: false }
	}

	const partialPath = targetPath + ".part"
	if (await exists(partialPath)) {
		throw new Error(
			"Partial extracted source exists; refusing to replace " + partialPath
		)
	}
	await writeFile(partialPath, extracted, { flag: "wx" })
	await rename(partialPath, targetPath)
	return { extractedSha256: sha256HexBuffer(extracted), extracted: true }
}

export async function acquirePinnedSources(options = {}) {
	const manifest = await readManifest()
	const importedAt = options.importedAt ?? new Date().toISOString()
	const jmdictSpec = manifest.sources.find(
		(source) => source.kind === "jmdict-tar-gz"
	)
	const openJlptSpec = manifest.sources.find(
		(source) => source.kind === "openjlpt-json"
	)
	if (!jmdictSpec || !openJlptSpec) {
		throw new Error("Source manifest must contain JMdict and OpenJLPT specs")
	}

	await mkdir(SOURCE_CACHE_DIR, { recursive: true })
	const jmdictArchivePath = path.join(
		SOURCE_CACHE_DIR,
		jmdictSpec.cacheFilename
	)
	const jmdictArchive = await ensureVerifiedDownload(
		jmdictSpec.pin,
		jmdictArchivePath
	)
	const jmdictJsonPath = path.join(
		SOURCE_CACHE_DIR,
		jmdictSpec.extractedFilename
	)
	const jmdictJson = await ensureExtractedJson(
		jmdictArchivePath,
		jmdictSpec.extractedFilename,
		jmdictJsonPath
	)

	const openJlptPath = path.join(SOURCE_CACHE_DIR, openJlptSpec.cacheFilename)
	const openJlpt = await ensureVerifiedDownload(openJlptSpec.pin, openJlptPath)
	const openJlptValue = await readFile(openJlptPath)

	return {
		manifest,
		importedAt,
		cacheDir: SOURCE_CACHE_DIR,
		jmdict: {
			pin: jmdictSpec.pin,
			archivePath: jmdictArchivePath,
			jsonPath: jmdictJsonPath,
			archiveSha256: jmdictArchive.observedSha256,
			extractedSha256: jmdictJson.extractedSha256,
			downloaded: jmdictArchive.downloaded,
			extracted: jmdictJson.extracted
		},
		openJlpt: {
			pin: openJlptSpec.pin,
			path: openJlptPath,
			sha256: openJlpt.observedSha256,
			gitBlobSha: sha1GitBlobHex(openJlptValue),
			downloaded: openJlpt.downloaded
		}
	}
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	console.log(JSON.stringify(await acquirePinnedSources(), null, 2))
}
