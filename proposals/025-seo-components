- Start Date: 2022-08-19
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: <!-- leave empty -->

# Summary

Add built-in components to simplify adding TypeScript-checked SEO meta tags and `json+ld` to a page.


# Example

## `<SEO />` for `<head>` meta tags

```astro
---
import { SEO } from 'astro/components';
---

<SEO
  name="Astro"
  title="The Astro Blog | Astro"
  description="Get all the latest news from the Astroverse."
  twitter={{ handle: "astrodotbuild" }}
/>
```

## `<Schema />` for Json-LD

```astro
---
import { Schema, SEO } from 'astro/components';
import { BlogPosting } from 'schema-dts'; // re-export these from astro?

/** users define the metadata with full TypeScript validation from `schema-dts` */
const schema: BlogPosting = {
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://astro.build/blog/astro-1/"
  },
  "headline": "We are thrilled to announce Astro v1.0: a web framework for building fast, content-focused websites.",
  "description": "Astro 1.0 is out now! Astro is a web framework for building fast, content-focused websites. Performance powered by Astro next-gen island architecture. Learn more about Astro 1.0 release, our new website, and what people are saying about Astro.",
  "image": "https://astro.build/_image/assets/blog/astro-1-release-update/social_1200x600.jpg",  
  "author": {
    "@type": "Person",
    "name": "Fred Schott",
    "url": "https://twitter.com/FredKSchott"
  },  
  "publisher": {
    "@type": "Organization",
    "name": "",
    "logo": {
      "@type": "ImageObject",
      "url": ""
    }
  },
  "datePublished": "2022-08-09"
}
---

<Schema json={schema} />
```

# Motivation

Getting SEO meta tags and Json-LD can be tricky and error-prone.

SEO tags usually ends to a lot of duplication but really should exist on any content-focused site, why not build that right in?

Json-LD can be a beast to author manually, and requires a bit of leg work to ensure that everything is escaped properly before using `set:html` on a script tag. This spec is easily overlooked but can have a big impact on search rankings for content-heavy sites.

# Detailed design

## `<SEO>`

The `<SEO>` component will add `<meta>`, Open Graph, and Twitter tags for users.

The most common use case duplicates things like `title`, `description`, and `image` across all tags but it will support setting a value specific to Twitter or Open Graph.

**Note:** This component should still be included in the main `<head>` element and doesn't support lazy rendering the `<head>` similar to [react-helmet](https://github.com/nfl/react-helmet) or `<svelte:head>`.

## `<Schema>`

The `<Schema>` component is inspired by [`react-schemaorg`](https://www.npmjs.com/package/react-schemaorg) and powered by the [`schema-dts`](https://www.npmjs.com/package/schema-dts) package for full TypeScript definitions.

The component (1) adds type checking to validate user-provided schema JSON, (2) escapes the JSON data, and (3) outputs a `<script type="type="application/ld+json">` with the escaped schema.

Users can provide one or more schema object. If an array of related objects is provided, they will be included in a graph schema with the `@graph` syntax.

# Drawbacks

Both components cover quite a few subtle use cases and can get complex over time. I'm recommending we aim for the 80/20 rule of covering all common use cases + a few options rather than covering every single option possible.

# Alternatives

These components could live in userland as separate packages outside of the core `astro` project.

If one component has more support than the other, they can also be split out to spearate RFCs to avoid the extra churn.

# Adoption strategy

- This is a non-breaking change;
