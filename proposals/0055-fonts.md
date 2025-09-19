**If you have feedback and the feature is released as experimental, please leave it on the Stage 3 PR. Otherwise, comment on the Stage 2 issue (links below).**

- Start Date: 2024-10-15
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: https://github.com/withastro/astro/pull/12775
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1037
- Stage 3 PR: https://github.com/withastro/roadmap/pull/1039

# Summary

Have first-party support for fonts in Astro.

# Example

```js
// astro.config.mjs
import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  fonts: [
    {
      name: "Roboto",
      cssVariable: "--font-roboto",
      provider: fontProviders.google(),
    },
  ],
});
```

```astro
---
// layouts/Layout.astro
import { Font } from "astro:fonts"
---
<head>
	<Font cssVariable="--font-roboto" />
	<style>
		h1 {
			font-family: var(--font-roboto);
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
- Allow generating fallbacks automatically
- Performant defaults
- Runtime agnostic
- Configure font families (subset, unicode range, weights etc)

# Non-Goals

- Runtime API (SSR remains supported)
- Automatic subsetting (eg. analyzing static content)
- Automatic font detection (ie. downloading fonts based on font families names used in the user's project)

# Detailed Design

## Astro config

### Overview

The goal is to have a config that starts really simple for basic usecases, but can also be complex for advanced usecases. Here's an example of basic config:

```js
import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  fonts: [
    {
      name: "Roboto",
      cssVariable: "--font-roboto",
      provider: fontProviders.google(),
    },
  ],
});
```

That would get fonts from [Google Fonts](https://fonts.google.com/) with sensible defaults.

Here's a more complex example:

```js
import { defineConfig, fontProviders } from "astro/config";
import { myCustomFontProvider } from "./provider";

export default defineConfig({
  fonts: [
    {
      name: "Roboto",
      cssVariable: "--font-roboto",
      provider: fontProviders.google(),
    },
    {
      name: "Lato",
      cssVariable: "--font-lato",
      provider: fontProviders.adobe({
        apiKey: process.env.ADOBE_FONTS_API_KEY,
      }),
      weights: [100, 200, 300],
    },
    {
      name: "Custom",
      cssVariable: "--that-can-be-anything",
      provider: "local",
      variants: [
        { src: ["./assets/fonts/Custom.woff2"], weight: 400, style: "normal" },
      ],
    },
  ],
});
```

### Providers

#### Definition

A provider allows to retrieve font faces data from a font family name from a given CDN or abstraction. It's an abstraction on top of [unifont](https://github.com/unjs/unifont) providers.

#### Available providers

##### Local

This provider, unlike all the others, requires specifying fonts properties as you would do it for [`@font-face`](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face). `src` is an array of entrypoints:

```js
import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  fonts: [
    {
      name: "Custom",
      cssVariable: "--font-custom",
      provider: "local",
      variants: [
        {
          // Can be a path relative to the project root, a package import or a URL
          src: [
            "./assets/fonts/Custom.woff2", // Relative to the root
            new URL("./test.ttf", import.meta.url), // URL
            "my-package/font.woff", // Package import
            { url: "./abc.woff2", tech: "variations" },
          ],
          weight: 400,
          style: "normal",
        },
      ],
    },
  ],
});
```

`weight` and `style` will be inferred from the the first source if they are omitted.

##### Remote providers

Other unifont providers are exported from `astro/config` and can be passed as `provider`:

```js
import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  fonts: [
    {
      name: "Roboto",
      cssVariable: "--font-roboto",
      provider: fontProviders.google(),
    },
    {
      name: "Lato",
      cssVariable: "--font-lato",
      provider: fontProviders.adobe({
        apiKey: process.env.ADOBE_FONTS_API_KEY,
      }),
    },
  ],
});
```

Note that under the hood, the definition looks like:

```ts
function adobe(config: AdobeConfig) {
  return defineAstroFontProvider({
    // Can be a path relative to the project root, a package import or a URL
    entrypoint: "astro/assets/fonts/adobe",
    config,
  });
}

export const fontProviders = {
  adobe,
  bunny,
  fontshare,
  fontsource,
  google,
};
```

#### Why this API?

1. **Coherent API**: a few things in Astro are using this pattern, namely integrations and vite plugins. It's simple to author as a library author, easy to use as a user
2. **Keep opt-in providers**: allows to only use 2 providers by default, and keeps the API open to anyone
3. **Types!**: now that `defineConfig` [supports generics](https://github.com/withastro/astro/pull/12243), we can do powerful things! Associated with type generation, we can generate types for `families` `name`, infer the provider type from `provider` and more.

### Defaults

Astro provides sensible defaults:

- Weight: `400`
- Styles: `normal` and `italic`
- Subsets: `cyrillic-ext`, `cyrillic`, `greek-ext`, `greek`, `vietnamese`, `latin-ext` and `latin`
- Fallbacks: `sans-serif`

### Families

A family is made of a least a `name` and a `cssVariable`:

```js
export default defineConfig({
  fonts: [
    {
      name: "Roboto",
      cssVariable: "--font-roboto",
      provider: fontProviders.google(),
    },
  ],
});
```

It can specify options such as `weights` and `subsets`:

```js
export default defineConfig({
  fonts: [
    {
      name: "Roboto",
      cssVariable: "--font-roboto",
      provider: fontProviders.google(),
      weights: [400, 600],
    },
  ],
});
```

It can also specify a `provider` (and `variants` if it's the `local` provider):

```js
export default defineConfig({
  fonts: [
    {
      name: "Roboto",
      cssVariable: "--font-roboto",
      provider: "local",
    },
  ],
});
```

And using the component as follows:

```astro
---
import { Font } from "astro:assets"
---
<head>
  <Font cssVariable="--font-roboto" />
</head>
```

The following CSS variable would be generated:

```css
:root {
  --font-roboto: Roboto-0acbad, "Roboto-0acbad fallback: Arial", sans-serif;
}
```

### Font component

Setting the config (see above) configures what fonts to download, but it doesn't include font automatically on pages. Instead, we provide a `<Font />` component that can be used to compose where and how to load fonts.

```astro
---
import { Font } from "astro:assets"
---
<head>
  <Font cssVariable="--font-roboto" preload />
  <Font cssVariable="--custom" />
</head>
```

### `getFontData()`

For more advanced needs, the `getFontData()` helper allows retrieving lower level data for a given `cssVariable`:

```ts
import { getFontData } from "astro:assets"

const data = getFontData("--font-roboto")
```

### cssVariable

The cssVariable will be typed using type gen, based on the user's config.

### preload

Defaults to `false`. Will output preload link tags.

## Usage

Since fallbacks may be generated for a given family name, this name can't be used alone reliably:

```css
h1 {
  font-family: "Inter"; /* Should actually be "Inter", "Inter Fallback" */
}
```

To solve this issue, a css variable is provided by the style tage generated by the `<Font />` component:

```css
h1 {
  font-family: var(--font-inter); /* Inter, "Inter Fallback" */
}
```

## Fallbacks

### What are they?

A fallback is a font that is displayed while the font you want is loading:

- A page loads, the `BigShinyCoolFont.woff2` file has not loaded yet, what should happen? Ideally text should be rendered still but we don’t have the correct font yet
- In the past this just mean you had a “stack” like `font-family: "Big Shiny Cool Font", Helvetica, Arial, sans-serif;` that named some common system fonts to use if `"Big Shiny Cool Font"` is not available
- However, this can lead to a lot of layout shift. Fonts all have different proportions, so just switching from a system font to your custom font can be quite a janky loading experience
- Modern browsers provide CSS tools to adjust how fallback fonts display to make them more close to the custom font _proportions_ (obviously the fonts will still be different but you can adjust so that the layout doesn’t shift as much)
- `capsize` allows to extract metrics from the target font (`"Big Shiny Cool Font"` in this example) and automatically calculate settings to apply to the fallbacks to improve the perceived loading experience

Check out [this article](https://developer.chrome.com/blog/font-fallbacks/) to understand the technique.

### Defaults

Fallbaks default to `["sans-serif"]`. Technically serif is the browser default but most websites these days use sans-serif so it makes sense to set it as a default so users can benefit from optimizations out of the box.

### What and how are we generating them?

We generate useful fallbacks when possible (conditions specified below):

- We get metrics using the family name thanks to [`capsize`](https://github.com/seek-oss/capsize/). We use this library because its APIs match our usage but if we wanted more control, we could use `capsizecss` which is used under the hood
- We check the last fallback to see if it's a generic family name (eg. sans-serif)
- We get associated local fonts (eg. Arial)
- We generate font faces so that the local font matches the original font shape

Here are all the conditions required to generate a custom fallback:

- The family has at least one fallback
- The last fallback is a generic family name. We don't want to error/log because it's absolute valid not to use some
- The generic font family has local fonts associated
- Metrics can be generated from this family

The easiest way to benefit from fallback generation is by doing the following:

```js
{
  name: "Roboto",
  cssVariable: "--font-roboto",
  provider: fontProviders.google(),
  fallbacks: ["sans-serif"]
}
```

This will give `Roboto, "Roboto fallback: Arial", sans-serif`. Here, `Roboto fallback: Arial` is generated by Astro because it could get metrics from the Roboto font. We use Arial because it's a sans-serif font. It's still possible to provide more fallbacks:

```js
{
  name: "Roboto",
  cssVariable: "--font-roboto",
  provider: fontProviders.google(),
  fallbacks: ["Times New Roman", "sans-serif"]
}
```

This will give `Roboto, "Roboto fallback: Arial", "Times New Roman", sans-serif`.

### Disabling automatic fallback generation

You can set `optimizedFallbacks: false` to disable this behavior. This config:

```js
{
  name: "Roboto",
  cssVariable: "--font-roboto",
  fallbacks: ["Custom", "sans-serif"],
  provider: fontProviders.google(),
  optimizedFallbacks: false
}
```

will generate:

```js
{
  name: "Roboto",
  cssVariable: "--font-roboto",
  fallbacks: ["Custom", "sans-serif"],
}
```

## How it works under the hood

- Once the config is fully resolved, we get fonts face data using `unifont`
- We generate fallbacks using `capsize` and pass all the data we need through a virtual import, used by the `<Font />` component
- We inject a vite middleware in development to download fonts as they are requested in development
- During build, we download all fonts and save them to `config.outDir` (or `config.build.client` with a server build output)

## Caching

When resolving fonts data, we keep track of the original URLs and filepaths and replace them with a URL we control: `/_astro/fonts/<hash>.<ext>`.

### Development

When a font file is requested using a hash, we download it using its original URL and save it to `.astro/fonts`. If the file already exists, we serve it without downloading from its original URL.

Note that font files requests are never cached to make it easier to debug. Caching is happening at another level (described above).

### Build

We go through all fonts data, download the files to `node_modules/.astro/fonts` and copy them to the client output directory. We avoid downloading files if they already exist.

# Testing Strategy

- Integration tests
- Experimental flag (`experimental.fonts`)

# Drawbacks

I have not identified any outstanding drawback:

- **Implementation cost, both in term of code size and complexity**: fine
- **Whether the proposed feature can be implemented in user space**: yes
- **Impact on teaching people Astro**: should make things easier, will need updating docs
- **Integration of this feature with other existing and planned features**: reuses `astro:assets` to export the component, otherwise isolated from other features
- **Is it a breaking change?** No

# Alternatives

## As an integration

This feature could be developed as an integration, eg. `@astrojs/fonts`. Making it part of core allows to make it more discoverable, more used. It also allows to use the `astro:assets` module for the `<Font />` component.

# Adoption strategy

- **If we implement this proposal, how will existing Astro developers adopt it?** Fonts setups can vary a lot but migrating to the core fonts api should not require too much work
- **Is this a breaking change? Can we write a codemod?** No
- **How will this affect other projects in the Astro ecosystem?** This should make [`astro-font`](https://github.com/rishi-raj-jain/astro-font) obsolete
