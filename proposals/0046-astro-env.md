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
  access: "private" // allows for public if we ever want to support it
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

## Static variables

## Dynamic variables

# Testing Strategy

How will this feature's implementation be tested? Explain if this can be tested with
unit tests or integration tests or something else. If relevant, explain the test
cases that will be added to cover all of the ways this feature might be used.

# Drawbacks

Why should we _not_ do this? Please consider:

- Implementation cost, both in term of code size and complexity.
- Whether the proposed feature can be implemented in user space.
- Impact on teaching people Astro.
- Integration of this feature with other existing and planned features
- Cost of migrating existing Astro applications (_is it a breaking change?_)

There are tradeoffs to choosing any path. Attempt to identify them here.

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
