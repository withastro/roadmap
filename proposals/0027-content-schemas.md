- Start Date: 2022-10-14
- Reference Issues: https://github.com/withastro/astro/issues/4307#issuecomment-1277978007
- Implementation PR:

# Summary

Content Schemas are a way to fetch Markdown and MDX frontmatter in your Astro projects in a consistent, performant, and type-safe way.

This introduces four new concepts:
- A new, reserved directory that Astro will manage: `src/content/`
- A set of helper functions to load entries and collections of entries from this directory
- The introduction of "collections" and "schemas" ([see glossary](#glossary)) to type-check frontmatter data
- A new, ignored directory for metadata generated from your project: `.astro/`

## Out of scope

**⚠️ This RFC is focused on frontmatter parsing only.** This means any helpers described will _not_ help you **import** and **render** Markdown and MDX components.

We recognize this is a blocker to using any helpers described when you need to render a post's contents, as with `getStaticPaths`. This will be investigated separately, and we will _not_ PR or ship any features described until we find a solution to rendering your content in a performant way.

# Glossary

We'll be using the words "schema," "collection," and "entry" throughout. Let's define those terms in the context of this RFC:

- **Schema:** a way to codify the "structure" of your frontmatter data
- **Collection:** a set of data (in this case, Markdown and MDX files) that share a common schema
- **Entry:** A Markdown or MDX file belonging to a given collection

# Goals

There are two major problems this RFC aims to solve:
- Frontmatter without type safety is hard to debug
- Building pages that _only_ need frontmatter (notably, landing pages), is slow with `Astro.glob`

This has led to four goals:
- Standardize frontmatter type checking at the framework level
- Provide valuable error messages to debug and correct frontmatter that is malformed
- Introduce a way to fetch _just_ frontmatter data from your content, avoiding the expensive rendering pipeline
- Introduce a place for Astro-specific metadata generated from your project

# Background

Let's break down the problem space to better understand the value of this proposal.

## Frontmatter should be easy to use and debug

First problem: **enforcing consistent frontmatter across your content is a lot to manage.** You can define your own types with a type-cast using `Astro.glob` today:

```astro
---
import type { MarkdownInstance } from 'astro';

const posts: MarkdownInstance<{ title: string; ... }> = await Astro.glob('./blog/**/*.md');
---
```

However, there's no guarantee your frontmatter _actually_ matches this `MarkdownInstance` type.

Say `blog/columbia.md` is missing the required `title` property. When writing a landing page like this:

```astro
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

> _Aw where did I call `toUpperCase` again?_
> 
> _Right, on the landing page. Probably the `title` property._
>
> _But which post is missing a title? Agh, better add a `console.log` and scroll through here..._
>
> _Ah finally, it was post #1149. I'll go fix that._

**Authors shouldn't have to think like this.** What if instead, they were given a readable error pointing to where the problem is?

![Error log - Could not parse frontmatter in blog → columbia.md. "title" is required.](../assets/0027-frontmatter-err.png)

This is why schemas are a _huge_ win for a developer's day-to-day. Astro will autocomplete properties that match your schema, and give helpful errors to fix properties that don't.

## Importing globs of content can be slow

Second problem: **importing globs of content via `Astro.glob` [can be slow at scale.](https://github.com/withastro/astro/issues/4307#issuecomment-1277978007)** This is due to a fundamental flaw with importing: even if you _just_ need the frontmatter of a post (i.e. for landing pages), you still wait on the _content_ of that post to render as well. Though less of a problem with Markdown, globbing hundreds-to-thousands of MDX entries can add minutes to your build.

To avoid this, Content Schemas will focus on processing and returning a post's frontmatter, **not** the post's contents. This should make Markdown and MDX equally quick to process, and should make landing pages quick to build and debug.

We will also **avoid the Vite pipeline** by generating our own metadata object to efficiently look up and type check frontmatter. This avoids the base JS module bottleneck that Vite introduces, [as revealed by Zach Leatherman's Markdown-at-scale benchmark](https://www.zachleat.com/web/build-benchmark/). As such, we are confident that pushing frontmatter fetching outside of the JS module pipeline will let us build the fastest, most performant solution for the landing page glob use case.

# Example

Say we want to store our `blog` as a collection of Markdown and MDX documents, with consistent frontmatter throughout. We can create a `blog` directory inside of `src/content` like so with a `~schema.ts` file:

```sh
src/content/
  blog/
    enterprise.md
    columbia.md
    endeavour.md
    ~schema.ts
```

This `~schema.ts` will export a [Zod object](https://github.com/colinhacks/zod) to enforce frontmatter property types and specify optional vs. required:

```ts
// ~schema.ts
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

To use this `blog/` collection your project, you can call `fetchContent` and/or `fetchContentByEntry` like so:

```astro
---
// We'll talk about that `.astro` in the Detailed Design :)
import { fetchContent, fetchContentByEntry } from '.astro';

// Get all `blog` entries
const allBlogPosts = await fetchContent('blog');
// Filter blog posts by frontmatter properties
const spaceRelatedBlogPosts = await fetchContent('blog', (data) => {
  return data.tags.includes('space');
});
// Get a specific blog post by file name
const enterprise = await fetchContentByEntry('blog', 'enterprise.md');
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

See [detailed usage](#detailed-usage) for a breakdown of each feature.

# Detailed usage

As you might imagine, Content Schemas have a lot of moving parts. Let's detail each one:

## The `src/content/` directory

This RFC introduces a new, reserved directory for Astro to manage: `src/content/`. This directory is where all collections and schema definitions live.

## The `.astro` directory

Since we will preprocess your post frontmatter separate from Vite ([see background](#importing-globs-of-content-can-be-slow)), we need a new home for generated metadata. This will be a special `.astro` directory generated at build time or on dev server startup.

From the user's perspective, `.astro` should be the import source for all _generated_ helpers that smartly understand your project.  Today, this would include [`fetchContent` and `fetchContentByEntry`](#fetchcontent-and-fetchcontentbyentry) imported like so:

```ts
import { fetchContent, fetchContentByEntry } from '.astro';
```

We expect `.astro` to live within `node_modules` to avoid checking with your repository. Though, in the future, we would like to explore `.astro` as a home for other generated utilities (ex. a `render404` to pick up custom 404 pages in SSR).

## Creating a collection

All entries in `src/content/` **must** be nested in a "collection" directory. This allows you to group content based on the schema their frontmatter should use. This is similar to creating a new table in a database, or a new content model in a CMS like Contentful.

What this looks like in practice:

```shell
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

## Adding a schema

To add type checking to a given collection, you can add a `~schema.{js|mjs|ts}` file inside of that collection directory. This file should:
1. Have a single named export called `schema`
2. Use a [Zod object](https://github.com/colinhacks/zod#objects) to define frontmatter properties

For instance, say every `blog/` entry should have a `title`, `slug`, a list of `tags`, and an optional `image` url. We can specify each object property like so:

```ts
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

[Zod](https://github.com/colinhacks/zod) has some benefits over TypeScript as well. Namely, you can check the _shape_ of string values with built-in regexes, like `url()` for URLs and `email()` for emails.

```ts
export const schema = z.object({
  // "jeff" would fail to parse, but "hey@blog.biz" would pass
  authorContact: z.string().email(),
  // "/post" would fail, but `https://blog.biz/post` would pass
  canonicalURL: z.string().url(),
  tags: z.array(z.string()),
});
```

You can [browse Zod's documentation](https://github.com/colinhacks/zod) for a complete rundown of features. However, given frontmatter is limited to primitive types like strings and booleans, we don't expect users to dive _deep_ into Zod's complex use cases.

## Fetching content

Astro provides 2 functions to query collections:
- `fetchContent` - get all entries in a collection, or based on a frontmatter filter
- `fetchContentByEntry` - get a specific entry in a collection by file name

These functions will have typed based on collections that exist. In other words, `fetchContent('banana')` will raise a type error if there is no `src/content/banana/`.

```astro
---
import { fetchContent, fetchContentByEntry } from '.astro';
// Get all `blog` entries
const allBlogPosts = await fetchContent('blog');
// Filter blog posts by frontmatter properties
const spaceRelatedBlogPosts = await fetchContent('blog', (data) => {
  return data.tags.includes('space');
});
// Get a specific blog post by file name
const enterprise = await fetchContentByEntry('blog', 'enterprise.md');
---
```

### Return type

Assume the `blog` collection schema looks like this:

```ts
// src/content/blog/~schema.ts
import { z } from 'zod'

export const schema = z.object({
  title: z.string(),
  slug: z.string(),
  image: z.string().optional(),
  tags: z.array(z.string()),
});
```

`await fetchContent('blog')` will return entries of the following type:

```ts
{
  // parsed frontmatter
  data: {
    title: string;
    slug: string;
    image?: string;
    tags: string[];
  };
  // unique identifier. Today, the absolute file path
  id: string;
  // raw body of the Markdown or MDX document
  body: string;
}
```

We have purposefully generalized Markdown-specific terms like `frontmatter` and `file` to agnostic names like `data` and `id`. This leaves the door open to fetch content hosted _outside_ your local project in the future, following naming conventions from headless CMSes like Contentful.

Also note that `body` is the _raw_ content of the file. This ensures builds remain performant by avoiding expensive rendering pipelines. However, we recognize the value of parsing this body automatically as `Astro.glob` does today. We will investigate this use case separately.

## Mapping to pages

TODO

# Detailed design

To wire up type inferencing in those `fetchContent` helpers, we'll need to generate some code under-the-hood. Let's explore the engineering work required.

## Generated `.astro` directory

As discussed in [Detailed Usage](#the-astro-directory), the `.astro` directory will be home to generated metadata and user-facing utilities that use this metadata. Today, this includes a manifest of entries in `src/content/`, and the `fetchContent` and `fetchContentByEntry` utilities.

```shell
node_modules/
  .astro/
    # metadata
    contentMap.mjs
    contentMap.d.ts
    # user-facing utilities
    index.mjs
    index.d.ts
    # generated package for module resolution
    package.json
```

## Manifest

The first item in this `.astro` directory will be a JS manifest. This will contain a map of all `src/content/` entries, generated at build time or on development server startup. It will contain:
- All of the collections in `src/content/`
- The schema types used by each collection
- The parsed frontmatter object and raw content body for each entry in a collection

**Note:** The user is _not_ expected to view or edit this manifest. This only exists to enable type checking and frontmatter parsing via `fetchContent` and `fetchContentByEntry`.

[See Appendix](#appendix-a---generated-manifest-sample) for a sample of how this manifest might look.

## `fetchContent` and `fetchContentByEntry`

Alongside this manifest, we will expose `fetchContent` and `fetchContentByEntry` helpers. Users will import these helpers from the `.astro` directory like so:

```astro
---
// src/pages/index.astro
import { fetchContent, fetchContentByEntry } from '.astro';
---
```

By avoiding the `Astro` global, these fetchers are framework-agnostic. This unlocks usage in UI component frameworks and endpoint files.

# Drawbacks

By adding structure, we are also adding complexity to your code. This has a few consequences:

1. **[Zod](https://github.com/colinhacks/zod) has a learning curve** compared to writing TypeScript types. We will need to document common uses cases like string parsing, regexing, and transforming to `Date` objects so users can onboard easily. We also consider CLI tools to spin up `schema` entries **vital** to give new users a starting point.
2. **Magic is always scary,** especially given Astro's bias towards being explicit. Introducing a reserved directory with a sanctioned way to import from that directory is a hurdle to adoption.
3. **We (as of this RFC) don't help you render your content.** This means `fetchContent` will _not_ replace `Astro.glob` when rendering content is vital, as with `getStaticPaths`. We consider this a blocker to implementing changes proposed here, and should be answered by a separate investigation.

# Alternatives

## Zod

We considered a few alternatives to using Zod for schemas:
- **Generate schemas from a TypeScript type.** This would let users reuse frontmatter types they already have and avoid the learning curve of a new tool. However, TypeScript is missing a few surface-level features that Zod covers:
  - Constraining the shape of a given value. For instance, setting a `min` or `max` character length, or testing strings against `email` or `URL` regexes.
  - [Transforming](https://github.com/colinhacks/zod#transform) a frontmatter value into a new data type. For example, parsing a date string to a `Date` object, and raising a helpful error for invalid dates.

- **Invent our own JSON or YAML-based schema format.** This would fall in-line with a similar open source project, [ContentLayer](https://www.contentlayer.dev/docs/sources/files/mapping-document-types), that specifies types with plain JS. Main drawbacks: replacing one learning curve with another, and increasing the maintenance cost of schemas overtime.

In the end, we've chosen Zod since it can scale to complex use cases and takes the maintenance burden off of Astro's shoulders.

We have also considered exposing the `z` helper as an `astro` dependency rather than a separate `zod` dependency to install in your project:

```ts
import { z } from 'astro';
```

This would allow us to version-lock Zod to avoid incompatibility in the future, and make Zod feel more official as a solution.

## Collections vs. globs

We expect most users to compare `fetchContent` with `Astro.glob`. There is a notable difference in how each will grab content:
- `Astro.glob` accepts wild cards (i.e. `/posts/**/*.md) to grab entries multiple directories deep, filter by file extension, etc.
- `fetchContent` accepts **a collection name only,** with an optional filter function to filter by frontmatter values.

The latter limits users to fetching a single collection at a time, and removes nested directories as an option. One alternative could be to [mirror Contentlayer's approach](https://www.contentlayer.dev/docs/sources/files/mapping-document-types#resolving-document-type-with-filepathpattern), wiring schemas to wildcards of any shape:

```ts
// Snippet from Contentlayer documentation
// https://www.contentlayer.dev/docs/sources/files/mapping-document-types#resolving-document-type-with-filepathpattern
const Post = defineDocumentType(() => ({
  name: 'Post',
  filePathPattern: `posts/**/*.md`,
  // ...
}))
```

Still, we've chosen a flat `collection` + schema file approach to mirror Astro's file-based routing.

## Vite modules vs `.astro` directory

The `.astro` directory could also be represented as a virtual module with generated type definitions. The team considered a `astro:` prefix for all generated utilities similar to `node:`'s prefix. We definitely like this parallel, since it established Astro more as a platform for building your application.

```ts
import { fetchContent } from 'astro:content';
```

However, the technical implementation of an `astro:content` is a bit more complex for type checking. Even if user-facing utilities like `fetchContent` came from this virtual module, we would _still_ need a [generated metadata file](#appendix-a---generated-manifest-sample) somewhere in your project for TypeScript's type inferencing. To simplify this code generation, we decided user-facing functions and metadata could live together under `.astro`, though we are open to exploring the `astro:` prefix concept in the future.

# Adoption strategy

Introducing a new reserved directory (`src/content/`) **will be a breaking change**, so we intend to:
1. Release behind an experimental flag before 2.0 to get initial feedback
2. Baseline this flag for Astro 2.0

This should give us time to address all aspects and corner cases of content schemas, and let us tackle performant rendering of content before this is handed off to users (see [out of scope](#out-of-scope)).

We intend `src/content/` to be the recommended way to store Markdown and MDX content in your Astro project. Documentation will be _very_ important to guide adoption! So, we will speak with the docs team on the best information hierarchy. Not only should we surface the concept of a `src/content/` early for new users, but also guide existing users (who may visit the "Markdown & MDX" and Astro glob documentation) to `src/content/` naturally. Ah few initial ideas:
- Expand [Project Structure](https://docs.astro.build/en/core-concepts/project-structure/) to explain `src/content/`
- Update Markdown & MDX to reference the Project Structure docs, and expand [Importing Markdown](https://docs.astro.build/en/guides/markdown-content/#importing-markdown) to a more holistic "Using Markdown" section
- Add a "local content" section to the [Data Fetching](https://docs.astro.build/en/guides/data-fetching/) page

We can also ease migration for users that _already_ have a `src/content/` directory used for other purposes. For instance, can warn users with a `src/content/` that a) contains other file types or b) does not contain any `~schema` files.

# Unresolved questions

This is a pretty major addition, so we invite readers to raise questions below! Still, these are a few our team has today:
- Should the generated `.astro` directory path be configurable?
- (inviting core to raise more questions!)

## Appendix A - Generated manifest sample 

This is subject to change, but may clarify what code we'll be generating.

Note: this is built to optimize collection and entry lookup. There are a few performance optimizations to consider:
- Could we extract `data` and `body` to separate lookups to speed up these nested objects?
- Would a `Map` be faster than a plain object, assuming we write frequently during development?
- Could we flatten the whole thing with a separate collection lookup map for `fetchContent` to index?

...For now, I kept the design naive :)

```ts
// src/.astro/content-manifest.mjs
export const contentMap = {
  blog: {
    'columbia.md': {
      id: '/Users/me/my-astro-project/src/content/blog/columbia.md',
      data: {"description":"Learn about the Columbia NASA space shuttle.","canonicalURL":"https://astro.build/blog/columbia/","publishedDate":"Sat May 21 2022 00:00:00 GMT-0400 (Eastern Daylight Time)","modifiedDate":"Sun May 22 2022 00:00:00 GMT-0400 (Eastern Daylight Time)"},
      body: "Space Shuttle Columbia...",
    },
    'endeavour.md': {
      id: '/Users/me/my-astro-project/src/content/blog/endeavour.md',
      data: {"description":"Learn about the Endeavour NASA space shuttle.","canonicalURL":"https://astro.build/blog/endeavour/","publishedDate":"Sat May 21 2022 00:00:00 GMT-0400 (Eastern Daylight Time)","modifiedDate":"Sun May 22 2022 00:00:00 GMT-0400 (Eastern Daylight Time)"},
      body: "Space Shuttle Endeavour (Orbiter Vehicle Designation: OV-105) is a retired orbiter...",
    },
    'enterprise.md': {
      id: '/Users/me/my-astro-project/src/content/blog/enterprise.md',
      data: {"description":"Learn about the Enterprise NASA space shuttle.","canonicalURL":"https://astro.build/blog/enterprise/","publishedDate":"Sat May 21 2022 00:00:00 GMT-0400 (Eastern Daylight Time)","modifiedDate":"Sun May 22 2022 00:00:00 GMT-0400 (Eastern Daylight Time)"},
      body: "Space Shuttle Enterprise (Orbiter Vehicle Designation: OV-101) was the first orbiter...",
    }
  }
}
```