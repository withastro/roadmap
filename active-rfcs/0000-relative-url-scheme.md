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

### Example with `img[srcset]`

```astro
<img srcset="local:kitten.avif 1x, local:kitten@2x.avif" alt="Kitten" />
```

That example could be transformed into or handled as tho it were written like this:

```astro
<img srcset=`${import('./kitten.avif?url')} 1x, ${import('./kitten@2x.avif?url')}` alt="Kitten" />
```

### Example with mixed `source[srcset]` and `img[src]`

```astro
<picture>
  <source srcset="local:media/kitten@2x.avif" media="(min-width: 800px)" />
  <img src="local:media/kitten.jpg" alt="" />
</picture>
```

```astro
<picture>
  <source srcset={import('local:media/kitten@2x.avif')} media="(min-width: 800px)" />
  <img src={import('local:media/kitten.jpg')} alt="Kitten" />
</picture>
```

### Example with `[style]`

```astro
<div style="background-image: url(local:kitten-background.avif);"></div>
```

### Example with a data attribute

```astro
<div data-my-framework-attr-for-image="local:kitten-background.avif"></div>
```



# Drawbacks

The provided examples are intuitive and convenient for authors, but it may not be immediately obvious to the implementer, as this would be the first schema.

# Alternatives

1. Limit support to `local:` prefixed attributes
  ```html
  <img local:src="kitten.avif" alt="Kitten" />
  ```
  - A namespaced attribute would be more complex for both the author and the implementer than a [scheme](https://developer.mozilla.org/en-US/docs/Learn/Common_questions/What_is_a_URL#scheme) when assets are referenced in `style`, `srcset`, or `data-` attributes with `url()`. Those are all common techniques used on the web. A namespaced attribute would also necessitate a more careful parsing of `srcset` and `url()`, or otherwise the loss of that functionality entirely if it were deemed too complex. By limiting `local:` to URLs, we reduce this complexity and give this functionality the freedom to be applied to other usecases in the future.
2. Limit support to `import` statements and do not support source-relative URLs in the HTML of `.astro` files.
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