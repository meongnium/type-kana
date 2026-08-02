import type { PageLoad } from "./$types"
import { loadKanaReadingArtifact } from "$/lib/words/runtime"

export const load: PageLoad = async ({ fetch }) => ({
	artifact: await loadKanaReadingArtifact(fetch)
})
