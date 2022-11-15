- Start Date: 2022-10-14
- Reference Issues: https://github.com/withastro/astro/issues/4307#issuecomment-1277978007
- Implementation PR: https://github.com/withastro/astro/pull/5291

# Content Schemas

<aside>

💡 **This RFC is complimented by [the Render Content proposal](https://github.com/withastro/rfcs/blob/content-schemas/proposals/0028-render-content.md).** Our goal is to propose and accept both of these RFCs as a pair before implementing any features discussed. We recommend reading that document *after* reading this to understand how all use cases can be covered.
</aside>

# Summary

Content Schemas are a way to fetch Markdown and MDX frontmatter in your Astro projects in a consistent, performant, and type-safe way.

This introduces four new concepts:

- A new, reserved directory that Astro will manage: `src/content/`
- A set of helper functions to load entries and collections of entries from this directory
- The introduction of "collections" and "schemas" ([see glossary](#glossary-📖)) to type-check frontmatter data
- A new, ignored directory for metadata generated from your project: `.astro/`

## Glossary 📖

We'll be using the words "schema," "collection," and "entry" throughout. Let's define those terms in the context of this RFC:

- **Schema:** a way to codify the "structure" of your data. In this case, frontmatter data
- **Collection:** a set of data that share a common schema. In this case, Markdown and MDX files
- **Entry:** A piece of data (Markdown or MDX file) belonging to a given collection

# Goals ⭐️

- Make landing and index pages easy to create and debug
- Standardize frontmatter type checking at the framework level
- Provide valuable error messages to debug and correct frontmatter that is malformed

## Out-of-scope / Future

- **This RFC is focused on Markdown and MDX content only.** We see how this generic pattern of “collections” and “schemas” may extend to other resources like YAML, JSON, image assets, and more. We would love to explore these avenues if the concept of schemas is accepted.

# Example

Say we want a landing page for our collection of blog posts:

```bash
src/content/
  blog/
    enterprise.md
    columbia.md
    endeavour.md
    ~schema.ts
```

We can use `getCollection` to retrieve type-safe frontmatter:

```tsx
---
// src/pages/index.astro
// We'll talk about that `.astro` in the Detailed design :)
import { getCollection, getEntry } from '.astro';

// Get all `blog` entries
const allBlogPosts = await getCollection('blog');
// Filter blog posts by frontmatter properties
const draftBlogPosts = await getCollection('blog', ({ data }) => {
  return data.status === 'draft';
});
// Get a specific blog post by file name
const enterprise = await getEntry('blog', 'enterprise.md');
---

<ul>
  {allBlogPosts.map(post => (
    <li>
      {/* access frontmatter properties with `.data` */}
      <a href={post.data.slug}>{post.data.title}</a>
      {/* each property is type-safe, */}
      {/* so expect nice autocomplete and red squiggles here! */}
      <time datetime={post.data.publishedDate.toISOString()}>
        {post.data.publishedDate.toDateString()}
      </time>
    </li>
  ))}
</ul>
```

And add a `~schema.ts` to enforce frontmatter fields:

```tsx
// src/content/blog/~schema.ts
import { z } from 'zod'

export const schema = z.object({
  title: z.string(),
  slug: z.string(),
  // mark optional properties with `.optional()`
  image: z.string().optional(),
  tags: z.array(z.string()),
  // transform to another data type with `transform`
  // ex. convert date strings to Date objects
  publishedDate: z.string().transform((str) => new Date(str)),
});
```

# Motivation

Let's break down the problem space to better understand the value of this proposal.

## Frontmatter is hard to author and debug

First problem: **enforcing consistent frontmatter across your content is a lot to manage.** You can define your own types with a type-cast using `Astro.glob` today:

```tsx
---
import type { MarkdownInstance } from 'astro';

const posts: MarkdownInstance<{ title: string; ... }> = await Astro.glob('./blog/**/*.md');
---
```

However, there's no guarantee your frontmatter *actually* matches this `MarkdownInstance` type.

Say `blog/columbia.md` is missing the required `title` property. When writing a landing page like this:

```tsx
...
<ul>
  {allBlogPosts.map(post => (
    <li>
      {post.frontmatter.title.toUpperCase()}
    </li>
  ))}
</ul>
```

...You'll get the ominous error "cannot read property `toUpperCase` of undefined." Stop me if you've had this monologue before:

> *Aw where did I call `toUpperCase` again?*
> 
> 
> *Right, on the landing page. Probably the `title` property.*
> 
> *But which post is missing a title? Agh, better add a `console.log` and scroll through here...*
> 
> *Ah finally, it was post #1149. I'll go fix that.*
> 

**Authors shouldn't have to think like this.** What if instead, they were given a readable error pointing to where the problem is?

![Frontmatter error overlay - Could not parse frontmatter in blog -> columbia.md. "title" is required.](../assets/0027-frontmatter-err.png)

This is why schemas are a *huge* win for a developer's day-to-day. Astro will autocomplete properties that match your schema, and give helpful errors to fix properties that don't.

## Importing globs of content can be slow

Second problem: **importing globs of content via `Astro.glob` can be slow at scale.** This is due to a fundamental flaw with importing: even if you *just* need the frontmatter of a post (i.e. for landing pages), you still wait on the *content* of that render and parse to a JS module as well. Though less of a problem with Markdown, globbing hundreds-to-thousands of MDX entries [can slow down dev server HMR updates significantly](https://github.com/withastro/astro/issues/4307).

To avoid this, Content Schemas will focus on processing and returning a post's frontmatter, **not** the post's contents, **and** avoid transforming documents to JS modules. This should make Markdown and MDX equally quick to process, and should make landing pages faster to build and debug.

<aside>

💡 Don’t worry, it will still be easy to retrieve a post’s content when you need it! [See the Render Content proposal](https://github.com/withastro/rfcs/blob/content-schemas/proposals/0028-render-content.md) for more.

</aside>

# Detailed design

As you might imagine, Content Schemas have a lot of moving parts. Let's detail each one:

## The `src/content/` directory

This RFC introduces a new, reserved directory for Astro to manage: `{srcDir}/content/`. This directory is where all collections and schema definitions live, relative to your configured source directory.

## The `.astro` cache directory

Since we will preprocess your post frontmatter separate from Vite ([see background](#background)), we need a new home for generated metadata. This will be a special `.astro` directory **generated by Astro** at build time or on dev server startup.

The user is *not* expected to view or edit this manifest. This only exists to enable type checking and frontmatter parsing via `getCollection` and `getEntry`.

From the user's perspective, `.astro` should be the import source for all *generated* helpers that smartly understand your project.  Today, this would include [`getCollection` and `getEntry`](#example) imported like so:

```tsx
import { getCollection, getEntry } from '.astro';
```

We expect `.astro` to live at the base of your project directory. This falls inline with generated directories like `.vscode` for editor tooling and `.vercel` for deployments. We will preconfigure a type alias as well, allowing users to import `.astro` instead of `../../.astro`.

## Creating a collection

All entries in `src/content/` **must** be nested in a "collection" directory. This allows you to get a collection of entries based on the directory name, and optionally enforce frontmatter types with a schema. This is similar to creating a new table in a database, or a new content model in a CMS like Contentful.

What this looks like in practice:

```bash
src/content/
  newsletters/
    # All newsletters have the same frontmatter properties
    ~schema.ts
    week-1.md
    week-2.md
    week-3.md
  blog/
    # All blog posts have the same frontmatter properties
    ~schema.ts
    columbia.md
    enterprise.md
    endeavour.md
```

### Nested directories

Collections are considered **one level deep**, so you cannot nest collections (or collection schemas) within other collections. However, we *will* allow nested directories to better organize your content. This is vital for certain use cases like internationalization:

```bash
src/content/
  # Applies to all nested directories 👇
  ~schema.ts
  docs/
    en/
    es/
    ...
```

All nested directories will share the same (optional) schema defined at the top level. Which brings us to...

## Adding a schema

Schemas are an optional way to enforce frontmatter types in a collection. To add a collection schema, you can create a `~schema.{js|mjs|ts}` file inside of that collection directory. This file should:

1. Have a named export called `schema`
2. Use a [Zod object](https://github.com/colinhacks/zod#objects) to define frontmatter properties

For instance, say every `blog/` entry should have a `title`, `slug`, a list of `tags`, and an optional `image` url. We can specify each object property like so:

```tsx
// ~schema.ts
import { z } from 'zod'

export const schema = z.object({
  title: z.string(),
  slug: z.string(),
  // mark optional properties with `.optional()`
  image: z.string().optional(),
  tags: z.array(z.string()),
});
```

[Zod](https://github.com/colinhacks/zod) has some benefits over TypeScript as well. Namely, you can check the *shape* of string values with built-in regexes, like `url()` for URLs and `email()` for emails.

```tsx
export const schema = z.object({
  // "jeff" would fail to parse, but "hey@blog.biz" would pass
  authorContact: z.string().email(),
  // "/post" would fail, but `https://blog.biz/post` would pass
  canonicalURL: z.string().url(),
  tags: z.array(z.string()),
});
```

You can [browse Zod's documentation](https://github.com/colinhacks/zod) for a complete rundown of features. However, given frontmatter is limited to primitive types like strings and booleans, we don't expect users to dive *deep* into Zod's complex use cases.

## Fetching content

Astro provides 2 functions to query collections:

- `getCollection` - get all entries in a collection, or based on a frontmatter filter
- `getEntry` - get a specific entry in a collection by file name

These functions will have typed based on collections that exist. In other words, `getCollection('banana')` will raise a type error if there is no `src/content/banana/`.

```tsx
---
import { getCollection, getEntry } from '.astro';
// Get all `blog` entries
const allBlogPosts = await getCollection('blog');
// Filter blog posts by entry properties
const draftBlogPosts = await getCollection('blog', ({ id, slug, data }) => {
  return data.status === 'draft';
});
// Get a specific blog post by file name
const enterprise = await getEntry('blog', 'enterprise.md');
---
```

### Return type

Assume the `blog` collection schema looks like this:

```tsx
// src/content/blog/~schema.ts
import { z } from 'zod'

export const schema = z.object({
  title: z.string(),
  slug: z.string(),
  image: z.string().optional(),
  tags: z.array(z.string()),
});
```

`await getCollection('blog')` will return entries of the following type:

```tsx
{
  // parsed frontmatter
  data: {
    title: string;
    slug: string;
    image?: string;
    tags: string[];
  };
  // unique identifier. Today, the file path relative to src/content/[collection]
  id: '[filePath]'; // union from all entries in src/content/[collection]
	// URL-ready slug computed from ID, relative to collection 
	// ex. "docs/home.md" -> "home"
	slug: '[fileBase]'; // union from all entries in src/content/[collection]
  // raw body of the Markdown or MDX document
  body: string;
}
```

We have purposefully generalized Markdown-specific terms like `frontmatter` and `file` to agnostic names like `data` and `id`. This also follows naming conventions from headless CMSes like Contentful.

Also note that `body` is the *raw* content of the file. This ensures builds remain performant by avoiding expensive rendering pipelines. See [“Moving to `src/pages/`"](#mapping-to-srcpages) to understand how a `<Content />` component could be used to render this file, and pull in that pipeline only where necessary.

### Nested directories

[As noted earlier](#nested-directories), you may organize entries into directories as well. The result will **still be a flat array** when fetching a collection via `getCollection`, with the nested directory reflected in an entry’s `id`:

```tsx
const docsEntries = await getCollection('docs');
console.log(docsEntries)
/*
-> [
	{ id: 'en/getting-started.md', slug: 'en/getting-started', data: {...} },
	{ id: 'en/structure.md', slug: 'en/structure', data: {...} },
	{ id: 'es/getting-started.md', slug: 'es/getting-started', data: {...} },
	{ id: 'es/structure.md', slug: 'es/structure', data: {...} },
	...
]
*/
```

This is in-keeping with our database table and CMS collection analogies. Directories are a way to organize your content, but do *not* effect the underlying, flat collection → entry relationship.

## Mapping to `src/pages/`

We imagine users will want to map their collections onto live URLs on their site. This should be  similar to globbing directories outside of `src/pages/` today, using `getStaticPaths` to generate routes dynamically.

Say you have a `docs` collection subdivided by locale like so:

```bash
src/content/
	docs/
		en/
			getting-started.md
			...
		es/
			getting-started.md
			...
```

We want all `docs/` entries to be mapped onto pages, with those nested directories respected as nested URLs. We can do the following with `getStaticPaths`:

```tsx
// src/pages/docs/[...slug].astro
import { getCollection } from '.astro';

export async function getStaticPaths() {
	const blog = await getCollection('docs');
	return blog.map(entry => ({
		params: { slug: entry.slug },
	});
}
```

This will generate routes for every entry in our collection, mapping each entry slug (a path relative to `src/content/docs`) to a URL. 

### Rendering contents

The above example generates routes, but what about rendering our `.md` files on the page? We suggest [reading the Render Content proposal](https://github.com/withastro/rfcs/blob/content-schemas/proposals/0028-render-content.md) for full details on how `getCollection` will compliment that story. 

# Detailed implementation

To wire up type inferencing in those `getCollection` helpers, we'll need to generate some code under-the-hood. Let's explore the engineering work required.

## Generated `.astro` directory

As discussed in [Detailed Usage](#detailed-usage), the `.astro` directory will be home to generated metadata and user-facing utilities that use this metadata. Today, this includes a manifest of entries in `src/content/`, and the `getCollection` and `getEntry` utilities.

```bash
my-project-directory/
	# added to base project directory
  .astro/
    # metadata
    contentMap.mjs
    contentMap.d.ts
    # user-facing utilities
    index.mjs
    index.d.ts
```

## Manifest

The first item in this `.astro` directory will be a JS manifest. This will contain a map of all `src/content/` entries, generated at build time or on server request. It will contain:

- All of the collections in `src/content/`
- The schema types used by each collection
- The parsed frontmatter object and raw content body for each entry in a collection

[See Appendix](#appendix-a---generated-manifest-sample) for a sample of how this manifest might look.

Using this manifest should address the dev server performance bottlenecks of `Astro.glob`. This is because we avoid transforming each file individually by generating our own metadata module to efficiently look up and type check frontmatter.

We believe the Vite pipeline can be a bottleneck to processing Markdown at scale, [as revealed by Zach Leatherman's Markdown-at-scale benchmark](https://www.zachleat.com/web/build-benchmark/). This metadata doc will consolidate hundreds-to-thousands of Vite transforms to a single module, cutting down on processing time significantly.

## `getCollection` and `getEntry`

Alongside this manifest, we will expose `getCollection` and `getEntry` helpers. Users will import these helpers from the `.astro` directory like so:

```tsx
---
// src/pages/index.astro
import { getCollection, getEntry } from '.astro';
---
```

By avoiding the `Astro` global, these fetchers are framework-agnostic. This unlocks usage in UI component frameworks and endpoint files.

# Testing strategy

Since this feature relies on a magic directory (`src/content/`), we will need tests up to the end-to-end level. To summarize:

- **dev server e2e tests**: validate that `getCollection` and `getEntry` are usable as schema and entry files change.
- **`astro check` integration test**: ensure generated types pass our type validator.
- **`astro build` integration test**: ensure entries and collections build successfully, with expected data present in the build.
- **type file generator unit tests**: Type gen should be independently testable, so it's worth a snapshot test validating the output.

# Drawbacks

By adding structure, we are also adding complexity to your code. This has a few consequences:

1. **[Zod](https://github.com/colinhacks/zod) means a new learning curve** for users already familiar with TypeScript. We will need to document common uses cases like string parsing, regexing, and transforming to `Date` objects so users can onboard easily. We will also consider CLI tools to spin up `schema` entries to give new users a starting point.
2. **Magic is always scary,** especially given Astro's bias towards being explicit. Introducing a reserved directory with a sanctioned way to import from that directory is a hurdle to adoption.

# Alternatives

There are alternative solutions to consider across several categories:

## Zod vs. other formats

We considered a few alternatives to using Zod for schemas:

- **Generate schemas from a TypeScript type.** This would let users reuse frontmatter types they already have and avoid the learning curve of a new tool. However, TypeScript is missing a few surface-level features that Zod covers:
    - Constraining the shape of a given value. For instance, setting a `min` or `max` character length, or testing strings against `email` or `URL` regexes.
    - [Transforming](https://github.com/colinhacks/zod#transform) a frontmatter value into a new data type. For example, parsing a date string to a `Date` object, and raising a helpful error for invalid dates.
- **Invent our own JSON or YAML-based schema format.** This would fall in-line with a similar open source project, [ContentLayer](https://www.contentlayer.dev/docs/sources/files/mapping-document-types), that specifies types with plain JS. Main drawbacks: replacing one learning curve with another, and increasing the maintenance cost of schemas overtime.

In the end, we've chosen Zod since it can scale to complex use cases and takes the maintenance burden off of Astro's shoulders.

We have also considered exposing the `z` helper as an `astro` dependency rather than a separate `zod` dependency to install in your project:

```tsx
import { z } from 'astro';
```

This would allow us to version-lock Zod to avoid incompatibility in the future, and make Zod feel more official as a solution.

## Collections vs. globs

We expect most users to compare `getCollection` with `Astro.glob`. There is a notable difference in how each will grab content:

- `Astro.glob` accepts wild cards (i.e. `/posts/**/*.md) to grab entries multiple directories deep, filter by file extension, etc.
- `getCollection` accepts **a collection name only,** with an optional filter function to filter by entry values.

The latter limits users to fetching a single collection at a time, and removes nested directories as a filtering option (unless you regex the ID by hand). One alternative could be to [mirror Contentlayer's approach](https://www.contentlayer.dev/docs/sources/files/mapping-document-types#resolving-document-type-with-filepathpattern), wiring schemas to wildcards of any shape:

```tsx
// Snippet from Contentlayer documentation
// <https://www.contentlayer.dev/docs/sources/files/mapping-document-types#resolving-document-type-with-filepathpattern>
const Post = defineDocumentType(() => ({
  name: 'Post',
  filePathPattern: `posts/**/*.md`,
  // ...
}))
```

Still, we've chosen a flat `collection` + schema file approach to a) mirror Astro's file-based routing, and b) establish a familiar database table or headless CMS analogy.

## Virtual modules vs `.astro` directory

The `.astro` directory could also be represented as a virtual module with generated type definitions. The team considered a `astro:` prefix for all generated utilities similar to `node:`'s prefix. We definitely like this parallel, since it established Astro more as a platform for building your application.

```tsx
import { getCollection } from 'astro:content';
```

However, the technical implementation of an `astro:content` alias is a bit more complex for type checking in the scope of this proposed API. Even if user-facing utilities like `getCollection` came from this virtual module, we would *still* need a [generated metadata file](#appendix-a---generated-manifest-sample) somewhere in your project for TypeScript's type inferencing. To simplify this code generation, we decided user-facing functions and metadata could live together under `.astro`, though we are open to exploring the `astro:` prefix concept in the future.

# Adoption strategy

Introducing a new reserved directory (`src/content/`) will be a breaking change for users that have their own `src/content/` directory. So, we intend to:

1. Release behind an experimental flag before 2.0 to get initial feedback
2. Baseline this flag for Astro 2.0

This should give us time to address all aspects and corner cases of content schemas.

We intend `src/content/` to be the recommended way to store Markdown and MDX content in your Astro project. Documentation will be *very* important to guide adoption! So, we will speak with the docs team on the best information hierarchy. Not only should we surface the concept of a `src/content/` early for new users, but also guide existing users (who may visit the "Markdown & MDX" and Astro glob documentation) to `src/content/` naturally. A few initial ideas:

- Expand [Project Structure](https://docs.astro.build/en/core-concepts/project-structure/) to explain `src/content/`
- Update Markdown & MDX to reference the Project Structure docs, and expand [Importing Markdown](https://docs.astro.build/en/guides/markdown-content/#importing-markdown) to a more holistic "Using Markdown" section
- Add a "local content" section to the [Data Fetching](https://docs.astro.build/en/guides/data-fetching/) page

We can also ease migration for users that *already* have a `src/content/` directory used for other purposes. For instance, can warn users with a `src/content/` that a) contains other file types or b) does not contain any `~schema` files.

# Unresolved questions

This is a pretty major addition, so we invite readers to raise questions below! Still, these are a few our team has today:

- Should the generated `.astro` directory path be configurable?
- How should we “pitch” Content Schemas to `Astro.glob` users today?

## Appendix A - Generated manifest sample

> This is subject to change, but should clarify what code we need to generate.

We will generate a manifest for types **only,** and rely on `import.meta.glob` to retrieve frontmatter in code. The generated type manifest will look something like this:

```tsx
// src/.astro/content-manifest.d.ts
export declare const entryMap: {
	"blog": {
    "columbia.md": {
      id: "columbia.md",
      slug: "columbia",
      collection: "blog",
      body: string,
      data: z.infer<typeof schemaMap["blog"]['schema']>
    },
    "endeavour.md": {
      id: "endeavour.md",
      slug: "endeavour",
      collection: "blog",
      body: string,
      data: z.infer<typeof schemaMap["blog"]['schema']>
    },
    "promo/launch-week.mdx": {
      id: "promo/launch-week.mdx",
      slug: "promo/launch-week",
      collection: "blog",
      body: string,
      data: z.infer<typeof schemaMap["blog"]['schema']>
    },
  },
};
export declare const schemaMap: {
	"blog": typeof import("/Users/benholmes/Repositories/astro/examples/with-content/src/content/blog/~schema"),
};
```