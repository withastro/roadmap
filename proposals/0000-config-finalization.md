- Start Date: 2022-03-22
- Reference Issues: [[Roadmap] Astro v1.0](https://github.com/withastro/rfcs/discussions/1)
- Implementation PR: <!-- leave empty -->

# Summary

Astro's configuration file is something we'd like to clean up prior to a v1.0 Beta release. Currently, it is not evident which specific options should go in which area, leading to user confusion and ocassional duplication.

This RFC proposes a clean-up of the existing Astro config file format for consistency and clarity.

# Example

When this RFC is accepted, a config file for Astro might look something like this:

```js
import { defineConfig } from 'astro';
import preact from '@astrojs/preact';

export default defineConfig({
    log: 'info',

    rootDir: '.',
    srcDir: './src',
    publicDir: './public',
    outDir: './dist',

    site: 'https://example.com',
    trailingSlash: 'always',
    basePath: '/',

    build: {
        format: 'file',
    },

    server: {
        port: 3000
    },

    dev: {
        host: '0.0.0.0',
    },

    preview: {
        host: false,
        port: 8080
    },

    markdown: {
        drafts: true,
        syntaxHighlight: 'shiki',
    },

    sitemap: {
        canonicalURL: 'https://example.com',
        filter: (page) => page !== 'http://example.com/secret-page')
    },

    integrations: [
        preact()
    ],

    vite: {}
})
```

# Detailed design

## Top-Level Options

- Add `log`. Previously only supported through CLI flag.
- Add `trailingSlash`. Previously `devOptions.trailingSlash`.
- Add `site`. Previously `buildOptions.site`.
- Add `basePath`. Type is `string`, defaults to `/`. Previously derived from `buildOptions.site.pathname`.

## Directories

For consistency, the following properties have been renamed to include a `Dir` suffix. This is a convention borrowed from tools like Vite and Svelte Kit and will be more familiar to users.

- Rename `projectRoot` => `rootDir`
- Rename `src` => `srcDir`
- Rename `public` => `publicDir`
- Rename `dist` => `outDir`
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

This RFC introduces a new `server` option. These settings configure both `dev` and `preview`, but both can be overidden.

- Add `host`. Type is `string | boolean`, defaults to `false`.
- Add `port`. Type is `number`, defaults to `3000`.

## Dev

- Rename `devOptions` => `dev`.
- Inherits all settings from `server`, each can be overridden here to only apply to `astro dev`.
- Remove `trailingSlash`. See [Top-Level Options](#top-level-options).

## Preview

This RFC introduces a new `preview` option. 

- Inherits all settings from `server`, each can be overridden here to only apply to `astro preview`.

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

This RFC introduces a new `sitemap` option.

- Add `canonicalURL`. Defaults to top-level `site`.
- Add `filter`. Type is `(name: string) => boolean`, previously `buildOptions.sitemapFilter`.

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

In addition to `defineConfig` providing the new config types, this RFC will be aided by documentation in the form of a Mirgration Guide.

If possible, we should introduce a codemod to automate migration.
