
- Start Date: 2023-04-15
- Reference Issues: [#556](https://github.com/withastro/roadmap/issues/556)
- Implementation PR: [withastro/astro#6659](https://github.com/withastro/astro/pull/6659)

# Summary

Provide a configuration to control inlining behavior of styles authored or imported in astro modules.

# Example

```ts
export default defineConfig({
    build: {
        // all styles necessary are sent in external stylsheets, default; maintains current behavior
        inlineStylesheets: "never"
    }
})
```
```ts
export default defineConfig({
    build: {
        // stylesheets smaller than `ViteConfig.build.assetsInlineLimit` (or 4kb if not defined by the user) are inlined
        inlineStylesheets: "auto"
    }
})
```
```ts
export default defineConfig({
    build: {
        // all styles necessary are inlined into <style> tags
        inlineStylesheets: "always"
    }
})
```

# Background & Motivation

There has been a constant interest in inlining styles while still taking advantage of scoping and other processing steps since before 1.0 (see: withastro/astro#918), with many users incorrectly assuming that `is:inline` directive is the solution (see: withastro/astro#6388).

Simple one-page websites do not benefit from an external stylesheet, since there is no other page that could use the cached stylesheet. On the other hand, large websites are overoptimized for cacheability, since our chunking splits the styles too granularly. Case in point, Astro docs homepage has 20 linked stylesheets, 14 of them are less than 1kb (see: withastro/astro#6528).

So far we have not provided a way to allow inlining stylesheets, prompting workarounds. However, coming from other frameworks, users might expect to be able to configure this behavior.
- SvelteKit allows configuring a threshold under which CSS files will be inlined:  https://kit.svelte.dev/docs/configuration#inlinestylethreshold
- Fresh lets plugins inject inline styles: https://fresh.deno.dev/docs/concepts/plugins#hook-render
- Nuxt has a global configuration: https://nuxt.com/docs/api/configuration/nuxt-config#inlinessrstyles

# Goals

- Provide a way to reduce the number of HTTP requests for stylesheets.
- Maintain current behavior when not explicitly configured.
- Works with both `server` and `static` outputs.

# Non-Goals

- Identify "critical" CSS rules.
- Enable a single external stylesheet.
- Preloading.
- Inlining of scripts.

# Detailed Design

The decision to inline a stylesheet should be made at build time (`astro build`), based on the `build.inlineStylsheets` and `vite.build.assetsInlineLimit` configuration options. We already use `assetsInlineLimit` elsewhere to decide if a script should be inlined. `build.inlineStylsheets` option could be set to either `"always"`, `"never"`, or `"auto"`. To stay consistent with the current behavior, the default value should be `"never"`. When `build.inlineStylsheets` is set to `"auto"`, `vite.build.assetsInlineLimit` should be respected. If `assetsInlineLimit` is undefined, a default threshold of 4kb should be used.

If the stylesheet is to be inlined, its contents should be added to `PageBuildData` of each page that it is used in. The asset should also be removed from vite's bundle to avoid unnecessary files in the output.

Astro has run into CSS ordering issues and currently ensures that the `<link>` tags are in a specific order. Currently, this order can't be guaranteed when some stylesheets are to be inlined as `<style>` tags: the rendering pipeline receives the two separtely and inserts all the `<link>` tags first. Therefore, an implementation must pass both inline and external stylesheets in the same array or set that preserves the order, and the rendering pipeline should make sure each `SSRElement` gets serialized with the appropriate tag.

# Testing Strategy

An implementation can be tested adequately with fixture-based tests, ensuring the DOM from SSR responses and generated `.html` files has the expected count of style and link tags and that they are placed in the expected order.

# Drawbacks

- Might lead to unexpected results with our current CSS chunking strategy - it tends to create a lot of tiny stylesheets, and each of them might be under the limit, leading to more CSS being inlined than the user might expect.

# Alternatives

- `astro-critters` integration: it's viable only for static builds of small sites, as it slows to a crawl trying to match every CSS rule against every DOM element on every page.
- `<style critical> ... </style>`: implementation cost, mental overhead for developers, lack of evidence that the granularity will be worth it.

# Adoption strategy

For now, inlining should be opt-in. In the future, we can consider making "auto" the default.

# Unresolved Questions

- Should the configuration be `build.inlineStylsheets: "never" | "always" | "auto"`? An alternative I've considered is `build.stylesheets: "external" | "inline" | "auto"`.
- Should the user need to set two configuration to control the cutoff point? I doubt many users will need to change the default, but they might have already set `vite.build.assetsInlineLimit` explicitly for a different use-case.
