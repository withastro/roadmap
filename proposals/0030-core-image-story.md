- Start Date: 2023-21-02
- Reference Issues: #5202 (and all the issues about `@astrojs/image`, really)
- Implementation PR: https://github.com/withastro/astro/pull/6344

# Summary

This RFC aims to simplify the usage, optimization and resizing of images in Astro.

# Nomenclature

- **CLS**: Content Layout Shift. A score determining how much content shifted on your page during loading, you want to be as close to 0 (or "no CLS") as possible.

# Example

> Note: All the `src` paths in the examples below represent the final paths at build. During development, those paths may be different due to implementations details.

> Note 2: All the results below, unless specified otherwise, are done using the default image services provided with Astro.

## Image Component

### Image located in `src`, in an Astro file

```astro
---
import { Image } from 'astro:assets';
import myImage from "../assets/my_image.png"; // Image is 1600x900
---

<Image src={myImage} alt="..." />
```

#### Result

```html
<!-- Image is optimized, proper attributes are enforced -->
<img
  src="/_astro/my_image.hash.webp"
  width="1600"
  height="900"
  decoding="async"
  loading="lazy"
  alt="..."
/>
```

### Remote images

```astro
---
import { Image } from "astro:assets";
// Image is 1920x1080
---

<Image src="https://example.com/image.png" alt="..." />
<!-- ERROR! `width` and `height` are required -->

<Image src="https://example.com/image.png" width={1280} alt="..." />
<!-- ERROR! `height` is required -->

<Image src="https://example.com/image.png" width={1280} height={720} alt="..." />
```

#### Result

```html
<!-- Remote images are not optimized or resized. Nonetheless, you still benefit from the enforced attributes and the guarantee of no CLS, albeit manually. -->
<img
  src="https://example.com/image.png"
  decoding="async"
  loading="lazy"
  width="1280"
  height="720"
  alt="..."
/>
```

## Image in Markdown

```markdown
![My article cover](./cover.png)
^ Image is 1280x720
```

### Result

```html
<!-- Image is optimized, proper attributes are enforced -->
<img
  src="/_astro/cover.hash.webp"
  width="1280"
  height="720"
  decoding="async"
  loading="lazy"
  alt="My article cover"
/>
```

Remote images are handled as in vanilla Markdown and have no special behavior.

## JavaScript API for using optimized images

```astro
---
import { getImage } from "astro:assets";
import image from "../assets/image.png"; // Image is 1920x1080

const myImage = await getImage({ src: image, width: 1280, height: 720 });
---

<img src={myImage.src} {...myImage.attributes} />
```

### Result

```html
<img
  src="/_astro/image.hash.webp"
  width="1280"
  height="720"
  loading="lazy"
  decoding="async"
/>
```

## Defining a new image service

### Astro Config

```ts
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  image: {
    service: "your-entrypoint", // 'astro/image/services/squoosh' | 'astro/image/services/sharp' | string
  },
});
```

### Local services API

```ts
import type { LocalImageService } from "astro";

const service: LocalImageService = {
  getURL(options: ImageTransform) {
    return `/my_super_endpoint_that_transforms_images?w=${options.width}`;
  },
  parseURL(url: URL) {
    return {
      width: url.searchParams.get("w"),
    };
  },
  transform(options: ImageTransform) {
    const { buffer } = mySuperLibraryThatEncodesImages(options);

    return {
      data: buffer,
      format: options.format,
    };
  },
};

export default service;
```

### External services API

```ts
import type { ExternalImageService } from "astro";

const service: ExternalImageService = {
  getURL(options: ImageTransform) {
    return `https://mysupercdn.com/${options.src}?q=${options.quality}`;
  },
};

export default service;
```

The kind of service exposed is completely invisible to users, the user API is always the same: the `Image` component and `getImage`. Refer to previous examples for usage.

### Additional method

```ts
getHTMLAttributes(options: ImageTransform) {
    return {
        width: options.width,
        height: options.height
        // ...
    }
}
```

This method is available on both local and external services.

# Background & Motivation

The currently available `@astrojs/image` is great, however, users ultimately find it very confusing for multiple reasons:

- Error messages are confusing and unhelpful
- Types historically haven't been super great
- Missing documentation
- Due to not being a core integration, it requires manual setup
- Partly due to the previous points, but also for other reasons, it wasn't always clear for users how the integration behaved.
- Hard to use in Markdown / MDX.

In this RFC, we'd like to outline a plan / API for a core story for images. The main motivation is to create a story that feels fitting to the Astro core, in that it's easy to understand, intuitive to use, and extendable while also being kind and respectful of the user.

# Goals

- Make an image component that is easy to use and intuitive to understand.
- Make it easy to use optimized images in Markdown, MDX and future formats.
- Good, core-worthy, DX with awesome error messages, good types, good documentation
- No more integration to install!

# Non-Goals of this RFC

- Advanced usage in Markdown (ability to set width, height, quality etc)
- Using optimized images inside client-side framework components
- Automatic generation of `srcset` in the integrated services
- Automatic `loading="eager"` for above the fold images
- Placeholders generation
- Background generation
- Picture component
- Optimizing & resizing remote images
- Ability to choose a different image service per image
- Remote patterns for limiting the usage of remote images to specific domains
- `.svg` support

To be clear, we hope to tackle many of those points in the future, in separate, more precise RFCs. Images are hard.

# Detailed Design

## `astro:assets`

A new virtual module will be exported from a Vite plugin (similar to `astro:content`) exposing the different tools the user can access.

- `Image` (see [Image Component](#image-component-1))
- `getImage` (see [JavaScript API](#javascript-api))
- `getImageService` (see [Image Services](#image-services))

We choose `astro:assets` over `astro:image` on purpose, as to make it intuitive that more things might get exposed from there over time.

## `src/assets`

A new reserved folders for assets. Assets do not have to live in this folder, however putting them in this folder will unlock several benefits. Notably, we consider this folder to be a safe place for git-based CMSes to put any uploaded assets in.

Through an included alias `~/assets` pointing to `src/assets`, it'll be easy for users to refer to any uploaded assets there.

### Content Collections integration

It is fairly common for one of the property of a Markdown piece of content to need to be a reference to an asset (think, cover image for an article, picture for an author etc).

In tandem with the `src/assets` folder, we'd like to introduce a way for users to specify that a specific property needs to refer to a valid asset from the `src/assets` folder:

```ts
import { asset, defineCollection, z } from "astro:content";

const blogCollection = defineCollection({
  schema: z.object({
    title: z.string(),
    image: asset({ width: 1120, height: 1120 }),
  }),
});
```

Additionally, assets referred this way will be transformed automatically to the same shape as if the image was imported (see section below.), so they're ready to be used optimally. However, optimization / resizing is left to the user to do using the JavaScript API if they desire to.

## New ESM shape for images imports

Currently, importing images in Astro returns a simple `string` with the path of the image. The `@astrojs/image` integration and this RFC enhance this by instead returning the following shape: `{src: string, width: number, height: number, format: string}`.

This shape has multiple benefits:

- It allows users to easily construct `img` tags with no CLS, without needing to opt-in the entire `Image` pipeline if they don't require it:

```astro
---
import image from "../my_image.png";
---

<img src={image.src} width={image.width} height={image.height} />
```

- This shapes gives all the information needed to build your own image integration. Depending on the transformer used, you'll often need the original metadata (ex: width and height) to resize the image while keeping the aspect ratio. Or, you might need a different encoder depending on the file format. With this output, all of this is given without needing further steps.

## Image component

A component that outputs a simple `<img> `tag with all the required attributes needed to show the image.

### Properties

#### width and height

Those properties are used for resizing the image and ensuring there's no CLS. In most cases, the `width` and `height` would be automatically inferred from the source file and not passing them would just result in the same dimensions.

The only time those properties are required is for remote images.

#### format

`format` is used to set the resulting wanted format for the image.

Default is left to the services to choose. But for the services exposed by Astro, this property is always optional and is set to `webp`.

#### quality

`quality` inform the quality to use when transforming the image. It can either be a number from `0` to `100`, or a preset from `low`, `medium`, `high`, `max`. Specific implementation here is left to the image service used, as they do not necessarily all abide by the same rules.

Default is left to the services to choose. But for the services exposed by Astro, this property is always optional.

#### alt

`alt` is a required property in all cases when using the component. It can be explicitly set to `""`, for cases where an alt-text is not required.

### Facts

- For the services exposed by Astro: For ESM images, the only required property is `src`. Remote images (ex: `http://example.com/image.png`, `/image.png` or `${import.meta.env.BASE_URL}/image.png`) however require `width` and `height` to be set manually.
- `src` can be a dynamic import, but be aware that it must respect [Vite's limitations on dynamic imports](https://vitejs.dev/guide/features.html#dynamic-import)

## JavaScript API

A `getImage` function taking the same parameters as the image component is also supported, for use cases inside the frontmatter or outside `img` tag (ex: `background-image`)

This function returns an object with all the properties needed to use / show an image.

```ts
// Example interface describing the content of `myImage`
interface getImageResult {
  // Contain the original options passed to `getImage`
  options: Record<string, any>;
  // Contain a path you can use to render the image
  src: string;
  // Contain additional HTML attributes needed to render the image (ex: `width`, `height`, `loading`)
  attributes: Record<string, any>;
}
```

> Specific types not necessarily accurate to implementation. A more or less open-ended type for `options` and `attributes` is nonetheless required, as different services are allowed to return different things (including non-standard HTML attributes.)

## Image Services

By default, Astro will ship with two services can users can choose to transform their images: Squoosh, and Sharp. Both services more or less offer the same results and mostly differ in where they can run. Squoosh will be the default, because albeit slower than Sharp, it supports more platforms.

Keeping in line with how you can extend Astro in various ways (remark, rehype, integrations etc), it's possible for users to create their own services.

Two types of services exists: Local and External.

- Local services handle the image transformation directly at build in SSG / runtime in dev / SSR. You can think of those as wrapper around libraries like Sharp, ImageMagick or Squoosh.
- External services point to URLs and can be used for adding support for services such as Cloudinary, Vercel or any RIAPI-compliant server.

Services definitions take the shape of an exported default object with various methods ("hooks") used to create all the required properties. The major difference, API-wise, between Local and External services is the presence of a `transform` method doing the actual transformation.

The different methods available are the following:

**Required methods**

- `getURL(options: ImageTransform): string`
  - For local services, return the URL of the endpoint managing your transformation (in SSR and dev).
  - For external services, return the final URL of the image.
  - `options` contain the parameters passed by the user

**Required for Local services only**

- `parseURL(url: URL): ImageTransform`
  - For SSR and dev, parses the generated URLs by `getURL` back into an ImageTransform to be used by `transform`.
- `transform(buffer: Buffer, options: ImageTransform): { data: Buffer, format: OutputFormat }`
  - Transform and return the image. It is necessary to return a `format` to ensure that the proper MIME type is served to users.

Ultimately, it is up to the local endpoint (that `getURL` points to) to call both `parseURL` and `transform`. Those two methods are exposed as convention and used by the two base services, but your endpoint is free to achieve this in a different way if needed.

**Optional**

- `getHTMLAttributes(options: ImageTransform): Record<string, any>`
  - Return all additional attributes needed to render the image in HTML. For instance, you might want to return a specific `class` or `style`, or `width` and `height`.

### User configuration

User can choose the image service to use through their `astro.config.mjs` file. The config takes the following form:

```ts
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  image: {
    service: "your-entrypoint", // 'astro/image/services/squoosh' | 'astro/image/services/sharp' | string
  },
});
```

At this time, it is not possible to override this on a per-image basis (see [Non goals of this RFC](#non-goals-of-this-rfc)).

The `image.service` shape was chosen on purpose, for the future situation where multiple settings will be available under `image`.

### Note

Overall, it's important to remember that 99% of users won't create services, especially local ones. In addition to the services directly provided with Astro, third party packages can supply services for the users.

It's easy to imagine, for example, a `cloudinary-astro` package exposing a service. Or, the `@astrojs/vercel` adapter exposing a service using Vercel's Image Optimization API that user could use through `service: '@astrojs/vercel/image`.

# Testing Strategy

Much like the current `@astrojs/image` integration, this can be tested in many ways, ensuring full coverage of the feature set:

- Each of the core methods exposed (ex: `getImage`) and the methods they rely on (ex: `imageService.getURL`) can be tested mostly independently through unit tests.
- Integration tests can be developed to ensure the images are properly built in static mode.
- E2E tests can be developed to make sure the images are properly served in dev and SSR.

Certain parts can be hard to fully E2E tests, such as "Was this image really generated with a quality of 47?", nonetheless, we can test that we at least provided the correct parameters down the chain.

Overall, I do not expect this feature to be particularly hard, as the `@astrojs/image` testing suite has already proven to work correctly.

# Drawbacks

- Images are complicated! We've had many attempts in the community to build a perfect image components, but none of the current offering solved everyone's use case. Some people are also (understandably) cautious of using a third-party integration for this.
- Part of this is breaking! We'll offer flags and write migration guides. However, it's still possible that we'll get reports about behavior changing unexpectedly / the experience being worse because it needs to be opt-in.

# Alternatives

While I believe there may be alternatives in the technical sense, I think it is required for us to eventually have a solid story for images. Have you ever visited a website with no images? Me neither. This is especially true for content websites.

# Adoption strategy

For the `Image` component, the JS API and the Content Collection integration, adoption is completely opt-in. You don't use it, it's not included and your image are treated normally.

The ESM shape change and Markdown integration are both breaking, as such both will have to be under a flag until Astro 3.0. The types will be configured automatically for the user similar to how Content Collections update your `env.d.ts` to avoid typing issues in the editor.
