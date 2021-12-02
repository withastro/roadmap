- Start Date: 11/30/2021
- Reference Issues: https://github.com/withastro/rfcs/discussions/15
- Implementation PR:

# Summary

Finalize behavior around `<head>`, `<body>`, `<html>`, and `<!DOCTYPE html>` elements in Astro component templates.

# Motivation

in Astro v0.21, we have had user reports around `<head>` not acting as expected, breaking some projects from v0.20:
- https://github.com/withastro/astro/issues/2046
- https://github.com/withastro/astro/issues/2022

Some of these issues stem from undocumented or undefined behaviors in v0.20, like the fact that `<head>` could be conditional.

This RFC is an attempt to agree on and document the behavior of the `<head>`, `<body>`, and `<html>` tags in a way that makes sense, and can be communicated to users. It should support most common use-cases, such as layouts:

```astro
---
// src/pages/index.astro
import CommonLayout from '../layouts/CommonLayout.astro';
---
<!-- this is valid, where CommonLayout contains `<head>`, `<body>`, etc.
<CommonLayout someProp="..." />
```

## Goals

- Agree on and document the rules and behaviors of the `<head>`, `<body>`, and `<html>` tags.
- Support any component in the tree adding to the page `<head>`, similar to `<svelte:head>` or head manager libraries in React/Vue. 
  - (Note: see "Alternatives" for an alternative design if this is decided to be a non-goal).

## Non-Goals

- **Intentionally not implemented:** The ability or option to omit `<body>`, `<head>`, or `<html>` in the final output. This is intentionally not supported here in an effort to reduce complexity around when these tags might or might not be output in your final page HTML. As an Astro user, we assume that you are are comfortable with Astro controlling/optimizing your final HTML output.
  - If this is sticking point, we can reword this from "intentionally not supported" to "out of scope / possible to implement in the future", but I think it's useful to commit to this behavior as a team if there is no objection.
- **Out of scope / future:** The ability to author without `<body>`, `<head>`, or `<html>`, and relying on the compiler to handle them like the browser would.  This makes some sense because this is valid in HTML and we try to match HTML semantics whenever possible.  This is currently treated as out-of-scope, but there is nothing here that blocks our ability to do this in the future.
  - For example, our compiler could automatically detect some elements in the component template (for example, a `<title>`) and auto-hoist it out of the component body and into the `<head>` of the final compiler result to support this.
- **Out of scope / future:** Intelligent merging of repeated head elements. This is common when a top-level layout `<head>` might define a title, and then a more specific component might overwrite with a more specific `<title>` of its own. This is considered out of scope but not blocked to be implemented in the future.

# Detailed design

- `<head>`
  - A `<head>` element can appear in any component, including pages, layouts, and simple UI components.
  - The contents of a `<head>` element can be dynamic.
  - Astro will collapse (flatten) all `<head>` elements together from the top-level page to the lowest component into the final page `<head>`.
  - `<head>` elements are collected and and printed in the order that the components appear on the page.
  - If no `<head>` elements are used by the author, no head will be output to the page.
  - This solves for the page layout problem AND gives us new head management support, similar to [`<svelte:head>`](https://svelte.dev/docs#svelte_head)
- `<body>`
  - completely ignored in a component template
  - a `<body>` tag is always included in the final output
  - everything in the component template is assumed to be the body, other than the other elements listed here
- `<html>`
  - completely ignored in a component template
  - an `<html>` tag is always included in the final output
- `<!DOCTYPE html>`
  - completely ignored in a component template
  - a `<!DOCTYPE html>` tag is always included in the final output

## Implementation

Similar to how the Svelte compiler works, `head` elements would be collected in a `result.head` property by the compiler, seperate from the body of the template. 

The runtime would collect these across all rendered components on the page, and at the end of the page render would have the final collapsed `head` to print to the page. 

# Drawbacks

- `<head>` ordering - I'm not sure if this is easy to implement. Could use a prototype or expert set of eyes :)
- Does not support Streaming HTML for SSR. See "No `<head>` Collapsing" for an alternative approach that addresses this drawback. 

# Alternatives

## No `<head>` Collapsing

It is a goal to allow all components to add elements directly to `<head>`. If we remove this goal, then then we could consider a design that only allows one component to act as "page layout" and set the `<html>`, `<head>` and `<body>` tags and then all other components are just fragments, always assumed to be a part of the body. There seems to be interest in this goal from the community (see linked discussion for more) but this could still be up for debate if there is interest.

One reason to consider this is that it would make naive HTML streaming easier once we move to SSR. We could respond with the first component's `<head>` contents as soon as that one component renders, and then we would stream down its body as it rendered. As written, the current proposal does not support this since the head could be modified at any point in the document.

This may be much easier to implement in the current compiler, which would be a factor to consider. Looking for feedback on this.


# Adoption strategy

- This proposal is more relaxed than our existing rules, so this shouldn't be a breaking change for any existing users.

# Unresolved questions


- Do we warn if `<body>` _NEVER_ appears in the page's rendered component tree? appears twice?
  - @jonathantneal made the good point that `<body>` isn't actually required for valid HTML
- Do we warn if `<html>` _NEVER_ appears in the page's rendered component tree? appears twice?
