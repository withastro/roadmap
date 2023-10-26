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
        defaultLocaLe: 'en',
        locales: ['en', 'es', 'pt', 'fr']
    }
})
```

Astro will throw an error if the `defaultLocale` value is not present in the list of `locales`.

## File system based

The localized directories must inside the `pages/` directory. Other than this restriction, the user is free to place the localized folders anywhere. 

## Logic via middleware

Most of the logic will leverage the [middleware](https://docs.astro.build/en/guides/middleware/) system.

If a user has a `middleware.ts` file when the i18n routing is enabled, Astro will place its i18n middleware right after the one of the user:

```js
pipeline.setMiddlewareFunction(
    sequence(userMiddleware.onRequest, createI18nMiddleware(config))
)
```

By placing the middleware **after** the one of the user, Astro allows users to apply their business logic to the emitted `Response` of the i18n middleware.

## Adapters and Astro features

Some features can be supported only with the help of the adapter.

A new [Astro features](https://docs.astro.build/en/reference/adapter-reference/#astro-features) will be introduced. The features will be progressively presented when talking about the features.

## Features

Below the list of additional features that Astro will be provided with the i18n routing.

### A new virtual module called `astro:i18n`

> [!NOTE]
> This feature doesn't require the adapter help

A virtual module called `astro:i18n` will be available to retrieve important information useful to frontend and backed.

Here's a list of APIs available to users to retrieve information:

#### `getRelativeLocaleUrl(locale: string, path: string, options?: Options): string`

Given a locale, the function will return the **relative** URL, without the website at the beginning. The function respects the configurations `base`, `trailingSlash` and `build.format`.

```astro
---
// src/pages/index.astro
import { getRelativeLocaleUrl } from "astro:18";
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
import { getRelativeLocaleUrl } from "astro:18";
console.log(getRelativeLocaleUrl('es', "")) // will log "/docs/es"
---
```

#### `getAbsoluteLocaleUrl(locale: string, path: string, options: Options): string`

Given a locale, the function will return the **absolute** URL, taking into account the [domain](#domain-support) supported. The function respects the configurations `base`, `site`, `trailingSlash` and `build.format`.

```astro
---
// src/pages/index.astro
import { getAbsoluteLocaleUrl } from "astro:18";
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
import { getAbsoluteLocaleUrl } from "astro:18";
console.log(getAbsoluteLocaleUrl('pt', "")) // will log "https://example.pt/"
---
```

#### `getRelativeLocaleUrlList(path: string, options?: Options): string[]`

Same as `getRelativeLocaleUrl`, but it will return all the locales supported.

#### `getAbsoluteLocaleUrlList(path: string, options?: Options): string[]`

Same as `getAbsoluteLocaleUrl`, but it will return all the locales supported.

#### `Options`

The options allow to customise the behaviour of the APIs:

- `path?: string`: a path that to append to `locale`
- `prependWith?: string`: a path to prepend to `locale`
- `normalizeLocale?: boolean`: when `true`, the locale is transformed in lower case and the underscore (`_`) is replaced with dash (`-`) 

### Fallback control

An option that tells Astro what to do in case it doesn't find a page that belongs to one of the `locales` configured.

The option `fallbackControl` is a string that can have two values:

- `none`, the **default** Astro should not do anything, and a 404 is rendered;
- [`redirect`](#redirect), Astro should use a redirect when re-routing to the destination locale; when `defaultLocale` is set, Astro will create a redirect to `defaultLocale` 

The logic is triggered **only** when the path `/` is visited.


### Fallback system

The fallback system is a feature that allows users to re-route users from one locale to another in case a page is missing.

The fallback system is an opt-in feature.

The fallback system is configured using `fallback`. `fallback` is an object where both keys and values must be locales.

The key is the locale that should benefit from the fallback system and the value is the locale where Astro should re-route.

Astro will throw an error if any locale in `fallback` (keys and values) isn't present in the `locales` list.


#### Redirect

In the example below, we introduce a `pt_BR` in the `locales` list, and we tell Astro via the `fallback` key that `pt_BR` should fall back to the `pt` locale.  We use the `fallbackControl` option to tell Astro that it must apply a redirect for missing pages that belong to the `pt_BR` locale.

```js
// astro.config.mjs
import {defineConfig} from "astro/config"
export default defineConfig({
    i18n: {
        defaultLocaLe: 'en',
        locales: ['en', 'es', 'pt_BR', 'pt', 'fr'],
        fallback: {
            pt_BR: 'pt'
        },
        fallbackControl: "redirect"
    }
})
```

Let's suppose a user navigates to `/pt-br/welcome`, and the developer **didn't** create the route `src/pages/pt_BR/welcome.*`, Astro will attempt to **redirect** said user to the `/pt/welcome` URL. If the developer **does** have `src/pages/pt/welcome.*` in their file system, the user will see the page correctly, **otherwise** the user will see the 404 page.

### Browser detection

> [!NOTE]
> This feature requires adapter support using an Astro feature

An opt-in feature that allows to detect the `Accept-Langauge` header sent by the browser, and redirect users the corresponding locale. If a locale isn't supported - AKA isn't present in the `locales` list - Astro won't execute any redirect.

The user can enable the feature using the `detectBrowserLanguage` configuration:

```js
// astro.config.mjs
import {defineConfig} from "astro/config"
export default defineConfig({
    i18n: {
        defaultLocaLe: 'en',
        locales: ['en', 'es', 'pt_BR', 'pt', 'fr'],
        detectBrowserLangauge: true
    }
})
```

The logic is triggered **only** when the path `/` is visited. When the logic is triggered, Astro attempts to redirect the user to:
- the `/<LOCALE>` path, where `<LOCALE>` is the locale matched in `locales` list;
- the [sub-domain/domain](#domain-support) of `<LOCALE>`, if there's a match;

### Domain support

> [!NOTE]
> This feature requires adapter support using an Astro feature

A feature that allows to support different domains for certain locales.

Using the configuration `domains`, a user can specify which locales should benefit from a domain. This feature changes the behaviour of some of the APIs exported by the virtual module `astro:i18n`.

```js
// astro.config.mjs
import {defineConfig} from "astro/config"
export default defineConfig({
    i18n: {
        defaultLocaLe: 'en',
        locales: ['en', 'es', 'pt_BR', 'pt', 'fr'],
        domains: {
            fr: "fr.example.com",
            pt: "example.pt"
        }
    }
})
```

The following APIs will behave as follows:
- [`getRelativeLocaleUrl`](#getrelativelocaleurllocale-string-string): it won't prefix the locale to the URL. From `/en` to `/`;
- [`getAbsoluteLocaleUrl`](#getabsolutelocaleurllocale-string-string): it won't have the locale in the URL: From `example.com/fr` to `fr.example.com/`;

Adapters must have the capabilities to redirect a user from one domain to another based on the domains configured.

An adapter can signal Astro the feature support using the relative configuration:

```js
export default function createIntegration() {
  return {
    name: '@ema/my-adapter',
    hooks: {
      'astro:config:done': ({ setAdapter }) => {
        setAdapter({
          name: '@ema/my-adapter',
          serverEntrypoint: '@ema/my-adapter/server.js',
          supportedAstroFeatures: {
            i81n: {
              domains: "experimental",
            }
          }
        });
      },
    },
  };
}
```


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