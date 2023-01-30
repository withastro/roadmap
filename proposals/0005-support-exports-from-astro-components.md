<!-- LEGACY RFC -->
<p align="center"><strong>⚠️⚠️⚠️ Legacy RFC Disclaimer ⚠️⚠️⚠️
<br />This RFC does not meet the requirements of the current RFC process.
<br />It was accepted before the current process was created.
<br /><a href="https://github.com/withastro/roadmap#readme">Learn more about the RFC standards.</a>
</strong></p>
<!-- LEGACY RFC -->

---

- Start Date: 2021-06-17
- Reference Issues: N/A
- Implementation PR: N/A

# Summary

Allow exports from astro components.

**Background & Motivation**:

Related to https://github.com/withastro/astro/issues/491

I think an interesting pattern we could support is allowing astro files to export data:

```astro
---
import Markdown from "@astro/components";
import MainLayout from "@layouts/MainLayout.astro";
import Header from "@components/Header.astro";
export const title = "This is a title";
export const date = new Date("2021-08-17");
export const author = "McAuthor AuthorPants";
---

<MainLayout>
  <Markdown>
    <Header title={title}/>
    Hiya this is my content
  </Markdown>
</MainLayout>
```

- And then `Astro.fetchContent("**/*.astro")` would return a similar object to `Astro.fetchContent("**/*.md")` allowing components in markdown without too much effort..
- `import {...} from './SomeComponent.astro'` would return these exports.

**Proposed Solution**:

- At compile-time, all exported things are hoisted out of the render function (similar to what we do with `getStaticPaths()` today).
- If a hoisted thing references an un-hoisted variable, error in the compiler saying that exported things must be "pure" (aka can only reference other exported variables).
- Those exports are now available when you import a component (ex: `import {someExportedConst} from './Main.astro';`)
- Remove the markdown filtering from `Astro.fetchContent` to now support Astro components and pages as well.

### Open Questions

I think I remember https://github.com/withastro/astro/issues/309 ending with a comment that scoping would be complicated to solve?
