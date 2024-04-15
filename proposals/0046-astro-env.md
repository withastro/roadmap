<!--
  Note: You are probably looking for `stage-1--discussion-template.md`!
  This template is reserved for anyone championing an already-approved proposal.

  Community members who would like to propose an idea or feature should begin
  by creating a GitHub Discussion. See the repo README.md for more info.

  To use this template: create a new, empty file in the repo under `proposals/${ID}.md`.
  Replace `${ID}` with the official accepted proposal ID, found in the GitHub Issue
  of the accepted proposal.
-->

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
      API_URL: z.static().private().string(),
      PUBLIC_FOO: z.static().public().string({ default: "bar" }),
      STRIPE_KEY: z.dynamic().private().string()
    }
  }
})
```

```ts
import { API_URL, PUBLIC_FOO } from "astro:env/static"
import { getEnv } from "astro:env/dynamic"

const stripeKey = getEnv("STRIPE_KEY")
```

# Background & Motivation

Env variables are an important part of any web application. You need to store sensitive data (think API secrets, tokens etc) without being leaked inside your git repo. But that's only the 1st part of the story. It's easy to leak this data by importing in the wrong place, eg. the frontend like [Resend a few weeks ago](https://resend.com/blog/incident-report-for-january-10-2024).

Other JS frameworks (eg. [SvelteKit](https://kit.svelte.dev/docs/modules#$env-dynamic-private)) are handling env pretty well. From my understanding, the env story is currently a bit tricky in Astro. According to the [docs](https://docs.astro.build/en/guides/environment-variables/), here is how env variables are currently handled:

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

- `Static variable`: variable replaced by its value at build time. Uses `import.meta.env` under the hood
- `Dynamic variable`: variable retrieved at runtime, never part of the bundle. Uses runtime specific features, like `process.env` or `Deno.env.get()`

## Astro config

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

type NumberField = {
  type: "boolean"
  optional?: boolean
  default?: boolean
}

type EnvFieldType = StringField | NumberField | BooleanField

type PublicStaticEnvFieldMetadata = {
  scope: "static"
  access: "public"
}

type PrivateStaticEnvFieldMetadata = {
  scope: "static"
  access: "private"
}

type PrivateDynamicEnvFieldMetadata = {
  scope: "dynamic"
  access: "private"
}

type EnvSchema =
  [ Record<`PUBLIC_${string}`, PublicStaticEnvFieldMetadata & EnvFieldType>
  | Record<string, (PrivateStaticEnvFieldMetadata | PrivateDynamicEnvFieldMetadata) & EnvFieldType>

type AstroUserConfig = {
  env?: {
    schema: EnvSchema
  }
}
```

Since there are various combinations possible that can make choosing confusing, we provide a `envField` helper that uses chaining, mirroring other APIs like Astro DB or zod:

```ts
import { envField } from "astro/config"

// { scope: "static", access: "public", type: "number", default: 4321 }
envField.static().public().number({ default: 4321 })

// { scope: "dynamic", access: "private", type: "string" }
envField.dynamic().private().string()
```

## Integrations

The above way of declaring the schema allows integrations to declare their own constraints from inside `astro:config:setup` without any special handling:

```ts
import { envField } from "astro/config"
import type { AstroIntegration } from "astro"

const integration = {
  name: "supabase-integration",
  hooks: {
    "astro:config:setup": (params) => {
      params.updateConfig({
        env: {
          schema: {
            PUBLIC_SUPABASE_URL: envField.static().public().string()
          }
        }
      })
    }
  }
} satisfies AstroIntegration
```

## Static variables

Static variables are checked at some point between `astro:config:setup` and `astro:server:setup`. Since we don't/won't support many data structures, custom validators are used for the validation. They will also be used for dynamic variables at runtime.

The `astro:env/static` virtual module is generated like so:

```ts
export const FOO = import.meta.env["FOO"]
export const PUBLIC_BAR = import.meta.env["PUBLIC_BAR"] ?? true
```

Types are generated via codegen, likely at `.astro/types.d.ts`:

```ts
declare module "astro:env/static" {
  export const FOO: string
  export const PUBLIC_BAR: boolean
} 
```

There's no protection to put in place regarding client-side usage, since `import.meta.env` already handles it.

## Dynamic variables

Dynamic variables are an adapter feature, meaning it's not supported by purely static site (ie. no adapter set).

> TODO: see what api makes most sense, probably an entrypoint but it also needs to be request dependent for Cloudflare

Variables are accessible through the `astro:env/dynamic` virtual module:

```ts
import { getEnv } from "astro:env/dynamic"

getEnv("FOO")
```

Under the hood, this feature will rely on [Async Local Storage](https://nodejs.org/api/async_context.html). For instance, this will require the cloudflare adapter to implement a codemod to enable the TODO:flag_name flag in `wrangler.toml`.

Values will be validated at runtime using the same custom validators as static variables, and typed using codegen:

```ts
declare module "astro:env/dynamic" {
  type Values = {
    "FOO": boolean
    "BAR": string
  }

  export const getEnv: <TKey extends keyof Values>(key: TKey) => Values[TKey]
}
```

# Testing Strategy

Unit tests will be made for:
- Custom validators

E2e test will be made for:
- Testing public/private
- Testing static/dynamic
- Integrations

Features will be implemented incrementally using feature flags:

```ts
export default defineConfig({
  experimental: {
    env: {
      schema: {},
      // then
      staticVariables: true,
      // then
      dynamicVariables: true
    }
  }
})
```

# Drawbacks / integration

- The implementation in terms of code size and complexity seems reasonable. It shouldn't affect too many parts of the codebase
- The user can be implemented in userland, although more limited (eg. exposing apis to adapter is not possible without integrations inter-communication), see https://github.com/florian-lefebvre/astro-env/pull/4
- This feature requires update across the docs as the official recommendation, although it's not breaking
- Other parts of Astro need this, for example integrations like `@astrojs/db`

# Alternatives

What other designs have been considered? What is the impact of not doing this?

# Adoption strategy

Please consider:

- If we implement this proposal, how will existing Astro developers adopt it?
- Is this a breaking change? Can we write a codemod?
- Can we provide a runtime adapter library for the original API it replaces?
- How will this affect other projects in the Astro ecosystem?

# Unresolved Questions

Optional, but suggested for first drafts.
What parts of the design are still to be determined?
