- Start Date: 2023-09-22
- Reference Issues: N/A
- Implementation PR: https://github.com/withastro/astro/pull/8620

# Summary

The current `<Image />` component and `getImage` APIs are great to show a single image, however it doesn't answer some of the common needs of the web, such as fallback formats and responsive images. This RFC hopes to define the addition of two features:

- Possibility for image services to generate a complete `srcset` request
- A Picture component in Astro itself

# Example

### Image service integration

```ts
const imageService = {
    ...,
    // New optional hook for image services
    getSrcSet(options, imageConfig) {
        const srcSets = options.widths.map((width) => {
            return {
                transform: {
                    ...options,
                    width: width
                },
                // Descriptor to use for this dimension, follow HTML's descriptors.
                descriptor: `${width}w`,
                // Additional HTML attributes to be used when rendering this srcset
                // This is notably helpful for `<picture>`
                attributes: {
                    type: `image/${options.format}`
                }
            }
        })

        return srcSets;
    }
}
```

This API powers both examples below. As always with image services, 99.9% of users will never need to do this, this is only for the people (mainly us at Astro) implementing image services.

Read the [detailed design section](#detailed-design) for more information on how image services can interact with the user's props to generate a `srcset`.

---

### `srcset` support

**User code**

```astro
---
import { Image } from "astro:assets";
import myImage from "../something.png";
---

<!-- A basic `densities` for 2x, 3x etc is supported -->
<Image src={myImage} densities={[2, 3]} alt="My image available in 2x and 3x densities" />

<!-- Alternatively, `widths` can be used for precise widths -->
<Image src={myImage} widths={[1280, 1920]} alt="My image with precise widths" />
```

**Result**

```html
<!-- Filepaths omitted for brevity, '...' here would be the usual URLs. -->
<img src="..." srcset="... 2x, ... 3x" />
<img src="..." srcset="... 1280w, ... 1920w" />
```

### Picture component

**User Code**

```astro
---
import { Picture } from "astro:assets";
import myImage from "../something.png";
---

<!-- Similar to Image, Picture can use either `widths` or `densities`. For brevity, only the later is shown here. -->
<Picture src={myImage} formats={['avif', 'webp']} densities={[2, 3]} alt="My image available in 3 formats and 3 densities" />
```

**Result**

```html
<picture>
  <source srcset="..., ... 2x, ... 3x" />
</picture>
```

**NOTE:** `Picture` can take all the arguments of `Image`.

**NOTE:** This code represent only the values accepted by the base image services in Astro. A custom image service is free to use other attributes and completely different methods to generate a `srcset` value.

# Background & Motivation

The statement from the original RFC for `astro:assets` still stands: Images on the web are hard! Getting your image, at the perfect quality, in the perfect format, at the perfect size at the specific size you need is, a lot of work!

Abstracting all that work is also a fairly consequential challenge API-design wise, as there's a lot of features to support and concessions to be made for the brevity of the public API while still keeping the underlying API flexible enough.

The main motivation here is again, the same as `astro:assets` itself: Creating a image in multiple formats and multiple sizes in Astro should be as easy as possible, and the API flexible enough for user land to be able to create the missing pieces that the lean core experience cannot fulfil.

# Goals

- Add a hook to generate a `srcset` to image services
- Add support for generating a `srcset` value for `<Image />`
- Add a built-in `<Picture />` component, allowing to use multiple formats and image sizes, powered by the image service's ability to generate a `srcset`

# Non-Goals

## For the built-in experience

- Automatic generation or API to make writing `sizes` easier
- Complex art direction with the built-in `<Picture />` component
  - Art direction is very flexible and can do a lot of things. Supporting all the features while still keeping the API easy to use is fairly challenging. It's definitely possible that we would support it in the future, but currently we'd rather make the API flexible enough and let users do what they need by themselves.

As always, those non-goals are only relevant to **this proposal**. It is possible that in the future, we would expand the work outlined here to include those features.

# Detailed Design

`@astrojs/image` included a Picture component that, outside of re-using `getImage`, was 100% isolated in how it handled `srcset`. For the effort in `astro:assets`, going the other way seems more optimal: Add `srcset` to `Image` first, and reuse the underlying API to implement the same feature for `Picture`.

Outside of the obvious benefit of having support for `srcset` on both `Image` and `Picture`, this also has the benefit of requiring the creation of a inherently more flexible underlying API, able to support multiple use-cases.

I propose for this to be powered by a new optional hook in image services, dedicated to generating a `srcset` value. This hook would have the following signature:

```ts
type SrcSetValue = {
    transform: ImageTransform;
    descriptor?: string;
    attributes?: Record<string, any>;
};

generateSrcSets(options: ImageTransform, imageConfig: AstroConfig['image']): SrcSetValue[]
```

This hook would be used to return an additional value from `getImage`:

```ts
interface SrcSetResult {
    url: string;
    descriptor?: string;
    attributes?: Record<string, string>; // Additional attributes needed to show this `srcset`. This is mostly relevant for `<picture>`, where a source could need additional attributes (such as `type` for the format).
}


const result = {
    srcSets: {
        values: SrcSetResult[],
        attribute: string // The ... 200w, ... 400w etc string, automatically generated from the values.
    }
}
```

On the user side of things, the way to interact with this new API would be the following:

**NOTE:** As always, this is specific to the base services, a custom image service might not accept those attributes, or at least, do nothing with them.

## `<Image />`

Image accept two new optional properties:

- `widths: (number | ${number})[]`
  - Allow to generate a number of widths to generate. Typically its value will look like `[1280, 1980, 3840, ...]`.
  - At this moment, `heights` cannot be specified and the behaviour here follows the one of `width` (without a `s`) which means images will always keep the same aspect-ratio.
- `densities: (number | "${number}x")`
  - Allow to generate a number of pixel densities to generate. Typically, its value will look like `["2x", "3x", ...]`.

Those properties are mutually exclusive, so only one can be specified at a time. Either of those attributes will be used to generate a `srcset` value. For instance, the following code:

```astro
---
import { Image } from "astro:assets";
import image from "../my_image.png";
---

<Image src={image} densities={["2x", "3x"]} alt="" />
```

will generate the following HTML:

```html
<img
  src="/_astro/my_image.hash.webp"
  srcset="
    /_astro/my_image.some_hash.webp    2x,
    /_astro/my_image.another_hash.webp 3x
  "
  alt=""
  width="700"
  height="525"
  loading="lazy"
  decoding="async"
/>
```

Similarly, `widths` will generate a `srcset`, albeit with width descriptors instead of pixels ones. It should be noted that `<Image />` won't generate a `sizes` for you, as such, the inclusion of that attribute is required when using `widths`, much like it is on the native `img` element.

## `<Picture />`

Picture accepts all the properties that `<Image />` does, including the two new attributes described previously. However, it also support three other specific attributes:

- `formats: ImageOutputFormat[];`
  - Allow the specification of multiple image formats to use, every entry will be added as `<source>` elements in the order they were inputted.
- `fallbackFormat: ImageOutputFormat;`
  - Allow the specification of the image format to use as a fallback value (this will be used to fill the `<img>` fallback inside the generated `<picture>`)
- `pictureAttributes: HTMLAttributes<'picture'>;`
  - Allow specifying a list of attributes to add to the generated `<picture>` element. Every other attributes, apart from the ones used for the image transformation, will be applied to the inner `<img>` element.

As an example, the following code:

```astro
---
import { Image } from "astro:assets";
import image from "../my_image.png";
---

<Picture src={image} widths={[720, 1080]} formats={["avif", "webp"]} alt="" />
```

will generate the following HTML:

```html
<picture>
  <source
    srcset="
      /_astro/my_image.hash.avif,
      /_astro/my_image.hash.avif  720w,
      /_astro/my_image.hash.avif 1080w
    "
    type="image/avif"
  />
  <source
    srcset="
      /_astro/my_image.hash.webp,
      /_astro/my_image.hash.webp  720w,
      /_astro/my_image.hash.webp 1080w
    "
    type="image/webp"
  />
  <img
    src="/_astro/my_image.hash.png"
    srcset="/_astro/my_image.hash.png 720w, /_astro/my_image.hash.png 1080w"
    alt=""
    width="700"
    height="525"
    loading="lazy"
    decoding="async"
  />
</picture>
```

# Testing Strategy

This can be tested the same way `astro:assets` is, so through a mix of fixtures and unit tests.

# Drawbacks

- Picture component are complicated, we can't serve all the use cases so maybe we shouldn't do it at all
  - People are asking for it massively, and rightfully so. It's impossible to do optimized images in SSG (80%+ of Astro users) without `<picture>`, so
- People will be able to easily generate a lot of images now, so performance issues in image generation might shine through a bit more now

# Alternatives

I experimented a bit with a more composition-based API, but found it mostly to be annoying for users due to needing two imports. There was ways to work around that, but everything seemed cumbersome and/or didn't help users much.

# Adoption strategy

A new feature, so current users are not impacted at all! We'll document this alongside the current `<Image />` component
