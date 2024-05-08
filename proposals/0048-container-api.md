- Start Date: 2024-04-26
- Reference Issues: https://github.com/withastro/roadmap/issues/533
- Implementation PR: 

# Summary

Astro components are tightly coupled to `Astro` (the metaframework). This proposal introduces a possible server-side API for rendering `.astro` files in isolation, outside the full `astro` build pipeline.

# Example

```js
import { AstroContainer } from 'astro/container';
import Component from './components/Component.astro';

const container = await AstroContainer.create();
console.log(await container.renderToString(Component, { props, slots }))
```

The container can be optionally constructed with some settings that are typically reserved for Astro configuration.
```js
const container = await AstroContainer.create({
    mode: "production",
    streaming: true,
    astroConfig: {
        site: "https://example.com",
        trailingSlash: false
    }
})
```

The second argument to `renderToString` optionally provides render-specific data that may be exposed through the Astro global, like `props`, `slots`, `request`, and/or `params`.
```js
await astro.renderToString(Component, { props, slots, request, params })
```

# Background & Motivation

Some of our own proposals, as well as many third-party tool integrations, are blocked until we expose a proper server-side rendering API for `.astro` components. Other frameworks have tools like `preact-render-to-string` or `react-dom/server` that make rendering components on the server straight-forward.

We've avoided doing this because... it's very hard! Part of the appeal of `.astro` components is that they have immediate access to a number of powerful APIs, context about your site, and a rich set of framework renderers. In the full `astro` build process, we are able to wire up all this context invisibly. Wiring up the context manually as a third-party is prohibitively complex.


# Goals

- Provide a **low-level** API for rendering `.astro` components in isolation
- Expose a familiar, user-friendly API
- Surface enough control for full `astro` parity, but abstract away internal APIs
- Enable third-party tools to consume `.astro` files on the server
- Enable unit testing of `.astro` component output
- Possibly unblock `.mdx` compiledContent/html output?
- Support Astro framework renderers (`@astrojs/*`) if possible

# Non-Goals

- Provide a way to **import** `.astro` components. Users will be responsible to provide a compiled component.
- Provide a way to **import** `astro.config.(mjs|mts)` out of the box.

# Detailed Design

## Preface

**This** RFC will have a smaller scoped compared to what users have envisioned. The reason why the scope shrunk is that 
I want to ship a smaller feature on the surface, which will allow us, later to enhance it based on user's feedback and use cases.

That's why the first iteration of the APIs won't provide a built-in way to compile Astro components.

## Internal concepts

The API took a lot of time to land because it required some internal refactors. Thanks to these refactors, we will be able
to land this API by using the **very same engine** that Astro uses under the hood.

Eventually, we landed to a common and abstract concept called **Pipeline**. A pipeline is simply an abstract
class that is responsible to render any kind of Astro route: page, endpoint, redirect, virtual.

Each pipeline inside the Astro codebase (dev, build, SSR and now test) is responsible to collect the important information in different way,
but eventually each route must be rendered using the same data, which are:
- **Manifest**: this is a serializable/deserializable version of our "configuration", however it also contains more information, such as renderers, client directives, styles.
- **Request**: a standard https://developer.mozilla.org/en-US/docs/Web/API/Request object.
- **RouteData**: a type that identifies a generic Astro route. It contains information such as the type of route, the associated component, etc.
- **ComponentInstance**: The instance of an Astro component. This is the **compiled** component. Internally, an Astro component undergoes various transformations via Vite, and it eventually gets consumed by our rendering engine (if it's a page).

## Create a container

A container is class exposed via the `astro/container` specifier. Users **shouldn't** create a container using the `new` instance, but they should use he static function `create`:

```js
const container = await AstroContainer.create()
```

The reason why `create` returns a promise is because internally we will validate and parse the user configuration. As a developer, you will be able to pass the same configuration that Astro uses:

```js
import astroConfig from "../src/astro.config.mjs";

const container = await AstroContainer.create({
    astroConfig
})
```

The function `create` will throw an error if there's a validation error.

> [!NOTE]
> If you use a TypeScript file for your configuration, you are responsible for loading and transforming it to JavaScript.


The `container` binding will expose a `renderToString` that accepts a Astro component and will return a `string`:

```js
import astroConfig from "../src/astro.config.mjs";

const container = await AstroContainer.create({
    astroConfig
})

const content = await container.renderToString(AstroComponent);
```

## Options

It will be possible to tweak the container APIs with options and such. The `.create` function will accept the following interface:

```ts
type AstroContainerOptions = {
    mode: "development" | "production";
    streaming: boolean;
    renderers: SSRLoadedRenderer[];
    astroConfig: AstroUserConfig;
    middleware: MiddlewareHandler
}
```

The `astroConfig` object is literally the same object exposed by the `defineConfig`, inside the `astro.config.mjs` file. This very configuration 
will go under the same schema validation that Astro uses internally. This means that an invalid schema will result in an error of the `create` function.

The `middleware` is the `onRequest` instance of the middleware, in case you're rendering a page that needs to trigger the middleware.


## `vite` configuration

Astro exposes already its internal `vite` configuration, so users that already use `vite` can take compile Astro components using the same their pipeline.

For example, if users use `vitest`, they can add Astro's `vite` configuration by importing it from `astro/config` specifier:

```js
// vitest.config.js
import { getViteConfig } from "astro/config";

export default getViteConfig({
    test: {}
})
```

```js
// Card.test.js
import { Card } from "../src/components/Card.astro"
import astroConfig from "../src/astro.config.mjs";

const container = await AstroContainer.create({
    astroConfig
})

const response = await container.renderToString(Card);
// assertions
```

## `renderToStringOptions`

This function can accept an optional object as a second parameter:

```js
import { onRequest } from "../src/middleware.js"

const response = await container.renderToString(Card, {
    slots: [
        (await container.renderToString(CardItem).text()),
        "Footer of the card"
    ],
    request: new Request("https://example.com/blog/blog-slug"),
    params: ["slug"], // in case your route is `pages/blog/[slug].astro`
    locals: {
        someFn() {
            
        },
        someString: "string",
        someNumber: 100
    },
    status: 400
});
```

- `slots`: required in case your component is designed to render some slots inside of it.
- `request`: required in case your component/page access to some information such as `Astro.url` or `Astro.request`.
- `params`
- `locals`: initial value of the `Astro.locals`.
- `status`: useful in case you're rendering an error page.

# Testing Strategy

- Integration tests to cover the majority of the options.
- Example folders to show how to integrate inside an application

# Drawbacks

I have considered a more high-level API, however with a high-level API it gets more difficult to integrate it inside other testing frameworks.

While a low-level API requires more maintenance and work to provide more work, the main idea is to provide a bare-metal API so users can tweak it as they see fit. 

# Alternatives

I have considered the idea of exposing the compiler itself, with a thin layer of APIs, however users won't be able to compile the majority of formats like Markdown, MDX, etc.

# Adoption strategy

Considering the fact that this API doesn't involve any configuration or virtual module, the API
will be released with a `unstable_` prefix, e.g. `unstable_AstroContainer`. 

This implies that the public APIs of the class will be deemed unstable, and they can change anytime, in `patch` releases too. 

Once the API is deemed stable, the `unstable_` prefix will be removed.

# Unresolved Questions
