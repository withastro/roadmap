- Start Date: 2024-04-15
- Reference Issues: https://github.com/withastro/roadmap/issues/837
- Implementation PR: <!-- leave empty -->

# Summary

Improve DX and security around environment variables in Astro.

# Example

```js
// astro.config.mjs
import { defineConfig, envField } from "astro/config"

export default defineConfig({
  env: {
    schema: {
      PUBLIC_STRIPE_KEY: envField.string({
        context: "client",
        access: "public"
      }),
      PUBLIC_PRODUCTION: envField.boolean({
        context: "server",
        access: "public",
        optional: true
      }),
      API_PORT: envField.number({
        context: "server",
        access: "secret",
        default: 7000
      })
    }
  }
})
```

```ts
import {
  PUBLIC_STRIPE_KEY // string
} from "astro:env/client"
import {
  PUBLIC_PRODUCTION, // boolean | undefined
  getSecret
} from "astro:env/server"

const API_PORT = getSecret("API_PORT") // number
const UNKNOWN_VARIABLE = getSecret("UNKNOWN_VARIABLE") // string | undefined
```

# Background & Motivation

Env variables are an important part of any web application. You need to store sensitive data (think API secrets, tokens etc) without being leaked inside your git repo. But that's only the 1st part of the story. It's easy to leak this data by importing in the wrong place, eg. the frontend like [Resend in January 2024](https://resend.com/blog/incident-report-for-january-10-2024).

Other JS frameworks (eg. [SvelteKit](https://kit.svelte.dev/docs/modules#$env-dynamic-private)) are handling env pretty well. However the env story is currently a bit tricky in Astro. According to the [docs](https://docs.astro.build/en/guides/environment-variables/), here is how env variables are currently handled:

- Astro uses Vite’s built-in support for environment variables
- Static variables (ie. replaced statically at build time) are accessible via `import.meta.env`
- `import.meta.env` includes some [default variables](https://docs.astro.build/en/guides/environment-variables/#default-environment-variables) like `SSR`, `BASE_URL`...
- A public variable key has to be prefixed by `PUBLIC_`
- A non public variable accessed using `import.meta.env` on the client side will be `undefined` (value will be accessible server side)
- Env variables can be loaded through `.env` (or `.env.production`, `.env.development`) and CLI
- Any non built-in variable can be [manually typed]([.env.production](https://docs.astro.build/en/guides/environment-variables/#intellisense-for-typescript))
- Runtime variables should be access using `process.env`, or following the used runtime (eg. `Deno.env.get()` for the deno adapter)

# Goals

- Provide a fully type-safe experience for environment variables, without [manual type definitions](https://docs.astro.build/en/guides/environment-variables/#intellisense-for-typescript)
- Reduce user confusion between inlined, static variables and dynamic, runtime variables
- Allow adapters to specify how runtime env variables should be handled
- Allow integrations to define environment variable constraints
- Simple type casting and validation (strings/numbers/booleans, required/optional)

# Non-Goals

- Complex validation or type casting of env variables. We might want to enable this at some point, but there is likely a performance cost for this at runtime. We should punt on this if possible!
- Future: allow adapters to customize build-time variable handling. Better runtime handling is the most important problem this proposal aims to solve, but if we find an API that enables this as well, that's great.

# Detailed Design

## Terminology

- **Public variable**: variable replaced by its value at build time. Its key must be prefixed by `PUBLIC_` 
- **Secret variable**: variable retrieved at runtime, never part of the bundle. Uses runtime specific features, like `process.env` or `Deno.env.get()`
- **Server variable**: variable available server-side only
- **Client variable**: variable available client-side and server-side

## Astro config and helper

A new `env.schema` property is added to `AstroUserConfig`. Its type looks like so:

```ts
type StringField = {
  type: "string"
  optional?: boolean
  default?: string
}

type NumberField = {
  type: "number"
  optional?: boolean
  default?: number
}

type BooleanField = {
  type: "boolean"
  optional?: boolean
  default?: boolean
}

type EnvFieldType = StringField | NumberField | BooleanField

type PublicClientEnvFieldMetadata = {
  context: "client"
  access: "public"
}

type PublicServerEnvFieldMetadata = {
  context: "server"
  access: "public"
}

type SecretServerEnvFieldMetadata = {
  context: "server"
  access: "secret"
}

type EnvSchema = Record<string, (PublicClientEnvFieldMetadata | PublicServerEnvFieldMetadata | SecretServerEnvFieldMetadata) & EnvFieldType>

type AstroUserConfig = {
  env?: {
    schema: EnvSchema
  }
}
```

We provide a `envField` helper to make it easier to define the schema:

```ts
import { envField } from "astro/config"

// { context: "client", access: "public", type: "number", default: 4321 }
envField.number({ context: "client", access: "public", default: 4321 })
```

Note that a variable is required by default, and can be made optional with `optional: true` or `default: value`.

## Integrations

The above way of declaring the schema allows integrations to declare their own constraints from inside `astro:config:setup` without any special handling:

```ts
import { envField } from "astro/config"
import type { AstroIntegration } from "astro"

const integration = {
  name: "stripe-integration",
  hooks: {
    "astro:config:setup": (params) => {
      params.updateConfig({
        env: {
          schema: {
            PUBLIC_STRIPE_KEY: envField.string({ context: "client", access: "public" })
          }
        }
      })
    }
  }
} satisfies AstroIntegration
```

Given how `updateConfig` works, if a variable is specified by a user and throuhg an integration, the one from the latest integration will be kept. 

## Validators and checking

Since Astro Env does not support many data structures, custom validators are used for the validation. They are used inside a vite plugin to check against public variables loaded by Vite and fail if constraints are not matched.

Those validators are also used at runtime by `getSecret`, more on that in a section below.

## Client variables

Client variables are made available through the `astro:env/client` virtual module.

### Public client variables

Public client variables, once validated, are directly exported from `astro:env/client`. Here is an example of the types generated and usage:

```ts
// .astro/env.d.ts
declare module "astro:env/client" {
  export const PUBLIC_STRIPE_KEY: string;
}

// Any .ts loaded by Vite
import { PUBLIC_STRIPE_KEY } from "astro:env/client"
```

### Secret client variables

This kind of variable is not supported as there's no safe way to send this data to the client. Types are made in such a way that TypeScript will not allow it nor the Astro config schema.

## Server variables

Server variables are made available through the `astro:env/server` virtual module. Importing this module client-side will throw an `AstroError`.

### Public server variables

Public server variables, once validated, are directly exported from `astro:env/server`. Here is an example of the types generated and usage:

```ts
// .astro/env.d.ts
declare module "astro:env/server" {
  export const API_PORT: number;
}

// Any .ts loaded by Vite
import { API_PORT } from "astro:env/server"
```

### Secret server variables

Secret server variables are available through `getSecret` exported from `astro:env/server`. This function allows retrieving a variable by its key:

- If the key has not been specified in the schema, the function returns `string | undefined`
- If the key is part of the schema, it will be validated at runtime using the custom validators and return the right data type. Note that an invalid variable will throw an `AstroError` at runtime only

```ts
// .astro/env.d.ts
declare module "astro:env/server" {
  type SecretValues = {
    API_PORT: number;
  }

  type SecretValue = keyof SecretValues

  type Loose<T> = T | (string & {})
  type Strictify<T extends string> = T extends `${infer _}` ? T : never

  export const getSecret: <TKey extends Loose<SecretValue>>(key: TKey) => TKey extends Strictify<SecretValue> ? SecretValues[TKey] : (string | undefined)
}

// Any .ts loaded by Vite
import { getSecret } from "astro:env/dynamic"

const API_PORT = getSecret("API_PORT") // number
const UNKNOWN_VARIABLE = getSecret("UNKNOWN_VARIABLE") // string | undefined
```

Adapters can provide their own implementation per request by providing a `getEnv` function to `app.render`. It's the adapter responsability to only return strings or undefined values (eg. Cloudflare `env` also contains bindings):

```ts
await app.render(request, {
  getEnv(key) {
    // env comes from cloudflare
    const variable = env[key]
    // prevent returning bindings
    if (typeof variable === "string" || typeof variable === "undefined") {
      return variable
    }
    return undefined
  }
})
```

> Note: providing a `getEnv` implementation at the adapter level (vs. per request) is being considered.

# Testing Strategy

Unit tests are written for:

- Custom validators

Integration tests are written for:

- Client/public variables
- Server/public variables
- Making sure the server virtual module can't be imported client-side
- `getEnv` adapters implementation
- Config validation

Astro Env config options will first be made available under the `experimental` property:

```ts
export default defineConfig({
  experimental: {
    env: {
      schema: {}
    }
  }
})
```

# Drawbacks / integration

- The implementation in terms of code size and complexity seems reasonable. It shouldn't affect too many parts of the codebase
- The RFC can be implemented in userland partially (eg. exposing apis to adapter is not possible without integrations inter-communication), see https://github.com/florian-lefebvre/astro-env/pull/4
- This feature requires update across the docs as the official recommendation, although it's not breaking
- Other parts of Astro need this, for example integrations like `@astrojs/db`

# Alternatives

## Typed `import.meta.env`

https://github.com/florian-lefebvre/astro-env currently does [manual typing](https://docs.astro.build/en/guides/environment-variables/#intellisense-for-typescript) on behalf of the user. It's too basic and only handles static variables.

## Secret variables using `Astro.env`

The issue restrict secret variables usage inside `.astro` files (or endpoints `context`). It's common to be able to use it outside, eg. in `.ts`

## Using zod

Using zod in the public interface isn't great as `.env` files remain strings, so it requires more work to get right ([especially for booleans](https://env.t3.gg/docs/recipes#booleans)) and we only support a tiny subset of zod APIs.

We've also considered using it under the hood. While it's not an issue for public variables (build time, part of the bundle), it would increase the bundle for runtime usage significantly.

## Providing fields helpers in a function

Instead of exporting `envField` from `astro/config`, it has been considered to be provided as a function argument of `schema`:

```ts
export default defineConfig({
  env: {
    schema: (fields) => ({
      FOO: fields.string()
    })
  }
})
```

It's not great because:
- It's not serializable
- It can cause side-effects (if you call something before returning the object)
- It makes merging in `updateConfig` (Integrations API) harder

## Dedicated `env.ts`

Having a dedicated entrypoint has been considered, mainly to play better with a zod based API:

```ts
import { defineEnv } from "astro/config"
import { z } from "astro/zod"

export default defineEnv({
  FOO: z.string()
})
```

It was too restrictive and caused 2 issues:
- Users could forget to use the default export
- Auto-complete could point to this file instead of virtual imports when typing `env`

Note using such convention is still possible using the current proposal:

```ts
// env.ts
import { envField } from "astro/config"

export const envSchema = {
  PUBLIC_STRIPE_KEY: envField.string({
    context: "client",
    access: "public"
  }),
}

// astro.config.mjs
import { defineConfig } from "astro/config"
import { envSchema } from "./env"

export default defineConfig({
  env: {
    schema: envSchema
  }
})
```

# Adoption strategy

- **If we implement this proposal, how will existing Astro developers adopt it?**
  - They should not use [manual typing](https://docs.astro.build/en/guides/environment-variables/#intellisense-for-typescript) anymore
  - Any custom env var (ie. not built-in like `SSR`) used with `import.meta.env` should be added to `env.schema` and imported through Astro Env virtual modules:

  ```diff
  // astro.config.mjs
  import {
    defineConfig,
  +  envField
  } from "astro/config"

  export default defineConfig({
  +  env: {
  +    schema: {
  +      PUBLIC_API_URL: envField.string({ context: "client", access: "public" })
  +    }
  +  }
  })

  // whatever.ts
  - import.meta.env.PUBLIC_API_URL
  + import { PUBLIC_API_URL } from "astro:env/client"
  ```

- **Is this a breaking change? Can we write a codemod?**
  - This is not breaking
  - A codemod could help migrate, although not required. It may require too much efforts, given how codemods are hard to write
- **How will this affect other projects in the Astro ecosystem?**
  - This is not breaking for users projects nor integrations
  - The `astro-env` integration will be deprecated
  - Integrations adding manual environment checks like https://github.com/MatthiesenXYZ/astro-ghostcms/ will be able to migrate
