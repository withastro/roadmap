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

1. **Out of scope:** Support `<head>` Injection inside of individual components. This is a commonly requested user feature, but can be tackled as an additional feature, leaving this RFC focused on clarifying our existing API. This RFC does not impact that feature request.


# Detailed design

## Template Changes

- `<!DOCTYPE html>`
  - compiler: completely ignored by the compiler, stripped out from render output.
  - runtime: a `<!DOCTYPE html>` tag is always included in final page HTML output.
- `<html>`, `<body>`, `<head>`
  - compiler: will be left as-is in the component template.
  - runtime: will be left as-is in final page HTML output.
  - runtime: may warn if duplicate `html`, `body`, and `head` tags are included in final page HTML output.

## Compiler Changes

- `src/pages` and `src/layouts` will no longer be parsed or rendered differently from other components
- `as?: 'document' | 'fragment';` will be removed from the compiler.
- All Astro components will now be compiled as fragments.

Losing `"as": "document"` parse mode will remove some special parser handling, like getting an implicit `<head>` to wrap a standalone `<title>` element. This is intentional to bring us more inline with the RFC, where we respect the HTML authored by the developer as the source of truth and leave mostly as-is in the final output.

In this design it is more "on you" to write valid HTML. This comes from the reality that an imported component can contain unknown HTML, so the compiler can't implicitly assume anything about what is or is not included included the final parent component template.  See https://github.com/withastro/astro/issues/2022 for examples of when this breaks down today. We can help with some static linting, and runtime warnings if the final HTML output is invalid. However, this RFC acknowledges the reality that already exists in v0.21 that imported components break any assumptions and help that we previously attempted to provide.

# Drawbacks

- This RFC will allow you to author a page of HTML that does not actually output `<html>`, `<body>` or `<head>` elements. This can be considered an advantage in that it is more flexible than something like Svelte or Vue. However, it means we need to be more diligent with testing this kind of output across our codebase and dependencies. For example, we would need to confirm that Vite does not have trouble injecting things into an HTML document without a head or body.
  - If we are blocked by this limitation in some way and can't reasonably unblock (for example, a non-trivial Vite limitaiton) this RFC states that it would be acceptable for Astro to add `<head>` or `<body>` elements in a way that keeps the output HTML valid but unblocks Astro.

# Alternatives

- Forcing that a user includes `<html>`, `<body>` and `<head>` elements in the final page output. This could be explored more, however there is not currently consensus around this idea and also there is no known reason to tackle this as a part of this RFC. If this is desired, it should be considered a seperate feature request and out of scope from this RFC.

# Adoption strategy

This proposal is not too far off from current behavior, so direct impact on the user is expected to be minimal. However, removing `document` mode may break some users relying on certain side-effects and indirect Astro compiler behavior. 

To mitigate this, this RFC proposes the following release plan:

1. In a well-tested PR to astro core, remove any usage of `as: 'document'` when calling the compiler.
2. Release this in a new minor release. This would be the only thing to go out in this release.
3. Explicitly mention the breakage potential in the release notes, and on Discord.

If any users report breakage, who cannot easily update their project to fix: 
1. Those users can stay on the previous version while we work to add a config fallback to continue to use `document` for pages and layouts

Once settled, we would remove the now-unnecesary `layouts` config and remove `as: "document"` support from the compiler in followup minor releases.

# Unresolved questions

- None yet.
