- Start Date: 2021-12-15
- Reference Issues:
    - [v1.0 API Unification](https://github.com/withastro/rfcs/discussions/1)
    - [Stale RFC](https://github.com/withastro/astro/issues/1827)
- Implementation PR:

# Summary

Currently, Astro does not have an explicit API for setting the `innerHTML` or `textContent` of an element. Since a primary use case for Astro is fetching and displaying content from remote sources, we need to support this in a way that is familiar to other frameworks.

# Example

**Current behavior**

This behavior is unique to Astro and unintuitive to most users.

```astro
---
const content = await fetch('https://trusted.com/remote-content.html').then(res => res.text());
---
<article>{content}</article>
```

**Proposed API**

This behavior is explicit, mirrors the standard [innerHTML](https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML) and [textContent](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent) DOM properties, and follows Astro's directive syntax (must include a `:`).

**set:innerHTML**

```astro
---
const content = await fetch('https://trusted.com/remote-content.html').then(res => res.text());
---
<!-- Injects unescaped HTML (for trusted content) -->
<article set:innerHTML={content} />
```

**set:textContent**

```astro
---
const content = await fetch('https://untrusted.com/remote-content.html').then(res => res.text());
---
<!-- Injects escaped text for untrusted content -->
<article set:textContent={content} />
```

# Motivation

These APIs can be considered "escape hatches" for Astro's `{expression}` syntax. Should Astro ever adopt an escaped-by-default approach for expressions (which is on the roadmap for v1.0), these escape hatches will be particularly important.

In the meantime, these APIs still provide value! 

1. Having an explicit prop-based API matches framework user expectations.

  - React has [`dangerouslySetInnerHTML`](https://reactjs.org/docs/dom-elements.html#dangerouslysetinnerhtml), which is intentionally verbose to discourage usage. The docs explicitly warn about it being a vector for XSS attacks.
  - Preact mirrors React's [`dangerouslySetInnerHTML`](https://github.com/preactjs/preact/issues/29), which is intentionally verbose to discourage usage. The docs do not explicitly mention this feature, except in React compatability guides.
  - Vue has [`v-html`](https://v3.vuejs.org/api/directives.html#v-html). The docs explicitly warn about it being a vector for XSS attacks.
  - Svelte has [`{@html ...}`](https://svelte.dev/docs#template-syntax-html). The docs explicitly warn about it being a vector for XSS attacks.
  - Solid has [`innerHTML` and `textContent`](https://www.solidjs.com/docs/latest/api#innerhtml%2Ftextcontent). The docs explicitly warn about it being a vector for XSS attacks.

2. This API is more explicit, which makes expected behavior clear.

  ```astro
  <!-- Behavior is intuitive. Dev understands the expected behavior. -->
  <article set:innerHTML={content} />
  <article set:textContent={content} />

  <!-- Behavior is unintuitive. Dev expectations may vary. -->
  <article>{content}</article>
  ```

# Detailed design

#### Compilation

The Astro compiler will need to be updated to detect `set:innerHTML` and `set:textContent` usage. This _must_ happen _in the compiler_ because it will change the way Astro handles built-in HTML elements.

Currently, built-in HTML elements are expected to be static&mdash;they are rendered as strings for performance reasons. In supporting these special props, Astro will need specific handling for elements with these props. The logic for this kind of rendering already exists for `Components` and `custom-elements`.

> **Given the following `.astro` code...**
> 
> ```astro
> <article set:innerHTML={content} />
> ```
> 
> **Our compiler generates something like this (simplified)**
> ```js
> html`<article${addAttribute('set:innerHTML', content)} />`
> ```
> 
> **If this RFC is accepted, our compiler will need to generate something more like this**
> ```js
> html`${renderElement('article', { 'set:innerHTML': content })}`
> ```
> 
> **Additionally, `set:textContent` will need special consideration to be escaped at runtime.**
> ```js
> html`${renderElement('article', { 'set:textContent': escapeHTML(content) })}`
> ```

Rather than refactoring all element rendering to `renderElement` function form, our compiler should _only_ handle elements with statically-analyzable `set:innerHTML` or `set:textContent` this way. This balances the performance benefits of storing _most_ HTML content as strings with the dynamic needs of this particular feature. The compiler complexity overhead will be small since there is no _entirely new_ behavior for the printer here.

#### Scenario A: `<element set:innerHTML={content} />` and `<element set:textContent={content} />`

✅ Supported. 

Compiler will inject `content` (for `innerHTML`) or `escape(content)` (for `textContent`) as the `default` slot of `element`. Renderers will not recieve the `set:innerHTML` or `set:textContent` props&mdash;these directives are compiler instructions only. Slots inside of `content` will be output literally (if possible, should warn in dev).

#### Scenario B: `<Component set:innerHTML={content} />` and `<Component set:textContent={content} />`

✅ Supported. 

Compiler will inject `content` (for `innerHTML`) or `escape(content)` (for `textContent`) as the `default` slot of `Component`. Renderers will not recieve the `set:innerHTML` or `set:textContent` props&mdash;these directives are compiler instructions only. Slots inside of `content` will be output literally (if possible, should warn in dev).

#### Scenario C: `<custom-element set:innerHTML={content} />` and `<custom-element set:textContent={content} />`

✅ Supported.

Compiler will inject `content` (for `innerHTML`) or `escape(content)` (for `textContent`) as the `default` slot of `custom-element`. Renderers will not recieve the `set:innerHTML` or `set:textContent` props&mdash;these directives are compiler instructions only. Slots inside of `content` will be output literally, which is expected behavior.

#### Scenario D: `<element set:innerHTML={content} set:textContent={content} />`

⛔️ Not Supported. 

Compiler will warn about duplicate `set:` directives.

#### Scenario E: `<element set:innerHTML={content} />`

✅ Supported.

Usage with self-closing tags is supported.

#### Scenario F: `<element set:innerHTML={content}></element>`

✅ Supported.

Usage with empty start/end tag pairs is supported.

#### Scenario G: `<element set:innerHTML={content}>text</element>` or  `<element set:innerHTML={content}><child /></element>` or  `<element set:innerHTML={content}>{expression}</element>`

⛔️ Not Supported. 

Compiler will warn about duplicate `set:` directive when any text, element, or expression children are passed.

#### Scenario H: `<element set:innerHTML={content}>   </element>`

**🤔 Open Question!**

Usage with start/end tag pairs containing only whitespace _should_ or _should not be_ supported? 

> Whitespace is technically a `text` node, but there are other cases where HTML has special handling for whitespace-only `text` nodes.

#### Scenario I: `<element {...{ 'set:innerHTML': content } />` (dynamic directive usage)

⛔️ Not Supported. 

Compiler will not know to compile this element using the dynamic format. We should warn if these directives are detected at runtime.

# Drawbacks

- Security. Having an explicit API for this can open users up to XSS Attacks. **Possible mitigation** Warn about this in documentation as other tools do.
- These directives require special consideration in the compiler, so implementation and maintenance cost are something to consider.
- This API differs slightly from other frameworks, so users need to learn something new.
- This is not a breaking change, but does introduce another way to do the same thing. **Possible mitigation** Introduce this feature _and deprecate `{html}` usage_ at the same time.

# Alternatives

#### ⛔️ Follow React's `dangerouslySetInnerHTML={{ __html: content }}` pattern

Astro is a server-side templating language, where setting `innerHTML` from a trusted remote source is a very common use case. This is an extra hoop for devs to jump through, so it is an unnecessary convention.

Other frameworks have chosen not to use convention to discourage this pattern.

#### ⛔️ A special `{@html}` directive like Svelte uses

We don't have a similar syntax construct in Astro, so this would feel out of place.

#### ⛔️ Do not prefix `innerHTML` or `textContent` OR prefix with a special character (`@`, `:`, `$`, etc)

Per convention, directives that have special meaning in Astro should contain a `namespace:` prefix.

#### ⛔️ Do not introduce these directives

While there are security concerns to HTML injection, it is a common use case that warrants consideration. Astro users often ask "how do I do `dangerouslySetInnerHTML` in Astro? This will give them a straight-forward answer.

# Adoption strategy

This is a non-breaking change that can be adopted gradually.

However, the Astro documentation should push this as _the blessed approach_ for HTML injection to start moving the community towards better practices and an explicit API.

# Unresolved questions

None

