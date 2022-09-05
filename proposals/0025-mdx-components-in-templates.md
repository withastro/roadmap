- Start Date: 2022-09-05
- Reference Issues: https://github.com/withastro/docs/issues/1234
- Implementation PR: <!-- leave empty -->

# Summary

Include custom MDX components (e.g. h1-6, p, ol, etc.) in `layout` components.

# Example

If the proposal involves a new or changed API, then;

- include a basic code example; otherwise,
- omit this section if it's not applicable.

# Motivation

Currently, if you want to have a set of custom components for your MDX documents, you need to import (and export) them at the start of each file:

```js
import H1 from "../components/H1.astro"
import Paragraph from '../components/Paragraph.astro';
import Blockquote from '../components/Blockquote.astro';
export const components = { h1: H1, p: Paragraph, blockquote: Blockquote };
```

This either (i) creates a lot of boilerplate that needs to be copied to each new file, (ii) style content (in a somewhat constrained way) in the layout component by using css with tag selectors, or (iii) requires programming a custom router page like:

```astro
---
// src/pages/[slug].astro
import path from "node:path";
import Layout from "../layouts/Layout.astro";
import Heading from "../components/Heading.astro";

export async function getStaticPaths() {
  const posts = await Astro.glob('../content/*.mdx');
  return posts.map(post => ({
    params: { slug: path.parse(post.file).name },
    props: post,
  }));
}
---

<Layout>
  <Astro.props.default components={{ h1: Heading }} />
</Layout>
```


# Detailed design

I propose to include a `components` option in a layout component's frontmatter. Currently, Astro already implements a `layout` option for MDX in the frontmatter, which seems like a natural place to bundle both the structure of the page and the components that would be rendered with MDX.

For example, an API could be something like:
```astro
---
// src/layouts/MdxLayout.astro
import BaseLayout from './BaseLayout.astro';
import H1 from "../components/H1.astro";
import Paragraph from '../components/Paragraph.astro';
import Blockquote from '../components/Blockquote.astro';

export const components = { h1: H1, p: Paragraph, blockquote: Blockquote };
---

<BaseLayout>
  <slot />
</BaseLayout>
```

Then, when the MDX uses the layout, these components could be used to render the appropriate tags.

I'm not exactly sure how to implement this feature. It seems like the [way layout components are used](https://github.com/withastro/astro/blob/63cd9d89e8b83ce5e39cdae84a8342e28d1940cc/packages/integrations/mdx/src/astro-data-utils.ts#L15-L68) is in a rehype plugin (which occurs after MDX processes the file). It could be possible to inject the import and export code during [this step](https://github.com/withastro/astro/blob/63cd9d89e8b83ce5e39cdae84a8342e28d1940cc/packages/integrations/mdx/src/index.ts#L67-L85) but that might be difficult in the proposed API since the exported `components` object is the actual components, and not strings. I suspect doing it similar to the way the custom router above does it is the best way, but I really don't know enough about the underlying code powering Astro to say exactly what the best strategy would be. 

# Drawbacks

One potential drawback is that this is an MDX specific feature, which could be confusing if for example, people expect their HTML tags (e.g. `<h1>`) to be transformed in their `.astro` pages when using their `<MdxLayout>` layout. That of course could be mitigated with proper documentation of the feature. 

# Alternatives

Three alternatives were described above:

(i) Import and export components in each mdx file.

(ii) Style content (in a somewhat constrained way) in the layout component by using css with tag selectors. For example,

```astro
---
// src/layouts/MdxLayout.astro
---

<style>
h1 {
  font-size: 1.5rem;
  margin-bottom: 0.75rem;
}
</style>

<slot />
```

This way works well for styling, but doesn't allow you to do any processing or wrap in custom components.

(iii) requires programming a custom router:

```astro
---
// src/pages/[slug].astro
import path from "node:path";
import Layout from "../layouts/Layout.astro";
import Heading from "../components/Heading.astro";

export async function getStaticPaths() {
  const posts = await Astro.glob('../content/*.mdx');
  return posts.map(post => ({
    params: { slug: path.parse(post.file).name },
    props: post,
  }));
}
---

<Layout>
  <Astro.props.default components={{ h1: Heading }} />
</Layout>
```


# Adoption strategy



# Unresolved questions

I'm not sure what the best path forward in actual implementation of this feature which is obviously an important question to get right. 
