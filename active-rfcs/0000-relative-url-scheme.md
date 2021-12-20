- Start Date: 2021-12-20
- Reference Issues: [#46](https://github.com/withastro/rfcs/pull/46)
- Implementation PR: <!-- leave this empty -->

# Summary

Astro should support source-relative URL resolution in the HTML block of Astro files.

# Example

To resolve the source-relative URL of an image, use a `local:` prefixed URL.

```html
<img src="local:kitten.avif" alt="Kitten" />
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

A `local` scheme instructs Astro to resolve the URL relative to the source file.

```astro
<img srcset="local:kitten.avif 1x, local:kitten@2x.avif" alt="Kitten" />
```

```astro
<picture>
  <source srcset="local:media/kitten@2x.avif" media="(min-width: 800px)" />
  <img src="local:media/kitten.jpg" alt="" />
</picture>
```

```astro
<div style="background-image: url(local:kitten-background.avif);"></div>
```

```astro
<div data-my-framework-attr-for-image="local:kitten-background.avif"></div>
```

# Drawbacks

All attribute values need to be checked for `local:`. See alternatives below

The provided examples are intuitive and convenient for authors, but not immediately obvious to an implementer.

# Alternatives

- Limit support to `local:` prefixed attributes
  ```html
  <img local:src="kitten.avif" alt="Kitten" />
  ```
  - It’s not obvious if this would be more performant than checking every attribute for a `local:` prefix.
  - It’s even less obvious if this would be more performant when the attribute value may include multiple URLs (the `srcset`, `style`, or `data-` attributes), or wraps the URL in `url()`, `url("")`, `url('')`, etc.
- Limit support to `import` statements and do not support source-relative URLs in the HTML of `.astro` files.
  ```astro
  ---
  import kittenImage from './kitten.avif?url'
  ---
  <img src={kittenImage} alt="Kitten" />
  ```
  - All relative URLs in a `.astro` file would need to be added to the top of the file as imports.
  - All path imports would need to use a special directive, like `?url`. 
  - It is likely actual usage would be far less simple or visually co-located as in this example.
  - This would force authors to name imports, which would fatigue authors. <sup>[1](https://hilton.org.uk/blog/why-naming-things-is-hard)</sup>

# Adoption strategy

This proposal seeks to improve and replace `Astro.resolve`, but it is not necessary to drop `Astro.resolve` upon accepting this proposal.

# Unresolved questions

Will authors reasonably expect `local:` to work in other environments than HTML attribute values?

```html
<style>
:host {
  background-image: url(local:kitten.avif);
}
</style>
```