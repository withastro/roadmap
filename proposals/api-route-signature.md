- Start Date: 2022-04-25
- Reference Issues:
- Implementation PR: <!-- leave empty -->

# Summary

Change the signature for API routes to accept a single argument containing the file-based routing params, the [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request), and any other objects we might need to add in the future.

# Example

With the new API, instead of params being the first argument and request the second, they are combined into a single context object that contains both.

```js
export async function get({ params, request }) {
  if(!request.headers.has('cookie')) {
    return new Response(null, {
      status: 301,
      headers: {
        Location: '/'
      }
    });
  }

  // ...
}
```

# Motivation

API Routes were originally created for the use-case of generating non-HTML files during a SSG (static-site generation) build, before Astro had support for SSR (server-side rendering). This allowed you to create Atom files, JSON files, and such.

The original API provided [params](https://docs.astro.build/en/reference/api-reference/#params) as the only argument to an API route. When SSR was implemented there was a need to pass in the [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) object in order to read headers, such as the Cookie header to do authentication.

Often times the Request object is needed but the params are not, due to the route not being a dynamic route, which leads to writing code like the following, to ignore the first argument.

```js
export async function get(_, request) {
  if(!request.headers.has('cookie')) {
    return new Response(null, {
      status: 301,
      headers: {
        Location: '/'
      }
    });
  }
}
```

As we look to add more parameters in the future you can see this situation getting worse; for example if we add some facility to make cookie reading/writing easier that could lead to a 3rd argument where the first two are ignored.

# Detailed design

The new API route signature should contain 1 argument, a `APIContext` which looks like this:

```ts
interface APIContext {
  request: Request;
  params: Params;
}
```

This type can be imported from the `astro` package and used like so:

```ts
import type { APIContext } from 'astro';

export function get({ request }: APIContext) {
  if(!request.headers.has('cookie')) {
    return new Response(null, {
      status: 301,
      headers: {
        Location: '/'
      }
    });
  }
}
```

In the future you could see APIContext being expanded to add additional properties, such as a read/write cookie interface, without needing to adjust user code.

# Drawbacks

- This would be a breaking change at some point before 1.0. Since we are in the beta period this is not ideal. See the __Adoption Strategy__ section for a plan to mitigate this drawback.

# Alternatives

On Discord some alternatives were proposed:

- Swapping the first and second arguments (`params` and `request`) since `request` is needed more. However it's only needed more in SSR, in SSG `params` is more likely to be needed, so it's the same issue just in reverse.
- Making `request` be the first argument a context object (containing params) be the second. This has the same drawbacks as the first alternative but is also still a breaking change. Having the first and only argument be a context object seems like the most future-proof option.

# Adoption strategy

This is a breaking change to take place during the beta period, however we can still provide a good backwards-compatible experience before making the final breaking change.

1. Continue to support the 2-argument form while providing a warning for those using this signature.
1. Use a `Proxy` to detect users of the single-argument `get(params)` form and provide a good warning for them.
1. After some period, before 1.0 is finalized, drop the previous signature completely.