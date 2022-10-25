- Start Date: 2022-10-16
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: <!-- leave empty -->

# Summary

Allows to stop execution of an endpoint or accessing a page with Astro SSR in nested functions by utilizing similar API to Remix with `throw Response`.

# Example

```astro
---
const user = await getUser(email);
---

<p>Hello {{ user.email }}</p>
```

```ts
// src/getUser.ts
export function getUser(email: string) {
  const user = findUser(email)

  // This would stop the rest of the code from executing and return a specific response
  if (!user) throw new Response(null, { status: 401 })

  return user
}
```

# Motivation

At the moment, it's impossible to stop execution of a page or endpoints when specific condition are not met (e.g.: user is not authenticated on route needing authentication).

When logic is bundled into functions, we find ourselves limited when trying to stop an endpoint in nested function calls.

As middleware are not on the roadmap of Astro, allowing nested code to `throw Response` would unlock possibility and cleaner code

# Detailed design

From my understanding, it would be pretty easy to include this behavior in the Astro Server runtime by catching thrown `Response`.

# Drawbacks

- Doesn't cover some other cases which requires middleware-like behaviour (cf. [this discussion](https://github.com/withastro/rfcs/discussions/174))

# Alternatives

No alternative at the moment, and I don't think it would be possible to implement in user-land.

# Adoption strategy

<!-- Please consider:

- If we implement this proposal, how will existing Astro developers adopt it?
- Is this a breaking change? Can we write a codemod?
- Can we provide a runtime adapter library for the original API it replaces?
- How will this affect other projects in the Astro ecosystem? -->

No real API change or migration to consider.

# Unresolved questions

Optional, but suggested for first drafts.
What parts of the design are still to be determined?

```

```
