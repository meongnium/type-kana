<script lang="ts">
	import { base } from "$app/paths"
	import Button from "$/components/Button.svelte"
	import Icon from "$/components/MaterialIcon.svelte"
	import MenuBar from "$/components/MenuBar.svelte"
	import Radio from "$/components/Radio.svelte"
	import { WORD_COLLECTION_N5 } from "$/lib/words/contracts"
	import {
		WORD_KANA_GROUPS,
		createDefaultWordsConfig,
		filterEligibleWords,
		hiraganaToKatakana,
		isGroupSelected,
		setGroupSelected,
		setTokenSelected
	} from "$/lib/words/config"
	import { createWordSession } from "$/lib/words/session"
	import { wordsConfig, wordsSession } from "$/stores/words"
	import { mdiArrowLeft, mdiArrowRight, mdiCheck, mdiClose } from "@mdi/js"

	interface Props {
		data: {
			artifact: import("$lib/words/contracts").KanaReadingArtifactV1
		}
	}

	let { data }: Props = $props()
	let eligibleWords = $derived(
		filterEligibleWords(data.artifact.words, $wordsConfig)
	)

	function resetWordsConfig() {
		wordsConfig.set(createDefaultWordsConfig())
	}

	function toggleGroup(group: (typeof WORD_KANA_GROUPS)[number]) {
		wordsConfig.update((config) =>
			setGroupSelected(config, group, !isGroupSelected(config, group))
		)
	}

	function toggleToken(token: string) {
		wordsConfig.update((config) => {
			const selected = config.selectedCanonicalTokens.includes(token)
			return setTokenSelected(config, token, !selected)
		})
	}

	function isTokenSelected(token: string): boolean {
		return $wordsConfig.selectedCanonicalTokens.includes(token)
	}

	function displayToken(token: string): string {
		if ($wordsConfig.script === "katakana") return hiraganaToKatakana(token)
		if ($wordsConfig.script === "both") {
			return token + " / " + hiraganaToKatakana(token)
		}
		return token
	}

	function startSession() {
		const session = createWordSession(
			data.artifact.words,
			$wordsConfig,
			data.artifact.contentVersion
		)
		if (session) wordsSession.set(session)
	}
</script>

<svelte:head>
	<title>Words Setup · Type Kana</title>
</svelte:head>

<div class="wrapper">
	<main class="content-width content-padding">
		<header class="intro">
			<p class="eyebrow">Words practice</p>
			<h1>Kana Reading</h1>
			<p>
				Read a full kana word, then type its romaji pronunciation. Words use the
				source surface exactly as published.
			</p>
		</header>

		<fieldset>
			<legend>Script</legend>
			<div class="radio-buttons">
				<Radio
					id="words-script-hiragana"
					name="words-script"
					value="hiragana"
					bind:group={$wordsConfig.script}
				>
					Hiragana
				</Radio>
				<Radio
					id="words-script-katakana"
					name="words-script"
					value="katakana"
					bind:group={$wordsConfig.script}
				>
					Katakana
				</Radio>
				<Radio
					id="words-script-both"
					name="words-script"
					value="both"
					bind:group={$wordsConfig.script}
				>
					Both Kana
				</Radio>
			</div>
		</fieldset>

		<fieldset>
			<legend>Collection</legend>
			<div class="collection-card">
				<Radio
					id="words-collection-n5"
					name="words-collection"
					value={WORD_COLLECTION_N5}
					checked={true}
					disabled={true}
				>
					JLPT N5 — Estimated
				</Radio>
				<p>
					An estimated, unofficial study grouping. It is not an official JLPT
					vocabulary list.
				</p>
			</div>
		</fieldset>

		<section class="kana-section">
			<div class="section-heading">
				<div>
					<h2>Selected kana groups</h2>
					<p>A word appears only when every required kana group is selected.</p>
				</div>
				<button type="button" class="reset" onclick={resetWordsConfig}>
					Reset
				</button>
			</div>

			<div class="groups">
				{#each WORD_KANA_GROUPS as group (group.id)}
					<section class="group" aria-labelledby={"group-" + group.id}>
						<div class="group-heading">
							<h3 id={"group-" + group.id}>{group.label}</h3>
							<button
								type="button"
								class="group-toggle"
								aria-pressed={isGroupSelected($wordsConfig, group)}
								onclick={() => toggleGroup(group)}
							>
								{isGroupSelected($wordsConfig, group)
									? "Clear all"
									: "Select all"}
							</button>
						</div>
						<div class="tokens">
							{#each group.tokens as token (token)}
								<button
									type="button"
									class:selected={isTokenSelected(token)}
									class="token"
									aria-pressed={isTokenSelected(token)}
									aria-label={"Select " + token}
									onclick={() => toggleToken(token)}
								>
									<span class="token-main">{displayToken(token)}</span>
									{#if isTokenSelected(token)}
										<Icon path={mdiCheck} size="1em" />
									{:else}
										<Icon path={mdiClose} size="1em" />
									{/if}
								</button>
							{/each}
						</div>
					</section>
				{/each}
			</div>
		</section>

		<section class="eligible glass-morphism">
			<strong>{eligibleWords.length}</strong>
			<span>eligible word{eligibleWords.length === 1 ? "" : "s"}</span>
		</section>

		{#if eligibleWords.length === 0}
			<p class="empty">
				No words match this script and kana selection yet. Select more kana
				groups to continue.
			</p>
		{/if}
	</main>

	<MenuBar class="glass-morphism">
		<div class="menu content-width content-padding">
			<Button href={base + "/"} style="outline">
				<Icon path={mdiArrowLeft} size="1.25em" />
				Home
			</Button>
			<Button
				href={base + "/words/session/"}
				disabled={eligibleWords.length === 0}
				onclick={startSession}
			>
				Start practice
				<Icon path={mdiArrowRight} size="1.25em" />
			</Button>
		</div>
	</MenuBar>
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

	.intro {
		max-width: 42em;
		margin: 0 auto;
		text-align: center;
	}

	.eyebrow {
		color: var(--accent-color);
		font-weight: 500;
		margin-bottom: 0.25em;
	}

	h1,
	h2,
	h3 {
		margin-top: 0;
	}

	fieldset {
		border: none;
		padding: 0;
		margin: calc(1.5 * var(--line-space)) auto 0;
		max-width: 42em;
	}

	legend {
		width: 100%;
		text-align: center;
		font-size: 1.2em;
		font-weight: 500;
		margin-bottom: 0.75em;
	}

	.radio-buttons {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		gap: 1em 2em;
	}

	.collection-card {
		max-width: 30em;
		margin: 0 auto;
		padding: 1em;
		border: 1px solid var(--text-color-lighter);
		border-radius: var(--standard-border-radius);
	}

	.collection-card p {
		margin: 0.75em 0 0;
		color: var(--text-color-light);
		font-size: 0.9em;
	}

	.kana-section {
		margin: calc(2 * var(--line-space)) auto 0;
		max-width: 64em;
	}

	.section-heading,
	.group-heading,
	.menu {
		display: flex;
		align-items: center;
		gap: 1em;
	}

	.section-heading {
		justify-content: space-between;
	}

	.section-heading p {
		margin-bottom: 0;
	}

	.section-heading h2,
	.group-heading h3 {
		margin-bottom: 0.25em;
	}

	.groups {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1.25em;
		margin-top: var(--line-space);
	}

	.group {
		padding: 1em;
		border: 1px solid var(--text-color-lighter);
		border-radius: var(--standard-border-radius);
	}

	.group-heading {
		justify-content: space-between;
	}

	.group-heading h3 {
		font-size: 1em;
	}

	.reset,
	.group-toggle {
		all: unset;
		color: var(--accent-color);
		cursor: pointer;
		font-size: 0.85em;
	}

	.reset:hover,
	.group-toggle:hover {
		text-decoration: underline;
	}

	.tokens {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(5.5em, 1fr));
		gap: 0.5em;
	}

	.token {
		min-height: 3.25em;
		border: 2px solid var(--text-color-lighter);
		border-radius: var(--standard-border-radius);
		background: var(--background-color);
		color: var(--text-color);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.25em;
		padding: 0.5em;
	}

	.token.selected {
		color: var(--text-color-on-accent-color);
		background: var(--accent-color);
		border-color: transparent;
	}

	.token-main {
		font-family: "Noto Sans JP", sans-serif;
		font-size: 1.05em;
		overflow-wrap: anywhere;
	}

	.eligible {
		max-width: 20em;
		margin: calc(2 * var(--line-space)) auto var(--line-space);
		padding: 1em;
		display: flex;
		justify-content: center;
		align-items: baseline;
		gap: 0.5em;
		text-align: center;
	}

	.eligible strong {
		font-size: 1.75em;
		color: var(--accent-color);
	}

	.empty {
		max-width: 32em;
		margin: 0 auto var(--line-space);
		text-align: center;
		color: var(--text-color-light);
	}

	.menu {
		justify-content: center;
		flex-wrap: wrap;
	}

	.menu > :global(:first-child .svg-icon) {
		margin-left: -0.5em;
	}

	.menu > :global(:last-child .svg-icon) {
		margin-right: -0.5em;
	}

	@media screen and (max-width: 760px) {
		.groups {
			grid-template-columns: 1fr;
		}
	}
</style>
