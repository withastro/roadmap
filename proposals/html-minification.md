- Start Date: 2023-05-08
- Reference Issues: https://github.com/withastro/roadmap/issues/537
- Implementation PR: https://github.com/withastro/astro/pull/6706

# Summary

Provide a config value to enable HTML minification.

# Example

In the Astro config:

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  compressHTML: true
})
```

This will enable HTML minfication for all pages.

# Background & Motivation

This is an often requested feature as minified HTML is a performance improvement some site measuring tools recommend.

However there are some difficulties that have prevented it from being implemented sooner:

- HTML minification can cause server/client hydration mismatches
- Streaming uses newlines to delineate when to flush buffered text in a response
- Frameworks can use HTML comments as expression markers, which can cause issues if these are removed by a minifier

HTML minification is enabled in the compiler via the `compress` option, so not a lot of work is needed to enable this feature.

# Goals

- Safely (non-destructively) collapse whitespace during `.astro` file compilation.
- Allow users to opt-in to minification, keeping it disabled to prevent unexpected output.

# Non-Goals

- Minifying non-`.astro` components. This can be done with middleware.
- Minifying the full page. This would prevent streaming.

# Detailed Design

In `@astrojs/compiler` 1.0 support for the `compress` option was added. When enabled this option will remove whitespace when a `.astro` component is compiled to JavaScript.

In Astro we'll add a `compressHTML` option that defaults to `false`. This option is passed directly to the `compress` option in the compiler.

This is a top-level configuration value so that you get the same result in development and production modes.

# Testing Strategy

Fixture based tests are best here since this feature touches the config through rendering. Tests will check the output and ensure that they are 

How will this feature's implementation be tested? Explain if this can be tested with
unit tests or integration tests or something else. If relevant, explain the test
cases that will be added to cover all of the ways this feature might be used.

# Drawbacks

- This approach does not compress non-`.astro` component usage.
- There is some overlap with middleware. A middleware would be able to compress each chunk. The downside is that a user would need to import and use this middleware.

# Alternatives

- This could be implemented as a middleware function that a user could import and use.
  - **Downside**: Middleware is still experimental.
  - **Downside**: This is a lot of code just to enable a feature. User has to learn middleware where they otherwise might not be using it.
  - **Downside**: Compression is already enabled in the compiler, so this is a small change to allow it to happen.

# Adoption strategy

- This is a small change so no experimental release is thought to be needed.
- Preview release will occur to allow user testing.
- Full release with a merged RFC in the next `minor`.
- Documented via the config reference page.