<!-- LEGACY RFC -->
<p align="center"><strong>⚠️⚠️⚠️ Legacy RFC Disclaimer ⚠️⚠️⚠️
<br />This RFC does not meet the requirements of the current RFC process.
<br />It was accepted before the current process was created.
<br /><a href="https://github.com/withastro/rfcs#readme">Learn more about the RFC standards.</a>
</strong></p>
<!-- LEGACY RFC -->

---

- Start Date: 2021-06-14
- Reference Issues: N/A
- Implementation PR: N/A

# Summary

Add `draft` support for Markdown posts.

**What is Missing from Astro Today?**

- `draft` as a top-level primitive for Markdown posts/files 
- `buildOptions.drafts` as an option to ignore posts/files with `draft: true`
- borrowed from: https://jekyllrb.com/docs/configuration/options/ 

**Proposed Solution**

Implement this to match Jekyll.

As a stretch goal, we could also add the `published: true/false` syntax instead. This is similar, but `draft=true` can still be built if `--drafts` is used when you build. `published=false` will never make it into your build, no matter what.
