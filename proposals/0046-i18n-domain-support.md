- Start Date: 2023/12/21
- Reference Issues:
- Implementation PR: https://github.com/withastro/astro/pull/9143


# Summary

First-class support for domain support in i18n routing.


# Background & Motivation

Websites that support internationalisation have different requirements. Among these requirements, there's the need to 
have localised content under different subdomains or domains. 

# Goals

- Support different domains, all driven by the same Astro project;
- Configure some locales to use only path prefixes and some locales to use domains;
- Mix locales that require a different domain, with locales that don't require a different domain;

# Non-Goals

- Redirect users from a path website to a domain website 
- Change website/domain based on the language of the user's browser 
- Support for static/hybrid output
- Offer the means to configure multiple domains for serverless hosts (Vercel, Netlify, etc.)


# Detailed Design

There are some restrictions about how the feature will initially work:
- the feature works only with `output: "server"`, hence only in SSR;
- the presence of at least one pre-rendered route will cause a failure in the build;
- the option `base` is required, because Astro needs to know how to create absolute URLs for locales that aren't mapped to a domain;
- `functionPerRoute` isn't supported

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
            fr: "https://fr.example.com",
            pt: "https://example.pt"
        },
        routingStrategy: "domain"
    }
})
```

The following APIs will behave as follows:
- [`getRelativeLocaleUrl`](#getrelativelocaleurllocale-string-string): it won't prefix the locale to the URL. From `/en` to `/`;
- [`getAbsoluteLocaleUrl`](#getabsolutelocaleurllocale-string-string): it won't have the locale in the URL: From `example.com/fr` to `fr.example.com/`;

An adapter can signal Astro what kind of support has for this new feature:

```js
export default function createIntegration() {
  return {
    name: '@matthewp/my-adapter',
    hooks: {
      'astro:config:done': ({ setAdapter }) => {
        setAdapter({
          name: '@matthewp/my-adapter',
          serverEntrypoint: '@matthewp/my-adapter/server.js',
          supportedAstroFeatures: {
            domains: 'experimental' // 'unsupported' | 'stable' | 'experimental' | 'deprecated'
          }
        });
      },
    },
  };
}
```

In order to support this feature, Astro needs to know the origin of the server (the domain where the server is hosted). To achieve this, Astro will rely on the following headers:
- [`X-Forwarded-Host`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Host) and [`Host`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Host). Astro will use the former, and if not present will try the latter.
- [`X-Forwarded-Proto`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto) and [`URL#protocol`](https://developer.mozilla.org/en-US/docs/Web/API/URL/protocol) of the server request.

If any of this information is missing, Astro won't be able to map the route. This will result in a 404.
