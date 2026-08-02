<script lang="ts">
	import { base } from "$app/paths"
	import Button from "$/components/Button.svelte"
	import Icon from "$/components/MaterialIcon.svelte"
	import { mdiArrowLeft, mdiOpenInNew } from "@mdi/js"
</script>

<svelte:head>
	<title>Sources &amp; Attribution · Type Kana</title>
</svelte:head>

<main class="content-width content-padding center">
	<p class="eyebrow">About Words practice</p>
	<h1>Sources &amp; attribution</h1>
	<p class="intro">
		Words practice uses a compact, versioned build artifact. The app does not
		call a dictionary API while you practice.
	</p>

	<section class="sources">
		<article>
			<h2>JMdict / EDRDG</h2>
			<p>
				JMdict supplies canonical lexical forms and valid spelling–reading
				relationships. JMdict is distributed under the EDRDG licence.
			</p>
			<a
				href="https://www.edrdg.org/edrdg/licence.html"
				target="_blank"
				rel="noopener"
			>
				EDRDG licence <Icon path={mdiOpenInNew} size="1em" />
			</a>
		</article>

		<article>
			<h2>jmdict-simplified</h2>
			<p>
				The build uses the pinned full English JMdict artifact without examples:
				release 3.6.2+20260727141257, commit b67b0fe.
			</p>
			<a
				href="https://github.com/scriptin/jmdict-simplified"
				target="_blank"
				rel="noopener"
			>
				Source repository <Icon path={mdiOpenInNew} size="1em" />
			</a>
		</article>

		<article>
			<h2>OpenJLPT</h2>
			<p>
				OpenJLPT supplies the N5 collection membership and level assignment
				provenance. The displayed N5 grouping is estimated and unofficial; it is
				not an official JLPT vocabulary list.
			</p>
			<a
				href="https://github.com/evanclan/OpenJLPT"
				target="_blank"
				rel="noopener"
			>
				Source repository <Icon path={mdiOpenInNew} size="1em" />
			</a>
			<p class="pin">
				Pinned commit:
				<code>c42fd9fa3777bfc1775446f7c418d549dfd6e4cf</code>
			</p>
		</article>

		<article>
			<h2>Licensing note</h2>
			<p>
				Application code keeps its existing MIT licence. Derived vocabulary
				artifacts retain their upstream attribution and share-alike obligations
				where applicable. See the repository compliance notes for exact source
				pins and checksums.
			</p>
		</article>
	</section>

	<div class="actions">
		<Button href={base + "/"} style="outline">
			<Icon path={mdiArrowLeft} size="1.25em" />
			Home
		</Button>
		<Button href={base + "/words/setup/"}>Words setup</Button>
	</div>
</main>

<style lang="postcss">
	main {
		min-height: 100vh;
	}

	.eyebrow {
		color: var(--accent-color);
		font-weight: 500;
		margin-bottom: 0.25em;
	}

	h1 {
		margin-top: 0;
	}

	.intro {
		max-width: 40em;
		margin: 0 auto;
		color: var(--text-color-light);
	}

	.sources {
		max-width: 52em;
		margin: calc(2 * var(--line-space)) auto 0;
		display: grid;
		gap: 1em;
		text-align: left;
	}

	article {
		padding: 1em;
		border: 1px solid var(--text-color-lighter);
		border-radius: var(--standard-border-radius);
	}

	article h2 {
		margin-top: 0;
		font-size: 1.1em;
	}

	article p {
		color: var(--text-color-light);
	}

	article a {
		color: var(--accent-color);
		display: inline-flex;
		align-items: center;
		gap: 0.25em;
	}

	.pin {
		overflow-wrap: anywhere;
		font-size: 0.9em;
	}

	code {
		font-family: "M+ 2c", monospace;
	}

	.actions {
		display: flex;
		justify-content: center;
		gap: 1em;
		flex-wrap: wrap;
		margin: calc(2 * var(--line-space)) 0;
	}
</style>
