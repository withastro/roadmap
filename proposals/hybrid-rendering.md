- Start Date: 2023-04-27
- Reference Issues: https://github.com/withastro/roadmap/issues/539
- Implementation PR: <!-- leave empty -->

# Summary

Provide a new `output` option `'hybrid'` that treats all pages as prerendered by default, allowing an opt-out through `export const prerender = false`.

# Example

An existing static site can be changed to hybrid rendering, allowing some specific routes to not be prerendered.

__astro.config.mjs__

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'hybrid'
});
```

__pages/api/form.ts__

```ts
export const prerender = false;

export function get({ request }) {
  // ...
}
```

# Background & Motivation

In 2.0 Astro introduced prerendering as an option when using `output: 'server'`. Prerendering allows certain pages to be prerendered to HTML during the build. This means that a dynamic app can have certain pages, like a landing page be served faster through a CDN, while preserving dynamic pages to SSR.

An immediate point of feedback from the community was that it felt odd that this worked in server output, but not in static output given Astro's roots as a static site generator. This choice was made to prevent maintenance burden of having a 3rd way that the build works. A build where some routes are not prerendered is more like the `'server'` output than like the `'static'`.

However, there are use-cases and reasons for wanting to have some dynamic pages in a static site.

## Use-cases

A few of the use-cases collected when talking to users who have requested this feature:

- A marketing site for an agency that contains a contact form. Most of the site can be static and served via CDN, but the endpoint to serve the contact form needs to be dynamic so that it can store the contact information in a database and alert the admin.
- A SaaS product where the API is the main product. Dynamic parts of pages are built with client components, API endpoints are the only server routes needed.
- A content site such as a recipe site that allows users to mark their favorite recipes. API routes would be dynamic, as would any pages that display the dynamic list sof favorites.

# Goals

- Allow default-static apps to have some pages that are dynamic.
- Align with the current implementation and prevent an extra code-path that will be difficult to maintain.
- Provide a better path when a site goes from static to server-rendered. Hybrid is a nice middleground.

# Non-Goals

- Any extra features outside of marking certain pages to not be prerendered.

# Detailed Design

The Astro config definition and types will need to be updated to allow the `'hybrid'` value for `output`.

In `packages/astro/src/core/routing/manifest/create.ts` each route is set up to be `prerender: false` by default. This should be changed to be based on the `output` config option. If `'server'` then it should remain false, if `'hybrid'` it should be interpreted as true.

In `packages/astro/src/vite-plugin-scanner/scanner.ts` it currently throws for falsey values. Since in hybrid rendering users will set `export const prerender = false`, this code will need to be updated to allow the false value when the `output: 'hybrid'`.

Additionally there are a few places in the codebase that assume if `output !== 'static'` that it is server mode. Those might need to be changed, depending on what they are doing with that information. For example, in static mode you cannot access the `Astro.url.searchParams`. However, because this happens before we load a page component we cannot know at the time if the route is prerendered or not, so we cannot continue to enforce this restriction in hybrid rendering. For this reason, and for simplicity, in hybrid rendering these restrictions are lifted for all routes.

# Testing Strategy

Prerendering is currently tested via fixture testing, due to the fact that the build artifacts is what changes. This same strategy will be used to test hybrid rendering as well, only testing for the opposite effect. 

Likely we can use the same test fixtures, but only swap out the `output` when testing `'hybrid'`, which eliminates the need for new fixtures.

# Drawbacks

- Having a 3rd mode is a little confusing. Given that `'server'` output also has prerendering support, one might think that it also works in `'static'` mode, but just with the opposite default.
- Some integrations probably treat anything where `output !== 'static'` to mean it is server-rendering, and they might make wrong expectations based on that.

# Alternatives

The other design considered was to allow `export const prerender = false` in `output: 'static'`. There are a couple of downsides to this approach:

- Astro's build uses an extra plugin in `'server'` mode which sets up the SSR and connects to the adapter. To support this alternative approach we'd need to include this plugin always and somehow adjust on-the-fly to how and where the build is output. 
- Currently we restrict access to certain APIs, such as search params in the URL when using `output: 'static'`. Because this occurs before we know what route to use, we'd not be able to have that restriction any more.

This is perhaps a better long-term way but would require significant refactor to align the implementations closer together.

# Adoption strategy

First step will be to release as an experimental feature:

```js
export default defineConfig({
  output: 'hybrid',
  experimental: {
    hybridOutput: true
  }
})
```

Once users have a chance to provide feedback and the feature stabilizes we could unflag in a minor release.

# Unresolved Questions

It's unclear how much disruption this will cause to the ecosystem given that many might assume only 2 output modes. The experimental phase will help resolve that.