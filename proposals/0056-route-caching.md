<!--
  Note: You are probably looking for `stage-1--discussion-template.md`!
  This template is reserved for anyone championing an already-approved proposal.

  Community members who would like to propose an idea or feature should begin
  by creating a GitHub Discussion. See the repo README.md for more info.

  To use this template: create a new, empty file in the repo under `proposals/${ID}.md`.
  Replace `${ID}` with the official accepted proposal ID, found in the GitHub Issue
  of the accepted proposal.
-->

**If you have feedback and the feature is released as experimental, please leave it on the Stage 3 PR. Otherwise, comment on the Stage 2 issue (links below).**

- Start Date: 2025-10-15
- Reference Issues: https://github.com/withastro/roadmap/discussions/1131, https://github.com/withastro/roadmap/discussions/181
- Implementation PR: <!-- leave empty -->
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1140
- Stage 3 PR: https://github.com/withastro/roadmap/pull/1245

# Summary

A platform-agnostic route caching API for Astro SSR pages that enables declarative cache control using web standards. The API provides a unified interface for caching server-rendered routes with support for time-to-live (TTL), stale-while-revalidate (SWR), tag-based invalidation, and automatic dependency tracking when used with live collections. Cache settings are managed through `Astro.cache`, an object available in routes, API endpoints, and middleware with methods for setting cache policy, reading accumulated tags, and invalidating cached content.

# Example

## Basic route caching

```astro
---
// src/pages/products/[id].astro
import { getEntry } from 'astro:content';

const product = await getEntry('products', Astro.params.id);

Astro.cache.set({
  lastModified: product.updatedAt,
  maxAge: 300,  // Cache for 5 minutes
  swr: 3600,    // Stale-while-revalidate for 1 hour
  tags: ['products', `product:${product.id}`]
});
---
<h1>{product.data.name}</h1>
<p>{product.data.description}</p>
```

## Cache invalidation by path

```ts
// src/pages/api/webhook.ts
export const POST: APIRoute = ({ cache }) => {
  // Invalidate by path
  cache.invalidate({ path: "/products/laptop" });

  return Response.json({ ok: true });
};
```

## Cache invalidation by tag

```ts
// src/pages/api/webhook.ts
export const POST: APIRoute = ({ cache }) => {
  // Invalidate by tag
  cache.invalidate({ tags: "products" });

  return Response.json({ ok: true });
};
```

## Integration with live collections

```astro
---
// src/pages/products/[slug].astro
import { getLiveEntry, render } from 'astro:content';

const { entry, cacheHint } = await getLiveEntry('products', Astro.params.slug);

// Apply cache hints from the live collection loader
Astro.cache.set(cacheHint);

const { Content } = await render(entry);
---
<h1>{entry.data.name}</h1>
<Content />
```

You can also pass the entry directly, which extracts the `cacheHint` automatically:

```astro
---
const { entry } = await getLiveEntry('products', Astro.params.slug);

// Equivalent to Astro.cache.set(entry.cacheHint)
Astro.cache.set(entry);
---
```

## Composing cache hints from multiple sources

When a page depends on multiple data sources, call `Astro.cache.set()` multiple times. Tags accumulate (union), while scalar values like `maxAge` use last-write-wins. With lastModified, the most recent date wins. This makes it easy to compose cache hints from multiple entries:

```astro
---
// src/pages/products/[slug].astro
const { entry: product } = await getLiveEntry('products', Astro.params.slug);
const { entry: author } = await getLiveEntry('authors', product.data.authorId);

// Tags from both entries merge; most recent lastModified wins
Astro.cache.set(product);
Astro.cache.set(author);

// User can still override TTL without losing accumulated tags
Astro.cache.set({ maxAge: 600 });
---
```

## Additive cache tags

Because `cache.set()` merges tags across calls, CMS integrations can add tags without affecting other cache settings:

```astro
---
// Integration adds tags only — doesn't touch TTL
Astro.cache.set({ tags: ['products', `product:${product.id}`] });

// User controls TTL separately — tags are preserved
Astro.cache.set({ maxAge: 300 });

// Read current tags (useful for integrations)
console.log(Astro.cache.tags); // ['products', 'product:123']
---
```

## Automatic dependency tracking

```ts
// src/pages/api/revalidate.ts
import { getLiveEntry } from "astro:content";

export const POST: APIRoute = async ({ cache, request }) => {
  const { id } = await request.json();
  const { entry } = await getLiveEntry("products", id);

  // Invalidate all pages that depend on this entry
  cache.invalidate(entry);

  return Response.json({ ok: true });
};
```

## Opting out of config-level caching

If a route matches a config-level cache rule but should not be cached, pass `false`:

```astro
---
// src/pages/blog/draft-post.astro
// Config sets caching for /blog/**, but this page opts out
Astro.cache.set(false);
---
```

## Define cache in config

```ts
// astro.config.ts
export default defineConfig({
  adapter: node(),
  cache: {
    routes: {
      "/": { maxAge: 0, swr: 60 },
      "/blog/**": { maxAge: 300 },
      "/products/**": { maxAge: 300, swr: 3600, tags: ["products"] },
      "/api/**": { maxAge: 600 },
    },
  },
});
```

# Background & Motivation

Caching is essential for performant server-rendered applications, but current solutions have significant limitations:

**Platform-specific implementations**: Most caching solutions (like ISR) are tightly coupled to specific hosting platforms. ISR was created for Next.js on Vercel and while other platforms have implemented versions of it, they're often limited or second-class implementations. This creates vendor lock-in and inconsistent behavior across deployments.

**Manual header management**: Developers must manually set and coordinate multiple cache-related headers (`Cache-Control`, `CDN-Cache-Control`, `Cache-Tag`, `Last-Modified`, `ETag`), which is error-prone and platform-specific.

**No standard invalidation**: Cache invalidation APIs vary wildly between platforms, making it difficult to write portable code that works everywhere.

**Poor integration with content**: When using live collections or other data sources, developers must manually track dependencies and remember which cache tags to use for invalidation.

[Live collections](https://github.com/withastro/roadmap/blob/feat/live-loaders/proposals/0055-live-content-loaders.md) introduced runtime data loading with cache hints, but applying those hints is awkward and requires manual header manipulation. We can provide a much better developer experience.

# Goals

- **Platform-agnostic API**: Single API that works consistently across all deployment targets
- **Web standards-based**: Use standard HTTP headers where possible, with platform-specific optimizations when available
- **Declarative cache control**: Simple, readable API for setting cache policies
- **Tag-based invalidation**: Invalidate groups of related pages efficiently
- **Path-based invalidation**: Invalidate specific routes by URL pattern
- **Live collections integration**: Seamless integration with live collections by passing entries or cache hints directly to `Astro.cache.set()`
- **Automatic dependency tracking**: Invalidate all pages that depend on changed content entries
- **Adapter abstraction**: Adapters provide platform-specific implementations with consistent behavior
- **Pluggable cache drivers**: Users can configure cache drivers for different CDN providers (Fastly, Cloudflare, Akamai, etc.)
- **Node.js support**: Functional in-memory caching for Node.js deployments

# Non-Goals

- **Strong consistency guarantees**: Cache invalidation follows eventual consistency model
- **Distributed caching for Node.js**: Node adapter uses in-memory cache, unsuitable for multi-instance deployments without external cache
- **Static/prerendered page caching**: This is for on-demand SSR routes only; static and prerendered routes are already cached by default and don't need route-level cache control
- **Partial page caching**: This focuses on full-page route caching, not fragment or component-level caching
- **Browser caching**: This focuses on CDN and server-side caching, not browser caching. Only `Last-Modified` and `ETag` headers are sent to browsers for conditional requests
- **Fetch cache**: This focuses on HTTP-level response caching, not API request caching
- **Building or maintaining all CDN-specific drivers**: We'll provide a driver interface and some select implementations, but rely on community or CDN vendors to maintain platform-specific implementations
- **General-purpose cache**: This is not a general-purpose key-value cache, but a specialized HTTP response cache
- **Dev server caching**: Caching is not active during development. The `Astro.cache` API is available and calls are no-ops, so code using it works without errors, but no responses are cached. The dev server always serves fresh content

# Detailed Design

## API

`Astro.cache` is an object available in `.astro` pages and API routes (via the context object) that provides methods for managing route-level caching. It is also available in middleware via the context object.

**Important:** This API only works in on-demand SSR routes. Static and prerendered routes are already cached and don't support route-level cache control. Caching is not active during development — the API is available but calls are no-ops, ensuring the dev server always serves fresh content.

### `Astro.cache.set(options | cacheHint | entry | false)`

Declares caching behavior for the current route. Sets the appropriate headers for the current adapter.

**With cache options:**

```astro
---
Astro.cache.set({
  maxAge: 300,
  swr: 3600,
  tags: ['products', 'product:123'],
  lastModified: new Date('2026-02-11')
});
---
```

**Options:**

- `maxAge: number` - Time in seconds the response should be considered fresh
- `swr?: number` - Additional seconds to serve stale content while revalidating in background
- `tags?: string[]` - Cache tags for group invalidation
- `lastModified?: Date` - Last modified time for conditional requests
- `etag?: string` - ETag value for conditional requests

**With cache hints from live collections:**

When using live collections, pass the `cacheHint` object returned by `getLiveEntry()` or `getLiveCollection()`, or pass the entry directly:

```astro
---
const { entry, cacheHint } = await getLiveEntry('products', Astro.params.id);

// Either of these works:
Astro.cache.set(cacheHint);
Astro.cache.set(entry);  // Extracts entry.cacheHint automatically
---
```

The `cacheHint` object contains pre-configured cache metadata including tags, lastModified, and other cache-related properties specific to that content entry. When an entry is passed directly, `Astro.cache.set()` reads the `cacheHint` property from the entry.

**Opting out:**

Pass `false` to explicitly disable caching for a route that would otherwise be cached by a config-level rule:

```astro
---
Astro.cache.set(false);
---
```

**Multiple calls (merge behavior):**

`Astro.cache.set()` can be called multiple times within a single request. Calls are merged as follows:

- **`maxAge`, `swr`, `etag`**: last-write-wins
- **`lastModified`**: most recent date wins
- **`tags`**: accumulated (union, deduplicated)
- **`false`**: overrides all previous settings and disables caching

This makes it natural to compose cache hints from multiple data sources:

```astro
---
const { entry: product } = await getLiveEntry('products', id);
const { entry: author } = await getLiveEntry('authors', product.data.authorId);

Astro.cache.set(product);   // tags: ['entry:products:123']
Astro.cache.set(author);    // tags: ['entry:authors:456'] — merged with above
Astro.cache.set({ maxAge: 600 }); // overrides TTL, tags preserved
// Final tags: ['entry:products:123', 'entry:authors:456']
---
```

### `Astro.cache.tags`

A read-only getter that returns the current accumulated cache tags for the request as a `string[]`. Returns a copy of the internal array.

```astro
---
Astro.cache.set(entry);
Astro.cache.set({ tags: ['extra-tag'] });
console.log(Astro.cache.tags); // ['entry:products:123', 'extra-tag']
---
```

This is useful for integrations that need to inspect which tags are set, for example to decide whether to trigger invalidation for opaque tags.

### `Astro.cache.invalidate(options | entry)`

Invalidates cached responses. Available in `.astro` pages, API routes, and middleware.

**Invalidate by path:**

```ts
cache.invalidate({ path: "/products/laptop" });
cache.invalidate({ path: "/blog/*" }); // Pattern matching
```

**Invalidate by tag:**

```ts
cache.invalidate({ tags: "products" });
cache.invalidate({ tags: ["products", "featured"] });
```

**Invalidate by entry:**

```ts
const { entry } = await getLiveEntry("products", id);
cache.invalidate(entry); // Reads entry.cacheHint.tags and invalidates matching routes
```

## Cache Provider Interface

Cache providers implement platform-specific caching logic while maintaining a consistent developer experience. Similar to how sessions use pluggable storage drivers, route caching uses pluggable cache providers.

### Provider Interface

```ts
interface CacheProvider {
  name: string;

  /**
   * Optional: Map cache options to platform-specific headers
   * If not provided, defaults to CDN-Cache-Control + Cache-Tag headers
   */
  setHeaders?(options: CacheOptions): Headers;

  /**
   * Optional: Middleware-style hook for runtime caching
   * Used by runtime providers (@astrojs/node/cache, @astrojs/cloudflare/cache)
   *
   * Follows the same API as Astro middleware:
   * - Check cache using context.request
   * - If cache hit, return cached response (don't call next())
   * - If cache miss, call next() to get response from route
   * - Read cache headers from response to determine caching behavior
   * - Store response in cache
   * - Return response
   */
  onRequest?(
    context: MiddlewareContext,
    next: () => Promise<Response>
  ): Promise<Response>;

  /**
   * Invalidate cached content
   */
  invalidate(options: InvalidateOptions): Promise<void>;
}

interface CacheOptions {
  maxAge?: number;
  swr?: number;
  tags?: string[];
  lastModified?: Date;
  etag?: string;
}

interface InvalidateOptions {
  path?: string;
  tags?: string | string[];
}
```

### `AstroCache` Object Interface

The `Astro.cache` object (and `context.cache` in API routes/middleware) implements the following interface:

```ts
interface AstroCache {
  /**
   * Set cache policy for the current route.
   * Multiple calls are merged: scalars use last-write-wins, tags accumulate.
   * Pass `false` to disable caching (overrides config-level rules).
   */
  set(options: CacheOptions | CacheHint | LiveDataEntry | false): void;

  /**
   * Current accumulated cache tags for this request (read-only copy).
   */
  readonly tags: string[];

  /**
   * Invalidate cached content by path, tags, or entry.
   */
  invalidate(options: InvalidateOptions | LiveDataEntry): Promise<void>;
}
```

### Provider Types

There are two fundamental types of cache providers:

**Header-based Providers** (Vercel, Netlify, Fastly, Cloudflare, Akamai):

- Implement `setHeaders()` to generate platform-specific cache headers
- Implement `invalidate()` to call platform purge APIs
- Do NOT implement `onRequest()` - external CDN handles actual caching
- Cache happens outside the application runtime

**Runtime Providers** (Node memory):

- Implement `onRequest()` middleware to intercept requests and handle caching
- Implement `invalidate()` to delete from cache store
- May optionally implement `setHeaders()` for platform-specific header formats
- Read cache headers (CDN-Cache-Control, Cache-Tag) from responses to determine caching behavior
- Cache happens within the application runtime (memory, KV, Cache API, etc.)

**Runtime provider middleware flow:**

```ts
async onRequest(context, next) {
  // 1. Check cache using context.request. Assume this.cache is a simple key-value store.
  const cached = await this.cache.get(context.url.pathname);
  if (cached && !isExpired(cached)) {
    return cached.response;
  }

  // 2. Call next() to get response from route
  const response = await next();

  // 3. Read cache headers from response
  const cacheControl = response.headers.get('CDN-Cache-Control');
  const cacheTags = response.headers.get('Cache-Tag');

  // 4. Store response in cache based on headers
  if (cacheControl) {
    await this.cache.set(context.url.pathname, {
      response: response.clone(),
      tags: cacheTags?.split(', '),
      // ... parse maxAge, swr from cacheControl
    });
  }

  // 5. Return response
  return response;
}
```

**Unified Flow:**

1. `Astro.cache.set()` or config rules generate cache options
2. Options converted to headers (via `setHeaders()` or default implementation)
3. Headers set on response
4. **Runtime providers** read headers in `onRequest()` middleware to determine caching behavior
5. **Header-based providers** pass headers through to external CDN

This design ensures consistent behavior: runtime providers honour the same cache headers that external CDNs use.

### Example Runtime Provider Implementation

Here's a complete example of a Node memory provider implementation:

```ts
import { LRUCache } from "lru-cache";

class NodeMemoryProvider implements CacheProvider {
  name = "node-memory";
  private cache: LRUCache<string, CachedEntry>;

  constructor(options?: { max?: number; ttl?: number }) {
    this.cache = new LRUCache({
      max: options?.max ?? 500,
      ttl: options?.ttl ?? 1000 * 60 * 5, // 5 minutes default
      allowStale: true,
      updateAgeOnGet: true,
    });
  }

  async onRequest(
    context: CacheMiddlewareContext,
    next: () => Promise<Response>
  ): Promise<Response> {
    // In real implementation, normalise the URL params etc
    const cacheKey = context.url.pathname + context.url.search;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && !this.isExpired(cached)) {
      return cached.response.clone();
    }

    // Get response from route
    const response = await next();

    // Parse cache headers
    const cacheControl = response.headers.get("CDN-Cache-Control");
    if (cacheControl) {
      const { maxAge, swr } = this.parseCacheControl(cacheControl);
      const tags = response.headers.get("Cache-Tag")?.split(", ") ?? [];

      // Store in cache
      this.cache.set(cacheKey, {
        response: response.clone(),
        tags,
        maxAge,
        swr,
        timestamp: Date.now(),
      });
    }

    return response;
  }

  async invalidate(options: InvalidateOptions): Promise<void> {
    // Naive implementation iterates all keys

    if (options.path) {
      // Invalidate by path (with wildcard support)
      const pattern = new URLPattern(options.path);
      for (const key of this.cache.keys()) {
        if (pattern.test(key)) {
          this.cache.delete(key);
        }
      }
    }

    if (options.tags) {
      const tags = Array.isArray(options.tags) ? options.tags : [options.tags];
      // Invalidate by tag
      for (const [key, value] of this.cache.entries()) {
        if (value.tags.some((tag) => tags.includes(tag))) {
          this.cache.delete(key);
        }
      }
    }
  }
}
```

This example demonstrates:

- Middleware-style `onRequest()` that checks cache before calling `next()`
- Reading cache headers from the response to determine caching behavior
- Storing responses with metadata (tags, TTL, timestamp)
- Invalidation by both path patterns and cache tags
- Proper response cloning to avoid consuming the stream

### Default Header Generation

If a provider doesn't implement `setHeaders()`, Astro uses a default implementation:

```ts
// Default header generation
function defaultSetHeaders(options: CacheOptions): Headers {
  const headers = new Headers();

  // Build Cache-Control value
  const directives = ["public"];
  if (options.maxAge !== undefined) {
    directives.push(`max-age=${options.maxAge}`);
  }
  if (options.swr !== undefined) {
    directives.push(`stale-while-revalidate=${options.swr}`);
  }

  headers.set("CDN-Cache-Control", directives.join(", "));

  if (options.tags?.length) {
    headers.set("Cache-Tag", options.tags.join(", "));
  }

  if (options.lastModified) {
    headers.set("Last-Modified", options.lastModified.toUTCString());
  }

  if (options.etag) {
    headers.set("ETag", options.etag);
  }

  return headers;
}
```

**Browser vs CDN caching:**

This API focuses on CDN and server-side caching, not browser caching. The `CDN-Cache-Control` and `Cache-Tag` headers are stripped before reaching the browser. Only `Last-Modified` and `ETag` headers are sent to browsers to enable conditional requests (304 Not Modified responses).

For header-based providers, `CDN-Cache-Control` is stripped by the CDN itself per RFC 9213. For runtime providers, the framework strips `CDN-Cache-Control` and `Cache-Tag` from the outgoing response after the cache middleware has processed them.

Providers can override this to use platform-specific headers. For example:

- Fastly overrides to use `Surrogate-Control` instead of `CDN-Cache-Control`, and `Surrogate-Key` instead of `Cache-Tag`
- Netlify uses `Netlify-CDN-Cache-Control` with additional directives and Vary header support

### Built-in Providers

Astro will ship with built-in providers for common platforms:

- `@astrojs/vercel/cache` - Vercel CDN (default for `@astrojs/vercel` adapter)
- `@astrojs/netlify/cache` - Netlify CDN (default for `@astrojs/netlify` adapter)
- `@astrojs/cloudflare/cache` - Cloudflare Workers Cache API (default for `@astrojs/cloudflare` adapter)
- `@astrojs/node/cache` - In-memory LRU cache (default for `@astrojs/node` adapter)

### Driver Packages

Driver packages can be distributed as npm packages. They are shown with the `@astrojs` scope for illustration, but could be published by providers themselves.

- `@astrojs/cache-cloudflare-cdn` - Cloudflare as proxy in front of other origins. Distributed separately from the Cloudflare adapter, because it would usually be used with the Node adapter.
- `@astrojs/cache-fastly` - Fastly CDN support
- `@astrojs/cache-akamai` - Akamai edge caching
- Custom providers for other CDNs or caching solutions
- Custom runtime providers using external stores (Redis, Memcached, etc.)

Driver packages export a function that accepts driver-specific options and returns a cache provider configuration. This pattern provides type-safe configuration and follows Astro's established patterns (similar to the fonts API):

```ts
// @astrojs/cache-fastly
export function cacheFastly(options: FastlyOptions) {
  return {
    entrypoint: new URL("./provider.js", import.meta.url),
    options,
  };
}
```

## Adapter Abstraction

Adapters provide platform-specific caching implementations while maintaining a consistent API. This follows the same pattern as the [Sessions API](https://docs.astro.build/en/guides/sessions/), where adapters can provide defaults and customize behavior.

### Header Mapping

Each cache provider maps `Astro.cache.set()` options to platform-specific headers or APIs:

**Vercel Provider (`vercel`):**

```
maxAge + swr → CDN-Cache-Control: public, max-age=300, stale-while-revalidate=3600
tags → Cache-Tag: products, product:123
lastModified → Last-Modified: Thu, 15 Jan 2025 00:00:00 GMT
```

**Netlify Provider:**

```
maxAge + swr → Netlify-CDN-Cache-Control: public, max-age=300, stale-while-revalidate=3600, durable
tags → Netlify-Cache-Tag: products, product:123
lastModified → Last-Modified: Thu, 15 Jan 2025 00:00:00 GMT
```

**Cloudflare Workers Provider:**
Uses the Workers Cache API directly when SSR runs in a Cloudflare Worker:

```ts
const cache = caches.default;
const cacheKey = new Request(url, request);
await cache.put(cacheKey, response.clone());
```

Tags are stored in KV for invalidation mapping. Invalidation looks up tag mappings in KV, then deletes from cache.

**Cloudflare CDN Provider (`cloudflare-cdn`):**
For use when Cloudflare acts as a CDN/proxy in front of another origin (like Node.js):

```
maxAge + swr → Cache-Control: public, s-maxage=300, stale-while-revalidate=3600
tags → Cache-Tag: products, product:123
lastModified → Last-Modified: Thu, 15 Jan 2025 00:00:00 GMT
```

Invalidation via Cloudflare's purge API requires zone ID and API token.

**Fastly Provider:**

```
maxAge + swr → Surrogate-Control: max-age=300, stale-while-revalidate=3600
tags → Surrogate-Key: products product:123
lastModified → Last-Modified: Thu, 15 Jan 2025 00:00:00 GMT
```

Note: Fastly uses `Surrogate-Control` and `Surrogate-Key` headers (proprietary Fastly headers). While Fastly co-authored RFC 9213 (CDN-Cache-Control), their documentation recommends using Surrogate-Control. Individual keys limited to 1024 bytes, total header limited to 16,384 bytes. Purge typically happens in ~1ms via batch API.

**Akamai Provider:**

```
maxAge + swr → CDN-Cache-Control: public, max-age=300, stale-while-revalidate=3600
tags → Edge-Cache-Tag: products,product:123
lastModified → Last-Modified: Thu, 15 Jan 2025 00:00:00 GMT
```

Note: Akamai supports the standardized `CDN-Cache-Control` header (RFC 9213) for Targeted Cache Control. Individual tags limited to 128 characters, total header limited to 8192 bytes. Tags are case-sensitive.

**Node Memory Provider:**

In-memory LRU cache using `lru-cache` library with stale-while-revalidate support. As a runtime provider, it reads the `CDN-Cache-Control` and `Cache-Tag` headers set by the default header generation to determine caching behavior.

### Invalidation Implementation

Each cache provider implements invalidation differently:

**Vercel Provider:**

```ts
// Call Vercel's edge cache invalidation API
// https://vercel.com/docs/rest-api/reference/endpoints/edge-cache/invalidate-by-tag
await fetch(`https://api.vercel.com/v1/edge-cache/invalidate-by-tags`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    tags: [tag],
    target: "production",
  }),
});
```

**Netlify Provider:**

```ts
// Use Netlify's purgeCache helper
// https://docs.netlify.com/build/caching/caching-overview/#purge-by-cache-tag
import { purgeCache } from "@netlify/functions";

await purgeCache({ tags: [tag] });
```

**Cloudflare Workers Provider:**

```ts
// Look up tag mappings in KV
const routes = await env.CACHE_TAGS.get(`tag:${tag}`, { type: "json" });
// Delete each route from cache
for (const route of routes) {
  await caches.default.delete(route);
}
```

**Cloudflare CDN Provider:**

```ts
// Call Cloudflare's purge API
// https://developers.cloudflare.com/api/resources/cache/methods/purge/
await fetch(
  `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tags: [tag] }),
  }
);
```

**Node Memory Provider:**

```ts
// Clear from in-memory cache
cache.delete(key);
// Or clear all entries with a tag
for (const [key, value] of cache.entries()) {
  if (value.tags?.includes(tag)) {
    cache.delete(key);
  }
}
```

### Adapter Integration

Adapters provide default cache drivers via the integration API, similar to how they provide default session drivers. Users can override the default driver in their config.

**Driver Loading:**

Cache driver functions return a configuration object containing an entrypoint and options. The entrypoint points to the provider implementation that is dynamically imported at runtime. The Netlify, Vercel, Cloudflare Workers, and Node memory drivers are published as subpath exports of their respective adapter packages because they are only ever used alongside those adapters.

**Adapter providing a default:**

```ts
// Example: @astrojs/vercel adapter
import { cacheVercel } from "@astrojs/vercel/cache";

export function vercel() {
  return {
    name: "@astrojs/vercel",
    hooks: {
      "astro:config:setup": ({ config, updateConfig }) => {
        // Only provide default if user hasn't configured a driver
        if (!config.cache?.driver) {
          updateConfig({
            cache: {
              driver: cacheVercel(),
            },
          });
        }
      },
      "astro:config:done": ({ setAdapter }) => {
        setAdapter({
          name: "@astrojs/vercel",
          // ...other adapter properties
        });
      },
    },
  };
}
```

**User overriding the default with a driver package:**

```ts
// astro.config.ts
import { cacheFastly } from "@astrojs/cache-fastly";

export default defineConfig({
  adapter: node(),
  cache: {
    // Override Node's default in-memory cache with Fastly
    driver: cacheFastly({
      serviceId: process.env.FASTLY_SERVICE_ID,
      token: process.env.FASTLY_TOKEN,
    }),
  },
});
```

**Driver packages:**

Driver packages export a configuration function that accepts type-safe options and returns a provider configuration. The provider implementation is then dynamically imported at runtime:

```ts
// fastly/index.ts
export function cacheFastly(options: FastlyOptions) {
  return {
    entrypoint: new URL("./provider.js", import.meta.url),
    options,
  };
}

// fastly/provider.ts
export default function fastlyProvider(options: FastlyOptions) {
  return {
    name: "fastly",
    setHeaders(cacheOptions) {
      /* ... */
    },
    async invalidate(options) {
      /* ... */
    },
  };
}
```

**Precedence:**

1. User-configured `cache.driver` in `astro.config.ts`
2. Adapter-provided default via `setAdapter()`

## Dependency Tracking

Dependency tracking is implemented using cache tags rather than in-memory state. When you pass a `cacheHint` or entry to `Astro.cache.set()`, it contains pre-configured cache tags based on the content entry. Live collection entries carry a `cacheHint` property directly on the entry object, so both `Astro.cache.set(entry)` and `Astro.cache.set(cacheHint)` work.

**Automatic tag generation:**

```astro
---
const { entry, cacheHint } = await getLiveEntry('products', 'laptop');

// cacheHint contains cache tags:
// - 'collection:products'
// - 'entry:products:laptop'
Astro.cache.set(cacheHint);
// or equivalently:
Astro.cache.set(entry);
---
```

**Equivalent to:**

```astro
---
Astro.cache.set({
  tags: [
    'collection:products',
    'entry:products:laptop'
  ],
  lastModified: entry.data.updatedAt,
  // ... other metadata from cacheHint
});
---
```

**Invalidating by entry:**
When `cache.invalidate(entry)` is called, it invalidates the appropriate cache tags:

```ts
// src/pages/api/webhook.ts
import { getLiveEntry } from "astro:content";

export const POST: APIRoute = async ({ cache, request }) => {
  const { id } = await request.json();

  const { entry } = await getLiveEntry("products", id);

  // This invalidates the tag 'entry:products:123'
  // All routes that used this entry will be purged
  cache.invalidate(entry);

  return Response.json({ ok: true });
};
```

**Behind the scenes:**

```ts
cache.invalidate(entry);
// Translates to:
cache.invalidate({ tags: entry.cacheHint.tags });
```

## Configuration

Route caching works automatically when using an adapter that supports it. Adapters provide sensible defaults, but users can customize or override them.

### Cache Provider Configuration

**Using adapter defaults (no configuration needed):**

```ts
// astro.config.ts
export default defineConfig({
  adapter: vercel(), // Uses '@astrojs/vercel/cache' provider by default
});
```

**Overriding with a driver package:**

```ts
// astro.config.ts
import { cacheCloudflare } from "@astrojs/cache-cloudflare-cdn";

export default defineConfig({
  adapter: node(),
  cache: {
    // Node app behind Cloudflare CDN
    driver: cacheCloudflare({
      zoneId: process.env.CF_ZONE_ID,
      token: process.env.CF_TOKEN,
    }),
  },
});
```

**Using Fastly with Node:**

```ts
// astro.config.ts
import { cacheFastly } from "@astrojs/cache-fastly";

export default defineConfig({
  adapter: node(),
  cache: {
    driver: cacheFastly({
      serviceId: process.env.FASTLY_SERVICE_ID,
      token: process.env.FASTLY_TOKEN,
    }),
  },
});
```

**Configuring the built-in Node memory cache:**

```ts
// astro.config.ts
import { cacheMemory } from "@astrojs/node/cache";

export default defineConfig({
  adapter: node(),
  cache: {
    driver: cacheMemory({
      max: 1000, // Max cache entries
      ttl: 300000, // Default TTL in ms
    }),
  },
});
```

### Route-Level Cache Rules

You can also declare cache rules for routes in your config. These act as defaults that can be overridden by `Astro.cache.set()` calls within routes.

**Basic route patterns:**

```ts
// astro.config.ts
export default defineConfig({
  adapter: vercel(),
  cache: {
    routes: {
      "/": { maxAge: 0, swr: 60 },
      "/blog/**": { maxAge: 300 },
      "/products/**": { maxAge: 300, swr: 3600, tags: ["products"] },
      "/api/**": { maxAge: 600 },
    },
  },
});
```

**Pattern matching:**

- Exact paths: `/about`
- Wildcards: `/blog/*` (single segment), `/blog/**` (multiple segments)
- Dynamic routes: `/products/[id]` (matches the file pattern)

**Precedence rules:**

1. `Astro.cache.set(false)` in the route (disables caching entirely)
2. `Astro.cache.set()` called in the route or middleware
3. Most specific matching route pattern in config
4. Less specific route patterns
5. No caching (default)

**No merging between config rules:** Each route pattern must be fully specified. A more specific pattern does not inherit settings from a less specific one.

**Example with precedence:**

```ts
cache: {
  routes: {
    '/blog/**': { maxAge: 300 },           // Matches all blog routes
    '/blog/featured': { maxAge: 60 },      // More specific, wins for this route
    '/blog/[slug]': { maxAge: 600 }        // Matches dynamic routes
  }
}
```

```astro
---
// src/pages/blog/[slug].astro
// This page uses maxAge: 600 from config by default
// But can override it:
Astro.cache.set({ maxAge: 900 }); // This wins
---
```

**Benefits of config-based rules:**

- Set defaults for entire route patterns
- No need to add `Astro.cache.set()` to every page
- Centralized cache policy
- Useful for API routes and pages that don't use live collections

## Middleware and API Route Support

`Astro.cache` is available in middleware via `context.cache`:

```ts
// src/middleware.ts
export const onRequest = (context, next) => {
  if (context.url.pathname.startsWith('/api/')) {
    context.cache.set({ maxAge: 600 });
  }
  return next();
};
```

API routes can both set cache policy and trigger invalidation:

```ts
// src/pages/api/products.ts
export const GET: APIRoute = async ({ cache }) => {
  cache.set({ maxAge: 300, tags: ['products'] });
  const products = await fetchProducts();
  return Response.json(products);
};

export const POST: APIRoute = async ({ cache, request }) => {
  const product = await request.json();
  await saveProduct(product);
  cache.invalidate({ tags: ['products', `product:${product.id}`] });
  return Response.json({ ok: true });
};
```

Cache set in middleware is treated like config-level defaults: `Astro.cache.set()` called within the route takes higher priority.

## Node.js Implementation Details

The Node adapter maintains an in-memory LRU cache using the `lru-cache` library, which provides:

- Automatic eviction of least-recently-used entries
- Built-in stale-while-revalidate support via `fetchMethod`
- TTL management
- Size limits to prevent memory issues

**Important limitations:**

- Cache is per-process, not shared across multiple Node instances
- Cache is lost on process restart
- Not suitable for horizontally scaled deployments without external cache

**For distributed Node deployments**, users should:

- Use a CDN in front of Node servers (recommended)
- Implement a custom cache driver using Redis, Memcached, or another distributed cache
- Use a platform with built-in edge caching (Vercel, Netlify, Cloudflare)

## Real-World Deployment Scenarios

### Scenario 1: Vercel Deployment

**Setup:** Deploy directly to Vercel using `@astrojs/vercel` adapter
**Provider:** `vercel` (automatic default)
**Configuration:** None required
**Behavior:** Uses Vercel's CDN-Cache-Control and Cache-Tag headers, invalidation via Vercel API

```ts
// astro.config.ts
export default defineConfig({
  adapter: vercel(), // That's it!
});
```

### Scenario 2: Node.js Behind Cloudflare CDN

**Setup:** Self-hosted Node.js server with Cloudflare as CDN/proxy
**Driver:** `@astrojs/cache-cloudflare-cdn` (user configured, driver package)
**Configuration:** Requires Cloudflare zone ID and API token
**Behavior:** Sets Cache-Tag headers, invalidation via Cloudflare purge API

```ts
// astro.config.ts
import { cacheCloudflare } from "@astrojs/cache-cloudflare-cdn";

export default defineConfig({
  adapter: node(),
  cache: {
    driver: cacheCloudflare({
      zoneId: process.env.CF_ZONE_ID,
      token: process.env.CF_TOKEN,
    }),
  },
});
```

### Scenario 3: Cloudflare Workers

**Setup:** SSR running directly in Cloudflare Workers
**Driver:** `@astrojs/cloudflare/cache` (automatic default)
**Configuration:** None required, uses KV for tag mapping
**Behavior:** Uses Workers Cache API directly, stores tag mappings in KV

```ts
// astro.config.ts
export default defineConfig({
  adapter: cloudflare(), // Automatically uses @astrojs/cloudflare/cache driver
});
```

### Scenario 4: Node.js Behind Fastly

**Setup:** Self-hosted Node.js with Fastly CDN
**Driver:** `@astrojs/cache-fastly` (user configured, driver package)
**Configuration:** Requires Fastly service ID and API token
**Behavior:** Sets Surrogate-Key headers, invalidation via Fastly batch purge API (~1ms)

```ts
// astro.config.ts
import { cacheFastly } from "@astrojs/cache-fastly";

export default defineConfig({
  adapter: node(),
  cache: {
    driver: cacheFastly({
      serviceId: process.env.FASTLY_SERVICE_ID,
      token: process.env.FASTLY_TOKEN,
    }),
  },
});
```

### Scenario 5: Simple Node.js Deployment (Single Instance)

**Setup:** Single Node.js server, no CDN
**Driver:** `@astrojs/node/cache` (automatic default)
**Configuration:** Optional tuning of cache size
**Behavior:** In-memory LRU cache, lost on restart

```ts
// astro.config.ts
import node from "@astrojs/node";
import { cacheMemory } from "@astrojs/node/cache";

export default defineConfig({
  adapter: node(),
  // Optional: tune cache settings
  cache: {
    driver: cacheMemory({
      max: 1000,
      ttl: 300000,
    }),
  },
});
```

**Limitation:** Not suitable for multi-instance deployments (cache not shared across instances).

# Testing Strategy

## Unit Tests

- Test `Astro.cache.set()` / `Astro.cache.tags` with mock providers
- Test merge semantics: scalar last-write-wins, tag accumulation, `false` override
- Test cache option validation and defaults
- Test automatic tag generation when passing entries
- Test entry cache hint extraction

## Integration Tests

- Test each adapter's header generation
- Verify correct headers are set for each platform
- Test tag parsing and formatting

## E2E Tests

- Test actual cache behavior on each platform (Vercel, Netlify, Cloudflare, Node)
- Test invalidation via API routes
- Test stale-while-revalidate behavior
- Test dependency tracking with live collections
- Test Node adapter LRU cache eviction and TTL

## Adapter Tests

Individual adapters should include tests for:

- Platform-specific header mapping
- Invalidation API integration
- Error handling when API tokens are missing

# Drawbacks

- **Adapter complexity**: Adapters must implement platform-specific caching logic, increasing maintenance burden
- **Node.js limitations**: In-memory cache doesn't work for distributed deployments, requiring external solutions or CDN
- **Eventual consistency**: Cache invalidation is not instantaneous and follows eventual consistency model
- **API token management**: Some platforms require API tokens for programmatic invalidation, adding configuration complexity
- **Platform fragmentation**: While we provide unified API, actual behavior may vary slightly between platforms based on their capabilities
- **Tag header size limits**: CDNs have different limits for cache tag headers (Fastly: 16KB, Akamai: 8KB, etc.), which may limit how many tags can be used per route

# Alternatives

## Manual header management

Users could continue setting headers manually using `Astro.response.headers.set()`. This provides maximum flexibility but is error-prone and platform-specific.

## Build-time configuration only

We could require all cache rules to be defined in `astro.config.ts` rather than per-route. This is simpler but less flexible and doesn't support dynamic cache policies based on data.

## Middleware-based approach

Implement caching entirely in middleware rather than as a first-class API. This gives users more control but requires more boilerplate and doesn't integrate well with live collections.

# Adoption strategy

## Rollout Plan

1. **Experimental release**: Ship behind experimental flag, disabled by default. Cache configuration will be inside the `experimental` object:

```ts
import { cacheVercel } from "@astrojs/vercel/cache";

export default defineConfig({
  adapter: vercel(),
  experimental: {
    cache: {
      driver: cacheVercel(), // or use adapter default by omitting
      routes: {
        "/blog/**": { maxAge: 300 },
      },
    },
  },
});
```

2. **Adapter implementation**: Start with Netlify and Vercel adapters as they have the most mature caching APIs
3. **Node adapter**: Implement in-memory caching for local development and simple deployments
4. **Cloudflare adapter**: Add support once Worker cache API integration is stable
5. **Stable release**: Move to stable once battle-tested on major platforms. Configuration moves from `experimental.cache` to `cache`.

## Breaking Changes

This is a **non-breaking addition**. The feature is disabled by default and users opt-in via experimental config. Existing code continues to work unchanged.

## Migration Path

Users currently setting cache headers manually can migrate incrementally:

**Before:**

```astro
---
Astro.response.headers.set('Cache-Control', 'public, max-age=300');
Astro.response.headers.set('CDN-Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
---
```

**After:**

```astro
---
Astro.cache.set({ maxAge: 300, swr: 3600 });
---
```

## Documentation Requirements

- Guide on route caching concepts and when to use it
- Per-adapter documentation on platform-specific behavior
- Integration guide for live collections
- Examples for common caching patterns
- Troubleshooting guide for cache invalidation

## Ecosystem Impact

- **Live collections**: Natural integration point, making cache hints actually useful
- **Adapters**: All SSR adapters should implement caching support
- **Integrations**: CMS integrations can trigger cache invalidation on content changes
- **Hosting platforms**: Platforms may need to document their specific caching behavior

# Unresolved Questions

None. All previously open questions have been resolved:

- **Cache warming/preloading**: Out of scope. Can be built as an integration if needed.
- **Cross-region invalidation**: Delegated to the cache provider/CDN. Not something the framework should abstract.
- **Metrics/observability**: Out of scope. Providers can expose their own metrics.
- **Wildcard tag matching**: No. Tags are exact-match strings. Use explicit tag hierarchies instead.
- **CLI command for invalidation**: No. Use API routes or platform-specific tools.

