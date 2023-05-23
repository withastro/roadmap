<!--
  Note: You are probably looking for `stage-1--discussion-template.md`!
  This template is reserved for anyone championing an already-approved proposal.

  Community members who would like to propose an idea or feature should begin
  by creating a GitHub Discussion. See the repo README.md for more info.

  To use this template: create a new, empty file in the repo under `proposals/${ID}.md`.
  Replace `${ID}` with the official accepted proposal ID, found in the GitHub Issue
  of the accepted proposal.
-->

- Start Date: 2023-05-22
- Reference Issues: https://github.com/withastro/roadmap/issues/466
- Implementation PR: https://github.com/withastro/astro/pull/7067/

# Summary

Add a `redirects` config option to the Astro config which allows you to define redirects in a central place. Allow integrations to read this information and apply it to it's own redirects configuration for deployment.

# Example

New config option used like so:

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  redirects: {
    '/other': '/place'
  }
});
```

You can also specify the status code by using an object notation:

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  redirects: {
    '/other': {
      status: 302,
      destination: '/place'
    }
  }
});
```

# Background & Motivation

This was original proposed as a stage 1 discussion [here](https://github.com/withastro/roadmap/discussions/319) and was one of the top voted proposals.

As websites age there are times where routes are rearchitectured. In order preserve existing links to content on the web it is common to set up redirects in your web server.

Redirect configuration varies depending on what web server or host you use. Some times you might even want to change hosts, in which case your redirects need to be converted over to a new format.

Having a redirects configuration within Astro itself allows a single place to define redirects that works everywhere.
# Goals

- Works in development mode.
- Writes out `<meta http-equiv="refresh">` tags in static builds.
- Gives proper hooks to integrations so that they can write to their own configuration.

# Non-Goals

- Dynamic behavior that goes beyond the capabilities of the file-based routing system. So nothing based on the properties of the request, user session, etc. Regular routes still should be used for this scenario.
- Redirects to pages that do not exist in the Astro project.
- External redirects.

# Detailed Design

This will be implemented as a feature of the internal routing. The `RouteData` type will be extended to include:

```js
interface RedirectConfig = string | {
  status: 300 | 301 | 302 | 303 | 304 | 307 | 308;
  destination: string;
}

export interface RouteData {
  type: 'redirect';
  // ...
  redirect?: RedirectConfig;
  redirectRoute?: RouteData;
}
```

Our core rendering handles routing and will detect this type of route and return a `Response` with a status code in the 3xx range with the `Location` header set to the value of the route's `redirect` property.

When using the object notation `{ destination: string; status: number; }`

## Dynamic routes

Dynamic routes are supported through the same syntax as in the file-based routing system. For example, if a site moved its blog it might set up a redirect like so:

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  redirects: {
    '/blog/[...slug]': '/team/articles/[..slug]'
  }
});
```

In SSG mode this will call the destinations `getStaticPaths` method to get valid static paths. Those paths will be used to generate the HTML files for the redirects.

## Static generation

Currently the static generation code throws for any non-200 response. With this change it will now accept any 3xx as a valid response codes. It will generate an HTML doc that looks like:

```html
`<!doctype html>
<title>OLD_LOCATION</title>
<meta http-equiv="refresh" content="0;url=LOCATION" />
```

## Adapters

Adapters can integration with this new route type through the `astro:build:done` hook which includes the `routes` property. This is an array of route datas that were built. Redirects will be part of this array.

# Testing Strategy

- We have existing redirect tests for SSR. These will be updated to test SSG redirect behavior for:
  - `redirects` config
  - Redirects created via `Astro.redirect()` and `new Response` as those are now enabled by this change.

# Drawbacks

- Adds some new complexity to the config.
- New type of route in the RouteData.
- There could be some expectations that all adapters handle this perfectly. This is a good expectation! We should do our best to make sure as many adapters support this as possible.
  - The HTML based fallback still does work.

# Alternatives

The other major design would be to allow defining redirects in the file where the page now lives. For example in a markdown page you could do:

```md
---
redirect_from:
  - /one
  - /two
---
```

This method is nice because it is file-based and in the file where the redirect is ultimately going to go to.

The major problem with this design is that we need to load and process every page before we know about these routes. So this would significantly slow down dev, where we don't need to know about all pages until they are requested.

A secondary problem with this alternative is that it's not clear how we should define redirects in non-Markdown pages, for example in an API route how would you define them? Via special comment syntax? The `export const foo` pattern from prerender?

# Adoption strategy

- This is a small change and can go through in the next minor release.