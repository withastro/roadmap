**If you have feedback and the feature is released as experimental, please leave it on the Stage 3 PR. Otherwise, comment on the Stage 2 issue (links below).**

- Start Date: 2026-07-28
- Reference Issues: withastro/roadmap – Server Islands, Live content loaders, Route caching (`cache` + `routeRules`), 0060 Rust compiler
- Implementation PR: <!-- leave empty -->
- Stage 2 Issue: <!-- fill in -->
- Stage 3 PR: <!-- leave empty -->

# Summary

A new island primitive: **cached islands**, using a `server:cache` directive. A cached island is rendered on demand once, stored as a stream of render chunks and instructions rather than an HTML string, and replayed into later responses until it expires or is invalidated. The page around it is still rendered on demand; the expensive shared subtrees inside it are not.

This is the inverse of server islands. Server islands are dynamic holes in a static shell. Cached islands are stored fragments in a dynamic shell, and their slots are rendered per request, so the two patterns nest.

Entries use the same `maxAge`, `swr` and `tags` options as the experimental route caching feature, and invalidation goes through the existing `Astro.cache.invalidate()`, so one tag purge clears cached routes and cached islands together. Storage uses the web Cache API, with defaults supplied by adapters.

Route caching (`cache` + `routeRules`, implemented in `core/cache/`) caches whole responses keyed by URL. Cached islands apply the same model below the response boundary, on pages whose shells are personalized and so cannot be route-cached. The two layers share tags, invalidation, `CacheHint` flow and the `WaitUntilHook`, and can be used in the same request.

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

`server:cache` with no options uses the configured defaults and an automatic key derived from the component identity, props and locale. Option names and units match `CacheOptions`: seconds, not duration strings.

Configuration goes inside the existing `cache` block, next to the route-level provider:

```js
// astro.config.mjs
import { defineConfig, memoryCache, cacheStores } from 'astro/config';

export default defineConfig({
  cache: {
    provider: memoryCache(),           // route caching, unchanged
    islands: {
      // Native CacheStorage where the platform has it; adapters default this
      store: cacheStores.web('astro:islands'),
      // Global store for tag invalidation state; adapters default this too
      tagStore: cacheStores.unstorage(kvDriver),
      defaults: { maxAge: 300, swr: 3600 },
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

The experimental route caching feature ([documentation](https://docs.astro.build/en/guides/caching/)) addresses this at the response level. Providers either set CDN headers (`defaultSetHeaders()` emits `CDN-Cache-Control`, `Cache-Tag`, `Last-Modified` and `ETag`) or intercept requests in the pipeline via `onRequest`, as the built-in `memoryCache()` provider does; `routeRules` sets policy in config and `Astro.cache.set()` adjusts it per request. This works for responses that can be shared as a unit. It does not work for the pages this proposal targets, because a response cache is keyed by URL: a page whose shell varies per user cannot be response-cached, or only as per-user variants, which defeats the purpose. Those are the pages whose expensive subtrees are shared.

Caching server islands doesn't help either. Nothing stops you setting `Cache-Control` on `/_server-islands/` responses today, but the island is still a deferred client fetch, so the cached fragment arrives after the dynamic shell rather than with it.

Teams running large Astro sites work around this by caching rendered fragments themselves: render a component, store the HTML in KV or Redis under a hand-built key, replay it with `set:html`, invalidate by TTL or webhook. This breaks in several ways, because a rendered Astro fragment is not representable as a string:

1. **Render instructions are lost.** The runtime interleaves HTML with `RenderInstruction`s (`directive`, `renderer-hydration-script`, `server-island-runtime`, `script`; see `packages/astro/src/runtime/server/render/instruction.ts`). These drive per-response deduplication in `result._metadata`: hydration bootstrap scripts are emitted once per page, renderer scripts once per framework. Replay a cached string and, depending on what else is on the page, those scripts are either emitted twice or not at all. The dedup state is internal to the response being rendered, so this cannot be fixed in userland.
2. **Deploys invalidate entries without anyone noticing.** Cached HTML contains hashed asset URLs inside `<astro-island>` markup, and any nested server island contains props encrypted with the per-build key from `core/encryption.ts` (rotated every build unless `ASTRO_KEY` is set). An entry that outlives its deploy serves scripts that 404 and islands that cannot be decrypted.
3. **Slots are frozen.** String caching cannot keep child content per-request, so anything with a personalized child either cannot be cached or caches the first visitor's data for everyone.
4. **CSP breaks.** With `security.csp` enabled, script and style hashes are collected per response (`result._metadata.extraScriptHashes` and friends; `ServerIslandComponent.init()` registers its digests this way). A replayed string contributes nothing, so its inline scripts violate the policy Astro generated for the page.
5. **Everyone writes the same invalidation code** (tag indexes, webhook endpoints, TTL jitter), with no dev-mode story and nothing to stop a fragment reading request state.

Prior art: Rails has had fragment caching with nested ("russian doll") invalidation since Rails 4. ESI does fragment caching at the edge but has no development story. Nitro's `cachedEventHandler` and Next's `"use cache"` cache at the function and route-segment level, which is where Astro's route caching sits. None of these are component-tree-native or island-aware. Partial Prerendering is a static shell with dynamic holes, which Astro already has as server islands; this proposal is the inverse, and the two can be used together.

# Goals

- **Semantics-preserving.** `server:cache` changes cost, not behavior. Markup, streaming order, hydration, CSP hashes and head handling are identical apart from staleness. On a hit the island is faster than plain SSR because its chunks are already available.
- **Shared API with route caching.** The same `CacheOptions` (`maxAge`, `swr`, `tags`), the same `Astro.cache` / `context.cache` object with the same merge semantics, and the same `invalidate()` call. One tag namespace; one purge clears routes and islands.
- Pluggable storage behind the web Cache API (`match` / `put` / `delete` on Request/Response pairs), with native `caches` bindings where platforms have them, undici on Node and an unstorage adapter elsewhere, configured the way session drivers are (`core/session/drivers.ts`).
- Bounded freshness (`maxAge` + `swr`), tag purge, key purge and automatic invalidation on deploy.
- All existing island types work inside a cached island. Cached islands nest, and inner tags propagate to outer entries.
- Slots are rendered per request, using the slot machinery server islands already have.
- Live collection `cacheHint`s flow into island entries through the same `cache.set(entry)` call route caching accepts.
- Development matches route caching: no storage by default (`provideCache()` already substitutes a noop implementation in dev), plus build-time guards, a dev toolbar app and an opt-in filesystem store for testing storage locally.

# Non-Goals

- **Changing route caching.** This adds the fragment level beneath it and defines how the two compose. No route-level behavior changes.
- **Build-time seeding.** A `getStaticIslandPaths`-style API for pre-warming known prop combinations could follow later.
- **Cross-instance stampede locks.** Core cannot guarantee them portably; an optional hook on the store interface is proposed instead (see Unresolved Questions).
- **Data/function caching** (a `cachedFn`). Could share the storage layer; separate proposal.
- **Caching inside prerendered pages.** No-op with a dev warning; the page is already cached at deploy scope.
- **Request-derived variance.** Everything an island depends on arrives through props (keyed) or slots (per-request). This is a deliberate constraint rather than a limitation to remove later.

# Detailed Design

## Directive and compiler

Cached islands are implemented only in the experimental Rust compiler (`@astrojs/compiler-rs`, enabled by `experimental.rustCompiler`). `compiler-rs` matches the Go compiler's output where behavior overlaps (its source says so: `// Matches Go compiler: "server:component-directive": "defer"`), and a new directive is a divergence that should only exist in one compiler. `experimental.cachedIslands` therefore requires `experimental.rustCompiler`.

The lowering generalizes what `server:defer` does in `crates/astro_codegen/src/printer/components.rs`:

- **Detection.** `has_server_defer()` is a literal string match, whereas `client:*` is prefix-matched in `extract_hydration_info()`. It becomes a `server:` prefix match that captures the directive name and value and rejects unknown names through the existing `diagnostics` channel.
- **Resolution is shared.** `ServerDeferInfo` resolves `component_path` and `component_export` from the import map via `resolve_specifier()`, matching the Go compiler's `ResolveIdForMatch` so the pair is the key into `serverIslandNameMap`. That pair is also the `componentPath ∥ componentExport` part of the cache key below.
- **Injection.** The hard-coded `"server:component-directive":"defer"` becomes the actual directive name, plus `"server:cache-options":(<expr>)` through the existing component-attribute value printer, which already handles expression values.
- **Skip.** The attribute loop that removes `server:defer` from user props removes `server:cache` the same way, after emitting its value as the options prop.
- **Metadata.** `TransformResult` (`printer/result.rs`) already carries `server_components` (which core uses to build `serverIslandMap`) alongside `contains_head` and `propagation`. A `cached_components` field feeds `cachedIslandMap`, and the propagation conditions in `printer/mod.rs` that currently fire for transition directives and `server:defer` also fire for `server:cache`, so the containing component gets head-propagation treatment (see Runtime flow).

Accepted options:

```ts
type CachedIslandOptions = boolean | {
  key?: string;      // extends the derived key; never replaces it
  maxAge?: number;   // seconds – same as CacheOptions / RouteRule
  swr?: number;      // stale-while-revalidate window after maxAge, in seconds
  tags?: string[];
};
```

Runtime dispatch happens where server islands dispatch today: `renderAstroComponent()` in `runtime/server/render/component.ts` checks for the server directive, constructs a `ServerIslandComponent` and adds it to `result._metadata.propagators`. That check branches on the directive value: `'defer'` → `ServerIslandComponent`, `'cache'` → `CachedIslandComponent`.

As with server islands, usage is collected at build time into the SSR manifest (a `cachedIslandMap` beside `serverIslandMap` / `serverIslandNameMap` in `core/app/types.ts`) so the runtime can import an island module for background revalidation without rendering its page.

## Scoped `Astro.cache`

Route caching has a declarative surface (`routeRules`) and an imperative one (`Astro.cache.set()`). Cached islands have both. The directive options are the declarative path. For the imperative path, inside a `server:cache` subtree `Astro.cache` (and `context.cache` in anything the subtree calls) resolves to an island-scoped `CacheLike` rather than the request-scoped `AstroCache`:

- `set({ maxAge, swr, tags })` configures the island entry with the merge semantics `AstroCache.set()` has today: scalars last-write-wins, `lastModified` newest-wins, tags accumulate
- `set(liveDataEntry)` applies a live collection entry's `cacheHint`, as at route level
- `set(false)` opts this render out: the island renders fresh and nothing is stored
- `invalidate()` passes through to the shared implementation

A component that calls `cache.set()` doesn't need to know whether it is the whole response or one island of it. Scoping is also what makes nested tag propagation work (see below).

## The cache entry: chunks, not strings

On a miss, the island subtree renders through the existing `RenderDestination` interface (`runtime/server/render/common.ts`) wrapped in a recording tee: every chunk goes to the live response unchanged and is also appended to the entry. There is no second render and no added latency on a miss.

```ts
interface CachedIslandEntry {
  v: 1;
  buildId: string;
  createdAt: number;
  maxAge: number;
  swr: number;
  tags: string[];
  chunks: Array<
    | { t: 'html'; h: string }              // via chunkToString(result, chunk)
    | { t: 'slot'; name: string }           // per-request hole
    | { t: 'instr'; i: SerializedInstruction } // directive, renderer-hydration-script, …
  >;
  csp: { scriptHashes: string[]; styleHashes: string[] };
}
```

On a Cache API store the entry is a synthetic `Response` for a synthetic request URL derived from the key: the chunk list is the body, and `buildId`, `createdAt`, tags and the freshness windows are `x-astro-*` headers. The stored `Cache-Control` is `max-age=<maxAge + swr>`, not `maxAge`, because some platforms (Cloudflare's included) apply stored freshness themselves and would drop the entry before its stale window ended. Freshness is always computed by Astro from the metadata headers.

Instructions are stored symbolically and recreated with `createRenderInstruction()` on replay, so a replayed island takes part in per-response dedup and CSP collection the same way a freshly rendered one does: hydration bootstrap emitted only if no earlier island emitted it, renderer scripts once per framework, script and style hashes registered in `init()` the way `ServerIslandComponent.init()` registers the island-replacer digests. This is the part userland cannot do, and it addresses problems 1 and 4 from the motivation.

Slots are stored as holes. When the subtree render invokes a slot, the recorder emits a `slot` chunk instead of capturing the output. On replay, that chunk calls the live `ComponentSlots` the `CachedIslandComponent` was constructed with, the same slot representation `ServerIslandComponent` receives. Server islands do the opposite (the shell renders slots to strings with `renderSlotToString()` and the endpoint reconstructs them with `createSlotValueFromString()`); here the fragment is stored and the slots are live. This addresses problem 3.

## Runtime flow

`CachedIslandComponent implements RenderInstance`, mirroring `ServerIslandComponent`:

1. **`init()`** returns a `ThinHead` (`runtime/server/render/astro/head-and-content.ts`) and, on a hit, registers the entry's stored CSP hashes.
2. **`render(destination)`**:
   - derive the key (below)
   - fetch the entry; check build scope and tag epochs (below)
   - **fresh hit**: replay chunks, rendering `slot` holes live
   - **stale within `swr`**: replay, then schedule a background revalidation through the existing `WaitUntilHook` (`core/wait-until.ts`), which route-cache providers already receive in their `onRequest` context
   - **miss or expired**: render through the recording destination and store on success. Storage failures fall back to plain rendering with a logged `IslandCacheSaveError`, non-fatal like `SessionStorageSaveError`, defined beside the route cache's `CacheNotEnabled` in `core/errors/errors-data.ts`.

On a hit the chunk list is available synchronously, so cached islands are faster than plain SSR as well as cheaper. On a miss, behavior is unchanged.

Head propagation: the cached subtree renders with the same `propagation: 'self'` treatment the server-island endpoint applies (`core/server-islands/endpoint.ts`), resolved through `core/head-propagation/resolver.ts`. In v1, a cached island whose subtree contains an in-tree head-propagating component is a build error. `result.componentMetadata` makes this statically checkable and the error can name the component. The restriction could be lifted later by storing propagated head content in the entry.

## Keys

```
sha256(
  buildId
  ∥ componentPath ∥ componentExport
  ∥ currentLocale
  ∥ stableStringify(userProps)
  ∥ options.key ?? ''
)
```

- `userProps` excludes the `server:*` internals, following the existing `internalProps` pattern.
- Props must be JSON-serializable, the same constraint server-island props have (the endpoint round-trips them through `JSON.parse`), with deterministic key ordering. A non-serializable prop is a dev-time `CachedIslandPropsError` naming the prop.
- `Astro.currentLocale` is included automatically. To opt out, supply an explicit `key` and avoid locale-dependent props.
- Slots are never part of the key.
- `options.key` extends the derived key rather than replacing it, so user keys cannot collide across components, exports, locales or deploys.
- `buildId` is a new random identifier generated at build time and added to `SSRManifest`. Nothing suitable exists in the manifest today; the nearest per-build value is the encryption key, which is secret and shouldn't be reused for this. Each deploy therefore starts with an empty namespace, which addresses problem 2 (stale asset URLs, undecryptable nested-island props). Keeping a cache across deploys could be a future opt-in.

## Storage

Route caching and island caching store different things. A `CacheProvider` can be header-only (`setHeaders()` sets `CDN-Cache-Control` and `Cache-Tag` and the CDN does the storing) or intercept whole responses via `onRequest`. Neither can hold an island: fragments are never standalone HTTP responses, and a header-only provider has nowhere to put them. Islands get their own storage and share everything above it.

- **The store interface is the web Cache API**: `match` / `put` / `delete` on Request/Response pairs via `caches.open()`. CacheStorage is not in the WinterTC Minimum Common API (ECMA-429), but it is shipped by the platforms this feature is aimed at: Cloudflare Workers, Deno (since 1.26, filesystem-backed) and Deno Deploy's Edge Cache, and Netlify's Cache API in Functions and Edge Functions. Node is covered by undici's `caches` implementation and anything else by an adapter. Tag epochs do not need `keys()` enumeration, so the subset every implementation supports is enough.
- Shipped bindings, with the same factory and entrypoint ergonomics as sessions: `cacheStores.web(name)` for native `caches`, `cacheStores.undici()` for Node, and `cacheStores.unstorage(driver)`, a Cache-interface adapter over any unstorage driver, so Redis, fs and the rest remain usable.
- **Native stores are regional.** Cloudflare's Cache API is per-colo; Deno Deploy's and Netlify's are per-region. Entries diverging between regions means a cold start per region, which is acceptable for a cache, in exchange for local reads with no per-read cost. Correctness doesn't depend on this, because validity is decided by tag epochs rather than by whether an entry is present.
- **Epochs must be readable globally**, so when the entry store is regional they live in a separate `tagStore` (any unstorage KV). When the entry store is global (the Redis adapter, say) `tagStore` defaults to the same backend. Adapters default both: on Cloudflare, Cache API entries with KV epochs; on Netlify, their Cache API with Blobs epochs (Netlify's automatic invalidation on redeploy also matches `buildId` scoping); on Node, undici's `caches` or the fs adapter. The hot path stays local; the only cross-region read is the batched, memoized epoch check.
- The resolved config goes in the manifest beside the existing `SSRManifestCache`, and stores are resolved per request through the same `FetchState` mechanism `provideCache()` uses (`core/cache/handler.ts`). Adapters declare support and defaults through a new `islandCache?: AdapterSupport` entry in `AstroAdapterFeatureMap` (`types/public/integrations.ts`).
- Providers and stores do not share an interface. The response layer and the fragment layer are different things, and the typical deployment splits them: on Cloudflare, a header-mode CDN provider for routes, the Cache API for island entries and KV for epochs. The CDN is the route storage and cannot hold fragments. Using one backend for both (Redis, say) needs no special support: point the interception provider and the island store at the same instance. The only thing shared between the two layers is `invalidate()`.
- In development the island layer behaves like route caching: `provideCache()` already substitutes `NoopAstroCache` in dev, and cached islands render fresh every time. The guard and the toolbar still run. Real storage can be enabled locally with undici's in-process `caches` or the unstorage adapter over fsLite at `.astro/island-cache`.

## Invalidation: shared API, tag epochs underneath

`Astro.cache.invalidate()` is the only invalidation API; there is no separate island purge. The shared implementation fans out to the route-cache provider's `invalidate()` and to the island store. Today's `AstroCache.invalidate()` throws `CacheNotEnabled` when no provider is configured; with islands, it succeeds if either layer is configured. `{ path }` stays route-only, since islands aren't keyed by URL, and a new `{ keys }` option covers islands.

The built-in `memoryCache()` provider invalidates tags by iterating its entries and deleting matches. That is fine in memory and doesn't scale on KV-class storage, where enumeration is the expensive operation. The island store uses **tag epochs** instead:

- `invalidate({ tags: ['product:123'] })` writes one value: `tag:product:123 = now()`. That is one write regardless of how many entries carry the tag.
- On read, an entry is valid iff `entry.createdAt > max(epoch of each of entry.tags)`. Epochs are fetched in one batched read from the tag store and memoized per server instance for about a second, so hot paths make very few cross-region reads.
- Entries are never enumerated. Superseded ones expire through the store's own retention (`Cache-Control` on Cache API stores, driver TTL on the unstorage adapter) or are overwritten on the next miss.
- Purge consistency is the tag store's read consistency: immediate on Redis, eventual on KV-class stores. This should be documented. It is no worse than any hand-rolled scheme on the same storage.
- Epochs are the contract for every store. Native tag purge (a platform deleting Cache API entries by tag itself) is not part of v1; see Unresolved Questions.

`invalidate({ keys })` and `invalidate({ all: true })` (which bumps a deploy-scope epoch) complete the island side, callable wherever `Astro.cache` / `context.cache` is available: routes, endpoints, actions and middleware.

## Nesting and automatic tags

The island-scoped `Astro.cache` is the tag collector. During a cached-island render it accumulates:

- tags passed to `set()` by anything in the subtree
- `cacheHint`s from live collection entries passed to `set(entry)`, the same `{ tags?, lastModified? }` shape route caching accepts (`content/runtime.ts`, `core/cache/types.ts`)
- the final tags of any nested cached islands, which are `set()` into the enclosing scope when they complete

So a live product entry `set()` inside a cached island ties that island's entry to the loader's tags, and `invalidate({ tags: ['product:123'] })` invalidates every enclosing cached island and any tagged route-cache entries in one call. Because validation is by epoch rather than by enumerating dependents, nesting depth doesn't change the cost. This is the Rails russian-doll model without the `touch: true` dependency graph.

The rest of the nesting matrix needs no special handling. Client islands inside a cached fragment are stored `<astro-island>` markup plus a symbolic `directive` instruction. Server islands inside a cached fragment are a placeholder script whose encrypted payload is valid for the lifetime of the build that produced it, which is the same lifetime as the cache namespace.

## Request-state guard

The main remaining way to get fragment caching wrong is a fragment that reads request state. The Rust compiler can catch most of this at build time.

**Compile time.** `astro_codegen` already runs `oxc_semantic`'s `SemanticBuilder` (currently for TypeScript stripping, `printer/typescript.rs`). A guard pass reads the same semantic model to find member access on the `Astro` binding (`Astro.request`, `Astro.cookies`, `Astro.session`, `Astro.locals`, `Astro.url`, including through destructuring, which symbol resolution covers) and reports it per component as `TransformResult` metadata, carried to the manifest like `contains_head` and `propagation`. The build then walks the import graph of every component in `cachedIslandMap`, as head propagation already does, and fails with an error naming the component, the property and the fix: pass it as a prop (it becomes part of the key) or move it into a slot (it is rendered per request).

**Runtime fallback.** Semantic analysis can't see everything: `Astro[key]`, `Astro` passed as an argument, request state re-exported through a helper. The per-component `Astro` global (constructed by `result.createAstro`) keeps a runtime guard for these: a dev-mode `CachedIslandRequestAccess` error, a once-per-boot warning in production, never a crash.

`Astro.cache` is exempt from both. With this, caching one user's account details into everyone's page is a build error in the common case and a dev overlay in the rest.

## Relationship to route caching

| | Route caching (`cache` + `routeRules`) | Cached islands (this proposal) |
| --- | --- | --- |
| Unit | HTTP response | Component subtree |
| Keyed by | URL (+ provider query config) | Component identity + props + locale + deploy |
| Declarative policy | `routeRules` patterns | `server:cache` options |
| Imperative policy | `Astro.cache.set()` | The same call, island-scoped |
| Storage | Provider: CDN headers or response interception | Web Cache API store + global tag store |
| Delivery | HTTP semantics: `ETag`, `Last-Modified`, `CDN-Cache-Control` | In-stream chunk replay |
| Invalidation | `invalidate({ path, tags })` | The same call, shared tags, plus `{ keys }` |
| Dev | Noop | Noop; guard and toolbar still active |

Composition: the route cache sits above. If a response is served from the route cache, or from a CDN honoring its headers, nothing renders and islands never execute. That is correct, since the whole response was declared shareable. Cached islands apply when the response is not shareable: on every render of a dynamic shell. `etag` and `lastModified` are not island options because fragments have no conditional-request semantics; the freshness and tagging options carry over and the HTTP-specific ones don't.

## Observability

- A dev toolbar app alongside `audit` and `xray` (`runtime/client/dev-toolbar/apps/`): outlines cached islands on the page and, since storage is a noop in dev, shows what would be stored: the derived key, accumulated tags and freshness windows per island.
- Dev-only HTML comments: `<!--astro:cache island age=42s tags=category:boots-->`.
- An opt-in debug response header summarizing per-island cache status, for staging.

# Testing Strategy

- **Unit**: key derivation stability, epoch validation, chunk record/replay round-trips covering every `RenderInstruction` type, and scoped `cache.set()` merge semantics against `AstroCache`.
- **Integration** fixtures modeled on the server-islands suites: the full nesting matrix (client-in-cached, server-in-cached, cached-in-cached, slots at each level), i18n key variance, CSP hash parity between a rendered response and a replayed one, deploy scoping across two consecutive builds, storage-failure fallback, and route-cache composition (a tagged route containing tagged islands, one `invalidate()` clearing both).
- **Dev server e2e**: toolbar app, noop behavior, opt-in fsLite store, guard errors.
- A **store conformance suite** covering unstorage drivers and custom store entrypoints: epoch validation, batched epoch reads and retention behavior per store.

# Drawbacks

- Complexity in the hottest path in the codebase. When the directive is absent the cost is one property check, the same as `containsServerDirective()` today, and the feature is behind a flag.
- A second cache grain for users to reason about. It uses the same vocabulary and API as the route grain, deploy scoping removes the worst class of debugging, and the toolbar and markers make state visible.
- Storage cost and entry size. Entries are typically small; a size warning and per-entry compression (see Unresolved) bound the rest.
- The runtime guard is advisory in production.
- Tag purge on eventually consistent stores is eventually consistent. This should be documented rather than hidden.

# Alternatives

- **Userland: recipes, an integration, or a `<Cacheable>` component.** None can reach render instructions, propagators, `componentMetadata` or CSP state; none can make deploy scoping automatic; none can check for request access. The largest users have effectively tried this, and each ended up with a partial, buggy version.
- **Caching the server island endpoint.** Ergonomics aside, the fragment still arrives by a deferred client fetch, so cached content paints after the dynamic shell around it, and it doesn't compose with per-request slots or nesting. The hybrid `server:cache="defer"` mode in Unresolved Questions is this idea with the order corrected: deferred on cold, inline on warm.
- **Extending route caching downward**, e.g. teaching providers to cache responses with per-user holes. This is ESI on the response layer: it fights HTTP semantics, ties hole-punching to provider capabilities and can't express nesting. Fragments belong in the component tree; responses belong in the response cache.
- **ESI / edge includes.** Platform-specific, no dev parity, and doesn't compose with islands or slots.
- **Data-layer caching only** (a `cachedFn`). Caches the fetch, not the render, and carries none of the island metadata. Worth doing later on the same storage layer; not a substitute.
- **Naming.** A separate `cache:` directive namespace, or `static:island`. Staying in `server:` keeps one compiler path and one namespace for things the server decides, and reads like `server:defer`.

# Adoption strategy

Ships behind `experimental.cachedIslands`, which gates the `cache.islands` config key and the directive. It should stabilize alongside route caching, since the two share config, vocabulary and invalidation. The flag requires `experimental.rustCompiler`: the directive exists only in `@astrojs/compiler-rs`, and the Go compiler stays unchanged.

The migration guide targets the hand-rolled pattern: the KV get/set wrapper and `set:html` become the directive; hand-built keys become `key`; TTLs become `maxAge`; the tag index, webhook plumbing and deploy-flush scripts are deleted. Sites already using `routeRules` get the fragment level with no new invalidation code.

For docs, the islands page can present the options as a freshness continuum: prerendering caches forever at deploy scope; route caching is bounded freshness for a response that can be shared as a unit; a cached island is bounded freshness for a fragment of one that can't; a server island is uncached with deferred delivery; a client island hands freshness to the client. `routeRules` is the root case, and this proposal uses the same options (`maxAge`, `swr`, `tags`, one `invalidate()`) further down the tree.

# Unresolved Questions

1. **`WaitUntilHook` reach.** The hook exists (`core/wait-until.ts`) and providers receive it in `onRequest`. Island revalidation needs it at render time on every adapter. Is threading it through the pipeline to the island layer enough, and what is the Node fallback where no platform hook exists: fire-and-forget, or synchronous revalidation on the next stale hit?
2. **Stampede control** beyond per-instance in-flight dedup and TTL jitter. Is an optional `lock()` on the store interface enough, or does the portable layer need best-effort locking?
3. **`stale-if-error`**: should a failed revalidation serve the stale entry beyond `swr`? Probably yes, with a bound.
4. **Compression** for large entries: always, never, or above a size threshold per store?
5. **A hybrid `server:cache="defer"` mode**: on a miss, emit a server-island placeholder and let the `/_server-islands/` endpoint render, respond and populate the store, so cold paths behave like server islands and warm paths are inline HTML. Useful, but it couples the two systems, so it is left out of v1.
6. **Cross-deploy pinning**: an `ASTRO_KEY`-style opt-in for very large caches that want to survive deploys, with the user taking responsibility for asset-hash stability.
7. **Options parity.** Scoped `set()` receiving `etag` is meaningless for a fragment: ignore silently or dev-warn? And is duration-string sugar (`'10m'`) worth adding to `routeRules` and island options together, or do plain seconds remain the shared contract?
8. **Native tag purge for island stores.** If a future store can delete by tag natively, is a first-class `IslandStore` interface (`get` / `set` / `delete` / `purgeTags`) worth adding then, bypassing epoch validation when present, or do epochs remain the permanent portable contract? Either way this belongs on the store side, not on `CacheProvider`: response providers and fragment stores are different things even when one backend could do both.
