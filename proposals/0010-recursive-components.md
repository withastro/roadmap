- Start Date: Date: 2021-12-15
- Reference Issues: https://github.com/withastro/rfcs/discussions/45
- Implementation PR: https://github.com/sgruenholz2/rfcs/blob/recursive-components-patch-1/active-rfcs/0000-recursive-components.md

# Summary

Allow a way for astro components to render themselves recursively by exposing a new Astro.self property.

# Example

We have a set of items we want to render, stored in an object, indexed by id.
Each item optionally defines an array of childIds.

```
const items = {
    "1": {
        "id": "1",
        "childIds": ["1-1","1-2"]
    },
    "1-1": {
        id: "1-1",
        childIds: ["1-1-1", "1-1-2"]
    },
    "1-2": {
        id: "1-2",
        childIds: []
    },
    "1-1-1": {
        id: "1-1-1",
        childIds: []
    },
    "1-1-2": {
        id: "1-1-2",
        childIds: []
    },
    "1-1-2-1": {
        id: "1-1-2-1",
        childIds: []
    },
    "1-1-2-2": {
        id: "1-1-2-2",
        childIds: []
    },
};
```

We want to use a recursive component to render the entire tree,
(or one of its branches) by passing in both the entire tree (the items object)
and an itemId like this:

```
// src/components/RecursiveItem.astro
---
const {itemId, items} = Astro.props;
const {childIds} = items[itemId];
---
<li>
    Item: {itemId}
    {childIds.length ? (
        <ol>
            {childIds.map(childId => (
                <Astro.self itemId={childId} items={items} />
            ))}
        </ol>
    ) : ""}
</>
```

Note that in the above example, the `<Astro.self />` component provides
access to this component's render function, allowing it to
reference itself.

# Motivation

Nested data structures are everywhere. Common examples include nested blog comments,
file explorer trees, extensive navigation menu trees, or using a headless CMS and nested content blocks to render an entire website.

Even when the entire tree structure is KNOWN, for anything more than a few levels deep,
using a recursive Component/function for rendering is the most efficient and elegant approach.

When the tree structure is UNKNOWN, and you want to support N levels deep, using a recursive
Component/function is the ONLY approach that will work. This is often the case
when fetching data from an API.

Handling this use case lets .astro components do things that other component 
frameworks can do, making it a 1st class component framework in its own right.

The Single File per Component (SFC) pattern that Astro uses is simple, but inflexible. 
In other frameworks like React (and presumable Vue and SolidJs) you can create multiple 
components within a single file. 
This allows you to can create both a function/component to render an `<Item />` and another 
function/component to render `<ItemChildren />` have them reference each other, and then expose 
either/both as exports. You can't do this with SFC. And, if you try to create these as 
2 separate files, you get circular dependencies. The only way for SFC to allow for recursion 
is by allowing a component access to reference it's own render function.

Svelte, which also uses SFC, has already
encountered and solved for this issue by exposing the [svelte:self](https://svelte.dev/docs#svelte_self)
attribute as part of their API.


# Detailed design

The `Astro.self` property exposes the render function of the component.
Defining a constant in the frontmatter and setting it equal to this allows
you to name this component whatever you wish.

```
// src/components/RecursiveItem.astro
---
const {itemId, items} = Astro.props;
const {childIds} = items[itemId];
const MyRecursiveItem = Astro.self;
---
<li>
    Item: {itemId}
    {childIds.length ? (
        <ol>
            {childIds.map(childId => (
                <MyRecursiveItem itemId={childId} items={items} />
            ))}
        </ol>
    ) : ""}
</>
```

# Alternatives

The other design pattern considered was to mimic the Svelte syntax, using
`<astro:self />`

This follows an already established precedent (for those familiar with Svelte),
but there's nothing else in Astro yet that leverages `astro:` prefixes as
components.

By contrast, using `Astro.self` is more explicit,
requiring a bit more work to tap into an advanced feature, which was marginally
preferred by some in the discussion group. Also providing incremental value is
the ability for developers to name the component how they wish (although
this may also be a source of some minor confusion).

Most importantly, it builds upon existing Astro conventions. We're already
referencing things like `Astro.props` and `Astro.request.params` in the frontmatter.
This is just one more `Astro` property that becomes available there.

# Adoption strategy

- No backwards compatibility concerns
- No potential for breaking changes
- Worth noting that recursive rendering can be already achieved with any number of other
platforms: React, Vue, Svelte, etc., so we can approach this at our leisure with
the short term answer to this being: "Do that in your own platform for now".
- Need to update Documentation

# Unresolved questions

Svelte has some [additional restrictions](https://svelte.dev/docs#svelte_self)
about how/where theirs can be used. It must be within a conditional or an "each" loop.
They are attempting to protect against infinite loops. Should we build in similar protections?
