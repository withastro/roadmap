- Start Date: 2026-10-17
- Reference Issues: https://github.com/withastro/roadmap/discussions/1378
- Implementation PR: <!-- leave empty -->
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1450
- Stage 3 PR: https://github.com/withastro/roadmap/pull/1456

# Summary

Split `astro` into a set of independently usable Vite plugins — the `.astro` language, a pages router, and one plugin per feature — and rebuild the `astro` CLI as a composition of them.

# Example

**Just the language** — Astro components rendered by Hono routes, with a React island:

```js
// vite.config.js
import astro from '@astrojs/vite-plugin-astro';
import react from '@astrojs/react/renderer';

export default {
  plugins: [
    astro({
      renderers: [react()],
    }),
  ],
};
```

```ts
// src/app.ts
import { Hono } from 'hono';
import { renderToResponse } from '@astrojs/runtime';
import Page from './components/Page.astro';

const app = new Hono();

app.get('/hello/:name', (c) => renderToResponse(Page, { props: { name: c.req.param('name') } }));
```

**Pages** — a site with file routing and nothing else:

```js
import astro from '@astrojs/vite-plugin-astro';
import pages from '@astrojs/vite-plugin-pages';

export default { plugins: [astro(), pages()] }; // vite dev / vite build
```

**Pick your features:**

```js
export default {
  plugins: [
    astro({ site: 'https://example.com' }),
    pages({ output: 'server' }),
    content(),
    markdown(),
    assets(),
    i18n({ defaultLocale: 'en', locales: ['en', 'es'] }),
    // no actions, no sessions, no toolbar
  ],
};
```

# Background & Motivation

Astro has become a collection of strong primitives — the `.astro` component language, islands, file-based routing, content collections, actions, i18n, sessions, image optimization, fonts — delivered as a single package with a single CLI.

However currently using this is an all-or-nothing proposition. If you want to use something else for a particular task you can, but you will incur the cost in package size nonetheless, which often pushes you towards using the built-in primitives. For Astro this presents a risk, if the perception of any of the parts is negative it can lead to negative feelings about the framework as a whole.

Additionally, many projects do not start out using Astro, but they do start out using Vite. Making Astro available as a plugin lets those people *upgrade* to use Astro without rewriting their entire application.

This proposal grew out of [Standalone `.astro` file usage](https://github.com/withastro/roadmap/discussions/1378), which asked for `.astro` files to be usable in plain Vite projects. A prototype ([withastro/astro#17094](https://github.com/withastro/astro/pull/17094), tried out in [web-runes/vite-deploy#47](https://github.com/web-runes/vite-deploy/pull/47)) showed that compiling `.astro` files in a separate plugin is straightforward, but that rendering them, especially islands and styles, depends on runtime metadata that today only the full framework provides. This RFC widens the scope from the language alone to every feature, so that the plugin boundaries are designed together.

# Goals

- Make it possible to use Astro in all Vite projects, and to use Astro itself in [Vite+](https://viteplus.dev/).
- Make it possible to use Astro islands in non-Astro projects, like in a mostly-api app that uses Hono.
  - Related, using Astro for the "marketing site" of a SPA that is using something else.
- Allow sites to choose non-Astro based tools when Astro tools already exist; for example building an Astro site that includes an RPC library, such as TRPC without the burden of also having Astro Actions installed.
- Reducing the overall filesize of typical Astro applications.
- Set us up for Astro 8 in which we could trim the `astro` package itself.

## Stretch goals

- A single "all-in-one" plugin that enables every feature, for Vite users who want the whole framework without listing each plugin.

# Non-Goals

- Changing what `astro` does for existing users, the `.astro` language, the integration API, or the adapter API.
- Replacing integrations with Vite plugins. Integrations remain the extension mechanism of the full framework; the plugins are a lower layer the framework is built on.
- Extracting features into framework-agnostic cores (e.g. content collections for non-Astro use). Possible later; out of scope here.
- Supporting bundlers other than Vite. There will be a separate package for the runtime so this is theoretically possible but not something worth pursuing.
- Running any existing `.astro` file unmodified outside of the full framework. Framework features such as tsconfig path aliasing are not part of the language plugin; islands, styles, and view transition directives are.

# Detailed Design

<!-- TODO -->

## Packages

All packages are published under the `@astrojs/` scope. Each plugin package's default export is a function that returns Vite plugins.

```
astro → vite-plugin-pages (+ feature plugins) → vite-plugin-astro → runtime
```

| Layer       | Package                            | Plugin         | What it contains                                                                                                                                              |
| ----------- | ---------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime     | `@astrojs/runtime`                 | —              | What compiled components run: the render runtime, client directive scripts, the JSX runtime, head propagation, `AstroError` and the base render types. No dependency on Vite, the compiler or a bundler. |
| Language    | `@astrojs/vite-plugin-astro`       | `astro()`      | The `.astro` compiler plugins, scoped styles, islands, client directives, `<script>` processing, renderers, and the render API (`/render`).                     |
| Routing     | `@astrojs/vite-plugin-pages`       | `pages()`      | File-based routing, the request pipeline, middleware, the dev server, the production build (prerendering, server entry, manifest), server islands, the client router, and the API feature plugins build on. |
| Features    | `@astrojs/vite-plugin-actions`     | `actions()`    | `astro:actions`, the action endpoint and form actions.                                                                                                        |
|             | `@astrojs/vite-plugin-assets`      | `assets()`     | `astro:assets`, image services, the image endpoint and build-time image generation.                                                                           |
|             | `@astrojs/vite-plugin-cache`       | `cache()`      | `Astro.cache`, route rules and cache providers.                                                                                                               |
|             | `@astrojs/vite-plugin-content`     | `content()`    | Content collections: the content layer, loaders, the data store and `astro:content`.                                                                          |
|             | `@astrojs/vite-plugin-dev-toolbar` | `devToolbar()` | The dev toolbar and its app API.                                                                                                                              |
|             | `@astrojs/vite-plugin-env`         | `env()`        | `astro:env` and private `import.meta.env` variables.                                                                                                          |
|             | `@astrojs/vite-plugin-fonts`       | `fonts()`      | Font providers, optimized fallbacks and `<Font />`.                                                                                                           |
|             | `@astrojs/vite-plugin-i18n`        | `i18n()`       | Locale routing, fallbacks and `astro:i18n`.                                                                                                                   |
|             | `@astrojs/vite-plugin-markdown`    | `markdown()`   | Markdown pages and `.md` modules.                                                                                                                             |
|             | `@astrojs/vite-plugin-prefetch`    | `prefetch()`   | Link prefetching and speculation rules.                                                                                                                       |
|             | `@astrojs/vite-plugin-sessions`    | `sessions()`   | `Astro.session` and session drivers.                                                                                                                          |
| Framework   | `astro`                            | —              | The CLI, config loading, integrations and adapters, `astro sync` / `check` / `add`, and the existing `astro/*` entrypoints, which re-export the packages above. |

## The language plugin

`astro()` makes `.astro` files importable in any Vite project. It compiles components, processes their `<style>` and `<script>` blocks, handles `client:*` directives, and provides HMR the same way the framework does today.

```js
astro({
  site: 'https://example.com',
  srcDir: './src',
  compressHTML: true,
  renderers: [],
  clientDirectives: [],
});
```

The options are the language-level subset of today's Astro config, and every one is optional. Vite already provides `root` and `base`, so `astro()` reads them from Vite instead of adding its own.

### Styles and islands without pages

In the framework, the CSS and scripts a page needs are collected per page, at build time, by the router. A standalone component has no page, so `astro()` collects them per **component tree** instead:

- **Dev:** it walks the server module graph from the rendered component. Styles are inlined. Islands and scripts point at URLs the Vite dev server serves.
- **Build:** it uses Vite's app builder to build the server environments first. Their module graphs decide the client build entries: one stylesheet per component, plus every hydrated component and script. The resulting URLs are written into the server output.

This is the metadata the prototype was missing. The render API (see [The runtime](#the-runtime)) returns it with the HTML, so `renderToResponse(Page)` produces a complete page with working islands.

### The `Astro` global

Standalone, `Astro` has the members that only depend on the component: `props`, `slots`, `self`, `request`, `url`, `site` and `generator`. Request-level members (`cookies`, `params`, `redirect`, `locals`, `session`, …) come from `pages()` and its feature plugins.

## The runtime

<!-- TODO: @astrojs/runtime and renderToResponse; how island and style metadata reach it. -->

## Renderers

<!-- TODO: how framework renderers (React, Vue, ...) plug into the language plugin. -->

## The pages plugin

<!-- TODO: file routing, output modes, adapters. -->

## Feature plugins

<!-- TODO: content, markdown, assets, i18n, actions, sessions, fonts, toolbar, and their dependencies. -->

## Shared configuration

<!-- TODO: how plugins share config (e.g. `site`) and discover each other. -->

## The astro CLI and integrations

<!-- TODO: how astro.config.mjs and integrations map onto the plugins. -->

# Testing Strategy

<!-- TODO -->

# Drawbacks

<!-- TODO -->

# Alternatives

<!-- TODO -->

# Adoption strategy

<!-- TODO -->

# Unresolved Questions

- How do plugins share configuration and find each other? For example, how does `pages()` learn `site` from `astro()`?
- What is the `@astrojs/runtime` API, and how does island and style metadata reach it without the full framework?
- How do `astro.config.mjs` and the integration API map onto the plugins?
- Package naming: `@astrojs/vite-plugin-*` (as in the examples) or unscoped `vite-plugin-astro` (as in the prototype, to match plugins like `vite-plugin-react`)?
- Which features depend on each other (e.g. does `content()` require `markdown()`?), and how is a missing dependency reported?
