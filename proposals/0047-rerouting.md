<!--
  Note: You are probably looking for `stage-1--discussion-template.md`!
  This template is reserved for anyone championing an already-approved proposal.

  Community members who would like to propose an idea or feature should begin
  by creating a GitHub Discussion. See the repo README.md for more info.

  To use this template: create a new, empty file in the repo under `proposals/${ID}.md`.
  Replace `${ID}` with the official accepted proposal ID, found in the GitHub Issue
  of the accepted proposal.
-->

- Start Date: 2024-04-17
- Reference Issues: https://github.com/withastro/roadmap/issues/896
- Implementation PR: 

# Summary

Programmatic control over routing.

# Background & Motivation


As astro grows in popularity, it is being used for more and more use cases. One of these is multitenant websites where a tenant may be given a subdomain. This proposal introduces a powerful primitive that allows astro users to build websites with complex routing requirements. Rather than a limitation, file-based routing is now a sensible default!

# Goals

- Defuse.
- Make it unnecessary to rely on implicit routing rules
- Introduce framework-designed 404 and 500 pages
- Make middleware run for requests that don't match a route (with framework-designed error pages)

# Non-Goals

- Reroute to an external service.
- Support for `functionPerRoute`
- fallback rerouting

# Detailed Design

## Proposed APIs

The rerouting will be exposed to Astro pages, Astro endpoints and middleware. This API is a function called `reroute` that will contain the following signature:

```ts
type Reroute = string | URL | Request
const reroute: (payload: Reroute) => Promise<Response>

reroute("/fr/hello");
reroute(new URL("https://example.com"));
reroute(new Request("https://localhost:8080", options));
```

Internally, the `reroute` **must** create a new `Request` when attempting to render the rerouted route. The creation of this new `Request` will vary based on the signature used.

- Accepting a `string` allows to quickly reroute to a URL without too much hassle. When using a `string`, Astro will create a new `Request` with the new URL, and it will inherit all the data from the previous request.
  > Astro won't do any particular check on the string. For example, it won't check for trailing slashes. 
- Accepting a `URL` allows to create a more stable URL using the standard `URL` object. When using a `URL`, Astro will create a new `Request` with the new URL, and it will inherit all the data from the previous request.
  > Astro will check against domains that aren't allowed. Only reroutes to the current host are allowed.
- Accepting a `Request` allows uses to manipulate the `Request` as much as they can. When using a `Request`, Astro **will not create** a new `Request` and it will use the one provided by the user.
  > Astro will check against domains that aren't allowed. Only reroutes to the current host are allowed.

### Astro pages usage

The `Astro` global will expose a new method called `reroute`:

```astro
---
if (Astro.url.startsWith("/fr/salut")) {
    return Astro.reroute("/fr/hello")
}
---
```

### Astro endpoints usage

The `context` - `APIContext` type - will expose a new method called `reroute`

```js

export const GET = (context) => {
    return context.reroute("/fr/hello")
}
```
### Middleware usage

Other than exposing the `reroute` function via `context`, the signature of the `next` function will change to accept the same payload of the `reroute` function:

```js
export const onRequest = (context, next) => {
    if (context.url.startsWith("/fr/salut")) {
        return next("/fr/hello")
    }
    return next()
}
```

The `next` function will have this new signature, and it will be backwards compatible with the existing signature:

```ts
type MiddlewareNext = (payload?: Reroute) => Promise<Response>;
```


### Results for static and prerendered pages

In SSG, rerouting to a page will result in the compilation of a page that has the contents of a different page. 

If we have two pages, `src/pages/about.astro` and `src/pages/contact.astro`, if the `contact.astro` will reroute to `/about` using the rerouting strategy, it's contents will be the same as the `about.astro` component.

```html
<!-- src/pages/about.astro-->
<html>
  <head>
    <title>Astro</title>
  </head>
  <body>About</body>
</html>
```

```astro
---
// src/pages/contact.astro

Astro.reroute("/about");
---
```
The page in `dist/contact/index.html` will contain:
```html
<html>
  <head>
    <title>Astro</title>
  </head>
  <body>About</body>
</html>
```

### Results for on-demand pages

In SSR, rerouting to a page will result in rendering the contents of said page. The example provided for the static pages applies for on-demand pages too.


## Expectations upon rerouting

When a user triggers a rerouting to another URL/route:
- The middleware is **NOT** triggered **again** upon rerouting.
- If the rerouted route doesn't match any of the existing routes, a 404 `Response` is returned. The middleware **is triggered** for the 404 (it keeps the existing behaviour)
- The rerouted route will render the first page/route that is matched, among the list of [sorted routes](https://docs.astro.build/en/guides/routing/#route-priority-order).
- Injected routes should be eligible from said matching.

## Adapters

I don't envision any major blocker for our current adapters. 

I envision some potential changes for edge middleware, where the `reroute` function should be overridden with a platform specific function.
 

# Testing Strategy

- Integration testing
- Manual testing

# Drawbacks

The current API is a blocker for `functionPerRoute`. Since the rerouting isn't statically analysable, it isn't possible to tell serverless computing to reroute a request to another function/lambda. 

# Alternatives

I considered a static approach like SvelteKit and Next.js. While this approach would allow to achieve `functionPerRoute` support, we risk to litter the configuration with many entries. Plus, a static approach doesn't allow enough flexibility. 

# Adoption strategy

- Creation of a new experimental flag.
- Removal of said experimental flag after an incubation period where we test the feature.

# Unresolved Questions

- Upon rerouting, should we trigger a middleware again? 
  - If we do `Astro.reroute('/about')`, should the middleware run again, with a new `Request` that contains `url = /about`? 

