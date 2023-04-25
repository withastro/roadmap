- Start Date: 2023-03-28
- Reference Issues: https://github.com/withastro/roadmap/issues/540
- Implementation PR: <!-- leave empty -->

# Summary

Make the scoping strategy be configurable via a new config option, and add a strategy that uses class names in the selector, giving all Astro styles a +1 in specificity.

# Example

A new configuration option available:

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  scopedStyleStrategy: 'class'
});
```

The valid options for this config are:

* __where__: The current default which uses `:where(.hash)` in selectors, preventing a specificity bump.
* __class__: A new strategy which uses a a bare class name in the selectors, giving all styles a +1 specificity bump.

# Background & Motivation

Before 1.0 Astro used the `class` strategy. In the [scoped CSS with preserved specificity RFC](https://github.com/withastro/roadmap/blob/main/proposals/0012-scoped-css-with-preserved-specificity.md) we changed this to instead use the `where` strategy. We felt that this better reflected the styles *as written*. This strategy prevent the unknown/hidden specificity bump.

However we have come to find that this creates many bugs where a user's global styles will some times *override* Astro styles that use the same selectors. The expected solution to this problem is to control style ordering. Styles ordered last are given priority by browsers.

However, you cannot effectively control ordering in Astro due to bundling. Bundling makes ordering non-deterministic so there's no way for the user to explicitly declare their Astro styles as having a higher specificity.

# Goals

- Fix the immediate problem by allowing users to specify the `class` strategy.
- Set us up for 3.0 so that we can switch the default.
- Preserve the `where` strategy for advanced users. An advanced user can avoid the pitfalls of ordering non-determinism by, for example, using `@layer` to put global styles at a lower layer (lowering its specificity).

# Non-Goals

- Changing our bundling strategy. This would be another solution, for example if we either a) did not bundle at all or b) did not code-split CSS (putting each pages CSS into a single bundle) that could *potentially* solve this problem. But that would be a bigger change that would have other negative side-effects.

# Detailed Design

The scoping of CSS happens within the compiler. It happens [here](https://github.com/withastro/compiler/blob/0a9b30310bd5aea5ad3762da1ade614e9fbb533e/lib/esbuild/css_printer/astro_features.go#L10-L13) during Astro transformation.

The compiler would be updated to also have a `options.ScopeStrategy` configuration value based on the values `where` and `class`. It would use this option when printing the selectors.

The user would control the strategy via a top-level configuration value. The schema for this config is defined [here](https://github.com/withastro/astro/blob/239b9a2fb864fa785e4150cd8aa833de72dd3517/packages/astro/src/core/config/schema.ts#L17).

The rest of the implementation is wiring up this configuration value to be passed down into the compiler. No other changes are necessary

# Testing Strategy

Our usual testing strategy for style things would hold here. There is a `0-css.test.js` test that tests many scenarios, this new option could also be tested there. In 3.0 if we are to change the default, this test file would need to be updated to reflect the new defaults.

# Drawbacks

- Having multiple ways to do the same thing is often not a great idea. In this case I think it is justified because there are pros and cons to both `where` and `class` approach. `where` gives you the maximum flexibility but comes with sharp corners. `class` is a more expected default and probably what most users are expecting when they write their styles, but it becomes harder to override component styles with globals.
- There's some maintenance burden to having any new option. In this case the affected areas are small (just a config passed to the compiler), so I don't worry about this being a maintenance issue.

# Alternatives

- A way to configure certain files as being "global" and having the compiler lower their specificity. Possibly using `@layer` to do so.
- Another way would be to use `@layer` but make global CSS have a lower layer than Astro's.

# Adoption strategy

- Add the configuration option in a minor release.
- Document this option.
- Update the example projects to use it by default, so that `npm init astro@latest` projects get the `class` strategy.
- Switch the default in 3.0.