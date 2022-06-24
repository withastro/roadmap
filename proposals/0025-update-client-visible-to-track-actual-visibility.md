- Start Date: 2022-06-24 <!-- today's date, YYYY-MM-DD -->
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: <!-- leave empty -->

# Summary

A brief, one or two sentence explanation of the proposal.
The goal of this proposal is to,
1. Change the default behavior of `client:visible`
2. To ensure `client:visible` only runs when the element is visible and not obscured by other elements or hidden by CSS

# Example

If the proposal involves a new or changed API, then;

- include a basic code example; otherwise,
- omit this section if it's not applicable.

# Motivation

The motivation behind this RFC is to be avoid `client:visible` 
loading components until it's actually possible to view said component.

For example, imagine a `<details>` element. 
If a component with `client:visible` is placed inside a `<details>` element, 
right now even if the `<details>` element isn't opened, 
Astro will still fetch the hidden component dynamically.

```astro
<details>
  <summary>Hidden Component</summary>
  
  <HiddenComponent client:visible />
</details>
```

The goal of this RFC is to change the default behavior so `client:visible` will only 
hydrate components if the component is in the view port and is actually visible, as in
users would actually be able to see and interact with said component.

A secondary goal of this RFC is to give devs an escape hatch if all 
they want is `client:visible` to hydrate on the component being in the 
the viewport, no matter if it's hidden or if it's visible.

# Detailed design

The logic behind this new upgraded `client:visible` is to add to the `IntersectionObserver` 
that currently powers `client:visible` the ability to track the visibility of components, 
via the [trackVisibility](https://web.dev/intersectionobserver-v2/#what-does-the-new-code-look-like-in-practice) 
property of `IntersectionObserver` v2 property.

So, if the current component we are trying to load is obscured by another element, 
the opacity is set to 0, the css visibility is invisible, etc... `client:visible` 
won't try to load the specific component we are referring too.

To counter specific use cases in which knowing the actual visibility doesn't help, 
we'd have an opt-out value for `client:visible`, this RFC suggests 
the opt-out value for disabling actual visibility be `intersection-only`,
as it's fairly self explanatory.

For example,
```astro
<Component client:visible="intersection-only" />
```
> This would disable the need for the component to be actually visible,
> all that would be required is for the component to intersect with the viewport.

# Drawbacks

A couple edge cases are present for the new changes,

1. For situations where the hydrating of the currently invisible component 
   causes the parent to then become visible, would become an 
   impossible state/impossible hydration.
2. It might affect the browser eg. find on page probably won't work properly
3. It might affect SEO
4. If the documentation isn't clear it may lead to confusion and/or misunderstandings
5. It might also count as a breaking change and I know the core team is 
   trying to avoid breaking changes this close to the v1.0 release

# Alternatives

Alternatives include but are not limited to,

1. Make proper visibility tracking an opt in 
   feature of `client:visible` instead of the other way around
2. Use different client directives to represent 
   `client:visible` and `client:intersecting`
3. Eh....I'm open to other alternatives

Not implementing this would cause Astro to import components 
the user would normally not be able to see or even interact 
with wasting resources, and sending more javascript to the
browser than necessary.

# Adoption strategy

In my opinion, for most Astro devs it won't change anything, 
but for those few devs that it does affect the only effective 
solution is to update the docs.

# Unresolved questions

How much of an affect will this really have on perf. and on user experience?
