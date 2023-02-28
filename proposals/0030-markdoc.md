- Start Date: 2023-02-28
- Reference Issues: https://github.com/withastro/roadmap/issues/496
- Implementation PR: https://github.com/withastro/astro/pull/6209

# Summary

A brief, one or two sentence explanation of the proposal.

# Example

https://user-images.githubusercontent.com/51384119/218775296-86dd637d-586a-45f1-b374-e0c96be1a567.mp4


Say you've authored a collection of blog posts using Markdoc. You can store these entries as a collection, identically to Markdown or MDX:

```bash
src/content/
	blog/
		post-1.mdoc
		post-2.mdoc
		post-3.mdoc
...
```

Then, users can query entry frontmatter with the same `getCollection()` and `getEntryBySlug()` APIs:

```astro
---
import { getCollection, getEntryBySlug } from 'astro:content';

const blog = await getCollection('blog');
const firstEntry = await getEntryBySlug('blog', 'post-1');
---
```

Users are also free to render Markdoc contents using a `Content` component, configuring Markdoc tags and component mappings as props:

```astro
---
import Title from '../components/Title.astro';
import Marquee from '../components/Marquee.astro';
import { getEntryBySlug } from 'astro:content';

const mdocEntry = await getEntryBySlug('blog', 'test');
const { Content } = await mdocEntry.render();
---

<html lang="en">
	<body>
		<Content
			config={{
				variables: { underlineTitle: true },
			}}
			components={{
				h1: Title,
				marquee: Marquee,
			}}
		/>
	</body>
</html>
```

See [the detailed API section](#api) for information on all supported props, shared config, and advanced component mapping.

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

### Rendering Markdoc content

Users can render contents and configure Markdoc via the `<Content />` component. This will be exposed from the `render()` result, and feature two props:

- `config?: import('@markdoc/markdoc').Config`: An (optional) Markdoc config to be used [during the transformation step](https://markdoc.dev/docs/render#transform). This includes configuration for Markdoc tags and variables.
- `components?: Record<string, ComponentRenderer>`: An (optional) mapping from Markdoc tags or elements to Astro components.

We expect users to share a common Markdoc `config` and `components` setup throughout their application. Because of this, we will recommend creating a utility component to encapsulate that config.

For example, say a user wants to share config specific to their `blog` collection. This `BlogContent` component will add support for an `{% aside %}` tag across blog entries:

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
	config={{
		tags: {
			aside: {
				render: 'Aside',
				attributes: {
					type: { type: String },
					title: { type: String },
				},
			},
		},
	}}
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

### Advanced: mapping Markdoc nodes to component props

Component renderers can also include a `props()` function to map Markdoc attributes and AST entries to component props. This is useful when:

- computing props based on the Markdoc AST
- mapping Markdoc's generated attributes to prop names

This example maps Markdoc's generated `data-language` attribute for code blocks to the `lang` prop used by Astro's `Code` component, and stringifies the contents to HTML for use with Shiki:

```astro
---
import { Code } from 'astro/components';
import { Title } from '../components/Title.astro';
import Markdoc from '@markdoc/markdoc';
...
---

...
<Content
	components={{
		h1: Title,
		pre: {
			component: Code,
			props({ attributes, getTreeNode }) {
				return {
					lang: attributes['data-language'],
					code: Markdoc.renderers.html(getTreeNode().children),
				};
			},
		},
	}}
/>
```

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
- **`getEntryInfo()` A functionto convert raw file contents to separate `data` and `body` attributes. This example uses a frontmatter parser (ex. [gray-matter](https://github.com/jonschlinkert/gray-matter)) to retrieve a raw data object. Note this data will be passed to a Zod schema, and should not be validated within `getEntryInfo()`.
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

Please consider:

- If we implement this proposal, how will existing Astro developers adopt it?
- Is this a breaking change? Can we write a codemod?
- Can we provide a runtime adapter library for the original API it replaces?
- How will this affect other projects in the Astro ecosystem?

# Unresolved Questions

Optional, but suggested for first drafts.
What parts of the design are still to be determined?
