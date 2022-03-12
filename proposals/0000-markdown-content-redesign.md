- Start Date: 03-10-2022
- Reference Issues: https://github.com/withastro/rfcs/discussions/5, https://github.com/withastro/rfcs/discussions/118
- Implementation PR: <!-- leave empty -->

# Summary

A v2.0 API for working with local Markdown files in Astro.

# Example

```astro
---
// BASIC USAGE:

// Note: Astro.fetchContent() removed in favor of direct `import.meta.globEager` usage
// Note: This works in non-Astro framework components!
const markdownFilesObj = import.meta.globEager('../posts/*.md');
const markdownFilesArr = Object.values(markdownFilesObj);
const markdownFilesFiltered = markdownFilesArr.filter(post => post.data.category === 'blog');

// Note: Individual markdown imports are now supported as well.
const firstPost = await import('../posts/first-post.md');
---
<!-- Data is parsed from frontmatter without requiring a render -->
<h1>{firstPost.data.title}</h1>
<p>Author: {firstPost.data.author}</p>
<p><a href={firstPost.url}>Permalink</a></p>
<!-- Defer rendering as late as possible for performance -->
<article>{firstPost.getContent()}</article>
```


# Motivation

- **Performance:** Markdown rendering continues to be an expensive part of Astro's runtime. While we can look into faster renderers (ex: Goldmark) there is still a big inefficincy on our end with how we hold the tool. Astro currently renders markdown on import, which means that multi-file markdown imports (via both `import.meta.glob` and `Astro.fetchContent()`) block the response until all imported files are rendered, even if only a subset of these files are ever used on the page after filtering.
- **Performance (Memory):** For large projects, this also forces Astro to store all rendered Markdown output in memory at the same time, making it difficult to manage memory efficiently. Our community has reported builds maxing out memory limits in a project of only 800 markdown pages, and builds requiring 50+ GB of memory.
- **Infinite Loops:** By rendering during import, we also introduce a risk for infinite loops when we call `fetchContent()` in a Markdown layout used by a fetched page, bouncing between render and `fetchContent()` infinitely.


# Detailed design

- This is implemented in a v2.0 of the internal `'astro:markdown'` Vite plugin
- All Markdown files (ex: `src/posts/foo.md`) are resolved and loaded by this plugin.

1. `src/posts/foo.md?import`
    1. loaded from file system
    2. frontmatter is parsed from the file
    3. a JS module is returned with the following JS:
    ```js
    `
    // Static:
    export const data = ${JSON.stringify(frontmatter)};
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

`Astro.fetchContent()` is deprecated here, in favor of the Vite `import.meta.glob` and `import.meta.globEager` APIs. 

Currently, we maintain a `Astro.fetchContent()` helper function to avoid users having to write `import.meta.glob` themselves. However, this is more complex than it looks and actually triggers a full Babel parse & traverse to work. In addition, it causes the following drawbacks:

- Only `.astro` files can use `Astro.fetchContent()`
- `@babel/traverse` used internally to rewrite `Astro.fetchContent()` to `import.meta.glob()`. Doing an AST traversal like this is expensive for such a small change to the AST.
- `Astro.fetchContent()` ended up being too limiting for many users, and today we often suggest users use `import.meta.glob` directly.

This RFC aims to remove `Astro.fetchContent()` entirely, and that users are better served by using the more polished/battle-tested `import.meta.glob` Vite API directly. Even if it feels more advanced than the current `Astro.fetchContent()`, it's better than maintaining two different APIs to do the same thing.

However, there are two alternatives that we can also consider:

1. Continue to support it as-is: `Astro.fetchContent()`
2. Support it as a more flexible helper function: `import {$content} from 'astro/util'`;

```js
// 1. Today
const markdownFilesArr = Astro.fetchContent('../posts/*.md');

// 2. Proposed API
const markdownFilesObj = import.meta.globEager('../posts/*.md');
const markdownFilesArr = Object.values(markdownFilesObj);

// 3. Alternative API
import {$content} from 'astro/util';
const markdownFilesArr = $content(import.meta.globEager('../posts/*.md'));
```

# Adoption strategy

1. `Astro.fetchContent()` will become deprecated, but not throw an error. It can continue to be a wrapper around `import.meta.globEager` for an easier migration.
2. We update our docs to document `import.meta.globEager` instead of `Astro.fetchContent()`
3. In Astro v1.0, we remove `Astro.fetchContent()`.

# Unresolved questions

- None yet.
