- Start Date: 03-10-2022
- Reference Issues: <!-- related issues, otherwise leave empty -->
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
const firstPost = markdownFilesFiltered[0] || await import('../posts/first-post.md')
---
<!-- Data is parsed from frontmatter without requiring a render -->
<h1>{firstPost.data.title}</h1>
<p>Author: {firstPost.data.author}</p>
<p><a href={firstPost.url}>Permalink</a></p>
<!-- Defer rendering as late as possible for performance -->
<article>{firstPost.getContent()}</article>
<!-- Optional: Potential sugar to make this even easier -->
<article set:content={firstPost} />
<article><Content use={firstPost} /></article>
```


# Motivation

- **Performance:** Markdown rendering continues to be an expensive part of Astro's runtime. While we can look into faster renderers (ex: Goldmark) there is still a big inefficincy on our end with how we hold the tool. Astro currently renders markdown on import, which means that multi-file markdown imports (via both `import.meta.glob` and `Astro.fetchContent()`) block the response until all imported files are rendered, even if only a subset of these files are ever used on the page after filtering.
- **Performance (Memory):** For large projects, this also forces Astro to store all rendered Markdown output in memory at the same time, making it difficult to manage memory efficiently. Chris Bonger reached max memory limits in a project of only 800 markdown pages, and another user reported builds requiring 50+ GB of memory.
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
    export default function getContent() {
        return load().then((m: any) => m.default)
    }
    export default function getHeaders() {
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
    2. if `importer` is set, then its the user importing via `import.meta.glob`
        1. **result:** resolve to `?import`
    3. if `importer` is null, then its Astro importing via `ssrLoadModule()` or `vite.build()`
        1. **result:** resolve to `?content` since this is a page

# Drawbacks

There are few drawbacks to this conceptual approach: its an antipattern to run advanced rendering logic during an import stage for the reasons listed in the "Motivation" section above.

There is a complexity drawback in the implementation details outlined above where the resolved content of `src/posts/foo.md` is dynamic and changes based on the call to `resolveId`. This is a valid use of `resolveId()` (it supports the `importer` argument for this exact reason) BUT Vite's support here is rough and we'd appear to be the first to rely on this less-touched code path (ex: https://github.com/vitejs/vite/issues/5981). Vite's automated CI running on Astro should mitigate this somewhat.

On initial investigation, I don't think an alternate implementation is possible since both `vite.build()`  and `import.meta.glob` need to use the unmodified import without query params.


# Alternatives

`Astro.fetchContent()` is deprecated here, in favor of the Vite `import.meta.glob` and `import.meta.globEager` APIs. Currently, we use `Astro.fetchContent()` to avoid users having to write `import.meta.glob` themselves. However, this caused the following drawbacks:

- Only `.astro` files can fetch local markdown files
- `@babel/traverse` used internally to rewrite `Astro.fetchContent()` to `import.meta.glob()`. Doing an AST traversal like this is expensive for such a small change to the AST.
- `Astro.fetchContent()` ended up being too limiting for many users, and today we regularly suggest users use `import.meta.glob` directly.

An alternative approach could be to either keep `Astro.fetchContent()`, or use `fetchContent` as a much simpler imported helper, similar to the below:

```js
const markdownFilesObj = import.meta.globEager('../posts/*.md');
const markdownFilesArr = Object.values(markdownFilesObj);

// vs. 

import {content} from 'astro/util';
const markdownFilesArr = content(import.meta.globEager('../posts/*.md'));
```

This RFC takes the stance that this most likely not worth the effort, and that users are better served by using the more polished/battle-tested `import.meta.glob` Vite API directly even if it feels more advanced than the current `Astro.fetchContent()`. 


# Adoption strategy

1. `Astro.fetchContent()` will throw an error pointing to migration docs.
2. Direct calls to `import.meta.glob()` will change in a breaking way. We would document this in a migration guide. We could mitigate this with some throw errors if you access old properties on the new module interface. 

# Unresolved questions

- None yet.