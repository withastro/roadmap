- Start Date: 2022-01-04
- Reference Issues: [#1909](https://github.com/withastro/astro/issues/1909), [#1762](https://github.com/withastro/astro/issues/1762)
- Implementation PR: 



# Summary

Preserve specificity in scoped CSS, consistent with the specificity in global CSS.

Astro currently adds an additional class to all elements and selectors, increasing specificity from `O+1` to `O(1)+1`.

Astro can prevent this specificity increase by wrapping the scoping mechanism in a `:where()` CSS pseudo-class.



# Example

```astro
<style>
p {
  color: blueviolet;
}

aside p {
  color: darkviolet;
}

:global(aside) p {
  text-decoration: underline;
}
</style>
<p>This is a paragraph.</p>
<aside>
  <p>This is a paragraph in an aside.</p>
</aside>
```

In this example, the HTML and CSS would generally transform into the following code:

```astro
<style>
p:where(.astro-OZV3B5RX) {
  color: blueviolet;
}

aside:where(.astro-OZV3B5RX) p:where(.astro-OZV3B5RX) {
  color: darkviolet;
}

aside p:where(.astro-OZV3B5RX) {
  text-decoration: underline;
}
</style>
<p class="OZV3B5RX">This is a paragraph.</p>
<aside class="OZV3B5RX">
  <p class="OZV3B5RX">This is a paragraph in an aside.</p>
</aside>
```

| Authored Selector  | Compiled Selector                                                                   | Authored Specificity | Compiled Specificity |
|:------------------ |:----------------------------------------------------------------------------------- |:--------------------:|:--------------------:|
| `p`                | `p:where(.astro-OZV3B5RX)`                                            | `0.0.1`              | `0.0.1`              |
| `aside p`          | `aside:where(.astro-OZV3B5RX) p:where(.astro-OZV3B5RX)` | `0.0.2`              | `0.0.2`              |
| `:global(aside) p` | `aside p:where(.astro-OZV3B5RX)`                                      | `0.0.2`              | `0.0.2`              |


By using `:where()`, styles will now:

- respect the specificity with which they were authored.
- work consistently alongside other CSS files or CSS libraries.
- still preserve the exclusive boundaries that prevent styles from applying outside the component.



# Motivation

Astro component styles are scoped by default, meaning they only apply to items in the component.
These are _exclusive_ styling boundaries that prevent styles from applying to items outside the component or within child components.

This specificity increase is perceptually inconsistent to authors, without a deeper knowledge of the Astro internals and **Type**, **ID**, add **Class** selector specificity.
This specificity increase makes it hard to combine with other CSS files or other styling libraries (Tailwind, CSS Modules, Styled Components, Stitches), as those systems would not include our additional side-effects.

From the earlier example, the HTML and CSS currently transforms into the following code:

```astro
<style>
p.astro-OZV3B5RX {
  color: blueviolet;
}

aside.astro-OZV3B5RX p.astro-OZV3B5RX {
  color: darkviolet;
}

aside p.astro-OZV3B5RX {
  text-decoration: underline;
}
</style>
<p class="OZV3B5RX">This is a paragraph.</p>
<aside class="OZV3B5RX">
  <p class="OZV3B5RX">This is a paragraph in an aside.</p>
</aside>
```

| Authored Selector  | Compiled Selector                                                   | Authored Specificity | Compiled Specificity |
|:------------------ |:------------------------------------------------------------------- |:--------------------:|:--------------------:|
| `p`                | `p.astro-OZV3B5RX`                                    | `0.0.1`              | `0.1.1`              |
| `aside p`          | `aside.astro-OZV3B5RX p.astro-OZV3B5RX` | `0.0.2`              | `0.2.2`              |
| `:global(aside) p` | `aside p.astro-OZV3B5RX`                              | `0.0.2`              | `0.1.2`              |



# Detailed design

Update the compiler to append `:where(.astro-XXXXXXXX)` rather than `.astro-XXXXXXXX`.

```css
/* Before (specificity of 0.1.1) */
h1.astro-XXXXXXXX {}

/* After (specificity of 0.0.1) */
h1:where(.astro-XXXXXXXX) {}
```



# Drawbacks



### Specificity increases on purpose

Some authors may rely on the specificity increase purposefully.

However, authors relying on the specificity increase in our current implementation are still vulnerable to perceptually inconsistent and less unpredictable behavior when using CSS files or other styling libraries.



### Legacy browser support

The `:where` selector is supported in all browsers that also support `astro dev`. Legacy browsers, such as Internet Explorer, do not support `:where`.

However, browsers that would not support the proposed solution do not support other existing features core to Astro, such as CSS Custom Properties or JavaScript modules.

There is also a work-around. Authors wishing to avoid `:where` could use `<style global>`.
