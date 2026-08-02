<script lang="ts">
	import { base } from "$app/paths"
	import Button from "$/components/Button.svelte"
	import Icon from "$/components/MaterialIcon.svelte"
	import { isRomajiWordAnswer } from "$/lib/words/romaji"
	import { answerWordSession, finishWordSession } from "$/lib/words/session"
	import { wordById } from "$/lib/words/runtime"
	import { wordsSession } from "$/stores/words"
	import { goto } from "$app/navigation"
	import { onMount } from "svelte"
	import { mdiArrowLeft, mdiCheck, mdiClose } from "@mdi/js"

	interface Props {
		data: {
			artifact: import("$lib/words/contracts").KanaReadingArtifactV1
		}
	}

	interface Feedback {
		correct: boolean
		answer: string
		expected: string
		willRetry: boolean
		attempts: number
	}

	let { data }: Props = $props()
	let words = $derived(wordById(data.artifact.words))
	let input = $state("")
	let inputElement = $state<HTMLInputElement>()
	let feedback = $state<Feedback | null>(null)
	let sessionState = $derived($wordsSession)
	let currentWord = $derived(
		sessionState?.queue[0] ? words.get(sessionState.queue[0]) : undefined
	)
	let answeredCount = $derived(
		sessionState?.records.filter((record) => record.status !== "pending")
			.length ?? 0
	)

	onMount(() => inputElement?.focus())

	function leaveSession() {
		const current = $wordsSession
		if (current?.status === "active") {
			wordsSession.set(finishWordSession(current))
		}
	}

	function submit(event: SubmitEvent) {
		event.preventDefault()
		const currentState = $wordsSession
		const word = currentState?.queue[0]
			? words.get(currentState.queue[0])
			: undefined
		if (!currentState || currentState.status !== "active" || !word) return

		const answer = input
		const correct = isRomajiWordAnswer(answer, word.pronunciationKana)
		const result = answerWordSession(currentState, word.formId, answer, correct)
		feedback = {
			correct,
			answer: answer.trim(),
			expected: word.canonicalAnswer,
			willRetry: result.outcome.willRetry,
			attempts: result.outcome.attempts
		}
		wordsSession.set(result.state)
		input = ""

		if (result.state.status === "completed") {
			window.setTimeout(() => goto("../summary/"), 450)
		} else {
			window.setTimeout(() => inputElement?.focus(), 0)
		}
	}
</script>

<svelte:head>
	<title>Words Session · Type Kana</title>
</svelte:head>

<div class="wrapper">
	<main class="content-width content-padding">
		{#if !sessionState}
			<section class="empty center">
				<h1>No active Words session</h1>
				<p>Choose your script and kana groups before starting practice.</p>
				<Button href={base + "/words/setup/"}>Words setup</Button>
			</section>
		{:else if sessionState.status !== "active" || !currentWord}
			<section class="empty center">
				<h1>Session finished</h1>
				<p>Your session summary is ready.</p>
				<Button href={base + "/words/summary/"}>View summary</Button>
			</section>
		{:else}
			<header class="session-header">
				<div>
					<p class="eyebrow">Kana Reading</p>
					<h1>Type the romaji</h1>
				</div>
				<p class="progress" aria-label="Words completed">
					{answeredCount}/{sessionState.maxWords}
				</p>
			</header>

			<section class="question glass-morphism" aria-labelledby="word-prompt">
				<p class="prompt-label" id="word-prompt">Read this word</p>
				<p class="word" lang="ja" translate="no">{currentWord.surface}</p>
				<p class="hint">Romaji only · kana answers are not accepted</p>
			</section>

			<form class="answer-form" onsubmit={submit}>
				<label for="word-answer">Your answer</label>
				<div class="answer-row">
					<input
						id="word-answer"
						bind:this={inputElement}
						bind:value={input}
						autocomplete="off"
						autocapitalize="none"
						spellcheck="false"
						inputmode="text"
						placeholder="Type romaji"
					/>
					<Button type="submit">Check</Button>
				</div>
			</form>

			{#if feedback}
				<section
					class:correct={feedback.correct}
					class:incorrect={!feedback.correct}
					class="feedback"
					aria-live="polite"
				>
					<Icon path={feedback.correct ? mdiCheck : mdiClose} size="1.25em" />
					{#if feedback.correct}
						Correct!
					{:else}
						Not quite. Expected <strong>{feedback.expected}</strong>
						.
						{#if feedback.willRetry}
							This word will return later.
						{:else}
							This word remains incorrect after two retries.
						{/if}
					{/if}
				</section>
			{/if}
		{/if}
	</main>

	{#if sessionState?.status === "active"}
		<footer class="actions glass-morphism">
			<div class="content-width content-padding action-row">
				<Button
					href={base + "/words/summary/"}
					style="outline"
					onclick={leaveSession}
				>
					<Icon path={mdiArrowLeft} size="1.25em" />
					Leave session
				</Button>
			</div>
		</footer>
	{/if}
</div>

<style lang="postcss">
	.wrapper {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	main {
		flex: 1;
	}

	.session-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		max-width: 42em;
		margin: 0 auto calc(2 * var(--line-space));
	}

	.eyebrow {
		color: var(--accent-color);
		font-weight: 500;
		margin-bottom: 0.25em;
	}

	h1 {
		margin: 0;
	}

	.progress {
		margin: 0;
		color: var(--text-color-light);
		white-space: nowrap;
	}

	.question {
		max-width: 42em;
		margin: 0 auto;
		padding: clamp(2em, 8vw, 5em) 1em;
		text-align: center;
	}

	.prompt-label,
	.hint {
		color: var(--text-color-light);
	}

	.word {
		margin: 0.4em 0;
		font-family: "Noto Sans JP", sans-serif;
		font-size: clamp(3.5em, 15vw, 7em);
		line-height: 1.2;
		overflow-wrap: anywhere;
	}

	.hint {
		margin: 0;
		font-size: 0.9em;
	}

	.answer-form {
		max-width: 42em;
		margin: calc(2 * var(--line-space)) auto 0;
	}

	.answer-form > label {
		display: block;
		margin-bottom: 0.5em;
		font-weight: 500;
	}

	.answer-row {
		display: flex;
		gap: 0.75em;
	}

	input {
		all: initial;
		flex: 1;
		min-width: 0;
		border: 2px solid var(--text-color-lighter);
		border-radius: var(--standard-border-radius);
		background: var(--background-color);
		color: var(--text-color);
		padding: 0.75em 1em;
		font: inherit;
	}

	input:focus {
		border-color: var(--focus-color);
		outline: none;
	}

	.feedback {
		max-width: 42em;
		margin: var(--line-space) auto 0;
		padding: 0.85em 1em;
		border-radius: var(--standard-border-radius);
		display: flex;
		align-items: center;
		gap: 0.45em;
		flex-wrap: wrap;
	}

	.feedback.correct {
		color: var(--text-color-on-accent-color);
		background: var(--accent-color);
	}

	.feedback.incorrect {
		color: var(--text-color);
		background: var(--background-contrast);
	}

	.feedback strong {
		font-family: "M+ 2c";
	}

	.empty {
		max-width: 32em;
		margin: 5em auto;
	}

	.empty p {
		color: var(--text-color-light);
	}

	.actions {
		margin-top: var(--line-space);
	}

	.action-row {
		display: flex;
		justify-content: center;
	}

	@media screen and (max-width: 520px) {
		.answer-row {
			flex-direction: column;
		}

		.answer-row :global(.button) {
			align-self: center;
		}
	}
</style>
