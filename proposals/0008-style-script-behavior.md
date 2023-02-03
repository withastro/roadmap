- Start Date: 12/09/2021
- Reference Issues: https://github.com/withastro/astro/issues/1077, https://github.com/withastro/roadmap/discussions/1
- Implementation PR:

# Summary

Finalize the component styling & scripting behavior for v1.0.

# Important Note for Reviewers

This RFC proposes very little new behavior, and mainly exists to document current behavior and make sure we have a clear, shared understanding about how Astro should work as we head into a v1.0 release.

When reviewing, feel free to ask questions and give feedback on current behavior as well as new behavior. However, be aware that changes to current behavior may be out of scope of this RFC and may require their own RFC seperate from this one.

# Example - UI Component

```astro
<style>
  @import './dep.css'; /* Vite imports supported, including npm packages! */
  h1 { color: red; }
</style>

<style global>
  /* Styles applied globally to the page. */
  body { padding: 5px; }
</style>

<script>
  console.log('included as-is in the final HTML page output.')
</script>

<script hoist>
  import cowsay from 'cowsay';
  console.log(cowsay('I am bundled with the rest of the website JS!'));
</script>

<h1>Hello!</h1>
```

# Example - Page or Layout Component

```astro
<head>
  <style>/* ... */</style>
  <style global>/* ... */</style>
</head>
<body>
  <script>/* ... */</script>
  <script hoist>/* ... */</script>
  <h1>Hello!</h1>
</body>
```

# Motivation

## Goals

- **We need** to finalize style/script behavior before releasing Astro v1.0.
- **We need** to document and test that behavior before releasing Astro v1.0.
- **We need** style/script bundling behavior to work before render, both for performance and for SSR-readiness.

## Non-Goals

- Non-trivial changes to current behavior. See "Important Note for Reviewers" above.

# Detailed design

## `<style>`

```astro
<!-- INPUT: -->
<style>h1 { color: red; }</style>

<!-- OUTPUT: -->
<style>h1.astro-ABCDEF { color: red; }</style>
```

### Current Behavior

- Style content is scoped to the component.
  - opt-out of this with `<style global>`, see below
- Style content is processed, ex: Sass is supported.
- Style content is added to the module graph and bundled with the rest of the page CSS.
- `@import` will be resolved using Vite's current `@import` resolve logic.
- No `<style>` tag is output in the final component HTML.
- No HTML attributes supported on the element, since the element is virtual and never output.

### New RFC Behavior

- Cannot be nested within a template expression or conditional. Bundled styles must be scanned by the compiler. This is currently easy to break in v0.21 with something like `{alwaysFalse && <style>...` so this RFC moves to remove support for this. This change shouldn't impact many users.
- Can only exist top-level in the template (best for components) or nested directly inside of `<head>` (best for pages/layouts). This is to guarentee that scanning and reading hoisted script content is straightforward and bug-free. This shouldn't affect many users.

### Deep Dive: define:vars

Even though `<style define:vars={...}>` is all about adding dynamic content, it should still continue to work with statically bundled CSS. This is because the CSS variable is referenced in the static `<style>` contents via `var(--foo)`, which can be safely bundled with the rest of your page CSS. Then, during the page render at runtime, the component will add a `<style>` tag to the page that defines the `--foo` variable.

Note that this will continue to have issues with some use-cases. For example, if a component is used twice on the page, the dynamic value may change across different renders but would impact all components on the page. You can see an example of this here, where the last rendered component wins: https://stackblitz.com/edit/github-eww5sz?file=src%2Fcomponents%2FTour.astro&on=stackblitz

## `<style global>`

```astro
<!-- INPUT: -->
<style global>h1 { color: red; }</style>

<!-- OUTPUT: -->
<style>h1 { color: red; }</style>
```

### Current Behavior

- Same behavior described above, but not scoped to the component.

## `<script>`

```astro
<!-- INPUT: -->
<script>console.log('fired!');</script>

<!-- OUTPUT: -->
<script>console.log('fired!');</script>
```

### Current Expected Behavior

- Script content is escaped safely, but otherwise untouched by Astro. ex: TypeScript not supported.
- ESM import will not be resolved or bundled, sent untouched/raw to the browser. This is required because imports to `src/` files and `npm` packages would not exist in production, and need to be known and bundled ahead-of-time.
- Will be output in the final component render(), useful for adding global JS.
- May be duplicated if this component appears on the page multiple times.
  - In the future, we could add some kind of of `is:unique` support to prevent duplicate scripts.

### New Behavior

- Note that v0.21 may have accidentally added support for npm package imports in un-hoisted scripts as a side-effect of running all rendered scripts through Vite's build pipeline. However, this is impossible to support in a world of static builds, where our compiler may not be able to detect script contents and could not bundle the script with the rest of the page JavaScript. Therefore we need to remove this side-effect for now. If this is possible, we could revisit adding back in a future RFC.

## `<script hoist>`

```astro
<!-- INPUT: -->
<script hoist>
  import cowsay from 'cowsay';
  console.log(cowsay('I am bundled with the rest of the page JS!'));
</script>

<!-- OUTPUT: -->
<!-- JS is bundled with the rest of your page JavaScript. -->
```

### Current Behavior

- Script content is processed, ex: TypeScript could potentially be supported.
- Script content is added to the module graph and bundled with the rest of the page JS.
- ESM imports will be resolved using Vite's ESM import resolve logic.
- No HTML output in the component template.
- no HTML attributes supported (`type=`, `async`, `defer`, etc) because the element is virtual.

### New RFC Behavior

- `<script hoist>` contents must be static, therefore `define:vars` is not supported. Because the script is bundled ahead-of-time, dynamic values won't exist. This is currently easy to break in v0.21, so this RFC proposes removing the support entirely for `<script hoist>` (still available for `<script>` and `<style>`).
- Cannot be nested within a template expression or conditional. Bundled scripts must be scanned by the compiler. This is currently easy to break in v0.21 with something like `{alwaysFalse && <script hoist>...` so this RFC moves to remove support for this. This change shouldn't impact many users.
- Can only exist top-level in the template (best for components) or nested directly inside of `<head>` or `<body>` (best for pages/layouts). This is to guarentee that scanning and reading hoisted script content is straightforward and bug-free. This shouldn't affect many users.

# Drawbacks

- None yet.

# Adoption strategy

This RFC proposes very little new behavior, so this should have little impact on existing users.

For the new restrictions that the RFC does propose, we will give clear warnings or errors for code that does not match these new restrictions. All new restrictions are meant to explicitly prevent you from writing buggy code, so impact of rolling this out should be overall positive.

# Unresolved questions

- None yet.
