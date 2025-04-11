**If you have feedback and the feature is released as experimental, please leave it on the Stage 3 PR. Otherwise, comment on the Stage 2 issue (links below).**

- Start Date: 2024-10-01
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: https://github.com/withastro/astro/pull/12067
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/699
- Stage 3 PR: https://github.com/withastro/roadmap/pull/1035

# Summary

This RFC proposes adding native support for importing and rendering `.svg` files as Astro components, with optimized rendering techniques to minimize performance impact. It aims to allow `.svg` files to be treated as components that accept props and be optimized for repeated use on a page using `<symbol>` and `<use>` elements.

# Example

An SVG can be imported directly into an Astro or MDX file and treat the default export as an Astro component.

```astro
---
import Logo from '../assets/logo.svg'
---

<Logo />
```

# Background & Motivation

Currently, using `.svg` files in Astro requires workarounds that can result in unnecessary complexity or bloated client-side JavaScript. As `.svg` files are widely used for icons and graphics, an optimized solution is necssary to simplify usage and improve performance.

Previously, `astro-icon` was introduced to experiment with `.svg` support but, with the relase of `astro:assets`, there's now an opportunity to provide optimized `.svg` imports that simplify the developer experience and reduce client-side bloat.

The core motivation is to automate best practices around `.svg` usage, enabled developers to effortlessly use and optimize their `.svg` assets in Astro projects.

# Goals

- Enable importing and rendering `.svg` files as Astro components.
- Enable importing and rendering `.svg` files in MDX files
- Allow users to pass props to the root `svg` element while allowing for prop overrides.
- Maintain backwards compatibility with existing `.svg` import behavior.
- Strip unnecessary attributes like `xmlns` and `version` from `.svg` files to reduce size.
- Allow third-party plugins to hook into the `.svg` import behavior to generate their own component libraries.

# Non-Goals

- Future: Allow users to opt-in to optimized `.svg` rendering by utilizing `symbol` and `use` for repeated instances.
- Future: Adding support for `.svg` files as framework components.
- Out-of-scope: Advanced tree-shaking or SSR optimizations for large icon sets.
- Out-of-scope: Advanced `.svg` file optimization such as `svgo`.
- Non-goal: Adding support for `.json` icon sets such as `@iconify/json`.
- Non-goal: SVG content analysis for accessibility.

# Detailed Design

## Importing SVG Files as Components

The core design of this proposal allows `.svg` files to be imported and used as components in Astro. This means developers can import `.svg` files into their Astro components and render them directly as if they were Astro components. The goal is to maintain ease of use while automating performance optimizations under the hood.

**Example:**

```astro
---
import Logo from '../assets/logo.svg';
---

<Logo />
```

This would generate the following output:

```astro
<svg width="24" height="24">
    <!-- SVG Content -->
</svg>
```

## Prop Inheritance and Overriding

When a `.svg` is treated as a component, users can pass attributes such as `width`, `height`, `fill`, `stroke`, and other common SVG attributes. These attributes will automatically be applied to the root `<svg>` element unless they conflict with existing properties in the original `.svg` file, in which case the passed props will override the existing ones.

**Example:**

```astro
---
import Logo from '../assets/logo.svg'
---

<Logo />

<!-- Pass width and height to override default size -->
<Logo width={100} height={100} fill="blue" />
```

This would generate the following output:

```astro
<svg width="24" height="24">
    <!-- SVG Content -->
</svg>
<svg width="100" height="100" fill="blue">
    <!-- SVG Content -->
</svg>
```

## Accessibility Considerations

By default Astro allows you to configure the SVG to meet your accessibility needs.

# Testing Strategy

In addition to standard unit and integration tests, the testing strategy should include:

- **Cross-browser testing:** Ensuring that the Sprite pattern works consistently across all major browsers (e.g., Chrome, Firefox, Safari, Edge).
- **Regression testing:** Verifying that this optimization doesn't unintentionally break any existing `.svg` imports.
- **Performance testing:** Measuring the performance improvements in pages with many `<svg>` elements and comparing the impact of the new rendering system against inlining every SVG individually.

# Drawbacks

- **Increased Complexity for Debugging**: Debugging issues with SVG rendering could become more difficult due to the added abstraction of the Sprite approach. Developers may need additional documentation to understand how SVGs are being rendered and optimized, especially when diagnosing rendering problems in complex applications.
- **Limited Use Cases:** The performance benefits of the Sprite approach may be minimal for projects that don't heavily rely on SVGs. For smaller projects or those with limited SVG usage, the optimization might introduce unnecessary complexity without providing significant gains in performance.
- **Edge Cases with Advanced SVG Features:** Some advanced features of SVGs, like `<filter>` or `<mask>`, _may_ have issues when used within a `<symbol>` and referenced by `<use>`. These features will need thorough testing to ensure they function properly in the optimized model.

# Alternatives

- **Status Quo:** Leave developers to their own decision for handling SVGs which has typically been either embedding into Astro components or reaching for [`astro-icon`](https://github.com/natemoo-re/astro-icon) / [`unplugin-icons`](https://github.com/unplugin/unplugin-icons).
- **SVG Spritesheet Plugin:** Leave SVG handling to userland entirely and provide an Astro plugin that automates SVG Sprite generation. This plugin could compile multiple SVGs into a single spritesheet at build time, allowing developers to manually include optimized SVGs where needed.
- **SVG Component:** A very similar implementation that uses an Astro `SVG` component to render a "src" which will typically be a `?raw` string from a Vite import. This implementation requires a bit more wiring up but is slightly more flexible as it allows rendering of any string. Prior art: [astro-svg-loader](https://github.com/jasikpark/astro-svg-loader).

# Adoption strategy

To ensure that developers can easily adopt this feature:

- **Documentation:** The Astro documentation will be updated with detailed guides and examples of how to use `.svg` imports and leverage the new optimization strategies. Special focus will be placed on explaining the benefits of the Sprite pattern for performance-conscious developers.
  - **Background:** Documentation should be included to explain when to choose the SVG format over alternative image formats.
  - **Framework-Specific Docs:** Documentation will also need to address framework-specific usage. This will cover the limitations of the `.svg` imports in popular frameworks like React and Vue, ensuring smooth adoption for developers who are building Astro projects using these frameworks.
  - **Code Examples:** The core team can provide boilerplate examples and starter templates that showcase the optimized `.svg` handling. These templates could be adapted for common use-cases, such as building an icon library or optimizing assets for a marketing page.
- **Experimental Flag:** Initially, this feature could be released under an experimental flag in `astro.config.mjs` to gather feedback from early adopters. If the feedback is positive, the feature could later be enabled by default in a future Astro release.
- **Migration Path:** Since this feature is backwards-compatible, no migration will be required for existing projects. Developers can opt into the new functionality by updating their `.svg` imports, but their projects will continue working without any changes if they choose not to adopt the new behavior.
