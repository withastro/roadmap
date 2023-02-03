- Start Date: 2022-03-22
- Reference Issues: [[Roadmap] Astro v1.0](https://github.com/withastro/roadmap/discussions/1)
- Implementation PR: <!-- leave empty -->

# Summary

Astro's configuration file is something we'd like to clean up prior to a v1.0 Beta release. Currently, it is not evident which specific options should go in which area, leading to user confusion and ocassional duplication.

This RFC proposes a clean-up of the existing Astro config file format for consistency and clarity.

# Example

When this RFC is accepted, a config file for Astro might look something like this:

```js
import { defineConfig } from 'astro';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
    logLevel: 'info',
    root: '.',

    srcDir: './src',
    publicDir: './public',
    outDir: './dist',

    site: 'https://example.com',
    base: '/',
    trailingSlash: 'always',

    build: {
        format: 'file',
    },

    // A: defaults for both `astro dev` and `astro preview`
    server: {
        port: 3000
    },

    // B: configure `astro dev` and `astro preview` individually
    server({ command }) => ({
        host: command === 'dev' ? '0.0.0.0' : false,
        port: command === 'dev' ? 3000 : 3001,
    }),

    markdown: {
        drafts: true,
        syntaxHighlight: 'shiki',
    },

    integrations: [
        preact(),
        sitemap({
            canonicalURL: 'https://example.com',
            filter: (page) => page !== 'http://example.com/secret-page')
        })
    ],

    vite: {}
})
```

# Detailed design

## Top-Level Options

- Add `logLevel`. Previously only supported through CLI flag.
- Add `trailingSlash`. Previously `devOptions.trailingSlash`.
- Add `site`. Previously `buildOptions.site`.
- Add `base`. Type is `string`, defaults to `/`. Previously derived from `buildOptions.site.pathname`.

## Directories

For consistency and familiarity, the following properties have been renamed to match Vite and SvelteKit where possible.

- Rename `projectRoot` => `root`. This matches Vite's `root` option.
- Rename `src` => `srcDir`
- Rename `public` => `publicDir`. This matches Vite's `publicDir` option.
- Rename `dist` => `outDir`. This matches Vite's `build.outDir` option, but is moved to the top-level.
- Remove explicit `pages` option. This is derived from `new URL('./pages', srcDir)`.

## Build

- Rename `buildOptions` => `build`
- Rename `pageUrlFormat` => `format`
- Remove `site`. See [Top-Level Options](#top-level-options).
- Remove `sitemap`. See [Sitemap](#sitemap).
- Remove `sitemapFilter`. See [Sitemap](#sitemap).
- Remove `legacyBuild`
- Remove `experimentalSsr`. See [Experimental](#experimental).

## Server

This RFC introduces a new `server` option. These settings configure both `dev` and `preview`, but both can be overidden using a function.

- Add `host`. Type is `string | boolean`, defaults to `false`.
- Add `port`. Type is `number`, defaults to `3000`.
- Can be a function that returns `{ host, port }` based on a `{ command = 'dev' | 'preview' }` argument

## Dev

- Remove `devOptions`
- Remove `trailingSlash`. See [Top-Level Options](#top-level-options).

## Markdown

The `markdownOptions` is currently one of the most confusing options in the Astro config.
This RFC proposes:

- Rename `markdownOptions` => `markdown`
- Remove `render`
- Remove references to `@astrojs/markdown-remark` in `render[0]`. Remark is the built-in Markdown integration—it will not be pluggable in v1.0.
  > Internally this may be implemented in a pluggable manner, but that's an implementation detail.
- Move the `render[1]` options object to the top-level.
- Move `buildOptions.draft` => `markdown.drafts`

# Sitemap

This RFC proposes that the `buildOptions.sitemap` and `buildOptions.sitemapFilter` options are removed entirely.

This usecase is handled by the `@astrojs/sitemap` integration, so users should install and configure `@astrojs/sitemap` if they previously used `buildOptions.sitemap`.

## Style

- Rename `styleOptions` => `style`
- Passed through to `vite.css`

## Integrations

There are no proposed changes to the `integrations` array.

## Experimental

This RFC introduces a new `experimental` option. This is where future experimental options will go.

- Add `ssr`. Type is `boolean`, defaults to `false`.

## Vite

There are no proposed changes to the `vite` object.

# Drawbacks

Churn is the major concern, but now is the time to make breaking "clean-up" changes like this!

# Adoption strategy

In addition to `defineConfig` providing the new config types, this RFC will be aided by documentation in the form of a Migration Guide.

Internally, Astro should be able to implement this as a non-breaking change during the v1.0.0 beta period. We should detect and adapt the legacy config format to match the new config format. On CLI startup, we will log helpful migration messages.

Prior to the official v1.0.0 release of Astro, logic around legacy config migration can be removed from the codebase.
