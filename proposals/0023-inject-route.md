- Start Date: 2022-06-01
- Reference Issues: https://github.com/withastro/roadmap/discussions/201
- Implementation PR: https://github.com/withastro/astro/pull/3457

# Summary

Recently, @FredKSchott made a thread on the discord #feedback-and-suggestions channel that proposes a `injectRoute` API to the integrations `'astro:config:setup'` hook, similar to `injectScript`. This API would allow integrations to add routes to projects, that ship have prebuild, plug-n-play functionality, pages, or route handlers. For consumers of such integrations, this would allow highly plug-and-play like experiences for adding functionality.

# Example

```js
// astro.config.mjs
export default defineConfig({
  integrations: [
    {
      name: "my-netlify-integration",
      hooks: {
        "astro:config:setup": ({ injectRoute }) => {
          injectRoute({
            /** The route on which to output the entryPoint */
            pattern: "/admin",
            /** Bare module specifier pointing to a pre-made admin page */
            entryPoint: "my-netlify-integration/admin.astro",
          });
        },
      },
    },
  ],
});
```

# Motivation

Some usecases for this could be:

- Adding an `/admin` page for headless CMSes
- Implementation of [tailwind-config-viewer](https://github.com/rogden/tailwind-config-viewer)
- Authentication providers could very easily ship the required redirectCallback routes etc, e.g. `googleProvider()`, `facebookProvider()`
- Plug and play payment integrations, endpoints, webhooks, all setup via a single integration, e.g. `paypal()`, or `stripe()`

# Detailed design

There is a prototype implementation here:
https://github.com/withastro/astro/pull/3457

## Proposed API

```ts
export interface InjectedRoute {
  pattern: string;
  entryPoint: string;
}

function injectRoute(injectRoute: InjectedRoute): void {}
```

# Drawbacks

No known drawbacks

# Alternatives

No known alternatives

# Adoption strategy

This is a new API and won't require any migrations.

# Unresolved questions

**Resolved:** ✅

**Q:** _Should `_`'s in route names be allowed?\_

**A:** Yes. An expected usecase for `injectRoute` is to add "private" routes, like for example `/_admin`, and allowing `_`'s will also help avoid nameclashes. The draft implementation currently already supports this.

<hr/>

**Resolved:** ✅

**Q:** _How should route collissions be dealt with?_

**A:** During injection of routes, we should check to see if a route already exists in the route manifest, and if it does, we should throw an error. It's up to integration authors to provide customization and flexibility in configuration of the route path. For example:

```js
function myIntegration(config) {
  return {
    name: "my-integration",
    hooks: {
      "astro:config:setup": ({ injectRoute }) => {
        injectRoute({
          pattern: config?.routes?.admin ?? "/admin",
          entryPoint: "my-integration/admin.astro",
        });
      },
    },
  };
}

export default defineConfig({
  integrations: [myIntegration({ routes: { admin: "/custom-path/admin" } })],
});
```

<hr/>

**Resolved:** ✅

**Q:** _Should directories be allowed? E.g.: `entryPoint: 'foo/bar/'`_

**A:** No. Currently the implementation uses `require.resolve` via `createRequire(import.meta.url)` to resolve the entryPoint. This automatically takes care of complications like pacakge export maps. If directories would be supported, the implementation would need to be changed to 'fish' on the filesystem to resolve the `entryPoint` file, which makes the resolving logic a lot more complex and fragile, especially across different package managers like yarn, pnpm, symlinks, etc. However, if this decision at some point in time should get overturned, it can be additive and is not blocking for an initial release of the API.

<hr/>

**Resolved:** ✅

**Q:** _How are dev-only routes handled?_

**A:** Routes can be conditionally injected based on the `command` property thats passed to the `'astro:config:setup'` hook:

```js
function myIntegration(config) {
  return {
    name: "my-integration",
    hooks: {
      "astro:config:setup": ({ command, injectRoute }) => {
        /** This route will only be injected during dev-time */
        if (command === "dev") injectRoute(routeConfig);
      },
    },
  };
}

export default defineConfig({
  integrations: [myIntegration()],
});
```
