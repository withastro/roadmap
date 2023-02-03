<!-- LEGACY RFC -->
<p align="center"><strong>⚠️⚠️⚠️ Legacy RFC Disclaimer ⚠️⚠️⚠️
<br />This RFC does not meet the requirements of the current RFC process.
<br />It was accepted before the current process was created.
<br /><a href="https://github.com/withastro/roadmap#readme">Learn more about the RFC standards.</a>
</strong></p>
<!-- LEGACY RFC -->

---

- Start Date: 2021-06-24
- Reference Issues: N/A
- Implementation PR: N/A

# Summary

Replace Prism with Shiki.

**Background & Motivation**:

There's been significant interest in our Discord to replace Prism with Shiki:

- @tusharsadhwani https://discord.com/channels/830184174198718474/872579324446928896/875712505287176192
- @obnoxiousnerd https://discord.com/channels/830184174198718474/845451724738265138/862567271117226015
- @aFuzzyBear: https://discord.com/channels/830184174198718474/845451724738265138/862294768519479327
- @natemoo-re: https://discord.com/channels/830184174198718474/853350631389265940/857021165754777601
- @sarah11918 https://discord.com/channels/830184174198718474/845430950191038464/879503310938316800
- @FredKSchott

There are several objective reasons to want Shiki over Prism, besides just hype:

- Shiki supports all VSCode themes directly, with several popular themes built-in.
- Shiki supports 100+ built-in, popular language grammars (including Astro! https://github.com/shikijs/shiki/pull/205)
- Shiki language grammars are the same as Github, VSCode, etc, guaranteeing that they are up-to-date.
- Shiki language grammars are updated for patches/fixes on every release.
- Shiki has a growing community around it. Prism has its ecosystem, which is large but not actively worked on by anyone. See https://github.com/shikijs/shiki#seen
- https://www.typescriptlang.org/ has invested heavily in Shiki, so there's confidence that it is battle tested.

There's some neat things going on behind the scenes, as well:

Shiki controls theming, so that the end result is `<span style="color: #XXXXXX">` instead of `<span class="token token-comment">`. This is objectively better for a tool like Astro because it accomplishes the exact same thing but without global classes that leak into our users projects.

**Proposed Solution**:

Phase 1: ✅

- Add a new `<Code>` component, powered by Shiki. More info below. It lives alongside `<Prism>`.
- **success metric to continue to phase 2:** happy user reports of anyone using the `<Code>` component directly

Phase 2: ✅

- **requires:** a way to set a global theme, across your site/project
- **requires:** a way to customize your markdown syntax highlighter of choice
- Move Markdown code blocks to use `<Code>` instead of `<Prism>` (https://github.com/stefanprobst/remark-shiki)
- Move our recommendation in docs to use `<Code>` over `<Prism>`, but keep references to `<Prism>`.
- ~~Add warning when you use `<Prism>` to use `<Code>` instead.~~ This would be jarring to users _intentionally_ sticking with Prism
- **success metric to continue to phase 3:** docs site happy with the new Code component (usage in markdown)

Phase 3: Soon

- Remove `<Prism>` entirely.
- Move it into a separate component, for anyone who still wants it. ex:`import Prism from '@astrojs/prism';`

**Detailed Design**:

```astro
---
// Example Implementation
// Usage: import {Code} from 'astro/components';
import shiki from 'shiki';
const { code, lang = 'plaintext', theme = 'nord' } = Astro.props;
const highlighter = await shiki.getHighlighter({theme});
const html = highlighter.codeToHtml(code, lang);
---
{html}
```

**Draft PR**:

https://github.com/snowpackjs/astro/pull/1208
