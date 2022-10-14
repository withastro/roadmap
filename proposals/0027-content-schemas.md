- Start Date: 2022-10-14
- Reference Issues: https://github.com/withastro/astro/issues/4307#issuecomment-1277978007
- Implementation PR:

# Summary

Content Schemas are a way to import Markdown and MDX content in your Astro projects in a consistent, performant, and type-safe way.

This introduces three new concepts:
- A new, magical directory that Astro will manage: `src/content/`
- A set of helper functions to load entries and collections of entries from this directory
- "Schemas" to type-check frontmatter data

## Out of scope

Before diving in, it's worth defining scope up-front: **⚠️ This RFC is focused on frontmatter parsing only.** This means any helpers described will _not_ help you **import** and **render** Markdown and MDX components.

We recognize this is a blocker to using any helpers described when you need to render a post's contents, as with `getStaticPaths`. This will be tackled in a separate RFC, and we will _not_ PR any features described here until that RFC is ready.

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
import { fetchContent, fetchContentByEntry } from 'astro:content';

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

# Motivation

There are two major problems this RFC addresses.

## Frontmatter should be easy to use and debug

First problem: **enforcing consistent frontmatter across your content is a lot to manage.** You can define your own types with a type-cast using `Astro.glob` today:

```astro
---
import type { MarkdownInstance } from 'astro';

const posts: MarkdownInstance<{ title: string; ... }> = await Astro.glob('./posts/**/*.md');
---
```

However, there's no guarantee your frontmatter _actually_ matches this `MarkdownInstance` type.

Say `enterprise.md` is missing the required `title` property for instance. When writing a landing page like this:

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

This is why schemas are a _huge_ win for a developer's day-to-day. You get autocomplete for properties that match your schema, and helpful hints to fix properties that don't.

## Importing globs of content can be slow

Second problem: **importing globs of content via `Astro.glob` [can be slow at scale.](https://github.com/withastro/astro/issues/4307#issuecomment-1277978007)** This is due to a fundamental flaw with importing: even if you _just_ need the frontmatter of a post, you still wait on the _content_ of that post to render as well. Though less of a problem with Markdown, globbing hundreds-to-thousands of MDX entries can add minutes to your build.

To avoid this, content schemas are **just** focused on processing and returning a post's frontmatter, **not** the post's contents. This should make Markdown and MDX equally quick to process, and should make landing pages quick to build and debug.

> ⚠️ **Note:** We also intend to tackle performant rendering of Markdown and MDX globs in a separate RFC. [See out-of-scope section](#out-of-scope) for more.

# Detailed design

# Drawbacks

# Alternatives

# Adoption strategy

# Unresolved questions
