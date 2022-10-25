- Start Date: 2022-10-25
- Reference Issues: TODO
- Implementation PR: <!-- leave empty -->

# Summary

Currently, Astro's [`output`](https://docs.astro.build/en/reference/configuration-reference/#output) enables developers to switch between `'static'` (default) and `'server'` outputs. One of our most requested features is to enable route-level control of `output` so that some routes can be server-rendered while others are statically generated.

# Example

This RFC proposes a new, opt-in `output` mode named `'hybrid'`.

```js
import { defineConfig } from 'astro/config'
import node from '@astrojs/node'

export default defineConfig({
  output: 'hybrid',
  adapter: node()
})
```

For individual routes, `'static'` will be the default. To opt-in to `'server'` output, users may `export const output: 'static' | 'server'`.

```astro
---
export const output = 'server'

const text = Astro.url.searchParams.get('text') ?? 'Hello world!';
---

<h1 set:html={text} />
```

# Motivation

Since Astro v1.0.0 was released, we've gotten consistent feedback that more granular control over `output` is a requirement for scaling projects. Users would like to statically render some routes and server render others, reducing the need for full static rebuilds for frequently changing data.

One very common use-case is a fully static site that also exposes `api/` endpoints which are handled on the server. Another common example is a largely static site that can generate a few dynamic pages at request time (for example, a user profile page).

The eventual solution should enable granular control over `output` on a per-route basis. Since Astro defaults to `'static'` output, this should remain the default in the eventual solution as well.

# Detailed design

## Public API

There are two public API surfaces to this RFC:

- Updating the `astro.config.mjs` to accept a new `output` value, `'hybrid'`. The existing values of `'static' | 'server'` would remain supported. A value of `'hybrid'` will enabled detection for the following feature:
- Allowing routes (files in `pages/`) to self-declare a granular `output` value. The existing `output` values of `'static' | 'server'` would both be valid.

**For performance reasons, this declaration must be statically analyzable.**
Only string literal values will be accepted. Other declaration values will throw an error and fail the build. This mirrors similar constraints that Vite has for compile-time (macro) features like dynamic `import()` and `import.meta.glob`.

```astro
---
// Valid – constant string literal
export const output = 'server'
// Invalid – cannot be determined at compile-time
export const output = static ? 'static' : 'server';
export const output = value;
export const output = 'ser' + 'ver';
export let output = undefined; output = 'server';
---
```

## Internal API

Astro needs to detect/understand the `export const output` syntax. This should be implemented as a specific post-processing Babel plugin. The plugin will detect the existence of valid ESM exports of `output` (`export const output`, `export let output`, `export var output`, `export { output }`, etc) and attach the statically detected `output` value to the module metadata under the `astro` namespace. This will allow us to track the `output` mode of any public route.

> **Note**
> Astro Routes include `.astro` pages, but also API endpoints (`src/pages/api/user.ts`)! It's important that this RFC handles both of these constraints in a uniform way, hence the use of a post-processing Babel plugin rather than implementing this feature in `@astrojs/compiler`.

The **build** API needs to be updated to handle the new `'hybrid'` output mode. Implementation-wise, this will be similar to the existing `'server'` implementation, but it will also adopt portions of the `'static'` build to statically generate any routes that are not handled at request time.

The **dev** server must be updated to allow `searchParams` and other features which are currently only avaliable with `server` rendering to be allowed on a per-route basis.

## Adapter Support

An adapter will be required when building for `hybrid` output, because we will be building a server with some statically generated routes. Adapters will need to be updated to handle `hybrid` output.

# Testing strategy

This implementation will largely be tested with full fixture-based integration tests, because we will need to verify the build output is structured correctly, which will be difficult to do with unit tests.

The Babel plugin that detects `export const output` will be unit tested against all valid `export` formats outlined above.

# Drawbacks

- A new output mode will increase the complexity and maintenance costs of our `build` and `adapter` implementations.
- The `export const output` syntax is JS-like, but since it requires static analysis, it does not support the full dynamicism of JS that users might expect. Clear errors will help ease this problem.
- Having a separate mode for `hybrid` increases cognitive overhead and the learning curve of Astro.
- `hybrid` output should arguably be the default `output` mode (similar to Next.js), but to avoid a breaking change we're going with an opt-in adoption approach

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

# Adoption strategy

- Adoption will be entirely opt-in by setting `output: 'hybrid'` in your `astro.config.mjs` file.
- This is not a breaking change, it is new behavior
- Third-party adapters will need to coordinate changes to support `hybrid` output, but for the most part the logic will be very similar to the existing `server` output.

# Unresolved questions

- Should API Endpoints default to `output = "server"`? This seems more ergonomic than manually opting every API Endpoint into `'server'` output...
