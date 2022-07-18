- Start Date: 2022-07-18
- Reference Issues: N/A
- Implementation PR: https://github.com/withastro/astro/pull/3959

# Summary

Create a general-purpose `Astro.url` helper. Deprecate `Astro.canonicalURL` in favor of using `Astro.url` instead.

# Example

```js
// Before:
const currentPathname = Astro.canonicalURL.pathname;
const currentPathnameAlternativeAPI = new URL(Astro.request.url).pathname;
const origin = new URL(Astro.request.url).origin;
// After:
const currentPathname = Astro.url.pathname;
const origin = Astro.url.origin;
```

```js
// Before:
const canonicalURL = Astro.canonicalURL;
// After:
const canonicalURL = new URL(Astro.url.pathname, Astro.site);
```

```js
// More complex example (from Astro monorepo)
// Before:
const canonicalURL = new URL(new URL(Astro.request.url).pathname, Astro.site ?? `http://example.com`);
// After:
const canonicalURL = new URL(Astro.url.pathname, Astro.site ?? `http://example.com`);
```

# Motivation

Since the release of `Astro.request` there has been confusion over when to use `Astro.canonicalURL` over `Astro.request.url`. How did the two values differ, and when should I use one over the other? The answer often is: it depends. 

![Example diagram showing complexity of current solutions](https://cdn.discordapp.com/attachments/986683030418620476/996815335686688898/unknown.png)

## Creating `Astro.url`

Since `Astro.request.url` was released, we have seen the following common pattern emerge in our community:

```js
const pathname = new URL(Astro.request.url).pathname
```

`Astro.request` is a standard Request object, which means that `url` is a string. To get its pathname, you need to wrap it in a new URL object, or do some other modification to it yourself. This introduces two problems that we would like to solve:

- Less boilerplate for such a common usecase, such as getting the current URL pathname, domain, etc.
- Lower barrier to entry, for users who don't know how to create their own `URL` object to solve this.

Adding a helper `Astro.url` will reduce boilerplate in our users projects, add trivial complexity to Astro core, and give us a `Astro.canonicalURL` alternative that users will be happy with.


## Deprecating `Astro.canonicalURL` in favor of `Astro.url`

It's difficult for a framework to understand the concept of "canonical URL", since canonical is a concept that can mean different things to different projects. For example:

- How does Astro know if multiple pages should have the same canonical URL?
- In SSR mode, `[...foo].astro` will generate a different canonical URL for every URL path.

In addition, there was confusion over the canonical domain used:

- If `Astro.site` is set, what domain does `Astro.canonicalURL` use?
- If `Astro.site` is not set, what domain does `Astro.canonicalURL` use?

The result is that we have introduced the possibility that in some cases Astro is "lying" to the user about a URL being canonical when it may not be. This is most common when in SSR (where we don't know the built URLs ahead of time) and when Astro.site is not set (where we use the current origin instead of known production origin).

Even with `Astro.canonicalURL`, a user still needs to learn how to construct full URLs themselves for other meta tags like `og:image`. Even wit a helper for one very specific `canonical` meta tag, the user gets no help for creating the other meta tags that require full URL construction. You can see this today in the docs repo.

While searching, I couldn't find any equivalent site frameworks or site builders that attempted to create a "canonical" idea themselves. Instead, the best provide good primitives that a user can use to create their own canonical URL from. I believe that this is due to the issues described above, where a site builder can never have the full user/business knowledge to say with certainty what is "canonical" and what isn't.



# Detailed design

```js
// Added to Astro core
Astro.url = new URL(Astro.request.url);
```

```diff
// Deprecated, replaced with a warning
// to use `Astro.url` instead.
- Astro.canonicalURL = ...
```

This is the meat of the change. You can see the full implementation here: https://github.com/withastro/astro/pull/3959

# Drawbacks

Removing a well-used property like `Astro.canonicalURL` comes with the drawback of a required user migration to the new `Astro.url` property. We can mitigate this pain with a warning and trivial backwards-compatibility for users who continue to `Astro.canonicalURL`. A phased out, complete removal of `Astro.canonicalURL` could come later (post-v1.0 or even v2.0).

This RFC is adds a new feature, `Astro.url`, that has more general usage in more scenarios. It deprecates `Astro.canonicalURL` that has 1 specific use-case. The tradeoff is that it is now slightly more work to produce a "canonical" URL but less work to get the current URL pathname, origin, etc. However, the "more work" needed to create a canonical URL yourself is also now more explicit, so that there is less room for confusion about what the ultimate value is when you build your site.


# Alternatives

#### `Astro.getCanonicalURL()`

> `getCanonicalUrl(site?: string, pathname?: string)` this gives you in-line editor docs on what it's constructing, with an option for manual overrides or specifying a site when absent in your config

- Pros: Throws if `Astro.site` wasn't defined, or lets you provide your own domain as an argument
- Cons: Added complexity, doesn't solve the deeper root issues defined in "Motivation" above

# Adoption strategy

In a single PR, we can:

- Add `Astro.url`.
- Add a deprecation console warning when you use `Astro.canonicalURL` .
- Simplify the current `Astro.canonicalURL` implementation to use `Astro.url` internally.
- Deprecate `Astro.canonicalURL` in our docs.

In a future release (post-v1.0) we can remove `Astro.canonicalURL` entirely.

# Unresolved questions

N/A
