<!-- LEGACY RFC -->
<p align="center"><strong>⚠️⚠️⚠️ Legacy RFC Disclaimer ⚠️⚠️⚠️
<br />This RFC does not meet the requirements of the current RFC process.
<br />It was accepted before the current process was created.
<br /><a href="https://github.com/withastro/rfcs#readme">Learn more about the RFC standards.</a>
</strong></p>
<!-- LEGACY RFC -->

---

- Start Date: 2021-06-13
- Reference Issues: N/A
- Implementation PR: N/A

# Summary

Add prettier plugin to VSCode extension.

- A few people (including myself, embarassingly) didn't realize that there was a prettier plugin for Astro files
- Reading up on Svelte's support, it looks like they bundle their formatter in with their VSCode extension
- see: https://github.com/sveltejs/language-tools/tree/master/packages/svelte-vscode

We should look into doing this ourselves! Almost all Astro users use the VSCode extension, so format-on-save should then be enabled by default.
