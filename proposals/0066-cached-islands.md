**If you have feedback and the feature is released as experimental, please leave it on the Stage 3 PR. Otherwise, comment on the Stage 2 issue (links below).**

- Start Date: 2026-07-28
- Reference Issues: https://github.com/withastro/roadmap/issues/945 (Server Islands), https://github.com/withastro/roadmap/issues/1151 (Live content loaders), https://github.com/withastro/roadmap/issues/1140 (Route caching), https://github.com/withastro/roadmap/issues/1356 (Rust compiler)
- Implementation PR: <!-- leave empty -->
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1454
- Stage 3 PR: <!-- leave empty -->

# Summary

Add a `server:cache` directive for caching individual component subtrees ("cached islands") on demand. On a cache miss, Astro renders the component normally while recording its HTML chunks and render instructions, then replays that recording into later responses until it expires or is invalidated. Caller slots still render per request.

This is the inverse of server islands (sometimes called "reverse islands"): server islands put dynamic holes inside a static shell, while cached islands put cached fragments inside a dynamic shell, and the two can nest. Cached islands share route caching's `maxAge`, `swr`, and `tags` options, live collection `cacheHint` flow, `WaitUntilHook`, and `Astro.cache.invalidate()`, so one tag purge clears cached routes and cached islands together. Storage sits behind a small key-value interface with bindings for the Web Cache API, unstorage drivers, and memory, with defaults supplied by adapters.

# Example

On a commerce category page, the shell depends on per-request state (session, currency, consent, experiment bucket), so `routeRules` cannot cache the full response. The product grid is expensive to render, shared across visitors in a locale and currency, and only changes when the catalog updates.

```astro
---
// src/pages/c/[slug].astro
import Layout from '../../layouts/Shop.astro';
import ProductGrid from '../../components/ProductGrid.astro';
import CartBadge from '../../components/CartBadge.astro';
import Recommendations from '../../components/Recommendations.astro';

const user = await Astro.session.get('user');
const currency = Astro.cookies.get('currency')?.value;
const category = await getCategory(Astro.params.slug);
---
<Layout user={user}>
  <ProductGrid
    category={category.id}
    currency={currency}
    server:cache={{
      maxAge: 600,
      swr: 21_600,
      tags: [`category:${category.id}`],
    }}
  >
    <!-- Slots render per request inside the cached fragment -->
    <CartBadge slot="corner" user={user} />
  </ProductGrid>

  <!-- Server islands work alongside cached islands -->
  <Recommendations user={user} server:defer>
    <div slot="fallback">Loading…</div>
  </Recommendations>
</Layout>
```

A bare `server:cache` uses the configured defaults and derives a key from the component identity, props, passed slot names, and locale. Option names and units match `RouteRule` (plain seconds).

Configuration goes under the existing `cache` block alongside the route-cache provider:

```js
// astro.config.mjs
import { defineConfig, memoryCache, cacheStores, sessionDrivers } from 'astro/config';

export default defineConfig({
  cache: {
    provider: memoryCache(), // route caching, unchanged
    islands: {
      // Native CacheStorage where available; adapters provide defaults
      store: cacheStores.web('astro:islands'),
      // Global store for tag invalidation state; adapters provide defaults
      tagStore: cacheStores.unstorage(sessionDrivers.cloudflareKVBinding({ binding: 'ISLAND_CACHE' })),
      // Optional global second tier behind a regional store; adapters provide defaults
      originStore: cacheStores.unstorage(sessionDrivers.cloudflareKVBinding({ binding: 'ISLAND_CACHE' })),
      defaults: { maxAge: 300, swr: 3600 },
      // Ceiling on maxAge + swr for any entry; defaults to seven days
      maxLifetime: 86_400,
    },
  },
  routeRules: {
    '/api/[...path]': { swr: 600 },
  },
});
```

Invalidation uses the existing `Astro.cache.invalidate()` / `context.cache.invalidate()` API (available in routes, endpoints, actions, and middleware), clearing both routes and islands:

```ts
// src/pages/api/purge.ts
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, cache }) => {
  // Always authorize purge endpoints before accepting invalidation requests
  const secret = process.env.PURGE_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const { tags } = await request.json();
  await cache.invalidate({ tags }); // e.g. ['category:winter-boots', 'product:123']
  return new Response('ok');
};
```

# Background & Motivation

Astro can cache whole pages (prerendering and route caching) and defer dynamic fragments inside a static shell (server islands), but it cannot cache shared fragments inside a dynamic shell.

Prerendering is per route, so any per-request logic forces the whole page onto on-demand rendering. [Route caching](https://docs.astro.build/en/guides/caching/) caches whole responses by URL, either through CDN headers (`CDN-Cache-Control`, `Cache-Tag`, `Last-Modified`, `ETag`) or `onRequest` interception (as `memoryCache()` does), configured with `routeRules` and `Astro.cache.set()`. That works for shareable responses, not for pages with personalized shells (`memoryCache()` already skips responses that set Astro cookies or vary on `Cookie`). Setting `Cache-Control` on `/_server-islands/` responses does not solve this either, because server islands still load via a deferred client fetch after the dynamic shell.

Teams running large Astro sites work around this by rendering components manually, saving HTML strings to KV or Redis under custom keys, replaying them with `set:html`, and invalidating them with TTLs or webhooks. That breaks in five ways because Astro's render output is not just HTML:

1. **Render instructions are lost.** Astro interleaves HTML with render instructions that the response deduplicates while streaming (hydration bootstrap, directive scripts, per-framework renderer scripts, the server-island runtime, and `<script>` tags). Replaying a cached string either duplicates those scripts or omits them depending on what else is on the page, and userland cannot access the response's deduplication state.
2. **Deploys break cached HTML.** Cached markup contains hashed asset URLs inside `<astro-island>` elements, and nested server islands embed props encrypted with a per-build key (rotated every build unless `ASTRO_KEY` is set). Entries that survive a deploy serve 404ing scripts and undecryptable islands.
3. **Slots are frozen.** String caching cannot render child content per request, so a component with personalized children either cannot be cached or leaks the first visitor's data.
4. **Head content and CSP break.** Rendered content entries add styles to `<head>`, server island placeholders add preload links for their fetches, and with `security.csp` enabled, server island placeholders and styled SVG components add script and style hashes. Replaying a string skips all of these, causing missing styles and CSP violations.
5. **Duplicated invalidation plumbing.** Every team builds its own tag indexes, webhook handlers, and TTL jitter, with no dev-mode story and nothing catching accidental request-state reads inside cached components.

Prior art includes Rails fragment caching with nested ("Russian doll") invalidation, ESI (edge fragment caching with no dev story), and Nitro's `cachedEventHandler` / Next.js `"use cache"` (function and route-segment caching, closer to Astro's route caching and unaware of islands or slots). Partial Prerendering is a static shell with dynamic holes, which Astro already has as server islands; cached islands cover the inverse and compose with it.

# Goals

- Keep component behavior identical apart from staleness (markup, streaming order, hydration, CSP hashes, and `<head>` contributions), reducing cache hits to a store read.
- Reuse route caching's options (`maxAge`, `swr`, `tags`), `Astro.cache` / `context.cache` API (with one-way `set(false)` inside islands), live collection `cacheHint` support via `cache.set(entry)`, and shared `invalidate()` over one tag namespace.
- Support pluggable storage behind a small byte-oriented interface (`get`, `set`, `delete`, optional `getMany`), with built-in bindings for the Web Cache API, Vercel's Runtime Cache, unstorage drivers, and an in-memory LRU, and an optional global origin store behind regional ones, using `{ entrypoint, config }` descriptors like `sessionDrivers`.
- Provide bounded freshness (`maxAge` + `swr`), tag invalidation, and automatic invalidation on deploy.
- Support all existing island types inside cached islands via a renderer contract, support nested cached islands with propagation of tags, deadlines, oldest render timestamps, and opt-outs, and render caller slots per request.
- Persist nothing between requests in development (matching route caching), while still running record-and-replay on every request alongside compile/runtime guards, a dev toolbar app, and an opt-in local filesystem store.

# Non-Goals

- Changing route caching behavior. This proposal adds the fragment layer beneath it and defines how the two compose.
- Build-time cache seeding (such as `getStaticIslandPaths`).
- Portable cross-instance stampede locks in core (an optional store hook is in Unresolved Questions).
- General data or function caching (`cachedFn`), which could share the storage layer in a separate proposal.
- Caching inside prerendered pages (`server:cache` is a no-op with a dev warning).
- Keying on arbitrary request state. Cached islands only receive varying inputs through keyed props or per-request slots.

# Detailed Design

## The `server:cache` directive

`server:cache` goes on a component in an Astro template, like `server:defer`. It accepts a bare attribute, a boolean, or an options object:

```ts
type CachedIslandOptions = boolean | {
  key?: string;    // extends the derived key; never replaces it
  maxAge?: number; // seconds, matching routeRules
  swr?: number;    // stale-while-revalidate window after maxAge, in seconds
  tags?: string[];
};
```

- `server:cache={false}` renders the component normally, so caching can be toggled per call site.
- Omitted options fall back to `cache.islands.defaults` (default: `{ maxAge: 300, swr: 0 }`).
- Using `server:cache` without `experimental.cachedIslands` enabled is a build error naming the flag.
- Combining `server:cache` with `server:defer` or `client:only` is a compile error. Unknown `server:*` directives also become compile errors when `experimental.cachedIslands` is enabled (behavior without the flag stays unchanged).
- Putting `server:cache` on a component containing `<head>` (such as a document layout) is rejected.
- Dynamic component references (local variables or `Astro.self`) have no static import-map entry. Astro components still fall back to their runtime `moduleId`; unidentifiable dynamic components fail in dev and bypass caching in production.

## Scoped `Astro.cache`

Inside a `server:cache` subtree, `Astro.cache` (including when `Astro` is passed to helpers) is scoped to the island entry and keeps the `CacheLike` interface:

- `set({ maxAge, swr, tags })` merges into the island policy using route caching's merge rules: scalars are last-write-wins, `lastModified` is newest-wins, and `tags` accumulate.
- `set(liveDataEntry)` applies a live collection entry's `cacheHint`.
- `set(false)` sets a one-way `shareable = false` flag on the current recording (including waiters and any enclosing cached island), separate from policy merging. The island renders fresh without storing, and a later `set()` call from another component (such as a sibling passing a live entry's `cacheHint`) cannot re-enable storage. Because `set(false)` only runs on a miss or revalidation, callers that already know they need to bypass an existing cached entry should pass `server:cache={false}`.
- `invalidate()` calls the shared invalidation implementation.
- `tags` and `options` return the island entry's accumulated state. `enabled` is `true` when an island store is configured and `false` in development, matching route caching.

One-way `set(false)` differs from route caching, where a later `set()` currently re-enables caching. At the route level one page author usually controls the call order; inside an island, an opt-out and a later `set()` often live in different components, so allowing a sibling to undo an opt-out would leak uncacheable output. Whether route-level `set(false)` should also become one-way is an open question.

Nested tag propagation goes through an internal tag collector instead of public `set()`, so propagating tags never undoes `set(false)` and never turns on route caching by itself.

## Recording and replaying entries

On a cache miss, the subtree renders once, streaming to the response while recording three kinds of items:

1. HTML chunks.
2. Render instructions, serialized as data and recreated on replay. For example, `RendererHydrationScriptInstruction` carries a `render` closure, so recording captures its rendered output or looks up the renderer by `rendererName` on replay; `template-enter` and `template-exit` are recorded in order so `templateDepth` stays balanced. Replayed instructions go through the active response's deduplication state just like a fresh render, so hydration bootstraps, directive scripts, renderer scripts, the server-island runtime, and `<script>` tags are emitted once per page.
3. Slot holes. Where the subtree emits a caller-provided slot via `<slot />`, the recording stores a reference to that slot name and replay renders the current request's slot in place.

### Slot ownership and evaluation scope

Only slots passed by the caller of the cached island become holes. Slots constructed inside the cached subtree (such as a loop passing a `default` slot to a child component) are recorded inline. Forwarded outer slots retain their outer boundary identity.

Caller slots always evaluate against their immediate owner's `SSRResult`, restoring that owner's request-state guard, `Astro.cache` collector, and head scope (the unguarded page scope for a top-level island, or `Outer`'s scope when a cached `Outer` passes a slot to a cached `Inner`). This applies on both hits and misses. On a hit, caller slots still evaluate eagerly so slot-level head propagators register before `<head>` flushes.

### Slots that cannot be holes

Four cases turn a slot into a string instead of streaming it through `<slot />`, which would freeze per-request content into the entry:

- `Astro.slots.render()` returns a string that the component can inspect or transform.
- Forwarding a caller slot to a framework component renders it to a string for the framework renderer.
- Forwarding a non-fallback caller slot to a `server:defer` server island renders it with `renderSlotToString()` and encrypts it into the island's payload (the `fallback` slot streams normally and can remain a live hole).
- Putting `server:cache` directly on a framework component that receives slots, since its slots are already strings when it renders (a framework component with no slots caches normally).

In each case the render is marked non-shareable and skipped from storage. Dev raises `CachedIslandSlotError` naming the slot; production logs a once-per-boot warning and renders the island live on every request.

Slot content is never part of the cache key, but the set of passed slot names is, because `Astro.slots.has()` and slot fallbacks depend on which slots were supplied.

### Entry format and limits

Alongside the recorded items, each entry stores its `buildId`, effective `createdAt` (oldest render start among itself and any nested recordings baked in), absolute fresh and serve-until deadlines, accumulated tags, and (for head-resolved islands) head content and CSP hashes.

Entries serialize into a versioned opaque byte format under a string key. Unknown versions or corrupt payloads are treated as misses. Recording enforces a configurable byte cap (defaulting safely below platform limits): exceeding it mid-render stops recording while continuing to stream the response and skips storage. Entries are written with a store `ttl` matching their serve-until window (`maxAge + swr`) for eviction housekeeping; Astro always computes freshness from the entry's own metadata.

## Head content and CSP

Rendered content collection entries inject styles into `<head>`, styled SVG components add CSP style hashes, and server island placeholders add a preload link (when their fetch fits in a GET URL) and CSP script hashes. Astro marks these components and their import ancestors at build time so `bufferHeadContent` initializes them before `<head>` streams.

A cached island inherits its component's mode:

### Streamed islands

If the component is unmarked, nothing in its subtree can add to `<head>`. The entry holds body output only, and lookup happens at the island's position in the stream so a slow lookup or miss does not delay `<head>`.

### Head-resolved islands

If the component is marked, resolution splits into two phases matching Astro's head-propagation lifecycle:

- `prepare-head` (during `bufferHeadContent`): on a hit, injects stored head content and CSP hashes into `<head>` and eagerly evaluates caller slots so slot-level propagators register; on a miss, runs `init()` to collect head contributions without waiting on slow streaming body work before first byte.
- `emit-body` (in-stream at the island's position): on a hit, replays the body; on a miss, streams and records the body, then stores the entry once complete.

With header-mode CSP (`cspDestination === 'header'`), `prepare-head` must collect all CSP contributions from both the recording and live caller slots before response headers finalize. Any renderer that cannot promise this must buffer before headers commit or stay outside cached-island replay.

When a head-resolved hit resolves faster than rendering the subtree, time to first byte improves over an uncached render because the subtree no longer initializes before `<head>`.

Today's build-time head-propagation mark is coarse: any deferred-render content entry in a project (any MDX entry, or Markdown with `deferRender`) marks every component that imports `astro:content`, even if it never renders an entry. Those islands will be head-resolved, which matches current uncached behavior (no regression) until head-propagation marking becomes finer-grained in separate work.

View transition directives need one extension to that mark. `transition:name` and `transition:animate` push a `<style>` into `extraHead` during render without setting `propagation: 'self'`. During the build's import-graph walk below each cached island (also used by the request-state guard), any component using a transition directive is marked as a propagator, making the island head-resolved and storing its transition styles. Because the mark belongs to the component, pages rendering that component outside a cached island also initialize it before `<head>`.

If a streamed island adds head content or CSP hashes anyway, the entry is not stored and dev logs a warning naming the island.

## Server islands inside cached islands

A server island renders a placeholder with an inline `<script type="module" data-astro-rerun>` containing its per-render `hostId` and encrypted props. Its CSP hash changes per render, which works for a single replay because the stored hash matches the stored script. Reusing the same `hostId` can collide in two cases:

- On the same page (replaying the same entry twice, or a flattened parent alongside a standalone copy), duplicate `data-island-id` attributes would be emitted. Transitive ID namespace reservation (next section) handles this by rendering later occurrences live with fresh `hostId`s.
- Across `ClientRouter` navigations, if a slow fetch starts on page A and the user navigates to page B (which replays the same cached fragment with the same `hostId`) before A's fetch finishes, today's `replaceServerIsland(id, response)` queries the DOM *after* `await fetch(...)` and can overwrite page B's placeholder with page A's response.

To fix cross-navigation replacement without changing placeholder markup, deferred module timing, or CSP behavior, Astro will look up the `<script>` element by `hostId` *before* calling `fetch(...)`, pass that DOM node to `replaceServerIsland`, and bail out if `!element.isConnected` after `await response.text()`.

## Generated IDs

Framework renderers (React, Preact, Solid, Svelte, Vue) keep per-response counters for generated IDs (such as React's `useId`), and `transition:name` / `transition:persist` scopes are numbered per response too. Replaying a recording with another response's sequential numbers can collide with the target page's IDs or view transition names (causing browsers to skip transitions).

Inside a cached subtree, Astro seeds these counters from the entry's key:

- String-prefixed renderers (React, Vue, Svelte, Solid) and view transitions get a key-derived string prefix.
- Preact (`useId` uses a numeric root vnode mask via `islandCount` / `data-preact-island-id`) gets a numeric seed in a range disjoint from the response's sequential counter.

This prevents collisions with the surrounding page. Collisions between two distinct cached entries require two keys to produce the same seed (negligible for string prefixes; a small non-zero probability for Preact's narrower numeric space). Preact's per-result shared `signals` map does not bridge cached and uncached islands.

Replaying the same ID-bearing entry twice on one page, or replaying a flattened `Outer` containing `Child` next to a standalone `Child` (different keys, same `Child` IDs), would still duplicate IDs. Each recording therefore stores the transitive set of ID namespaces it contains. On replay, Astro reserves those namespaces on the active response; any subsequent occurrence whose namespaces overlap an already-reserved one renders live with a fresh occurrence-specific prefix. This covers repeated hits, a miss followed by a sibling hit, and flattened-child-plus-standalone layouts.

## Request lifecycle and concurrency

For each cached island, Astro derives the key, fetches the entry, and checks its `buildId` and tag epochs. If reading either the entry store or tag store fails, Astro falls back to a fresh render. A tag-store read error is never treated as a missing epoch, so unvalidated entries are never served.

Otherwise:

- On a fresh hit, Astro replays the entry and renders caller slot holes live against their immediate owner's `SSRResult`.
- On a stale hit within `swr`, Astro replays the entry and schedules background revalidation through the adapter's `waitUntil`. Revalidation runs isolated from the finished response with its own render state and synthetic hole-emitting slots matching `slotNames` (never invoking the original request's slot closures). Concurrent background revalidations for the same key on one instance are deduplicated.
- On a miss or expired entry, Astro renders, records, and stores the entry. Storage write failures log `IslandCacheSaveError` and never fail the request.

An entry is only written when rendering completes and stays shareable:

- If rendering throws, nothing is stored and the error propagates normally.
- If the client disconnects mid-stream, the recording detaches from the response and finishes under the adapter's `waitUntil`, recording remaining caller slots as holes without executing them so the work is saved and waiting requests still receive it. Without `waitUntil`, the render is abandoned and nothing is stored.
- If a render becomes non-shareable (`set(false)`, frozen slot, runtime guard violation, unsupported renderer path, or exceeding the recording byte cap), nothing is stored, waiters are not served from it, and any enclosing cached island becomes non-shareable too.

Concurrent misses for the same key on one server instance share a single render: the first request (leader) records while streaming, and waiters replay the completed recording. Waiters depend only on the recording, not on how fast the leader's client reads its response. If the leader is abandoned (disconnect without `waitUntil`), fails inside one of its own caller slots, or turns non-shareable, waiters are released to render independently instead of hanging or inheriting the leader's error.

Once any expression in a template awaits async work, Astro buffers remaining siblings in parallel, so a streamed island's store lookup runs concurrently with the rest of the template.

## Cache keys

```
sha256(encodeTuple([
  buildId,
  componentPath,
  componentExport,
  currentLocale,
  canonicalizeProps(userProps),
  sorted(slotNames),
  normalizedPolicy(options),
  options.key ?? '',
]))
```

- `encodeTuple` uses an unambiguous structured encoding (length-prefixed or JSON array) so field boundaries cannot collide.
- `componentPath` and `componentExport` identify the component the same way server islands do, falling back to `moduleId` for dynamic Astro component references.
- `userProps` excludes internal props added by the directive.
- Props are hashed, never transported, so any value with a deterministic canonical encoding works: primitives (including `undefined` distinguished from a missing key, `NaN`, `Infinity`, and `BigInt`), plain arrays and objects, `Date`, `URL`, `RegExp`, and `Map` / `Set` (in insertion order). Values are encoded recursively with type tags rather than `JSON.stringify`, so content entries with `Date` fields can be passed whole. Functions, symbols, and class instances throw `CachedIslandPropsError` in dev; in production they log a once-per-boot warning and bypass storage. Canonicalizing object keys assumes components do not rely on prop key insertion order.
- Key space grows with the prop domain. Passing unbounded user input (search queries, page numbers, free-form filters) creates one entry per distinct value; the memory store is bounded by `max`, while KV-class stores are not and charge per write. Normalize such props first or pass `server:cache={false}`.
- `Astro.currentLocale` is included unconditionally in v1.
- `slotNames` is the sorted list of passed slot names (not slot content), since `Astro.slots.has()` and slot fallbacks depend on slot presence.
- `normalizedPolicy(options)` applies defaults, clamps to `maxLifetime`, deduplicates `tags`, and sorts them, so formatting differences do not fragment the cache while call sites with identical props and slots but different directive policies (such as a 1-hour `catalog` call and a 10-second `sale` call) stay distinct. Without this, the second call's `sale` tag would be unpurgeable. Purging a shared tag invalidates both variants; purging a tag unique to one invalidates only that variant.
- `options.key` extends the derived key instead of replacing it, preventing collisions across components, exports, locales, policies, or builds.
- `buildId` is a random build-time ID added to the SSR manifest (the existing encryption key is secret and should not be reused). Every build starts with an empty namespace, avoiding stale asset URLs and undecryptable nested server islands. Because this scopes by build rather than environment, staging and production running the same build artifact against a shared store must use separate store namespaces.

## Storage

A route `CacheProvider` either sets CDN headers or intercepts whole HTTP responses via `onRequest`. Neither can hold component fragments, so cached islands use their own store interface and share `invalidate()` above it.

### Store interface

```ts
interface IslandStore {
  get(key: string): Promise<Uint8Array | undefined>;
  /** Retention time in seconds. The store may evict the value after this. */
  set(key: string, value: Uint8Array, options: { ttl: number }): Promise<void>;
  delete(key: string): Promise<void>;
  /** Optional batched read. Without it Astro issues parallel `get()` calls. */
  getMany?(keys: string[]): Promise<Array<Uint8Array | undefined>>;
}
```

`delete()` removes an entry that failed validation when the replacement render could not be stored.

Entries and tag epochs share this interface with one durability difference: early eviction of entries only causes a cache miss, while early eviction of tag epochs breaks invalidation (a purged entry would pass validation again). Tag stores must retain epochs for at least `maxLifetime + skewMargin` without size-based eviction. Monotonic epoch writes (such as compare-and-set or max-merge on Redis) are useful where supported, though not required: last-write-wins stores like Workers KV cannot guarantee them, and two racing purges of one tag differ by far less than `skewMargin`. `cacheStores.memory()` keeps tag epochs in a separate non-evicting map outside its entry LRU.

### Bindings and adapter defaults

Bindings use `{ entrypoint, config }` descriptors like `sessionDrivers`:

- `cacheStores.web(name)` uses the Web Cache API (`caches`) on Cloudflare Workers and Netlify Functions / Edge Functions. It wraps bytes in a `Response` under a synthetic URL derived from the key with `Cache-Control: max-age=<ttl>`, using only `match`, `put`, and `delete` (Netlify does not implement `keys()`).
- `cacheStores.unstorage(driver)` wraps any unstorage driver (`sessionDrivers.*`: Redis, KV, filesystem, etc.) via raw get, set-with-TTL, and remove.
- `cacheStores.memory({ max })` is an in-process LRU with expiry, sharing its implementation with `memoryCache()`.
- `cacheStores.vercel()` uses Vercel's Runtime Cache (`getCache()` from `@vercel/functions`) and serves as both entry store and tag store (see below).

Native Cache API stores are regional (per-colo on Cloudflare, per-region on Netlify), trading per-region cold starts for local reads with no per-read cost. An origin store (below) removes most of that trade. Validity is determined by tag epochs, which must be globally readable: when the entry store is regional, epochs live in a separate `tagStore` (any global unstorage KV); when the entry store is already global (such as Redis), `tagStore` defaults to the same store.

Adapters declare support and defaults through a new `islandCache?: AdapterSupport` feature flag:

- Cloudflare defaults to Web Cache API for entries, with one Workers KV namespace as both the origin store and the epoch store.
- Netlify defaults to Web Cache API for entries and Netlify Blobs for epochs (Netlify's automatic redeploy invalidation also matches `buildId` scoping).
- Node defaults to `cacheStores.memory()`, or unstorage over the filesystem when entries should survive restarts. Deployments with more than one instance should add a shared origin store (below).
- Vercel defaults to `cacheStores.vercel()` for both entries and epochs.

Using `server:cache` without a resolved store (on any adapter without defaults) is a build error naming `cache.islands.store`. Resolved store config is serialized into the SSR manifest beside route-cache config, and stores are instantiated per request like route-cache providers. To share one backend (such as Redis) across both route caching and islands, point both the route provider and the island store at the same instance.

### Origin store

An entry store that is local to a region or to a process renders every entry once per region or process. Cloudflare has hundreds of colos, so a long-tail entry may never be warm where the next request lands, and every deploy starts cold everywhere. A Node server's in-memory store is private to each instance and empty after every restart. `cache.islands.originStore` is an optional second entry store, shared by every region and instance, that sits behind `store`:

- **Local hit:** unchanged. The origin store is not read.
- **Local miss:** Astro reads the origin store before rendering. A valid entry there is replayed and copied into the local store in the background. Only if both miss does the island render, and the result is written to both.
- **Stale local entry:** the stale entry is replayed as usual. The background revalidation reads the origin store first and renders only if the origin has nothing newer.

Validity is still decided by the entry's own metadata and the tag epochs, so the two tiers holding different versions of an entry is harmless. An entry is rendered once globally instead of once per region or instance, and a deploy warms the origin once. When an origin store is set, `tagStore` defaults to it, since epochs need the same shared reach.

The costs are one origin read on the request path for each local miss, and one origin write for each stored render. Origin writes and backfills run through `waitUntil` and add no latency. Entries whose `maxAge + swr` is shorter than the origin store's minimum retention (60 seconds on Workers KV) are not written to it.

On Cloudflare the origin store is on by default, in the KV namespace the adapter already needs for epochs, and `originStore: false` turns it off.

On Node it is the recommended setup for any deployment with more than one instance. The default memory store on its own gives each instance its own copy of every entry and its own tag epochs, so an `invalidate()` call only reaches the instance that handled it. A shared store behind it makes this an ordinary two-level cache: hits are served from process memory with no network read, a miss or a newly started instance reads the shared store before rendering, and invalidation reaches every instance.

```js
cache: {
  islands: {
    store: cacheStores.memory({ max: 1000 }),
    originStore: cacheStores.unstorage(sessionDrivers.redis({ url: process.env.REDIS_URL })),
  },
},
```

Elsewhere it is off by default and rarely worth enabling. On Netlify and Vercel pages render in functions, not at the edge, and functions run in one region by default (up to a handful on Vercel's paid plans), so the regional store already sees nearly every request and an origin store would add a read to each miss for little gain.

### Vercel Runtime Cache

Vercel has no Web Cache API and no built-in global key-value store, but its Runtime Cache has tags, and `expireTag()` reaches every region within 300 ms. `cacheStores.vercel()` builds epochs from that:

- **Entries** are stored regionally under the island key, with no native tags.
- **Epochs** are marker entries. Each region keeps one marker per tag, tagged with that tag, whose value is its creation time. Reading a tag's epoch reads the marker, creating it at the current time if it is missing.
- **`invalidate()`** calls `expireTag()` once with all the tags, which removes their markers in every region. The next read in each region recreates the marker, and every entry whose render started before that fails validation.

A missing marker therefore means "invalidated now" rather than "never invalidated". That is what makes the Runtime Cache's LRU eviction safe here: an evicted marker costs misses and never revives a purged entry. Entries rendered between a purge and the marker's recreation are rejected too.

### Platform limits

- Cloudflare's Cache API requires full `http(s)://` URLs, has no effect in the dashboard editor and Playground previews, and is unavailable to Workers behind Cloudflare Access. Workers KV caps writes at 1 write/sec per key, which matters for webhook bursts on hot tags and for regions racing to store the same origin entry; the losing writes are dropped. The `cloudflare-kv-binding` unstorage driver reads one key at a time, so `getMany` falls back to parallel reads. Origin writes and epoch writes draw on the same account-wide KV write quota: on the Workers free plan (1,000 writes a day) a busy site can exhaust it with origin writes, after which `invalidate()` rejects until the quota resets. Sites on the free plan should set `originStore: false`.
- Netlify's Cache API limits entries to 10 MB, requires `max-age` of at least 1 second, and allows 100 lookups and 20 writes per invocation (oversized or over-quota writes may be declined without throwing). Standard Netlify Blobs stores have no native TTL, so epoch cleanup requires explicit expiration or periodic deletion.
- Vercel's Runtime Cache limits items to 2 MB, and `expireTag()` is rate limited per plan and resolves normally when a call is rejected, so a purge made over the limit is lost without an error.
- Entry write failures are non-fatal everywhere and degrade to misses.

### Development

Nothing persists between requests in dev (matching route caching), so cached islands always render fresh. Unlike route caching, Astro still runs record-and-replay within each request, and island-scoped `Astro.cache` records `set()` calls instead of acting as a `NoopAstroCache`. That exercises frozen slots, script deduplication, head handling, the request-state guard, and the toolbar locally. To test persistent storage locally, configure `cacheStores.memory()` or `cacheStores.unstorage()` with `fs-lite` at `.astro/island-cache`.

## Invalidation and tag epochs

`Astro.cache.invalidate()` is the single invalidation API, fanning out to both the route-cache provider and the island tag store. Today it throws `CacheNotEnabled` without a route provider; with cached islands, it succeeds if either layer is configured.

`InvalidateOptions` stays `{ path?, tags? }`. `{ path }` remains route-only, since islands are not keyed by URL. When `cache.islands` is configured without `cache.provider`, response-level `set()` keeps today's one-time warning and no-op while island-scoped `set()` and `invalidate()` remain active. There is no purge-everything option (route caching has none and deploys already reset the island cache) and no key-based purge (derived keys are opaque, and purging by `options.key` would need a secondary index; tags cover it).

`memoryCache()` invalidates tags by scanning its entries, which does not scale on KV-class storage. Cached islands use tag epochs instead:

1. `invalidate({ tags: ['product:123'] })` writes `tag:product:123 = now()` to the tag store (one write regardless of how many entries carry the tag).
2. On read, an entry is valid only if `entry.createdAt - skewMargin > max(epoch of each tag in entry.tags)`. Because `createdAt` is when rendering started (not when it finished storing), an entry built from pre-purge data fails validation even if written after the purge.
3. `skewMargin` (a fixed few seconds) absorbs clock skew across server instances so a fast clock cannot stamp pre-purge data ahead of an epoch. Entries rendered during those few seconds after a purge are rejected too; to avoid write storms in that window, Astro skips `store.set()` whenever `renderStartedAt - skewMargin <= maxEpoch` while still serving the fresh render.
4. Epochs are fetched via `getMany` (or parallel `get`) and memoized per server instance for about one second; calling `invalidate()` updates the caller's memo immediately. Tag-store read errors treat the entry as unvalidated and trigger a fresh render. On short-lived instances like Workers isolates, the memo rarely hits, so a hit costs one entry read per island plus one tag read per distinct uncached tag in that request (when the driver lacks batched reads). Pages with many differently tagged islands should account for per-invocation limits like Workers subrequests and Netlify's 100 Cache API lookups.
5. Entries are never enumerated; superseded entries expire via `ttl` or are overwritten on the next miss.
6. Each epoch is stored with a TTL of `maxLifetime + skewMargin`, bounded by `cache.islands.maxLifetime` (seconds, default seven days). `maxLifetime` also caps `maxAge + swr` on entries (reducing `swr` first, with a dev warning), preventing unbounded tag-store growth.
7. Purge consistency follows the tag store's read consistency (immediate on Redis, eventual on KV). Partial failures in `invalidate()` (for example, route purge succeeds while an epoch write fails) reject so callers can retry. Because an in-flight route-cache render can still store its response after a route purge, cross-layer purge consistency is bounded by what the route provider guarantees.
8. Tag epochs are the v1 contract across all stores; native store tag purging is an open question.

## Nesting and route-cache composition

When an outer cached island renders a nested cached island, the outer entry stores the child's flattened output so a warm outer hit takes one store read. Four values propagate up through the internal tag collector:

- Tags from `set()` calls, live collection `cacheHint`s passed to `set(entry)`, and nested cached islands accumulate into the outer entry.
- `createdAt` becomes `min(outerRenderStart, ...nestedHits.map(h => h.createdAt))` (or per-tag oldest render time), so an outer island rendered in a region that has not yet seen a purge cannot bake in a pre-purge child under a newer timestamp and survive convergence.
- Absolute fresh and serve-until deadlines tighten to the earliest deadline among nested recordings baked in, so a 60-second child inside a 1-hour parent cannot outlive its own expiry. If an outer miss encounters an SWR-stale child, it renders the child fresh (or skips storing the outer entry) instead of baking stale bytes into a fresh parent.
- Non-shareable state propagates up: if a nested island opts out with `set(false)` or becomes non-shareable (runtime guard, frozen slot, unsupported renderer), the enclosing recording becomes non-shareable too.

Calling `Astro.cache.set(liveEntry)` inside a nested island therefore ties the island, every enclosing cached island, and any tagged route-cache entries to one `invalidate({ tags })` call, with validation cost independent of nesting depth.

### Propagating tags to route caching

The outermost cached island forwards its final tags up to the response through the internal collector (from the stored entry on a hit, and from the collector on a miss). That keeps wrapping a component in `server:cache` from dropping its tags from a route-cached page. Only tags propagate to the route; route `maxAge`, `swr`, and `lastModified` stay governed by the route policy.

Route-cache headers are written in `applyCacheHeaders` before the body streams, and `server:cache` does not mark ancestor components for head propagation, so `bufferHeadContent` will not see streamed cached islands inside non-propagating layouts or async children. Because page frontmatter executes when the root component factory runs in `renderPage`, Astro checks whether a route-cache policy is active (from `routeRules`, middleware, or page frontmatter) after root factory initialization and before choosing the body sink. If a policy is active and the route's build-time import graph contains a cached island, Astro reuses the initialized template result to render non-streaming so every cached island resolves and contributes its tags before `applyCacheHeaders` runs. Other route-cached pages and uncached routes continue streaming normally.

## Framework renderers

First-party framework renderers read request state and deduplicate assets outside `Astro.*`, so cached islands need an explicit renderer contract:

- React reads `result.request` and `result.actionResult` directly to emit `data-action-result`, `data-action-key`, and `data-action-name` into hydration markup. Cached-island lookups must bypass whenever the request carries an action result (so a cached GET never swallows a form submission's action result), and renderers must not read request state inside a cached subtree without marking the render non-shareable.
- Solid unconditionally reads `result.request` and `createAstro().locals` to populate `getRequestEvent()`, and deduplicates `lazy()` boundary CSS against a per-response `ctx.styles` set inside the renderer. Inside a cached subtree, Solid must gate `getRequestEvent()` lazily (marking the render non-shareable only if actually read, or omitting it) and isolate or emit lazy CSS symbolically so a fragment warmed after an earlier Solid sibling does not lose its styles on replay.

Each official renderer opts into this contract, participating in key-seeded IDs, isolated deduplication, and tracked request access. Renderers that do not opt in cause enclosing cached islands to bypass storage with a dev warning. Nested server islands work as described earlier, and their encrypted props stay valid for the build's lifetime (matching `buildId` scoping).

## Request-state guard

To catch cached components reading request state, Astro enforces an allowlist on `Astro` inside cached subtrees. This covers Astro component code (it cannot intercept arbitrary `AsyncLocalStorage` reads; framework renderers are covered by the renderer contract).

Allowed members on `Astro`: `props`, `slots`, `self`, `currentLocale` (part of the key), `site`, `generator`, `isPrerendered`, `logger`, and island-scoped `cache`.

Disallowed members:

- Unkeyed request state: `request`, `url`, `params`, `cookies`, `session`, `locals`, `clientAddress`, `preferredLocale`, `preferredLocaleList`, `originPathname`, `routePattern`, `getActionResult`. (`Astro.params` is easy to miss: an island inside `/c/[slug]` reading it would cache the first slug for every slug.)
- Response side effects that would not run on a hit: `response`, `redirect`, `rewrite`, `callAction`, `csp`.

### Compile-time and runtime checks

At compile time, the compiler reports every access to a non-allowlisted `Astro` member per component, including destructuring. The build walks the import graph below each cached island and reports the component, the property, and the fix (pass it as a prop so it enters the key, or move it into a slot so it renders per request). An access in the cached component's own file is a build error; an access in a direct or transitive imported component is a build warning, since the import graph is wider than what actually renders (an imported component might never execute inside the island, or might only read request state on an untaken branch).

At runtime, the `Astro` object inside a cached subtree enforces the same allowlist, catching dynamic accesses (`Astro[key]`), passing `Astro` to helpers, and request state re-exported through helpers. In dev, a disallowed access throws `CachedIslandRequestAccess`. In production, the request still succeeds, nothing is stored, and a once-per-boot warning is logged, so request-specific output is never served to another visitor.

## Comparison with route caching

| | Route caching (`cache` + `routeRules`) | Cached islands (`server:cache`) |
| --- | --- | --- |
| Unit | HTTP response | Component subtree |
| Keyed by | URL (+ provider query config) | Component identity, props, slot names, locale, policy, user key, `buildId` |
| Declarative policy | `routeRules` patterns | `server:cache` options |
| Imperative policy | `Astro.cache.set()` | Same call, island-scoped |
| Storage | Provider (CDN headers or response interception) | Key-value island store + global tag store |
| Delivery | HTTP (`ETag`, `Last-Modified`, `CDN-Cache-Control`) | In-stream replay |
| Invalidation | `invalidate({ path, tags })` | Same call, shared tag namespace |
| Development | No-op | Nothing persisted; record/replay, guard, and toolbar run on every request |

When a route cache or CDN serves a response, Astro does not render the page and cached islands do not run. Cached islands apply when rendering an uncached dynamic shell. `etag` and `lastModified` are omitted from `server:cache` options because fragments have no HTTP conditional-request semantics.

## Observability

- A dev toolbar app beside Audit and Inspect outlines cached islands on the page and displays each island's head mode (streamed or head-resolved), derived key, accumulated tags, and freshness windows.
- Optional dev-only HTML comments (off by default, and omitted in DOM-sensitive contexts like SVG and tables so dev DOM matches production): `<!--astro:cache island status=replayed tags=category:boots-->`, plus `age=...` when local storage is enabled.
- An opt-in debug response header summarizing per-island cache status for staging.

## Implementation outline

- Compiler: lower `server:cache` like `server:defer` (resolve component identity from the import map, pass options as an internal prop, strip the directive from user props) without marking the containing component for head propagation. Emit cached components and `Astro` member accesses as build metadata. These are the compiler's first codegen-level diagnostics.
- Runtime: add the cached-island render path beside server islands, record/replay with byte cap and instruction normalization, island-scoped `Astro.cache` and internal tag collector, non-streaming route-cache fallback, allowlisted `Astro` wrapper, and the renderer contract plus key-seeded ID counters in official framework renderers.
- Server islands: resolve the placeholder `<script>` element by `hostId` before `fetch` and check `element.isConnected` before replacing it.
- Build: add `buildId` to the SSR manifest, run the request-state guard and transition-directive head-propagation pass, and serialize store config. Unlike server islands, cached islands need no manifest map of island modules because they only render inside requests (including background revalidations) that already loaded their module.
- Adapters: add `islandCache` feature support and store defaults for Cloudflare (including the KV origin store), Netlify, Node, and Vercel (the Runtime Cache binding).

# Testing Strategy

### Unit tests

- Key derivation (structured tuple encoding, slot-name variance, normalized declarative policy variance, prop canonicalization and errors).
- Epoch validation with `skewMargin` and post-purge write-storm suppression.
- Record and replay round-trips for every render instruction type, including `RendererHydrationScriptInstruction` and balanced `template-enter`/`template-exit`.
- Scoped `cache.set()` merging and one-way `set(false)`.

### Integration tests

Modeled on the existing server-islands suites:

- Nesting matrix (client-in-cached, server-in-cached, cached-in-cached, internal vs. caller slots at every level) and non-hole slots (`Astro.slots.render()`, slots passed to framework components or `server:defer`).
- Concurrency and failure handling: concurrent miss coalescing with caller-owned slots, leader disconnects (with and without `waitUntil`), non-shareable renders, store/epoch read failures, and mid-render errors.
- Framework renderers: React action-result bypass and Solid lazy-CSS replay across page compositions.
- Freshness and invalidation: nested deadline and `createdAt` inheritance (parents cannot extend near-expiry children or resurrect purged children during delayed epoch convergence), same-component different-policy warm-up ordering, epoch retention under entry-LRU eviction, i18n key variance, and build scoping across two consecutive builds.
- Head, CSP, and IDs: streamed vs. head-resolved (`prepare-head` / `emit-body`) hits and misses including async live slots, CSP hash parity, transitive ID namespace reservation for repeated entries and flattened-child-plus-standalone layouts, and `ClientRouter` navigation from page A to page B replaying the same cached server island while A's fetch is in flight (B keeps its fallback until B's response arrives).
- Route-cache composition: non-streaming tag collection on route-cached pages, island tags reaching `Cache-Tag` on hits and misses, and one `invalidate()` clearing both layers.

### Dev server and store conformance

- Dev server e2e tests covering the toolbar app, record-and-replay without persistence, opt-in `fs-lite` local store, and guard errors/warnings.
- A store conformance suite run against every shipped binding and available to custom store entrypoints (`get` / `set` / `delete` round-trips, epoch validation, batched reads, retention behavior, and for `cacheStores.vercel()` marker recreation after `expireTag()` and after eviction).
- Origin store: local miss served from origin with backfill, both-miss render written to both, stale local entry revalidated from origin without rendering, and origin write failure degrading to regional-only.

# Drawbacks

- Adds complexity to Astro's hottest render path, though unused pages pay only a single property check (the same check server islands already make) and the feature ships behind an experimental flag.
- Adds a second cache layer for developers to learn, mitigated by shared options, build scoping, and the dev toolbar.
- Head mode depends implicitly on what a subtree imports, which is hard to tell without the dev toolbar; marking transition-directive components under a cached island also makes them head-resolved everywhere else they render.
- Including `buildId` in the key empties the cache on every deploy, causing a post-deploy wave of misses, renders, and writes on busy sites. Without an origin store that wave repeats in every region.
- An origin store puts a network read on the request path of every local miss, before the render it may or may not save.
- Unbounded user-supplied props can explode key cardinality on KV stores, and large entries depend on the byte cap (compression is still an open question).
- Because the compile-time guard only warns on imported components and production falls back to rendering uncached, a guarded island can silently become a performance regression.
- Repeated ID-bearing entries on the same page only replay the first occurrence and render later ones live.
- Route-cached pages whose import graph contains a cached island disable response streaming.
- Tag invalidation on eventually consistent stores (such as Workers KV) is eventually consistent and must be documented clearly.

# Alternatives

- Userland recipes, an integration, or a `<Cacheable>` component cannot participate in render-instruction deduplication, head propagation, or CSP hashing, cannot auto-scope by build, and cannot enforce request-state guards.
- Caching `/_server-islands/` responses still fetches fragments from the client after the dynamic shell paints and does not compose with per-request slots or nesting. (The hybrid `server:cache="defer"` option in Unresolved Questions flips that order so cold hits defer and warm hits inline.)
- Teaching route-cache providers to punch per-user holes is ESI at the response layer: it fights HTTP caching semantics, ties hole-punching to provider capabilities, and cannot express nesting.
- ESI / edge includes are platform-specific, lack a dev story, and do not compose with islands or slots.
- Data-layer caching (`cachedFn`) skips data fetches without skipping rendering or handling island metadata; it is a useful complement on the same storage layer, not a replacement.
- A single head mode either delays TTFB for every cached island (always buffering before `<head>`) or breaks content entries, styled SVGs, and server islands (always streaming).
- Using the Web Cache API (`match` / `put` / `delete` on `Request`/`Response`) as the store contract (tried in an earlier draft) forces every non-Cloudflare/Netlify backend, including Node (where undici's `caches` is an unbounded in-process `Map` without expiry or size limits), to fake HTTP semantics with synthetic URLs, metadata headers, and `Cache-Control`. A byte key-value interface keeps that translation inside one binding.
- Naming the directive `cache:*` or `static:island` adds a new namespace; `server:cache` reuses the `server:` compiler path and pairs with `server:defer`.

# Adoption strategy

Ships behind `experimental.cachedIslands`, gating the `cache.islands` config key and the `server:cache` directive. Route caching is already stable; the flag only extends its config block and invalidation path. The `replaceServerIsland` node-capture fix ships ungated because it preserves existing markup, execution timing, and CSP behavior.

The migration guide will target hand-rolled KV + `set:html` caching: the wrapper and `set:html` become `server:cache`, custom keys become `key`, TTLs become `maxAge`, and custom tag indexes, webhooks, and deploy-flush scripts can be deleted. Sites already using `routeRules` get fragment caching without changing their invalidation code.

Docs can present Astro's caching options along a simple spectrum: prerendering (cached per deploy), route caching (bounded freshness for shared responses), cached islands (bounded freshness for shared fragments inside dynamic shells), server islands (uncached and deferred), and client islands (client-managed freshness).

# Unresolved Questions

1. **`waitUntil` availability.** Adapters pass `waitUntil` into renders, and route-cache providers optionally receive it in `onRequest`. Cached islands need it at render time on every adapter for background revalidation and finishing detached recordings after a client disconnect. Is threading it through to the island layer enough, and what should Node do when no platform hook exists: fire-and-forget, or synchronous revalidation on the next stale hit?
2. **Cross-instance stampede control.** Beyond per-instance in-flight deduplication, is an optional `lock()` on `IslandStore` enough, or should the portable layer include best-effort locking?
3. **`stale-if-error`.** Should a failed revalidation serve the stale entry past `swr` (with an upper bound)?
4. **Compression.** Should large entries be compressed always, never, or above a per-store threshold?
5. **Hybrid `server:cache="defer"` mode.** On a miss, emit a server-island placeholder and let `/_server-islands/` render, respond, and populate the store, so cold paths defer like server islands and warm paths inline HTML. Omitted from v1 to avoid coupling the two systems.
6. **Cross-deploy pinning.** An `ASTRO_KEY`-style opt-in for very large caches that want entries to survive deploys, with users taking responsibility for asset-hash stability.
7. **Options parity with route caching.** Should scoped `set()` ignore `etag` silently or warn in dev? Should duration strings (`'10m'`) be added to both `routeRules` and `server:cache`, or should both keep plain seconds? And should route-level `set(false)` become one-way to match islands?
8. **Native tag purge on `IslandStore`.** If a future store can delete by tag natively, should `IslandStore` gain an optional `purgeTags()` (passing tags to `set()` and bypassing epochs when present), or should tag epochs stay the permanent portable contract? Either way, this belongs on `IslandStore` rather than `CacheProvider`. The Vercel binding shows a third option, epochs rebuilt from a platform's global tag purge: could that replace KV epochs on other platforms?
9. **Purge everything.** Should `InvalidateOptions` add `{ all: true }`? On the island side that is one deploy-scope epoch, while on the route side every `CacheProvider` would have to implement it, placing it outside this proposal.
