- Start Date: 11/29/2021
- Reference Issues: https://github.com/withastro/astro/issues/1077, https://github.com/withastro/rfcs/discussions/1
- Implementation PR: 


# Summary

Finalize the component styling & scripting API for v1.0 with a new Component Tag (`@component`).

# Example - UI Component

```astro
<style @component>
  @import './dep.css'; /* Vite imports supported, including npm packages! */
  h1 { color: red; }
</style>
<script @component>
  import cowsay from 'cowsay';
  console.log(cowsay('I am bundled with the rest of the website JS!'));
</script>
<h1>Hello!</h1>
```

# Example - Page or Layout Component

```astro
<head>
  <style @component>/* ... */</style>
</head>
<body>
  <script @component>/* ... */</script>
  <h1>Hello!</h1>
</body>
```


# Motivation

- Currently, we have an inconsistent API around styling and scripting an Astro component
  - `<style>` is scoped to the component by default, and you must opt-out via `<style global>`
  - `<script>` is raw by default, and you must opt-in to bundled behavior (hoisting, uniqueness) via `<script hoist>`
- **We want** to remove as many inconsistencies as possible in v1.0
- **We need** bundled scripts and styles to be statically analyzable, for future SSR behavior
- **We want** any style/script "magic" to be explicit (no default behavior that is confusing to a new user)
  - This is different from Svelte and Vue, whos API were originally designed only for individual components and not pages.
- **We need** the ability to directly add inline styles and scripts on the page (ex: add google analytics to page)
  - This is also something that UI frameworks often struggle with

# Detailed design

This document describes a new API: `@component` . Pronounced as the "Component Tag".

## `@component` General Info

- Identifies a virtual piece of the component that describes the Astro component itself (its look, its behavior, etc)
  - This is different from every other part of the template, which describes the output HTML.
- Not available on all types of elements: `<script @component>` and `<style @component>` are the only two supported.
- Not a new type of directive: `@component` is the only `@` rule that we want to supported.
- More aggressive than your normal directive: for example, no other attributes are allowed when the `@component` tag is used.
- Easily statically analyzable by our parser. 
- Must be easy to statically analyze. Must be top-level or nested inside of a `<head>`/`<body>` element
  - Compiler error if conditional or nested in any way.
- Must be static and cannot rely on runtime behavior in any way, so that it can be bundled once.
  - Compiler error if dynamic in any way (ex: uses `define:vars`).

## `<style>` (no tag)
- only works inside of `<head>`. Cannot be top-level in the template or used outside of `<head>`.
  - Always inlined in order into the `<head>`.
  - Supports hoisting a global style when combined with ["Collapsing `<head>` Behavior?"](https://github.com/withastro/rfcs/discussions/15)
- Contents are always unscoped/global.
- smart `@import` does not work. Will use raw URL specifier in the browser.
- more or less raw, untouched by Astro. ex: Sass not supported.

## `<style @component>`
- no other HTML attributes supported on the element, since the element is virtual.
- only works top-level in the template, or nested directly inside of `<head>`.
  - otherwise, compiler error
- always bundled with the rest of the website CSS
  - can't support inlining into page, because then `@imports` would fail
- scoped by default
  - opt-out with `is:global`

## `<script>` (no tag)
- works anywhere
- more or less raw, untouched by Astro
- printed directly to the page, inlined with the rest of template HTML  
- smart ESM `import` does not work, will use raw URL specifier in the browser
- In the future, we could add some kind of of `is:unique` support to prevent duplicate scripts.

## `<script @component>`
- Similar to `<script hoist>` today
- no HTML attributes supported (`type=`, `async`, `defer`, etc) because the element is virtual
- always bundled with the rest of the website JS
  - handled as if you had used a React/UI component on the page with `client:load` or `client:only`.
  - can't inline, because ESM `imports` would fail.




# Drawbacks

## 1. Introduces a new kind of syntax rule. 

Even if `@component` is the only Component Tag that we plan to support, it may feel like more overhead, increasing the learning curve by some amount.

For example. A valid new user question would be: "are there other component tags that I need to learn about?"

See "Alternatives 1." for an alternative approach that uses a directive instead of an `@` tag.


## 2. More verbose than just defaulting to component behavior.

`<script @component>` and `<style @component>` are more verbose than just defaulting to this behavior. This is an intentional design design to avoid default behavior that would be confusing to a new user of Astro.

# Alternatives

## 1. Skip the new syntax, just use a directive

```
<style astro:component>
// or:
<style is:component>
<style is:bundled>
<style astro:build>
```

- Pro: Already supported by the compiler
- Pro: No new rules need to be added to our language
- Pro: Would not conflict with [Alpine.js event handlers](https://alpinejs.dev/essentials/events#listening-for-simple-events) (see "Unresolved questions" below)
- Con: This behavior is much more complex than our other directives, so is directive really a good fit? For example, this would be the first directive to state that no other attributes can exist on a `script/style` tag because it is effectively virtual and must run as expected in the final bundle.

## 2. Use multiple directives

**Update:** This has effectively been merged into the current proposal, with the addition of an `is:global` opt-out for CSS scoping and the call-out of future support for uniqueness in `@component` scripts.

## 3. Use a special "virtual" component syntax

```
<astro:style>    // or <component:style>
<astro:script> // or <component:script>
```

- Pro: Precedence, similar to `<svelte:head>`, etc.
- Pro: Even more unique, which makes it easier to define our own behavior without confusing for normal `<style>` and `<script>` expectations
- Pro: Similarly easy to statically analyze
- Con: Not currently supported in our compiler
- Con: Looks like a directive, which is syntactically confusing for directive attributes
- Con: Both start and end tags would need to be updated `<astro:style></astro:style>`

## 4. Remove component script support entirely

- Remove `<script hoist>` support and do not replace it with anything.
- If you want bundled script behavior, create a client-side component (React, Vue, etc).

In this case, the rest of this proposal would apply to `<style>` only.

I think we can reuse enough logic from how `client:only` works that this may not cost us much in terms of implemention. In which case, I think it makes sense to keep. Still TBD if this is true though, will need a prototype to confirm.

# Adoption strategy

1. Released support alongside our current `<script>` and `<style>` behavior
2. Disable current behavior in a future pre-v1.0 release, either for everyone or as an opt-in config

# Unresolved questions

- Is `@component` okay to use for Alpine.js? `@click` is short for `x-on:click`, which means these will only ever be used with events. I don't think a `component` event would ever reasonably be supported, so I think this is okay to support. However, it does add a bit of overlap for Alpine.js users, which could be an argument in favor of using a directive instead.
