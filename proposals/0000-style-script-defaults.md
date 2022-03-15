- Start Date: 2022-03-15
- Reference Issues: [RFC0008](https://github.com/withastro/rfcs/tree/main/proposals/0008-style-script-behavior.md), [#65](https://github.com/withastro/rfcs/discussions/65)
- Implementation PR: <!-- leave empty -->

# Summary

Astro is inconsist between `<style>` and `<script>` default behavior. Currently, `<style>` has opt-out processing, but `<script>` does not. This RFC aims to settle on a good, consistent default for both `<style>` and `<script>`.

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

There have been [a few](https://github.com/withastro/rfcs/pull/12) [attempts](https://github.com/withastro/rfcs/discussions/65) to finalize this behavior and address these inconsistent APIs. This RFC aims to settle these questions prior to v1.0.

- Users are generally in favor of how we currently do scoped, processed, and optimized styles by default. It is logical to extend this feature to scripts.
- Inlining scripts and styles can be useful for anything that must exist inlined into the page, like Google Analytics. Users currently cannot do this for styles.
- Users currently have to remember syntax for styles and scripts that is unlike other Astro directives.
- Encourages our "optimized by default" / "pit of success" mentality. Smart scripts should be easy to use by default.

# Detailed design

### `is:inline`

A new directive, `is:inline`, will be introduced. This will opt both `<style>` and `<script>` tags out of bundling behavior.

### `is:scoped`, `is:global`

These new directives are for `<style>` tags. They represent scoped (the default) and global (previously `global`) styles.

### `hoist` by default

Support for `<script hoist>` will be removed. This will become the default `<script>` behavior, where `type="module"` is implied and scripts are preprocessed and bundled by default.

If any script tag has an attribute (ex: `src=`, `type="module"`, `async`) or directive (`define:vars`), it is implied to be `is:inline`. Astro should emit a warning that `is:inline` is needed for clarity.

# Drawbacks

- Migration cost: this is a new, finalized syntax for behavior that already exists.
- `is:inline` may be verbose to add on any inline `<script>`.
- Defaults Astro to "opt-out of magic" rather than "opt-in to magic". Some people feel strongly about this.

# Alternatives

A few other attempts have been made at finalizing this API:

- https://github.com/withastro/rfcs/discussions/65
- https://github.com/withastro/rfcs/blob/style-script-rfc/active-rfcs/0000-style-script-behavior.md#script
- https://github.com/withastro/rfcs/blob/6015b4da8c95258b2136d61d6a6290c7ca989f5a/active-rfcs/0000-component-tag.md

There is a clear need to address this inconsistency but we do not have a clear path forward yet.

# Adoption strategy

- This migration/breaking change should be clearly documented and communicated to users.
- Possibly introduce a codemod to ease migration?

# Unresolved questions

- What happens for things like CodePen embeds?
- Is `is:inline` really necessary or can any attribute make it implied?
- If `<script>` is so magical, should it become `<Script>`?
