- Start Date: 11/29/2021
- Reference Issues: https://github.com/withastro/astro/issues/1077, https://github.com/withastro/rfcs/discussions/1
- Implementation PR: 


# Summary

Finalize the component styling & scripting API for v1.0 with a new Component Tag (`@component`).

# Example

```astro
<style @component>
  h1 { color: red; }
</style>
<script @component>
  console.log('run once, in the browser');
</script>
<h1>Hello!</h1>
```

# Motivation

- Currently, we have an inconsistent API around styling and scripting an Astro component
  - `<style>` is scoped to the component by default, and you must opt-out via `<style global>`
  - `<script>` is raw by default, and you must opt-into component behavior (hoisting, uniqueness) via `<script hoist>`
- **We want** to remove as many inconsistencies as possible in v1.0
- **We need** component-level scripts and styles to be statically analyzable, for future SSR behavior
- **We want** any style/script "magic" to be explicit (no default behavior that is confusing in the context of a page component)
  - This is different from Svelte and Vue, whos API were originally designed only for components on the page.
- **We need** the ability to directly add inline styles and scripts on the page (ex: add google analytics to page)
  - Again, this is something that Svelte and Vue struggle with

# Detailed design

This document describes a new API: `@component` . Pronounced as the "Component Tag".

## `@component` General Info

- Identifies a virtual piece of the component that describes the component itself (its look, its behavior, etc)
  - This is different from every other part of the template, which describes some HTML to eventually render.
- Not a new type of directive: `@component` is the only `@` rule that should be supported.
- Not globally available: `<script @component>` and `<style @component>` are the only two supported.
- Easily statically analyzable by our parser
- Must be at the top-level of the template. Compiler error if conditional or nested in any way.
- Must be static. Compiler error if uses `define:vars` or any other runtime behavior.

## `<script @component>`

- Similar to `<script hoist>` today

## `<script>`

- Printed directly into the page HTML. May appear on the page multiple times.
- In the future, we could add some kind of of `is:unique` support.

## `<style @component>`

- Similar to `<style>` today, scoped and bundled

## `<style>`

- Valid HTML to appear in the body? **No**
- Unique, and hoisted into the head.
- Inlined directly into the page HTML, processed but unscoped.

# Drawbacks

## 1. Introduces a new kind of syntax rule. 

Even if `@component` is the only Component Tag that we plan to support, it may feel like more overhead, increasing the learning curve by some amount.

For example. A valid new user question would be: "are there other component tags that I need to learn about?"

For additional context, I've probably been one of the more anti-`@` advocates on the team in the past. I'm not sure if that matters but hopefully it emphasizes that all options have been weighed here. The use of `@` (or any other kind of new unique syntax) for something so unique (non-content, component-describing elements in the template) is a reasonable solution given the tradeoffs.

## 2. More verbose than just defaulting to component behavior.

`<script @component>` and `<style @component>` are more verbose than just defaulting to this behavior. This is an intentional design design to avoid default behavior that would be confusing to a new user of Astro.

# Alternatives

## 1. Skip the new syntax, just use a directive

```
<script astro:component>
<style astro:component>
```

- Pro: Already supported by the compiler
- Pro: No new rules need to be added to our language
- Con: This behavior is so much more complex than our other directives, that implementing and documenting its specialness will add a different kind of complexity around how powerful a directive can or can't be.  (see "`@component` Component Tag - General" section above)

## 2. Use multiple directives

```
<style is:scoped hoist:to="head">
<script is:unique hoist:to="body">
```

- Pro: More expressive, flexible
- Con: More difficult for first-time users
- Con: Similar to above, doesn't address that some of these directives will force the component to be top-level

## 3. Use a special "virtual" component syntax

```
<astro:style>    // or <component:style>
<astro:script> // or <component:script>
```

- Pro: Precedence, similar to `<svelte:head>`, etc.
- Pro: Even more unique, which makes it easier to define our own behavior without confusing for normal `<style>` and `<script>` expectations
- Pro: Similarly easy to statically analyze
- Con: Difficult to implement in our compiler
- Con: Looks like a directive, which is syntactically confusing for directive attributes

## 4. Remove component script support entirely

- Remove `<script hoist>` support and do not replace it with anything.
- If you want bundled script behavior, create a client-side component (React, Vue, etc).
- Note: In this case, the rest of this proposal would apply to `<style>` only

# Adoption strategy

1. Released support alongside our current `<script>` and `<style>` behavior
2. Disable current behavior in a future pre-v1.0 release, either for everyone or as an opt-in config

# Unresolved questions

- Unknown
