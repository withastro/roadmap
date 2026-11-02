**If you have feedback and the feature is released as experimental, please leave it on the Stage 3 PR. Otherwise, comment on the Stage 2 issue (links below).**

- Start Date: 2026-07-23
- Reference Issues: https://github.com/withastro/roadmap/discussions/1096
- Implementation PR: https://github.com/withastro/astro/pull/17084
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1388
- Stage 3 PR: https://github.com/withastro/roadmap/pull/1404

# Summary

Add experimental support for incremental static builds, allowing Astro to skip regenerating prerendered pages whose template dependencies and per-path data are unchanged since the previous build.

# Example

Dynamic routes opt in by returning a `cacheKey` for each path from `getStaticPaths()`. The `cacheKey` should change whenever the data used to render that path changes. For content collections, `entry.digest` is a natural fit, since it changes whenever the entry's content changes.

```astro
---
// src/pages/blog/[slug].astro
import { getCollection } from 'astro:content';
export async function getStaticPaths() {
	const posts = await getCollection('blog');
	return posts.map((post) => ({
		params: { slug: post.id },
		props: { post },
		cacheKey: post.digest,
	}));
}
const { post } = Astro.props;
---

<h1>{post.data.title}</h1>
```

When neither the route's module dependencies nor a path's `cacheKey` have changed between builds, Astro reuses the previously generated page instead of rendering it again.

Given that routes opt-in to incremental builds via the `cacheKey`, there is no need for a boolean Astro config value to opt-in to the feature site-wide.

# Background & Motivation

Astro is widely used to build large static sites such as documentation, blogs, and marketing sites that can span thousands of pages. These sites often lean on a small number of dynamic routes: a single `[...slug].astro` route frequently renders an entire content collection. As the content grows, build times grow with it, even when a given build changes only a handful of pages.

Astro 7 made large-site builds substantially faster by speeding up the **bundling** phase: Rolldown replaced Rollup, and Markdown/MDX processing moved to a native Rust pipeline. What remains is the **generation** phase, where Astro renders each prerendered route to HTML. Today Astro regenerates every static page on every build, even when its template, dependencies, and data are identical to the previous build. Incremental static builds target this phase by skipping pages whose inputs are unchanged.

# Goals

- Skip regenerating prerendered pages whose route dependencies and path-specific data are unchanged since the previous build.
- Automatically track a route's module dependencies so that template, layout, component, and imported-asset changes invalidate the cache without user intervention.

# Non-Goals

- Incremental behavior for on-demand (SSR) routes. This RFC covers prerendered pages only.
- Incremental behavior for static (non-dynamic) routes. Dynamic routes already have a mechanism for loading data, so there is a natural place for providing a cacheKey, where a new mechanism would need to be created for static routes.
- Automatically detecting content or external data changes. The correctness of each path's `cacheKey` is the user's responsibility; Astro does not infer when a CMS entry or other external data has changed.
- Changing build concurrency behavior. This is orthogonal to the existing `build.concurrency` option.

# Detailed Design

## Terminology

- **Dependency hash**: a per-route hash of the route's transitive module graph. Astro computes this automatically.
- **Cache key**: a per-path string, supplied by the user from `getStaticPaths()`, that represents the data used to render that path.

A page is reused only when both its dependency hash and its cache key are unchanged from the previous build.

## The `cacheKey` API

Each object returned from `getStaticPaths()` may include an optional `cacheKey` string alongside the existing `params` and `props`:

```ts
interface GetStaticPathsItem {
	params: Record<string, string | number | undefined>;
	props?: Record<string, unknown>;
	cacheKey?: string;
}
```

The `cacheKey` should change whenever any data used to render that specific path changes. A page is only eligible to be skipped if it returns a `cacheKey`; paths without one are always rendered. This keeps the feature safe by default: opting a route in is an explicit decision, and correctness of the key is under the author's control.

For content collections, `entry.digest` can be used as  the cache key. The `digest` is an optional value that a loader can attach to each entry, and it changes whenever the entry's content changes. Loaders that do not provide a digest leave it `undefined`, in which case the author supplies their own key (for example a CMS `updatedAt` timestamp).

## Automatic dependency tracking

The user's `cacheKey` covers *data*. The **dependency hash** covers *code*.

During the build, Astro walks the transitive module graph of each prerendered page (its template, layouts, components, and imported utilities and assets) and hashes both the sorted set of module identifiers and each module's compiled output. Hashing the compiled output produced during bundling, rather than the source files on disk, means the hash also covers virtual modules that have no file on disk but still contribute generated code. This covers most code produced by integrations in addition to the project source and its direct dependencies. Any change to the page's template or to anything it imports produces a different dependency hash, which invalidates every path generated by that route.

Content entry data modules are deliberately excluded from this walk. If they were included, editing a single content entry would change the dependency hash and force every path on the route to re-render. Excluding them is what makes the split clean: code changes flow through the dependency hash, and content and data changes flow through the `cacheKey`.

## The skip decision

For each path, given the previous cache, a path is skipped when all of the following hold:

1. The path returned a `cacheKey` in this build.
2. The previous cache has an entry for the route.
3. The route's dependency hash matches the previous build.
4. The previous cache has an entry for this exact path.
5. The path's `cacheKey` matches the previous build.

When a path is skipped, its previously generated output is reused: if the file is already present in the output directory it is left in place, otherwise it is restored from the cache. On the first build there is no previous cache, so every path is rendered and recorded.

## Cache storage

The cache lives under the directory configured by `cacheDir`, alongside the content layer and image caches. `cacheDir` defaults to `node_modules/.astro/`, but any project that overrides it controls where the incremental cache is written too.

- A manifest (`incremental-build.json`) records, per route, the dependency hash and, per path, the `cacheKey` and the relative output file path.
- The rendered output files are stored under a `dist/` subdirectory of `cacheDir`.

Storing the rendered output inside `cacheDir` (rather than relying on the previous `dist/`) keeps the cache portable, so it can be persisted and restored by CI systems that cache the `cacheDir` between runs even when `dist/` is discarded.

## Global invalidation

The per-route dependency hash captures the page's own module graph. A few inputs sit outside that graph and can change output across every page, so the cache also carries global signals that invalidate it entirely on mismatch:

- **Cache version**: an internal version number, bumped when the cache format changes.
- **Config hash**: a hash of the output-affecting subset of the resolved Astro config. Values such as `site`, `base`, `trailingSlash`, `build.format`, `compressHTML`, and `scopedStyleStrategy` change how pages are generated across the whole build, so a change to any of them invalidates the cache.

If any global signal differs from the value stored in the cache, the entire cache is discarded and the build proceeds as a full build.

## Orphan cleanup

After generation, any output file that was present in the previous cache but is no longer produced by the current build (for example a path removed from `getStaticPaths()`) is deleted from both the output directory and the cache, so stale pages do not linger across incremental builds.

# Testing Strategy

A combination of integration and unit tests. Integration tests build multiple times to confirm that the cache is used on subsequent builds.

# Drawbacks

- Adding a caching layer can deincentize making the build faster by default.
- Requiring a `cacheKey` may not meet user expectations. Developers who hear "incremental builds" often expect Astro to figure out what changed on its own. Asking them to supply and reason about a key, and to accept that a wrong key silently serves stale pages is less appealing than an automatic system would have.
- We might fail to invalidate the cache when we should. The dependency hash covers a route's module graph, but inputs outside that graph (global config, environment values, integration behavior, or data pulled in ways we do not track) can change output without changing any hash. Any gap here produces stale pages that look correct, which is harder to notice than an outright build failure.

# Alternatives

- Automatic change detection instead of a `cacheKey`. Astro cannot generally know when external data such as a CMS response or a `fetch` has changed, so an explicit key keeps responsibility with the author who does.
- Deriving the key from a path's props. Props may be non-serializable, and equal props do not guarantee equal output when a page reads data outside its props, so hashing them would produce false cache hits.
- Doing nothing. Astro 7 already made bundling fast, but generation would stay proportional to the total page count on every build, so large content sites keep paying full generation cost for a single changed entry.

# Adoption strategy

- Ships behind an experimental flag while the Stage 3 RFC iterates, then graduates to on by default in a later minor.
- Fully opt-in and non-breaking. A route only participates once it returns a `cacheKey`, so existing projects build exactly as they do today until an author chooses otherwise.
- No ecosystem coordination needed. The cache is internal to the build, so integrations and adapters require no changes.

# Unresolved Questions

- Config hash coverage. The set of config fields treated as output-affecting is maintained by hand, so whether that list stays correct as config grows, or should be derived automatically, is open.
- A manual full-rebuild escape hatch. Deleting `cacheDir` forces a full build today, but whether a first-class flag such as `astro build --force` is warranted is to be determined.
