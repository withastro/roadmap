- Start Date: 2022-04-29
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: <!-- leave empty -->

# Summary

Add a `response` object to the Astro global as `Astro.response`. This will allow modifying response headers within page and layout components for use-cases such as caching and setting cookies.

# Example

```astro
---
// Cache for 1 week
Astro.response.headers.set('Cache-Control', 'max-age=604800');
---
<h1>My page</h1>
```

# Motivation

When SSR was added to Astro we added the `Astro.request` object which is a [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request), allowing you to example headers (such as cookies) to dynamically handle page renders.

In order to modify the *response* you are able to return a [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) within your frontmatter like so:

```astro
---
if(!Astro.request.headers.has('cookie')) {
  return new Response(null, {
    status: 401
  });
}
---
<h1>My page</h1>
```

However, there are many cases where you do want to render your page and *also* modify something about the response such as:

- Cache headers such as `Cache-Control` and `ETag`.
- Adding cookies via `Set-Cookie` headers.
- Change the status code to something other than `200`.

Presently there is no way to render the template within a `.astro` file while modifying response properties.

# Detailed design

The `Astro.response` object is to be a place object with the following interface:

```ts
interface AstroResponse {
  status: number;
  statusText: string;
  headers: Headers;
}
```

Using a plain object rather than a [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) allows frontmatter to modify properties that are otherwise readonly, the `status` and `statusText` fields.

After rendering the `AstroResponse` will be used to construct [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) with the `status`, `statusText`, and `headers` passed through to the Response object.

Each property of the interface can be set, if desired.

```astro
---
Astro.response.status = 404;
---
```

Setting headers can be done by modifying the `headers` object *or* by creating a new one.

```astro
---
// Set a cookie header
Astro.response.headers.set('Set-Cookie', 'a=b');

// Create a new headers object
Astro.response.headers = new Headers({
  'Set-Cookie': 'a=b'
});
---
```

## Initial values

The initial values of the `Astro.response` will be:

```js
Astro.response = {
  status: 200,
  statusText: 'OK',
  headers: new Headers()
};
```

This assumes that rendering will result in a 200 response and the returned HTML will populate the response.

## Returned responses

Astro currently supports returning a [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) in the frontmatter, preventing rendering. This will still be supported. In this case any values in `Astro.response` will be ignored; the returned response will be used as the response, untouched.

# Drawbacks

There are other proposals in discussion to add [cookie management](https://github.com/withastro/rfcs/discussions/182) and [cache control](https://github.com/withastro/rfcs/discussions/181) APIs, which are higher-level ways to modify the response.

If those, or similar, proposals go through there will be much less of a use-case for `Astro.response`. However those proposals do not cover:

- Setting *every* possible value of cache headers, for example `ETag` is not covered by the cache control proposal.
- Setting the `status` or `statusText`.
- Setting other types of response headers, such as user-defined headers.

# Alternatives

As discussed in the __Drawbacks__ section, one alternative is to provide higher-level APIs for the common use-cases for modifying the response. However it will be impossible to anticipate every need, so providing a lower-level way to modify the response should unblock use-cases we haven't thought about.

Additionally, `Astro.response` could be a [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) instead of an interface we define. The main reason this proposal doesn't do that is because most of the properties on [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) are readonly; you could not modify the `status` or `statusText`. This would be unintuitive to users.

An alternative would be to allow `Astro.response` to be set from within frontmatter, and in this way you could set the status:

```astro
---
Astro.response = new Response(null, {
  status: 404,
  statusText: 'Not found'
})
---
<h1>Not found page here...</h1>
```

However this is awkward as well because you are setting the response `body` only to have it be changed once the page renders. Additionally this is a more expensive implementation as Astro would:

- Create a Response before the page renders.
- The user would create another Response to modify readonly properties.
- Astro would then use this to create a third Response that puts it all together.

# Adoption strategy

- This is a non-breaking change; `Astro.response` could be added in a single PR.
- In SSG mode the properties would be readonly and ignored in both dev and build.