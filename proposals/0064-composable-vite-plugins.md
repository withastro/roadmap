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
astro → vite-plugin-pages (+ feature plugins → core packages) → vite-plugin-astro → runtime
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

### Core packages

Some features have an API that other packages implement: content loaders, image services, session drivers, cache providers and font providers. Code written against these APIs doesn't need Vite. A loader fetches data, and an image service transforms images. Their authors shouldn't have to depend on a Vite plugin.

So a feature whose API is implemented by third parties has two packages. `@astrojs/<feature>` contains that API, its types and the built-in implementations, without depending on Vite. `@astrojs/vite-plugin-<feature>` is the plugin, and it depends on the core package. Features without such an API only have the plugin package.

| Core package        | What it contains                                                                        | Used by                         |
| ------------------- | --------------------------------------------------------------------------------------- | ------------------------------- |
| `@astrojs/content`  | The loader API, `glob()` and `file()`, `defineCollection` and the data store.             | `@astrojs/vite-plugin-content`  |
| `@astrojs/assets`   | The image service API and the built-in services (Sharp, no-op).                           | `@astrojs/vite-plugin-assets`   |
| `@astrojs/sessions` | The session driver API and the built-in drivers.                                         | `@astrojs/vite-plugin-sessions` |
| `@astrojs/cache`    | The cache provider API, the memory provider and helpers for writing providers.           | `@astrojs/vite-plugin-cache`    |
| `@astrojs/fonts`    | The font provider API and the built-in providers.                                        | `@astrojs/vite-plugin-fonts`    |

`@astrojs/runtime` follows the same rule for the language. The framework's existing paths, such as `astro/loaders` and `astro/assets/services/sharp`, re-export the core packages.

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

Compiling a component doesn't provide this metadata, so `astro()` has to. The render API (see [The runtime](#the-runtime)) uses it, so `renderToResponse(Page)` produces a complete page with working islands.

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
    sessions({ driver: sessionDrivers.redis({ url: process.env.REDIS_URL }) }),
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

All of them except `env()` and `prefetch()` also require `astro()`.

A plugin that needs another one looks it up by name when Vite resolves the config, and fails with an error naming the missing plugin:

```
`pages()` from @astrojs/vite-plugin-pages is missing from the Vite `plugins` array.
```

Because the lookup happens in `configResolved`, plugin order never matters.

### Registration API

Feature plugins add behavior through registration methods on `api.astroPages`, alongside the [Hooks](#hooks). Registrations take **module entrypoints, not functions**. A plugin runs in Vite's config process, but requests are handled in the server environment, which may be a different runtime such as workerd. `pages()` includes the registered modules in the server build.

#### `injectRoute`

Adds a route that isn't a file in `src/pages`. Actions uses it for its RPC endpoint. This is the integration API's `injectRoute`. Pass `{ internal: true }` for framework endpoints that only serve on-demand requests, like the image endpoint. An internal route always renders on demand, but never turns a static site into a server build, and `onRouteSetup` doesn't run for it.

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

Many settings are needed by more than one plugin. `site` is set for the language, because components read `Astro.site`, but `pages()` also needs it for absolute URLs, and so do `i18n()` and sitemap-like plugins. `trailingSlash` affects both how links render and how routes match. Every plugin needs `root`. In the CLI these all come from one Astro config object. Once the features are separate plugins, each needs a way to read settings it doesn't own, without the user repeating them.

The answer is that each setting belongs to one plugin, and the others read it from that plugin:

- **Vite** owns `root`, `base`, `publicDir`, the dev server and the output directory. The Astro plugins read them from Vite's resolved config, and no plugin has an option for them.
- **`astro()`** owns the settings that affect how components render: `srcDir`, `site`, `trailingSlash`, `compressHTML`, the renderers and the client directives.
- **`pages()`** owns routing and build settings: `output`, `build.*`, `redirects`, `security.*` and how the server output is deployed.
- **Each feature plugin** owns its own section of the config.

So `site` is set once, on `astro()`, and every other plugin reads it from there.

### How plugins find each other

Each plugin exposes an API object on its Vite plugin (`plugin.api`). Others look it up by name in Vite's resolved config, with a helper exported by the owning package:

```js
import { getAstroApi } from '@astrojs/vite-plugin-astro';
import { getPagesApi } from '@astrojs/vite-plugin-pages';

function myPlugin() {
  return {
    name: 'my-plugin',
    configResolved(config) {
      const { site, trailingSlash } = getAstroApi(config).config;
      const { output } = getPagesApi(config).config;
    },
  };
}
```

`getAstroApi()` reads `api.astro` and `getPagesApi()` reads `api.astroPages`. They throw with the missing plugin's name if it isn't in `plugins`. Every lookup and registration happens in `configResolved`, after Vite has created all of the plugins, so plugin order doesn't matter.

The resolved config objects are read-only. They contain absolute URLs for directories, Vite's resolved `base`, and defaults applied. They are the only config that crosses a package boundary. The CLI's internal settings object stays inside `astro`.

### Validation

Each plugin validates its own options with a zod schema and exports that schema. The CLI builds the Astro config schema from these schemas, so a setting has the same validation, defaults and error messages whether it's written in `astro.config.mjs` or passed to a plugin.

## The astro CLI and integrations

For an existing Astro project, nothing changes. `astro.config.mjs`, integrations, adapters and the `astro` commands work as they do today. What changes is how they're implemented: `astro dev` and `astro build` run Vite with the same plugins a Vite user would write.

### Composition

The CLI loads and validates `astro.config.mjs`, then turns each section into the options of the plugin that owns it:

```js
// roughly what `astro dev` builds from an Astro config
[
  astro({ site, srcDir, trailingSlash, compressHTML, renderers }),
  pages({ output, build, redirects, security, serverOutput }),
  env(config.env),
  i18n(config.i18n),
  sessions(config.session),
  // ...one per feature
];
```

The option types are the plugins' own, and the Astro config schema is built from the plugins' schemas. A setting therefore behaves the same in `astro.config.mjs` and in `vite.config.js`.

The plugins also take an optional second argument, used only by the CLI. It carries what an Astro project has and a Vite project doesn't, such as the CLI's logger, the state shared with integrations, and what `astro sync` generates. Vite users never pass it.

### Integrations

Integrations are not part of the plugins. They remain the extension API of the framework. The CLI runs them as today and maps what they register onto the plugin APIs:

| Integration API                          | Plugin API                                         |
| ---------------------------------------- | -------------------------------------------------- |
| `addRenderer`                            | `astro()`'s renderers                              |
| `addClientDirective`                     | `astro()`'s client directives                      |
| `injectRoute`                            | `injectRoute`                                      |
| `addMiddleware`                          | `addMiddleware`                                    |
| `injectScript('page' / 'head-inline')`   | `addPageScript`                                    |
| `addPageExtension`                       | `addPageExtension`                                 |
| `astro:route:setup`                      | `onRouteSetup`                                     |
| `astro:routes:resolved`                  | `onRoutesResolved`                                 |
| `astro:build:ssr` / `generated` / `done` | `onServerManifest` / `onBuildGenerated` / `onBuildDone` |
| `updateConfig({ vite })`                 | unchanged: integrations can still add Vite plugins |

The mapping is in one place in `astro`, and integrations don't have to change. Over time, an integration whose only job is to add a Vite plugin can document the plugin for Vite users directly, as the framework integrations will (see [Renderers](#renderers)).

### Adapters

Adapters stay in the CLI too. The CLI maps what an adapter declares (its server entrypoint, its features, `setPrerenderer`, middleware mode, headers) onto `pages({ serverOutput })` and the [Hooks](#hooks). Existing adapters work unchanged. New ones can be written against `serverOutput` and the hooks directly.

### Hook order in dev

The route table is now created by `pages()`, so the CLI resolves Vite's config before `astro:config:done` to learn the routes. In builds this keeps today's order: `astro:routes:resolved` before `astro:config:done`. In dev the order used to be reversed, and it now matches the build. As a side effect, routes injected by features, such as the actions endpoint and the image endpoint, are visible in `astro:routes:resolved` for the first time.

### What stays in `astro`

- the commands: `dev`, `build`, `preview`, `sync`, `check`, `add`, `info`
- config loading and validation
- integrations and adapters
- telemetry
- the public `astro/*` entrypoints, which become re-exports of the plugin packages and stay until a major release

# Testing Strategy

This is mostly a refactor of existing code, so the main protection is the test suite that already exists. Code is moved into the packages, not copied, and `astro` is rebuilt on top of them. That means every existing test exercises the plugin code: `astro`'s unit and integration tests, the adapter suites (Node, Cloudflare, Vercel, Netlify), the framework integrations, and the end-to-end tests. Each package can be extracted separately, and the full suite has to pass after each extraction.

The existing suite can't show that the plugins work without `astro`, so each package adds its own tests for that:

- **Plugin tests** run each plugin in a plain Vite project, with no `astro` dependency. They cover its options, its API, and dev and build. Feature plugins are tested against `pages()` alone, so a feature never silently depends on something only the CLI provides. Tests also build with the plugins in different orders, to check that order doesn't matter.
- **Standalone fixtures** cover the cases that need more than compilation, in both `vite dev` and `vite build`: rendering a component with scoped styles, hydrating a React island, and rendering a page.
- **Runtime tests** compile a component with the compiler and render it with `@astrojs/runtime` in plain Node, without Vite. A check fails the build if the runtime package imports Vite, the compiler or a bundler.
- **Package resolution:** a test project outside the monorepo, installed with strict pnpm, checks that a project depending only on the plugin packages resolves everything it needs.
- **Examples:** an example project that uses every plugin in a `vite.config.js`, and one that renders components from Hono routes, are built in CI like the other examples.
- **Types:** a type test checks that `AstroUserConfig` stays assignable to the plugin option types, so the Astro config and the plugins can't drift apart.

Package size is tracked in CI: the size of the `astro` package, the install size of all the packages together, and the server bundle of a deployed SSR example.

# Drawbacks

**There are two ways to use Astro.** One is the framework: `astro.config.mjs`, integrations and the `astro` CLI. The other is Vite plugins in a `vite.config.js`. They run the same code, but they look different, and that has costs:

- **Docs** have to explain both, or say clearly which one they cover. Guides that start with `npm create astro` stay the default, but every feature page needs a short "in a Vite project" note.
- **Support and bug reports** need to establish which setup is in use. Some behavior only exists in the framework, like integrations, adapters, `astro add` and `astro check`.
- **Choosing.** New users may not know which to pick. The answer should be simple and repeated everywhere: start with Astro, and use the plugins when you already have a Vite app or want only part of Astro.
- **Ecosystem.** Integrations don't work in a plain Vite project. Integration authors who want to support both need to ship a Vite plugin too, as the framework renderers will.

Other drawbacks:

- **The internal APIs become public.** `api.astro`, `api.astroPages` and the hooks are how features are built today, and today they can change in any release. Once third-party plugins use them, changing them needs the same care as the integration API.
- **More packages.** Thirteen new packages to version, publish and keep compatible with each other. The packages are released from the monorepo together, but a user can still end up with mismatched versions.
- **A larger install for the whole framework.** The `astro` package gets much smaller, but installing all of the packages together is slightly larger than today's `astro`, because of package boundaries and re-exports.
- **A large refactor.** Most of `astro` moves. This affects open PRs, `git blame`, and contributors who know where code used to be. The existing `astro/*` paths stay as re-exports, so adapters and integrations aren't affected.

# Alternatives

### Only the language plugin

The original proposal ([#1378](https://github.com/withastro/roadmap/discussions/1378)) covered only `.astro` files in Vite. That is a smaller change. On its own, though, it leaves the rest of Astro as one package, and the boundaries between the language, routing and features would be designed one at a time. Pages, islands in pages, server islands and `Astro.*` all touch the language layer, so designing the boundaries together avoids redoing the language plugin later.

### One plugin with feature flags

```js
astro({ pages: true, i18n: { ... }, actions: false });
```

This is a single package and a single entry point, which is simpler to document. But the code for every feature is still installed, so the package doesn't get smaller. It also offers no way to replace a feature with another library, and features keep sharing internals because nothing forces them apart. An all-in-one plugin can still be built on top of the separate plugins later (see Stretch goals).

### Make features optional inside `astro`

The same result for CLI users (features you don't use aren't loaded) could come from lazy loading and config flags inside today's package, without new packages. That improves bundle size, but it does nothing for Vite users, and the install size stays the same.

### Support integrations in plain Vite

A Vite plugin could run the integration API, so existing integrations work in `vite.config.js`. This keeps one extension model, but integrations are built around the Astro config, the CLI lifecycle and `astro:config:setup`. Supporting them means bringing most of the framework into the plugin, which defeats the purpose. Instead, the CLI maps integrations onto the plugin APIs, and integrations can add Vite plugins for Vite users.

### Improve the Container API

The Container API already renders components outside of a page. Extending it would avoid new packages, but it runs inside an Astro project and doesn't provide what a Vite app needs, like dev server styles, HMR, or client builds for islands. In this design the container is built on the same render core as the plugins.

### Separate implementations

The plugins could be new code, written for Vite, while `astro` keeps its own. That avoids a large refactor, but the two would drift. Every bug would need fixing twice, and the plugins wouldn't get `astro`'s test coverage. Moving the code means there is one implementation, tested by the existing suite.

### Renderers as Vite plugins

`plugins: [astro(), react()]`, with each renderer package providing a Vite plugin that registers itself. This looks like most Vite framework plugins, but the order of renderers matters when several frameworks use JSX, and as separate plugins that order would come from the order of `plugins`. It also bundles each framework's own Vite plugin into the renderer. Instead, renderers are plain data passed to `astro()`, and users add each framework's Vite plugin themselves (see [Renderers](#renderers)).

# Adoption strategy

### Existing Astro projects

No action is needed. `astro.config.mjs`, integrations, adapters and the `astro` commands keep working, and the existing `astro/*` import paths re-export the new packages. This ships in a minor release of `astro`.

The one visible change is the dev hook order: `astro:routes:resolved` now runs before `astro:config:done`, as it already does in builds. Integrations that depend on the old dev order should be rare. The change is called out in the release notes.

### Vite users

The plugin packages are new and start at `0.x`. Their options mirror the Astro config, so they are stable from the start. The plugin APIs (`api.astro`, `api.astroPages` and the hooks) are documented as experimental until they reach `1.0`, which gives room to adjust them once third-party plugins use them.

The packages can be released one layer at a time. The language plugin and the runtime are useful on their own, for rendering `.astro` components from another server framework, so they can ship before the pages plugin and the feature plugins.

The docs get a "Using Astro with Vite" section:

- a guide for adding Astro components to an existing Vite app;
- a guide for a Vite site that uses `pages()`;
- for each feature, a short note on its plugin and options.

The framework remains the documented default for new projects.

### Integration and renderer authors

Nothing breaks. Authors who want their package to work in plain Vite projects can ship a Vite plugin alongside the integration, and use the integration to add it. Renderer packages ship their renderer as plain data and rely on the framework's own Vite plugin (see [Renderers](#renderers)). Astro's own framework integrations follow this pattern, which serves as the example to follow.

Adapters keep working through the CLI. New platform support can be written against `pages()`'s server output options and hooks, so that the same code serves both Astro projects and plain Vite projects.

### A future major

The dev and build hook order can be unified further, by creating the route table only inside Vite. This would affect integrations that read the build output in `astro:config:done`, so it requires a major.

# Unresolved Questions

- **Request-level members in the render API.** Standalone, `Astro` only has the members that depend on the component. Server frameworks already know the route params and often have per-request data, so `renderToResponse` could accept `params` and `locals`, and support `Astro.cookies`, `Astro.redirect()` and `Astro.response`, since it returns the `Response`. Which of these to support, and whether their implementations move from `pages()` into the runtime so both use the same code.
- **Missing standalone features.** Without `pages()`, a few settings have no option yet: the scoped style strategy, inlining stylesheets, `assetsPrefix`, CSP and `<ClientRouter />`. Which of these the language plugin should support on its own.
- **Renderer fields for other frameworks.** The declarative renderer fields (dependencies to pre-bundle and dedupe, a dev head script) are designed from what React needs. Vue, Svelte, Preact and Solid have to be checked against them, and may need more.
- **Stability of the plugin APIs.** `api.astro`, `api.astroPages` and the hooks start as experimental. What is required before they are stable, and whether they stabilize together or one at a time.
- **Types of absent plugins.** A plugin's additions to `Astro` are declared through declaration merging, which applies whenever its types are loaded. So `Astro.session` type-checks even when `sessions()` isn't in `plugins`, and reads `undefined` at runtime. Whether that is acceptable, or the types should depend on the configured plugins.
- **Composing the request pipeline by hand.** A custom `src/fetch.ts` composes the pipeline from `astro/fetch` (`sessions()`, `i18n()`, `pages()`, …). In a Vite project without `astro`, these functions would come from the plugin packages, for example `@astrojs/vite-plugin-sessions/fetch`.
- **Adapter API.** Adapters keep working through the CLI, and new platform support can use `pages()`'s server output options directly. Whether, and when, the current adapter entrypoint API (`serverEntrypoint`, `exports`, `args`) is deprecated in favor of them.
- **An all-in-one plugin.** For Vite users who want the whole framework, a single plugin that enables every feature. Its name, and how its options relate to the Astro config.
