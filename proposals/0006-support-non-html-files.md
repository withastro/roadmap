<!-- LEGACY RFC -->
<p align="center"><strong>⚠️⚠️⚠️ Legacy RFC Disclaimer ⚠️⚠️⚠️
<br />This RFC does not meet the requirements of the current RFC process.
<br />It was accepted before the current process was created.
<br /><a href="https://github.com/withastro/roadmap#readme">Learn more about the RFC standards.</a>
</strong></p>
<!-- LEGACY RFC -->

---

- Start Date: 2021-09-03
- Reference Issues: N/A
- Implementation PR: [astro #2586](https://github.com/withastro/astro/pull/2586)

# Summary

Non-HTML dynamic files.

**Background & Motivation**:

There are many reasons to want custom, dynamic files. One of the primary contenders are JSON feeds and other read-only APIs, because currently there is no clean way to make them. But there is also config files like `.htaccess`, `vercel.config.json` and others to for example [set redirects](https://github.com/snowpackjs/astro/issues/708)!

Things like image optimization may also play a role (more so in #965, but there are some use cases here too), with something like a frequently changing logo (think google doodles) fetched and processed seperately from the page itself.

**Proposed Solution**:

Sveltekit endpoints.
To generate a dynamic file `example.com/api/feed.json`
In sveltekit you would have:

```js
//   ./src/pages/api/feed.json.ts
export async function get() {
  var articles = Astro.fetchcontent("/blog/**/*.md").map(article => /* */)
  return {
    body: {
      JSON.stringify(articles)
    }
  };
}
```

Can be changed to a more astro-specific API, because headers in SSR... (they could be done with a custom config file though!)

```js
export async function get() {
  return "hello world";
}
```

```js
export async function get() {
  const image = await fetch("example2.com/images/dynamic-logo.php").then((x) =>
    x.buffer()
  );
  return image; //also does buffers
}
```

By adding a `.js` or `.ts` extension, you make it possible to create any file type with the desired content

**Alternatives considered**:

Discussed in #965, but those would rely on low level components (cough snowpack cough) to make them work correctly

**Risks, downsides, and/or tradeoffs**:

- User-controlled php file (or just injection attacks in general)
- May be confusing to someone not familiar with sveltekit

**Open Questions**:

- Would it theoretically be possible to use `getstaticpaths` to generate these files? Because `Astro.props` would be exposed and there should be no top-level code, and it should solve most of the usecases presented in #965 and discussed in the RFC call

**Detailed Design**:

> Go back in the git history, right click on the commit that removes the endpoint support, `revert commit`
>
> - jasikpark

Some discussion about this in the last (as of writing) RFC meeting: https://youtu.be/hhsKS2et8Jk?t=1237
