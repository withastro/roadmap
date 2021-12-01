- Start Date: 11/30/2021
- Reference Issues: https://github.com/withastro/rfcs/discussions/15
- Implementation PR:

# Summary

Finalize behavior around `<head>`, `<body>`, `<html>`, and `<!DOCTYPE html>` elements in Astro component templates.

# Motivation

@jonathantneal and I were chatting about [RFC: Finalize v1.0 style and script API for components](https://github.com/withastro/rfcs/pull/12) and discussing `<head>` behavior & bugs in Astro. We came to the realization that only supporting `<head>` in your top-level pages (and not in components) doesn't make sense for anyone using [layout components](https://docs.astro.build/core-concepts/layouts/), which can act as a component but often defines the entire `<head>`. This is a very common use-case for Astro users.

```astro
---
// src/pages/index.astro
import CommonLayout from '../layouts/CommonLayout.astro';
---
<!-- this is valid, where CommonLayout contains `<head>`, `<body>`, etc.
<CommonLayout someProp="..." />
```

This was something that we had supported in v0.20, which was accidentally removed as a part of the new compiler. Adding back this behavior could be considered a regression bug fix and not necessarily requiring an RFC (and I think Nate is already working on a fix for this to add back previous behavior), but this feels like a good time to commit to a larger plan around `<head>` and other similar HTML elements.

This same `<head>` problem applies to the `<body>` element, and may also apply to the `<html>` and `<!DOCTYPE html>` elements.

# Detailed design

- `<head>`
  - A `<head>` element can appear in any component, including pages, layouts, and simple UI components.
  - Astro will collapse (flatten) all `<head>` elements together from the top-level page to the lowest component into the final page `<head>`.
  - `<head>` elements are collected and printed in breadth-first order.
  - If no `<head>` elements are found in the final output, none will be output to the page.
  - This solves for the page layout problem AND gives us new head management support, similar to [`<svelte:head>`](https://svelte.dev/docs#svelte_head)
- `<body>`
  - completely ignored in a component template
  - a `<body>` tag is always included in the final output
  - everything in the component template is assumed to be the body
- `<html>`
  - completely ignored in a component template
  - an `<html>` tag is always included in the final output
- `<!DOCTYPE html>`
  - completely ignored in a component template
  - a `<!DOCTYPE html>` tag is always included in the final output

# Drawbacks

- `<head>` ordering - I'm not sure if this is easy to implement. Could use a prototype or expert set of eyes :)
- There's a small amount of interest in supporting developers who do not want their output to include `<body>`, `<head>`, or `<html>` in the final output. This is intentionally not supported by this proposal in an effort to reduce complexity. This is understood to be mostly for vanity (the bytes saved are minor) and as an Astro user you are already comfortable with Astro controlling/optimizing your final output. 
  - If this is sticking point, we can reword this from "intentionally not supported" to "out of scope / possible to implement in the future", but I think it's important to commit to this behavior as a team if there is no objection.
- There's a slightly larger amount of interest in supporting developers who do not want to their output to include `<body>`, `<head>`, or `<html>` in the templates, and instead relying on the compiler to handle this for them.  This makes some sense because this is valid in HTML and we try to match HTML semantics whenever possible.  This is currently treated as out-of-scope, but there is nothing here that blocks our ability to do this in the future. 
  - For example, our compiler could automatically detect some elements in the component template (for example, a `<title>`) and auto-hoist it out of the component body and into the `<head>` of the final compiler result to support this.

# Alternatives

- Do we warn if `<body>` _NEVER_ appears in the page's rendered component tree? appears twice?
  - @jonathantneal made the good point that `<body>` isn't actually required for valid HTML
- Do we warn if `<html>` _NEVER_ appears in the page's rendered component tree? appears twice?

# Adoption strategy

- This proposal is more relaxed than our existing rules, so this shouldn't be a breaking change for any existing users.

# Unresolved questions

- None yet.
