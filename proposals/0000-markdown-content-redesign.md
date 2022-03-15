- Start Date: 03-10-2022
- Reference Issues: https://github.com/withastro/rfcs/discussions/5, https://github.com/withastro/rfcs/discussions/118
- Implementation PR: <!-- leave empty -->

# Summary

A v2.0 API for working with local Markdown files in Astro.

# Example

```astro
---
// BASIC USAGE:
// Astro.fetchContent() replaced with a generalized `Astro.glob()` helper.
// This now works for non-MD files as well!
const markdownFilesArr = await Astro.glob('../posts/*.md');
const markdownFilesFiltered = markdownFilesArr.filter(post => post.frontmatter.category === 'blog');

// BASIC USAGE:
// Individual markdown imports are now supported as well!
const firstPost = await import('../posts/first-post.md');

// ADVANCED USAGE:
// You can also use the bare-metal `import.meta.glob/globEager` API
// This is useful in non-Astro files, like JSX and Vue.
const markdownFilesObj = import.meta.globEager('../posts/*.md');
const markdownFilesArr = Object.values(markdownFilesObj);
const markdownFilesFiltered = markdownFilesArr.filter(post => post.data.category === 'blog');
---
<!-- Data is parsed from frontmatter without requiring a render -->
<h1>{firstPost.frontmatter.title}</h1>
<p>Author: {firstPost.frontmatter.author}</p>
<p><a href={firstPost.url}>Permalink</a></p>
<!-- Defer rendering as late as possible for performance -->
<article>{firstPost.getContent()}</article>
```


# Motivation

- **Performance:** Markdown rendering continues to be an expensive part of Astro's runtime. While we can look into faster renderers (ex: Goldmark) there is still a big inefficincy on our end with how we hold the tool. Astro currently renders markdown on import, which means that multi-file markdown imports (via both `import.meta.glob` and `Astro.fetchContent()`) block the response until all imported files are rendered, even if only a subset of these files are ever used on the page after filtering.
- **Performance (Memory):** For large projects, this also forces Astro to store all rendered Markdown output in memory at the same time, making it difficult to manage memory efficiently. Our community has reported builds maxing out memory limits in a project of only 800 markdown pages, and builds requiring 50+ GB of memory.
- **Infinite Loops:** By rendering during import, we also introduce a risk for infinite loops when we call `fetchContent()` in a Markdown layout used by a fetched page, bouncing between render and `fetchContent()` infinitely.


# Detailed design

## `Astro.glob()`

TODO

## Deferred Implementation

- This is implemented in a v2.0 of the internal `'astro:markdown'` Vite plugin
- All Markdown files (ex: `src/posts/foo.md`) are resolved and loaded by this plugin.

1. `src/posts/foo.md?import`
    1. loaded from file system
    2. frontmatter is parsed from the file
    3. a JS module is returned with the following JS:
    ```js
    `
    // Static:
    export const frontmatter = ${JSON.stringify(frontmatter)};
    export const file = ${JSON.stringify(id)};
    export const url = ${JSON.stringify(url || undefined)};

    // Deferred:
    export default async function load(...args) {
        return (await import(${JSON.stringify(fileId + '?content')}));
    };
    export function getContent() {
        return load().then((m: any) => m.default)
    }
    export function getHeaders() {
        return load().then((m: any) => m.metadata.headers)
    }
    `
    ```

2. `src/posts/foo.md?content`
    1. loaded from file system
    2. render using `config.markdownOptions.render(source)`
    3. return an Astro component representing the markdown content

3. `src/posts/foo.md`
    1. If we resolve an ID without a query param, we have to decide which to serve
    2. if `importer` is set, then its the user importing via `import.meta.glob` or `import.meta.globEager`
        1. **result:** resolve to `?import`
    3. if `importer` is null, then its Astro importing via `ssrLoadModule()` or `vite.build()`
        1. **result:** resolve to `?content` since this is a page

# Drawbacks

There is a complexity drawback in the implementation details outlined above where the resolved content of `src/posts/foo.md` is dynamic and changes based on the call to `resolveId`. This is a valid use of `resolveId()` (it supports the `importer` argument for this exact reason) BUT Vite's support here is rough and we'd appear to be the first to rely on this less-touched code path (ex: https://github.com/vitejs/vite/issues/5981). On initial investigation, I don't think an alternate implementation is possible since both `vite.build()`  and `import.meta.globEager` need to use the unmodified import without query params.  Vite's automated CI running on Astro should mitigate this somewhat. 

The `import.meta.glob` and `import.meta.globEager` API is more complex to understand, vs. the very literal `Astro.fetchContent()`. This RFC takes the stance that the fact that these APIs are well-documented and battle-tested is worth the complexity cost vs. `Astro.fetchContent()`. However, see the "Alternatives" section below for a few different options for continuing to maintain an additional `Astro.fetchContent()` API as the "simple" interface.


# Alternatives

A previous version of this RFC removed all helpers, and asked the user to use `import.meta.glob` directly themselves. This meant less maintainance/overhead for Astro, but that API suffers from a few problems:

1. Not well documented outside of being an advanced Vite API
2. unneccesarily complex (ex: when do I use `import.meta.glob` vs. `import.meta.globEager()`. Also, what is `import.meta`?)

However, based on feedback from the community I realized that we could keep the idea of a helper while fixing some of the problems of `Astro.fetchContent()`. This new `Astro.glob()` has the following benefits over `Astro.fetchContent()`:

1. Not just for Markdown, this is a generalized wrapper around `import.meta.globEager()`
2. Easy to understand the connection to `import.meta.glob()`, if your use-case needs that more flexible API


# Adoption strategy

1. We update documentation to document `Astro.glob()` over `Astro.fetchContent()`, with helpful migration docs.
1. `Astro.fetchContent()` will be removed and throw an error, telling you to replace with `Astro.glob()`. 

# Unresolved questions

- None yet.
