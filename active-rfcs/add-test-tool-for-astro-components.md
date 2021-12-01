<!-- LEGACY RFC -->
<p align="center"><strong>⚠️⚠️⚠️ Legacy RFC Disclaimer ⚠️⚠️⚠️
<br />This RFC does not meet the requirements of the current RFC process.
<br />It was accepted before the current process was created.
<br /><a href="https://github.com/withastro/rfcs#readme">Learn more about the RFC standards.</a>
</strong></p>
<!-- LEGACY RFC -->

---

- Start Date: 2021-06-18
- Reference Issues: N/A
- Implementation PR: N/A

# Summary

Provide a way to test Astro components, perhaps by publishing the `astro` test setup.

**Background & Motivation**:

I want to be able to setup tests for https://github.com/jasikpark/astro-katex to make sure it works correctly, but I have not clue how to do that without either adding it to `astro/packages/astro/components/KaTeX.astro` and using the current monorepo testing rig, or by manually testing it.

**Proposed Solution**:

- Publish the helpers and whatnot as an astro package 🤔 or allow copying of the setup for the moment.

**Risks, downsides, and/or tradeoffs**:

- Seems like a lot of support to add, but testing astro components seems like a worthy goal.
