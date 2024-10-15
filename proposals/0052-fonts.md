**If you have feedback and the feature is released as experimental, please leave it on the Stage 3 PR. Otherwise, comment on the Stage 2 issue (links below).**

- Start Date: 2024-10-15
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: <!-- leave empty -->
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/837
- Stage 3 PR: <!-- related roadmap PR, leave it empty if you don't have a PR yet -->

# Summary

Have first-party support for fonts in Astro.

# Example

```js
// astro config
export default defineConfig({
	fonts: {
		families: ["Roboto", "Lato"]
	}
})
```

```astro
---
// layouts/Layout.astro
import { Font } from "astro:fonts"
---
<head>
	<Font family="Inter" preload />
	<Font family="Lato" />
	<style>
		h1 {
			font-family: var(--astro-font-inter);
		}
		p {
			font-family: var(--astro-font-lato);
		}
	</style>
</head>
```

# Background & Motivation

Fonts is one of those basic things when making a website, but also an annoying one to deal with. Should I just use a link to a remote font? Or download it locally? How should I handle preloads then?

The goal is to improve the DX around using fonts in Astro.

> Why not using fontsource?

Fontsource is great! But it's not intuitive to preload, and more importantly, doesn't have all fonts. The goal is to have a more generic API for fonts (eg. you want to use a paid provider like adobe).

# Goals

- Specify what font to use
- Cache fonts
- Specify what provider to use
- Load/preload font on a font basis
- Generate fallbacks automatically
- Performant defaults
- Runtime agnostic

# Non-Goals

- Runtime API (SSR is supported tho)
- Automatic subsetting
- Font detection

# Detailed Design

This is the bulk of the RFC. Explain the design in enough detail for somebody
familiar with Astro to understand, and for somebody familiar with the
implementation to implement. This should get into specifics and corner-cases,
and include examples of how the feature is used. Any new terminology should be
defined here.

# Testing Strategy

How will this feature's implementation be tested? Explain if this can be tested with
unit tests or integration tests or something else. If relevant, explain the test
cases that will be added to cover all of the ways this feature might be used.

# Drawbacks

Why should we _not_ do this? Please consider:

- Implementation cost, both in term of code size and complexity.
- Whether the proposed feature can be implemented in user space.
- Impact on teaching people Astro.
- Integration of this feature with other existing and planned features
- Cost of migrating existing Astro applications (_is it a breaking change?_)

There are tradeoffs to choosing any path. Attempt to identify them here.

# Alternatives

What other designs have been considered? What is the impact of not doing this?

# Adoption strategy

Please consider:

- If we implement this proposal, how will existing Astro developers adopt it?
- Is this a breaking change? Can we write a codemod?
- Can we provide a runtime adapter library for the original API it replaces?
- How will this affect other projects in the Astro ecosystem?

# Unresolved Questions

Optional, but suggested for first drafts.
What parts of the design are still to be determined?
