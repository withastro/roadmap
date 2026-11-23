**If you have feedback and the feature is released as experimental, please leave it on the Stage 3 PR. Otherwise, comment on the Stage 2 issue (links below).**

- Start Date: 2026-07-28
- Reference Issues: https://github.com/withastro/roadmap/issues/945 (Server Islands), https://github.com/withastro/roadmap/issues/1151 (Live content loaders), https://github.com/withastro/roadmap/issues/1140 (Route caching), https://github.com/withastro/roadmap/issues/1356 (Rust compiler)
- Implementation PR: <!-- leave empty -->
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1454
- Stage 3 PR: <!-- leave empty -->

# Summary

A new island primitive: **cached islands**, using a `server:cache` directive. A cached island is rendered on demand once, stored as a stream of render chunks and instructions rather than an HTML string, and replayed into later responses until it expires or is invalidated. The page around it is still rendered on demand; the expensive shared subtrees inside it are not.

This is the inverse of server islands. Server islands are dynamic holes in a static shell. Cached islands are stored fragments in a dynamic shell, and their slots are rendered per request, so the two patterns nest.

Entries use the same `maxAge`, `swr` and `tags` options as route caching, and invalidation goes through the existing `Astro.cache.invalidate()`, so one tag purge clears cached routes and cached islands together. Storage is a small key-value store interface, with bindings for the web Cache API, unstorage drivers and memory, and defaults supplied by adapters.

Route caching (`cache` + `routeRules`) caches whole responses keyed by URL. Cached islands apply the same model below the response boundary, on pages whose shells are personalized and so cannot be route-cached. The two layers share tags, invalidation, `CacheHint` flow and the `WaitUntilHook`, and can be used in the same request.

The pattern is sometimes called "reverse islands". Several of the largest Astro deployments implement it by hand with KV stores and `set:html`. They all build the same plumbing and hit the same bugs, several of which cannot be fixed outside the framework.

# Example

A commerce category page. The shell depends on the request (session, currency, consent, experiment bucket), so `routeRules` cannot cache it. The product grid is expensive, identical for every visitor in a locale and only changes when the catalog does.

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
    <!-- Slots are rendered per request: a dynamic hole inside the cached fragment -->
    <CartBadge slot="corner" user={user} />
  </ProductGrid>

  <!-- Server islands work alongside, unchanged -->
  <Recommendations user={user} server:defer>
    <div slot="fallback">Loading…</div>
  </Recommendations>
</Layout>
```

`server:cache` with no options uses the configured defaults and an automatic key derived from the component identity, props and locale. Option names and units match route rules (`RouteRule`): seconds, not duration strings.

Configuration goes inside the existing `cache` block, next to the route-level provider:

```js
// astro.config.mjs
import { defineConfig, memoryCache, cacheStores, sessionDrivers } from 'astro/config';

export default defineConfig({
  cache: {
    provider: memoryCache(),           // route caching, unchanged
    islands: {
      // Native CacheStorage where the platform has it; adapters default this
      store: cacheStores.web('astro:islands'),
      // Global store for tag invalidation state; adapters default this too
      tagStore: cacheStores.unstorage(sessionDrivers.cloudflareKVBinding({ binding: 'ISLAND_TAGS' })),
      defaults: { maxAge: 300, swr: 3600 },
      // Ceiling on maxAge + swr for any entry; defaults to seven days
      maxLifetime: 86_400,
    },
  },
  routeRules: {
    '/api/[...path]': { swr: 600 },    // the two layers coexist
  },
});
```

Invalidation uses the existing API: `Astro.cache` in routes, `context.cache` in endpoints, actions and middleware. One call clears both layers:

```ts
// src/pages/api/purge.ts
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, cache }) => {
  const { tags } = await request.json();
  await cache.invalidate({ tags }); // e.g. ['category:winter-boots', 'product:123']
  return new Response('ok');
};
```

# Background & Motivation

Astro has several ways to avoid rendering work: prerendering and route caching store the whole page, and server islands put dynamic fragments inside a static shell. What is missing is the reverse: stored fragments inside a dynamic shell.

Prerendering is all-or-nothing per route. As soon as a page needs any per-request logic (a session, a currency, a consent state, an experiment bucket) the whole route is rendered on demand, and every expensive subtree in it is rendered for every visitor. Server islands address the opposite problem and don't help here.

Route caching ([documentation](https://docs.astro.build/en/guides/caching/)) addresses this at the response level. Providers either set CDN headers (`CDN-Cache-Control`, `Cache-Tag`, `Last-Modified`, `ETag`) or intercept requests via `onRequest`, as the built-in `memoryCache()` provider does; `routeRules` sets policy in config and `Astro.cache.set()` adjusts it per request. This works for responses that can be shared as a unit. It does not work for the pages this proposal targets, because a response cache is keyed by URL: a page whose shell varies per user cannot be response-cached, or only as per-user variants, which defeats the purpose. The built-in `memoryCache()` provider already declines to store responses that set Astro cookies or vary on `Cookie`. Those are the pages whose expensive subtrees are shared.

Caching server islands doesn't help either. Nothing stops you setting `Cache-Control` on `/_server-islands/` responses today, but the island is still a deferred client fetch, so the cached fragment arrives after the dynamic shell rather than with it.

Teams running large Astro sites work around this by caching rendered fragments themselves: render a component, store the HTML in KV or Redis under a hand-built key, replay it with `set:html`, invalidate by TTL or webhook. This breaks in several ways, because a rendered Astro fragment is not representable as a string:

1. **Render instructions are lost.** Astro's render output interleaves HTML with render instructions that the response deduplicates as it streams: the hydration bootstrap and each directive's script are emitted once per page, renderer scripts once per framework, the server-island runtime once, and each `<script>` once. Replay a cached string and, depending on what else is on the page, those scripts are either emitted twice or not at all. The deduplication state belongs to the response being rendered, so this cannot be fixed in userland.
2. **Deploys invalidate entries without anyone noticing.** Cached HTML contains hashed asset URLs inside `<astro-island>` markup, and any nested server island contains props encrypted with the per-build key (rotated every build unless `ASTRO_KEY` is set). An entry that outlives its deploy serves scripts that 404 and islands that cannot be decrypted.
3. **Slots are frozen.** String caching cannot keep child content per-request, so anything with a personalized child either cannot be cached or caches the first visitor's data for everyone.
4. **Head content and CSP break.** Some components add to `<head>` while they render: rendered content entries add their styles, and with `security.csp` enabled, server island placeholders and styled SVG components add script and style hashes to the page's policy. A replayed string adds nothing, so its styles are missing and its inline scripts violate the policy Astro generated for the page.
5. **Everyone writes the same invalidation code** (tag indexes, webhook endpoints, TTL jitter), with no dev-mode story and nothing to stop a fragment reading request state.

Prior art: Rails has had fragment caching with nested ("russian doll") invalidation since Rails 4. ESI does fragment caching at the edge but has no development story. Nitro's `cachedEventHandler` and Next's `"use cache"` cache at the function and route-segment level, which is where Astro's route caching sits. None of these are component-tree-native or island-aware. Partial Prerendering is a static shell with dynamic holes, which Astro already has as server islands; this proposal is the inverse, and the two can be used together.

# Goals

- **Semantics-preserving.** `server:cache` changes cost, not behavior. Markup, streaming order, hydration, CSP hashes and head handling are identical apart from staleness. On a hit the island costs a store read instead of a render.
- **Shared API with route caching.** The same `maxAge`, `swr` and `tags` options, the same `Astro.cache` / `context.cache` object with the same merge semantics, and the same `invalidate()` call. One tag namespace; one purge clears routes and islands.
- Pluggable storage behind a three-method store interface (`get` / `set` / `delete` on opaque bytes), with bindings for native `caches` where platforms have it, any unstorage driver, and an in-memory LRU, configured with the same `{ entrypoint, config }` descriptors as `sessionDrivers`.
- Bounded freshness (`maxAge` + `swr`), tag purge and automatic invalidation on deploy.
- All existing island types work inside a cached island. Cached islands nest, and inner tags propagate to outer entries.
- Slots are rendered per request.
- Live collection `cacheHint`s flow into island entries through the same `cache.set(entry)` call route caching accepts.
- Development matches route caching in keeping nothing between requests, but still records and replays each island so the replay path is exercised. Plus build-time guards, a dev toolbar app and an opt-in filesystem store for testing storage locally.

# Non-Goals

- **Changing route caching.** This adds the fragment level beneath it and defines how the two compose. No route-level behavior changes.
- **Build-time seeding.** A `getStaticIslandPaths`-style API for pre-warming known prop combinations could follow later.
- **Cross-instance stampede locks.** Core cannot guarantee them portably; an optional hook on the store interface is proposed instead (see Unresolved Questions).
- **Data/function caching** (a `cachedFn`). Could share the storage layer; separate proposal.
- **Caching inside prerendered pages.** No-op with a dev warning; the page is already cached at deploy scope.
- **Request-derived variance.** Everything an island depends on arrives through props (keyed) or slots (per-request). This is a deliberate constraint rather than a limitation to remove later.

# Detailed Design

## The directive

`server:cache` goes on a component in a template, as `server:defer` does. It is a bare attribute, a boolean, or an options object:

```ts
type CachedIslandOptions = boolean | {
  key?: string;      // extends the derived key; never replaces it
  maxAge?: number;   // seconds, as in routeRules
  swr?: number;      // stale-while-revalidate window after maxAge, in seconds
  tags?: string[];
};
```

- `server:cache={false}` renders the component normally, so caching can be switched per use.
- Options not given fall back to `cache.islands.defaults`.
- `server:cache` and `server:defer` on the same component is a compile error, as is any unknown `server:*` directive.
- Without `experimental.cachedIslands`, the directive is a build error naming the flag.

## Scoped `Astro.cache`

Route caching has a declarative surface (`routeRules`) and an imperative one (`Astro.cache.set()`). Cached islands have both. The directive options are the declarative path. For the imperative path, inside a `server:cache` subtree `Astro.cache` (and `context.cache` in anything the subtree calls) is scoped to the island entry instead of the response. It has the same `CacheLike` type:

- `set({ maxAge, swr, tags })` configures the island entry with the merge semantics route-level `set()` has: scalars last-write-wins, `lastModified` newest-wins, tags accumulate
- `set(liveDataEntry)` applies a live collection entry's `cacheHint`, as at route level
- `set(false)` opts this render out: the island renders fresh and nothing is stored. As at route level, a later `set()` re-enables it
- `invalidate()` is the shared implementation

A component that calls `cache.set()` doesn't need to know whether it is the whole response or one island of it. Scoping is also what makes nested tag propagation work (see below).

## Entries: recorded output, not strings

An entry is the island's recorded render output. On a miss the subtree renders once: its output streams to the response as usual and is recorded at the same time, as a sequence of three kinds of item:

- **HTML.**
- **Render instructions**, stored as data and recreated on replay. A replayed island takes part in the response's deduplication exactly as a fresh render does: the hydration bootstrap is emitted only if no earlier island emitted it, renderer scripts once per framework, and so on. This addresses problem 1.
- **Slot holes.** Where the subtree rendered a slot, the entry records the slot's name, and replay renders the slot passed on the current request. Server islands do the opposite: the shell renders slots to strings and sends them to the island endpoint. Here the fragment is stored and the slots are live. This addresses problem 3.

A hole exists only where the subtree emits a slot into its output with `<slot />`. Three cases never do that, so the slot's content would be frozen into the entry:

- `Astro.slots.render()` returns a string, which the component can inspect or transform.
- A slot forwarded to a framework component is rendered to a string and handed to the framework's renderer.
- `server:cache` on a framework component: every slot it is passed is a string by the time it renders. A framework component passed no slots can be cached normally.

In each case the render is not stored. Dev shows a `CachedIslandSlotError` naming the slot; production logs a once-per-boot warning and renders the island on every request.

Which slots were passed also changes the output without going through a hole: `Astro.slots.has()` branches on it, and a slot that was not passed renders its fallback content. The set of passed slot names is therefore part of the key (below). Slot content never is.

Alongside the output, an entry records the build it came from, when its render started, its freshness windows and its accumulated tags, plus head content and CSP hashes for head-resolved islands (below).

Stores see an entry as bytes under a string key. The value is a versioned serialization of the metadata and the recorded output, opaque to the store. It is written with a retention time of `maxAge + swr`, so the store keeps it through the stale window and may drop it afterwards. Retention is only housekeeping: freshness is always computed by Astro from the entry's own metadata.

## Head content and CSP

Some components add to `<head>` while they render: rendered content collection entries add their styles, styled SVG components add CSP style hashes, and server island placeholders add CSP script hashes. Astro already handles these through head propagation. At build time such components, and every component above them in the import graph, are marked; on a page containing them, Astro renders the marked components before it sends `<head>`, so their contributions can be collected.

A cached island follows the mode its component already has:

- **Streamed.** If the component is not marked, nothing in its subtree can add to the head. The entry holds body output only, and the lookup happens where the island appears in the stream: a slow lookup or a miss delays the island, not the page head.
- **Head-resolved.** If the component is marked, the island is resolved during head collection, which is when Astro would render it anyway. On a hit, the entry's stored head content and CSP hashes go into the head, and its body is replayed in place. On a miss, the subtree renders during head collection exactly as it would without caching, and its head contributions are recorded alongside the body. This addresses problem 4.

Neither mode is slower than rendering without the directive, apart from the lookup itself, and a head-resolved hit reaches first byte sooner than the uncached render, because the subtree no longer renders before `<head>`.

The build-time mark is coarse. A single deferred-render content entry anywhere in a project (any MDX entry, or Markdown loaded with `deferRender`) marks every component that imports `astro:content`, whether or not it renders an entry. In those projects most content-reading islands are head-resolved. That is no regression, since they already render before the head today, but it limits how much streaming the feature can recover until the mark is made more precise, which is separate work.

If a streamed island's render adds head content or CSP hashes anyway, because the mark missed something, the entry is not stored, and dev shows a warning naming the island.

## Server islands inside cached islands

A server island renders as a placeholder whose inline script contains its host ID and its encrypted props. Both change on every render, so the script's CSP hash does too. That is fine for a single replay, since the stored hash matches the stored script. It breaks when one entry is replayed twice on a page (the same cached island used twice with the same props): both copies carry the same host ID, and one island's response replaces the wrong element.

This proposal changes the server island placeholder so that its executable script is the same on every render. The host ID and encrypted payload move into a non-executing element next to it, which the constant script reads. Then:

- replay gives each replayed placeholder a fresh host ID without touching hashed script content;
- the placeholder's CSP hash is one value per build instead of one per render, which also shrinks the policy on pages with many server islands.

This applies to all server islands, cached or not. It changes their markup, not their API.

## Generated IDs

Server island host IDs are not the only values numbered per response. Each framework renderer (React, Preact, Solid, Svelte, Vue) keeps a per-response counter that prefixes the IDs its components generate, such as React's `useId`, and `transition:name` / `transition:persist` scopes are numbered per response too. A recorded fragment carries the numbers of the response that recorded it, and those can collide with the numbers of the page it is replayed into: two elements with the same `id`, or two elements with the same view transition name, which makes the browser skip the transition.

Inside a cached subtree these counters are seeded from the entry's key instead of from the response. The IDs in an entry are then the same on every replay and cannot collide with the page's own or with another entry's.

The same entry replayed twice on one page still repeats its IDs, since both copies are the same recording. Unlike the server island case this cannot be fixed on replay, because the IDs are inside recorded HTML and framework output. It is a documented limitation, with a dev warning when an entry containing generated IDs is replayed more than once in a response.

## Lifecycle

Each cached island derives its key (below), fetches the entry and checks it against the current build and the tag epochs (below), then:

- **fresh hit**: replays the entry, rendering slot holes live
- **stale within `swr`**: replays, then revalidates in the background through the adapter's `waitUntil`. The revalidation renders in isolation from the finished response, with its own render state.
- **miss or expired**: renders, records and stores. Storage failures log an `IslandCacheSaveError` and never fail the request; the island has already rendered.

An entry is stored only when the subtree renders to completion. If the render throws, nothing is stored and the error propagates as it would without the directive. If the client disconnects mid-stream, the render is abandoned and nothing is stored.

Concurrent misses for the same key within one server instance share one render: the first request records, and the others wait for the recording and replay it.

On a hit, the island costs one store read and a memoized epoch check instead of rendering the subtree. On a miss, the lookup is added in front of a normal render. Once one expression in a template is waiting on something async, Astro renders the remaining siblings into buffers in parallel, so a streamed island's lookup runs concurrently with the rest of the template rather than blocking it.

## Keys

```
sha256(
  buildId
  ∥ componentPath ∥ componentExport
  ∥ currentLocale
  ∥ stableStringify(userProps)
  ∥ sorted(slotNames)
  ∥ options.key ?? ''
)
```

- `componentPath` and `componentExport` identify the component the same way server islands do.
- `userProps` excludes the directive's own internal props.
- Props must be JSON-serializable, the same constraint server-island props have, with deterministic key ordering. A non-serializable prop is a dev-time `CachedIslandPropsError` naming the prop.
- `Astro.currentLocale` is included automatically. To opt out, supply an explicit `key` and avoid locale-dependent props.
- `slotNames` is the set of slot names passed at the call site. Slot content is never part of the key, but slot presence is: `Astro.slots.has()` and fallback content depend on it, so a call with a `corner` slot and a call without one are different entries.
- `options.key` extends the derived key rather than replacing it, so user keys cannot collide across components, exports, locales or deploys.
- `buildId` is a new random identifier generated at build time and added to the SSR manifest. Nothing suitable exists today; the nearest per-build value is the encryption key, which is secret and shouldn't be reused for this. Each deploy therefore starts with an empty namespace, which addresses problem 2 (stale asset URLs, undecryptable nested-island props). Keeping a cache across deploys could be a future opt-in.

## Storage

Route caching and island caching store different things. A `CacheProvider` can be header-only (it sets `CDN-Cache-Control` and `Cache-Tag` and the CDN does the storing) or intercept whole responses via `onRequest`. Neither can hold an island: fragments are never standalone HTTP responses, and a header-only provider has nowhere to put them. Islands get their own storage and share everything above it.

- **The store interface is three methods on opaque bytes:**

  ```ts
  interface IslandStore {
    get(key: string): Promise<Uint8Array | undefined>;
    /** `ttl` is the retention time in seconds. The store may drop the value after it. */
    set(key: string, value: Uint8Array, options: { ttl: number }): Promise<void>;
    delete(key: string): Promise<void>;
    /** Optional batched read. Without it Astro issues parallel `get()` calls. */
    getMany?(keys: string[]): Promise<Array<Uint8Array | undefined>>;
  }
  ```

  Entries and tag epochs both use it. Nothing enumerates keys, and nothing depends on a store honoring `ttl` exactly: a value kept too long fails validation, and one dropped early is a miss. `delete()` removes an entry that failed validation when the render that would have replaced it was not stored.
- **Shipped bindings**, with the same factory and entrypoint ergonomics as sessions:
  - `cacheStores.web(name)` for native `caches` (Cloudflare Workers, Netlify Functions and Edge Functions). The Cache API works on Request/Response pairs, so this binding wraps each value in a `Response` under a synthetic URL derived from the key, and sets `Cache-Control: max-age=<ttl>` because these platforms expire entries by their stored freshness. It uses only `match` / `put` / `delete`; Netlify does not implement `keys()`.
  - `cacheStores.unstorage(driver)` over any unstorage driver descriptor (`sessionDrivers.*`), so Redis, KV, fs and the rest are usable. This is a direct mapping onto the driver's raw get, set-with-TTL and remove.
  - `cacheStores.memory({ max })`, an in-process LRU with expiry, sharing its implementation with the `memoryCache()` route provider. This is the Node default.
- **Native stores are regional.** Cloudflare's Cache API is per-colo; Netlify's is per-region. Entries diverging between regions means a cold start per region, which is acceptable for a cache, in exchange for local reads with no per-read cost. Correctness doesn't depend on this, because validity is decided by tag epochs rather than by whether an entry is present.
- **Epochs must be readable globally**, so when the entry store is regional they live in a separate `tagStore` (any unstorage KV). When the entry store is global (the Redis adapter, say) `tagStore` defaults to the same backend. Adapters default both: on Cloudflare, Cache API entries with KV epochs; on Netlify, their Cache API with Blobs epochs (Netlify's automatic invalidation on redeploy also matches `buildId` scoping); on Node, the memory store, or the unstorage adapter over fs when entries should survive a restart. The hot path stays local; the only cross-region read is the batched, memoized epoch check.
- **Vercel has no adapter defaults in v1.** It has no Cache API; its Runtime Cache is a regional key-value store, and the platform has no built-in global store for epochs. Cached islands work there through `cacheStores.unstorage()` over a global store such as Redis, which then holds both entries and epochs. A native binding is an open question (see Unresolved Questions).
- **Platform limits apply.** Netlify's Cache API caps entries at 10 MB, requires a `max-age` of at least one second, and allows 100 lookups and 20 writes per invocation, so on a cold page with more than 20 cached islands some entries are stored on later requests. Write failures are non-fatal, so this degrades to extra misses.
- Adapters declare support and defaults through a new `islandCache?: AdapterSupport` entry in their supported features. The resolved store config is serialized into the SSR manifest beside the route-cache config, and stores are resolved per request the same way the route-cache provider is.
- Providers and stores do not share an interface. The response layer and the fragment layer are different things, and the typical deployment splits them: on Cloudflare, a header-mode CDN provider for routes, the Cache API for island entries and KV for epochs. The CDN is the route storage and cannot hold fragments. Using one backend for both (Redis, say) needs no special support: point the interception provider and the island store at the same instance. The only thing shared between the two layers is `invalidate()`.
- In development nothing is kept between requests, as with route caching, so cached islands render fresh every time. Unlike route caching, the replay path still runs: each cached island is recorded and its output is produced by replaying that recording within the same request. Frozen slots, script deduplication and head handling only go wrong on a hit, and a dev server that never replays would hide all of them until production. The guard and the toolbar run as well. Real storage can be enabled locally with the memory store or the unstorage adapter over the `fs-lite` driver at `.astro/island-cache`.

## Invalidation: shared API, tag epochs underneath

`Astro.cache.invalidate()` is the only invalidation API; there is no separate island purge. The shared implementation fans out to the route-cache provider's `invalidate()` and to the island store. Today `invalidate()` throws `CacheNotEnabled` when no route-cache provider is configured; with islands, it succeeds if either layer is configured. `{ path }` stays route-only, since islands aren't keyed by URL.

The built-in `memoryCache()` provider invalidates tags by iterating its entries and deleting matches. That is fine in memory and doesn't scale on KV-class storage, where enumeration is the expensive operation. The island store uses **tag epochs** instead:

- `invalidate({ tags: ['product:123'] })` writes one value: `tag:product:123 = now()`. That is one write regardless of how many entries carry the tag.
- On read, an entry is valid iff `entry.createdAt - skewMargin > max(epoch of each of entry.tags)`. `createdAt` is the time the render started, not the time it was stored: an entry rendered from data read before an invalidation must fail this check even if it was stored after it.
- `createdAt` and epochs come from different instances' clocks. Without a margin, an instance whose clock runs ahead could stamp an entry rendered from pre-purge data with a time later than the epoch, and that entry would pass the check for its whole lifetime. `skewMargin` is a fixed few seconds, which closes this for any realistic skew. The cost is that entries rendered within the margin after a purge are rejected too, so the affected islands render uncached for those few seconds.
- Epochs are fetched in one batched read from the tag store and memoized per server instance for about a second, so hot paths on long-lived servers make very few cross-region reads. An instance that calls `invalidate()` updates its own memo immediately. On platforms with many short-lived instances, such as Workers isolates, the memo rarely hits, and a hit costs one entry read plus one batched tag-store read per island.
- Entries are never enumerated. Superseded ones expire through the `ttl` they were stored with or are overwritten on the next miss.
- Epochs expire too. An epoch only matters while an entry created before it could still be served, so each epoch is written with a TTL equal to the longest allowed entry lifetime. That needs a ceiling on `maxAge + swr`: `cache.islands.maxLifetime`, in seconds, defaulting to seven days, which also caps the retention of every entry. Without it the tag store would grow with every tag ever invalidated. An entry whose `maxAge + swr` exceeds the ceiling is clamped to it, reducing `swr` first, with a dev warning.
- Purge consistency is the tag store's read consistency: immediate on Redis, eventual on KV-class stores. This should be documented. It is no worse than any hand-rolled scheme on the same storage.
- Epochs are the contract for every store. Native tag purge (a platform deleting Cache API entries by tag itself) is not part of v1; see Unresolved Questions.

`InvalidateOptions` is unchanged: `{ path?, tags? }`. There is no purge-everything call, because route caching has none and adding one would change the `CacheProvider` contract (see Unresolved Questions). A deploy already empties the island cache. There is no key-based purge either: derived keys are not something users can name, and purging by a user-supplied `key` would need an index from keys to entries. Tags cover the same need. Invalidation is callable wherever `Astro.cache` / `context.cache` is available: routes, endpoints, actions and middleware.

## Nesting and automatic tags

The island-scoped `Astro.cache` is the tag collector. During a cached-island render it accumulates:

- tags passed to `set()` by anything in the subtree
- `cacheHint`s from live collection entries passed to `set(entry)`, the same `{ tags?, lastModified? }` shape route caching accepts
- the final tags of any nested cached islands, which are `set()` into the enclosing scope when they complete

So a live product entry `set()` inside a cached island ties that island's entry to the loader's tags, and `invalidate({ tags: ['product:123'] })` invalidates every enclosing cached island and any tagged route-cache entries in one call. Because validation is by epoch rather than by enumerating dependents, nesting depth doesn't change the cost. This is the Rails russian-doll model without the `touch: true` dependency graph.

The outermost island passes its final tags up to the response in the same way: they are `set()` into the route-level `Astro.cache`, from the stored entry on a hit and from the collector on a miss. Without this, wrapping a component in `server:cache` would silently remove its tags from the route, and a route-cached page would survive a purge that cleared the island inside it. Only tags go up. `maxAge` and `swr` are per layer, and a fragment's `lastModified` says nothing reliable about the response.

Route-cache headers are applied when the response is created, before the body streams, so tags found while the body renders would arrive too late. When the request has a route cache policy at that point (a matching route rule, or `Astro.cache.set()` in the page frontmatter), every cached island on the page is resolved before the response is returned, as head-resolved islands already are. This gives up streaming only for responses that are about to be stored and shared. Requests with no route policy have nothing to tag and stream as described above.

Client islands inside a cached fragment need no special handling: they are stored `<astro-island>` markup plus a recorded hydration instruction, and their IDs are derived from their content. Server islands inside a cached fragment are covered above; their encrypted payload is valid for the lifetime of the build that produced it, which is the same lifetime as the cache namespace.

## Request-state guard

The main remaining way to get fragment caching wrong is a fragment that reads request state. The compiler can catch most of this at build time.

The guard is an allowlist. Inside a cached subtree, a component may use `Astro.props`, `Astro.slots`, `Astro.self`, `Astro.currentLocale` (part of the key), `Astro.site`, `Astro.generator`, `Astro.isPrerendered`, `Astro.logger` and the island-scoped `Astro.cache`. Everything else on `Astro` is either request state that is not in the key (`request`, `url`, `params`, `cookies`, `session`, `locals`, `clientAddress`, `preferredLocale`, `preferredLocaleList`, `originPathname`, `routePattern`, `getActionResult`) or a side effect on the response that would not happen on a hit (`response`, `redirect`, `rewrite`, `callAction`, `csp`). `Astro.params` is the easiest to miss: an island inside `/c/[slug]` that reads it would serve the first slug's content for every slug.

**Compile time.** The compiler reports, per component, every access to an `Astro` member outside the allowlist, including through destructuring. The build walks the import graph below every cached island and reports each one, naming the component, the property and the fix: pass it as a prop (it becomes part of the key) or move it into a slot (it is rendered per request).

An access in the cached component's own file is a build error, since that component always renders inside the island. An access in a component it imports, directly or transitively, is a build warning. The import graph is wider than the rendered tree: an imported component may never render inside the island, or may read request state only on a branch the island never takes, and failing the build for those would block legitimate code with no way to proceed.

**Runtime guard.** This is the precise check. It also covers what static analysis can't see: `Astro[key]`, `Astro` passed as an argument, request state re-exported through a helper. Inside a cached subtree, the `Astro` object each component receives enforces the same allowlist. A disallowed access in dev is a `CachedIslandRequestAccess` error. In production it never crashes the request, but the render is not stored: the island renders on every request, with a once-per-boot warning, until the access is fixed. An entry that read request state is never served to another visitor.

With this, caching one user's account details into everyone's page is a build error in the common case, a dev overlay in the rest, and in production an island that is not cached rather than one that leaks.

## Relationship to route caching

| | Route caching (`cache` + `routeRules`) | Cached islands (this proposal) |
| --- | --- | --- |
| Unit | HTTP response | Component subtree |
| Keyed by | URL (+ provider query config) | Component identity + props + locale + deploy |
| Declarative policy | `routeRules` patterns | `server:cache` options |
| Imperative policy | `Astro.cache.set()` | The same call, island-scoped |
| Storage | Provider: CDN headers or response interception | Key-value island store + global tag store |
| Delivery | HTTP semantics: `ETag`, `Last-Modified`, `CDN-Cache-Control` | In-stream replay |
| Invalidation | `invalidate({ path, tags })` | The same call, shared tags |
| Dev | Noop | Nothing stored; record and replay, guard and toolbar still active |

Composition: the route cache sits above. If a response is served from the route cache, or from a CDN honoring its headers, nothing renders and islands never execute. That is correct, since the whole response was declared shareable. Cached islands apply when the response is not shareable: on every render of a dynamic shell. `etag` and `lastModified` are not island options because fragments have no conditional-request semantics; the freshness and tagging options carry over and the HTTP-specific ones don't.

## Observability

- A dev toolbar app alongside Audit and Inspect: outlines cached islands on the page, shows each island's mode (streamed or head-resolved) and, since nothing is stored in dev, what would be stored: the derived key, accumulated tags and freshness windows.
- Dev-only HTML comments: `<!--astro:cache island age=42s tags=category:boots-->`.
- An opt-in debug response header summarizing per-island cache status, for staging.

## Implementation outline

- **Compiler.** Lower `server:cache` the way `server:defer` is lowered: resolve the component's identity from the import map, pass the options as an internal prop and remove the directive from user props. Report cached components and each component's `Astro` member accesses as build metadata. Unlike `server:defer`, `server:cache` does not mark the containing component for head propagation, or every page with a cached island would become head-resolved. These are the compiler's first codegen-level diagnostics.
- **Runtime.** A cached-island render path beside the server-island one, chosen by the directive; recording and replay; the island-scoped `Astro.cache` and tag propagation to the route scope; the allowlisted `Astro` object; key-seeded ID counters, which also touches each framework renderer.
- **Server islands.** The constant placeholder script.
- **Build.** `buildId` in the manifest; the request-state guard; store config serialization. Unlike server islands, cached islands need no manifest map of island modules: a cached island only renders within the request that reached it, background revalidation included, so its module is already loaded.
- **Adapters.** `islandCache` support and store defaults for Cloudflare, Netlify and Node. Vercel declares support without defaults.

# Testing Strategy

- **Unit**: key derivation stability (including slot-name variance), epoch validation with the skew margin, record/replay round-trips covering every render instruction type, and scoped `cache.set()` merge semantics against route-level `set()`.
- **Integration** fixtures modeled on the server-islands suites: the full nesting matrix (client-in-cached, server-in-cached, cached-in-cached, slots at each level), slots that cannot be holes (`Astro.slots.render()`, slots forwarded to framework components), both head modes with hits and misses, the same entry replayed twice on one page, generated-ID stability between a recorded render and its replays, i18n key variance, CSP hash parity between a rendered response and a replayed one, deploy scoping across two consecutive builds, storage-failure and mid-render-failure fallback, a production request-state access that is rendered but not stored, and route-cache composition (island tags reaching the route's `Cache-Tag` on hits and misses, one `invalidate()` clearing both).
- **Dev server e2e**: toolbar app, record-and-replay with nothing stored, opt-in `fs-lite` store, guard errors and warnings.
- A **store conformance suite** run against every shipped binding and available to custom store entrypoints: `get` / `set` / `delete` round-trips, epoch validation, batched epoch reads and retention behavior per store.

# Drawbacks

- Complexity in the hottest path in the codebase. When the directive is absent the cost is one property check, the same check server islands already add, and the feature is behind a flag.
- A second cache grain for users to reason about. It uses the same vocabulary and API as the route grain, deploy scoping removes the worst class of debugging, and the toolbar and markers make state visible.
- Two head modes. Which one an island gets depends on what its subtree imports, which users don't see without the toolbar.
- Every deploy starts with an empty island cache, because `buildId` is part of the key. On the large, frequently deployed sites this targets, each deploy is followed by a wave of misses, and so a wave of renders and writes, across every region.
- Storage cost and entry size. Entries are typically small; a size warning and per-entry compression (see Unresolved) bound the rest.
- The compile-time guard only warns about imported components, and in production the runtime guard stops an island being cached rather than failing the request, so a guarded island can go unnoticed as a performance problem.
- An entry used twice on one page repeats its generated IDs.
- Route-cached pages resolve their cached islands before the response is returned, so they don't stream.
- Tag purge on eventually consistent stores is eventually consistent. This should be documented rather than hidden.

# Alternatives

- **Userland: recipes, an integration, or a `<Cacheable>` component.** None can reach render instructions, head propagation or CSP state; none can make deploy scoping automatic; none can check for request access. The largest users have effectively tried this, and each ended up with a partial, buggy version.
- **Caching the server island endpoint.** Ergonomics aside, the fragment still arrives by a deferred client fetch, so cached content paints after the dynamic shell around it, and it doesn't compose with per-request slots or nesting. The hybrid `server:cache="defer"` mode in Unresolved Questions is this idea with the order corrected: deferred on cold, inline on warm.
- **Extending route caching downward**, e.g. teaching providers to cache responses with per-user holes. This is ESI on the response layer: it fights HTTP semantics, ties hole-punching to provider capabilities and can't express nesting. Fragments belong in the component tree; responses belong in the response cache.
- **ESI / edge includes.** Platform-specific, no dev parity, and doesn't compose with islands or slots.
- **Data-layer caching only** (a `cachedFn`). Caches the fetch, not the render, and carries none of the island metadata. Worth doing later on the same storage layer; not a substitute.
- **A single head mode.** Resolving every cached island before `<head>` would put every lookup, and every miss, on the path to first byte. Streaming every cached island would leave out islands that render content entries, styled SVGs or server islands.
- **The web Cache API as the store interface.** An earlier draft used `match` / `put` / `delete` on Request/Response pairs as the contract. Only Cloudflare and Netlify ship it natively, so every other store, Node's included, would have had to emulate HTTP semantics to hold bytes under a key: synthetic request URLs, metadata in headers, `Cache-Control` as a retention hint. undici's `caches` is an unbounded in-process `Map` that would have needed expiry and a size cap added on top. With a key-value contract the Cache API is one binding and that translation lives in one place.
- **Naming.** A separate `cache:` directive namespace, or `static:island`. Staying in `server:` keeps one compiler path and one namespace for things the server decides, and reads like `server:defer`.

# Adoption strategy

Ships behind `experimental.cachedIslands`, which gates the `cache.islands` config key and the directive. Route caching is already stable; the flag only adds to its config block and API. The server island placeholder change is not gated, since it changes no behavior.

The migration guide targets the hand-rolled pattern: the KV get/set wrapper and `set:html` become the directive; hand-built keys become `key`; TTLs become `maxAge`; the tag index, webhook plumbing and deploy-flush scripts are deleted. Sites already using `routeRules` get the fragment level with no new invalidation code.

For docs, the islands page can present the options as a freshness continuum: prerendering caches forever at deploy scope; route caching is bounded freshness for a response that can be shared as a unit; a cached island is bounded freshness for a fragment of one that can't; a server island is uncached with deferred delivery; a client island hands freshness to the client. `routeRules` is the root case, and this proposal uses the same options (`maxAge`, `swr`, `tags`, one `invalidate()`) further down the tree.

# Unresolved Questions

1. **`waitUntil` reach.** Adapters pass a `waitUntil` hook into the render, and route-cache providers receive it, optionally, in `onRequest`. Island revalidation needs it at render time on every adapter. Is threading it to the island layer enough, and what is the Node fallback where no platform hook exists: fire-and-forget, or synchronous revalidation on the next stale hit?
2. **Stampede control** beyond per-instance in-flight dedup and TTL jitter. Is an optional `lock()` on the store interface enough, or does the portable layer need best-effort locking?
3. **`stale-if-error`**: should a failed revalidation serve the stale entry beyond `swr`? Probably yes, with a bound.
4. **Compression** for large entries: always, never, or above a size threshold per store?
5. **A hybrid `server:cache="defer"` mode**: on a miss, emit a server-island placeholder and let the `/_server-islands/` endpoint render, respond and populate the store, so cold paths behave like server islands and warm paths are inline HTML. Useful, but it couples the two systems, so it is left out of v1.
6. **Cross-deploy pinning**: an `ASTRO_KEY`-style opt-in for very large caches that want to survive deploys, with the user taking responsibility for asset-hash stability.
7. **Options parity.** Scoped `set()` receiving `etag` is meaningless for a fragment: ignore silently or dev-warn? And is duration-string sugar (`'10m'`) worth adding to `routeRules` and island options together, or do plain seconds remain the shared contract?
8. **Native tag purge for island stores.** If a future store can delete by tag natively, is an optional `purgeTags()` on `IslandStore` worth adding then, with tags passed to `set()` and epoch validation bypassed when it is present, or do epochs remain the permanent portable contract? Either way this belongs on the store side, not on `CacheProvider`: response providers and fragment stores are different things even when one backend could do both.
9. **Vercel Runtime Cache binding.** The Runtime Cache is regional, but its `expireTag` reaches every region within about 300 ms. That is enough to rebuild epochs without a global store: each region keeps one marker entry per tag, tagged with that tag and stamped with its creation time, and the marker's timestamp is the tag's epoch. `invalidate()` calls `expireTag`, which removes the markers everywhere; the next read in a region recreates the marker at the current time, so every entry whose render started before then fails validation. Entries rendered between the purge and the new marker are rejected too, which costs a miss but is never stale. Entries themselves need no native tags, so the 128-tag limit only applies to markers. Is this worth a `cacheStores.vercel()` binding with adapter defaults, and could the same approach replace KV epochs on other platforms with global tag purge?
10. **Purge everything.** Should `InvalidateOptions` gain `{ all: true }`? On the island side it is one deploy-scope epoch. On the route side every `CacheProvider` would have to implement it, which is a change to route caching and so outside this proposal as written.
