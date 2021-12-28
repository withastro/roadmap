- Start Date: 2021-12-13
- Reference Issues:
  - Previous: https://github.com/withastro/rfcs/pull/44
- Implementation PR: https://github.com/withastro/astro/pull/2168

# Summary

In order to improve build performance and scale to sites that build thousands of pages, deprecate dynamic features that forces our build to scan rendered HTML and provide static replacements.

These features will be required for SSR support as well, so this RFC seeks to unify how Astro sites are built in a way that is workable both for static-site generation (SSG) and server-side rendering (SSR).

# Example

The following features are bundled as part of this RFC:

- Enforced static use of `client:` directives.
- Deprecation of `Astro.resolve`.

## Static client hydration directives

The directives used for client hydration are already static by implementation; if you attempt to add `client:load`, etc, during rendering Astro will not build that component's client-side JavaScript.

This change will make this behavior defined and enforced. You can achieve dynamic usage by making the attribute static, but dynamically render a hydrated component like so:

```astro
---
import Clock from '../components/Clock.jsx';
const { shouldHydrate } = Astro.props;
---
{ shouldHydrate ? <Clock client:idle /> : <Clock /> }
```

Astro will be able to build the above correctly, but only JavaScript will be added to the page if the `shouldHydrate` condition is truthy.

## Deprecation of Astro.resolve

The `Astro.resolve` method was added to enable adding relative links to assets in the `src/` folder. However, since this is a function it can take dynamic values that are not compatible with a static build. For example:

```astro
---
const { animal } = Astro.props;
---
<img src={Astro.resolve(`../images/${animal}.png`)} />
```

Instead, you can use a dynamic import to dynamically add a URL:

```astro
---
const { animal } = Astro.props;
---

<img src={await import(`../images/${animal}.png`)} />
```

The above will result in *all* of the images in `../images/` getting built, but only the one you select will be used.

# Motivation

- Astro is currently only able to build sites with a few hundred pages. Since the introduction of `getStaticPaths` we have known that developers would want to build site into the thousands or tens of thousands of pages.
- Astro's build process relies on scanning the rendered HTML and then *update* the HTML as well, to replace assets with the hashed paths in the build.
  - Because of the above, performance has actually regressed in __0.21__, even though it was never the best even before.
- In order to support __SSR__ in the future we have to move away from page-scanning as the way to find and build assets, since SSR apps by their nature *cannot* be rendered ahead of time.

# Detailed design

## Enforced static use of client directives

The client directives such as `client:load`, `client:idle`, etc will need to be defined in the hydrated component where they are used, and not rendered dynamically. For example the following is __not allowed__:

```astro
---
import Clock from '../components/Clock.jsx';
const { shouldHydrate } = Astro.props;
const attrs = {
  'client:idle': shouldHydrate
};
---
<Clock {...attrs} />
```

We need to know that the site depends on the `client:idle` directive, so that we can *build* the client-side JavaScript needed.

The implementation will be:

1. In the compiler, include the used directive as part of the exported metadata about the component.
2. In the compiler, mark the component as having statically included a directive.
  - How to mark is up to the implementer, but we have other metadata attached to hydrated component usage already, and it would make sense to follow this same method.
3. When rendering, if a component contains a client directive, make sure the directive is matched by the marking in __(2)__.
4. If the marking is not there, we know that the directive must have been added statically. Throw an `Error` message for this, letting the user know that the directive must be added statically.

## Deprecate Astro.resolve

To deprecate `Astro.resolve` we should:

- Add a warning to the `Astro.resolve` method that says that it is deprecated and links to documentation on alternatives such as the [local: proposal](https://github.com/withastro/rfcs/pull/59) and `import.meta.glob`.
- After one major version of Astro, replace the warning with an error, preventing its usage in dev or the build.

# Drawbacks

- We have heavily promoted the usage of `Astro.resolve` since its inception, as a way to build assets contained in `src/`. This will be a big departure.

# Alternatives

No other alternatives have been designed at this time. I do not believe it will be possible to improve build performance that makes it a parity of other SSG tools without static restrictions like those outlined in this RFC.

# Adoption strategy

- Add the behaviors described in this PR behind a flag, `--experimental-static-build`.  A PR that brings partial support for this [already exists](https://github.com/withastro/astro/pull/2168).
- Promote the usage of the [local: directive](https://github.com/withastro/rfcs/pull/59), if that RFC passes, over `Astro.resolve` in documentation and on Discord.
- Add a deprecation warning to `Astro.resolve` that exists for at least 1 major version.
- Once the static build becomes the default, leave in the legacy flag behind a flag (such as `--legacy-build`) for 1 major version.
- Remove `Astro.resolve` and fully enforce static directives when this feature becomes unflagged.

# Unresolved questions

- We don't have data on the performance difference this change will make. Conceptually we believe it will make a big difference, and will get a better indication once the flagged version has been merged in.