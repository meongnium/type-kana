<script lang="ts">
	import { base } from "$app/paths"
	import Button from "$/components/Button.svelte"
	import Icon from "$/components/MaterialIcon.svelte"
	import { filterEligibleWords } from "$/lib/words/config"
	import {
		createWordSession,
		getWordsSessionSummary
	} from "$/lib/words/session"
	import { wordById } from "$/lib/words/runtime"
	import { wordsConfig, wordsSession } from "$/stores/words"
	import { mdiArrowLeft, mdiHome, mdiRestart } from "@mdi/js"

	interface Props {
		data: {
			artifact: import("$lib/words/contracts").KanaReadingArtifactV1
		}
	}

	let { data }: Props = $props()
	let words = $derived(wordById(data.artifact.words))
	let state = $derived($wordsSession)
	let result = $derived(
		state ? getWordsSessionSummary(state, data.artifact.words) : null
	)

	function practiceAgain() {
		const eligibleWords = filterEligibleWords(data.artifact.words, $wordsConfig)
		const session = createWordSession(
			eligibleWords,
			$wordsConfig,
			data.artifact.contentVersion
		)
		if (session) wordsSession.set(session)
	}

	function formatDuration(seconds: number): string {
		if (seconds < 60) return seconds + "s"
		const minutes = Math.floor(seconds / 60)
		const remainder = seconds % 60
		return minutes + "m " + remainder + "s"
	}
</script>

<svelte:head>
	<title>Words Summary · Type Kana</title>
</svelte:head>

<main class="content-width content-padding center">
	{#if !state || !result}
		<section class="empty">
			<h1>No Words summary yet</h1>
			<p>Complete a Words session to see its results here.</p>
			<Button href={base + "/words/setup/"}>Words setup</Button>
		</section>
	{:else}
		<p class="eyebrow">Words practice complete</p>
		<h1>Session summary</h1>
		<p class="subtitle">These are session results, not long-term mastery.</p>

		<dl class="stats">
			<div>
				<dt>Unique words practiced</dt>
				<dd>{result.uniqueWordsPracticed}</dd>
			</div>
			<div>
				<dt>First-attempt correct</dt>
				<dd>{result.firstAttemptCorrect}</dd>
			</div>
			<div>
				<dt>First-attempt accuracy</dt>
				<dd>{Math.round(result.firstAttemptAccuracy * 100)}%</dd>
			</div>
			<div>
				<dt>Total mistakes</dt>
				<dd>{result.totalMistakes}</dd>
			</div>
			<div>
				<dt>Recovered on retry</dt>
				<dd>{result.recoveredOnRetry}</dd>
			</div>
			<div>
				<dt>Duration</dt>
				<dd>{formatDuration(result.durationSeconds)}</dd>
			</div>
		</dl>

		<section class="remaining">
			<h2>Words that remained incorrect</h2>
			{#if result.remainedIncorrect.length === 0}
				<p>None — nice work!</p>
			{:else}
				<ul>
					{#each result.remainedIncorrect as formId (formId)}
						<li lang="ja" translate="no">
							{words.get(formId)?.surface ?? formId}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</main>

{#if state && result}
	<footer class="actions glass-morphism">
		<div class="content-width content-padding action-row">
			<Button href={base + "/words/session/"} onclick={practiceAgain}>
				<Icon path={mdiRestart} size="1.25em" />
				Practice Again
			</Button>
			<Button href={base + "/words/setup/"} style="outline">
				<Icon path={mdiArrowLeft} size="1.25em" />
				Back to Words Setup
			</Button>
			<Button href={base + "/"} style="outline">
				<Icon path={mdiHome} size="1.25em" />
				Home
			</Button>
		</div>
	</footer>
{/if}

<style lang="postcss">
	main {
		min-height: calc(100vh - 8em);
		padding-bottom: calc(2 * var(--line-space));
	}

	.eyebrow {
		color: var(--accent-color);
		font-weight: 500;
		margin-bottom: 0.25em;
	}

	h1 {
		margin-top: 0;
		margin-bottom: 0.25em;
	}

	.subtitle {
		color: var(--text-color-light);
	}

	.stats {
		max-width: 42em;
		margin: calc(2 * var(--line-space)) auto 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1em;
		text-align: left;
	}

	.stats div {
		padding: 1em;
		border: 1px solid var(--text-color-lighter);
		border-radius: var(--standard-border-radius);
	}

	dt {
		color: var(--text-color-light);
		font-size: 0.9em;
	}

	dd {
		margin: 0.25em 0 0;
		color: var(--accent-color);
		font-size: 1.5em;
		font-weight: 500;
	}

	.remaining {
		max-width: 42em;
		margin: calc(2 * var(--line-space)) auto 0;
		text-align: left;
	}

	.remaining h2 {
		font-size: 1.1em;
	}

	.remaining p {
		color: var(--text-color-light);
	}

	.remaining ul {
		columns: 2;
		padding-left: 1.5em;
	}

	.remaining li {
		font-family: "Noto Sans JP", sans-serif;
		margin-bottom: 0.5em;
	}

	.actions {
		position: sticky;
		bottom: 0;
	}

	.action-row {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		gap: 1em;
	}

	.action-row :global(.button .svg-icon) {
		margin-left: -0.5em;
	}

	@media screen and (max-width: 600px) {
		.stats {
			grid-template-columns: 1fr;
		}

		.remaining ul {
			columns: 1;
		}
	}
</style>
