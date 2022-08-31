- Start Date: 2022-08-31
- Reference Issues: https://github.com/withastro/rfcs/discussions/272
- Implementation PR: <!-- leave empty -->

# Summary

Provide an API for integrations to implement custom `client:` directives to provide greater control for when client-side JS is loaded and executed.

# Example

## Usage

To use a custom directive in your app, add an integration like any other.

```js
import { defineConfig } from 'astro/config';
import onClickDirective from '@matthewp/astro-click-directive';

export default defineConfig({
  integrations: [onClickDirective()]
});
```

And then use it in your Astro components:

```astro
---
import Counter from '../components/Counter.jsx';
---

<Counter client:click />
```

## Implementation

An implementer of a custom client directive would do so through the hooks API:

```js
export default function() {
  return {
    hooks: {
      'astro:config:setup': ({ addClientDirective }) => {
        addClientDirective({
          name: '@matthewp/astro-click-directive',
          key: 'click',
          entrypoint: '@matthewp/astro-click-directive/client.js'
        });
      },
    }
  }
}
```

The entrypoint being:

```js
export default function(load, opts, element) {
  element.addEventListener('click', async () => {
    const hydrate = await load();
    await hydrate();
  }, { once: true });
}
```

# Motivation

The last client directive added to core was the `client:only` directive in [August 2021](https://github.com/withastro/astro/issues/751). Since that time the core team has been hesitant to add new client directives despite the community asking about them.

Allowing custom client directives would both:

- Allow the community to experiment with different approaches to lazy-loading client JavaScript.
- Provide evidence, through telemetry data, on which directives are most used. This data could be used to determine if a directive should be brought into core.

Some examples of custom directives that people have wanted in the past:

- Loading JavaScript on client interactive, such as mouseover or click.
- Loading JavaScript when an element is visible, as opposed to within the viewport as `client:visible` currently does.
- The [Idle Until Urgent](https://philipwalton.com/articles/idle-until-urgent/) pattern which loads on either idle or interaction, whichever comes first.

# Detailed design

## Client Directive API

A client directive is a file that exports a function that handles loading and hydrating components. The type is:

```ts
type Hydrate = () => Promise<void>;
type Load = () => Promise<Hydrate>;

type DirectiveOptions = {
  // The component displayName
  name: string;
  // The attribute value provided,
  // for ex `client:interactive="click"
  value: string;
}

export type ClientDirective = (load: Load, opts: DirectiveOptions, element: HTMLElement);
```

A directive might import and use this type like so:

```ts
import type { ClientDirective } from 'astro';

const directive: ClientDirective = (load, opts, element) => {
  element.addEventListener('click', async () => {
    const hydrate = await load();
    await hydrate();
  }, { once: true });
};

export default directive;
```

## Integration API

The API for registering a custom directive is modelled on the `addRenderer` and `setAdapter` APIs, where you provide a name for the directive and a path to the implementation.

```js
export default function() {
  return {
    hooks: {
      'astro:config:setup': ({ addClientDirective }) => {
        addClientDirective({
          name: '@matthewp/astro-click-directive',
          key: 'click',
          entrypoint: '@matthewp/astro-click-directive/client.js'
        });
      },
    }
  }
}
```

Similar to how renderers and adapters work, the directive will be stored on the configuration's context object as a key/value pair of directive keys (such as `click` in this example) and the directive options (the object shown in this example).

This means that if there are conflicting directives; directives that are using the same key, only one will "win", which will be whichever comes last.

Our own builtin core directives *will also* use this pattern, and this means that it will be possible for a custom directive to __override__ an existing built-in directive; meaning you can redefine `client:visible` to do something different.

## Implementation

Currently all client directives are built into Astro and injected onto the page as a string as JavaScript. We want to replicate this for production builds in order to minimize the number of external requests and prevent waterfalls.

During development a directive will be injected like so:

```html
<script type="module" src="/@id/@matthewp/astro-click-directive/client.js?astro-client-directive"></script>
```

A Vite plugin will define a virtual module that looks like this:

```js
import directive from '@matthewp/astro-click-directive/client.js';

(self.Astro = self.Astro || {}).click = directive;
window.dispatchEvent(new Event('astro:click'));
```

During build type this will get built and bundled and be injected as an inline script in production that looks like:

```html
<script>
"use strict";
{
  const directive = (load, opts, element) => {
    element.addEventListener('click', async () => {
      const hydrate = await load();
      await hydrate();
    }, { once: true });
  };

  (self.Astro = self.Astro || {}).click = directive;
  window.dispatchEvent(new Event('astro:click'));
}
</script>
```

# Drawbacks

- Directives are global and not imported. Someone coming into the project might not know what `client:foo` means since they can't look it up in our documentation.
- It's possible that someone could create a directive that is a lot of code and causes the page to load slower.
  - We could set some file-size limit for directives and error if any exceed it.
- Implementation will require a small refactor of how directives work, but this refactor will improve the code.
- Making this extensible might cause core to deprioritize builtin directives.
- Having a custom directive override an existing built-in one can cause confusion.

# Adoption strategy

- This change will be non-breaking.
- This was designed in such a way that custom directives always override built-in directives. This means that if core adds a new directive it will *not* interfere with a custom directive of the same name; the user's code will continue to work the same.