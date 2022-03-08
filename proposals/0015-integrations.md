- Start Date: 03-07-2022
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: <!-- leave empty -->

# Summary

An integration system for extending Astro.

# Example

```js
// astro.config.js
export default ({
	integrations: [
		import('@astrojs/vue'),
		import('@astrojs/tailwind'),
		import('@astrojs/sitemap'),
		[import('@astrojs/partytown'), {/* options */}],
	],
});
```

# Motivation

Astro has no integration or plugin system of its own. Astro uses Vite interanlly, and Vite does have a plugin system that some users have bene able to hook into. However, this experience leaves a lot to be desired (doesn't support all use-cases, touching the `vite` config as a user is considered advanced).

If we were to add an integration system to Astro, we would unlock two huge wins:
1. Empower users to do more by extending Astro themselves (not blocked by what Astro core can/can't do).
2. Make it easier for users to add common features/libraries to their website

A great example of this in action is to compare Partytown's documentation for Astro vs. Nuxt:
- Astro: [3 steps across frontmatter, template, and a custom npm script](https://partytown.builder.io/astro)
- Nuxt: [1 step](https://partytown.builder.io/nuxt)

Tailwind is another example of a tool that is difficult and multi-faceted to add to Astro today, but would be quick and easy if we had an integration.

# Detailed design

## User Configuration API

```js
// astro.config.js
export default ({
	integrations: [
		import('@astrojs/vue'),
        // or, with options
		[import('@astrojs/vue'), {/* options */}],
	],
});
```

## Integration API

```ts
export interface AstroIntegration {
	name: string;
	hooks: {
		'astro:config:setup': (options: {
			config: AstroConfig;
			command: 'dev' | 'build';
			addRenderer: (renderer: AstroRenderer) => void;
			injectScript: (stage: 'beforeHydration' | 'head' | 'bundle', content: string) => void;
			injectHtml: (stage: 'head' | 'body', element: string) => void;
		}) => void | Partial<AstroUserConfig> | Promise<void> | Promise<Partial<AstroUserConfig>>;
		'astro:config:done': (options: { config: AstroConfig }) => void | Promise<void>;
		'astro:server:setup': (options: { server: vite.ViteDevServer }) => void | Promise<void>;
		'astro:server:start': (options: { address: AddressInfo }) => void | Promise<void>;
		'astro:server:done': () => void | Promise<void>;
		'astro:build:start': () => void | Promise<void>;
		'astro:build:done': (options: { pages: string[]; dir: URL }) => void | Promise<void>;
	};
}
```

# Drawbacks

Why should we *not* do this? Please consider:

- Implementation cost, both in term of code size and complexity.
- Whether the proposed feature can be implemented in user space.
- Impact on teaching people Astro.
- Integration of this feature with other existing and planned features
- Cost of migrating existing Astro applications (_is it a breaking change?_)

There are tradeoffs to choosing any path. Attempt to identify them here.

# Alternatives

What other designs have been considered? What is the impact of not doing this?

# Adoption strategy

- This would be a breaking change for most users.
- We are exploring a codemod + `astro setup` / `astro setup [name]` commands to mitigate this cost

With enough time and effort we could maybe do this in a backwards-compatible way. However, this is a change that is relatively straightforward to make (only change a single file) AND we actually do want people to know that Astro supports integrations now. As far as breaking changes go, this is a pretty positive one.


# Unresolved questions

TODO