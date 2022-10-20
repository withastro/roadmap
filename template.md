- Start Date: <!-- today's date, YYYY-MM-DD -->
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: <!-- leave empty -->

# Summary

A brief, one or two sentence explanation of the proposal.

# Example

If the proposal involves a new or changed API, then;

- include a basic code example; otherwise,
- omit this section if it's not applicable.

# Motivation

In this section, step back and ask yourself:

> Why are we doing this? Why does it matter?
> What use cases does it support? What is the expected outcome?

Please focus on explaining the motivation, so that if this RFC is not accepted,
the motivation could be used to develop alternative solutions. In other words,
enumerate the constraints you are trying to solve without coupling them too
closely to the solution you have in mind.

# Detailed design

This is the bulk of the RFC. Explain the design in enough detail for somebody
familiar with Astro to understand, and for somebody familiar with the
implementation to implement. This should get into specifics and corner-cases,
and include examples of how the feature is used. Any new terminology should be
defined here.

# Testing strategy

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

# Unresolved questions

Optional, but suggested for first drafts.
What parts of the design are still to be determined?
