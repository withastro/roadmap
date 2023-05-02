- Start Date: 2023-05-01
- Reference Issues: https://github.com/withastro/roadmap/issues/530
- Implementation PR: https://github.com/withastro/astro/pull/6850

# Summary

Introduce a standard to reference collection entries from other collections by ID.

# Example

References are defined in the content config using the `reference()` utility. This receives the collection name as the parameter:

```ts
// src/content/config.ts
import { reference, defineCollection, z } from 'astro:content';

const blog = defineCollection({
  schema: z.object({
    title: z.string(),
    author: reference('authors'),
  })
});

const authors = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
  })
})

export const collections = { authors, blog };
```

Now, blog entries can include `author: [author-id]` in their frontmatter, where the `[author-id]` is a valid entry ID for that collection. This example references a member of the `authors` collection, `src/content/authors/ben-holmes.json`:

```yaml
# src/content/blog/welcome.md
---
title: "Welcome to references!"
author: ben-holmes
---
```

This will validate the ID and return a reference object on `data.author`. To parse entry data, you can pass this reference to the `getEntry()` utility:

```astro
---
import { getEntry, getCollection } from 'astro:content';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map(p => ({
    params: { slug: p.slug },
    props: post,
  }))
}

const blogPost = Astro.props;
const author = await getEntry(blogPost.data.author);
const { Content } = await blogPost.render();
---

<h1>{blogPost.data.title}</h1>
<p>Author: {author.data.name}</p>
<Content />
```

# Background & Motivation

Content collections were designed to be configured and queried individually. But as users have started adapting collections to more complex patterns, there are compelling use cases to "reference" one collection entry from another:

- Reference "related posts" within a collection of blog posts.
- Create a collection of authors, and reference those authors from a collection of documentation pages.
- Create a collection of images with reusable alt text, and reference those images for article banners.
- Create a collection of tags with display text or icons, and reference those tags from a collection of blog posts.

These use cases span data collection -> content collection references, content -> content references, and even references within the same collection. These make a "reference" primitive compelling as collections types grow.

# Goals

- Introduce an API to reference collection entries from another collection, regardless of the collection type (content or data).
- Support references to other entries within the same collection.
- Consider Both one-to-one and one-to-many relationships between content and data (ex. allow passing a list of author IDs in your frontmatter).


# Non-Goals

- **First-class helpers for many-to-many references.** In other words, if a blog post has authors, Astro will not help retrieve blog posts by author. This will require manual querying for all blog posts, and filtering to find blog posts containing a particular author.

# Detailed Design

The `reference()` utility receives the collection name as a string, and validates this string at build-time using a Zod transform. This transform does _not_ attempt to import the referenced object directly, instead returning the referenced identifier and collection name after validating.

## Configuration

This example configures a `blog` collection with a few properties that use references:
- `banner` - entry in the `banners` data collection, containing image asset srcs and reusable alt text
- `relatedPosts` - list of entries in the current `blog` collection
- `authors` - list of entries in the `authors` data collection, containing author information

```ts
import { defineCollection, reference, z } from 'astro:content';

const blog = defineCollection({
  schema: z.object({
    title: z.string(),
    banner: reference('banners'),
    authors: z.array(reference('authors')),
    relatedPosts: z.array(reference('blog')),
  })
});

const banners = defineCollection({
  type: 'data',
  schema: ({ image }) => z.object({
    src: image(),
    alt: z.string(),
  })
});

const authors = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
  })
});

export const collections = { blog, banners, authors };
```

## Entry references

Entries are referenced by their `id` property for data collections, or by their `slug` property for content collections. These fit the recommended identifiers for each type.

This is an example blog post using the configuration above:

```yaml
# src/content/blog/welcome.md
---
title: "Welcome to references!"
banner: welcome # references `src/content/banners/welcome.json`
authors:
- ben-holmes # references `src/content/authors/ben-holmes.json`
- tony-sull # references `src/content/authors/tony-sull.json`
relatedPosts:
- getting-started # references `src/content/blog/getting-started.md`
```

## Querying

References return the `id` and `collection` (and `slug` for content collection entries) as an object. This is the example output when fetching the `welcome.md` file above using the new `getEntry()` helper:

```astro
---
import { getEntry, getCollection } from 'astro:content';
import { Image } from 'astro:asset';

const { data } = await getEntry('blog', 'welcome');
// data.banners -> [{ id: 'welcome.json', collection: 'banners' }]
// data.authors -> [{ id: 'ben-holmes.json', collection: 'authors' }, { id: 'tony-sull.json', collection: 'authors' }]
// data.relatedPosts -> [{ slug: 'getting-started', collection: 'blog' }]
---
```

These entries are intentionally unresolved for a few reasons:
- To avoid unnecessary work resolving entry data until you're ready to _use_ that data. This is similar to the `.render()` extension function for retrieving the `Content` component.
- To prevent circular type dependencies in your Zod schemas. This is especially true for self references like `relatedPosts`, which causes TypeScript issues when using tools like Zod for type inference.
- To prevent infinite resolution loops for nested references. Again, this is a risk for self references.

To retrieve entry data, pass a given reference to the `getEntry()` helper. This returns a type-safe result based on the id and collection name:

```astro
---
import { getEntry, getCollection } from 'astro:content';
import { Image } from 'astro:asset';

const { data } = await getEntry('blog', 'welcome');

const banner = await getEntry(data.banner);
const authors = await getEntry(data.authors);
const relatedPosts = await getEntry(data.relatedPosts);
const { Content } = await blogPost.render();
---

<Image src={banner.data.src} alt={banner.data.alt} />
<h1>{blogPost.data.title}</h1>
<p>Authors: {authors.map(a => a.data.name).join(', ')}</p>
<Content />

<h2>You might also like</h2>
{relatedPosts.map(p => <Card {...p} />)}
```

# Testing Strategy

- Integration tests for each combination of reference: content -> data, data -> content, content -> content, data -> data
- Unit tests for the `getEntry()` utility when resolving references
- Integration tests for self references

# Drawbacks

TODO

# Alternatives

TODO

# Adoption strategy

TODO

# Unresolved Questions

TODO