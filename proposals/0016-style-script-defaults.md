- Start Date: 2022-03-15
- Reference Issues: [RFC0008](https://github.com/withastro/roadmap/tree/main/proposals/0008-style-script-behavior.md), [#65](https://github.com/withastro/roadmap/discussions/65)
- Implementation PR: <!-- leave empty -->

# Summary

Astro is inconsist between `<style>` and `<script>` default behavior. Currently, `<style>` has opt-out processing, but `<script>` does not. This RFC aims to settle on a good, consistent default for both `<style>` and `<script>`.

**This RFC is intended to supercede [RFC0008](https://github.com/withastro/roadmap/tree/main/proposals/0008-style-script-behavior.md).**

- New `is:inline` directive to avoid bundling `style` or `script`
- `<style>` => remains scoped, bundled by default. `is:scoped` directive supported for consistency
- `<style global>` => becomes `<style is:global>`
- `<script>` => becomes `<script is:inline>`
- `<script hoist>` => removed, becomes default `<script>` behavior. `type="module"` is implied

# Example

```astro
<style>
  @import './dep.css'; /* Vite imports supported, including npm packages! */
  h1 { color: red; }
</style>

<script>
  import cowsay from 'cowsay';
  console.log(cowsay('I am bundled with the rest of the website JS!'));
</script>

<h1>Hello!</h1>

<script is:inline>
console.log("I am literally inlined here on the page");
</script>
<style is:inline>
span { color: green; }
</style>
```

# Motivation

There have been [a few](https://github.com/withastro/roadmap/pull/12) [attempts](https://github.com/withastro/roadmap/discussions/65) to finalize this behavior and address these inconsistent APIs. This RFC aims to settle these questions prior to v1.0.

- Users are generally in favor of how we currently do scoped, processed, and optimized styles by default. It is logical to extend this feature to scripts.
- Inlining scripts and styles can be useful for anything that must exist inlined into the page, like Google Analytics. Users currently cannot do this for styles.
- Users currently have to remember syntax for styles and scripts that is unlike other Astro directives.
- Encourages our "optimized by default" / "pit of success" mentality. Smart scripts should be easy to use by default.

# Detailed design

### `is:inline`

A new directive, `is:inline`, will be introduced. This will opt both `<style>` and `<script>` tags out of _bundling_ behavior.

The `is:inline` directive means that `style` and `script` tags:

- **will not** be bundled into an external file
- **will not** be deduplicated—the element will appear as many times as it is rendered
- **will** be pre-processed, for example a `lang="sass"` attribute will still generate plain CSS
- **will** be rendered in the final output HTML where it is authored

### `is:scoped`, `is:global`

These new directives are for `<style>` tags. They represent scoped (the default) and global (previously `global`) styles.

`is:scoped` and `is:global` styles will be preprocessed, optimized, and bundled by Astro. This RFC intentionally does not propose any specific behavior for how these bundled styles are referenced in the final HTML output—this is an implementation detail that may change over time.

### `hoist` by default

Support for `<script hoist>` will be removed. This will become the default `<script>` behavior, where `type="module"` is implied and scripts are preprocessed, optimized, and bundled by default.

This RFC intentionally does not propose any specific behavior for how these bundled scripts are referenced in the final HTML output—this is an implementation detail that may change over time.

If any script tag has an attribute (ex: `type="module"`, `type="text/partytown"`, `async`) or directive (`define:vars`), it is implied to be `is:inline`. Astro should emit a warning that `is:inline` is recommended for clarity.

# Drawbacks

- Migration cost: this is a new, finalized syntax for behavior that already exists.
- `is:inline` may be verbose to add on any inline `<script>`.
- Defaults Astro to "opt-out of magic" rather than "opt-in to magic". Some people feel strongly about this.

# Alternatives

A few other attempts have been made at finalizing this API:

- https://github.com/withastro/roadmap/discussions/65
- https://github.com/withastro/roadmap/blob/main/proposals/0008-style-script-behavior.md#script
- https://github.com/withastro/roadmap/blob/6015b4da8c95258b2136d61d6a6290c7ca989f5a/active-rfcs/0000-component-tag.md

There is a clear need to address this inconsistency but we do not have a clear path forward yet.

## `Script` and `Style` components

One potential alternative would be to introduce magical `<Script>` and `<Style>` components. This was considered, but ultimately rejected because...

- Whether these components are available on `globalThis` or must be imported could lead to confusion
- These take Astro further away from similar frameworks like Vue and Svelte, which seem to have no problem with "magic by default" `script` and `style`.
- These are not actual runtime components that can be renamed or inspected, but rather instructions for the Astro compiler

## Use existing `is:raw` directive instead of introducing `is:inline`

Astro already has a concept of `is:raw`, which has some conceptual overlap with `is:inline`. However, `is:raw` is a generic compiler instruction for processing the children of _any tag_ as plain text. `is:inline` is a compiler instruction specific to `style` and `script` tags and changes how Astro processes that script or style.

# Adoption strategy

- This migration/breaking change should be clearly documented and communicated to users.
- Ideally we would introduce a codemod to ease this migration. This codemod would automatically:
  - Change any `global` directives on `style` to `is:global`
  - Add the `is:inline` directive to any `script` elements that do not specify `hoist`
  - Remove `hoist` and `type="module"` from any `script` element that uses them

# FAQs

- What happens for things like CodePen embeds?
  - Copy/Paste snippets CodePen embeds typically include a number of attributes on any `script` tags. Astro's compiler should warn you to add the `is:inline` attribute for clarity.
