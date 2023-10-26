- Start Date: 2023-10-03
- Reference Issues: https://github.com/withastro/roadmap/issues/697
- Implementation PR: <!-- leave empty -->

# Summary

Provide a configuration flag for page components to opt-in to *partial* behavior, preventing head injection of scripts and styles, and the doctype.

# Example

In any component inside of the __pages__ directory set the `partial` option:

```astro
---
export const partial = true;
---

<div>This is a partial!</div>
```

This will produce this exactly HTML output:

```html
<div>This is a partial!</div>
```

Both head content and the `<doctype>` are omitted, unlike in non-partial pages.

# Background & Motivation

Partials are a technique that has been used by web applications for decades, popularized in frameworks such as Ruby on Rails. Frontend oriented JavaScript frameworks have typically not used partials, but instead use JSON APIs and front-end templating in order to dynamically change parts of the page. Nevertheless, partials have remained a niche feature, and with Astro's backend focus we have had interest in support for a long time.

Recently the popularity of projects like [htmx](https://htmx.org/) and [Unpoly](https://unpoly.com/) have revived interest in this technique. Since Astro treats each page request as a request for a full page it automatically attaches the doctype and head elements, making it difficult to simply inject into the page.

# Goals

- The ability to request a URL from Astro that excludes the usual page elements (doctype, head injection).
- The base feature should work the same in SSG and SSR apps. Partials are still output as `.html` files in a static build.

# Non-Goals 

- This isn't an integration specifically for HTMX or any one library. It should work with any library or manual DOM manipulation that does `innerHTML`.
- No client-side scripts from Astro will be part of this change.
- Support for integrations or middleware at this time. It could be possible to allow middleware to communicate that a request is for a partial, but that is not part of this RFC.

# Detailed Design

partials are opted into on a per-page basis. Any page within the `pages` directory can become a partial through this config:

```astro
---
export const partial = true;
---
```

This value must be either:

- A literal boolean of `true` or `false` (there's no reason to every use false).
- A configuration value from `import.meta` such as:

    ```astro
    ---
    export const partial = import.meta.env.USE_partialS;
    ---
    ```

The value *must* be identified statically. This means that a page can't be both a full page and a partial. If you want to share the same logic and template for a partial and partial you can do so by putting the common code into a component.

## Implementation

This is a very small change. Internally Astro uses an object known as a `result` that stores intoformation about a request. That result object will add a `partial` property:

```ts
interface AstroResult {
  partial: boolean;
}
```

When rendering the partial value is taken from the __component module__ and placed on the result object.

This boolean is then used in two places:

- In head injection it will be used to prevent head injection.
- In page rendering it will be used to prevent doctype prepending.

These are the only changes needed.

# Testing Strategy

We want to verify that partials do not include head content with tests for:

- A component that contains `<style>` and `<script>` elements.
- The `doctype`

Additionally we should test both dev mode and the static build, to ensure that the files are still written to disk.

# Drawbacks

- It could be unexpected that a component styles are not included.
- partials need to be styled with global styles. This could mean using `<style is:global>`, or imported CSS, or an atomic CSS library like Tailwind.
- Use-cases where you want both a page and a partial in the same file are not possible.

# Alternatives

The other major alternative API considered was a file-naming convention such as `todo.partial.astro`. The `.partial` would be used to know that the page is for a partial. This would add extra work to routing, where as the `export const partial` solution contains the problem to the runtime and build plugin (which already exists).

## Including head content but not doctype

One piece of feedback on this RFC has been to include scripts and styles, but not the doctype. This way a partial can still include things like scoped component styles.

However this idea doesn't add up to scrutinity. If you include scripts/styles then you run the risk of FOUC as the styles are loaded asynchronously. You also run into issues of the scripts/styles being added every time the partial is used. For global scripts in particular, this will produce unexpected results.

The conclusion here is that you *must* have client-side code that manages scripts/styles, diffing them into the head, and waiting on them to load before inserting the rest of the partial. And if you have code for this, then the doctype isn't a problem either.

# Adoption strategy

- This will be introduced as an experimental feature to ensure that it's what developers are after.
- This would not be possible to do as a 3rd party package or integration so it must be done in core.
- Based on feedback we might make adjustments to the RFC before it's release.
