- Start Date: 2023-05-12
- Reference Issues/Discussions: 
  - https://github.com/withastro/roadmap/discussions/272
  - Legacy https://github.com/withastro/roadmap/pull/212
- Implementation PR: https://github.com/withastro/astro/pull/7074

# Summary

Provide an API for integrations to implement custom `client:` directives to provide greater control for when client-side JS is loaded and executed.

# Example

```js
import { defineConfig } from 'astro/config';
import onClickDirective from '@matthewp/astro-click-directive';

export default defineConfig({
  integrations: [onClickDirective()]
});
```

```js
export default function onClickDirective() {
  return {
    hooks: {
      'astro:config:setup': ({ addClientDirective }) => {
        addClientDirective({
          name: 'click',
          entrypoint: fileUrlToPath(new URL('./click.js', import.meta.url))
        });
      },
    }
  }
}
```

```ts
import type { ClientDirective } from 'astro'

const clickDirective: ClientDirective = (load, opts, el) => {
  window.addEventListener('click', async () => {
    const hydrate = await load()
    await hydrate()
  }, { once: true })
}

export default clickDirective
```

# Background & Motivation

The last client directive added to core was the `client:only` directive in [August 2021](https://github.com/withastro/astro/issues/751). Since that time the core team has been hesitant to add new client directives despite the community asking about them.

Allowing custom client directives would both:

- Allow the community to experiment with different approaches to lazy-loading client JavaScript.
- Provide evidence, through telemetry data, on which directives are most used. This data could be used to determine if a directive should be brought into core.

Some examples of custom directives that people have wanted in the past:

- Loading JavaScript on client interactive, such as mouseover or click.
- Loading JavaScript when an element is visible, as opposed to within the viewport as `client:visible` currently does.
- The [Idle Until Urgent](https://philipwalton.com/articles/idle-until-urgent/) pattern which loads on either idle or interaction, whichever comes first.

# Goals

- Provide a way to customize loading of client components.
- Allow integrations to add their own directives.
- Allow integrations to provide type definitions for their new directives.

# Non-Goals

- Allowing overriding builtin directives.
- Allowing for additional customization via new types of directives outside of `client:`.
- Allowing multiple directives to run at the same time.

Previously goals in Stage 2:
- Refactor the implementation of `client:` loading to get rid of the precompile step (this is a core repo refactor / improvement).

(Moved as non-goal as it's more performant to precompile the builtin directives still)

# Detailed Design

When loading the Astro config and running the integrations, those that add new client directives are kept in a `Map` together with Astro's default set of client directives.

Each client directive entrypoint will be bundled with esbuild before starting the dev server or build. This method is chosen as:

1. Client directives should be small and simple, so we don't need the entire Vite toolchain to build (it's also complex to rely on the existing Vite build).
2. It's easier to handle the builds upfront so the consumer can render HTML synchronously.

Once we have a `Map` of client directive names to compiled code, it's a matter of passing this down to `SSRResult` so the runtime renderer can pick the right compiled code to inline.

For typings, libraries can define this in their `.d.ts` file (module):

```ts
declare module 'astro' {
  interface AstroClientDirectives {
    'client:click'?: boolean
  }
}
```

# Testing Strategy

An e2e test will be setup to make sure the client directive API works and loaded. Typings are a bit hard to test, so I'm doing it manually for now.

# Drawbacks

- Larger API surface area
- Opens up partial hydration code pattern
- Future builtin client directives are breaking changes
- Third-party Astro libraries could rely on non-standard client directives

# Alternatives

Don't do this. We add new client directives ourselves as we go.

# Adoption strategy

This won't be a breaking change. The user will only use this feature if they add a client directive through an integration.

# Unresolved Questions

1. Is the typings pattern good? `declare module` and `AstroClientDirectives`. It deviates from Astro middleware `namespace App` pattern since I can't seem to get `astro-jsx.d.ts` to reference `App`.
