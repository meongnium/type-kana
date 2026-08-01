<script lang="ts">
	import { page } from "$app/state"
	import { dev } from "$app/environment"
import { base } from "$app/paths"
</script>

<svelte:head>
	<title>{page.error?.message || page.status} · Type Kana</title>
</svelte:head>

<h1>Error {page.status}</h1>

<p>{page.error?.message}</p>

{#if dev && (page.error as { stack?: string })?.stack}
	<pre>{(page.error as { stack?: string }).stack}</pre>
{/if}

{#if page.status === 404}
	<a class="text-link" href={base || "/"}>Go back home</a>
{/if}
