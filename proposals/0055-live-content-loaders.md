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

- Start Date: 2025-05-02
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: https://github.com/withastro/astro/pull/13685
- Stage 1 Discussion: https://github.com/withastro/roadmap/discussions/1137
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1151
- Stage 3 PR: <!-- related roadmap PR, leave it empty if you don't have a PR yet -->

# Summary

Adds support for live content collections, with a new type of loader that fetches data at runtime rather than build time.

# Example

Defining a live loader for a store API:

```ts
// storeloader.ts
import { type Product, loadStoreData } from "./lib/api.ts";

interface StoreCollectionFilter {
  category?: string;
}

interface StoreEntryFilter {
  slug?: string;
}

export function storeLoader({
  field,
  key,
}): LiveLoader<Product, StoreEntryFilter, StoreCollectionFilter> {
  return {
    name: "store-loader",
    loadCollection: async ({ logger, filter }) => {
      logger.info(`Loading collection from ${field}`);
      try {
        // load from API
        const products = await loadStoreData({ field, key, filter });
        const entries = products.map((product) => ({
          id: product.id,
          data: product,
        }));
        return {
          entries,
        };
      } catch (error) {
        logger.error(`Failed to load collection: ${error.message}`);
        return {
          error: new Error(`Failed to load products: ${error.message}`, {
            cause: error,
          }),
        };
      }
    },
    loadEntry: async ({ logger, filter }) => {
      logger.info(`Loading entry from ${field}`);
      try {
        // load from API
        const product = await loadStoreData({
          field,
          key,
          filter,
        });

        if (!product) {
          return {
            error: new Error("Product not found"),
          };
        }
        return {
          id: filter.id,
          data: product,
        };
      } catch (error) {
        logger.error(`Failed to load entry: ${error.message}`);
        return {
          error: new Error(`Failed to load product: ${error.message}`, {
            cause: error,
          }),
        };
      }
    },
  };
}
```

A new `src/live.config.ts` file is introduced that uses the same syntax as the `src/content.config.ts` file:

```ts
// src/live.config.ts
import { defineLiveCollection } from "astro:content";

import { storeLoader } from "@mystore/astro-loader";

const products = defineLiveCollection({
  loader: storeLoader({ field: "products", key: process.env.STORE_KEY }),
});

export const collections = { products };
```

The loader is accessed using new dedicated functions that make the runtime behavior explicit:

```astro
---
import { getLiveCollection, getLiveEntry } from "astro:content";

// Get all entries in a collection
const { entries: allProducts, error } = await getLiveCollection("products");
if (error) {
  // Handle error gracefully
  return Astro.redirect('/500');
}

// Live collections optionally allow extra filters to be passed in, defined by the loader
const { entries: clothes } = await getLiveCollection("products", { category: "clothes" });

// Get entry by ID
const { entry: productById } = await getLiveEntry("products", Astro.params.id);

// Query a single entry using the object syntax
const { entry: productBySlug, error: slugError } = await getLiveEntry("products", { slug: Astro.params.slug });
if (slugError) {
  return Astro.redirect('/404');
}
---
```

# Background & Motivation

In Astro 5, the content layer API added support for adding diverse content sources to content collections. Users can create loaders that fetch data from any source at build time, and then access it inside a page via `getEntry` and `getCollection`. The data is cached between builds, giving fast access and updates. However there is no method for updating the data store between builds, meaning any updates to the data need a full site deploy, even if the pages are rendered on-demand.

This means that content collections are not suitable for pages that update frequently. Instead, today these pages tend to access the APIs directly in the frontmatter. This works, but leads to a lot of boilerplate, and means users don't benefit from the simple, unified API that content loaders offer. In most cases users tend to individually create loader libraries that they share between pages.

This proposal introduces a new kind of loader that fetches data from an API at runtime, rather than build time. As with other content loaders, these loaders abstract the loading logic, meaning users don't need to understand the details of how data is loaded. These loaders can be distributed as node modules, or injected by integrations.

The API uses dedicated functions (`getLiveCollection` and `getLiveEntry`) to make it explicit that these operations perform network requests at runtime, helping developers understand the performance implications and error handling requirements.

# Goals

- a new type of **live content loader** that is executed at runtime
- dedicated user-facing functions `getLiveEntry` and `getLiveCollection` that make the **runtime behavior explicit**
- **built-in error handling** with consistent error response format
- loader-specific **query and filters**, which a loader can define and pass to the API
- **type-safe** data and query options, defined by the loader as generic types
- support for user-defined **Zod schemas**, executed at runtime, to validate or transform the data returned by the loader
- support for **rendered content** via a `rendered` property that loaders can return, allowing use of the `render()` function and `<Content />` component
- optional **integration with [route caching](https://github.com/withastro/roadmap/issues/1140)**, allowing loaders to define cache tags and expiry times associated with the data which are then available to the user

# Non-Goals

- server-side caching of the data. Instead it would integrate with the route cache and HTTP caches to cache the full page response, or individual loaders could implement their own API caching.
- rendering of MDX or other content-like code. This isn't something that can be done at runtime.
- support for image processing, either in the Zod schema or Markdown. This is not something that can be done at runtime.
- loader-defined Zod schemas. Instead, loaders define types using TypeScript generics. Users can define their own Zod schemas to validate or transform the data returned by the loader, which Astro will execute at runtime.
- schema functions with `SchemaContext`. Live collections only support schema objects, not schema functions that receive context like `({ image }) => z.object({...})`. This is because runtime data fetching cannot use build-time asset processing utilities.
- updating the content layer data store. Live loaders return data directly and do not update the store.
- support for existing loaders. They will have a different API. Developers could in theory use shared logic, but the loader API will be different

# Detailed Design

The user-facing API uses dedicated functions `getLiveCollection` and `getLiveEntry` to make it clear these are runtime operations that may fail and have different performance characteristics than regular content collections.

## User-facing API

The new functions are exported from `astro:content` alongside the existing functions:

```ts
import {
  getCollection,
  getEntry,
  getLiveCollection,
  getLiveEntry,
} from "astro:content";
```

These functions return a result object with either `data` or `error`, making error handling explicit and consistent:

```ts
// Success case
const { entries, error } = await getLiveCollection("products");
if (error) {
  // Handle error
  console.error(error.message);
  return Astro.redirect("/error");
}
// Use data safely
entries.forEach((product) => {
  // ...
});

// With filters
const { entries: electronics } = await getLiveCollection("products", {
  category: "electronics",
});

// Single entry
const { entry: product, error } = await getLiveEntry(
  "products",
  Astro.params.id
);
```

## Loader API

A live loader is an object with two methods: `loadCollection` and `loadEntry`. These methods should handle errors gracefully and return either data or an error object:

```ts
// storeloader.ts

export function storeLoader({ field, key }): LiveLoader {
  return {
    name: "store-loader",
    loadCollection: async ({ filter }) => {
      try {
        const products = await fetchProducts(filter);
        return {
          entries: products.map((product) => ({
            id: product.id,
            data: product,
          })),
        };
      } catch (error) {
        return {
          error: new Error(`Failed to load products: ${error.message}`, {
            cause: error,
          }),
        };
      }
    },
    loadEntry: async ({ filter }) => {
      try {
        const product = await fetchProduct(filter);
        if (!product) {
          return {
            error: new Error("Product not found"),
          };
        }
        return {
          id: filter.id,
          data: product,
        };
      } catch (error) {
        return {
          error: new Error(`Failed to load product: ${error.message}`, {
            cause: error,
          }),
        };
      }
    },
  };
}
```

## Loader execution

Existing content loaders are executed at build time, and the data is stored in the content layer data store, which is then available during rendering. The new live loaders are executed at runtime, and the data is returned directly.

The new `live.config.ts` file has similar syntax to the existing `content.config.ts` file, but it is compiled as part of the build process and included in the build so that it can be called at runtime.

## Filters

For existing collections, `getCollection` accepts an optional function to filter the collection. This filtering is performed in-memory on the data returned from the store. This is not an efficient approach for live loaders, which are likely to be making network requests for the data at request time. Loading all of the entries and then filtering them on the client would cause over-fetching, so it is preferable to filter the data natively in the API.

For this reason, the `getLiveCollection` and `getLiveEntry` methods accept a query object, which is passed to the loader `loadEntry` and `loadCollection` functions. This is an arbitrary object, the type of which is defined by the loader. The loader can then use this filter to fetch the data from the API, according to the API's query syntax. The `getLiveEntry` function also has a shorthand syntax for querying a single entry by ID by passing a string that matches the existing `getEntry` syntax. This is passed to the loader as an object with a single `id` property.

## Type Safety

The `LiveLoader` type is a generic type that takes four parameters:

- `TData`: the type of the data returned by the loader
- `TEntryFilter`: the type of the filter object passed to `getLiveEntry`
- `TCollectionFilter`: the type of the filter object passed to `getLiveCollection`
- `TError`: the type of the error returned by the loader

These types will be used to type the `loadCollection` and `loadEntry` methods.

```ts
// storeloader.ts
import type { LiveLoader } from "astro/loaders";
import { type Product, loadStoreData } from "./lib/api.ts";

interface StoreCollectionFilter {
  category?: string;
}

interface StoreEntryFilter {
  slug?: string;
}

class StoreLoaderError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "StoreLoaderError";
    if (cause) {
      this.cause = cause;
    }
  }
}

export function storeLoader({
  field,
  key,
}): LiveLoader<
  Product,
  StoreEntryFilter,
  StoreCollectionFilter,
  StoreLoaderError
> {
  return {
    name: "store-loader",
    // `filter` is typed as `StoreCollectionFilter`
    loadCollection: async ({ filter }) => {
      // ...
    },
    // `filter` is typed as `StoreEntryFilter`
    loadEntry: async ({ filter }) => {
      // ...
    },
  };
}
```

The `LiveLoader` type is defined as follows:

```ts
export interface LiveLoaderError {
  /** Error message */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Original error if applicable */
  cause?: unknown;
}

export interface CacheHint {
  /** Cache tags */
  tags?: Array<string>;
  /** Last modified time of the content */
  lastModified?: Date;
}

export interface LiveDataEntry<
  TData extends Record<string, any> = Record<string, unknown>
> {
  /** The ID of the entry. Unique per collection. */
  id: string;
  /** The entry data */
  data: TData;
  /** Optional rendered content */
  rendered?: {
    html: string;
  };
  /** Optional cache hints */
  cacheHint?: CacheHint;
}

export interface LiveDataCollection<
  TData extends Record<string, any> = Record<string, unknown>
> {
  entries: Array<LiveDataEntry<TData>>;
  /** Optional cache hints */
  cacheHint?: CacheHint;
}

export interface LiveDataEntryResult<
  TData extends Record<string, any> = Record<string, unknown>,
  TError extends Error = Error
> {
  entry?: LiveDataEntry<TData>;
  error?: TError | LiveCollectionError;
  cacheHint?: CacheHint;
}

export interface LiveDataCollectionResult<
  TData extends Record<string, any> = Record<string, unknown>,
  TError extends Error = Error
> {
  entries?: Array<LiveDataEntry<TData>>;
  error?: TError | LiveCollectionError;
  cacheHint?: CacheHint;
}

export interface LoadEntryContext<TEntryFilter = never> {
  filter: TEntryFilter extends never
    ? {
        id: string;
      }
    : TEntryFilter;
}
export interface LoadCollectionContext<TCollectionFilter = unknown> {
  filter?: TCollectionFilter;
}
export interface LiveLoader<
  TData extends Record<string, any> = Record<string, unknown>,
  TEntryFilter extends Record<string, any> | never = never,
  TCollectionFilter extends Record<string, any> | never = never,
  TError extends Error = Error
> {
  /** Unique name of the loader, e.g. the npm package name */
  name: string;
  /** Load a single entry */
  loadEntry: (
    context: LoadEntryContext<TEntryFilter>
  ) => Promise<LiveDataEntry<TData> | undefined | { error: TError }>;
  /** Load a collection of entries */
  loadCollection: (
    context: LoadCollectionContext<TCollectionFilter>
  ) => Promise<LiveDataCollection<TData> | { error: TError }>;
}
```

The user-facing `getLiveCollection` and `getLiveEntry` methods exported from `astro:content` will be typed to return the result format with separate `data` and `error` properties.

Users will still be able to define a Zod schema inside `defineLiveCollection` to validate the data returned by the loader. If provided, this schema will also be used to infer the returned type of `getLiveCollection` and `getLiveEntry` for the collection, taking precedence over the loader type. This means that users can use the loader to fetch data from an API, and then use Zod to validate or transform the data before it is returned.

### Schema Restrictions

Unlike build-time content collections, live collections **do not support schema functions**. The schema must be a Zod schema object, not a function that receives the `image` helper:

```ts
// Supported - Schema object
const products = defineLiveCollection({
  loader: storeLoader({ ... }),
  schema: z.object({
    title: z.string(),
    price: z.number(),
  }),
});

// ❌ Not supported - Schema function
const products = defineLiveCollection({
  loader: storeLoader({ ... }),
  schema: ({ image }) => z.object({  // Error: schema functions not allowed
    title: z.string(),
    cover: image(),
  }),
});
```

This restriction exists because the `image()` function is designed for build-time asset processing. Live collections fetch data at runtime, when build-time asset processing is not available. Image references in live collections should come pre-processed from the API or be handled client-side

## Error Handling

Live loaders should handle errors gracefully and return an object with an `error` property. The error object should also include the original error if applicable, using the `cause` property.

### Built-in Error Classes

Astro provides built-in error classes for common live collection scenarios:

- **`LiveCollectionError`**: Base error class for all live collection errors
- **`LiveEntryNotFoundError`**: Returned when an entry cannot be found
- **`LiveCollectionValidationError`**: Returned when data fails schema validation
- **`LiveCollectionCacheHintError`**: Returned when cache hints are invalid

All error classes have a static `is()` method for type-safe error checking:

```astro
---
import { getLiveEntry } from "astro:content";
import { LiveEntryNotFoundError } from "astro/loaders";

const { entry, error } = await getLiveEntry("products", Astro.params.id);

if (LiveEntryNotFoundError.is(error)) {
  console.error(`Product not found: ${error.message}`);
  Astro.response.status = 404;
  return Astro.redirect('/404');
}

if (error) {
  console.error(`Unexpected error: ${error.message}`);
  return Astro.redirect('/500');
}
---
```

### Error Handling Patterns

Example error handling patterns:

```astro
---
import { getLiveEntry, getLiveCollection } from "astro:content";

const { entries: products, error } = await getLiveCollection("products");

// Use Astro's error handling
if (error) {
  throw error;
}

// Custom error handling
if (error) {
  console.error(`Failed to load products: ${error.message}`);

  // Handle based on error code of custom error
  if (error.code === 'RATE_LIMITED') {
    return Astro.redirect('/too-many-requests');
  }

  // Generic error page
  return Astro.redirect('/500');
}



// Display errors in the page
const { entries, error } = await getLiveCollection("products");
---

{error ? (
  <ErrorMessage message={error.message} />
) : (
  <ProductList products={entries} />
)}
```

## Caching

The returned data is not cached by Astro, but a loader can provide hints to assist in caching the response. This would be designed to integrate with the proposed [route caching API](https://github.com/withastro/roadmap/pull/1245), but could also be used to manually set response headers. The scope of this RFC does not include details on the route cache integration, but will illustrate how the loader can provide hints that can then be used by the route cache or other caching mechanisms.

Loader responses can include a `cacheHint` object that contains the following properties:

- `tags`: an array of strings that can be used to tag the response. This is useful for cache invalidation.
- `lastModified`: a Date object that specifies when the content was last modified. This is useful for HTTP cache headers like `Last-Modified` and `If-Modified-Since`.

The loader does not define how these should be used, and the user is free to use them in any way they like.

For example, a loader could return the following object for a collection:

```ts
return {
  entries: products.map((product) => ({
    id: product.id,
    data: product,
  })),
  cacheHint: {
    tags: ["products", "clothes"],
    lastModified: new Date(product.updatedAt),
  },
};
```

This would allow the user to tag the response with the `products` and `clothes` tags, and indicate when the content was last modified. The user could then use these tags to invalidate the cache when the data changes.

The loader can also provide a `cacheHint` object for an individual entry, allowing fine-grained cache control:

```ts
return {
  id: filter.id,
  data: product,
  cacheHint: {
    tags: [`product-${filter.id}`],
    lastModified: new Date(product.updatedAt),
  },
};
```

When the user calls `getLiveCollection` or `getLiveEntry`, the response will include cache hints that can be used. This example shows how to apply cache tags and last modified time in the response headers:

```astro
---
import { getLiveEntry } from "astro:content";
import Product from "../components/Product.astro";

const { entries: product, error, cacheHint } = await getLiveEntry("products", Astro.params.id);

if (error) {
  return Astro.redirect('/404');
}

if (cacheHint) {
  Astro.response.headers.set("Cache-Tag", cacheHint.tags.join(","));
  if (cacheHint.lastModified) {
    Astro.response.headers.set("Last-Modified", cacheHint.lastModified.toUTCString());
  }
}
---
<Product product={product.data} />
```

## Rendered Content

Loaders can optionally return a `rendered` property containing HTML content. This allows entries to be rendered using the same `render()` function and `<Content />` component as build-time collections:

```ts
// articleloader.ts
export function articleLoader(config: { apiKey: string }): LiveLoader<Article> {
  return {
    name: "article-loader",
    loadEntry: async ({ filter }) => {
      const article = await fetchFromCMS({
        apiKey: config.apiKey,
        type: "article",
        id: filter.id,
      });

      return {
        id: article.id,
        data: article,
        rendered: {
          // Assuming the CMS returns HTML content
          html: article.htmlContent,
        },
      };
    },
    // ...
  };
}
```

The rendered content can then be used in pages:

```astro
---
import { getLiveEntry, render } from "astro:content";

const { entry, error } = await getLiveEntry("articles", Astro.params.id);

if (error) {
  return Astro.rewrite('/404');
}

const { Content } = await render(entry);
---

<h1>{entry.data.title}</h1>
<Content />
```

If a loader does not return a `rendered` property, the `<Content />` component will render nothing.

# Testing Strategy

Much of the testing strategy will be similar to the existing content loaders, as integration tests work in the same way. It will also be easier to test the loaders in isolation, as they are not dependent on the content layer data store.

End-to-end tests will be added to test the bundling and runtime execution of the loaders.

Type tests will be added to ensure that the generated types are correct, and that the user can call the `getLiveCollection` and `getLiveEntry` methods with the correct types.

Error handling tests will ensure that errors are properly propagated and that the result objects maintain type safety.

# Drawbacks

- This is a significant addition to the content collections API, and will require work to implement and document.
- This is a new API for loader developers to learn, and existing loaders cannot be trivially converted. While the API and mental model are simpler than the existing content loaders, it is still a new API that will require some work for developers to implement.
- Unlike the content layer APIs, there will not be any built-in loaders for this API, so it will be up to the community to implement them. There will be limited value to this feature until there are a number of loaders available.
- The dedicated functions (`getLiveCollection`/`getLiveEntry`) make it clear that these are different operations, but developers need to learn when to use which functions.

# Alternatives

- **Do nothing**: For regularly-updated data they will need to use any APIs directly in the frontmatter. This is the current approach, and while it works, it is not ideal. It means that users need to implement their own loading logic. This tends to involve a lot of boilerplate, and there is no common API for accessing the data.
- **Add support for updating the content layer data store at runtime**: This would allow users to update the data in the content layer data store, for example via a webhook. This would be significantly more complex and would require a lot of work to implement. It would also require users provision third-party database services to support this in a serverless environment.
- **Use the same function names with different behavior**: This was the original proposal, but it could cause confusion about performance characteristics and error handling requirements. The dedicated functions make the runtime behavior explicit.

# Adoption strategy

- This would be released as an experimental feature, with a flag to enable it.
- As live collections are defined in a new file, existing sites will not be affected by this change unless they add new collections that use it.
- Clear documentation will highlight the differences between `getCollection`/`getEntry` and `getLiveCollection`/`getLiveEntry`.
- Migration guides will help developers understand when to use each approach.

# Unresolved Questions

- The proposed **name of the file** is potentially confusing. While the name `live.config.ts` is analogous to the existing `content.config.ts` file, neither are really configuration files, and have more in common with actions or middleware files. Would it better to not use `config` in the name, or would that be confusing when compared to the existing file? Possible alternatives: `src/live.ts`, `src/live-content.ts`, `src/live-content.config.ts`, `src/content.live.ts`...

- Whether to provide a **`renderMarkdown` helper function** in the loader context. While the `rendered` property is supported and loaders can return pre-rendered HTML, there's a question about whether Astro should provide a helper to render Markdown at runtime within loaders. The most likely approach would be to add a `renderMarkdown(content: string)` helper function to the loader context that uses a pre-configured instance of the renderer from the built-in `@astrojs/markdown-remark` package. This helper could also be added to existing content layer loaders, as users have requested it. However, there are concerns: (1) it may encourage performance-intensive operations in loaders, (2) it may be confusing that image processing is unsupported, (3) it would not support MDX, and it would likely not be possible to use the user's configured Markdown options as these would not be serializable. Overall, while it could be a useful convenience, it may introduce more complexity and potential for misuse than the benefits it provides.
