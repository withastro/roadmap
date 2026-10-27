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
| Runtime     | `@astrojs/runtime`                 | —              | What compiled components run: the render runtime, client directive scripts, the JSX runtime, head propagation, `AstroError`, the base render types and the render API (`renderToResponse`). No dependency on Vite, the compiler or a bundler. |
| Language    | `@astrojs/vite-plugin-astro`       | `astro()`      | The `.astro` compiler plugins, scoped styles, islands, client directives, `<script>` processing and renderers.                                                   |
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

This is the metadata the prototype was missing. The render API (see [The runtime](#the-runtime)) uses it, so `renderToResponse(Page)` produces a complete page with working islands.

### The `Astro` global

Standalone, `Astro` has the members that only depend on the component: `props`, `slots`, `self`, `request`, `url`, `site` and `generator`. Request-level members (`cookies`, `params`, `redirect`, `locals`, `session`, …) come from `pages()` and its feature plugins.

## The runtime

`@astrojs/runtime` is the code compiled components run: the render runtime, the client directive scripts, the JSX runtime and the base types, including `AstroGlobal`. It has no dependency on Vite, the compiler or a bundler. Compiled `.astro` output imports it, and `astro()` resolves it from its own dependency, so projects don't install it themselves.

```ts
import { renderToString, renderToResponse } from '@astrojs/runtime';

const html = await renderToString(Page, { props, slots, request });
const response = await renderToResponse(Page, { props });
```

By default the result is a full document: `<!DOCTYPE html>` is added and the component tree's stylesheets are injected into `<head>`. Pass `partial: true` to get a fragment instead.

To render islands and styles, the runtime needs metadata that only `astro()` knows: the registered renderers, the client directives, and the stylesheets and client URLs of each component tree (see [Styles and islands without pages](#styles-and-islands-without-pages)). Compiled components bring it with them. `astro()` adds an import of a small setup module to every component it compiles, and that module registers the metadata with the runtime. The runtime itself never imports anything from Vite.

**Without Vite**, use `createRenderer()` and supply that metadata yourself:

```js
import { createRenderer } from '@astrojs/runtime';

const { renderToString } = createRenderer({
  renderers,
  componentAssets: (id) => manifest[id],
  resolve: (specifier) => urls[specifier],
});
```

This renders components compiled ahead of time, for example with `@astrojs/compiler-rs`, in any JavaScript runtime. It is the base for tooling other than Vite.

`pages()` renders with the same runtime, but builds its own per-request context. That context adds the request-level members of `Astro` (see [The `Astro` global](#the-astro-global)).

## Renderers

A renderer only renders. It tells Astro how to render a framework's components to HTML on the server and how to hydrate them in the browser. Compiling the framework's files is the job of that framework's own Vite plugin, the same one any Vite app uses.

```js
import astro from '@astrojs/vite-plugin-astro';
import react from '@astrojs/react/renderer';
import viteReact from '@vitejs/plugin-react';

export default {
  plugins: [
    astro({ renderers: [react()] }),
    viteReact(),
  ],
};
```

A renderer is plain data: its server and client entrypoints, its options, and a few declarative needs that `astro()` applies, such as dependencies to dedupe or pre-bundle and a dev-only head script (React's Fast Refresh preamble). It contains no Vite plugins.

The order of `renderers` is the order in which Astro tries them. This matters when several frameworks use JSX, as it does today.

The framework integrations become a composition of the same two parts. `@astrojs/react`'s integration adds `@vitejs/plugin-react` and registers the renderer from `@astrojs/react/renderer`, so the CLI and a plain Vite project use the same code. The other renderers follow the same pattern with their frameworks' plugins: `@vitejs/plugin-vue`, `@sveltejs/vite-plugin-svelte`, `@preact/preset-vite` and `vite-plugin-solid`.

## The pages plugin

`pages()` turns `src/pages` into a site. It owns everything that today happens between a request and a rendered component: the route table, `getStaticPaths`, endpoints, redirects, rewrites, `src/middleware`, 404 and 500 pages, server islands, the `<ClientRouter />`, and the request-level members of `Astro`. `vite dev` serves the routes, and `vite build` builds them.

```js
export default {
  plugins: [
    astro(),
    pages({ output: 'server', redirects: { '/old': '/new' } }),
  ],
};
```

The options are the routing and build parts of today's Astro config (`output`, `build.*`, `redirects`, `security.*`). Settings Vite already has, such as `base`, `publicDir` and the dev server, come from Vite. Settings that belong to the language, such as `site` and `trailingSlash`, are read from `astro()`.

### Output

Output works the way it does today:

- `output: 'static'` prerenders every route, and routes can opt out with `export const prerender = false`.
- `output: 'server'` renders on demand, and routes can opt in to prerendering.
- A build with no on-demand routes writes plain files to Vite's `build.outDir`.

Otherwise the build also emits a server entry, `dist/server/entry.mjs`, which by default exports `{ fetch(request) }`.

### Deploying without adapters

Adapters are an integration concept and stay in the CLI. In a plain Vite project, the server entry is a standard `fetch` handler, so anything that runs one can deploy it: a platform's Vite plugin (such as `@cloudflare/vite-plugin`), a Node server, or a framework that mounts it.

What an adapter configures today becomes options of `pages()` (`serverOutput.*`): a custom server entry, headers for internal fetches, skew-protection query parameters, and whether the platform runs middleware at the edge. [Hooks](#hooks) give a platform plugin the same information an adapter receives from `astro:build:*`.

In the CLI, the existing adapter API is mapped onto those same options and hooks, so adapters keep working unchanged.

### Hooks

Other plugins observe the route table and the build through callbacks on `api.astroPages`. Plugins read the API in `configResolved`, so plugin order doesn't matter:

```js
import { getPagesApi } from '@astrojs/vite-plugin-pages';

function myPlugin() {
  return {
    name: 'my-plugin',
    configResolved(config) {
      const pages = getPagesApi(config);
      pages.onRoutesResolved((routes) => { /* ... */ });
    },
  };
}
```

Most hooks correspond to an integration hook, and in the CLI the integration hook is implemented with them.

#### `onRouteSetup`

Called for each route when the route table is created, and in dev whenever a route's `prerender` export changes. The callback can change how the route is built. Setting `prerender = false` on any route turns a static build into a server build. This is `astro:route:setup`.

```js
pages.onRouteSetup((route) => {
  if (route.component.startsWith('src/pages/api/')) route.prerender = false;
});
```

#### `onRoutesResolved`

Called with the full route table when the dev server or the build starts, and again in dev after each change to the route table. Use it to generate something from the routes, like types or a sitemap. This is `astro:routes:resolved`.

```js
pages.onRoutesResolved((routes) => {
  writeRouteTypes(routes.map((r) => r.pattern));
});
```

#### `onServerManifest`

Called during a server build, with the serialized manifest, before it is written into the server bundle. A platform plugin uses it to learn the routes and assets it will serve. Static builds don't call it. This is `astro:build:ssr`.

```js
pages.onServerManifest(({ manifest }) => {
  platformConfig.routes = manifest.routes.map((r) => r.routeData.route);
});
```

#### `onBuildGenerated`

Called after the static paths are generated. When the platform asks for them (`serverOutput.staticHeaders`), it receives the response headers of each prerendered path, so the platform can serve them, for example as a `_headers` file. This is `astro:build:generated`.

```js
pages.onBuildGenerated(({ routeToHeaders }) => {
  for (const [pathname, { headers }] of routeToHeaders) addHeaders(pathname, headers);
});
```

#### `onBuildDone`

Called once after the build has written all of its output, with the client output directory and the routes. This is `astro:build:done`.

```js
pages.onBuildDone(async ({ dir, routes }) => {
  await writeSitemap(dir, routes);
});
```

#### `setPrerenderer`

Replaces how static paths are rendered at build time. By default they render in Node. A platform can render them in its own runtime instead (Cloudflare renders them in workerd). Pass a function to wrap the default prerenderer instead of replacing it. This is the adapter's `setPrerenderer()`.

```js
pages.setPrerenderer((defaultPrerenderer) => ({
  ...defaultPrerenderer,
  name: 'my-platform',
  render: (request, options) => platformRuntime.fetch(request),
}));
```

#### `onPrerenderDone`

Called after every static path is written, but before the prerenderer shuts down. Callbacks can still read from the prerenderer's runtime, for example to collect what the pages registered while rendering.

```js
pages.onPrerenderDone(async ({ prerenderer }) => {
  if (prerenderer) await emitCollectedImages(prerenderer);
});
```

#### `onPrerenderPathRestored`

With incremental builds, called for each static path that the build skips because nothing it depends on changed. It receives the metadata the path recorded in the previous build, so a plugin can replay what rendering it would have done. For example, the assets plugin re-registers the images the page used.

```js
pages.onPrerenderPathRestored(({ pathname, metadata }) => {
  for (const image of metadata.staticImages ?? []) queueImage(image);
});
```

#### `addChunkPostHook`

Some features emit a placeholder in server code that can only be filled once every server environment has been built. Content collections use this for the styles of rendered entries. The hook runs after the server builds, for each chunk that contains the marker, and the callback can rewrite those chunks.

```js
pages.addChunkPostHook('$$CONTENT_STYLES$$', ({ chunks, mutate }) => {
  for (const chunk of chunks) {
    mutate(chunk.fileName, chunk.code.replace('$$CONTENT_STYLES$$', styles), chunk.prerender);
  }
});
```

### Extension API

`pages()` exposes an API to other Vite plugins, `api.astroPages`, through which feature plugins add their behavior: injecting routes, adding middleware and request handlers, extending the manifest and the `Astro` global, adding page scripts, and hooking into the build. See [Feature plugins](#feature-plugins).

## Feature plugins

Each feature of Astro is a small plugin that owns its config and its runtime code. It builds only on the APIs `pages()` and `astro()` expose. This is the same API anyone can use to write their own feature.

```js
export default {
  plugins: [
    astro(),
    pages(),
    i18n({ defaultLocale: 'en', locales: ['en', 'fr'] }),
    sessions({ driver: 'redis' }),
    actions(),
  ],
};
```

The options of each plugin are its section of today's Astro config, and the CLI passes that section through unchanged.

### The plugins

- **`env()`** adds `astro:env` and private `import.meta.env` variables. It works with or without `pages()`.
- **`i18n()`** adds locale routing, fallbacks, domains and `astro:i18n`. It requires `pages()`.
- **`sessions()`** adds `Astro.session` and session drivers. It requires `pages()`.
- **`cache()`** adds `Astro.cache`, route rules and cache providers. It requires `pages()`.
- **`actions()`** adds `astro:actions`, the action endpoint and form actions. It requires `pages()`.
- **`markdown()`** makes `.md` files importable and routable as pages. It requires `pages()`.
- **`assets()`** adds `astro:assets`, image services, the image endpoint and build-time image optimization. It requires `pages()`.
- **`fonts()`** adds font providers, optimized fallbacks and `<Font />`. It requires `pages()`, and adds `<Font />` to `astro:assets` when `assets()` is present.
- **`prefetch()`** adds link prefetching and speculation rules. It requires `pages()`.
- **`devToolbar()`** adds the dev toolbar and its app API. It requires `pages()`.
- **`content()`** adds content collections. It requires only `astro()`: collections can be queried from any server code. It uses `pages()` and `assets()` when present, for rendering entries and optimizing their images.

All of them also require `astro()`, except `prefetch()`.

A plugin that needs another one looks it up by name when Vite resolves the config, and fails with an error naming the missing plugin:

```
`pages()` from @astrojs/vite-plugin-pages is missing from the Vite `plugins` array.
```

Because the lookup happens in `configResolved`, plugin order never matters.

### Registration API

Feature plugins add behavior through registration methods on `api.astroPages`, alongside the [Hooks](#hooks). Registrations take **module entrypoints, not functions**. A plugin runs in Vite's config process, but requests are handled in the server environment, which may be a different runtime such as workerd. `pages()` includes the registered modules in the server build.

#### `injectRoute`

Adds a route that isn't a file in `src/pages`. Actions uses it for its RPC endpoint. This is the integration API's `injectRoute`. Pass `{ internal: true }` for routes that are implementation details, which then don't appear in `onRoutesResolved` and don't turn a static site into a server build.

```js
pages.injectRoute({
  pattern: '/_actions/[...path]',
  entrypoint: new URL('./runtime/route.js', import.meta.url),
  prerender: false,
});
```

#### `addMiddleware`

Adds middleware that runs before (`'pre'`) or after (`'post'`) the project's `src/middleware`. This is the integration API's `addMiddleware`.

```js
pages.addMiddleware(new URL('./runtime/middleware.js', import.meta.url), 'pre');
```

#### `addFetchHandler`

Adds a step to the request pipeline, which runs before middleware and routing. A handler receives the request state and `next`, and can return a response without calling `next`. Sessions, cache and i18n are fetch handlers. `wraps` orders a handler relative to others without depending on plugin order. For example, cache runs before i18n so that a cached response includes i18n's redirects.

```js
pages.addFetchHandler('cache', {
  entrypoint: new URL('./runtime/fetch-handler.js', import.meta.url),
  order: 'pre',
  wraps: ['i18n'],
});
```

```js
// runtime/fetch-handler.js
export default async function cacheHandler(state, next) {
  return (await lookup(state.request)) ?? next(state);
}
```

#### `extendRenderContext`

Adds a member to `Astro` and to the endpoint `context`. The module's default export is called once per request and provides the value. The value is created the first time it is read, so a session is never created for a page that doesn't use `Astro.session`. Its type is declared by extending `AstroGlobalExtensions` (see [The `Astro` global](#the-astro-global)).

```js
pages.extendRenderContext('session', new URL('./runtime/render-context.js', import.meta.url));
```

#### `extendManifest` and `setManifestData`

Add data to the server manifest, which the runtime modules read. `setManifestData` adds a serializable value. `extendManifest` adds a module that is imported lazily, for code that depends on configuration, like a session driver or a cache provider.

```js
pages.setManifestData('sessionConfig', { cookie: 'astro-session', ttl: 3600 });
pages.extendManifest('sessionDriver', 'virtual:my-session-driver');
```

#### `transformRoutes`

Edits the route table each time it is created. i18n uses it to add a localized copy of each route.

```js
pages.transformRoutes((routes) => [...routes, ...routes.map(localize)]);
```

#### `extendRouting`

Adds a module that takes part in matching a request to a route at runtime, for routing that depends on the request rather than the file system. i18n uses it for domains and fallbacks.

```js
pages.extendRouting(new URL('./runtime/routing-extension.js', import.meta.url));
```

#### `addPageExtension`

Makes files with another extension routable as pages. The module they compile to must default-export an Astro component. Markdown uses it for `.md`, and an MDX plugin would use it for `.mdx`.

```js
pages.addPageExtension('.md');
```

#### `addPageScript`

Adds a script to the `<head>` of every page: a module, or inline content. Inline scripts are included in the CSP policy. This is the integration API's `injectScript('page', ...)` and `injectScript('head-inline', ...)`. Prefetch uses it for its runtime and for speculation rules.

```js
pages.addPageScript(new URL('./runtime/prefetch.js', import.meta.url));
pages.addPageScript(JSON.stringify(rules), { stage: 'head-inline', type: 'speculationrules' });
```

#### `addClientRouterInit`

Adds a browser module that runs when `<ClientRouter />` initializes. Prefetch uses it to prefetch links on navigation.

```js
pages.addClientRouterInit(new URL('./runtime/client-router-init.js', import.meta.url));
```

#### `addCspSources`

With CSP enabled, adds style hashes and font sources to the policy. Fonts uses it for the styles and font files it generates.

```js
pages.addCspSources({ styleHashes: [hash], fontResources: ['https://fonts.example.com'] });
```

### Feature plugin APIs

A feature can expose its own API in the same way. `assets()` exposes `api.astroAssets`, which `fonts()` uses to add `<Font />` to `astro:assets`:

```js
getAssetsApi(config).addExports(fileURLToPath(new URL('./assets-exports.js', import.meta.url)));
```

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
