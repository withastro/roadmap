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
<firstPost.Content />
```


# Motivation

## Background: Performance Issues

- **Performance (Speed):** Markdown rendering continues to be an expensive part of Astro's runtime. While we can look into faster renderers (ex: Goldmark) there is still a big inefficincy on our end with how we hold the tool. Astro currently renders markdown on import, which means that multi-file markdown imports (via both `import.meta.glob` and `Astro.fetchContent()`) block the response until all imported files are rendered, even if only a subset of these files are ever used on the page after filtering.
- **Performance (Memory):** For large projects, this also forces Astro to store all rendered Markdown output in memory at the same time, making it difficult to manage memory efficiently. Our community has reported builds maxing out memory limits in a project of only 800 markdown pages, and builds requiring 50+ GB of memory.
- **Infinite Loops:** By rendering during import, we also introduce a risk for infinite loops when we call `fetchContent()` in a Markdown layout used by a fetched page, bouncing between render and `fetchContent()` infinitely.

## Background: Usability Issues

- `Astro.fetchContent()` currently only supports Markdown files, which is confusing to some users.
- ESM `import` currently supports most file types *except* Markdown, which can work with `import` but you'll get back a different, undocumented  object API than if you'd used `fetchContent()`.
- `import.meta.glob()` is another API available to users, but its unclear how `Astro.fetchContent()` and `import.meta.glob` are related.
- Users still have difficulty using Markdown files in their projects due to legacy API decisions that we've been trying to move away from (ex: `.content -> `.Content`)

## RFC Goals

- Consolidate all of the existing markdown features into a single API
- Align with Vite and how other file formats are built & imported
- Keep a user-friendly API so that users don't need to use `import.meta.glob/globEager` themselves
- If possible, open up this "user-friendly API" to more file types, not just Markdown
- Solve the mentioned performance issues.



# Detailed design

## `Astro.glob()`

```diff
// 1.
// We convert `Astro.glob()` calls at the point of the call, so that Vite
// can do its glob-magic without us re-implementing the complexity on our end.
// This is currently done on Astro.fetchContent(), so no change needed to existing behavior.
- Astro.glob('./foo/*.md');
+ Astro.glob(import.meta.globEager('./foo/*.md'));
```

```ts
// 2.
Astro.glob = function<T=any>(importMetaGlobResult: Record<string, any>): Promise<T[]> {
  // Convert the `import.meta.globEager` result into an array.
  let allEntries = [...Object.values(importMetaGlobResult)];
  // Report an error if no objects are returned.
  // TODO: This may no longer be needed, since we changed Vite logging from error -> warn.
  if (allEntries.length === 0) {
    throw new Error(`Astro.glob() - no matches found.`);
  }
  // NOTE: This API was designed to be async, however we convert its argument to a resolve `globEager` 
  // object at compile time. We fake asynchrony here so that this API can still become async in the 
  // future if we ever move off of `import.meta.globEager()`. This should not impact users too much.
  return Promise.resolve(allEntries);
}
```

- This replaces `Astro.fetchContent()` as the new preferred API
- This should support 99% of usage, especially when importing Markdown.
- This is optional: for more advanced use-cases we will still document the lower `import.meta.glob` & `import.meta.globEager` Vite APIs as advanced fallbacks.
- This is Astro-only: Glob imports inside JS and framework components are also considered advanced usage to use the Vite APIs.

## Deferred Import Implementation

- This RFC seeks to refactor how Markdown is loaded internally AND update the Markdown API that users interact with. 
- The API updates are captured in `1.` below, while the refactoring is captured in `2.` and `3.`
- The logic that manages all of this lives in the internal `'astro:markdown'` Vite plugin.
- All Markdown files (ex: `src/posts/foo.md`) are resolved and loaded by this plugin.

1. `src/posts/foo.md?import`
    1. loads from file system
    2. parses frontmatter from the file into a JS object
    3. returns a JS module with the following JS:
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
    export function Content(...args: any) {
        return load().then((m: any) => m.default(...args))
    }
    export function getHeaders() {
        return load().then((m: any) => m.metadata.headers)
    }

    // Minor Implementation Detail: Needed so that you can do `<Content />` in a template.
    Content.isAstroComponentFactory = true; 
    ```

2. `src/posts/foo.md?content`
    1. loads from file system
    2. renders Markdown using `config.markdownOptions.render(source)`
    3. returns an Astro component representing the markdown content

3. `src/posts/foo.md`
    1. If we resolve an ID without a query param, we have to decide which to serve
    2. if `importer` is set, then its the user importing via `import.meta.glob` or `import.meta.globEager`
        1. **result:** resolve to `?import`
    3. if `importer` is null, then its Astro importing via `ssrLoadModule()` or `vite.build()`
        1. **result:** resolve to `?content` since this is a page

# Drawbacks

There is a complexity drawback in the implementation details outlined above where the resolved content of `src/posts/foo.md` is dynamic and changes based on the call to `resolveId`. This is a valid use of `resolveId()` (it supports the `importer` argument for this exact reason) BUT Vite's support here is rough and we'd appear to be the first to rely on this less-touched code path (ex: https://github.com/vitejs/vite/issues/5981). 

On initial investigation, I don't think an alternate implementation is possible since both `vite.build()`  and `import.meta.globEager` need to use the unmodified import without query params.  Vite's automated CI running on Astro should mitigate this somewhat. 


# Alternatives

A previous version of this RFC removed all helpers, and asked the user to use `import.meta.glob` &  `import.meta.globEager` Vite APIs directly themselves. This meant less maintainance/overhead for Astro, but the Vite API suffers from a few problems:

1. Not well documented outside of being an advanced Vite API
2. unneccesarily complex (ex: when do I use `import.meta.glob` vs. `import.meta.globEager()`. Also, what is `import.meta` anyhow?)

Based on feedback from the community, I revised this RFC and realized that we could keep the idea of a helper while still fixing some of the problems that plagued the current `Astro.fetchContent()` API. This new `Astro.glob()` has the following benefits over `Astro.fetchContent()`:

1. Not just for Markdown, this is a generalized wrapper around `import.meta.globEager()` for basic usage
2. Easy to understand the connection to `import.meta.glob()`, if your use-case needs that more flexible API
3. Easy to use, no need to know what `import.meta` and `globEager` do


# Adoption strategy

1. We update documentation to document `Astro.glob()` over `Astro.fetchContent()`, with helpful migration docs.
1. `Astro.fetchContent()` will be removed and throw an error, telling you to replace with `Astro.glob()`.

While this is a breaking adoption strategy, the error message will be clear and `fetchContent` is fairly easy to find-replace across your codebase.

The larger breaking change will be the fact that frontmatter data is no longer merged onto the main object (`post.title`), and is instead exported as `post.frontmatter.title`). Both our migration docs and the error message should help the user provide TS typings that will make these updates easier with TS errors inline.

# Unresolved questions

- None yet.
