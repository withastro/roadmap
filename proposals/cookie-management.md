- Start Date: 2022-08-29
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: <!-- leave empty -->

# Summary

A new API available inside Astro components and endpoints to allow getting and setting cookie values.

# Example

```astro
---
type Prefs = {
  darkMode: boolean;
}

Astro.cookies.set<Prefs>('prefs', { darkMode: true }, {
  expires: '1 month'
});

const prefs = Astro.cookies.get<Prefs>('prefs').json();
---
<body data-theme={prefs.darkMode ? 'dark' : 'light'}>
```

# Motivation

Cookies are a useful part of web development as they allow you to store state about your users that will be retained for a period of time.

However, cookies are just a special type of HTTP header that browsers recognize. A single header that contains values for multiple cookies. To get a cookie you must get the header, then parse its value to extract the cookie that you are interested in. This makes working with cookies using the base Request / Response objects cumbersome.

Users in the Astro discord often ask about how to use cookies in Astro and we don't have a great answer than recommending a 3rd party cookie parser. Since this is such a common need it makes sense to build a higher-level API for cookies into Astro core.

# Detailed design

`Astro.cookies` is a Map-like object that allows getting and setting cookie values. It has an interface of:

```ts
interface AstroCookies {
  get(key: string): AstroCookie | undefined;
  set(key: string, value: string | Record<string, any>, value: AstroCookieOptions): void;
  delete(key: string): void;
  toString(): string;
}
```

When you get or set a cookie, you are dealing with an object with the following properties:

```ts
interface AstroCookieOptions {
  domain?: string;
  expires?: number | Date | string;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: boolean | 'lax' | 'none' | 'strict';
  secure?: boolean;
}
```

## Astro.cookies.get(name)

When you call `Astro.cookies.get(name)` you receive an object that extends from `AstroCookieOptions` to include convenience methods for converting the raw cookie value.

```ts
interface AstroCookie {
  value: string;
  json(): Record<string, any>;
  number(): number;
}
```

Usage example:

```astro
---
const prefs = Astro.cookies.get('prefs');
const { darkMode } = prefs.json();

console.log(prefs.path); // -> /my-blog/
console.log(prefs.httpOnly); // -> true
---
```

Or if you only want to grab the value you might do this:

```astro
---
const { darkMode } = Astro.cookies.get('prefs').json();
---
```

## Astro.cookies.set(key, value, options)

To set a cookie value pass in the key as well as the cookie options. The cookie options extend from the battle-tested [cookie](https://github.com/jshttp/cookie) package that's used internally by Express.js, Fastify and other Node.js frameworks.

This gives you full control to set cookie options, but we extend them with:

- `expires` also can be a string of human time durations such as `1 month` or `10 days`. This is to make the API a little higher level since this is a common need.

The `value` (second argument) can be any value and will be converted to a string. If the value is an object or an array it will be stringified with `JSON.stringify()`.

## Astro.cookies.delete(key)

Removes a cookie. This is likely used within an API route.

```js
export function post({ request, cookies }) {
  cookies.delete('prefs');

  return new Response(null, {
    headers: {
      'Set-Cookie': cookies.toString()
    }
  });
}
```

## Implementation

### AstroCookies is a Map

The `Astro.cookies` object is a class that derives from `Map`. The keys are the cookie's name and the values are `AstroCookie` objects. This is to make the API familiar. The implementation needs to override `set` and `delete`.

### AstroCookies is available in .astro components and API routes

In .astro files it is available as `Astro.cookies` and in API routes it is a property of the Context named `cookies`.

```js
export function post({ cookies }) {
  const prefs = cookies.get('prefs');

  // ...
}
```

### Astro.cookies should be created lazily

There is some cost to creating AstroCookies and we should do everything as lazily as possible. This means:

- `Astro.cookies` should be a getter on the Astro global and only created the first time the getter is called.
- AstroCookies should not parse in the constructor but the first time one of the methods is called.

This is meant to avoid unnecessary cookie parsing as most pages don't use them.

### Serializing cookie changes

When setting the headers during the rendering phase we need to take the AstroCookies object and serialize it into the `Set-Cookie` header.

However:

- We only need to `Set-Cookie` if there is a change, such as a cookie value being set or a cookie being deleted.
- If the user has provided their own `Set-Cookie` header we should *not* set the header ourselves. Don't attempt to merge the header, just use the manually set value of the user.

### Deleting cookies

If a user calls `Astro.cookies.delete(key)` we want to delete that cookie. To delete a cookie you set the `Set-Cookie` header with a past value for the `expires` option such as `expires=Thu, 01 Jan 1970 00:00:00 GMT`.

Internally `AstroCookies.prototype.delete` might just call cookies.set() with this expires value.

### Additional notes

- [This library](https://www.npmjs.com/package/timestring) converts spoken word time durations to a date which is needed for the `expires` option.

# Drawbacks

- This can be done manually by using cookie libraries, so this doesn't add functionality that can't otherwise be done yourself.
- This API has a lot of options/features, but they are based on stable libraries so it should be fine. But there is a large API surface for this feature.

# Alternatives

- There was a previous [Cookie Management](https://github.com/withastro/rfcs/discussions/182) discussion. This was based on a proposed browser API. That proposal hasn't been adopted by other backend frameworks and has some downsides, such as async get/set that don't make sense for our use-case.

# Adoption strategy

This is a completely additive feature that should have no effect on existing applications.

# Unresolved questions

- The cookie Options mirrors the npm __cookie__ package except is allows spoken-word `expires` option.
  - Should we punt in this? It seems useful but there is a cost to extending the options from this library.