**If you have feedback and the feature is released as experimental, please leave it on the Stage 3 PR. Otherwise, comment on the Stage 2 issue (links below).**

- Start Date: 2026-05-12
- Reference Issues: https://github.com/withastro/roadmap/discussions/1343
- Implementation PR: https://github.com/withastro/astro/pull/16149
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1363
- Stage 3 PR: https://github.com/withastro/roadmap/issues/1364

# Summary

Replace Astro's default Markdown / MDX pipeline with [Sätteri](https://satteri.bruits.org), a native (Rust) Markdown / MDX compiler, and add a pluggable `markdown.processor` config so users that depend on the remark / rehype ecosystem can opt back into it.

# Example

The default case requires no config changes. Both `.md` and `.mdx` go through Sätteri:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';

export default defineConfig({});
```

To pass Sätteri plugins or enable optional parser features, call `satteri()`:

```js
// astro.config.mjs
import { defineConfig, satteri } from 'astro/config';
import myPlugin from './my-satteri-plugin.js';

export default defineConfig({
  markdown: {
    processor: satteri({
      hastPlugins: [myPlugin],
      features: { directive: true, definitionList: true },
    }),
  },
});
```

To keep the remark / rehype pipeline, install `@astrojs/markdown-remark` and pass `unified()`:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkToc from 'remark-toc';

export default defineConfig({
  markdown: {
    processor: unified({ remarkPlugins: [remarkToc] }),
  },
});
```

Existing configs that still use the top-level `remarkPlugins` / `rehypePlugins` / `remarkRehype` fields keep working as long as `@astrojs/markdown-remark` is installed. Astro auto-wraps them into `unified({...})` and prints a deprecation warning:

```js
// astro.config.mjs — legacy, still works with a warning
import { defineConfig } from 'astro/config';
import remarkToc from 'remark-toc';

export default defineConfig({
  markdown: {
    remarkPlugins: [remarkToc],
  },
});
```

The MDX integration picks up the same processor automatically. To run `.mdx` through a different processor (or the same processor with different options) than `.md`, pass `processor` to the integration:

```js
// astro.config.mjs
import { defineConfig, satteri } from 'astro/config';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';

export default defineConfig({
  markdown: { processor: satteri() },
  integrations: [mdx({ processor: unified({ remarkPlugins: [/* ... */] }) })],
});
```

# Background & Motivation

Bigger Astro websites with a lot of Markdown / MDX files tend to take a long time to build, for instance the Astro docs or the Cloudflare docs take multiple minutes. The bottleneck is not solely the Markdown / MDX processing of course, but it's a fair amount of it.

Remark and the greater unified ecosystem are great, however:

- Remark is unfortunately on the slower side of things
- The unified ecosystem pulls in 100+ dependencies in Astro

For the past few months, I've been working on [Sätteri](https://satteri.bruits.org), a native Markdown pipeline for the JS ecosystem. The goal is to be a LightningMarkdown to unified's PostCSS: zero runtime dependencies, extremely fast, low memory usage, but without losing the ability to use JS plugins, and when using said plugins, have as low of a cost as possible (subscription-based plugins, where a plugin declares which node types it cares about and skips the rest).

It also includes built-in support for features that people previously used remark / rehype plugins for, such as directives or smart punctuations, which will hopefully reduce the need for plugins to exist for a consequential percentage of users in the first place.

I suggest it becomes the default Markdown / MDX pipeline in Astro. Users that do depend on the remark ecosystem, or don't / can't port their plugins, can still use remark if they prefer, but it becomes opt-in via a new config that would work similarly to how image services work right now in Astro.

# Goals

- Cut Markdown and MDX build times on content-heavy sites like the Astro docs or Cloudflare docs
- Drop the remark / rehype stack from the default install, reducing Astro's dependencies by 100~
- Keep a supported path for projects that depend on remark or rehype plugins.
- Make the Markdown engine an extension point. Third-party processors (not only Sätteri and unified) should be able to plug in, similar to image services.
- Don't break existing sites: projects without any remark / rehype plugins should see no difference in rendered output after upgrading.

# Non-Goals

- Native syntax highlighting; we'll keep using Shiki.
- Mixing multiple Markdown processors in the same project.
- Prism support under the new pipeline, at least at first.
- Built-in support for MDX or any other formats from third-party processors. They have to opt into MDX themselves.

# Detailed Design

## `markdown.processor`

The new `markdown.processor` config option takes a `MarkdownProcessorEntry`, an object that builds the runtime renderer for `.md` (and optionally `.mdx`) files. It defaults to `satteri()`. The interface is exported from `astro/markdown`:

```ts
interface MarkdownProcessorEntry {
  readonly name: string;
  createRenderer(shared: SharedMarkdownConfig): Promise<MarkdownProcessor>;
  createMdxRenderer?(
    shared: SharedMarkdownConfig,
    mdx: MdxRendererOptions,
  ): Promise<MdxRenderer>;
}
```

`SharedMarkdownConfig` covers the cross-cutting Markdown options (`syntaxHighlight`, `shikiConfig`, `gfm`, `smartypants`, `image`) that apply regardless of the engine. A processor that doesn't implement `createMdxRenderer` falls back to `@astrojs/mdx`'s built-in handling for the two known names (`'satteri'` and `'unified'`). Third-party processors can implement `createMdxRenderer` themselves or omit it and only handle `.md`.

Shape-wise this mirrors image services: the user picks one of the built-in options or drops in a third-party one, and the rest of Astro stays the same, interacting with the Markdown processor through an abstraction.

One could imagine that in the future, this could be set to `undefined` by default and Astro would ship without Markdown support built-in, keeping the core lean for people that don't use Markdown at all.

## `satteri()`

Exported from `astro/config` (re-exported from `@astrojs/markdown-satteri`). Calling it returns a `MarkdownProcessorEntry` you pass to `markdown.processor`. The options you can pass it:

- `mdastPlugins`: MDAST plugins
- `hastPlugins`: HAST plugins
- `features`: optional Sätteri parser feature toggles (directives, definition lists, etc.)

The MDX integration recognizes the Sätteri processor by name and merges these plugins and features into the MDX pipeline, so a single `markdown.processor` config drives both file types without duplicating plugins, much like how it works right now with remark/rehypePlugins between Markdown and MDX.

## `unified()` and `@astrojs/markdown-remark`

`@astrojs/markdown-remark` is no longer a transitive dependency of `astro`. Users that want the remark pipeline (directly via `markdown.processor: unified({...})` or indirectly via the deprecated top-level options) have to install it themselves:

```sh
pnpm add @astrojs/markdown-remark
```

`unified()` takes the same `remarkPlugins`, `rehypePlugins`, and `remarkRehype` shape that the deprecated top-level options used. Auto-wrapping (see below) routes legacy configs through it without any user changes beyond installing the package for easier migration.

## The `@astrojs/markdown-satteri` package

A new `@astrojs/markdown-satteri` package wraps Sätteri and exposes it as a `MarkdownProcessorEntry`. It ships as a dependency of `astro`, so users on the default don't install it explicitly. It exports `satteri()`, which returns the value you pass to `markdown.processor`. The package also contains all the built-in internal plugins Astro requires for various things (`astro:assets`, islands etc.)

## Deprecation: top-level `remarkPlugins` / `rehypePlugins` / `remarkRehype`

The top-level `markdown.remarkPlugins`, `markdown.rehypePlugins`, and `markdown.remarkRehype` options are deprecated but continue to work for now. During config validation, Astro checks if any of them are set and `markdown.processor` is not. If so, it dynamically imports `@astrojs/markdown-remark`, wraps the legacy options in `unified({...})` and prints a deprecation warning.

If `@astrojs/markdown-remark` is not installed, the user gets an error telling them to install it and optionally migrate to the new processor API.

## MDX integration

`@astrojs/mdx` reads `config.markdown.processor` (or its own `processor` option override) in the `astro:config:done` hook. Based on the processor's `name`:

- `'satteri'`: built-in Sätteri MDX path. The processor's `mdastPlugins`, `hastPlugins`, and `features` are merged into the MDX options.
- `'unified'`: built-in unified MDX path. The processor's `remarkPlugins`, `rehypePlugins`, and `remarkRehype` are merged into the MDX options.
- anything else: the integration calls `processor.createMdxRenderer(shared, mdx)` and uses the returned renderer.

The `extendMarkdownConfig` integration option still controls whether `.mdx` inherits from `markdown.*` or starts from defaults.

# Testing Strategy

The pluggable layer is covered by the existing test suite for both `astro` and `@astrojs/mdx`, which already runs every Markdown / MDX test against the configured processor:

- The full unit and e2e test suites for `astro` and `@astrojs/mdx` now run against the new default (Sätteri). Any rendering regression in the default path surfaces there.
- The remark / rehype path is exercised through fixtures that opt into `markdown.processor: unified({...})` or uses the now-deprecated legacy auto-wrapping path (top-level `remarkPlugins` / `rehypePlugins` still set).
- Sätteri itself has its own test suite upstream covering the parser and core plugins; we depend on it like any other parser.
- A new third-party-processor fixture exercises the `MarkdownProcessorEntry` contract end to end (a minimal processor that implements `createRenderer` and `createMdxRenderer` and renders both file types).
- Config validation tests cover the auto-wrapping behavior: legacy options auto-wrap with a deprecation warning, and a missing `@astrojs/markdown-remark` install produces the expected error.

# Drawbacks

- Two Markdown implementations rarely produce byte-identical HTML in every edge case. We aim for parity on common output, but minor differences (whitespace, markup, etc.) may surface, but would be considered bugs.
- Users that depend on a remark or rehype plugin have to install `@astrojs/markdown-remark` themselves and switch to `markdown.processor: unified({...})`. The legacy fields auto-wrap, but it's still a config change to make. A codemod could be made available if we deem it necessary.
- We now ship two markdown packages (`@astrojs/markdown-satteri` by default, `@astrojs/markdown-remark` opt-in), always annoying.
- Sätteri is a new project. Its plugin ecosystem is small compared to remark / rehype.
- Documentation cost: every Markdown / MDX guide that mentions `remarkPlugins` or `rehypePlugins` needs an update.

# Alternatives

- Keep unified as the default and ship Sätteri as opt-in. The performance and dependency wins only land for users who actively switch, which from past experience is a small fraction. The docs sites that feel build time the most would keep paying the cost.
- Depend on something else than Sätteri. The truth is that there's not a lot of options that have the flexibility we require. `markdown-it` would be the other obvious possible option.
- Do nothing. Build times for content-heavy sites stay where they are, and the dependency footprint of a stock Astro install stays at the current size.

# Adoption strategy

This lands in the Astro 7 major. The breaking changes are scoped:

- Projects with no `markdown.remarkPlugins`, `rehypePlugins`, or `remarkRehype` set get the new default automatically. There is no migration step, output should be the same.
- Projects that do set those options keep working, with a deprecation warning, as long as `@astrojs/markdown-remark` is installed. The auto-wrapper turns them into `markdown.processor: unified({...})` at config-validation time.
- The recommended migration is a small change: `markdown: { processor: unified({ remarkPlugins, rehypePlugins, remarkRehype }) }` plus an explicit install of `@astrojs/markdown-remark`. Given instructions can be easily done by humans and AI alike.
- For `.mdx` users, the integration picks up `markdown.processor` automatically. No separate change is needed unless you want `.mdx` to use a different processor than `.md`.
- For ecosystem projects: integrations that ship remark / rehype plugins should document that users on Astro 7 need `@astrojs/markdown-remark` and the `unified()` opt-in. Integrations that want to ship Sätteri-native plugins can target `mdastPlugins` / `hastPlugins`.
- Starlight is the highest-priority downstream. Landing it with Starlight on the new default proves the migration on Astro's largest content user.

# Unresolved Questions

- How long do we keep auto-wrapping the deprecated top-level fields? One major? Two? Removing them earlier reduces config-validation surface area but forces another round of user migration.
- How does runtime rendering interact with all of this.
