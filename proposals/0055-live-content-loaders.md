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

Adds support for live data to content collections. Defines a new type of content loader that fetches data at runtime rather than build time, allowing users to get the data with a similar API.

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
      // load from API
      const products = await loadStoreData({ field, key, filter });
      const entries = products.map((product) => ({
        id: product.id,
        data: product,
      }));
      return {
        entries,
      };
    },
    loadEntry: async ({ logger, filter }) => {
      logger.info(`Loading entry from ${field}`);
      // load from API
      const product = await loadStoreData({
        field,
        key,
        filter,
      });

      if (!product) {
        logger.error(`Product not found`);
        return;
      }
      return {
        id: filter.id,
        data: product,
      };
    },
  };
}
```

A new `src/live.config.ts` file is introduced that uses the same syntax as the `src/content.config.ts` file:

```ts
// src/live.config.ts
import { defineCollection } from "astro:content";

import { storeLoader } from "@mystore/astro-loader";

const products = defineCollection({
  type: "live",
  loader: storeLoader({ field: "products", key: process.env.STORE_KEY }),
});

export const collections = { products };
```

The loader can be used in the same way as a normal content collection:

```astro
---
import { getCollection, getEntry } from "astro:content";

// Get all entries in a collection, like other collections
const allProducts = await getCollection("products");

// Live collections optionally allow extra filters to be passed in, defined by the loader
const clothes = await getCollection("products", { category: "clothes" });

// Get entrey by ID like other collections
const productById = await getEntry("products", Astro.params.id);

// Query a single entry using the object syntax
const productBySlug = await getEntry("products", { slug: Astro.params.slug });
---
```

# Background & Motivation

In Astro 5, the content layer API added support for adding diverse content sources to content collections. Users can create loaders that fetch data from any source at build time, and then access it inside a page via `getEntry` and `getCollection`. The data is cached between builds, giving fast access and updates. However there is no method for updating the data store between builds, meaning any updates to the data need a full site deploy, even if the pages are rendered on-demand.

This means that content collections are not suitable for pages that update frequently. Instead, today these pages tend to access the APIs directly in the frontmatter. This works, but leads to a lot of boilerplate, and means users don't benefit from the simple, unified API that content loaders offer. In most cases users tend to individually create loader libraries that they share between pages.

This proposal introduces a new kind of loader that fetches data from an API at runtime, rather than build time. As with other content loaders, these loaders abstract the loading logic, meaning users don't need to understand the details of how data is loaded. These loaders can be distributed as node modules, or injected by integrations.

# Goals

- a new type of **live content loader** that is executed at runtime
- integration with user-facing `getEntry` and `getCollection` functions, allowing developers to use **a familiar, common API** to fetch data
- loader-specific **query and filters**, which a loader can define and pass to the API
- **type-safe** data and query options, defined by the loader as generic types
- support for user-defined **Zod schemas**, executed at runtime, to validate or transform the data returned by the loader.
- support for runtime **markdown rendering**, using a helper function provided in the loader context.
- optional **integration with [route caching](https://github.com/withastro/roadmap/issues/1140)**, allowing loaders to define cache tags and expiry times associated with the data which are then available to the user

# Non-Goals

- server-side caching of the data. Instead it would integrate with the route cache and HTTP caches to cache the full page response, or individual loaders could implement their own API caching.
- rendering of MDX or other content-like code. This isn't something that can be done at runtime.
- support for image processing, either in the Zod schema or Markdown. This is not something that can be done at runtime.
- loader-defined Zod schemas. Instead, loaders define types using TypeScript generics. Users can define their own Zod schemas to validate or transform the data returned by the loader, which Astro will execute at runtime.
- updating the content layer data store. Live loaders return data directly and do not update the store.
- support for existing loaders. They will have a different API. Developers could in theory use shared logic, but the loader API will be different

# Detailed Design

While the user-facing API is similar to the existing content loaders, the implementation is significantly different.

## Loader API

A live loader is an object with two methods: `loadCollection` and `loadEntry`. For libraries that distribute a loader, the convention for these will be for users to call a function that returns a loader object, which is then passed to the `defineCollection` function. This allows the user to pass in any configuration options they need. The loader object is then passed to the `defineCollection` function.

The `loadCollection` and `loadEntry` methods are called when the user calls `getCollection` or `getEntry`. They return the requested data from the function, unlike existing loaders which are responsible for storing the data in the content layer data store.

```ts
// storeloader.ts

export function storeLoader({ field, key }): LiveLoader {
  return {
    name: "store-loader",
    loadCollection: async ({ filter }) => {
      // ...
      return {
        entries: products.map((product) => ({
          id: product.id,
          data: product,
        })),
      };
    },
    loadEntry: async ({ filter }) => {
      // ...
      return {
        id: filter.id,
        data: product,
      };
    },
  };
}
```

## Loader execution

Existing content loaders are executed at build time, and the data is stored in the content layer data store, which is then available during rendering. The new live loaders are executed at runtime, and the data is returned directly.

The new `live.config.ts` file has similar syntax to the existing `content.config.ts` file, but it is compiled as part of the build process and included in the build so that it can be called at runtime.

## Filters

For existing collections, `getCollection` accepts an optional function to filter the collection. This filtering is performed in-memory on the data returned from the store. This is not an efficient approach for live loaders, which are likely to be making network requests for the data at request time. Loading all of the entries and then filtering them on the client would cause over-fetching, so it is preferable to filter the data natively in the API.

For this reason, the `getCollection` and `getEntry` methods accept a query object, which is passed to the loader `loadEntry` and `loadCollection` functions. This is an arbitrary object, the type of which is defined by the loader. The loader can then use this filter to fetch the data from the API, according to the API's query syntax. The `getEntry` function also has a shorthand syntax for querying a single entry by ID by passing a string that matches the existing `getEntry` syntax. This is passed to the loader as an object with a single `id` property.

## Type Safety

The `LiveLoader` type is a generic type that takes three parameters:

- `TData`: the type of the data returned by the loader
- `TEntryFilter`: the type of the filter object passed to `getEntry`
- `TCollectionFilter`: the type of the filter object passed to `getCollection`

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

export function storeLoader({
  field,
  key,
}): LiveLoader<Product, StoreEntryFilter, StoreCollectionFilter> {
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
export interface LiveDataEntry<
  TData extends Record<string, unknown> = Record<string, unknown>
> {
  /** The ID of the entry. Unique per collection. */
  id: string;
  /** The entry data */
  data: TData;
  /** Optional cache hints */
  cacheHint?: {
    /** Cache tags */
    tags?: string[];
    /** Maximum age of the response in seconds */
    maxAge?: number;
  };
}

export interface LiveDataCollection<
  TData extends Record<string, unknown> = Record<string, unknown>
> {
  entries: Array<LiveDataEntry<TData>>;
  /** Optional cache hints */
  cacheHint?: {
    /** Cache tags */
    tags?: string[];
    /** Maximum age of the response in seconds */
    maxAge?: number;
  };
}

export interface LoadEntryContext<TEntryFilter = undefined> {
  filter: TEntryFilter extends undefined
    ? {
        id: string;
      }
    : TEntryFilter;
}
export interface LoadCollectionContext<TCollectionFilter = undefined> {
  filter?: TCollectionFilter;
}
export interface LiveLoader<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TEntryFilter extends Record<string, unknown> | undefined = undefined,
  TCollectionFilter extends Record<string, unknown> | undefined = undefined
> {
  /** Unique name of the loader, e.g. the npm package name */
  name: string;
  /** Load a single entry */
  loadEntry: (
    context: LoadEntryContext<TEntryFilter>
  ) => Promise<LiveDataEntry<TData> | undefined>;
  /** Load a collection of entries */
  loadCollection: (
    context: LoadCollectionContext<TCollectionFilter>
  ) => Promise<LiveDataCollection<TData>>;
}
```

The user-facing `getCollection` and `getEntry` methods exported from `astro:content` will also be typed with these types, so that the user can call them in a type-safe way.

Users will still be able to define a Zod schema inside `defineCollection` to validate the data returned by the loader. If provided, this schema will also be used to infer the returned type of `getCollection` and `getEntry` for the collection, taking precedence over the loader type. This means that users can use the loader to fetch data from an API, and then use Zod to validate or transform the data before it is returned.

## Caching

The returned data is not cached by Astro, but a loader can provide hints to assist in caching the response. This would be designed to integrate with the proposed [route caching API](https://github.com/withastro/roadmap/issues/1140), but could also be used to manually set response headers. The scope of this RFC does not include details on the route cache integration, but will illustrate how the loader can provide hints that can then be used by the route cache or other caching mechanisms.

Loader responses can include a `cacheHint` object that contains the following properties:

- `tags`: an array of strings that can be used to tag the response. This is useful for cache invalidation.
- `maxAge`: a number that specifies the maximum age of the response in seconds. This is useful for setting the cache expiry time.

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
    maxAge: 60 * 60, // 1 hour
  },
};
```

This would allow the user to tag the response with the `products` and `clothes` tags, and set the expiry time to 1 hour. The user could then use these tags to invalidate the cache when the data changes.

The loader can also provide a `cacheHint` object for an individual entry, allowing fine-grained cache control:

```ts
return {
  id: filter.id,
  data: product,
  cacheHint: {
    tags: [`product-${filter.id}`],
    maxAge: 60 * 60, // 1 hour
  },
};
```

When the user calls `getCollection` or `getEntry`, the response will include a cache object that contains the tags and expiry time. The user can then use this information to cache the response in their own caching layer, or pass it to the route cache.

This example shows how cache tags and expiry time in the response headers:

```astro
---
import { getEntry } from "astro:content";
import Product from "../components/Product.astro";

const product = await getEntry("products", Astro.params.id);

Astro.response.headers.set("Cache-Tag", product.cacheHint.tags.join(","));
Astro.response.headers.set("CDN-Cache-Control", `s-maxage=${product.cacheHint.maxAge}`);
---
<Product product={product.data} />
```

# Testing Strategy

Much of the testing strategy will be similar to the existing content loaders, as integration tests work in the same way. It will also be easier to test the loaders in isolation, as they are not dependent on the content layer data store.

End-to-end tests will be added to test the bundling and runtime execution of the loaders.

Type tests will be added to ensure that the generated types are correct, and that the user can call the `getCollection` and `getEntry` methods with the correct types.

# Drawbacks

- This is a significant addition to the content collections API, and will work to implement and document.
- This is a new API for loader developers to learn, and existing loaders cannot be trivially converted. While the API and mental model are simpler than the existing content loaders, it is still a new API that will require some work for developers to implement.
- Unlike the content layer APIs, there will not be any built-in loaders for this API, so it will be up to the community to implement them. There will be limited value to this featured until there are a number of loaders available.
- The user-facing API is similar but not identical to the existing content loaders, which may cause confusion for users. The behavior is also different, as the data is not stored in the content layer data store. This means that users will need to understand the difference between the two APIs.

# Alternatives

- **Do nothing**: For regularly-updated data they will need to use any APIs directly in the frontmatter. This is the current approach, and while it works, it is not ideal. It means that users need to implement their own loading logic. This tends to involve a lot of boilerplate, and there is no common API for accessing the data.
- **Add support for updating the content layer data store at runtime**: This would allow users to update the data in the content layer data store, for example via a webhook. This would be significantly more complex and would require a lot of work to implement. It would also require users provision third-party database services to support this in a serverless environment.

# Adoption strategy

- This would be released as an experimental feature, with a flag to enable it.
- As live collections are defined in a new file, existing sites will not be affected by this change unless they add new collections that use it.

# Unresolved Questions

- The proposed **name of the file** is potentially confusing. While the name `live.config.ts` is analogous to the existing `content.config.ts` file, neither are really configuration files, and have more in common with actions or middleware files. Would it better to not use `config` in the name, or would that be confusing when compared to the existing file? Possible alternatives: `src/live.ts`, `src/live-content.ts`, `src/live-content.config.ts`, `src/content.live.ts`...

- The way to handle **rendering Markdown**, or even whether to support it. The most likely approach is to add a `renderMarkdown` helper function to the loader context that can be used to render Markdown to HTML, which would be stored in the `entry.rendered.html` field, similar to existing collections. This would allow use of the same `render()` function as existing collections. This would use a pre-configured instance of the renderer from the built-in `@astrojs/markdown-remark` package, using the user's Markdown config. This helper would be also likely be added to existing content layer loaders, as users have complained that is hard to do manually. This may be extending the scope too far, but it is a common use case for loaders. We may not want to encourage rendering Markdown inside loaders, as it could lead to performance issues. It may be confusing that image processing is unsupported, and nor is MDX.
