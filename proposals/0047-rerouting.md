- Start Date: 2024-04-17
- Reference Issues: https://github.com/withastro/roadmap/issues/896
- Implementation PR: 

# Summary

Programmatic control over routing.

# Background & Motivation

Various frameworks and web servers have the ability to "rewrite" a request, this means to make the same page accessible from different URLs.

Another use-case, is the ability to show a different content for a protected page in case the user doesn't meet certain criteria, e.g. a logged in page, but the user has an expired cookie.

In an internationalization context, the ability to show the content of a different locale, in case the current page isn't translated for the requested locale.

# Goals

- Render other pages/routes from an Astro page.
- Render other pages/routes from the middleware.
- Set clear expectations between static pages and on-demand pages.
- Make it unnecessary to rely on implicit routing rules
- Make middleware run for requests that don't match a route (with framework-designed error pages)

# Non-Goals

- Rewrite to an external service: mostly to avoid security concerns, and render content that doesn't belong to an Astro app. Users can still achieve this by using a reverse-proxy in case they require to render content from another sub-domain.
- Support for `functionPerRoute`: rewriting to a new page would be to actually call another origin (another function/lambda), which means that it can't be achieved with the current design.
- fallback rewriting: it means that Astro should pick the first route that is matched after the current one. This could contain too much magic, and create friction in understanding the API. Users can achieve the same result without this "fallback". 

# Detailed Design

## Proposed APIs

The rewriting will be exposed to Astro pages, Astro endpoints and middleware. This API is a function called `rewrite` that will contain the following signature:

```ts
type Rewrite = string | URL | Request
const rewrite: (payload: Rewrite) => Promise<Response>

rewrite("/fr/hello");
rewrite(new URL("https://example.com"));
rewrite(new Request("https://localhost:8080", options));
```

Internally, the `rewrite` **must** create a new `Request` when attempting to render the rewritten route. The creation of this new `Request` will vary based on the signature used.

- Accepting a `string` allows to quickly rewrite to a URL without too much hassle. When using a `string`, Astro will create a new `Request` with the new URL, and it will inherit all the data from the previous request.
  > Astro won't do any particular check on the string. For example, it won't check for trailing slashes. 
- Accepting a `URL` allows to create a more stable URL using the standard `URL` object. When using a `URL`, Astro will create a new `Request` with the new URL, and it will inherit all the data from the previous request.
  For example, you can rewrite to another URL that is in the same nested path:
  ```astro
  ---
  // Astro.url = https://example.come/blog/post/slug
  Astro.rewrite(new URL('./another-slug', Astro.url)); // https://example.come/blog/post/another-slug 
  Astro.rewrite(new URL('../../about', Astro.url)); // https://example.come/about
  ---
  ```
  > Astro will check against domains that aren't allowed. Only rewrites to the current host are allowed.
- Accepting a `Request` allows uses to manipulate the `Request` as much as they can. When using a `Request`, Astro **will not create** a new `Request` and it will use the one provided by the user. This is very useful in case users need to manipulate information, such as `Request` headers.
  > Astro will check against domains that aren't allowed. Only rewrites to the current host are allowed.

### Astro pages usage

The `Astro` global will expose a new method called `rewrite`:

```astro
---
if (Astro.url.startsWith("/fr/salut")) {
    return Astro.rewrite("/fr/hello")
}
---
```

### Astro endpoints usage

The `context` - `APIContext` type - will expose a new method called `rewrite`

```js

export const GET = (context) => {
    return context.rewrite("/fr/hello")
}
```
### Middleware usage

Other than exposing the `rewrite` function via `context`, the signature of the `next` function will change to accept the same payload of the `rewrite` function:

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
type MiddlewareNext = (payload?: Rewrite) => Promise<Response>;
```


### Results for static and prerendered pages

In SSG, rewriting to a page will result in the compilation of a page that has the contents of a different page. 

If we have two pages, `src/pages/about.astro` and `src/pages/contact.astro`, if the `contact.astro` will rewrite to `/about` using the rewriting strategy, it's contents will be the same as the `about.astro` component.

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

Astro.rewrite("/about");
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

### Results for on-demand pages (SSR and prerendered pages that opt-out)

In SSR, rewriting to a page will result in rendering the contents of said page. The example provided for the static pages applies for on-demand pages too.


## Expectations upon rewriting

When a user triggers a rewriting to another URL/route:
- The middleware is **NOT** triggered **again** upon rewriting.
- If the rewritten route doesn't match any of the existing routes, a 404 `Response` is returned. The middleware **is triggered** for the 404 (it keeps the existing behaviour)
- The rewritten route will render the first page/route that is matched, among the list of [sorted routes](https://docs.astro.build/en/guides/routing/#route-priority-order).
- Injected routes should be eligible from said matching.
- Astro will be able to detect possible loops, in case the user tries to render the same route over and over again. I case a loop is detected, Astro will abort the rendering phase and return a [`508` response`]( https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/508).
- Inside the middleware, when a user calls `ctx.rewrite("/")`, Astro will **re-run** the middleware again. That's required because if the user has some middleware logic that runs in `/`, it's their expectation to have that logic to trigger when rendering the page.  

## `next("/")` VS `ctx.rewrite('/')`

The two functions, **when used inside a middleware** will behave differently: 

### `ctx.rewrite('/')`
- It will stop the normal execution of middleware functions, all middleware functions after the current one won't be called.
- The middleware will re-run again with the new `Request`/`APIContext`


### `next('/')`
- It **won't** stop the normal execution of middleware functions.
- The next function after `next('/')` will receive a new `Request`/`APIContext` that is **manipulated** and will contain the rewritten URL.
- `APIContext.params` aren't recreated due to some architectural constraints, as we don't have a `RouteData` type, needed to construct the new `params`.


## Adapters

I don't envision any major blocker for our current adapters. 

I envision some potential changes for edge middleware, where the `rewrite` function should be overridden with a platform specific function.
 

# Testing Strategy

- Integration testing
- Manual testing

# Drawbacks

The current API is a blocker for `functionPerRoute`. Since the rewriting isn't statically analysable, it isn't possible to tell serverless computing to rewrite a request to another function/lambda. 

# Alternatives

I considered a static approach like SvelteKit and Next.js. While this approach would allow to achieve `functionPerRoute` support, we risk to litter the configuration with many entries. Plus, a static approach doesn't allow enough flexibility. 

Another alternative that was evaluated was to make the feature available only from the middleware, although this would force users to use a tool - the middleware - that might not be needed for certain cases.

# Adoption strategy

- Creation of a new experimental flag.
- Removal of said experimental flag after an incubation period where we test the feature.

# Unresolved Questions

- How should it be signature?
  ```js
  Astro.rewrite({ request: new Request() });
  // VS
  Astro.rewrite(new Request());
  ```
- Should we call it `rewrite` or `rewrite`? SvelteKit uses rewrite, but many other frameworks and web servers use the term rewrite.
- Do we need `next('/')`? 