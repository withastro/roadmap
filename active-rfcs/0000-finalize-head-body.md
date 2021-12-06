- Start Date: 11/30/2021
- Reference Issues: https://github.com/withastro/rfcs/discussions/15
- Implementation PR:

# Summary

Finalize behavior around `<head>`, `<body>`, `<html>`, and `<!DOCTYPE html>` elements in Astro component templates.

# Motivation

in Astro v0.21, we have had user reports around `<head>` not acting as expected, breaking some projects from v0.20:
- https://github.com/withastro/astro/issues/2046
- https://github.com/withastro/astro/issues/2022

Some of these issues stem from undocumented or undefined behaviors in v0.20: was it allowed for `<head>` be conditionally added in a nested expression? 

Other issues stem from our attempt to provide implicit `<head>` and `<body>` support in pages and layouts. There was a quick workaround added for v0.21 where `src/pages` and `src/layouts` folder locations must be defined in config so that our parser knows how to parse them as full HTML documents and not smaller HTML fragments. This unblocked users but at the expense of breaking two larger design goals of the project:
  - Added `src/layouts` as a new special folder location, when only `src/pages` was intended to be "special".
  - Caused Astro to create different output for a component based on the file path of that component.

## Goals

1. Agree on and document the rules and behaviors of the `<head>`, `<body>`, `<html>`, and `<!DOCTYPE html>` tags.
2. Remove special compiler behavior based on where a file lives in your src directory. 
3. Remove `src/layouts` as a "special" folder and any config around this.

## Non-Goals

1. **Out of scope:** Support `<head>` injection, defined inside of individual components. Something like [`<svelte:head>`](https://svelte.dev/docs#svelte_head) for Astro is a commonly requested user feature, but can be tackled as an additional feature, leaving this RFC focused on clarifying our existing API. This RFC does not impact that feature request.


# Detailed design

## Template Changes

- `<!DOCTYPE html>`
  - compiler: completely ignored by the compiler, stripped out from render output.
  - runtime: a `<!DOCTYPE html>` tag is always included in final page HTML output.
- `<html>`, `<body>`, `<head>`
  - compiler: will be left as-is in the component template.
  - runtime: will be left as-is in final page HTML output.
  - runtime: will warn if no `head` tag is rendered by an Astro component for an entire page.
  - runtime: may warn if duplicate `html`, `body`, and `head` tags are rendered inside of Astro components for an entire page.

## Compiler Changes

- `src/pages` and `src/layouts` will no longer be parsed or rendered differently from other components
- `as?: 'document' | 'fragment';` will be removed from the compiler.
- All Astro components will now be compiled as fragments.

Losing `"as": "document"` parse mode will remove some special parser handling, like getting an implicit `<head>` to wrap a standalone `<title>` element. This is intentional to bring us more inline with the RFC, where we respect the HTML authored by the developer as the source of truth and leave mostly as-is in the final output.

In this design it is more "on you" to write valid HTML. This comes from the reality that an imported component can contain unknown HTML, so the compiler can't implicitly assume anything about what is or is not included included the final parent component template.  See https://github.com/withastro/astro/issues/2022 for examples of when this breaks down today. We can help with some static linting, and runtime warnings if the final HTML output is invalid. However, this RFC acknowledges the reality that already exists in v0.21 that imported components break any assumptions and help that we previously attempted to provide.

## Head Injection Changes

- runtime: will remove current post-build head injection, which involves a fragile `'</head>'` string find-and-replace.
- compiler: will add a new `head: string` (or: `injectHead(): string`) property to the compiler transform options, which will inject the given HTML string into the bottom of a `<head>` element, if one is return by the compiler.
- runtime: will provide this value head injection value to the compiler, and throw an exception if not used/called exactly once during a page render. 

The Astro runtime will use this new property to inject all CSS styles used by components on the page into the final HTML document. These may be individual file `<link>` or `<style>` tags during development, or a few bundled CSS files in your final production build.

Note: This must handle a `<slot>` containing a `<head>` and/or `<head slot="head">`. If this is too difficult to handle during implementation, we could also consider disallowing `<head slot="head">` in favor of the slot living inside of the head:

```astro
<!-- If needed for head injection, error on  `<head slot="head">` -->
<slot name="head">
  <head>
    <!-- ... -->
  </head>
</slot>
<head slot="head">

<!-- In favor of this: -->
<head>
  <slot name="head">
    <!-- ... -->
  </slot>
</head>
<link slot="head" ... />
```



# Drawbacks

- A `<head>` element is always required in your final output. This is because Astro must perform `<head>` injection and parsing the HTML document after generation is considered too expensive for production use (ex: building 10,000+ page websites). 
- The `<head>` component itself must be defined inside of an Astro component. You could not, for example, define your `<head>` _inside_ of a React component. This is because Astro cannot inject HTML safely into unknown 3rd-party components.
- `<html>` and `<body>` elements are optional in the HTML spec, and therefor optional inside of Astro as well. This ability to output HTML without these two tags may be considered an advantage for spec compliance. However, it means we need to be more diligent with testing this kind of output across our codebase and dependencies. For example, we would need to confirm that Vite does not have trouble with HTML documents that do not include a `<body>`.

# Alternatives

- Force the user to include `<html>` and `<body>` elements in their authored components, similar to how we require a `<head>` element for style injection. This could be considered more consistent to treat all 3 as required, however it is not required for any technical reason and would be additional work to implement such a requirement check.

# Adoption strategy

This proposal is not too far off from current behavior, so direct impact on the user is expected to be minimal. Upgrading style/head injection to use the compiler instead of a naive string find-and-replace should be considered an implementation improvement, and could go out in a patch release if needed.

Removing `document` mode may break some users relying on certain side-effects and indirect Astro compiler behavior. For example, document mode meant that a `<head>` element was not required, and an empty element would be added automatically by the compiler.

To mitigate this, this RFC proposes the following release plan to remove `as: document` mode from the compiler:

1. In a well-tested PR to Astro core, remove any usage of `as: 'document'` when calling the compiler. 
2. Add some checks and warnings to help users migrate. For example, warn in `renderPage()` if anything other than a single `</head>` were found.
3. Release this in a new minor release. This would be the only thing to go out in this release.
4. Explicitly mention the breakage potential in the release notes, and on Discord.
5. If any users report breakage, work to add a config fallback to continue to use `document` for pages and layouts.

Once settled, we would remove the now-unnecessary `layouts` config and remove `as: "document"` support from the compiler in followup minor releases.




# Unresolved questions

- None yet.
