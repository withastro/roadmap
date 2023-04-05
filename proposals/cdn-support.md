- Start Date: 2023-03-30
- Reference Issues: https://github.com/withastro/roadmap/issues/534
- Implementation PR: https://github.com/withastro/astro/pull/6714

# Summary

Provide a `build.assetsPrefix` option to specify a CDN URL for static assets to serve from in production.

# Example

```js
// astro.config.mjs
import { defineConfig } from 'astro'

export default defineConfig({
  build: {
    assetsPrefix: 'http://cdn.example.com'
  }
})
```

# Background & Motivation

Large traffic sites often have CDN servers that are optimized to serve assets only. For example, a site served from `https://astro.build` would reference all it's assets from `https://cdn.astro.build`.

A CDN URL would also allow assets from multiple sites to be deployed to the same CDN server to share the performance, where they can be separated by URL subpaths.

There are also prior art from other frameworks that users want in Astro too:

- Nextjs: https://nextjs.org/docs/api-reference/next.config.js/cdn-support-with-asset-prefix
- Nuxt: https://nuxt.com/docs/api/configuration/nuxt-config#cdnurl
- SvelteKit: https://kit.svelte.dev/docs/configuration#paths

# Goals

- Provide an option to prepend generated asset links with the CDN URL.
- Provide an env variable to access the CDN URL (`import.meta.env.*`) to prepend links manually.
- Works with static and server output.
- Works with existing Astro features, like content collections, `astro:assets` images, and `@astrojs/image`.

# Non-Goals

- Auto-prefixing CDN URLs to user-created `<link href>` or `<img src>` etc.
- Allow changing the CDN URL in runtime.
- Handling CDN URLs for files in the `public` directory.
  - Users have to preprend the URL themselves if needed.
- The Astro CDN service.

# Detailed Design

CDN support is added through the `build.assetsPrefix` config. For all generated asset links in the Astro codebase, before we only consider `base`:

```js
const assetLink = base + href
```

Now we also need to consider `assetsPrefix`:

```js
const assetLink = (assetsPrefix || base) + href
```

This needs to be applied everywhere, and maybe a utility might help with handling this.

`import.meta.env.ASSETS_PREFIX` is also added for end-users to manually concat strings for assets not controlled by Astro.

Other notes:

1. `assetsPrefix` takes precedence over `base` because `base` applies to the user-facing site only, not the CDN domain:
  - For example, the user visits `https://example.com/kaboom/` and it fetches assets from `https://cdn.example.com/_astro/explosion.123456.png`
2. `assetsPrefix` is _the_ prefix for the [`assets` option](https://docs.astro.build/en/reference/configuration-reference/#buildassets), which is `_astro` by default.
  ```
  https://cdn.example.com/_astro/explosion.123456.png
  |---------------------||-----||-------------------|
       assetsPrefix      assets      assets href
  ```

# Testing Strategy

We should have these test cases:

- CSS `<link>`
- Hydration scripts in `<astro-island>`
- Image `src` with both experimental assets feature and `@astrojs/image`
- Markdown asset links
- Content collections asset links

Make sure all links are prefixed with `assetsPrefix` in both static and server builds. A simple integration test to build and check the generated/rendered HTML should be enough.

# Drawbacks

1. This touches a lot of code everywhere.
2. We need to be concious of `assetsPrefix` if `base` had not already caused us a lot of issues before 🥲
3. Could be confusing with the `build.assets` option.
  - "Why is there both `assets` and `assetsPrefix` options?"

# Alternatives

No CDN support. That would block sites that need it.

# Adoption strategy

This should be transparent to all users. Only when `build.assetsPrefix` is used where the feature kicks in.

For third-party Astro libraries that contribute assets externally, they would need to consider `build.assetsPrefix` too. But I'm not aware of any libraries that does this (that's outside of Astro's asset pipeline).

# Unresolved Questions

1. Is the `build.assetsPrefix` name fine? I picked it to complement the existing `build.assets` option. `build.cdnUrl` feels "sticking out".



Optional, but suggested for first drafts.
What parts of the design are still to be determined?
