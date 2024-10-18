**If you have feedback and the feature is released as experimental, please leave it on the Stage 3 PR. Otherwise, comment on the Stage 2 issue (links below).**

- Start Date: 2024-10-15
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: <!-- leave empty -->
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1037
- Stage 3 PR: https://github.com/withastro/roadmap/pull/1039

# Summary

Have first-party support for fonts in Astro.

# Example

```js
// astro config
export default defineConfig({
  fonts: {
    families: ["Roboto", "Lato"],
  },
});
```

```astro
---
// layouts/Layout.astro
import { Font } from 'astro:fonts'
---
<head>
	<Font family='Inter' preload />
	<Font family='Lato' />
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

### Astro config

#### Overview

The goal is to have a config that starts really simple for basic usecases, but can also be complex for advanced usecases. Here's an example of basic config:

```js
import { defineConfig } from "astro/config";

export default defineConfig({
  fonts: {
    families: ["Roboto", "Lato"],
  },
});
```

That would get fonts from [Google Fonts](https://fonts.google.com/) with sensible defaults (TBD).

Here's a more complex example:

```js
import { defineConfig, fontProviders } from "astro/config";
import { myCustomFontProvider } from "./provider";

export default defineConfig({
  fonts: {
    providers: [
      fontProviders.adobe({ apiKey: process.env.ADOBE_FONTS_API_KEY }),
      myCustomFontProvider(),
    ],
    defaults: {
      provider: "adobe",
      weights: [200, 700],
      styles: ["italic"],
      subsets: [
        "cyrillic-ext",
        "cyrillic",
        "greek-ext",
        "greek",
        "vietnamese",
        "latin-ext",
        "latin",
      ],
    },
    families: [
      "Roboto",
      {
        name: "Lato",
        provider: "google",
        weights: [100, 200, 300],
      },
      {
        name: "Custom",
        provider: "local",
        src: ["./assets/fonts/Custom.woff2"],
      },
    ],
  },
});
```

#### Providers

#### Defaults

#### Families

### Font component

- typegen
- preload and fallback

### Usage

- css var

### How it works under the hood

- Resolve fonts using unifont
- Generate fallbacks with fontaine
- Inject vite middleware to download fonts as they're requested in dev
- Download everything in build
- Caching (.astro in dev, cacheDir in build)

# Testing Strategy

- Integration tests
- Experimental flag

# Drawbacks

Why should we _not_ do this? Please consider:

- Implementation cost, both in term of code size and complexity.
- Whether the proposed feature can be implemented in user space.
- Impact on teaching people Astro.
- Integration of this feature with other existing and planned features
- Cost of migrating existing Astro applications (_is it a breaking change?_)

There are tradeoffs to choosing any path. Attempt to identify them here.

# Alternatives

- standalone integration: possible but less discoverable. Making it in core also allows to use the `astro:assets` virtual import

# Adoption strategy

Please consider:

- If we implement this proposal, how will existing Astro developers adopt it?

code snippets

- Is this a breaking change? Can we write a codemod?

no

- How will this affect other projects in the Astro ecosystem?

should make astro-font obsolete

# Unresolved Questions

Optional, but suggested for first drafts.
What parts of the design are still to be determined?
