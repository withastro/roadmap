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

##### Definition

A provider allows to retrieve font faces data from a font family name from a given CDN or abstraction. It's a [unifont](https://github.com/unjs/unifont) provider.

##### Built-in providers

###### Google

This is the default, and it's not configurable. Given the amount of fonts it supports by, it sounds like a logic choice. Note that the default can be customized for more advanced usecases.

```js
export default defineConfig({
  fonts: {
    families: ["Roboto"],
  },
});
```

```js
export default defineConfig({
  fonts: {
    defaults: {
      provider: "local",
    },
    families: [
      {
        name: "Roboto",
        provider: "google",
      },
    ],
  },
});
```

###### Local

This provider, unlike all the others, requires paths to fonts relatively to the root.

```js
import { defineConfig, fontProviders } from "astro/config";
import { myCustomFontProvider } from "./provider";

export default defineConfig({
  fonts: {
    families: [
      {
        name: "Custom",
        provider: "local",
        src: ["./assets/fonts/Custom.woff2"],
      },
    ],
  },
});
```

##### Opt-in providers

Other unifont providers are exported from `astro/config`.

```js
import { defineConfig, fontProviders } from "astro/config";
import { myCustomFontProvider } from "./provider";

export default defineConfig({
  fonts: {
    providers: [
      fontProviders.adobe({ apiKey: process.env.ADOBE_FONTS_API_KEY }),
      myCustomFontProvider(),
    ],
    // ...
  },
});
```

##### Why this API?

1. **Coherent API**: a few things in Astro are using this pattern, namely integrations and vite plugins. It's simple to author as a library author, easy to use as a user
2. **Keep opt-in providers**: allows to only use 2 providers by default, and keeps the API open to anyone
3. **Types!**: now that `defineConfig` [supports generics](https://github.com/withastro/astro/pull/12243), we can do powerful things! Associated with type generation, we can generate types for `families` `name`, infer the provider type from `defaults.provider` and more.

#### Defaults

Astro must provide sensible defaults when it comes to font weights, subsets and more. But when dealing with more custom advanced setups, it makes sense to be able to customize those defaults. They can be set in `fonts.defaults` and will be merged with Astro defaults (arrays do not merge).

> TODO: need to see how it plays with the integration API `updateConfig()`

We need to decide what default to provide. I can see 2 paths:

| Path      | Example (weight)    | Advantage             | Downside                                                                          |
| --------- | ------------------- | --------------------- | --------------------------------------------------------------------------------- |
| Minimal   | Only include `400`  | Lightweight           | People will probably struggle by expecting all weights to be available by default |
| Extensive | Include all weights | Predictable for users | Heavier by default                                                                |

#### Families

TODO:

The following API has been suggested for the simpler cases:

```js
export default defineConfig({
  fonts: ["Roboto"]
})
```

I'd love to support such API where you can provide fonts top level, or inside `fonts.families` but we can't. We can't because of how the integration API `defineConfig()` works. What if a user provides fonts names as `fonts`, and an integration provides fonts names as `fonts.families`? Given how the merging works, the shape of `AstroUserConfig` and `AstroConfig` musn't be too different. It already caused issues with i18n in the past.

### Font component

Setting the config (see above) configures what fonts to download, but it doesn't include font automatically on pages. Instead, we provide a `<Font />` component that can be used to compose where and how to load fonts.

```astro
---
import { Font } from "astro:assets"
---
<head>
  <Font family="Inter" preload cssVar="primary-font" />
  <Font family="Lato" />
</head>
```

#### Family

The family will be typed using type gen, based on the user's config.

#### Preload

Defaults to `false`:

- **Enabled**: Outputs a preload link tag and a style tag, without fallbacks (TODO: check if we should actually include fallbacks there as well)
- **Disabled**: Output a style tag with fallbacks

#### cssVar

Defaults to `astro-font-${computedFontName}`. Specifies what identifier to use for the generated css variable. This is useful for font families names that may contain special character or conflict with other fonts.

### Usage

Since fallbacks may be generated for a given family name, this name can't be used alone reliably:

```css
h1 {
  font-family: "Inter"; /* Should actually be "Inter", "Inter Fallback" */
}
```

To solve this issue, a css variable is provided by the style tage generated by the `<Font />` component:

```css
h1 {
  font-family: var(--astro-font-inter); /* "Inter", "Inter Fallback" */
}
```

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
