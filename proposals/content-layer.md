**If you have feedback and the feature is released as experimental, please leave it on the Stage 3 PR. Otherwise, comment on the Stage 2 issue (links below).**

- Start Date: 2024-07-23
- Implementation PR: https://github.com/withastro/astro/pull/11360
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/946
- Stage 3 PR: <!-- related roadmap PR, leave it empty if you don't have a PR yet -->

# Summary

Creates a successor to content collections with expanded use cases and improved performance.

# Example

Collections are defined using a new `loader` property. There are built-in `file` and `glob` loaders, which load data and content from the filesystem, and users can define their own loaders.

```ts
// src/content/config.ts
import { defineCollection, z } from "astro:content";
import { glob, file } from "astro/loaders";
// Loaders can be distributed as packages
import { feedLoader } from "@ascorbic/feed-loader";

// The `glob()` loader loads multiple files, with one entry per file
const spacecraft = defineCollection({
  type: "experimental_content",
  loader: glob({ pattern: "*.md", base: "src/data/spacecraft" }),
  // A schema is optional, but provides validation and type safety for data.
  // It can also be used to transform data before it is stored.
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      heroImage: image().optional(),
    }),
});

// The `file()` loader loads multiple entries from one file
const dogs = defineCollection({
  type: "experimental_data",
  loader: file("src/data/dogs.json"),
  schema: z.object({
    id: z.string(),
    breed: z.string(),
    temperament: z.array(z.string()),
  }),
});

// Custom loaders can be defined inline or imported from packages
const podcasts = defineCollection({
  type: "experimental_content",
  loader: feedLoader({
    url: "https://feeds.99percentinvisible.org/99percentinvisible",
  }),
  // A loader can provide its own schema, but a user-defined schema will override it.
});

export const collections = { spacecraft, dogs, podcasts };
```

This is then used in Astro pages in the same way as current content collections.

# Background & Motivation

Content collections are a key primitive that brings people to Astro. Content Collections make it easy to work with local content (MD, MDX, Markdoc, etc) inside of your Astro project. They give you structure (`src/content/[collection-name]/*`), schema validation for frontmatter, and querying APIs. However they are limited in a few ways:

- They can only be used with local data
- The data must be in a specific location in the project
- Large collections can be slow to load and use a lot of memory. They can also take up a lot of space when bundling for server deployment. This places an upper limit on the number of entries that can be practically included in a collection.

Content layer is designed to be a successor to content collections that addresses these limitations and opens up more use cases. It is inspired by the Gatsby data layer, but with a simpler API and no GraphQL or graph data store.

# Goals

- Create a successor to content collections that can be used with local and remote data.
- Decouple content from Vite, so that data is no longer implemented as Rollup chunks.
- Provide a simple API for defining collections with a migration path from content collections.
- Support local files in user-defined locations with built-in file and glob loaders.
- Initially support Markdown rendering and JSON data for local files, with support for other formats in the future.
- Provide an API for defining custom loaders that is powerful enough to handle a wide range of use cases, including CMS integrations.
- Provide a higher-level API for simple inline loaders.
- Make the API scalable to tens of thousands of entries, with good performance and low memory usage.
- Allow loaders to define their own schemas, including dynamic schemas that can be introspected from the data source.

# Non-Goals

- Non-goal: allowing loaders to define multiple collections automatically. e.g. separate collections would need to be manually defined for posts and categories in a blog.
- Non-goal: dependency tracing for entries.
- Out of scope: hot-reloading remote data.
- Out of scope: rendering markdown from remote data. A loader could store rendered HTML, but it would be up to the loader to handle this.
- Out of scope: custom `Content` components.
- Future: support for Markdoc and MDX rendering.
- Future: SQLite-based backend for collections.
- Future: support for queries more complex than get by ID.

# Detailed Design

## Collection Definition

Collections are defined in a similar way to current content collections, using `defineCollection()` in `src/content/config.ts`. There are two new collection types: `experimental_content` and `experimental_data`. The only difference between them is that when a collection is defined as `experimental_content`, entries will have a `render()` method that generates a component for rendering HTML content. This requires the loader to have set the `rendered.html` property.

The `reference()` helper can be used in the same way as content collections, to reference other collections.

## Built-in loaders

There are two built-in loaders: `file()` and `glob()`, which load data from the local filesystem. The `glob()` loader covers the current use case of directories full of markdown or JSON content. The `glob()` helper is more flexible than in current content collections, as it can load data from anywhere on the filesystem. The `file()` loader loads multiple entries from a single file. Both loaders can process markdown in the same way as content collections. They can also extract images in the same way as content collections.

```ts
const spacecraft = defineCollection({
  // The glob loader can be used for either markdown files (defined as experimental_content) or JSON files (defined as experimental_data).
  type: "experimental_content",
  // The pattern is any valid glob pattern. It is relative to the "base" directory.
  // "base" is optional and defaults to the project root. It is defined relative to the project root, or as an absolute path.
  loader: glob({ pattern: "*.md", base: "src/data/spacecraft" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      heroImage: image().optional(),
    }),
});

const dogs = defineCollection({
  type: "experimental_data",
  // The file loader loads a single file which contains multiple entries. The path is relative to the project root, or an absolute path.
  // The data must be an array of objects, each with a unique `id` property, or an object with IDs as keys and entries as values.
  loader: file("src/data/dogs.json"),
  schema: z.object({
    id: z.string(),
    breed: z.string(),
    temperament: z.array(z.string()),
  }),
});
```

## Custom loaders

The new collection `loader` property is required, and supports two different loader APIs:

### High-level API

A loader is an async function that returns an array of entries. This higher-level API is useful for defining custom loaders inline that don't need access to features such as incremental updates, content digests, or caching.

```ts
const dogs = defineCollection({
  type: "experimental_data",
  loader: async () => {
    const response = await fetch("https://restcountries.com/v3.1/all");
    const data = await response.json();
    // Must return an array of entries with an id property,
    // or an object with IDs as keys and entries as values
    return data.map((country) => ({
      id: country.cca3,
      ...country,
    }));
  },
});
```

### Low-level API

For advanced loaders, the low-level API provides more control over the loading process. The loader is in control of adding entries to the data store, and has access to various helper tools. It can define its own schema, including generating it dynamically.

The loader is an object with a `load` method and optional `schema` property. The recommended pattern is to define a function that accepts configuration options and returns the loader object.

```ts
import type { Loader } from "astro/loaders";
import { ItemSchema, type Item } from "./schema.js";
import { parseFeed } from "./feed.js";

export interface FeedLoaderOptions {
  /** URL of the feed */
  url: URL | string;
}

export function feedLoader({ url }: FeedLoaderOptions): Loader {
  const feedUrl = new URL(url);
  return {
    name: "feed-loader",
    // The load method is called to load data
    load: async ({ store, logger, parseData, meta }) => {
      logger.info("Loading posts");

      // The meta store is used to store metadata, such as sync tokens
      // etags or last-modified times. It is persisted between builds.
      const lastModified = meta.get("last-modified");

      // Make a conditional request for the feed
      const headers = lastModified ? { "If-Modified-Since": lastModified } : {};

      const res = await fetch(feedUrl, { headers });

      // If the feed hasn't changed, you do not need to update the store
      if (res.status === 304) {
        logger.info("Feed not modified, skipping");
        return;
      }
      if (!res.ok || !res.body) {
        throw new Error(`Failed to fetch feed: ${res.statusText}`);
      }

      // Store the last-modified header in the meta store so we can
      // send it with the next request
      meta.set("last-modified", res.headers.get("last-modified"));

      const feed = parseFeed(res.body);

      // If the loader doesn't handle incremental updates, clear the store before inserting new entries
      store.clear();

      for (const item of feed.items) {
        // The parseData helper uses the schema to validate and transform data
        const data = await parseData({
          id: item.guid,
          data: item,
        });

        store.set({
          id,
          data,
          // If the data source provides HTML, it can be set in the `rendered` property
          // This will allow users to use the `<Content />` component in their pages to render the HTML.
          rendered: {
            html: data.description ?? "",
          },
        });
      }
    },
    // A loader can optionally provide its own Zod schema. This can be static, or it can be an async function
    // that returns a schema. This allows an API to use introspection to determine the schema.
    schema: ItemSchema,
  };
}
```

### The data store

Each loader is provided with a data store object. This is an in-memory key/value store, scoped to that loader and is used to store entries. The store is persisted to disk between builds, so loaders can handle incremental updates.
The store has the following methods:

```ts
export interface ScopedDataStore {
  get: (key: string) => DataEntry | undefined;
  entries: () => Array<[id: string, DataEntry]>;
  /**
   * Sets an entry in the store. Returns true if the entry was added or updated,
   * or false if the entry was not changed.
   */
  set: (opts: {
    /** The ID of the entry. Must be unique per collection. */
    id: string;
    /** The data to store. Any JSON-serializable object */
    data: TData;
    /** The raw body of the content, if applicable. */
    body?: string;
    /** The file path of the content, if applicable. Relative to the site root. */
    filePath?: string;
    /** An optional content digest, to check if the content has changed. */
    digest?: number | string;
    /** The rendered content, if applicable. */
    rendered?: RenderedContent;
  }) => boolean;
  values: () => Array<DataEntry>;
  keys: () => Array<string>;
  delete: (key: string) => void;
  clear: () => void;
  has: (key: string) => boolean;
}
```

### The meta store

Each loader is provided with a meta store object. This is a key/value store, scoped to that loader and is used to store metadata. This data isn't available to pages, but is instead used to store information such as sync tokens, etags, or last-modified times. The meta store has the following methods:

```ts
export interface MetaStore {
  get: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  has: (key: string) => boolean;
  delete: (key: string) => void;
}
```

## Using the data

The data is accessed in the same way as content collections, using the `getCollection()` or `getEntry()` functions.

```astro
---
// src/pages/spacecraft/[id].astro
import type { GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { Image } from "astro:assets";

export const getStaticPaths: GetStaticPaths = async () => {
  const collection = await getCollection("spacecraft");
  if (!collection) return [];
  return collection.map((craft) => ({
    params: {
      id: craft.id,
    },
    props: {
      craft,
    },
  }));
}

const { craft } = Astro.props;

// If a collection is defined as `experimental_content` and the loader has set the `rendered.html` property,
// the entry will have a `render()` method that generates a component for rendering HTML content.
// The raw HTML can also be accessed with `craft.rendered.html`.
// If it is markdown, the frontmatter and headings will be available as properties on `rendered.metadata`.
const { Content } = await craft.render();
---

<h1>{craft.data.title}</h1>

<Content />

```

# Testing Strategy

- Integration tests for the built-in loaders, covering markdown and JSON data.
- Integration tests for image handling in markdown.
- Integration tests for rendering components from markdown.
- Integration tests for custom loaders, covering incremental updates and schema validation.
- Unit tests for the data store and meta store.

# Drawbacks

- A lot of the performance benefits will not be available for MDX, as that is code that is executed at runtime rather than content that can be pre-rendered and persisted in the store.
- The DX for loading data from APIs is already good, so it may be harder to show the benefits (mostly the ability to cache and query the data locally, and persist it between builds).

# Alternatives

- We could keep content collections with the current scope of local content, but add support for custom directories and multiple entries per file.

# Adoption strategy

- New collections can be defined alongside existing content collections by setting the `type` property to `experimental_content` or `experimental_data`.

# Unresolved Questions

The implementation of MDX is currently uncertain. It is a key feature of Astro, but cannot be handled in the same way as markdown. MDX is more like code than content, so it's harder to prerender. This removes some of the most important performance benefits of the content layer, as the entries still need to be handled by Vite at runtime. The minimum requirement is that `glob()` supports MDX but the implementation is the same as today under the hood. This would allow users to use MDX in the same way as markdown, but without the performance benefits. The ideal solution would be to find a way to pre-render MDX content and persist it in the store, but this is a much bigger challenge.
