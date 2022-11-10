- Start Date: 2022-11-09
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: <!-- leave empty -->

# Summary

With this proposal it will be possible to build Astro sites that can be deployed to any path on any domain regardless of the base. This will be done through an new config option `build.linkStyle`.

With this option you can tell Astro to build links (for assets like scripts an styles) to be absolute (the default and current behavior) or relative (relative to the base).

# Example

By default Astro will continue to add links with absolute paths from the `base`. For example with this config:

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  base: '/docs',
  build: {
    linkStyle: 'absolute'
  }
});
```

Your CSS will build to this:

```html
<link rel="stylesheet" href="/docs/assets/main.hash.css">
```

Using the `relative` config option:

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  build: {
    linkStyle: 'relative'
  }
});
```

You'll instead get this:

```html
<link rel="stylesheet" href="../assets/main.hash.css">
```

# Motivation

We often get support questions on how to deploy an Astro site without knowing the base in advance. There has been discussions and RFCs to solve this problem such as [this one](https://github.com/withastro/rfcs/discussions/334) and [this one](https://github.com/withastro/rfcs/discussions/23).

People have tried to use `./` in the `base` option to make this happen to, such as in [this issue](https://github.com/withastro/astro/issues/4229).

The primary use-case is wanting to deploy a site that might live under multiple subdomains. Using relative links makes it portable.

# Detailed design

This new configuration option will affect these types of assets:

- Link tags added by us from bundled CSS.
- Hoisted script tags added by us from bundled hoisted scripts.
- Links to scripts added to `<astro-island>`s.

Any other type of asset, such as images, are not controlled by Astro and will continue to not be so. The developer will need to make these links relative themselves. They can also use the `<base>` tag to make this easier.

## Implementation

During the build when we go to generate pages there are a few places where we resolve the final URL for links.

- For link tags it is done [here](https://github.com/withastro/astro/blob/c0cb65b18db888ed46fe9a0b7d66d062de245f5e/packages/astro/src/core/build/generate.ts#L300).
- For hoisted scripts it is [here](https://github.com/withastro/astro/blob/c0cb65b18db888ed46fe9a0b7d66d062de245f5e/packages/astro/src/core/build/generate.ts#L301)
- For links added to astro-islands it [is here](https://github.com/withastro/astro/blob/c0cb65b18db888ed46fe9a0b7d66d062de245f5e/packages/astro/src/core/build/generate.ts#L352).

We should generalize this logic so that there's one function that gets called to resolve the URL given the `linkStyle` option, as well as the base and subpath. That function will use the `linkStyle` config to determine which algorithm to use.

For SSR the same things are done [here](https://github.com/withastro/astro/blob/c0cb65b18db888ed46fe9a0b7d66d062de245f5e/packages/astro/src/core/app/index.ts#L63) for example. Again, this should be consolidated so we're not doing the same sort of logic in many different places, creating areas for bugs. Instead SSG and SSR should use shared logic.

## 404.astro

If using `linkStyle: 'relative'` a 404.astro page __will not be allowed__. This is because it is impossible to make these links be relative in SSG mode. That's because a 404.astro might be used by paths such as:

- /foo/
- /foo/bar/
- /foo/bar/baz/

If we statically generate relative links then these will be incorrect. So we will throw an error if using a 404.astro page with `'relative'` and suggest using `'absolute'` instead.

## Imported images

Images that are imported will *not* be relative. That means this:

```astro
---
import penguinUrl from '../assets/penguin.png';
---

<img src={penguinUrl} />
```

It might be *possible* to make this work through a Vite plugin but would be a bit of work and might be error prone. 

# Testing strategy

Given that resolving URLs will be done in a few places, it makes sense to create a module within `src/core` for this algorithm. This module will be unit testable for all of the scenarios. We should probably also move the runtime resolver (which is used internally by the runtime for producing `<astro-island>` URLs) since it is shared logic between SSG and SSR that is related.

Additionally some fixture tests will be included for the matrix of scenarios; SSG and SSR mode, `absolute` and `relative` options, as well as the types of assets; stylesheets, hoisted scripts, and astro islands.

# Drawbacks

- This adds some complexity to the codebase in the usual way that adding a config option does.
  - However this is also an opportunity to clean up the code and have just 1 algorithm for determing how a URL gets resolved that we create.
- This will not fix the problem of `<img>`s you create. this is especially important in Markdown files, where manually adding relative links is required. So people might find this solution inadequate since it doesn't fix all of your problems.
  - The counter point is that you can use `<base>` tags and then all of your img links can just be bare.

# Alternatives

The main alternative I've considered here is instead of `relative`, having a `bare` or `base` option. That would add a `<base>` tag to your page and then use bare links like `<link rel="stylesheet" href="assets/main.hash.css">`. 

The main reason why I did not proceed with this idea is because we *cannot* use bare specifiers for module imports. Those are required by browsers to either be absolute or relative (or use an importmap, which isn't what we want here).

# Adoption strategy

Please consider:

- Given that this is a common support topic we would want to create documentation around this new feature and probably some sort of guide on how to create Astro pages that use base relative links.
- `absolute` still makes sense as a sane default. Given the 404 limation of `relative` I don't think we would ever make it the default.

# Unresolved questions

It's unclear to me how/if the Image component in `@astrojs/image` can build relative URLs. It's possible that it *can*, given that it knows the current page URL. That's something to be explored as supporting relative links there would be a good answer for the `<img>` limitation.