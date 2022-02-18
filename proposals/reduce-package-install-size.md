- Start Date: 2022-02-11
- Reference Issues: https://github.com/withastro/rfcs/discussions/100
- Implementation PR: https://github.com/withastro/astro/pull/2614

# Summary

Reduce the install size of the `astro` npm package.

# Motivation

The package install size at the time of writing is ~[190 MB](https://packagephobia.com/result?p=astro), while the publish size is ~12 MB. Reducing both the install & publish size will speed up package installation and save bandwidth. Which are both positive changes for developers and CI.

As a first step I would look at dependencies that can be removed entirely or made optional. Focusing on the biggest dependencies first.

# Detailed design

Most changes will be breaking changes so it would be good to release them in one major version change. It is also about finding the balance between developer convenience and removing bloat.

## Remove built-in TypeScript support
Saves ~60MB.

Used by `astro check` and the Svelte renderer, the latter will be resolved by removing the bundled renderers.
TODO: are the compiler and language-server not needed outside astro check?
Linked to https://github.com/withastro/astro/issues/1728

```sh
$ npm ls typescript

└─┬ astro@0.23.0-next.4
  ├─┬ @astrojs/compiler@0.10.1
  │ └── typescript@4.5.5
  ├─┬ @astrojs/language-server@0.8.8
  │ └── typescript@4.5.5 deduped
  └─┬ @astrojs/renderer-svelte@0.4.0-next.0
    └─┬ svelte-preprocess@4.10.3
      └── typescript@4.5.5 deduped
```

### Astro check
Remove the check command from the core and make available as an add-on package `astro-check`. When ran `astro check` could prompt to install `astro-check` as a separate development dependency if it's missing.

## Remove renderers
Saves ~30MB.
Remove renderers from core, need to install them separately, the starter should let developers choose which renderer they use. Check documentation and templates to make sure renderers are placed where needed.

## Remove components
Saves 12MB. (shiki: 8.5MB, prismjs: 3.5MB)
Remove components from core. Code in `packages/astro/components` would need to be moved to a separate package. Internal usage of Astro `privateRenderMarkdownDoNotUse` would need to be changed or depended on via dependency on Astro.

# Drawbacks

Developer convenience is lost by removing features by default, adding more documentation. Changes can be eased by adding them by choice automatically with the starter `npm init astro`. Keeping the core `astro` package lean should help with maintaining the codebase at the possible cost of more interfaces/glue code between packages.

# Alternatives

Bundling packages could help though in the end the biggest packages will still take up a lot of space. Comment about bundling the language server:
https://github.com/withastro/astro/issues/1728#issuecomment-959535287

# Adoption strategy

- Document the need to install renderers used in existing Astro configs, codemod possible.
- TODO

# Unresolved questions
Amount of packages > package depth also influences install speed significantly?
Set up tests to measure install size?
