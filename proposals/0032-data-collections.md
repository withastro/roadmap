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

- **Separate RFC:** Referencing data collection entries from existing content collections. This unlocks referencing, say, an author from your blog post frontmatter. See the related RFC for details: [TODO: link]

# Detailed Design

This is the bulk of the RFC. Explain the design in enough detail for somebody
familiar with Astro to understand, and for somebody familiar with the
implementation to implement. This should get into specifics and corner-cases,
and include examples of how the feature is used. Any new terminology should be
defined here.

# Testing Strategy

How will this feature's implementation be tested? Explain if this can be tested with
unit tests or integration tests or something else. If relevant, explain the test
cases that will be added to cover all of the ways this feature might be used.

# Drawbacks

Why should we _not_ do this? Please consider:

- Implementation cost, both in term of code size and complexity.
- Whether the proposed feature can be implemented in user space.
- Impact on teaching people Astro.
- Integration of this feature with other existing and planned features
- Cost of migrating existing Astro applications (_is it a breaking change?_)

There are tradeoffs to choosing any path. Attempt to identify them here.

# Alternatives

What other designs have been considered? What is the impact of not doing this?

# Adoption strategy

Please consider:

- If we implement this proposal, how will existing Astro developers adopt it?
- Is this a breaking change? Can we write a codemod?
- Can we provide a runtime adapter library for the original API it replaces?
- How will this affect other projects in the Astro ecosystem?

# Unresolved Questions

Optional, but suggested for first drafts.
What parts of the design are still to be determined?
