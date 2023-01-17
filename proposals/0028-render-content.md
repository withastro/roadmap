- Start Date: 2022-10-14
- Reference Issues:
	- https://github.com/withastro/astro/issues/3816

- Implementation PR: https://github.com/withastro/astro/pull/5291

# Render Content

<aside>

💡 **This RFC compliments our [Content Collections RFC](https://github.com/withastro/rfcs/blob/content-schemas/proposals/0027-content-collections.md).** We recommend reading that document first to understand the goals of “Content” as a concept, and where rendering content fits into that story.

</aside>

# Summary

Render Content is a new way to render Markdown and MDX content without resource bleed (i.e. styles) between documents.

# Goals ⭐️

- **Fix the style & script bleed problem** inherent to `Astro.glob()`
- **Do not lose the ease-of-use** provided by the `Astro.glob()` API for rendering directories of content.

# Example

Say we have a `blog` collection of posts that we want to render as routes. We can pair `getCollection` with `renderEntry` to accomplish this:

```tsx
---
// src/pages/blog/[...slug].astro
import { getCollection, renderEntry } from '.astro';

export async function getStaticPaths() {
	// fetch all entries from `src/content/blog`
	const blog = await getCollection('blog');
	return blog.map(entry => ({
		params: { slug: entry.slug },
		props: { entry },
	});
}

const { entry } = Astro.props;
// Render the entry used by our given route
// - Injects all `style`s imported by this entry (if MDX)
// - Returns a <Content /> component for use in `.astro` pages
const { Content } = renderEntry(entry);
---
<h1>{entry.data.title}</h1>
<Content />
```

# Motivation

There are two major challenges Astro has addressed since the project’s early days:

1. I want a **landing page** with links to a set of routes in a directory. Say, a list of all URLs in `src/pages/blog/`
2. I want to **generate routes dynamically** from all posts in a given directory. Say `src/posts/*` 👉 `src/pages/[posts]`

Since migrating to Vite, Astro has leaned into its built-in concept for globbing directories of content: `import.meta.glob`. Here’s what that API will output, using both the default “lazy” option and the “eager” option:

```tsx
const lazyPosts = await import.meta.glob('./blog/*.md');
/* {
	'./blog/first.md': () => Promise(module),
	'./blog/second.md': () => Promise(module),
} */

const eagerPosts = await import.meta.glob('./blog/*.md', { eager: true });
/* {
	'./blog/first.md': { frontmatter: {...}, rawContent: '# First...',
	'./blog/second.md': { frontmatter: {...}, rawContent: '# Second...',
} */
```

You’ll notice that lazily globbing only yields an object of file names. To access any other information about a given post (including frontmatter), you’ll need to call that `() => Promise(module)` function to import the file. You’ll likely call this function across *all* of your modules when tackling the landing page problem **(1)** or the dynamic routes problem **(2)**.

To make these problems easier to tackle without learning Vite’s nuances, Astro created the `Astro.glob` abstraction. This abstraction is based on the eager example above, but mapping the object to an array of its values. In other words:

```tsx
Astro.glob('stuff') === Object.values(import.meta.glob('stuff', { eager: true }))
```

This makes landing pages and dynamic routes fairly trivial to build:

```tsx
---
// src/pages/index.astro
const posts = await Astro.glob('./blog/**/*.{md,mdx}');
---
<h1>My blog landing page</h1>
<ul>
  {posts.map(post => (
    <li>
			<a href={post.url}>{post.frontmatter.title}</a>
    </li>
  ))}
</ul>
```

```tsx
---
// src/pages/blog/[post].astro
export function getStaticPaths() {
	const posts = await Astro.glob('../../posts/**/*.{md,mdx}');
	return posts.map(post => ({
		params: { post: customMapFileToSlugHelper(post.file) },
		props: { Post: post },
	})
}
const { Post } = Astro.props;
---
<h1>{Post.frontmatter.title}</h1>
<Post />
```

However, there’s a reason that Vite does *not* eagerly load by default, which brings us to…

## Where this breaks down

In short, eagerly loading information about every module makes it *tough* to know which resources are actually needed.

Take our landing page example above. We’ll assume that none of the entries `blog/**` have style or component imports… well, except for one pesky file. We’ll call this `blog/comic-sans-is-great.mdx`:

```tsx
import '../comic-sans-override.css';

# My custom post
...
```

```tsx
// comic-sans-override.css
body {
  font-family: 'Comic Sans MS';
}
```

Now that MDX is supported for content authoring, it’s fairly common to pull in one-off styles or components for a given post that aren’t shared by other files. 

However, this poses a problem for our landing page. As you may know, you’re free to render the content of a globbed post (styles, components and all) [using the `Content` component](https://docs.astro.build/en/guides/markdown-content/#content).

This feature can be a double-edged sword though; Since `Astro.glob` eagerly loads every module, **it will also inject every module’s imports (namely styles) onto the page where it is globbed.**

This means, when `index.astro` globs all of our `blog/**` posts, it will now inject `comic-sans-override.css` onto the page as well. This happens whether we *actually* use the Content component or not. Yikes!

This is more jarring in our dynamic routes example. Recall that we’re calling `Astro.glob` to get a list of all paths to generate:

```tsx
// [blog].astro
export function getStaticPaths() {
	const posts = await Astro.glob('../../posts/**/*.{md,mdx}');
	return posts.map(post => ({...})
}
```

Since this function is run for every route generated by `[blog]`, it will also inject styles from **every** globbed entry into **every blog route.**

```bash
/blog/comic-sans-is-great.mdx #Comic Sans'd
/blog/first.md #Comic Sans'd
/blog/second.md #Comic Sans'd
```

Our blog can’t escape the Comic Sans plague 💀

## How `renderEntry` addresses this

We need a way to explicitly opt-in to style injection only where needed. To do so, we propose a function to called `renderEntry`.

Let’s revisit that `getStaticPaths` example from earlier, this time using `renderEntry`:

```tsx
---
// src/pages/blog/[...slug].astro
import { getCollection, renderEntry } from '.astro';

export async function getStaticPaths() {
	// fetch all entries from `src/content/blog`
	const blog = await getCollection('blog');
	return blog.map(entry => ({
		params: { slug: entry.slug },
		props: { entry },
	});
}

const { entry } = Astro.props;
// Render the entry used by our given route
const { Content } = renderEntry(entry);
---
<h1>{entry.data.title}</h1>
<Content />
```

The key difference here: `renderEntry` is called on the single entry used by a given route, instead of blindly importing the whole directory’s resources on a given route. Revisiting our Comic Sans nightmare from earlier:

- `src/pages/blog/first` → `renderEntry('blog/first.md')` → no resources injected
- `src/pages/blog/second` → `renderEntry('blog/second.md')` → no resources injected
- `src/pages/blog/comic-sans-is-great.mdx` → `renderEntry('/blog/comic-sans-is-great.mdx')` → comic-sans-override.css injected 👀

# Detailed design

As you might imagine, there’s a bit of trickery needed to selectively add styles and component resources to the page. We’ll offer a high-level overview here ahead of a full PR.

## `renderEntry` API reference

- **Param:** `entry: ReturnType<getCollection> | ReturnType<getCollection>['id']`
    - Either a complete `getCollection` return type, or the ID of the entry to render. The ID type is a union of all valid IDs in your `src/content` directory (not a generic string) for better type checking.
- **Returns: `{ Content: AstroComponentFactory }`**
    - A `Content` component for use in Astro or MDX files

## Usage breakdown

You can render a collection entry using an ID and collection name. These are both available from the `getEntry` and `getCollection` results:

```tsx
---
import { getEntry, renderEntry } from '.astro';

// Option 1: renderEntry by getCollection or getEntry return value
const firstNewsletter = await getEntry('newsletter', 'first.md');
const { Content } = await renderEntry(firstNewsletter);

// Option 2: renderEntry by id and collection
// Useful when the full `getCollection` return object is not available
const { id, collection, slug } = await getEntry('newsletter', 'first.md');
// ... somewhere later
const { Content } = await renderEntry({ id, collection });
---

<Content />
```

In this example:

1. We use `getEntry` or `getCollection` to get references to whatever we want to render ([see the Content Schema RFC example](https://github.com/withastro/rfcs/blob/content-schemas/proposals/0027-content-collections.md#example))
2. We pass this fetched entry to `renderEntry`. This **imports** our entry processed through the Vite pipeline to retrieve a `Content` component, and **injects** all component resources (styles and nested island dependencies) onto the page.

<aside>

💡 For step 2 to work in production builds, we will lazy glob all `src/content/` entries using dynamic imports [via a manifest](#a-new-renderentrymap). This is because we won’t know which entries to bundle until SSR endpoints are run, so we need to prepare all entries in anticipation. Yes, this means build performance will *just* meet the status quo of `Astro.glob`, though it could be optimized in the future.

</aside>

### Retrieve `headings` and `injectedFrontmatter`

You may also need `renderEntry` to retrieve results from the remark or rehype pipelines. This includes:
- generated headings - [see our existing `getHeadings` utility](https://docs.astro.build/en/guides/integrations-guide/mdx/#getheadings)
- injected frontmatter - [see our frontmatter injection example for reading time](https://docs.astro.build/en/guides/markdown-content/#example-injecting-frontmatter)

Each can be accessed like so:

```tsx
---
import { getCollection, renderEntry } from 'astro:content';
const blogPosts = await getCollection('blog');
---

{blogPosts.map(async (post) => {
  const {
    injectedFrontmatter, // all properties injected via remark
    headings, // result of `getHeadings`
  } = await renderEntry(post);
  const { readingTime } = injectedFrontmatter;
  const h1 = headings.find(h => h.depth === 1);
  
  return <p>{h1} - {readingTime} min read</p>
})}
```

> **🙋‍♂️ Why don't `getCollection` and `getEntry` contain these values?** The remark and rehype pipelines are only run when your content is rendered. `renderEntry` has access to the complete rendered result, so we can expose **values based on a post's contents** from here!

## Flagging `src/content` resources

Currently, we crawl **every** module imported by a given page to discover styles and component resources used, and dump all discovered resources into sets of `scripts`, `styles`, and `links`. 

This approach is too naive for our style bleed problem. Instead, we want to flag which resources can be added normally, and which should be deferred until `renderEntry` is called.

To do this, we need a special import flag to tell our css crawlers to move all nested resources of that import into a separate bucket.

Pseudo-code for how this may work:

```tsx
function crawlCss(currentModule, discoveredStyles, discoveredSrcContentStyles) {
	const { importedModules } = viteServer.getModuleInfo(currentModule);
	for (const importedModule of importedModules) {
		if (isStyle(currentModule)) {
			if (currentModule.endsWith(SPECIAL_FLAG)) {
				discoveredSrcContentStyles.add(currentModule);
			} else {
				discoveredStyles.add(currentModule);
			}
		}
	}
}
```

## Adding `src/content` resources from `renderEntry`

Once we’ve pulled our `src/content` resources for later, we need to inject these resources (such as stylesheets) onto the page. Astro has internal support for head propagation through a special comment. The module that implements `renderEntry` will look like:

```js
// astro-head-inject

export function renderEntry(/* ... */) {
	// ...
}
```

This tells the Astro renderer to look for and add propagated HTML into the document `head`.

The `createComponent` function takes an object where we can create a component that does head propagation. Pseudo-code for that will look like:

```js
import { createComponent } from 'astro/runtime/server/index.js';

export function renderEntry() {
	return createComponent({
		factory(result, props, slots) {
			return createHeadAndContent(
				renderUniqueStylesheet(result, {
					href: '/path/to/these/styles.css'
				}),
				renderTemplate`${renderComponent(result, 'Other', Other, props, slots)}`
			);
		},
		propagation: 'self'
	});
}
```

The key piece is `propagation: 'self'`, which tells Astro to wait for this component to render and inject its head content.

This means that this component can be used anywhere, such as in layout components. Styles will be added lazily only where/when the component is used in a template.

## A new `renderEntryMap`

The Content Collections proposal [presented a new manifest](https://github.com/withastro/rfcs/blob/content-schemas/proposals/0027-content-collections.md) generated from `src/content`, stored in a `.astro` directory as a cache. We expect `renderEntry` to add a lazy `import.meta.glob` call (see background) so we can avoid loading each module until used.

```tsx
export const renderEntryMap = import.meta.glob('src/content/**/*.{md,mdx}', { query: { SPECIAL_FLAG: true } });
```

# Testing strategy

- **`astro build` integration tests:** Ensure styles and component scripts are present when using `renderEntry` + MDX.
- **`astro dev` e2e tests:** validate styles are added and removed when MDX styles and components are modified.

# Drawbacks

- Injecting styles via `renderEntry` requires access to the page's SSR result. This leads to failures in TypeScript files that may not be expected, and involves some level of tech debt to properly delay and inject assets.
- Separating "rendering" from "getting" may be confusing to `Astro.glob` users. This is one more moving piece to explain, though [there are parallels to Nuxt 3](https://content.nuxtjs.org/api/composables/use-document-driven) that could help documentation.

# Alternatives

The main alternative to `renderEntry` would be modifying the internals of `Astro.glob` to similarly differ resource imports until a `Content` component is called. This is certainly possible, but has a 2 main caveats:

- Content Collections are poised to replace arbitrary globs for Markdown and MDX, for the benefits presented in that RFC. Doubling down on `Astro.glob` for **rendering** these documents would likely confuse users, as they’d need to move between glob syntax and collection-based fetching fairly often.
- Focusing on `Astro.glob` would likely expand this RFC’s scope beyond `src/content` to include any directory in your project. This makes an experimental release a bit more unpredictable, and abandoning “safe” directories like `src/content` could close doors for optimization in the future.

# Adoption strategy

[See content Collections proposal](https://github.com/withastro/rfcs/blob/content-schemas/proposals/0027-content-collections.md#adoption-strategy)

# Unresolved questions

- Can and **should** we merge `renderEntry`'s behavior into `getCollection`? i.e. making the `Content` component available on all content entries as an async function, rather than using a separate import?
- Can `renderEntry` make importing content more performant? i.e. can we explore other avenues to avoid loading content until absolutely necessary, speeding up our MDX processing time to more closely match Markdown?
- Is injecting into compiled code [as presented here](#detailed-design) the best approach for an MVP? Or could our compiler understand `.astro` as a “reserved” import that could modify compiled output safely?