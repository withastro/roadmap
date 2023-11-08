- Start Date: 2023-11-08
- Reference Issues: https://github.com/withastro/roadmap/issues/698
- Implementation PR: https://github.com/withastro/astro/pull/8854

# Summary

Incremental Build support in Astro aims to significantly speed up repeated runs of `astro build`. Initial builds will populate a local cache in the [`cacheDir`](https://docs.astro.build/en/reference/configuration-reference/#cachedir), which will allow subsequent builds to bypass Rollup for unchanged trees of the module graph.

# Example

This propsal introduces minimal public API surface changes, but requires many internal implementation details to be updated to support caching in some way.

### Adds a new `cache` option in the Astro config

```js
// astro.config.mjs
export default defineConfig({
  build: { cache: true },
});
```

### Adds a new `--force` flag to the CLI to bypass the build cache

```js
astro build --force
```

# Background & Motivation

The original [incremental build support](https://github.com/withastro/roadmap/discussions/237) proposal is one of our oldest and most highly upvoted issues. The corresponding [roadmap issue](https://github.com/withastro/roadmap/issues/698) has likewise recieved a lot of attention and positive feedback. From the extensive performance profiling we've done, we know that Rollup is the main bottleneck in Astro's build process.

Now that our rendering, Markdown, and MDX performance has been optimized about as far as we can take it, now is the time to explore new options. The best option we have is to move _as much of our build process out of Rollup_ as possible, with as much of the build as possible being restored from a cache. That is the goal of introducing **incremental builds**.

Why now? The reason is straightforward—caching is notoriously difficult to get right. We did not want to take on the additional complexity until our API surface was stable and our internal build process was easier to reason about. Thanks to significant effort from @bluwy and @ematipico in the past few months, we're now in a good place to tackle this.

# Goals

- Improve `astro build` performance
- Restructure our
- Avoid as much repeated processing during `astro build` as possible
- Implement a configurable config flag that enables incremental builds
- Eventually, enable incremental builds by default

# Non-Goals

- Vendor lock-in. Incremental builds will be implemented generically, supporting our existing ecosystem of deployment platforms where possible. If a host caches assets between builds, it is likely that they will support incremental builds automatically.
- Incremental Static Regeneration (also known as [ISR](https://nextjs.org/docs/pages/building-your-application/data-fetching/incremental-static-regeneration) or [DPR](https://www.netlify.com/blog/2021/04/14/distributed-persistent-rendering-a-new-jamstack-approach-for-faster-builds/)). The proposal for [supporting ISR](https://github.com/withastro/roadmap/discussions/228) is an entirely different topic, not covered by this accepted proposal. **These features are not mutually exclusive.** Implementing incremental build support **benefits every user of Astro** and does not prevent Astro from potentially introducing ISR in the future.
- Future: Adapter API. Some adapters perform a significant amount of processing and may also want some form of incremental build support. To reduce the scope of this proposal, we are not considering exposing a public Adapter API for this. This may be implemented in the future as an enhancement.

# Detailed Design

TODO

# Testing Strategy

- Integration tests will be needed to determine that the cached behavior is consistent with the existing build process
- Unit tests might be relevant for certain parts of this feature, such as the module graph or how individual modules are invalidated

# Drawbacks

- Caching, especially cache invalidation, is really hard. Invalid cache hits could lead to hard to debug problems and ultimately to a negative impression of Astro.
- There could be some integrations that unknowingly expect a full build to run. This could break implicit behavior in subtle ways.
- Code complexity. Our build process is already complex, and adding a caching layer will certainly add additional complexity and consideration for future features.
- Divergence. If this is introduced for only `static` builds, is there a future path to bring this to `hybrid` and `server` builds as well? Divergent code paths are harder to maintain, debug, and fix.

# Alternatives

Prior to this RFC, we spent a significant time on prototyping and research. Many alternatives were considered and major blockers were discovered.

### Include only changed content

Instead of redesigning `astro:content` to support a cache, we could have attempted to only include collection items that have changed. Unfortunately, this feature's current reliance on `import.meta.glob` meant that including a partial tree would break many valid use cases like index pages and sitemaps. When the site is rendered, we need to restore the collection.

### Lean on Rollup

Rather than attempting to bypass Rollup, we could leverage Rollup's existing cache and maintain a complete module graph during the build.

Unfortunately, after attempting this, the size of Rollup's module graph appears to be one of the main bottlenecks in processing the build. Even if the modules themselves are restored from a cache, the graph itself slows down the build process significantly.

### Don't cache!

We could always try to convince everyone that build caching is a bad idea and that we shouldn't do it, but it is highly requested and many users expect builds to avoid doing any duplicate work. Intuitively, Astro should only build things that have changed.

# Adoption strategy

- This feature will be released under an experimental flag to begin with
- The initial release will be scoped to content collections
- Once that has stabilized, we can layer in additional improvements like caching certain parts of the generation step
- Given enough time for all of these features to stabilize, we may choose to flip cached builds on by default and treat them as an opt-out

# Unresolved Questions

### How should hybrid/server fit into the existing design?

Currently, the Content Collections cache only kicks in for fully static builds. We're not sure if it makes sense to enable this for hybrid/server builds yet
