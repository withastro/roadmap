- Start Date: 2023/10/19
- Reference Issues:
- Implementation PR:

# Summary

First-class support for localized routes, aka i18n routing.


# Background & Motivation

Many websites need to ship support for translated/localised websites for many reasons:
- legal;
- localised content;
- localised market;
- etc.

Nowadays, there are [workarounds](https://docs.astro.build/en/recipes/i18n/) in Astro to make it work, although these workarounds have limitations, and because of that many users can't ship their website properly, or they have to work more to compensate the lack of first-class support.

# Goals

- Localised routes with locale prefixes;
- Default locale with no prefix;
- Redirect to default locale if prefix enabled;
- Localise injected routes;
- Domain support, with the help of [Adapter features](https://docs.astro.build/en/reference/adapter-reference/#adapter-features), so this will be bound to the limitations of the hosting provider;
- Provide the necessary APIs for integrations and libraries to request information about the current locales;
- Locale detection via the `Accept-Language` header, so support SSR;
- Provide first-class APIs to users to work around locales (`.astro` components, endpoints, middleware);

# Non-Goals

- Localised data (dates, numbers, plurals, et.c);
- Dictionaries where users can store translations of pre-defined words;
- SEO optimisations;

This gives the reader the correct context on what is intentionally left out of scope.
It is okay to leave this section empty.

# Detailed Design

## Terminology

- Locale: a code that represents a language
- Localized folder/directory: a folder/directory named after a locale

## Opt-in configuration

The feature is opt-in, to avoid disrupting existing websites. To enable the feature, a new configuration called `i18n` is available:

```js
// astro.config.mjs
import {defineConfig} from "astro/config"
export default defineConfig({
    i18n: {
        
    }
})
```

The feature requires **two required** fields, where the user needs to store the default locale via `defaultLocale`, and a list of available locales via `locales`:

```js
// astro.config.mjs
import {defineConfig} from "astro/config"
export default defineConfig({
    i18n: {
        defaultLocale: 'en',
        locales: ['en', 'es', 'pt', 'fr']
    }
})
```

Astro will throw an error if the `defaultLocale` value is not present in the list of `locales`.

Alternatively, locales can be configured with more granular configuration, where a user can specify a particular **path** and map this path to an array of country codes:

```js
// astro.config.mjs
import {defineConfig} from "astro/config"
export default defineConfig({
    i18n: {
        defaultLocale: 'en',
        locales: ['en', 'es', 'fr', {
            path: "portugues",
            codes: ["pt", "pt-BR", "pt-AO"]
        }]
    }
})
```

- `path` will be used in the URLs, so users will have to put their translated content in the `portugues/` folder;
- `codes` will be used to match a locale against the values of `Accept-Language` header, so it's **highly** advised to use codes that are used in that header. 

## File system based

The localized directories must inside the `pages/` directory. Other than this restriction, the user is free to place the localized folders anywhere. 

## Logic via middleware

Most of the logic will leverage the [middleware](https://docs.astro.build/en/guides/middleware/) system.

If a user has a `middleware.ts` file when the i18n routing is enabled, Astro will place its i18n middleware right after the one of the user:

```js
pipeline.setMiddlewareFunction(
    sequence(createI18nMiddleware(config), userMiddleware.onRequest)
)
```

By placing the middleware **after** the one of the user, Astro allows users to apply their business logic to the emitted `Response` of the i18n middleware.

## Adapters and Astro features

Some features can be supported only with the help of the adapter.

A new [Astro features](https://docs.astro.build/en/reference/adapter-reference/#astro-features) will be introduced. The features will be progressively presented when talking about the features.

## Features

Below the list of additional features that Astro will be provided with the i18n routing.

### A new virtual module called `astro:i18n`

> **Note**:
> 
> This feature doesn't require the adapter help

A virtual module called `astro:i18n` will be available to retrieve important information useful to frontend and backed.

Here's a list of APIs available to users to retrieve information:

#### `getRelativeLocaleUrl(locale: string, path: string, options?: Options): string`

Given a locale, the function will return the **relative** URL, without the website at the beginning. The function respects the configurations `base`, `trailingSlash` and `build.format`.

```astro
---
// src/pages/index.astro
import { getRelativeLocaleUrl } from "astro:18n";
console.log(getRelativeLocaleUrl('es', "")) // will log "/es"
---
```

Another example, using `base`:

```js
// astro.config.mjs
import {defineConfig} from "astro/config"
export default defineConfig({
    base: '/docs',
    i18n: {
        defaultLocaLe: 'en',
        locales: ['en', 'es', 'pt', 'fr']
    }
})
```

```astro
---
// src/pages/index.astro
import { getRelativeLocaleUrl } from "astro:18n";
console.log(getRelativeLocaleUrl('es', "")) // will log "/docs/es"
---
```

#### `getAbsoluteLocaleUrl(locale: string, path: string, options: Options): string`

Given a locale, the function will return the **absolute** URL. The function respects the configurations `base`, `site`, `trailingSlash` and `build.format`.

```astro
---
// src/pages/index.astro
import { getAbsoluteLocaleUrl } from "astro:18n";
console.log(getAbsoluteLocaleUrl('es')) // will log "http://localhost:4321/es"
---
```

With domain support enabled for a `locale`, the returned value will be slightly different:

```js
// astro.config.mjs
import {defineConfig} from "astro/config"
export default defineConfig({
    i18n: {
        defaultLocaLe: 'en',
        locales: ['en', 'es', 'pt', 'fr'],
        domains: {
            pt: "https://example.pt"
        }
    }
})
```

```astro
---
// src/pages/index.astro
import { getAbsoluteLocaleUrl } from "astro:18n";
console.log(getAbsoluteLocaleUrl('pt', "")) // will log "https://example.pt/"
---
```

#### `getRelativeLocaleUrlList(path: string, options?: Options): string[]`

Same as `getRelativeLocaleUrl`, but it will return all the locales supported.

#### `getAbsoluteLocaleUrlList(path: string, options?: Options): string[]`

Same as `getAbsoluteLocaleUrl`, but it will return all the locales supported.


#### `getPathByLocale(locale: string): string`

Given a locale, it returns the associated path:

```js
// astro.config.mjs
import {defineConfig} from "astro/config"
export default defineConfig({
    i18n: {
        defaultLocale: 'en',
        locales: ['en', 'es', 'fr', {
            path: "portugues",
            codes: ["pt", "pt-BR", "pt-AO"]
        }]
    }
})
```

```astro
---
// src/pages/index.astro
import { getPathByLocale } from "astro:18n";
console.log(getPathByLocale('pt-BR')) // will log "portugues"
---
```

#### `getLocaleByPath(locale: string): string`

Given a path, it returns the preferred locale configured by the user. This is particularly useful when using the `codes` property. The function will return the **first** code configured:

```js
// astro.config.mjs
import {defineConfig} from "astro/config"
export default defineConfig({
    i18n: {
        defaultLocale: 'en',
        locales: ['en', 'es', 'fr', {
            path: "portugues",
            codes: ["pt-AO", "pt", "pt-BR"]
        }]
    }
})
```

```astro
---
// src/pages/index.astro
import { getLocaleByPath } from "astro:18n";
console.log(getLocaleByPath('portugues')) // will log "pt-AO"
---
```


#### `Options`

The options allow to customise the behaviour of the APIs:

- `prependWith?: string`: a path to prepend to `locale`;
- `normalizeLocale?: boolean`: defaults to `true`; when `true`, the locale is transformed in lower case and the underscore (`_`) is replaced with dash (`-`); 

### Routing strategy

An option called `routing` that allows to change the behaviour of the routing. This option is an object that accept the following fields:

> **Important**:
>
> The routing strategies are only applied to pages. Endpoints and redirects are exonerated.

- `routing.prefixDefaultLocale`:
  When `false`, all URLs of the website must have a locale prefix. Astro will return a 404 for any route that doesn't fulfill the requirements.
  Use `example.com/[lang]/content/` for every locale.
  The index `example.com/` will **redirect** to `example.com/<defaultLocale>`.

  When `true`, the URLs of the default locale must not have a prefix, while the rest of locales must have a locale prefix. 
  Use `example.com/content/` for the default locale. Use `example.com/[lang]/content/` for other locales. 
  Trying to access to use `example.com/[defaultLocale]/content/` will result into a 404.

- `routing.strategy`: tells Astro where the locales should handled inside a URL 
  - "pathname": the locales are expected to be in the `pathname` of a URL, meaning after the domain.

### Fallback system

The fallback system is a feature that allows users to re-route users from one locale to another in case a page is missing.

The fallback system is an opt-in feature.

The fallback system is configured using `fallback`. `fallback` is an object where both keys and values must be locales.

The key is the locale that should benefit from the fallback system and the value is the locale where Astro should re-route.

Astro will throw an error if any locale in `fallback` (keys and values) isn't present in the `locales` list.


### Browser locales detection 

In SSR, Astro is able to parse the `Accept-Language` header and provide a list of preferred locales by the user **and** supported by the application.

This list is sorted by the highest to the lowest using the [quality value](https://developer.mozilla.org/en-US/docs/Glossary/Quality_values).

This information is available through the global object `Astro`: 
- `Astro.preferredLocaleList: string[] | undefined`
    
  For example, if `i18n.locals` contains `['pt', 'fr', 'de']`, and the value of the `Accept-Header` value is `en, fr;q=0.2, de;q=0.8, *;q=0.5`, then 
  `Astro.preferredLocaleList` will be `['de', 'fr']` because `pt` isn't inside the header, and `en` isn't supported by the website. `de` comes first because it has a highest quality value.
  
  The property might be `undefined` if the developer isn't using their site in SSR. When `Accept-Header` is `*`, the list contained in `i18n.locales` is returned. `*` means that no preferences have been set, so all the original locales are supported and preferred. 

- `Astro.preferredLocale`

  For example, if `i18n.locals` contains `['pt', 'fr', 'de']`, and the value of the `Accept-Header` value is `en, fr;q=0.2, de;q=0.8, *;q=0.5`, then
  `Astro.preferredLocale` will be `de` because it has a highest quality value.

  The property might be `undefined` if the developer isn't using their site in SSR, or the highest value of `Accept-Header` is `*`. 

> **Note**:
> 
> This feature is only available in **SSR**

### `Astro.currentLocale: string | undefined`

A new API that allows to retrieve the current locale, computed from the `URL` of the current request.

It's `undefined` if the URL doesn't contain a locale that is defined in `i18n.locales`. Although, if `routingStrategy` is set to `prefix-other-locales`, it's assumed that the `Astro.currentLocale` is the `i18n.defaultLocale`.

# Testing Strategy

- unit tests for the virtual module
- integration tests for the rest of the features (core and adapters)
- manual testing

# Drawbacks

Astro docs have already solved the problem in [their guides](https://docs.astro.build/en/recipes/i18n/), by suggesting a series of techniques.

Starlight has also solved the problem in their own way, although it's a project with their own needs and requirements, so it doesn't solve the problem for an entire Astro application.

The implementation of this feature, while it's opt-in, could cause breaking changes in website that currently use Starlight or the guide suggested in the documentation.

While there are already some libraries in the ecosystem, there are some features that can't be implemented in user-land, like domain support for example.


# Alternatives

I evaluated different approaches:
- the introduction of an injected route using `injectRoute`, but with this approach won't allow us to work with redirects and status codes;
- changing the build system to generate virtual pages using a rollup plugin, but this gets very complex and doesn't allow us to implement all the features;

# Adoption strategy

The whole routing system will be shipped under an experimental flag:

```diff
// astro.config.mjs
import {defineConfig} from "astro/config"
export default defineConfig({
+    experimental: {
        i18n: {

        }
+    }
})
```

The features will be shipped separately and not necessarily in this order:
- default locale without prefix
- fallback system
- language detection
- domains

For those features that require adapter support (language detection, domains), it's possible that adapters are going to be shipped **after** the feature is implemented in core. And they are, they will be shipped with an `experimental` support until they are stable.

Once all the features are deemed stable, the whole i18n routing will be out from the experimental phase.


# Unresolved Questions

- We are looking at a way to type the APIs of `astro:i18n`, but we don't know if we have the infrastructure to do so;
- Do we need a configuration to tell Astro **where** the locale folders are? Or, should we enforce that somehow (root folder)?