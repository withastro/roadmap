- Start Date: 2021-12-20
- Reference Issues: [#46](https://github.com/withastro/roadmap/pull/46)
- Implementation PR: <!-- leave this empty -->

# Summary

Astro should support source-relative URL resolution in the HTML block of Astro files.

# Example

To resolve the source-relative URL of an image, use a `local:` prefixed attribute.

```astro
<img local:src="kitten.avif" alt="Kitten" />
```

# Motivation

In `.astro` files, it’s not always easy to know what a relative URL is relative to.

```astro
<img src="kitten.avif" alt="kitty" />
```

In this example, is `kitten.avif` relative to the output `.html` or the source `.astro`? Or, if this example is found within a component `.astro` file, is it relative to that component file?

This ambiguity raises a need for:

- An intuitive way to author URLs relative to a source file.
- An intuitive way to author URLs within the HTML of an `.astro` file.

# Detailed design

A `local` prefix before an attribute instructs Astro to resolve the attribute value as a URL relative to the source file.

```astro
<img local:src="kitten.avif" alt="Kitten" />
```

The attribute prefix treats the entire attribute value as the URL. This example is transformed by the compiler into the following the code:

```astro
<img src={await import('./kitten.avif?url')} alt="Kitten" />
```

# Drawbacks

This does not fully replicate `Astro.resolve`, and it does not support attribute values whose value is only partially a URL.

Attribute values with partial sources, like `srcset`, `style`, and and `data` attributes, are not handled. They could be handled in a separate, future RFC. While outside the scope of this proposal, a suggestion is a `local:` scheme.

# Alternatives

### Use a `local:` [scheme](https://developer.mozilla.org/en-US/docs/Learn/Common_questions/What_is_a_URL#scheme)

```astro
<img src="local:kitten.avif" alt="Kitten" />
```

This would support current uses, and allow additional references in `style`, `srcset`, or `data-` attributes, as well as support within wrappers like `url()`.

### Limit support to `import` statements and do not support source-relative URLs in the HTML of `.astro` files.

```astro
---
import kittenImage from './kitten.avif?url'
---
<img src={kittenImage} alt="Kitten" />
```

This is the current functionality and would require no change.

- Requires all paths to be added at the top.
- Requires all paths to be imported with a special directive (`?url`).
- Requires authors to write more JS and less HTML.
- Requires authors to name more things. <sup>[1](https://hilton.org.uk/blog/why-naming-things-is-hard)</sup>

# Adoption strategy

The `local` attribute is intended to improve and replace certain usages of `Astro.resolve`. Its addition does not require the removal of `Astro.resolve`.
