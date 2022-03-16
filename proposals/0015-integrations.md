- Start Date: 03-07-2022
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: [(git branch, runnable but not yet a PR)](https://github.com/withastro/astro/compare/wip-integrations-4?expand=1)

# Summary

An integration system for extending Astro.

# Example

```js
import vuePlugin from '@astrojs/vue';
import tailwindPlugin from '@astrojs/tailwind';
import partytownPlugin from '@astrojs/partytown';

export default ({
	integrations: [
		vuePlugin(),
		tailwindPlugin(),
		partytownPlugin({/* options */})
	],
});
```

# Motivation

Astro currently has no integration or plugin system of its own. Some users have been able to hook into Astro's internal Vite plugin system to extend Astro, which lets you control the build pipeline. However, this only gives you access to extend one piece of what Astro does (the build). The rest of Astro remains out of touch.

Adding a first-class integration system would unlock a few huge wins for Astro:
1. Empower users to do more by extending Astro themselves (not blocked by what Astro core can/can't do).
2. Empower users to do more by reusing shared extensions (easy to add "X" to an Astro project).
3. Empower more user-land experimentation, reducing how much Astro core blocks what a user can/can't do with Astro.
4. Organize our codebase by refactoring more logic into internal integrations or moved out of core entirely into external integrations.

To illustrate this, compare Partytown's documentation for getting started wtih Astro vs. getting started with Nuxt:
- Astro: [3 steps across frontmatter, template, and a custom npm script](https://partytown.builder.io/astro)
- Nuxt: [1 step](https://partytown.builder.io/nuxt)

Tailwind suffers from a similar difficult setup story in Astro.

# Detailed design

**Background:** This API was reached through weeks of experimentation of different designs (see alternatives below). To test the work, I designed and build the following integrations, which are useful for illustrating this RFC: 

- **Renderers:** [`lit`](https://github.com/withastro/astro/blob/wip-integrations-4/packages/integrations/lit/index.js), [`svelte`](https://github.com/withastro/astro/blob/wip-integrations-4/packages/integrations/svelte/index.js), [`react`](https://github.com/withastro/astro/blob/wip-integrations-4/packages/integrations/react/index.js), [`preact`](https://github.com/withastro/astro/blob/wip-integrations-4/packages/integrations/preact/index.js), [`vue`](https://github.com/withastro/astro/blob/wip-integrations-4/packages/integrations/vue/index.js), [`solid`](https://github.com/withastro/astro/blob/wip-integrations-4/packages/integrations/solid/index.js)
- **Libraries:** [`tailwind`](https://github.com/withastro/astro/blob/wip-integrations-4/packages/integrations/tailwind/index.js), [`partytown`](https://github.com/withastro/astro/blob/wip-integrations-4/packages/integrations/partytown/index.js), [`turbolinks`](https://github.com/withastro/astro/blob/wip-integrations-4/packages/integrations/turbolinks/index.js)
- **Features:** [`sitemap`](https://github.com/withastro/astro/blob/wip-integrations-4/packages/integrations/sitemap/index.js)

## Integration Usage API

```js
import vuePlugin from '@astrojs/vue';
import tailwindPlugin from '@astrojs/tailwind';
import partytownPlugin from '@astrojs/partytown';

export default ({
	integrations: [
		vuePlugin(),
		tailwindPlugin(),
		partytownPlugin({/* options */})
	],
});
```

## Integration Author API

```ts
export interface AstroIntegration {
	name: string;
	hooks: {
		/** SETUP */
		/** Called on astro startup, lets you modify config */
		'astro:config:setup': (options: ConfigSetupOptions) => void | Promise<void>;
		/** Called after config is finalized, lets you store config object for later */
		'astro:config:done': (options: { config: Readonly<AstroConfig> }) => void | Promise<void>;

		/** DEV */
		/** Called on server setup, lets you modify the server */
		'astro:server:setup': (options: { server: vite.ViteDevServer }) => void | Promise<void>;
		/** Called on server startup, lets you read the dev server address/URL */
		'astro:server:start': (options: { address: AddressInfo }) => void | Promise<void>;
		/** Called on server exit */
		'astro:server:done': () => void | Promise<void>;

		/** BUILD */
		/** Called on build start, lets you modify the server */
		'astro:build:start': () => void | Promise<void>;
		/** Called on build done, lets you read metadata about the build */
		'astro:build:done': (options: { pages: string[]; dir: URL }) => void | Promise<void>;
	};
}
```


### Integration Author API: Hooks

- The **Hook** is the main primitive of this proposed integration system.
- Hooks optimize for maximum flexibility for the integration author: you can use our provided helper methods to perform common tasks during each hook, or write your own custom logic for advanced needs.
- Hooks are conceptually aligned with how Rollup and Vite plugins work. This lets us pass some hooks (like 'astro:server:start') to Vite (the Vite `configureServer()` hook) with trivial effort.
- The `hooks: {}` API conceptually matches Rollup & Vite but was designed to avoid the risk of conflict that would have been introduced had we literally extending the Vite plugin idea. 
	- This is why we prefix all hooks with `astro:`.


# Drawbacks

- **Breaking changes across an integration system are expensive.** This can be mitigated until v1.0.0, see adoption strategy below.


# Alternatives

A previous design used a functional API more like this:

```
export default function(integration) {
	integration.injectScript(...);
	integration.modifyConfig(...);
	integration.configureServer(...);
	integration.mountDirectory(...);
}
```

This produced nice, linear code but at the expense of internal Astro complexity and limited flexibility that eventually blocked some integrations from being possible:

1. **Complexity:** Astro had to run the entire integration upfront on startup, and then cache these results for later when needed. Many of the methods (like `configureServer`) ended up acting more like hooks anyway.
2. **Inflexible:** Integrations like Partytown couldn't work with a provided `mountDirectory` helper method because because they need to run their own `fs` logic on the final build directory. 

Advanced use-cases like this essentially required hooks to perform custom logic as needed, so the design shifted away from "helpers that do everything for you" and towards "provide hooks with helpers availble if needed".

# Adoption strategy

## Experimental Flag

This proposal suggests only supporting official integrations to start, and mark 3rd-part integrations as experimental via something like a config flag (`--experimental-integrations`) until we hit `v1.0.0-beta`.

This would let us test the integration system and respond to user feedback before finalizing.

## Renderers

The `renderers` API is deprecated by this proposal, with all `renderers` becoming `integrations`: `@astrojs/renderer-vue` -> `@astrojs/vue`.

With a lot of work, we could do this in a backwards compatible way. However, I would like to avoid that complexity (and the potential for bugs that comes with it) and do this in a breaking change for the following reasons:

1. **low-effort to upgrade:** updating your renderers to integrations would involve changing your config file only. A codemod could be provided to make this even easier.
1. **easy to assist:** Unlike past breaking changes, this will be fairly easy for Astro to provide helpful output to migrate from one to the other.

```
$ astro build

Astro renderers are no longer supported!
Update your config to use Astros new integration system:

- renderers: ["@astrojs/vue"]
+ integrations: [(await import("@astrojs/vue")).default()]
```

# Unresolved questions

- Can we pair this with an `astro add NAME` CLI command?
- Do we use this as a chance to remove the built-in renderers, and force users to install all framework integrations themselves as npm packages? I would like to save that for a later breaking change, since it would make this breaking change more complex (see the adoption strategy defined above).
