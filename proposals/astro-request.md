- Start Date: 2022-03-21
- Reference Issues: https://github.com/withastro/rfcs/discussions/151
- Implementation PR: <!-- leave empty -->

# Summary

- Change `Astro.request` to become a [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) object.
- Move `Astro.request.params` to `Astro.params`.
- Move `Astro.request.canonicalURL` to `Astro.canonicalURL`.

# Example

```astro
---
const cookie = Astro.request.headers.get('cookie');
const loggedIn = parse(cookie).loggedIn;
---
<html>
<head>
  <title>My Blog</title>
  <link rel="canonical" href={Astro.canonicalURL}>
</head>
<body>
  Hello, you are {!loggedIn && 'not'} logged in.
</body>
</html>
```

# Motivation

In server-side rendering contexts you will want access to the HTTP request headers to do things such as check cookies.

[Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) is a standard API to represent an HTTP request that is used by:

- Service workers
- Cloudflare Workers
- Deno

As well as other meta-frameworks:

- SvelteKit
- Remix

The Request object allows access to headers through the `request.headers` Map-like object. Switching `Astro.request` to a Request will provide a familiar interface for this use-case.

# Detailed design

__Astro.request__ is currently an object with this interface:

```typescript
interface AstroRequest {
  /** get the current page URL */
  url: URL;

  /** get the current canonical URL */
  canonicalURL: URL;

  /** get page params (dynamic pages only) */
  params: Params;
}
```

This change will move `canonicalURL` and `params` up to the `Astro` object and make `request` a Request.

```typescript
// Partial
interface Astro {
    /** get the current canonical URL */
  canonicalURL: URL;

  /** get page params (dynamic pages only) */
  params: Params;

  /** gets the current request. */
  request: Request;

  /** More here... */
}
```

## SSR vs. SSG

When designing the initial version of Astro we intentionally omited things like query parameters and headers from the `Astro.*` APIs to prevent users from depending on things that would not work in production (since they are static pages).

We should continue doing so, which just means:

- In development mode when not using SSR, the `URL` is made to not contain query parameters.
- In development mode when not using SSR, the `Astro.request.headers` will exist, but not contain any headers (an empty object, essentially).

With SSR mode enabled, these features will be present in development and production.

# Drawbacks

- In the current API `Astro.request.url` is a [URL](https://developer.mozilla.org/en-US/docs/Web/API/URL) object, but `Request.prototype.url` is a string. This is a breaking change.
- Moving things up to the top-level Astro arguably makes that object messier; maybe there is a better approach to cleaning it up.

# Alternatives

A few alternatives have been tried:

- Keeping the existing object but adding a `headers` property that is a [Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers) (Map-like) object.
- Making Astro.request be a Request but then also adding the `params` and `canonicalURL` properties.
  - Feel that doing it this way makes it harder to document and the code becomes slightly more complex.

Either of these options would be *fine*, but if we were designing Astro from the start with SSR in mind we would probably have made it a Request, so doing so now before 1.0 seems like good timing.

# Adoption strategy

- This is a breaking change that would go out before (or during) 1.0.
- Docs would be updated to reflect that `Astro.request.url` is now a string.