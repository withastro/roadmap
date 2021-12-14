- Start Date: 2021-12-14
- Reference Issues: https://github.com/withastro/rfcs/discussions/28
- Implementation PR: 

# Summary

Clean up and finalize how CSS is used in an Astro project.

# Motivation

There are roughly five different ways to bring an external CSS file onto the page:

1. `<link href={Astro.resolve("./X.css")} />`
2. ~~`<link rel="stylesheet" href={xUrl}> // import xUrl from './X.css?url';`~~ Note: CSS URL imports are not currently supported by Vite due to a Vite bug, but may be in the future.
3. `<style>@import './X.css';</style>`
4. `import './X.css'; // in Astro component frontmatter`
4. `import './X.css'; // in a React component`

It's difficult for us as maintainers to document, test and support so many different way to do things. Each method may support different features, or imply some different behavior. It's equally difficult for users to understand which is the "right" way to do things.

We also need to make sure that our CSS support works with static builds. CSS cannot be bundled ahead-of-time if we can't detect the CSS statically from the template, which means that things like `<link href={...} />` cannot be analyzed statically and bundled.

# Detailed design

#### 1. ✅ `<link href="/global.css" />` or `<link href="https://..." />`

- **Usecase:** Referencing a `/public` or external CSS URL. 
- **Usecase:** I need complete control over this `<link>` tag, its attributes, and where it lives in the final output.
- No longer supported to use with `Astro.resolve()`! (see other options below for how to reference a style that lives inside of `src/`)
- Not touched by Astro compiler, runtime, or Vite. Both the `<link>` tag and the referenced CSS file will be left as-is in the final output. 
- Must point to a file in `public/` or an external CSS URL. This will not be bundled/optimized.
- Must be nested inside of a `<head>` element.

Note: See the [local directive RFC](https://github.com/withastro/rfcs/blob/build-performance-rfc/active-rfcs/0000-build-performance.md#local-directive) for another alternative on referencing a `src/` file that would be processed/built/bundled.


#### 2. ❌ `<link rel="stylesheet" href={xUrl}> // import xUrl from './X.css?url';`

- Note: Vite currently doesn't support a CSS `?url` import. @matthewp fixed a bug where this now returns the correct URL for `xUrl`, but it still won't bundle this CSS file as you would expect. This means that the resolved URL might not actually exist in the final build, if that file had been bundled. 
- It would be great to support this once Vite fixes their issues, but right now this is considered a Vite limitation. @matthewp to confirm for the final RFC.
- reproduction: https://stackblitz.com/edit/vite-1jaulg?file=dist%2Fassets%2Findex.dd7a6b16.js

<!-- 
- Still supported!
- Vite will see the ESM import, and make sure that this asset exists in your final build.
- Note: There is currently a Vite bug in this support for `import './foo.css?url'`, see: https://stackblitz.com/edit/vite-1jaulg?file=dist%2Fassets%2Findex.dd7a6b16.js
-->

#### 3. ✅ `<style>@import './X.css';</style>` or  `<style global>@import './X.css';</style>`

- **Usecase:** Importing a CSS file that you want optimized with the rest of your site.
- Imported CSS is bundled with the rest of the Astro component-level CSS on the page.
- (for scoped `<style>`) - Imported CSS is not scoped. Only the CSS defined inline inside the `<style>` element is scoped.
- Bundled with the rest of your final CSS. Vite will make sure that duplicate imports are resolved across the final page CSS.
- Resolved by Vite, which means that `@import './X.css';` will inherit from all Vite support, including aliases and npm package `@import` support.

#### 4. ✅ `import './X.css'; // in Astro component frontmatter`

- Supported as a Vite side-effect, but we would not really document this and instead recommend 3. in our documentation and examples.
- Same build/bundle behavior as if you had done 3.
- In a previous draft, the proposal was to completely disable this. However, we wouldn't be able to disable you importing a JS file that then did it's own CSS file import, so we decided to just leave the support in for those who ended up using it.

#### 5. ✅ `import './X.css'; // in React component`

- **Usecase:** Supported as the only way to reference a CSS file inside of a React component.

<!-- 
- Disabled in Astro components in favor of **3. `<style @component>@import './X.css';</style>`**
  - To confirm: is this possible to disable only in Astro components? I think so via Rollup plugin.
- Still supported in React, Preact, and JS files that end up on the client.
  - Open question: if you can import a JS file in an Astro component frontmatter, and then that JS file includes a CSS file ESM import, then is it really that important to disable this with an error? Maybe we just allow this but don't document or recommend it.
-->


# Drawbacks

- This proposal is restricting some current behavior that is undefined or very flexible. Some users who are using those behaviors today may need to update their code to follow the more explicit rules of the new proposal.

# Alternatives

- We can disable #4 entirely, if we would like (see reasoning in item 4 above).

# Adoption strategy

- Give our style docs page a full revamp to highlight these changes.
- Add deprecation warnings in a `v0.x` minor version, when possible.
- Make any breaking changes in a follow-up minor version release.

# Unresolved questions

- None, yet.
