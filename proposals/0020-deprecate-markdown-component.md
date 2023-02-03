- Start Date: 04-29-2022
- Reference Issues: https://github.com/withastro/roadmap/discussions/179
- Implementation PR: <!-- leave empty -->

# Summary

Hey everyone! We (the core maintainers, @withastro/maintainers-core) have been discussing the `<Markdown />` component a lot over the last few days, and have made the decision to deprecate the `<Markdown />` component ahead of our v1.0 release. **It will continue to be available as a non-core, user-land npm package (`@astrojs/markdown`) post v1.0.**

This is a bit of an odd RFC in that it's driven by a need to fix a buggy experience, and not talking through the best way to add something new. We've been discussing this on the core team on-off for a few weeks now, and have already reached informal consensus within the group, but I would still like to share this with our larger maintainer community for feedback during the next RFC call.

For more details and why we see it as necessary, read on.

# Motivation

The `<Markdown>` component is one of the first truly unique features that we shipped in Astro. It introduced the ability to inject a totally different Markdown syntax inside of Astro's HTML syntax, letting you inject Markdown into HTML the same way that you would CSS and JS in the `<style>` and `<script>` tags. No other framework or templating language that I know of supports this.

This is a very expensive feature to support and maintain. Unlike `<style>` and `<script>`, you expect to be able to use Astro features inside of your `<Markdown>` component, like components and JSX-like expressions. This forces the Astro compiler to support most Astro features twice, in two different languages. Our VSCode Extension also has to handle both languages properly, sometimes using only Regex. Our GitHub issue tracker is filled with inconsistencies that we've had to maintain and fix over the last year. We have had to tackle many non-trivial, time-consuming projects related just to fixing bugs in this this component over the years.

We've stomached this high maintainence cost up to this point because as a team we really do love the feature.

## Why Now?

Even with its high maintainance cost, our `<Markdown>` component continues to be buggy. This causes poor user experiences and taking effort away from other features and improvements that we'd like to ship.

At the same time, our `import`/`import()` support for external Markdown files has improved a ton. Importing your markdown is not just possible, but gives much more reliable, tested, feature-complete, type-hints-enabled support:

```astro
---
// Example: Import the markdown as an Astro component
import {Content} from '../content/some-markdown.md';
---
<article>
  <Content />
</article>
```

The breaking point was when we realized that `<Markdown />` was broken in both SSR and in some large sites in multiple ways:

1. `<Markdown />` compiles Markdown-to-HTML when you render the page/component, meaning that you're re-compiling each markdown snippet on every request and slowing down your response times when you use it.
2. For `<Markdown />` to work in SSR, Astro needs to ship an entire markdown parser/renderer with your production build. This is a significant size (~200 packages today) that severely limits Astro's ability to run in more limited edge environments (Deno, Cloudflare, etc.).
3. We have no way to include your remark/rehype plugins in the final SSR build, meaning that `<Markdown>` would always need to behave differently from the rest of your site.

None of these problems have simple answers, and some of these problems might even be impossible to solve in our current system, even without our goal of a June 8th v1.0 release.

Instead of shipping v1.0 with a broken experience, we are planning to remove the broken experience for now with the hope of revisiting and adding the feature back, post-v1.0. Potentially in a more standard, pluggable way, so that we could support injecting languages other than Markdown into your component.

# Detailed design

1. Disable the `<Markdown />` component _in SSR_. If you use the component with an adapter, it creates a runtime error telling you that this is not supported, and giving you advice on how to upgrade. SSR + `<Markdown />` is already poorly supported today, so this shouldn't impact many users.
2. Before `v1.0.0-rc.1`, move the `<Markdown />` component out into its own package entirely. Call it `@astrojs/markdown`. In the readme of the package, give the SSG-only warning more clearly.
3. Before `v1.0.0-rc.1`, replace references to the Markdown component in our docs with the new package.
4. In `v1.0.0-rc.1`, disable the core `<Markdown />` component entirely. If a developer uses it, point them to the new package or suggest moving the Markdown snippet out into its own file.

The user-land Markdown component will also continue to exist for those who need it, although there might be some limitations added so that we can remove the tricky special-case behavior it received in our compiler, editor, etc. We will try to keep these as minimal as possible.

# Drawbacks & alternatives

In practice we've seen the following pattern play out, which gives me hope that most users will be able to make this transition:

1. **If a block of inline markdown is small,** it's trivial to migrate the Markdown snippet directly to HTML.
2. **If a block of inline markdown is large,** we'd probably recommend anyway that you move it to a separate MD file, based on how unreliable Astro can be when handling it, and how much better your editor/IDE support will be.
3. **If neither is acceptable,** use the new userland `<Markdown />` component.

Post-v1.0, we are looking forward to experimenting with a more flexible system for injecting custom syntax into Astro. Ben has mentioned championing something like this.

# Adoption strategy

See "Detailed Design" above.
