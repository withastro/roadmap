- Start Date: 2023-02-28
- Reference Issues: https://github.com/withastro/roadmap/issues/496
- Implementation PR: https://github.com/withastro/astro/pull/6209

# Summary

This RFC introduces Markdoc support to Astro Content Collections.


# Example

Say you've authored a collection of blog posts using Markdoc. You can store these entries as a collection, identically to Markdown or MDX:

```bash
src/content/
	blog/
		post-1.mdoc
		post-2.mdoc
		post-3.mdoc
...
```

Then, you can query entry frontmatter with the same `getCollection()` and `getEntryBySlug()` APIs:

```astro
---
import { getCollection, getEntryBySlug } from 'astro:content';

const blog = await getCollection('blog');
const firstEntry = await getEntryBySlug('blog', 'post-1');
---
```

You can also render Astro components from your Markdoc by configuring Markdoc [tags](https://markdoc.dev/docs/tags) and [nodes](https://markdoc.dev/docs/nodes). This example creates an `aside` tag for use in any Markdoc Content Collection entry:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import markdoc from '@astrojs/markdoc';

// https://astro.build/config
export default defineConfig({
	integrations: [
		markdoc({
			tags: {
				aside: {
					render: 'Aside',
          attributes: {
            // Component props as attribute definitions
            // See Markdoc's documentation on defining attributes
            // https://markdoc.dev/docs/attributes#defining-attributes
            type: { type: String },
          }
				},
			},
		}),
	],
});
```

Then, you can map the string passed to `render` (`'Aside'` in this example) to a component import. This is configured from the `<Content />` component used to render your Markdoc using the `components` prop:

```astro
---
import { getEntryBySlug } from 'astro:content';
import Aside from '../components/Aside.astro';

const entry = await getEntryBySlug('blog', 'post-1');
const { Content } = await entry.render();
---

<Content
  components={{
    Aside: Aside,
  }}
/>
```

See [the detailed API section](#api) for information on supported Markdoc configuration, shared components config, and manual rendering.

# Background & Motivation

Include any useful background detail that that explains why this RFC is important.
What are the problems that this RFC sets out to solve? Why now? Be brief!

It can be useful to illustrate your RFC as a user problem in this section.
(ex: "Users have reported that it is difficult to do X in Astro today.")

# Goals

- **Create an `@astrojs/markdoc` integration** that adds `.mdoc` support to content collections.
- **Support Astro components and server-rendered UI components** (React, Vue, Svelte, etc) within Markdoc files. Note this leaves client-rendered UI components out-of-scope (see non-goals).
- **Benchmark Markdoc performance against Markdown and MDX** at 1k and 10k documents. This addresses problem (1) from the previous section.

# Non-goals

- Non-goal: **ESM import and `src/pages/` support** for Markdoc files. [See discussion](https://github.com/withastro/roadmap/discussions/478#discussioncomment-4975072) for context.
- Out-of-scope: **Allowing the `.md` extension.** This would mean overriding Astro's `.md` renderer, which is tightly coupled to remark and your `markdown` configuration options today. We agree using `.md` for Markdoc is a common use case, and deserves a separate proposal to make Astro's Markdown rendering flexible.
- Future: **A solution for client-rendered UI components.** Unlike MDX, Markdoc doesn't have a concept of directives, and our compiler doesn't have a clear way to dynamically render client-side components ([see challenges](https://gist.github.com/bholmesdev/491fa440efa8bd73d410d66c0c2143c2)). We will recommend users wrap their components in an Astro component to apply the `client:` directive.
- Future: **Full alignment with Markdown and MDX** rendered result. Namely, the computed `headings` property (which can be tackled in future releases) and frontmatter manipulation via remark (since remark is incompatible with Markdoc).

# Detailed Design

## API

Markdoc support will be specific to content collections. This means Markdoc files can be included alongside other content collection entries via the `.mdoc` extension. Entries can also be queried using the same `getCollection()` and `getEntryBySlug()` APIs for Markdown and MDX.

### Markdoc configuration

The Markdoc integration accepts [all Markdoc configuration options](https://markdoc.dev/docs/config).

These options will be applied during [the Markdoc "transform" phase](https://markdoc.dev/docs/render#transform). Markdoc parsing and transforms are run **at build time** (rather than server request time) both for static and SSR Astro projects. This ensures all Markdoc validation is run _before_ your site is deployed, so you avoid shipping invalid Markdoc files and runtime errors to your users.

You can pass these options from the `markdoc()` integration in your `astro.config`. This example declares a `countries` variable and an `includes` function for use across all Markdoc Content Collection entries:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import markdoc from '@astrojs/markdoc';

// https://astro.build/config
export default defineConfig({
  integrations: [
    markdoc({
      variables: {
        // Declare a global list of countries
        countries: ['EN', 'ES', 'JP'],
      },
      functions: {
        // Check if array includes value
        includes: {
          transform(parameters) {
            const [array, value] = Object.values(parameters);
            return array.includes(value);
          },
        },
      },
    }),
  ],
});
```

### Rendering Markdoc content

Users can render Markdoc entry contents via the `<Content />` component. This feautres a `components` prop mapping configured Markdoc nodes and tags to Astro components or server-rendered UI components.

Type: `components?: Record<string, ComponentInstance>`

We expect users to share a common Markdoc `components` setup throughout their application. Because of this, we will recommend creating a utility component to encapsulate that config.

For example, say a user wants to to render their configured `aside` tag with an `Aside` component across their blog collection. This `BlogContent` component will configure a shared `components` prop:

```astro
---
// src/components/BlogContent.astro
import Aside from './Aside.astro';
import type { CollectionEntry } from 'astro:content';

type Props = {
	entry: CollectionEntry<'blog'>;
};

const { entry } = Astro.props;
const { Content } = await entry.render();
---

<Content
	components={{ Aside }}
/>
```

Now, users can render any blog collection entry with this config by passing the entry to `BlogContent`:

```astro
---
import { getEntryBySlug } from 'astro:content';
import BlogContent from '../components/BlogContent.astro';

const mdocEntry = await getEntryBySlug('blog', 'test');
---

<h1>{intro.data.title}</h1>
<BlogContent entry={mdocEntry} />
```

### Manual runtime configuration

Users may need to override their global Markdoc configuration for a specific use case. This may be to pass SSR query params as Markdoc `variables` (a common use case for the Stripe team), or to create `tags` specific to a single entry.

For this, we will require that users install the `@markdoc/markdoc` package to process their configuration manually. This example creates an inline config object, rendering the post via the base Astro Markdoc `Renderer` and the Content Collection `body` property:

```astro
---
import Markdoc from '@markdoc/markdoc';
import { Renderer } from '@astrojs/markdoc';
import { getEntryBySlug } from 'astro:content';

const { body } = await getEntryBySlug('collection', 'slug');
const ast = Markdoc.parse(body);
const content = Markdoc.transform({
  variables: { abTestGroup: Astro.params.testGroup },
}, ast);
---

<Renderer {content} components={...} />
```

Note this will transform and validate Markdoc at **runtime,** rather than build time, which can introduce runtime errors. Documentation should clearly call out this tradeoff.

## Internal implementation

Markdoc will be introduced as an integration similar to today's MDX integration. This can be added to your `astro.config`, with auto configuration using `astro add markdoc`:

```ts
// astro.config.mjs
import markdoc from '@astrojs/markdoc';

export default {
	integrations: [markdoc()],
}
```

To standardize our process for adding new collection formats, we will experiment with a (private) integration helper internally. This example shows an `addContentEntryType` hook to setup the `.mdoc` extension, attach logic for parsing the `data` and `body` properties, and define `astro:content` types for the `Content` component:

```ts
// @astrojs/markdoc/index.ts
export const markdoc: AstroIntegration = () => ({
		async 'astro:config:setup'({ addContentEntryType }) {
			addContentEntryType({
				extensions: ['.mdoc'],
        getEntryInfo({ contents }) {
          const parsed = parseFrontmatter(contents);
          return {
            // The unparsed data object that can be passed to a Zod schema.
            data: parsed.data,
            // The body of the data file. This should be the raw file contents with metadata (i.e. frontmatter block) stripped
            body: parsed.content,
            // (Optional) The untouched frontmatter block with newlines and formatting preserved. Used for computing error line hints.
            rawData: parsed.matter,
          }
        },
        // Type definition for `<Content />` component props, passed as a string.
        // This example reads from an existing `.d.ts` file.
        contentModuleTypes: await fs.readFile(
          new URL('../template/content-module-types.d.ts', import.meta.url),
          'utf-8'
        ),
			});
		}
	}
});
```

Let's break down each property of `addContentEntryType()` individually:

- **`extensions`:** File extensions to add as supported Content Collection formats.
- **`getEntryInfo()`** A functionto convert raw file contents to separate `data` and `body` attributes. This example uses a frontmatter parser (ex. [gray-matter](https://github.com/jonschlinkert/gray-matter)) to retrieve a raw data object. Note this data will be passed to a Zod schema, and should not be validated within `getEntryInfo()`.
- **`contentModuleTypes`:** Any type definitions to be added to the generated `.astro/types.d.ts` file. For Markdoc, this includes overrides for the `<Content />` component type signature. This allows autocomplete for Markdoc-specific props like `config` and components when fetching a collection of `.mdoc` files.

_**Note:** The `Content` component type signature is specific to the entry's file extension. This means, when a collection is of a single file extension (i.e. all `.mdoc` files), that type signature will apply without type guards. When a mix of file extensions are used, users will receive a union type for every `Content` component signature. It will be up to the user to type cast or narrow from here. This follows the behavior of our `Astro.glob(...)` type inference today._

Here is an example `contentModuleTypes` definition, setting a type signature for `.mdoc` content entries:

```ts
// template/content-modoule-types.d.ts
declare module 'astro:content' {
	interface Render {
		'.mdoc': Promise<{
			Content(props: {
				config?: import('@astrojs/markdoc').MarkdocConfig;
				components?: Record<string, import('astro').ComponentInstance['default']>;
			}): import('astro').ComponentInstance['default'];
		}>;
	}
}
```

# Testing Strategy

Markdoc will have both functionality and performance tests.

## Performance benchmark tests

Write a content collection performance benchmark comparing Markdoc to our existing Markdown and MDX pipelines. The benchmark should compare the following metrics at 1k and 10k documents:

- SSG build time and memory usage when using plain text, Astro components, and UI framework components like React.
- SSR render time for the same use cases.

Tests should also introduce a flag (ex. `ASTRO_PERFORMANCE_BENCHMARK`) to disable nonessential remark plugins for Markdown and MDX (GFM, Smartypants, Shiki, heading IDs). This ensures a level playing field comparing against Markdoc.

These tests do not need to be tied to our CI pipeline. However, **a detailed summary of testing methods, results, and conclusions** should be drafted to present alongside the `@astrojs/markdoc` integration.

## Integration tests

Add integration tests for using Markdoc content collections in SSG and SSR across development and production. These tests should ensure:

- `getCollection()` and `getEntryBySlug()` return expected properties.
- rendered `<Content />` is correct for simple text, tags, and components.

# Drawbacks

- Introducing a new content format adds overhead to Astro core and (potentially) learning curve for new users. This should be addressed with clear messaging that Markdoc is experimental, and MDX is still our recommendation for component-rich content.
- Adding performance benchmarks for Markdoc may add complexity to our CI pipeline. We should ensure automated test times remain reasonable across PRs when adding new test suites.

# Alternatives

- **Double down on MDX support**, investing more engineering resources into the format's performance, language tools, and featureset. We have already invested time into improving Rollup build times to accommodate higher memory usage. Still, there are certain aspects of MDX (coupling content to UI) that are unavoidable without proposing fundamental changes.
- **Introduce a new Markdown format** specific to Astro. This has echoes in our former Astro-flavored Markdown format, and has been mentioned in [recent roadmap discussion posts](https://github.com/withastro/roadmap/discussions/503#discussioncomment-5125773). This has a higher maintenance cost attached that was deemed unsustainable during the Astro 1.0 Beta period. Even so, it would be the most optimal path for Astro to own the language tooling and performance story similar to the `.astro` format today.

# Adoption strategy

Our target audience will be existing Markdoc users excited for support in Astro, and members of the community curious to try the new format. To reach this audience, we will:

1. Add a detailed README, discoverable from the "integrations" tag in the Astro docs.
2. Add a `with-markdoc` starter project to astro.new.
3. Market the integration via blog posts, social media, and a Discord community announcement.

This also means we will _not_ update recommendations for authoring component-rich content. MDX should still be our go-to across all Astro documentations.

# Unresolved Questions

- Can support for the client hydrated components be added to Markdoc with a compiler change? Today, we are limited to passing components as slots rather than props, making this support difficult.
