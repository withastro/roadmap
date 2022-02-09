- Start Date: 2022-02-08
- Reference Issues: https://github.com/withastro/rfcs/discussions/90
- Implementation PR: TODO (proof of concept exists, still need to clean it up and get it into a PR)

# Summary

A consistent strategy and low-level primitive to handle assets (Icons, Fonts, Images, etc.) in Astro.

# Example

## Low-Level Example

```astro
---
import imageBook from '../assets/book.png';
import iconCookie from '../assets/cookie.svg';
import robotoFont400 from '../assets/fonts/roboto-slab-v22-latin-regular.woff2';
import {Image, Icon, Font} from 'astro/components';
---
<html>
  <head>
	  <Font use={robotoFont400} family="Roboto Slab" />
    <style>
      body { font-family: 'Roboto Slab'; }
    </style>
  </head>
  <body>
    <p>Hello, <strong>world!</strong></p>
    <Icon use={iconCookie} />
    <Image use={imageBook} />
  </body>
</html>
```

## High-Level Example (Future)

**NOTE: This RFC is not proposing this API!** This is just an example to highlight one kind of high-level API that could be built on top of this primitive in the future.

```astro
---
import {Image, Icon, Font} from 'astro/components';

/* Possible Astro.asset() Implementation (for illustration only)
Astro.asset = function(name: string) {
  const allAssets = import.meta.globEager('/assets/**');
  const path = getPathFromName(name);
  return allAssets[path];
} */
---
<html>
  <head>
	  <Font use={Astro.asset('roboto-slab-v22-latin-regular')} family="Roboto Slab" />
    <style>
      body { font-family: 'Roboto Slab'; }
    </style>
  </head>
  <body>
    <p>Hello, <strong>world!</strong></p>
    <Icon use={Astro.asset('book')} />
    <Image use={Astro.asset('cookie')} />
  </body>
</html>
```



# Motivation

We have no official, consistent story around loading assets in Astro. Some plugins have attempted to solve this in userland, for example:
- Icons: https://github.com/natemoo-re/astro-icon
- Images: https://github.com/Princesseuh/astro-eleventy-img
- Fonts: https://github.com/aFuzzyBear/astro-ui/tree/main/components/Fonts
- Fonts: https://gist.github.com/FredKSchott/3d656427d53a3609ae337c60cc6e3002

All of these approaches work today (Astro v0.21), but suffer from an important problem: they resolve assets at **run-time** (aka "during the render"). For example, a component like `<Icon name="book">` can't know the value for `props.name` until the component and page itself is being run and rendered. This is even better illustrated if the value is a variable, like `<Icon name={fetchedAPIUserData.avatarIcon}>`. Astro would never know what this is.

Why is this is a problem? To be clear, it's not a problem *today* because run-time and build-time are the same. In Astro today, **run-time** and **build-time** both happen during your build, ahead-of-time, before the site is deployed to the server. Runtime has full access to your machine, and every source file in your repo.

However, with SSR support coming this will no longer always be true. If `<Icon name={fetchedAPIUserData.avatarIcon}>` renders for the first time on the server (ex: on Netlify, on Vercel) then Astro has no idea which icon you need to include in your build at build-time, which is when the decision of "what to include in your build" is made.

Even though SSR isn't available yet, we don't want our community building components and integrations that we know for a fact won't work in the future. There have been different ideas thrown around to solve for this, some of which I will touch on in the "Alternatives" section of this RFC.

### Goals

This proposal outlines an **asset primitive** that accomplishes the following goals:

- Works for Fonts, Icons, and Images.
- Can reasonably extend to other asset types in the future.
- Can reasonably extend to support image optimizations in the future.
- Works with SSR, where all assets must be known at build-time, with 100% accuracy.
- Works across frameworks (`.jsx`, `.svelte`, `.vue`). Not an `.astro`-only solution.
- Introduces an acceptable amount of boilerplate (as little as possible, or none).
- Can power custom 3rd-party integrations and components.
- Can power future, higher-level Astro core features.

# Detailed design

## The Asset Primitive

```js
import imageBook from '../assets/book.png';
  // imageBook is type: ImageAsset (.png|.jpg|.jpeg|.webp)
  // {url, width, height, blurHashUrl}
import iconCookie from '../assets/cookie.svg';
  // iconCookieis type: SvgAsset (.svg)
  // {width, height, content}
import robotoFont400 from '../assets/fonts/roboto-slab-v22-latin-regular.woff2';
  // robotoFont400 is type: string
  // [If no custom asset is defined, Astro will default to including the asset
  // in your build and returning a single URL as the result. This is Vite default behavior.]
```

- The asset primitive is imported via ESM.
- Astro will define two custom `Asset` types: `ImageAsset` and `SvgAsset`
- All other assets will just return a URL path string to the asset, and include that asset in the final build.
- Works in `.astro` and all component files (`.jsx`, `.svelte`, `.vue`, etc)

## The Asset Components

```astro
---
import imageBook from '../assets/book.png';
import iconCookie from '../assets/cookie.svg';
import robotoFont400 from '../assets/fonts/roboto-slab-v22-latin-regular.woff2';
import {Image, Icon, Font} from 'astro/components';
---
<html>
<head>
  <Font use={robotoFont400} family="Roboto Slab" weight={400} style="normal" />
</head>
<body>
  <Icon use={IconCookie} />
  <Image use={imageBook} />
</body>
</html>
```

- Astro will ship `Font`, `Icon`, and `Image` components that can take these asset types, and properly use them on the page:
  - `Font`: Creates a `<style>` tag with a single `@font-family` definition
  - `Image`: Creates a `<img>` tag with `src=` the asset URL
  - `Icon`: renders the given `svg` content to HTML.
- In the future, these can be extended to add new features. For example, the Image component can be extended to support image optimizations and automatic [blurhash](https://blurha.sh/) support.
- Renders could also provide `Font`, `Icon` and `Image` components that are specific to each framework. This can be fleshed out in more detail if it is a concern, but it is strongly believed that this is possible and fairly trivial.

## Other Notes

- This is trivial to implement in Astro today. Vite provides hooks for these sorts of imports, so we would just need to create two Vite plugins inside of Astro: one for SVGs and one for images.
- This is possible to do in userland today by providing those two Vite plugins yourself. This proposal exists to bless this as the "Astro" way and integrate this into Astro itself so that our community can build on top of it.


# Drawbacks

In the first discussion on this proposal, there was a lot of push-back at the extra boilerplate and "JavaScript-iness" that this introduced (or even "Webpack-iness"). Astro is trying to be less JavaScript-required than other frameworks, so it is a concern to lean too much into JavaScript to solve our problems. Asset ESM imports rely on a special understanding of what an "svg" or "png" import to JavaScript looks like, which may not feel familiar to non-JS experts.

This proposal takes the following stance in response to these valid drawbacks: **Higher-level, more-friendly APIs can be built on top of this primitive.** For example, you can use `const assets = import.meta.glob('/assets/**')` to create your own runtime `assets` lookup (ex: `assets['font.png']`). Or, Astro could build this concept of a magic assets folder into core (ex: `import {getAsset} from 'astro/runtime';`). 

This proposal welcomes more high-level features to be built on top of it, both in Astro core and also across our ecosystem of 3rd-party plugins and integrations.

*TODO: More drawbacks? Please contribute!*

# Alternatives

## The Assets Folder

An alternative approach that has been considered is to have a special `assets/` folder that is a sibling to `public/` and `src/`. Astro would include every asset in the final build, and then give you a way to look up those assets dynamically at runtime. 

This RFC is not at odds with this alternative. If this alternative were proposed, it would make sense to take advantage of the Asset primitive outlined here and build that high-level feature on top of this low-level primitive, vs. re-implementing Vite features that already exist in Vite (`import.meta.glob`, resolving and loading hooks, etc).

```js
/* Possible Asset Folder Lookup Implementation (for illustration only) */
Astro.asset = function(name: string) {
  const allAssets = import.meta.globEager('/assets/**');
  const path = getPathFromName(name);
  return allAssets[path];
}
```


# Adoption strategy

- **This would not be a breaking change.** ImagesAsset and SvgAsset could both implement  `toString()` methods that mimic the current default Vite behavior of these imports today.

# Unresolved questions

*Have a question? Please contribute!*
