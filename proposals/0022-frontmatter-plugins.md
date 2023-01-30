- Start Date: 2022-05-20
- Reference Issues:
	- https://github.com/withastro/astro/pull/3411
	- https://github.com/withastro/astro/issues/5099
- Implementation PR: https://github.com/withastro/astro/pull/5687
- Docs: https://docs.astro.build/en/guides/markdown-content/#modifying-frontmatter-programmatically ([permalink](https://github.com/withastro/docs/blob/3da9e4a/src/pages/en/guides/markdown-content.mdx#modifying-frontmatter-programmatically))

# Summary

I suggest adding a new `markdown.frontmatterPlugins` config option to unlock some usecases and improve developer experience.

# Example

```js
// astro.config.mjs
const addImageTools = (frontmatter) => {
    frontmatter.setup += `\nimport { Picture } from "astro-imagetools/components";`;
    return frontmatter;
}

const dynamicLayout = (frontmatter, fileUrl) => {
    frontmatter.layout = customLayoutSelector(fileUrl);
    return frontmatter;
}

export default defineConfig({
	markdown: {
        frontmatterPlugins: [addImageTools, dynamicLayout]
    }
});
```

# Motivation

Currently, when importing Markdown files, one can modify their content via the `markdown.remarkPlugins` and `markdown.rehypePlugins` config options.

However there is currently no supported way to do the same with their frontmatter. This could open up interesting usecases:
- Auto-registering components in imported Markdown files (just append the imports to `frontmatter.setup`!)
- Providing an easier way for people to add layouts conditionally to many Markdown files at once, as mentioned in https://github.com/withastro/rfcs/discussions/161#discussion-3972352
- Provide a more generic solution to the `frontmatterDefaults` suggestion here: https://github.com/withastro/rfcs/discussions/172#discussioncomment-2558676
- Probably more that I'm missing!

# Detailed design

There is a prototype implementation here: 
https://github.com/withastro/astro/pull/3411

# Drawbacks

- Adds a new config option
- "Frontmatter plugins" are not yet a thing, unlike rehype or remark plugins.

# Alternatives

Considered alternatives included:
- Passing a single `frontmatterUpdate` function in the config. Seemed like a missed
opportunity not to mimic `rehypePlugins` and provide better extensibility.
- Using `unplugin-auto-import` like https://stackblitz.com/edit/github-kzxlce?file=src%2Fpages%2Findex.md
This would solve the usecase of globally registering components but not the others.

# Adoption strategy

This is a new API and won't require any migrations.

# Unresolved questions

- What additional parameters beyond the `frontmatter` should be passed to the plugins?
- Should the plugins return a copy or just modify the intial `frontmatter` object?