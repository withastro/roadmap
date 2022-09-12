- Start Date: 2022-09-12
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: <!-- leave empty -->

# Summary

This proposal introduces a new interface called "Component" that is used to describe components. This unlocks the following benefits:

- Ability to document components
- (Future) Ability to type slots and possibly other things an Astro component could need in the future in one consolidated interface

# Example

```astro
---
/**
 * @name Button
 * 
 * My super button
*/
interface Component {
 props: {
  // Equivalent to the current Props interface
  name: string;
 }
 slots: {
  // In the future, could be used to type slots:
  // default: string;
 }
}

const { name } = Astro.props;
---

<button title={name}>Click me!</button>
```

Result in the editor:

<img src="https://user-images.githubusercontent.com/3019731/189713136-12b69257-6876-4c9a-a248-5891fb1755d5.png">

# Motivation

Right now, it's impossible for Astro users to document their component like they would in a JSX or Svelte component. Having a "Component" interface describing the component allows for a intuitive spot for a JSDoc comment.

The ability to document components is really useful and notably important for projects with a lot of / complex components. Projects with non-code stakeholders (like designers) that still need to touch the code will generally use the ability to document components to make it easier to understand the different building blocks without needing to actually read the code.

Additionally, in the future we'd like to add the ability to type slots, having all the types on the same interface would be really convenient.

# Detailed design

On the Astro side of things, there's no need to do anything as the Props interface is currently unused. On the language-tools side of things, the following needs to happen:

- The TSX Output needs to use the new Component interface for the `_props` argument. For retro-compatibility purpose, the old Props interface should be used when it exists until we deem it safe to remove support for it.

- The TSX Output needs to extract the potential JSDoc comment and put it on top of the function definition, this is necessary in order for the comment to show up in the editor.

Together, this would create the following signature:

```tsx
/**
 * @name Button
 * 
 * My super button
 */
export default function Button__AstroComponent_(_props: Component.props) {}
```

# Drawbacks

- Extracting the comment in the compiler might be a bit of an hassle, as it requires an additional understanding of the TypeScript code inside the frontmatter which has been the source of many problems in the past (related to hoisting, not understanding certain JS syntax, etc).

- With this solution, documenting a component that has no props or slots requires an empty interface, which is not very intuitive and leads to an ESLint error when using certain configurations.

# Alternatives

Alternatively, we could create an additional interface for the slots and locate the component comment somewhere else, for instance:

```astro
/**
 * @name Button
 *
 * My super button
*/
---
interface Props {
 name: string;
}

interface Slots {
 default: string;
}
---
```

This has the following benefits:

- The comment is now in a consistent location
- Might be easier for the compiler to parse?

But, the following drawbacks:

- This changes the syntax of the component, which requires changes to the compiler, language-tools, Prettier plugin, and possibly Astro itself.
- Having multiple interface could lead to a lot of boilerplate
- Could be a big breaking changes (ex: you import a component described that way from an npm package in your project that doesn't support this syntax)

# Adoption strategy

Since we can fairly easily achieve this in a way that is backward compatible, we can add support for it in our tooling first, document it (replacing our current `interface Props` documentation) and users will passively migrate to it.

Additionally, the editor tooling could warn when `interface Props` is used and provide a code action to migrate to the new interface to make migration as easy as possible.

# Unresolved questions

N/A
