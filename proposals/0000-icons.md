- Start Date: <!-- today's date, YYYY-MM-DD -->
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: <!-- leave empty -->

# Summary

A brief, one or two sentence explanation of the proposal.

# Example

```js
// astro.config.js
export default defineConfig({
  icons: [
    // Grab all icons from a pack
    'mdi:*',
    'fab:*',
    // Grab a single icon from a pack
    'mdi:paperclip-horizontal',
    // Grab a single icon from a local directory
    '../icons/paperclip.svg',
    // Grab all icons from a local directory
    '../icons/*.svg',
  ]
});
```

```astro
---
// src/components/SomeButton.astro
import {Icon} from 'astro:components';
import {paperclip, mdiPaperclipHorizontal, fabFacebook} from 'astro:icons';
---
<button>
    <Icon icon={mdiPaperclipHorizontal} />
    <svg set:html={mdiPaperclipHorizontal.path} />
    <div set:html={fabFacebook.svg} />
</button>
```

```svelte
<script>
  import {paperclip} from 'astro:icons';
</script>
{@html paperclip.svg}
```

**Open Question:** Can you reference icons by name (string) or only import?
If by name, we either can't add full icon packs at a time due to lack of tree-shaking
If no by name allowed, then we can and we get auto-complete/ts.
We wouldn't lose much by removing "by name" support, I don't think.
**Decision:** Tree-shaking only, adding whole packs is fine.

**Open Question:** Do you import from 'a:i' or from 'a:i/pack-name'?
I don't think we want to open that box just yet... if we want to keep 'node:' analogy.
But, maybe that's not so important.
Benefit is that you could add new icon packs on the fly during dev (risks here though).
**Decision:** I think we don't want this. All exported from 'a:i' is best.

# Background & Motivation

Include any useful background detail that that explains why this RFC is important.
What are the problems that this RFC sets out to solve? Why now? Be brief!

It can be useful to illustrate your RFC as a user problem in this section.
(ex: "Users have reported that it is difficult to do X in Astro today.")

# Goals

A **concise, bulleted-list** outlining the intended goals of this RFC. 

- What are the exact problems that you are trying to solve with this RFC?
- Separate these goals from the solution that you will outline below.
- If this RFC isn't approved, these goals can be used to develop alternative solutions.

# Non-Goals 

A **concise, bulleted-list** outlining anything intentionally left out of this RFC:

- Non-goal: A goal that is intentionally not addressed in this RFC.
- Out-of-scope: A goal that is related, but intentionally avoided here.
- Future: A goal that is related, but left to be addressed in the future.

This gives the reader the correct context on what is intentionally left out of scope.
It is okay to leave this section empty.

# Detailed Design

This is the bulk of the RFC. Explain the design in enough detail for somebody
familiar with Astro to understand, and for somebody familiar with the
implementation to implement. This should get into specifics and corner-cases,
and include examples of how the feature is used. Any new terminology should be
defined here.

# Testing Strategy

How will this feature's implementation be tested? Explain if this can be tested with
unit tests or integration tests or something else. If relevant, explain the test
cases that will be added to cover all of the ways this feature might be used.

# Drawbacks

Why should we *not* do this? Please consider:

- Implementation cost, both in term of code size and complexity.
- Whether the proposed feature can be implemented in user space.
- Impact on teaching people Astro.
- Integration of this feature with other existing and planned features
- Cost of migrating existing Astro applications (_is it a breaking change?_)

There are tradeoffs to choosing any path. Attempt to identify them here.

# Alternatives

What other designs have been considered? What is the impact of not doing this?

# Adoption strategy

Please consider:

- If we implement this proposal, how will existing Astro developers adopt it?
- Is this a breaking change? Can we write a codemod?
- Can we provide a runtime adapter library for the original API it replaces?
- How will this affect other projects in the Astro ecosystem?

# Unresolved Questions

Optional, but suggested for first drafts.
What parts of the design are still to be determined?
