- Start Date: 2022-10-25
- Reference Issues: TODO
- Implementation PR: <!-- leave empty -->

# Summary

Currently, Astro's [`output`](https://docs.astro.build/en/reference/configuration-reference/#output) enables developers to switch between `'static'` (default) and `'server'` outputs. One of our most requested features is to enable route-level control of `output` so that some routes can be server-rendered while others are statically generated.

# Example

This RFC proposes introducing route-level control when using `output: 'server'`.

```js
import { defineConfig } from 'astro/config'
import node from '@astrojs/node'

export default defineConfig({
  output: 'server',
  adapter: node()
})
```

For individual routes, `'server'` will be the default. To opt-in to `'static'` output, users may `export const output = "static"`.

```astro
---
// This route should be generated at build time!
export const output = "static"

const text = await fetch('https://example.com/').then(res => res.text())
---

<Fragment set:html={text} />
```

# Motivation

Since Astro v1.0.0 was released, we've gotten consistent feedback that more granular control over `output` is a requirement for scaling projects. Users would like to statically render some routes and server render others, reducing the need for full static rebuilds for frequently changing data.

One common use-case is a fully static site that also exposes `api/` endpoints which are handled on the server. Another common example is a largely dynamic site that can generate a few static pages (like a landing page) at request time. Another use-case is pre-generating routes with heavy dependencies (like `puppeteer`) to slim down the server output.

The eventual solution should enable granular control over `output` on a per-route basis. Since `output: 'server'` will default Astro to `'server'` output, this should remain the default.

# Detailed design

## Public API

There is only one public API surface change included in this RFC, assuming you are already using `output: 'server'`.

- Allowing routes (files in `pages/`) to self-declare a granular `output` value. The existing `output` values of `'static' | 'server'` would both be valid, but `'server'` is assumed as the default.

**This declaration must be statically analyzable!**

Only string literal values will be accepted. This is because a route cannot dynamically be static or server rendered based on an incoming request—this value _must_ be known at build time. Other declaration values will throw an error and fail the build. This mirrors similar constraints that Vite has for compile-time (macro) features like dynamic `import()` and `import.meta.glob`.

```astro
---
// Valid – constant string literal
export const output = 'server'

// Invalid – cannot be determined at compile-time
export let output = 'server'                         // `let` implies mutability
export const output = static ? 'static' : 'server';  // `static` variable is unknown at build time
export const output = value;                         // `value` variable is unknown at build time
export const output = 'ser' + 'ver';                 // string concatenation is non-trivial to perform at build time
export let output = undefined; output = 'server';    // dynamic assignment is unknown at build time
---
```

## Internal API

Astro needs to detect/understand the `export const output` syntax. This should be implemented as a specific post-processing Vite plugin. The plugin will detect the existence of valid ESM exports of `output` (`export const output`, `export let output`, `export var output`, `export { output }`, etc) and attach the statically detected `output` value to the module metadata under the `astro` namespace. This will allow us to track the `output` mode of any public route.

> **Note**
> Astro Routes include `.astro` pages, but also API endpoints (`src/pages/api/user.ts`)! It's important that this RFC handles both of these constraints in a uniform way, hence the use of a post-processing Vite plugin rather than implementing this feature in `@astrojs/compiler`.

The **build** API needs to be updated to perform static generation for any `static` routes. Implementation-wise, the existing `'server'` implementation must be updated to also generate static routes. Per the common use cases, the dependencies of any `static` routes should _not_ be included in the final server bundle, so static and server generation should be implemented in two seperate bundles.

The output of the build will be `server/` and `client/` directories as it is now, but statically generated routes will be emitted as assets (`.html` or other files) in the `client/` directory. These must be included as assets in the server manifest.

The **dev** server must be updated to disallow `searchParams` and other features on `static` routes. They are currently only avaliable when `server` rendering, but this is handled on a project-wide basis.

## Adapter Support

Adapters are still required when building for `server` output. Since the asset manifest is already exposed, adapters _may_ choose to perform optimizations on emitted `.html` files, but are not required to do so.

# Testing strategy

This implementation will largely be tested with full fixture-based integration tests, because we will need to verify the build output is structured correctly, which will be difficult to do with unit tests.

The Vite plugin that detects `export const output` will be unit tested against all valid `export` formats outlined above, as well as invalid dynamic exports.

# Drawbacks

- The `export const output` syntax is JS-like, but since it requires static analysis, it does not support the full dynamicism of JS that users might expect. Clear errors will help ease this problem.
- With this architecture, `server` output should arguably be the default `output` mode (similar to Next.js). To avoid a breaking change, we'll remain with our existing opt-in adoption approach.
- This RFC does not propose any way to configure `static` output for all routes in a directory. Adding this behavior could be explored in a follow-up RFC. 

# Alternatives

There are many possible user-facing APIs for exposing control over `output`. We considered many alternatives, but settled on `export const output` as the one with the most favorable tradeoffs.

### A. Magical exported functions (ala Next's `getStaticPaths`)

**Pros** entirely statically analyzable (export names must be static)
**Cons** cognitive overhead

### B. Config-based routes

**Pros** explicit, granular, debuggable
**Cons** duplicated logic, need to keep config in sync with routes, _we already have file-based routing_

### C. Exported `config` file annotations (`export const config = { output: "server" }`)

**Pros** clear, works well with file-based routing
**Cons** "uncanny valley" problem (not a real object, must be entirely statically analyzable)

### D. Introduce novel syntax

**Pros** clear, easily explainable as fully static
**Cons** Not supported for API Endpoints, costly implementation, costly ecosystem migration for syntax/highlighing changes, additional new concepts for newcomers

```astro
--- output=server
---
<h1>Hello world</h1>
```

### E. Introduce this feature under a new `output: 'hybrid'` mode

**Pros** clearer incremental adoption story, could default to `static`
**Cons** more cognitive overhead, conceptually `hybrid` isn't an `output` mode but a building technique, `static` doesn't seem like the right default

### F. Use file-based routing conventions like `route.server.astro`.

**Pros** statically analyzable, immediately clear which files do what
**Cons** complicates routing logic, makes it harder to adopt other file-based routing changes in the future


# Adoption strategy

- Adoption will be entirely opt-in by setting `output: 'server'` in your `astro.config.mjs` file and adding `export const output = "static"` to a route.
- This is not a breaking change, it is new behavior
- Third-party adapters will not necessarily need to change to support this new hybrid output as it builds on top of the existing `server` output

# Unresolved questions

- Any public API changes needed for adapters?
