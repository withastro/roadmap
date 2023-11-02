- Start Date: 2023-11-01
- Reference Issues: https://github.com/withastro/roadmap/issues/754
- Implementation PR: https://github.com/withastro/astro/pull/8951

# Summary

Deprecate `@astrojs/prefetch` and provide first-class prefetch support in Astro.

# Example

```html
<!-- prefetch defaults to hover -->
<a href="/foo" data-astro-prefetch>foo</a>

<!-- prefetch on tap (touchstart, mousedown events) -->
<a href="/foo" data-astro-prefetch="tap">foo</a>

<!-- prefetch on hover (focusin, focusout, mouseenter, mouseleave events) -->
<a href="/foo" data-astro-prefetch="hover">foo</a>

<!-- prefetch on enter viewport (IntersectionObserver) -->
<a href="/foo" data-astro-prefetch="viewport">foo</a>

<!-- disable prefetch if prefetch all by default -->
<a href="/foo" data-astro-prefetch="false">foo</a>
```
You can also configure options in `astro.config.js`:

```js
prefetch: {
  // Whether to prefetch all links by default. same as adding `data-astro-prefetch` to all links.
  // Default false, but true if view transitions is used. User can explicitly set this to false
  // to disable for view transitions. (I tried coming up a better name)
  prefetchAll: true,
  // Default prefetch strategy for `data-astro-prefetch` (no value specified).
  defaultStrategy: 'hover' // accepts 'tap' and 'viewport' too
}
```

Different prefetch strategies have different behaviours and opinions:
- `tap`: Calls `fetch()` on `touchstart` or `mousedown` events (they are called before `click` event)
- `hover`: Calls `fetch()` on `focusin`+`focusout` or `mouseenter`+`mouseleave` events. Hover detection kicks in after 80ms delay.
- `viewport`: Creates a `<link rel="prefetch">` on enter viewport. It has lower priority than `fetch()` to not clog up the request. Intersection detection kicks in after 300ms.

Notes: `hover` and `viewport` only works on `<a />` tags on initial page load (and view transition page load) due to limitations of the events. Unless we watch the entire DOM with MutationObserver but it's not performant.

---

For programmatic usage (only if `prefetch` config is explicitly enabled regardless of View Transitions, otherwise report an error):

```js
import { prefetch } from 'astro:prefetch'

prefetch('http://...', { with: 'link' }) // second parameter optional, can specify link/fetch for prefetch priority
```

# Background & Motivation

With the introduction of View Transitions, it includes partial prefetching code for snappy navigation between pages. We can take this opportunity to support prefetching in core, and share the prefetch behaviour with View Transitions. 

I've started an implementation before an RFC as the initial plan was to simply move `@astrojs/prefetch` to core. However, it would also be a good time to polish up and extend the API.

# Goals

- An option to enable prefetching
- Enable prefetching via an attribute/hint
- Enable prefetching for all links by default (required by View transitions)
- Disable prefetching if all links are enabled by default
- Different prefetching strategies (click, hover, viewport, etc)
- Only add JS if using prefetching

# Non-Goals

- Prefetch cache invalidation (Browser relies on cache control)
- Prefetch external links

# Detailed Design

A prefetch script for client-side is required. It should only be included if the `prefetch` config is truthy. The script can be injected through the `injectScript` integration API.

> NOTE: The details below works very differently to what `@astrojs/prefetch` has today. One feature `@astrojs/prefetch` has which I didn't implement is fetching HTMLs on viewport enter, parsing it for CSS links, and fetching them again. I think it's a little aggresive to support.

### Config

The prefetch configuration is a top-level Astro config:

```js
// default value if `prefetch: true` (prefetch is not enabled by default)
prefetch: {
  // Whether to prefetch all links by default
  prefetchAll: false,
  // Default prefetch strategy for `data-astro-prefetch` (no value specified).
  defaultStrategy: 'hover' // accepts 'tap' and 'viewport' too
}
```

If View Transitions is used in Astro, the default value of the `prefetch` config (if user not configured) is `{ prefetchAll: true }`. The user can configure `false`, `{ prefetchAll: false }`, etc if they want to override this default.

### Client script

The script should attach listeners on initialization for different prefetch strategies:

- `tap`: Calls `fetch()` on `touchstart` or `mousedown` events
- `hover`: Calls `fetch()` on `focusin`+`focusout` or `mouseenter`+`mouseleave` events. Hover detection kicks in after 80ms delay.
- `viewport`: Creates a `<link rel="prefetch">` on enter viewport. It has lower priority than `fetch()` to not clog up the request. Intersection detection kicks in after 300ms.

Additional rules:

- Prefetched links should not be fetched again (e.g. hovering on a link twice)
- The strategy should only apply when `data-astro-prefetch`'s value matches
- If `data-astro-prefetch` has no value, use the configured `defaultStrategy`
- If `prefetchAll` is enabled, apply `defaultStrategy` for all links

Notes:
- `fetch()` has higher priority than `<link rel="prefetch">` when prefetching

### Programmatic API

The client script would have an internal `prefetch` function that we can expose to the `astro:prefetch` module:

```ts
export declare function prefetch(url: string, opts?: { with?: 'link' | 'fetch' }): void
```

This module can only be imported if the `prefetch` config is explicitly enabled, even with View Transitions enabled.

- `url`: A URL string that can be a full `http://` path, or simply start with `/` or `./`. Internally it will construct as `new URL(url, window.location.href)`.
   Prefetch will only run if the URL is not external and have not already been prefetched, otherwise it's a noop.
- `with`: The prefetch strategy used. (Not using the word `strategy` because it already refers to `tap/hover/viewport` etc).
  - `'link'`: use `<link rel="prefetch">`, which has a lower loading priority. The browser will schedule when to prefetch it itself.
  - `'fetch'`: use `fetch()`, has a higher loading priority. The browser will immediately fetch and cache it.

# Testing Strategy

End-to-end tests, make sure user tap/hover/viewport all works. And the `prefetch` programmatic API works.

# Drawbacks

- Users have limited prefetch features with `@astrojs/prefetch`
- Users have to use external prefetching solutions
- Double prefetching could happen as View Transitions prefetches too

# Alternatives

Continue supporting `@astrojs/prefetch`

# Adoption strategy

We should document a migration path for `@astrojs/prefetch` users to use the new `prefetch` option.

Existing `@astrojs/prefetch` users could of course keep using it if needed, so an immediate switch isn't required. After the release of `prefetch` feature, we can deprecate the `@astrojs/prefetch` integration to nudge towards the new API.

# Unresolved Questions

n/a
