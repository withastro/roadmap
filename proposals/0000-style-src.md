- Start Date: 2022-06-27
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: <!-- leave empty -->

# Summary

Introducing a new `<style src="">` idea to fix a conceptual bug around importing frontend styles in the server-side Astro frontmatter. Inspired by Vue and our current hoisted `<script src>` support.

# Example

```astro
<!-- Allowed: -->
<style src="../some-relative-file.css" />
<style src="bootstrap" />
<style src="@fontsource/roboto" />

<!-- Not allowed: -->
<style src="/a-file-living-in-public.css" />
```

```astro
---
// Still allowed, but no longer recommended.
import '../some-relative-file.css';
---
```

# Motivation

When we moved to static builds back in 2021, we had to make sure that CSS imports could be statically analyzed and detected during the build. We settled on using an ESM import for `src/` CSS files that could be automatically optimized and bundled during your build. `public/` CSS files could still use `<link href="">` tags since they were not optimized or bundled in any way.

```astro
---
// How we currently recommend importing external CSS into an Astro page or component.
import '../some-relative-file.css';
import 'bootstrap';
import '@fontsource/roboto';
---
```

There are two conceptual problems with using ESM imports for adding external CSS to your page.

1. **The Astro frontmatter is the "server" part of the Astro file.** This is where server-side logic is executed before rendering. This is different from the "template" part of the file, which controls the HTML that is rendered and output from the component/page.
2. **Adding CSS based on ESM imports is a side-effect.** We try to avoid side-effects from imports because they can be brittle, and hard to reason about. While this pattern is popular (especially in JSX ecosystems like React and Next.js) it is still not normally advised.

We shipped with this ESM import support for external CSS because it was already required for styling React, Preact, Solid, and Svelte components (who all rely on ESM imports for external CSS). However, there was strong interest in eventually moving away from this, due to feelings that it was "too JS-ey" for a less-JS-ey focused framework like Astro.

We also shipped `<script src>` support a long time ago, which solves this problem for JS. If you want to import an external script onto the page, you don't need to do so in the server-only frontmatter.

In looking for a similar solution for CSS, I learned about the Vue community's [`<style src="">`](https://vuejs.org/api/sfc-spec.html#src-imports) support. We already treat `<style>` and `<script>` as "magic" and owned by Astro's compiler to automate things like bundling and minifying. We also already have similar support for `<script src="">` in Astro to include an external script.


# Detailed design

- Add support for a new `<style src="">` attribute (outlined above) that includes a style on the page when the component is used.
- Behaves similar to how ESM imports of styles work today.
- Implementation wise, the logic is moved into the compiler, similar to how `<script src="">` works in the Astro compiler today.
- Does not work with `<style is:inline>`, since that is meant as a fallthrough to skip any compiler features like this. Also similar to how `<script is:inline>` works today.

# Drawbacks

#### It's a new, Astro-specific behavior

This is proposing a new, Astro-specific attribute that is not currently defined in the HTML spec. This has previously been a big drawback of proposals like this, however in past RFCs like [0016-style-script-defaults](https://github.com/withastro/rfcs/blob/main/proposals/0016-style-script-defaults.md) we have moved to being okay with non-spec behaviors in `<script>` and `<style>` as our only two "magic" tags that allow non-standard behavior when it benefits the user.

The Vue community's success with this solution to the same problem means that we would not be alone, and can take some comfort from the fact that it has happily been used for some time there.

#### It's not auto-scanning of styles

This RFC doesn't propose Auto-scanning the entire Astro component for assets like styles and images. However, it *does* create a step forward in this direction without breaking the "what you write is what you render" promises that we make for the Astro template (outside of our two blessed "magic" tags `<style>` and `<script>`).

IMO, this should be seen as a seperate feature and discussion from template scanning assets: it doesn't prevent us from tackling auto-scanning later. If we did tackle auto-scanning later, this feature would probably still make sense to maintain for parity with Astro's magic `<script src>`.

# Alternatives

The only alternative that I'm aware of is to do nothing, and continue to use ESM imports for CSS files. This continues to work technically, but does not resolve the two conceptual issues described above.

While Vue does support `<style src>`, Svelte does not. Svelte uses the same ESM imports that we do. While this is evidence that it is also okay to do nothing here, Svelte also was designed for a "frontend-first" world where every component is meant to run on the page. In that world, importing CSS inside of your `<script>` tag is not the same conceptual problem as it is for Astro, where our script is meant to be server-only.

# Adoption strategy

- Nate would add this as a new feature to the compiler.
- It would not be breaking.
- We would continue to support ESM imports of styles in frontmatter, but begin to shift documentation to use `<style src>` instead.

# Unresolved questions

- None yet.
