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

- Start Date: 2026-11-02
- Reference Issues: https://github.com/withastro/roadmap/discussions/1440, https://github.com/withastro/roadmap/discussions/1385
- Implementation PR: https://github.com/withastro/astro/pull/18576 (collection storage, stacked PRs)
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1448
- Stage 3 PR: https://github.com/withastro/roadmap/pull/1459

# Summary

Two additions to build-time content collections:

- **Collection storage**: a collection can keep its entries in a storage driver (e.g. SQLite) instead of the data store bundled with the site, so entries are read one at a time at runtime instead of being held in memory.
- **Collection metadata**: runtime code and integrations can list the collections a project defines, and learn facts about them, without knowing their names in advance.

# Example

Storing a large collection in SQLite, while a small one stays bundled:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';

export default defineConfig({
  experimental: {
    collectionStorageDrivers: true,
  },
});
```

```ts
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { sqlite } from '@astrojs/collection-storage-sqlite';
import { z } from 'astro/zod';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/docs' }),
  schema: z.object({ title: z.string() }),
  storage: sqlite({ url: 'libsql://docs-example.turso.io', authTokenEnv: 'DOCS_DATABASE_TOKEN' }),
});

const authors = defineCollection({
  loader: file('src/data/authors.json'),
  schema: z.object({ name: z.string() }),
  // no `storage`: bundled with the site, as today
});

export const collections = { docs, authors };
```

Reading only what a page needs:

```astro
---
// src/pages/docs/[...id].astro
import { getCollection, getEntry, render } from 'astro:content';

export async function getStaticPaths() {
  // Entries without `body` and `rendered`
  const docs = await getCollection({ name: 'docs', content: false });
  return docs.map((doc) => ({ params: { id: doc.id } }));
}

const entry = await getEntry('docs', Astro.params.id);
const { Content } = await render(entry);
---

<Content />
```

Finding collections by what they are rather than what they're called. A library's loaders mark the role each collection plays:

```ts
// a library's loaders
export function docsLoader(): Loader {
  return {
    name: 'starlight-docs-loader',
    descriptors: { starlight: 'docs' },
    load: async (context) => {
      // ...
    },
  };
}

export function i18nLoader(): Loader {
  return {
    name: 'starlight-i18n-loader',
    descriptors: { starlight: 'i18n' },
    load: async (context) => {
      // ...
    },
  };
}
```

The library then finds them by role, whatever the user named them:

```ts
// inside the library's injected route
import { getCollectionsMetadata, getCollection } from 'astro:content';

const collections = (await getCollectionsMetadata()).filter((c) => c.type === 'build-time');
const docs = collections.filter((c) => c.descriptors.starlight === 'docs');
const i18n = collections.filter((c) => c.descriptors.starlight === 'i18n');

for (const { name } of docs) {
  const entries = await getCollection({ name, content: false });
  // ...
}
```

# Background & Motivation

Build-time content collections are serialized into a single data store that ships inside the build. At runtime, the first call to `getCollection()` or `getEntry()` loads the whole store into memory and keeps it there for the life of the process. This has two consequences:

- **Server-rendered sites hold every collection in memory.** A site with tens of thousands of entries pays for all of them on every server instance, even when a request renders a single page. The store is also inlined in the server bundle, which grows with the content.
- **Prerendering holds every collection in memory.** The same store backs prerendering, so build memory grows with the size of the content, whether or not a page needs it.

The [content layer RFC](./0051-content-layer.md) already listed "SQLite-based backend for collections" as future work for this reason.

Separately, runtime code can only reach a collection by its name. Code that doesn't own the content config can't discover what collections exist. Starlight has to require a collection named `docs`, and an integration can't inject routes for "every collection" without hacks ([#1385](https://github.com/withastro/roadmap/discussions/1385)).

# Goals

- Collections don't occupy memory at runtime (prerendering and SSR): pages read the entries they use, one at a time.
- Entries of a collection that uses a storage driver are not inlined in the server bundle.
- Storage is chosen per collection, so small collections can stay bundled while large ones use a driver.
- Third parties can write storage drivers against a small, documented contract.
- Existing loaders work with any storage, unchanged.
- A way to read entries without their `body` and `rendered` content.
- An API that lists the collections a project defines, with facts about each, without loading entries.
- A way for loaders and users to attach serializable descriptors to a collection, so other code can recognize it without knowing its name.

# Non-Goals

- Changing the semantics of content collections. A collection is still a snapshot of the content at build time, and `getCollection()` without options still returns the whole collection, content included.
- Reusing data between builds. Every build writes its collections from scratch, whatever the storage.
- Changing collection data after deploy. That is the role of [live collections](./0055-live-content-loaders.md).
- Declaring live collections in `content.config.ts`. A live collection still needs a separate module that is bundled with the server, which is what `live.config.ts` already is.
- Storing compiled MDX or `deferRender` modules in a storage driver. They are code, and stay bundled.
- A query API. Drivers can't filter on entry data, and `getCollection()` filters still run in JavaScript.
- Reducing memory during sync. Loaders keep writing to the in-memory store.

# Detailed Design

This RFC has two parts, each behind its own experimental flag: [collection storage](#collection-storage) and [collection metadata](#collection-metadata). They don't depend on each other.

## Terminology

- **Build-time collection**: a collection declared in `content.config.ts` whose entries are loaded during sync by a loader's `load()`.
- **Live collection**: a collection declared in `live.config.ts` whose entries are fetched at request time.
- **Collection storage**: where a build-time collection's entries are kept between sync and runtime. Chosen per collection.
- **Bundled store**: the default collection storage: the data store that ships inside the build, as today.
- **Storage driver**: the implementation behind a collection storage other than the bundled store.
- **Snapshot**: the entries one build wrote to a collection storage.
- **Collection metadata**: facts about a collection (name, kind, loader, descriptors, schema), never its entries.
- **Collection descriptor**: a serializable value a loader or user attaches to a collection so other code can recognize it.

## Collection storage

### Configuration

The feature is enabled with a flag:

```js
// astro.config.mjs
export default defineConfig({
  experimental: {
    collectionStorageDrivers: true,
  },
});
```

The existing `experimental.collectionStorage` option (`'single-file'` / `'chunked'`) is unrelated: it controls the format of the bundled store, and keeps working for the collections that stay in it.

A build-time collection opts into a storage driver with the `storage` option:

```ts
defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/docs' }),
  storage: sqlite({ url: 'libsql://docs-example.turso.io' }),
});
```

`storage` is only accepted on build-time collections. When it is omitted, the collection uses the bundled store. Setting `storage` while `experimental.collectionStorageDrivers` is disabled throws an `AstroError` when the content config is loaded, instead of silently falling back to the bundled store.

### Storage descriptors

`content.config.ts` is not part of the server bundle, so the value passed to `storage` can't be a driver instance: it must survive serialization into the build. A driver package exports a function returning a **storage descriptor**:

```ts
interface CollectionStorageDescriptor<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  /** URL or package specifier of a module whose default export creates the driver. */
  entrypoint: string | URL;
  /** Options passed to the driver factory. Must be JSON-serializable. */
  config?: TConfig;
}
```

```ts
// @astrojs/collection-storage-sqlite
export function sqlite(config: SqliteConfig): CollectionStorageDescriptor<SqliteConfig> {
  return {
    entrypoint: new URL('./driver.js', import.meta.url),
    config,
  };
}
```

Collections sharing the same descriptor share a driver and a snapshot.

`config` is written into the server bundle, so it must never contain secrets. Drivers read credentials themselves, with `getSecret()` from `astro:env/server` (for example, the SQLite driver reads an auth token this way), so a token is never baked into the build output.

Astro loads drivers through Vite wherever they run: during sync, with the Vite runner that loads the content config, and at runtime, bundled with the server. Entrypoints resolve from the project root, and drivers can import virtual modules such as `astro:env/server` in both places. The server build bundles a driver's dependencies, unless the project can resolve them itself: a dependency that loads a native binding, such as libSQL, must be a direct dependency of the project, so it stays external and can find its binding.

The entrypoint is resolved separately in each Vite environment that loads it. A driver package can use [`exports` conditions](https://nodejs.org/api/packages.html#conditional-exports) to provide a Node implementation for sync and a different one for a runtime such as `workerd`, without any Astro-specific API.

### The driver contract

The entrypoint's default export is a factory:

```ts
type CollectionStorageDriverFactory<TConfig> = (
  config: TConfig | undefined,
) => CollectionStorageDriver | Promise<CollectionStorageDriver>;

interface CollectionStorageDriver {
  /**
   * Returns the ID of the snapshot a build is about to write.
   * When omitted, Astro generates a random ID.
   */
  createSnapshotId?(): string | Promise<string>;

  /** Opens a snapshot for writing. Called during sync. */
  openWriter(context: { snapshot: string }): Promise<CollectionStorageWriter>;

  /** Opens a snapshot for reading. Called while prerendering and at runtime. */
  openReader(context: { snapshot: string }): Promise<CollectionStorageReader>;
}

interface CollectionStorageWriter {
  /** Writes every entry of a collection. Called at most once per collection per snapshot. */
  write(collection: string, entries: AsyncIterable<StoredEntry>): Promise<void>;
  /** Makes the snapshot readable. Nothing written before `commit()` resolves may be visible to a reader. */
  commit(): Promise<void>;
}

interface CollectionStorageReader {
  get(collection: string, id: string, options: { content: boolean }): Promise<StoredEntry | undefined>;
  entries(collection: string, options: { content: boolean }): AsyncIterable<StoredEntry>;
}

interface StoredEntry {
  id: string;
  /** Every field of the entry except `body` and `rendered`, serialized by Astro. */
  metadata: string;
  /** The entry's `body` and `rendered` fields, serialized by Astro. Omitted when `content` is `false`. */
  content?: string;
}
```

Drivers store `metadata` and `content` as opaque strings. Astro owns their format, and a server only reads the snapshot its build wrote, with the same version of Astro, so the format can change between versions without breaking drivers. Splitting the two is what makes [`{ content: false }`](#reading-entries-without-content) cheap: a driver can skip loading `content` entirely.

The contract is deliberately small. There is no per-entry `set`, `delete`, or `clear`: a snapshot is written once, in full, and then only read.

### Snapshots

At runtime, a server reads only the snapshot its own build wrote, never newer data. The build already freezes things the entries depend on (the image import map, compiled MDX modules), so reading newer data could point at assets that don't exist in the deployed build. It would also let deployments sharing one storage, such as a production deploy and a deploy preview, overwrite each other's content.

At the start of each build, Astro obtains a snapshot ID, from `createSnapshotId()` when the driver implements it or by generating a random one. The ID is passed to `openWriter()` during sync and to `openReader()` when reading. Sync records it next to the driver's entrypoint and config, and both are bundled with the server, so the deployed server reads the same snapshot. Users can't set it.

What a driver does with the ID depends on where it keeps data:

- A driver that writes its data into the build output (for example, a local SQLite file shipped with the server) can ignore the ID: each build produces new files.
- A driver backed by a shared remote database uses the ID to keep snapshots apart, for example as a namespace or table prefix. A driver can implement `createSnapshotId()` to align snapshots with its platform's deployment IDs.

Removing old snapshots is the driver's or the user's responsibility. Astro never deletes snapshots.

### Sync

Loaders are unchanged. During sync, every loader writes to the same synchronous, in-memory store as today, whatever the collection's storage. When sync finishes, Astro:

1. Opens a writer for the build's snapshot with each storage driver in use.
2. Writes every collection that has a storage driver, then calls `commit()`.
3. Leaves those collections out of the bundled store.

Reference validation, image imports, and content module imports are computed from the in-memory store, as today, so they work the same for every storage.

Because collections are written in full at the end of sync, every build writes a fresh snapshot. No data is reused from a previous build. The in-memory store is still cached between builds as today, so loaders keep their incremental behavior.

### Reading entries

`getCollection()`, `getEntry()`, `getEntries()`, `render()` and `reference()` work the same for every storage. For a collection with a storage driver, Astro creates the driver and opens a reader for the snapshot of its build on the first read, once per process, and:

- `getEntry()` reads one entry with `reader.get()`.
- `getCollection()` reads every entry with `reader.entries()`, then applies the filter in JavaScript. As today, the whole collection is returned.
- `render()` uses the entry's `rendered` HTML, or the bundled content module for MDX and `deferRender` entries, as today.

Images referenced by entries are resolved through the bundled image import map, as today.

### Reading entries without content

`getEntry()` and `getEntries()` accept a `content` option. `getCollection()` accepts it in a query object, alongside the `name` of the collection and an optional `filter`, so callers without a filter don't pass `undefined` in its place. `getCollection(collection, filter?)` keeps working as today. With `content: false`, entries are returned without `body` and `rendered`:

```ts
const docs = await getCollection({
  name: 'docs',
  filter: ({ data }) => !data.draft,
  content: false,
});
const doc = await getEntry('docs', 'intro', { content: false });
const related = await getEntries(doc.data.related, { content: false });
```

The return type omits `body` and `rendered`. Passing such an entry to `render()` throws an `AstroError`, including for MDX and `deferRender` entries, which could be rendered without their content. This can be relaxed later without breaking anyone.

The option works for every storage, including the bundled store. With a storage driver, it means the driver never loads the content, so a `getStaticPaths()` that lists IDs doesn't pull every entry's HTML into memory.

### Development

`astro dev` uses storage drivers too, so driver and runtime problems (for example, a driver that only works in Node used with the Cloudflare adapter) surface during development rather than after deploying.

After each sync, and after each change loaders make to the store outside of a sync (for example when a watched file changes), Astro writes every collection with a storage driver to a new snapshot, commits it, and switches readers to it. A snapshot has to be complete, and the contract can't copy collections from the previous one, so unchanged collections are written again. HMR otherwise works as today. Rewriting collections on every change is slower than updating the in-memory store, which is an accepted cost for the experimental phase.

### `@astrojs/collection-storage-sqlite`

A first-party driver backed by [libSQL](https://github.com/tursodatabase/libsql), which covers local SQLite files and remote Turso databases:

```ts
type SqliteConfig = {
  /** `file:` followed by the path of a local SQLite file, or the `libsql://` or `https://` URL of a remote database. */
  url: string;
  /** Name of the environment variable holding the auth token of a remote database. */
  authTokenEnv?: string;
};
```

Snapshots share two tables: entries belong to a snapshot, and a snapshot is listed in a snapshots table only once its writer committed it, so a reader refuses to open an uncommitted snapshot. Entries are written and read in pages. The driver reads the auth token with `getSecret()` from `astro:env/server` when it starts, at build time, where it can come from a `.env` file, and at runtime.

`@libsql/client` is a peer dependency that projects install alongside the driver. It loads a native binding, which only works when the server build keeps it external, and the build only does so for dependencies of the project.

The package only ships a Node implementation, used during sync and by Node servers. It doesn't ship a web version: runtimes without Node APIs, such as Cloudflare Workers, are expected to use a driver built for them, for example a D1 driver shipped by the Cloudflare adapter.

## Collection metadata

### Configuration

```js
// astro.config.mjs
export default defineConfig({
  experimental: {
    collectionMetadata: true,
  },
});
```

### `getCollectionsMetadata()`

A new `astro:content` export returns metadata for every collection the project defines, build-time and live, without loading any entries:

```ts
function getCollectionsMetadata(): Promise<CollectionMetadata[]>;

interface CollectionMetadata {
  name: string;
  type: 'build-time' | 'live';
  loader: { name: string };
  /** Descriptors from the loader and from the collection config, the latter taking precedence. */
  descriptors: Record<string, JSONValue>;
  /** JSON Schema of the collection's schema, when its validator can produce one. */
  schema?: JSONSchema;
}
```

Build-time collections come first, in the order they are defined, then live collections. Collections defined with an inline loader function have `loader.name` set to `'inline'`. Each call returns new copies, so changing the result doesn't affect other callers. Calling it while `experimental.collectionMetadata` is disabled throws an `AstroError`.

The `CollectionMetadata` type of `astro:content` is a union on `type`, where `name` is the name of a build-time or a live collection. Code that passes `name` to `getCollection()` filters on `type` first:

```ts
const docs = (await getCollectionsMetadata())
  .filter((c) => c.type === 'build-time')
  .filter((c) => c.descriptors.starlight === 'docs');

for (const { name } of docs) {
  await getCollection(name);
}
```

`CollectionMetadata` is plain, serializable data: the same object is passed to integrations and Markdown plugins (see [Integrations and Markdown plugins](#integrations-and-markdown-plugins)). To read a collection's entries, pass its `name` to `getCollection()` or `getLiveCollection()`, depending on `type`.

It deliberately doesn't say which storage a collection uses: reading entries works the same either way.

The function is async so that metadata can be served from wherever Astro stores it without changing the API.

### Collection descriptors

Listing collection names alone doesn't let code use a collection it doesn't own: it still has to know what the entries look like. Descriptors let the code that defines a collection's shape, typically a library's loader, mark the collection so that the same library can recognize it later, whatever the user named it.

Loaders, both build-time and live, can declare descriptors:

```ts
export function docsLoader(): Loader {
  return {
    name: 'starlight-docs',
    descriptors: { starlight: 'docs' },
    load: async (context) => {
      // ...
    },
  };
}
```

Users can add or override descriptors on any collection, with `defineCollection()` or `defineLiveCollection()`:

```ts
defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/guides' }),
  descriptors: { starlight: 'docs' },
});
```

The loader's and user's descriptors are shallow-merged, the user's taking precedence: a user descriptor replaces the loader's value for the same key entirely. Libraries should use a single key as their namespace (e.g. `starlight`) and put the collection's role in its value, so one library can mark several kinds of collections and two libraries don't collide. Values must be JSON-serializable: Astro validates build-time collections when the content config is loaded, and live collections when `getCollectionsMetadata()` is called. Descriptors are ignored while `experimental.collectionMetadata` is disabled, so a library can set them on its loaders whether or not its users enable the flag.

Descriptors come from loaders and `defineCollection()` rather than from schemas: with the [validators RFC](https://github.com/withastro/roadmap/pull/1438), a schema can come from any validator, so there is no portable way for a schema to carry a marker.

#### Types

Descriptors are typed with generics, like the data of live loaders. `Loader` and `LiveLoader` take a `TDescriptors` parameter, so a loader's descriptors are checked and autocompleted against the type its author declares:

```ts
export function docsLoader(): Loader<{ starlight: 'docs' }> {
  return {
    name: 'starlight-docs',
    descriptors: { starlight: 'docs' }, // `{ starlight: 'dosc' }` is a type error
    load: async (context) => {
      // ...
    },
  };
}
```

`defineCollection()` and `defineLiveCollection()` keep the literal types of the descriptors they are given. `astro sync` then generates the `CollectionMetadata` type of `astro:content` as a union with one member per collection, whose `descriptors` combine the types of its loader's and its config's descriptors, the latter taking precedence:

```ts
type CollectionMetadata =
  | { name: 'docs'; type: 'build-time'; loader: { name: string }; descriptors: { starlight: 'docs' } }
  | { name: 'products'; type: 'live'; loader: { name: string }; descriptors: { shop: true } };
```

The type of `descriptors` also has an index signature, so code can read a key on every collection, including collections that don't set it: `c.descriptors.starlight` is `'docs'` for a collection known to set it, and `JSONValue | undefined` otherwise. Comparing a nested key, as in `c.descriptors.starlight === 'docs'`, doesn't narrow the union to the matching collections, so code that needs their exact types narrows on `name` or `type` first.

### Schemas

When a collection's schema implements [Standard JSON Schema](https://standardschema.dev/json-schema), `CollectionMetadata.schema` holds its JSON Schema, generated with the same options the validators RFC uses for data collection `.schema.json` files. It is omitted when the collection has no schema or its validator doesn't implement the spec.

This depends on the validators RFC, and will be implemented once it lands. Generating it with Zod's `z.toJSONSchema()` in the meantime would be misleading, since schemas won't be limited to Zod.

### Integrations and Markdown plugins

Some consumers need collection metadata before `astro:content` is available. For example, Starlight's Markdown plugins run during sync. Two additions cover them:

- A new integration hook, `astro:collections:resolved`, called with the metadata of the build-time collections after the content config is loaded and before any loader runs, and again in development when the content config changes. Live collections aren't included, because `live.config.ts` is not loaded during sync:

  ```ts
  'astro:collections:resolved': (options: {
    collections: CollectionMetadata[];
    logger: AstroIntegrationLogger;
  }) => void | Promise<void>;
  ```

- Markdown plugins (remark, rehype, and Sätteri) receive the metadata of the collection being rendered as `file.data.astro.collection` (`ctx.data.astro.collection` in Sätteri). It is set wherever Astro renders an entry's Markdown:
  - for Markdown rendered by `glob()` during sync;
  - for Markdown rendered with `renderMarkdown()` in custom loaders;
  - for MDX entries and `deferRender` entries, which are compiled as modules. Sync records the collection of each of these files, and the MDX and Markdown Vite plugins look it up when compiling them. A file loaded by more than one collection is compiled once for all of them, so its collection is left `undefined`. In development, the modules of a file are compiled again when its collection changes.

  It is `undefined` for Markdown outside collections, and for live collections, whose loaders render their own content.

  This adds an optional `collection` to the options of a Markdown processor's `render()`, an optional fourth argument to an MDX renderer's `process()`, and an optional second argument to `ContentEntryRenderFunction`. Third-party processors that ignore them keep working.

# Testing Strategy

- Unit tests for the storage descriptor validation, the entry serialization format, snapshot ID handling, and `{ content: false }` typing and runtime behavior.
- A conformance suite for driver authors, `createStorageDriverTests()` from `astro/content/storage-driver-tests`. It returns test cases independent of any test runner, and runs against `@astrojs/collection-storage-sqlite` and a test-only in-memory driver. It checks that a snapshot isn't readable before `commit()`, that snapshots and collections stay separate, and that `get()` and `entries()` return what was written, with and without content.
- Integration tests with fixtures mixing bundled and stored collections, for static builds, server builds and `astro dev`, including references, images, and MDX entries in stored collections.
- An integration test checking that stored entries are not inlined in the server bundle.
- An integration test with the Cloudflare adapter, reading a stored collection from `workerd`.
- Unit and integration tests for `getCollectionsMetadata()`, descriptor merging and validation, the `astro:collections:resolved` hook, and the collection given to Markdown plugins for `glob()`, `renderMarkdown()`, MDX and `deferRender` entries, including files loaded by several collections and recompilation in development.
- Once the validators RFC lands, tests for JSON Schema generation across validators.

# Drawbacks

- **Two places for entries.** Debugging a collection now depends on its storage, and a driver is one more moving part in a deployment.
- **Slower development with large stored collections.** Each change rewrites every collection with a storage driver to a new snapshot.
- **Every sync writes a snapshot.** `astro sync` and `astro check` run the content sync, so they write a snapshot too.
- **Rendered HTML can keep stale descriptors.** Markdown rendered by `glob()` is cached between builds, and only rendered again when the content config, the Astro config or the Astro version changes. When a library updates the descriptors of its loader, cached entries keep the previous `collection` in their Markdown plugins' data until one of those changes.
- **Snapshots accumulate.** Remote drivers keep one snapshot per build, and Astro doesn't clean them up.
- **Partial benefit for MDX-heavy sites.** Compiled MDX and `deferRender` modules stay in the bundle, so sites where most entries are MDX gain less.
- **Sync memory is unchanged.** Large collections still need to fit in memory during sync.
- **Descriptors are a convention, not a contract.** Recognizing a collection by descriptor only works if the library that defines it and the library that reads it agree on the descriptor.

# Alternatives

- **One project-wide driver, with `storage: 'external'` per collection.** Proposed in [#1440](https://github.com/withastro/roadmap/discussions/1440). Rejected because it forces every non-bundled collection onto the same backend.
- **Reading whatever the storage holds at request time.** Lets content change without rebuilding, but the deployed build's images and content modules can't follow, and deployments sharing a storage overwrite each other. Changing content after deploy is what live collections are for.
- **An async store for loaders, writing straight to the driver during sync.** Reduces sync memory, but every loader has to opt in and branch on the kind of store, and built-in loaders need storage-specific variants. Streaming writes can be added later without changing the loader API.
- **Declaring live collections in `content.config.ts`**, pointing each one at an entrypoint module. Explored and abandoned: it still requires a separate module per live collection, which is what `live.config.ts` is.
- **Exposing schemas as validator objects, or detecting collections by inspecting their schema.** Schema objects aren't serializable, and can't be passed to integrations or plugins. Detecting a collection by the shape of its schema can't tell what a field means, which is why this RFC uses descriptors instead.
- **A `get()` method on `CollectionMetadata`**, returning the collection's entries. See [Unresolved Questions](#unresolved-questions).
- **Doing nothing.** Large server-rendered sites keep holding every collection in memory, and libraries keep requiring fixed collection names.

# Adoption strategy

Both parts ship behind experimental flags and are opt-in:

- `experimental.collectionStorageDrivers` enables the `storage` option and the `content` option of the read functions.
- `experimental.collectionMetadata` enables `getCollectionsMetadata()`, collection descriptors, the `astro:collections:resolved` hook and `file.data.astro.collection`.

Neither is a breaking change. Collections without `storage` behave exactly as today, and existing loaders work with stored collections without changes. Adopting storage for a collection is a one-line change in the content config, plus `{ content: false }` where pages only need entry data.

Libraries such as Starlight can adopt descriptors through their own loaders, and progressively stop requiring fixed collection names.

# Unresolved Questions

- **A `get()` method on `CollectionMetadata`.** Returning a collection's entries from its metadata is convenient, but calling it in a loop loads every collection into memory, and a method makes the metadata non-serializable. It will be explored during the experimental phase, and only added if it supports `{ content: false }` and integrations still receive plain data.
- **Snapshots created in development.** Each change in `astro dev` creates a snapshot. Whether dev snapshots should be reused or cleaned up, and by whom, is to be decided during the experimental phase.
- **Where file-based drivers write.** A driver that ships its data with the build needs a location inside the build output that is available both during sync and at runtime. The writer and reader contexts may need to provide it. Until then, `sqlite()` requires a `url`, and doesn't default to a file shipped with the build.
- **Testing in `workerd`.** Reading a stored collection from a Cloudflare Worker needs a remote database or another way to reach the snapshot, so there is no end-to-end test in `workerd` yet.
- **Live collections in `astro:collections:resolved`.** `live.config.ts` is not loaded during sync today, so the hook only reports build-time collections. Loading it during sync would run code meant for the server runtime.
- **Flag names.** `collectionStorageDrivers` and `collectionMetadata` are working names.
