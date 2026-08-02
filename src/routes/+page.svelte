<script lang="ts">
	import { base } from "$app/paths"
	import Header from "./Header.svelte"
	import Button from "$/components/Button.svelte"
	import Icon from "$/components/MaterialIcon.svelte"
	import { mdiArrowRight } from "@mdi/js"

	interface Props {
		data: { stargazers: number }
	}

	let { data }: Props = $props()
	let stargazers = $derived(data.stargazers)
</script>

<svelte:head>
	<title>Type Kana</title>
</svelte:head>

<Header {stargazers} />
<section class="content-padding">
	<div class="content-width center">
		<p>
			Type Kana is a quiz app to help you learn hiragana and katakana, the
			Japanese syllabaries.
		</p>

		<div class="practice-choices">
			<Button href={base + "/setup/"}>
				Characters
				<Icon size="1.25em" path={mdiArrowRight} />
			</Button>
			<Button href={base + "/words/setup/"}>
				Words
				<Icon size="1.25em" path={mdiArrowRight} />
			</Button>
		</div>

		<p class="about-link">
			<a href={base + "/about/"}>Sources &amp; attribution</a>
		</p>
	</div>
</section>

<style lang="postcss">
	.practice-choices {
		display: flex;
		gap: 1em;
		justify-content: center;
		flex-wrap: wrap;
	}

	.about-link {
		margin-top: calc(1.5 * var(--line-space));
	}

	.about-link a {
		color: var(--accent-color);
	}

	* :global(.button .svg-icon) {
		margin-right: -0.5em;
	}
</style>
