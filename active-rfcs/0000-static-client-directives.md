- Start Date: 2020-12-13
- Reference Issues: https://github.com/withastro/rfcs/discussions/30
- Implementation PR: 

# Summary

Enforce that client directives (`client:load`, `client:media`, etc.) be static within a template and not added dynamically.

# Example

__Allowed__

```astro
---
import Clock from '../components/Clock.jsx';
---

<Clock client:idle />
```

__Not allowed__

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

# Motivation

* Improve build performance by building (bundling and minify) client-side JavaScript without first needing to render pages.
* Lay the path for a future SSR build, in which case we *cannot* render pages during the build.

With client directives being static we can discover them during __.astro__ file compilation and avoid needing to render pages to discover usage.

# Detailed design

## Current design

- During __.astro__ file compilation we discover usage of `client:` directives include the component information in a special metadata object that is exported in JavaScript.
  - Note that because of the above, adding `client:` directives dynamically probably already is broken in the build.
- During the build we rely on rendering pages and then having Vite create external scripts for our hydrated components.
- During the build these scripts get bundled together per page.

## New design

- During __.astro__ file compilation we discover usage of `client:` directives.
  - In addition to include component information in the exported metadata, we also include which directive is used in the metadata.
- During the build we already know what hydrated components are used and what client directives are used.
- The build will build each component and directive as entry points.
- The pages will only be rendered *after* the JavaScript building is complete. Pages will be handed a mapping of component and directives to their built and hashed file names.
- During rendering we will warn if a `client:` directive was added dynamically.

### Allowed dynamic usage

Only the attribute needs to be added statically in the template, but you can still *render* a hydrated component dynamically. For example:

__Not allowed__

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

__Allowed__

```astro
---
import Clock from '../components/Clock.jsx';

const { shouldHydrate } = Astro.props;
---

{ shouldHydrate ? <Clock client:idle /> : <Clock /> }
```

# Drawbacks

- Since most attributes can be added dynamically, it's not intuitive to know that this one cannot be.
- Some higher-order components might be more difficult to create as a result. Since you can always dynamically render a component, I don't *think* anything is truly blocked, however.

# Alternatives

No alternative ideas have been considered. The impact of not doing this change is the inability to improve build performance and to create an SSR feature in the future.

# Adoption strategy

- The vast major of Astro developers will likely never know that this change occurred.
- Since dynamic usage only works in dev today, no production sites are affected by this change.
- A warning is being added for dynamic usage (see __Detailed design__ section).
- Documentation will be added to explain alternatives to dynamically adding these props.

# Unresolved questions

- None yet.