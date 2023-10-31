- Start Date: 2023-10-19
- Reference Issues: https://github.com/withastro/roadmap/issues/709
- Implementation PR: https://github.com/withastro/astro/pull/8869

# Summary

Allow integration to add middleware without the application developer needing to define a `src/middleware.{js,ts}` file.

# Example

This adds a new integration API, a function in the `astro:config:setup` hook:

```js
export function myIntegration() {
  return {
    name: 'my-integration',
    hooks: {
      'astro:config:setup': ({ addMiddleware }) => {
        addMiddleware({
          entrypoint: '@my-package/middleware',
          order: 'pre'
        });
      }
    }
  };
}
```

This API takes from `addRenderer`, `addClientDirective`, and `setAdapter`, to provide an object with an entrypoint. That entrypoint will be loaded by Vite and wired up with the user's own middleware.

# Background & Motivation

When we initially designed middleware we took a integration-first approach, but quickly realized that this made it difficult for a user to add their own middleware. So we decided to punt on integration support and nail down the user API first.

There are use-cases where a package might want to provide both an integration *and* middleware. Currently the user has to do this by adding the middleware themselves, and then also add an integration.

We've had requests for this feature for [Starlight](https://starlight.astro.build/), as well as for auth libraries.

# Goals

- Allow integrations to transparently add middleware.
- Allow the middleware to be placed either at the front, where it would run *first*, or the back, where it would run *last*.

# Non-Goals

- Future: the ability for integrations to fully control the order. Vite plugins, which are similar, allow this through a `configResolved` hook. There might be some use-cases for this with middleware in the future.

# Detailed Design

The API of this works very similar to how `addRenderer`, `addClientDirective`, and `setAdapter` works. Both of these APIs are called by an integration and then the information about them is stored on the internal `settings` object.

In this case there will be an object that looks like `middleware: { pre: [], post: [] }` on settings. The `addMiddleware` implementation will push the entrypoint for each integration call into the appropriate stack.

This means that the order, when multiple integrations use the same `order`, will be the order in which integrations are added:

```js
export default defineConfig({
  integrations: [
    one(),
    two()
  ]
})
```

In the above case, if both integrations add a `pre` middleware, the underlying data structure will look like:

```js
{
  middleware: {
    pre: [one, two],
    post: []
  }
}
```

This means that users have ultimate control over order by deciding which order integrations should be added.

In reality conflicts should be rare as middleware authors try to be good citizens and only affect requests that are specific to their needs.

## Runtime implementation

Once the `settings` object contains the ordered list of middleware, a Vite plugin will be used to create a single middleware `onRequest` function using the `sequence` API. The pseudo-code of what this plugin produces looks like so:

```js
import { sequence } from 'astro:middleware';
import { onRequest as userOnRequest } from '/src/middleware';

import { onRequest as _pre_0 } from 'one';
import { onRequest as _pre_1 } from 'two';

import { onRequest as _post_0 } from 'one';

export const onRequest = sequence(
  _pre_0,
  _pre_1,
  userOnRequest,
  _post_0
);
```

### Runtime debugging

Existing middleware users might find integrations hooking into their pipeline to be unexpected, therefore we will add a runtime debugging logging when we detect that both integrations and the application developer have added middleware.

The debugging logging will include which other the integration was added to help with debugging unexpected behavior.

# Testing Strategy

The existing middleware tests, which are mostly fixture based, can be reused here. We test other integrations in this way and it works well. Just create some integrations for different scenarios such as:

- Middleware with `pre` order.
- Middleware with `post` order.
- Multiple middleware with the same order.

And verify that things run and in the right order.

# Drawbacks

- The main drawback to this proposal is that it makes middleware less transparent. It's possible for a user to add an integration and not know that it defines middleware and then find that it is hijacking URLs unexpectedly. However this drawback exists for all integration APIs; they are allowed to do powerful things and it is a tradeoff where some difficult functionality is taken off the user's hands, but in exchange of things being a little less clear.
- There is no way in this proposal to control middleware added by an integration. You cannot turn it off, unless you disable the middleware.

# Alternatives

- The `order` property could also be named `enforce`. Vite uses [`enforce`](https://vitejs.dev/guide/api-plugin.html#plugin-ordering) whereas Rollup uses [`order`](https://rollupjs.org/plugin-development/#build-hooks).

# Adoption strategy

- This is a non-breaking change, an additional API that new integrations can adopt.