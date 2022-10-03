- Start Date: 2022-10-03
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: <!-- leave empty -->

# Summary

This RFC proposes an additional `renderer` option for initializing framework islands with some setup code. User-provided logic runs for both server rendering and client-side hydration, allowing users to do hook into the application lifecycle and register global components/plugins (`vue.use`) or return data Provider components (React, Preact).

# Example

This proposal introduces a new `appEntrypoint` option to the official `@astrojs/*` framework integrations, if relevant.

```js
// astro.config.mjs
import { defineConfig } from 'astro/config'
import vue from '@astrojs/vue'

export default defineConfig({
  integrations: [
    vue({
      appEntrypoint: '_app.js'
    })
  ]
})
```

```js
// src/pages/_app.js
import i18nPlugin from '../plugins/i18n'

export default ({ app }) => {
  app.use(i18nPlugin, {
    greetings: {
      hello: 'Bonjour!'
    }
  })
}
```

# Motivation

Currently, Astro does not provide any way to hook into the lifecycle of an island. While this causes some annoyances for Provider-based frameworks, it makes common patterns in plugin-based frameworks impossible.

The ability to "setup" the application state is extremely important for:

- Vue users, who are familiar with libraries that use plugins (`vue.use`) or expose components (`vue.component`)
- React/Preact users, who often need every component wrapped in a custom `Provider` to make working with global data (i18n, themes) easier
- Anyone that may want to render their application with initial user state

> **Warning**:
> This RFC explicity does **NOT** concern itself with **sharing state between islands**.

# Detailed design

## `appEntrypoint` support in Renderers

The majority of this RFC can be implemented on the **renderer** level rather than built-in to Astro core.

Astro integrations are typically wrapped in a function that can provide some options. This RFC proposes extending the current options interface for framework integrations to accept an `appEntrypoint` string.

`appEntrypoint` **MUST** be a string that accepts a valid import specifier that resolves to a setup file. By convention, `/src/pages/_app.js` is recommended but not required. The entrypoint file **MUST** have a default export that is a function.

The signature of the setup function **varies per framework**, but this RFC strives to support both synchronous and asynchronous setup functions if possible. All `renderer.renderToStaticMarkup` functions already support asynchronous rendering, so this does not require any additional implementation changes.

## `appEntrypoint` support in Core

Internally, the `appEntrypoint` file **MUST** be built by Astro. Unfortunately, options passed to an Astro integration are not necessarily exposed to our build process.

This RFC proposes that the `AstroRenderer` interface be updated to include an optional `appEntrypoint` value. When `astro:config:setup` is called, if a user passed an `appEntrypoint`, the `AstroRenderer` should also surface this value to Astro.

```js
export default function ({ appEntrypoint }) {
  return {
    name: 'my-renderer-integration',
    hooks: {
      'astro:config:setup'({ addRenderer }) {
        addRenderer({
          name: 'my-renderer-integration',
          clientEntrypoint: 'my-renderer-integration/client.js',
          serverEntrypoint: 'my-renderer-integration/server.js',
          appEntrypoint
        })
      }
    }
  }
}
```

Internally, our `astro:integration-container` Vite plugin should add a new `resolveId` hook that creates a [virtual module](https://vitejs.dev/guide/api-plugin.html#virtual-modules-convention) that matches any `virtual:[renderer-name]/app` imports. If `appEntrypoint` is **not** supplied for a renderer, this virtual module will have a `load` hook that provides a default export noop (`() => {}`). If `appEntrypoint` is supplied by a user for a renderer, this virtual module will resolve to the provided `appEntrypoint`.

```js
{
    async resolveId(id, importer, options) {
        if (id.startsWith('virtual:') && id.endsWith('/app')) {
            const rendererName = id.slice('virtual:'.length, '/app'.length * -1);
            const match = config._ctx.renderers.find(({ name }) => name === rendererName);
            if (match && match.appEntrypoint) {
                // Resolve `appEntrypoint` relative to configured root
                const app = await this.resolve(match.appEntrypoint, config.root, { ...options, skipSelf: true });
                return app;
            }
            // Fallback to a shared `noop`
            return `\0virtual:noop`;
        }
    },
    load(id) {
        if (id == `\0virtual:noop`) {
            return `export default () => {}`;
        }
    }
}
```

## `appEntrypoint` in client and server entrypoints

For each supported renderer, both the client and server entrypoints should import and use this virtual module.

### Vue

```js
import setup from 'virtual:@astrojs/vue/app'

async function renderToStaticMarkup(Component, props, children) {
  // ...
  const app = createSSRApp({ render: () => h(Component, props, children) })
  await setup({ app })
  // ...
}
```

### React and Preact

The `setup` function should return a component that will be used as a global provider for every island.

> **Warning**:
> This RFC explicity does **NOT** concern itself with **sharing state between islands**.
> The component returned from this function will **NOT** be a singleton and state will not automatically synchronize between islands.

```js
import setup from 'virtual:@astrojs/react/app'

async function renderToStaticMarkup(Component, props, children) {
  // ...
  const Provider = await setup()
  const html = h(Provider, {}, h(Component, props, children))
  // ...
}
```

# Drawbacks

This is a relatively light feature to implement, but it does come with some gotchas:

- This proposal exposes lower-level control to users. Fine for advanced use cases, but makes it easier to introduce performance footguns if not used carefully.
- This proposal introduces a new pattern that, while modelled after similar patterns in other frameworks, has a unique design due to Astro's constraints
- This proposal **DOES NOT** solve a common problem for sharing state via `Provider`s. It's extremely likely that people will expect this feature to do that because you can setup a Provider. However, Providers in this proposal **ARE NOT** stateful between islands—updates to one Provider instance will not automatically propogate to other Provider instances unless specifically architected to do so by the user.

# Alternatives

## Instead of `appEntrypoint`, provide a function directly

We've moved many integration APIs to an "entrypoint" pattern to avoid needing to bundle your `astro.config.mjs` file into your final server runtime code. `appEntrypoint` solves this bundling problem because the file it points to can easily be bundled for the server and client, whereas the `astro.config.mjs` file may import server-specific code that is not client friendly.

## Instead of `appEntrypoint`, use file-based routing

Frameworks like Next have a similar pattern where `pages/_app` can export a component that will automatically be picked up by the build system. Since Astro uses similar file-based routing patterns, wouldn't this make more sense?

Asto has an interesting constraint that most other frameworks don't: we're framework agnostic. If you had both the `react()` and `vue()` integrations enabled, what would you expect the `_app` file to do? Does it setup React or Vue? Both? If so, how do you separate out the React-specific logic from the Vue-specific logic if this file needs to run for each island.

Importantly, the `appEntrypoint` pattern allows us to break out of this pattern and let the user structure this however they want. This makes the default use case (one framework) slightly less intuitive, but it keeps support for the complex use case (multiple frameworks, whereas the alternative precludes the complex use case entirely.

## Solve shared state for islands

Originally, this proposal was tightly coupled to a solution for sharing state between islands. However, this RFC solves existing problems in a non-breaking way and provides immediate value even with Astro's existing architecture. Tightly coupling the two proposals would likely delay any solution from being shipped, but this proposal can be used as a stepping-stone towards shared state in the future.

# Adoption strategy

This is a non-breaking change that introduces a "missing" feature. It should be released in a minor release of `astro` and minor releases of `@astrojs/react`, `@astrojs/preact`, and `@astrojs/vue`.

Existing third-party renderers may wish to adopt this pattern as well, but are under no obligation to do so.

# Unresolved questions

None so far
