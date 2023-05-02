- Start Date: 2023-05-01
- Reference Issues: https://github.com/withastro/roadmap/issues/530
- Implementation PR: https://github.com/withastro/astro/pull/6850

# Summary

Introduce a standard to store data separately from your content (ex. JSON files).

# Example

Like content collections, data collections are created in the `src/content/` directory. These collections should include only JSON files:

```
src/content/
  authors/
    ben.json
    tony.json
```

These collections are configured using the same `defineCollection()` utility in your `content/config.ts` with `type: 'data'` specified:

```ts
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const authors = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    twitter: z.string().url(),
  })
});

export const collections = { authors };
```

These collections can also be queried using the `getCollection()` and `getEntry()` utilities:

```astro
---
import { getCollection, getEntry } from 'astro:content';

const authors = await getCollection('authors');
const ben = await getEntry('authors', 'ben');
---

<p>
  Authors: {authors.map(author => author.data.name).join(', ')}
</p>
<p>
  The coolest author: <a href={ben.data.twitter}>{ben.data.name}</a>
</p>
```

# Background & Motivation

Content collections are restricted to supporting `.md`, `.mdx`, and `.mdoc` files. This is limiting for other forms of data you may need to store, namely raw data formats like JSON.

Taking a blog post as the example, there will likely be author information thats reused across multiple blog posts. To standardize updates when, say, updating an author's profile picture, it's best to store authors in a standalone data entry.

The content collections API was built generically to support this future, choosing format-agnostic naming like `data` instead of `frontmatter` and `body` instead of `rawContent`. Because of this, expanding support to new data formats without API changes is a natural progression.

# Goals

- **Introduce JSON collection support,** configurable and queryable with similar APIs to content collections.
- **Determine where data collections are stored.** We may allow data collections within `src/content/`, or introduce a new reserved directory.

# Non-Goals

- **Separate RFC:** Referencing data collection entries from existing content collections. This unlocks referencing, say, an author from your blog post frontmatter. See the [related collection references RFC](https://github.com/withastro/roadmap/blob/d89e2a4c28379108501aa6bf40d2f8d93d81ad02/proposals/0034-collection-references.md) for details.

# Detailed Design

Data collections are created with the `defineCollection()` utility, and **must** include `type: 'data'` to store JSON files. This means "mixed" collections containing both content and data entries are not supported, and should raise a helpful error to correct.

```ts
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const authors = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    twitter: z.string().url(),
  })
});

const blog = defineCollection({
  // `type` can be omitted for content collections
  // to make this change non-breaking.
  // `type: 'content'` can also be used for completeness.
  schema: z.object({...}),
})

export const collections = { authors };
```

## Return type

Data collection entries include the same `id`, `data`, and `collection` properties as content collections:

- `id (string)` - The entry file name with the extension omitted. Spaces and capitalization are preserved.
- `collection (string)` - The collection name
- `data (object)` - The entry data as a JS object, parsed by the configured collection schema (if any).

This also means content-specific fields like `slug`, `body`, and `render()` properties are **not** included. This is due to the following:

- `render()`: this function is used by content collections to parse the post body into a usable Content component. Data collections do not have HTML to render, so the function is removed.
- `slug`: This is provided by content collections as a URL-friendly version of the file `id` for use as pages. Since data collections are not meant to be used as pages, this is omitted.
- `body`: Unlike content collections, which feature a post body separate from frontmatter, data collections are just... data. This field could be returned as the raw JSON body, though this would give `body` a double meaning depending on the context: non-data information for content collections, and the "raw" data itself for data collections. We avoid returning the body to avoid this confusion.

## Querying

Today's `getCollection()` utility can be used to fetch both content or data collections:

```astro
---
import { getCollection } from 'astro:content';

const authors = await getCollection('authors');
---

<h1>Our Authors</h1>
<ul>
  {authors.map(author => (
    <li><a href={author.data.twitter}>{author.data.name}</a></li>
  ))}
</ul>
```

To retrieve individual entries, `getEntry()` can be used. This receives both the collection name and the entry `id` as described in the [Return type](#return-type). These can be passed as separate arguments or as object keys.

```astro
---
// src/pages/en/index.astro

// Ex. retrieve a translations document stored in `src/content/i18n/en.json`
// Option 1: separate args
const english = await getEntry('i18n', 'en');
// Option 2: object keys
const english = await getEntry({ collection: 'i18n', id: 'en' });
---

<h1>{english.data.homePage.title}</h1>
<p>{english.data.homePage.tagline}</p>
```

> Note: the object keys approach is primarily meant for resolving references. See the [collection references RFC](https://github.com/withastro/roadmap/blob/d89e2a4c28379108501aa6bf40d2f8d93d81ad02/proposals/0034-collection-references.md) for more.

Thanks to the generic function name, this can be used as a replacement for `getEntryBySlug()` as well. When querying a content collection, `getEntry()` uses `slug` as the identifier:


```astro
---
// Option 1: separate args
const welcomePost = await getEntry('blog', 'welcome');
// Option 2: object keys
const welcomePost = await getEntry({ collection: 'blog', slug: 'welcome' });
const Content = await welcomePost.render();
---

<h1>{welcomePost.data.title}</h1>
<Content />
```

### `id` vs `slug`

You may have noticed two competing identifiers depending on the collection type: `id` for data, and `slug` for content. This is an inconsistency we'd like to address in a future RFC, with `id` becoming the new standard for identifying collection entries. For now, `slug` will remain on content collections to make the introduction of data collections non-breaking.

**Full background:** `slug` was originally introduced alongside the content `id` to have a URL-friendly version of the file path, which can be passed to `getStaticPaths()` for route generation. Data collections are not intended to be used as routes, so we don't want to perpetuate this pattern. `slug` also "slugifies" the file path by removing capitalization and replacing spaces with dashes. If we added this processing to data collection IDs, [collection references](https://github.com/withastro/roadmap/blob/d89e2a4c28379108501aa6bf40d2f8d93d81ad02/proposals/0034-collection-references.md) will be less intuitive to use (i.e. "do I include spaces in the referenced ID here?").

## Implementation

Data collections should following the API design of content collections with a stripped-down featureset. To wire up data collections, we will introduce an internal utility that mirrors our `addContentEntryType()` integration function. This example registers a new `dataEntryType` for `.json` files, with necessary logic to parse data as a JS object:

```ts
addDataEntryType({
  extensions: ['.json'],
  getEntryInfo({ contents, fileUrl }) {
    // Handle empty JSON files, which cause `JSON.parse` to throw
    if (contents === undefined || contents === '') return { data: {} };

    const data = JSON.parse(contents);

    if (data == null || typeof data !== 'object')
      throw new Error(`JSON collection entry ${fileUrl.pathname} must be an object.`);

    return { data };
  },
});
```

Then, we will update our type generator to recognize these data-specific file extensions. This should also raise errors when collections are misconfigured (i.e. `type: 'data'` is missing from the config file) and when a mix of content and data in the same collection is detected.

The `astro:content` runtime module should also be updated to glob these file extensions, and respect the entry ID from the new `getEntry()` utility function. 

# Testing Strategy

- Fixture tests defining data collections, ensuring schemas are respected and query APIs (`getCollection()` and `getEntry()`) return entries of the correct type.
- Test error states: mixed data / content collections are not allowed, `type: 'data'` is enforced

# Drawbacks

- JSON could be considered added complexity, when users can create `.md` files storing all data via frontmatter instead. Though true for trivial content, this is restrictive for use cases like i18n lookup files (which are typically JSON).

# Alternatives

## Using multi-file vs. single-file

Early proposals supported single0file data collections. This allows storing _all_ data collection entries as an array in one `.json` file, instead of splitting up entries per-file as we do content collections today. For example, a single `src/content/authors.json` file instead of a few `src/content/authors/[name].json` files.

We want to stick with a single API design for an experimental release. Unlike multi-file, there are some prohibitive reasons against single-file collections: 

- **Big arrays don't scale for complex data entries**, like i18n translation files. Users will likely want to split up by file here, especially where the status quo is `en.json | fr.json | jp.json ...` for this use case.
- **We'd need to parse the whole array of entries** to determine entry IDs. This could be a performance bottleneck vs. pulling IDs from file names.
- **It would be different from content collections,** which means a learning curve.

Due to these, we decided against single-file for now. Though we do recognize the convenience of colocation that can be explored in the future.

## Using a reserved `src/data/` directory

Early proposals considered moving data collections to a separate directory from content called `src/data/`. We weighed pros and cons for this approach, and ultimately decided `src/contenet/` had a better set of tradeoffs:

### In favor of `src/data/`

- Follows patterns for storing arbitrary JSON or YAML in 11ty [(see the `_data/` convention).](https://www.11ty.dev/docs/data-global/)
- Clearly defines how data and content are distinct concepts that return different information (ex. content includes a `body` and a `render()` utility, while data does not). This makes data-specific APIs like `getDataEntryById()` easier to conceptualize.
- Avoids confusion on whether mixing content and data in the same collection is supported; Collections should be distinctly content _or_ data. We can add appropriate error states for `src/content/`, but using the directory to define the collection type creates a pit of success.

### In favor of `src/content/`

- [Follows Nuxt content's pattern](https://content.nuxtjs.org/guide/writing/json#json) for storing data in a `content/` directory
- Avoids a new reserved directory. This could mean a simpler learning curve, i.e. I already know collections live in `src/content/`, so I'll add my new "data" collection in this directory too. From user testing with the core team, this expectation arose a few times.
- Allows switching from JSON to MD and back again more easily, without moving the directory. Example: you find a need for landing pages and bios for your `authors` data collection, so you move `json -> md` while retaining your schema.
- Avoids the need for [moving the collection config to your project root](https://github.com/withastro/roadmap/discussions/551). With `src/data/`, requiring the `config` to live in a `src/content/config.ts` is confusing. This is amplified when you do not have any content collections.

# Adoption strategy

- Introduce behind an experimental flag through a minor release. Data collections can be introduced non-breaking.
- Document data collections alongside content collections for discoverability.

# Unresolved Questions

N/A
