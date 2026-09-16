**If you have feedback and the feature is released as experimental, please leave it on the Stage 3 PR. Otherwise, comment on the Stage 2 issue (links below).**

- Start Date: 2026-09-16
- Reference Issues: https://github.com/withastro/roadmap/discussions/1272, https://github.com/withastro/roadmap/discussions/1116
- Implementation PR: https://github.com/withastro/astro/pull/17892
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1428
- Stage 3 PR: <!-- leave it empty if you don't have a PR yet -->

# Summary

Decouple Astro's public APIs from Zod: content collection schemas and action inputs accept any [Standard Schema](https://standardschema.dev) validator, and the Zod-only helpers they were built around (`image()`, `reference()`, form `input`, `astro/zod`) are replaced by validator-agnostic equivalents.

# Example

A collection validated by Valibot, with no Zod anywhere in the project:

```ts
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import * as v from 'valibot';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/blog' }),
  schema: v.object({
    title: v.string(),
    draft: v.optional(v.boolean(), false),
  }),
});

export const collections = { blog };
```

Images and references become ordinary functions you call from inside a schema transform, instead of schema factories Astro hands you:

```diff
  import { defineCollection, reference } from 'astro:content';
+ import { image } from 'astro/content/image';
  import { z } from 'zod';

  const blog = defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/blog' }),
-   schema: ({ image }) => z.object({
+   schema: (context) => z.object({
      title: z.string(),
-     cover: image(),
+     cover: z.string().transform((src) => image(context, { src })),
-     author: reference('authors'),
+     author: z.string().transform((id) => reference('authors', id)),
    }),
  });
```

Because they are plain values now, their results can be validated further:

```ts
cover: z
  .string()
  .transform((src) => image(context, { src }))
  .refine((cover) => (cover.width ?? 0) >= 1000, 'cover must be at least 1000px wide'),
```

Actions accept any validator for JSON payloads:

```ts
// src/actions/index.ts
import { defineAction } from 'astro:actions';
import { type } from 'arktype';

export const server = {
  subscribe: defineAction({
    input: type({ channel: 'string' }),
    handler: async ({ channel }) => {
      // `channel` is typed as `string`
    },
  }),
};
```

And form actions parse their own `FormData`, with the validator of their choice:

```diff
+ import { parseFormData } from '@standard-community/standard-form';
  import { ActionError, defineAction } from 'astro:actions';
  import { z } from 'zod';

  const schema = z.object({ comment: z.string() });

  export const server = {
    comment: defineAction({
      accept: 'form',
-     input: schema,
-     handler: async ({ comment }) => {
+     handler: async (formData) => {
+       const result = await parseFormData(schema, formData);
+       if (result.issues) {
+         throw new ActionError({ code: 'BAD_REQUEST', message: result.issues[0].message });
+       }
+       const { comment } = result.value;
        // ...
      },
    }),
  };
```

# Background & Motivation

Astro has used Zod for a long time, both internally and in its public APIs. This RFC is only about the public ones.

Working on Astro 6 made it clear how expensive that coupling is. Astro ships a copy of Zod through `astro/zod`, so a Zod major is an Astro major: users cannot upgrade Zod without us, and we cannot upgrade Zod without breaking them. Users who prefer Valibot or ArkType, or who already use one elsewhere in their stack, have to keep a second validator installed for their content config alone, and bundle it.

[Standard Schema](https://standardschema.dev) exists to solve exactly this, and the ecosystem has converged on it. Adopting it is not a drop-in change, though, because our public APIs do more than validate:

- `astro/zod` re-exports Astro's own copy of Zod.
- Collection schemas are handed Zod schema factories: `image()` from the schema context, and `reference()` from `astro:content`.
- Form actions coerce `FormData` into an object by walking the Zod schema, which needs introspection the spec deliberately does not describe.
- `astro sync` writes each collection's entry type by resolving the Zod schema it found.

So the work is not "call `~standard.validate` instead of `safeParse`". It is redesigning the four places where Astro reaches into a schema rather than through it.

# Goals

- Allow users to use other validators than Zod
- Be backward compatible
- Ensure Astro's internal validator does not leak in the runtime

# Non-Goals

- Change Astro's internal validator for something else than Zod. Astro keeps parsing its own config, manifests and loader returns with Zod; this is invisible to users.
- Remove the deprecated APIs in this RFC. Everything below ships as a minor, and the removals are scheduled for Astro 8.
- Ship a first-party `FormData` parser. Astro defers that to a community package (see [Form actions](#form-actions)).
- Support validators that do not implement Standard Schema.

# Detailed Design

## Terminology

- **Standard Schema**: the [spec](https://standardschema.dev) a validator implements by exposing a `~standard` property with a `validate()` method. Zod (3.24+), Valibot (1.0+), ArkType (2.0+) and many others implement it.
- **Standard JSON Schema**: the [companion spec](https://standardschema.dev/json-schema) for describing a schema as JSON Schema. It is optional, and Astro treats it as a capability rather than a requirement.
- **Vendor**: the validator behind a schema, read from `schema['~standard'].vendor` (`'zod'`, `'valibot'`, `'arktype'`, …).

Astro validates through `schema['~standard'].validate(data)`, which may return a promise. That is what keeps async transforms working.

## Content collections

### Schemas

`schema` accepts any Standard Schema validator, either directly or returned from the `(context) => schema` factory form:

```ts
type BaseSchema = StandardSchemaV1;

type CollectionConfig<S extends BaseSchema> = {
  schema?: S | ((context: SchemaContext) => S);
  // ...
};
```

A schema that is not a Standard Schema validator is now rejected with a dedicated `InvalidCollectionSchemaError` rather than failing deep inside the content layer. Validation issues from every vendor are formatted the same way, into the bulleted list Astro's schema errors already used, and the YAML line of the first issue is still resolved from its path so the error points at the right line of the entry.

The same applies to loaders: `Loader['schema']` and `Loader['createSchema']` are typed as `StandardSchemaV1` instead of `z.$ZodType`.

### `image()`

The `image` helper used to come from the schema context and return a Zod schema, which meant two problems: it only worked with Zod, and its result could not be validated any further.

It becomes an ordinary function, exported from a new `astro/content/image` entrypoint:

```diff
+ import { image } from 'astro/content/image';

- schema: ({ image }) =>
+ schema: (context) =>
    z.object({
-     cover: image(),
+     cover: z.string().transform((src) => image(context, { src })),
    });
```

It is a separate entrypoint, not an `astro:content` export, for the same reason `astro/loaders` is one: it touches the filesystem. `astro:content` must stay free of Node builtins so it can run on Cloudflare and Deno, and a CI check enforces that. A content config, by contrast, only ever runs in Node.

`image(context, { src })` returns a marker object carrying `src`, plus `width`, `height` and `format` read from the file:

```ts
type ContentImageField = {
  src: string;
} & Partial<Omit<ImageMetadata, 'src' | 'fsPath'>>;
```

Resolution happens while content is synced, in three steps:

1. A remote URL, or an entry whose loader gives no absolute path, passes straight through.
2. A sibling file is located directly on disk. A bare filename that hits this path is normalized to `./name`, so it resolves the same way as in Markdown frontmatter. A `./` or `../` source that misses is an error immediately, since nothing else is going to resolve it.
3. Anything else (a Vite alias, a root-absolute path, a bare specifier with no sibling file) goes through Vite's plugin container, matching how the same source is resolved at read time. The resolver is installed for the duration of a sync, and `image()` reads it ambiently; without one (a loader running outside a sync) resolution is deferred to read time, as before.

Two things follow from resolving during sync rather than at read time:

- A missing image, a broken alias or a bad root-absolute path is reported while syncing, with the entry that caused it, instead of surfacing at read time.
- The dimensions are available to the schema, so they can be validated, and to any transform downstream of `image()`.

`src` is deliberately *not* final at this point: it is a `/@fs/…` URL in dev and a hashed emitted asset in a build, and only Vite knows which. It stays a marker until read time, where the real `ImageMetadata` is merged *over* the stored object, so fields a transform added after `image()` survive. SVGs, which resolve to a component factory rather than metadata, replace the value instead of merging into it.

The `({ image })` form still works, accepts the same sources, and is routed through the same resolver so legacy schemas gain the up-front validation too. It is deprecated and removed in Astro 8.

### `reference()`

`reference()` gains a second argument and returns the reference itself, so it can be called from inside a schema transform:

```diff
  schema: z.object({
-   author: reference('authors'),
+   author: z.string().transform((id) => reference('authors', id)),
  });
```

```ts
export function reference<C extends CollectionKey | (string & {})>(
  collection: C,
  lookup: string | number | { collection: C; id: string } | { collection: C; slug: string },
): ReferenceDataEntry<C>;
```

The lookup accepts what the schema form accepted: an entry id as a string or a number, or a reference object an earlier parse produced, so re-parsing already-transformed data is a no-op. Anything else throws `InvalidContentReferenceError` during sync, rather than being reported as a validation issue on the field.

What is *not* checked there: whether the entry exists. A reference may point at a collection whose loader has not run yet, so existence is still verified once every loader has finished, by walking the store.

The single-argument form still returns a Zod schema, is routed through the same resolution (reporting failures as validation issues, so they are collected alongside the schema's others), and is removed in Astro 8.

### JSON Schema for data collections

Data collections get a `.schema.json` file that gives them autocompletion and validation in editors. It was generated with `z.toJSONSchema()`; it now goes through [Standard JSON Schema](https://standardschema.dev/json-schema), detected at runtime via `~standard.jsonSchema.input`.

Two things are normalized across validators through `libraryOptions`, the spec's escape hatch for vendor-specific parameters, because both are the default everywhere else in Astro:

- A type with no JSON representation degrades to `{}` instead of aborting the conversion, so one such field does not cost the collection its whole `.schema.json`.
- A date is described as the ISO string a data file actually holds.

Zod, Valibot and ArkType have entries; any other validator is converted with its own defaults. When a validator does not implement the spec at all, the file is skipped and Astro logs which collection it skipped. Everything else about the collection keeps working.

### Type inference

`astro sync` used to resolve every collection's schema and write the resulting type into `.astro/content.d.ts`. That only worked because the schema was Zod. The generated file now points at the config instead, and the types are inferred from it:

```ts
declare module 'astro:content' {
  export type ContentConfig = typeof import('../src/content.config.js');
  export type LiveContentConfig = typeof import('../src/live.config.js');

  export interface DataMap {
    blog: InferCollectionData<ContentConfig, 'blog'>;
    authors: InferCollectionData<ContentConfig, 'authors'>;
  }

  export interface LiveDataMap extends InferLiveData<LiveContentConfig> {}
}
```

`DataMap` maps a collection name to the type of its entry `data`, and everything else in `astro:content` derives from it. This has a side benefit: entry types now stay accurate as schemas are edited, instead of being a snapshot of the last sync.

The collection *names* are written out one per line rather than inferred as a whole map, and that asymmetry is load-bearing: `reference()` is called from inside the content config and is typed by `keyof DataMap`, so a `DataMap` inferred wholesale would make the config's type depend on itself, and every collection in it would silently collapse to `any`. Writing the names out breaks the cycle. `InferData<TConfig>`, which does infer the whole map, is exported for configs that never call `reference()`.

`DataMap` is an interface, so a project that types a collection by hand, or an integration shipping a collection Astro cannot infer, augments it:

```ts
declare module 'astro:content' {
  interface DataMap {
    blog: { title: string; draft: boolean };
  }
}
```

An empty `DataMap`, as in a project that has not synced yet, falls back to `Record<string, any>`, so a missing sync is not a wall of type errors.

Live collections get `LiveDataMap`, keyed by collection name and mapping to the set of types its loader works with. Only the parts a project uses have to be declared:

```ts
declare module 'astro:content' {
  interface LiveDataMap {
    products: { data: Product; entryFilter: { sku: string } };
  }
}
```

- `data` is what the loader returns, or what the collection's schema produces when it has one
- `entryFilter` and `collectionFilter` are what `getLiveEntry()` and `getLiveCollection()` accept
- `error` is what the loader can fail with

Live collections are not read at sync time, so their names cannot be written out the way `DataMap`'s are. Nothing calls into `LiveDataMap` from inside a live config, though, so inferring the whole map is safe there.

A collection with no schema is `any`, as before. A collection whose loader builds its schema while loading (`createSchema()`) has nothing in the config to infer from, so `astro sync` keeps generating its types into a file of its own.

The following are still exported, deprecated, and removed in Astro 8:

| Deprecated | Replacement |
| --- | --- |
| `DataEntryMap` | `DataMap` |
| `InferEntrySchema<C>` | `CollectionEntry<C>['data']` |
| `InferLoaderSchema<C>` | `CollectionEntry<C>['data']` |
| `ContentCollectionKey` | `CollectionKey` |
| `DataCollectionKey` | `CollectionKey` |

`@astrojs/yaml2ts` is updated to type Markdown frontmatter with `CollectionEntry<C>['data']`.

## Actions

### JSON actions

`input` accepts any Standard Schema validator. The handler receives the validator's *output* type and the client is typed by its *input* type, matching what Zod gave before:

```ts
export function defineAction<TOutput, TInputSchema extends StandardSchemaV1 | undefined>(params: {
  accept?: 'json';
  input?: TInputSchema;
  handler: ActionHandler<TInputSchema, TOutput>;
}): ActionClient<TOutput, 'json', TInputSchema> & string;
```

Validation is `await inputSchema['~standard'].validate(unparsedInput)`, and issues are thrown as `ActionInputError` as before.

### Form actions

Turning `FormData` into the value a schema expects (`age=25` into `{ age: 25 }`, a checkbox into a boolean, dotted keys into nested objects) requires asking the schema what shape it wants. Standard Schema deliberately covers validation only, and offers no portable way to ask. Astro's implementation walks the Zod AST, so it can never support anything else.

That option has also drawn complaints for being too opinionated: the coercion rules are Astro's, not the user's, and a form that does not fit them has no way out.

So `input` on a form action is deprecated rather than generalized. Users parse the `FormData` in the handler with [`@standard-community/standard-form`](https://github.com/standard-community/standard-form), which does the same job with the validator of their choice and leaves the coercion and error reporting under their control. It resolves a per-vendor handler from `~standard.vendor` and imports it lazily, so a project only installs the validators it uses; Zod is built in, and `loadVendor()` registers or overrides others.

For the deprecation window, Astro's own form handling is routed through that same package, so behaviour does not fork while both paths exist. A form action given a non-Zod `input` throws `ActionsInvalidInputSchemaError` naming the vendor and pointing at the handler-side approach. `input` on form actions is removed in Astro 8.

Two smaller details:

- `defineAction` becomes three overloads: form, JSON, and a fallback for an `accept` that is not a literal (forwarded from a wrapper, say). The fallback is Zod-only, matching what such a call could accept before, and goes away in Astro 8 with form `input`.
- `defineAction` validates `input` at runtime with an `isStandardSchema` guard. Types already rule it out, but an untyped actions file would otherwise fail much further in.

### `ActionInputError`

`ActionInputError#fields` is built from Standard Schema issues, handling both path segment shapes the spec allows (a key, or a `{ key }` object). `#issues` stays typed as `z.$ZodIssue[]` for now: changing it is a breaking change for anyone reading `issue.code`. Non-Zod issues are mapped onto that shape with `code: 'custom'`, which is Zod's own code for an issue no built-in check produced, and the property becomes `StandardSchemaV1.Issue[]` in Astro 8.

## `astro/zod`

With collections and actions taking any validator, Astro no longer needs to hand one out. `astro/zod` is deprecated, along with the already-deprecated `z` exports of `astro:schema` and `astro:content`. Users install `zod` and import from it:

```diff
- import { z } from 'astro/zod';
+ import { z } from 'zod';
```

All three are removed in Astro 8. Astro keeps Zod as an internal dependency for its own config and manifest parsing, where it is invisible to users.

## New errors

| Error | When |
| --- | --- |
| `InvalidCollectionSchemaError` | `schema` is not a Standard Schema validator |
| `InvalidContentReferenceError` | `reference()` was given something it cannot turn into a reference |
| `ActionsInvalidInputSchemaError` | `input` is not a Standard Schema validator, or a form action was given a non-Zod one |

# Testing Strategy

The implementation PR covers, and this RFC expects:

- **Unit tests** for the pieces with branchy logic: `defineAction` overload and guard behaviour, `ActionInputError` field extraction across vendors, schema validation through the Standard interface, the `image()` source resolution ladder (sibling / relative miss / alias / root-absolute / remote / no resolver), the ambient resolver's scoping across overlapping syncs, and data transforms through the store.
- **Type tests**, which matter more than usual here since most of the surface is types. Fixtures cover a Zod collection, a non-Zod collection, a collection with no schema, a loader schema, a `createSchema()` loader, a collection whose schema calls `reference()` (the circularity case), hand-augmented `DataMap` and `LiveDataMap` entries, and action input/output inference for each validator.
- **Integration tests** for the end-to-end paths: `astro sync` output, content collection fixtures using `image()` and `reference()` in both forms, `.schema.json` generation across vendors and its absence for a validator without the capability, and image errors surfacing during sync rather than at read time.
- **Regression coverage** for the deprecated forms, which have to keep behaving identically for the whole deprecation window.

# Drawbacks

- **More deprecated surface.** `astro/zod`, `astro:schema`, `image()` as a context helper, `reference(collection)`, form `input`, and five content types are all deprecated at once. That is a lot of warnings for users who are perfectly happy with Zod, and a lot to carry until Astro 8.
- **`image()` and `reference()` get more verbose.** `z.string().transform((src) => image(context, { src }))` is a lot of characters next to `image()`, and the wrapper is boilerplate the old API hid. What it buys is composition: being able to validate the result at all, which was not possible before.
- **Form parsing moves to userland.** Users who liked `input` on form actions have to write four lines they did not write before, against a package Astro does not own. This is a real regression in convenience, traded for a coercion story users can actually control.
- **Weaker error messages in places.** Astro's collection errors could lean on Zod's issue codes; a bare Standard Schema issue guarantees only `message` and `path`. Errors stay useful, but less structured for non-Zod validators.
- **Teaching cost.** "Any validator" means docs and examples have to pick one anyway, and users now have one more decision to make before writing their first collection. The mitigation is to not present it as a decision: the docs and the official examples keep using Zod throughout, and other validators are documented as an opt-in for users who want one.

# Alternatives

**Keep Zod, upgrade it more aggressively.** Does not solve anything: Zod majors stay Astro majors, and users still cannot bring their own validator.

**Make `zod` a peer dependency instead.** Users control the version, but they are still forced into Zod, and peer dependency ranges are their own kind of upgrade pain.

**Per-vendor adapters for `image()` and `reference()`.** Astro could keep them as schema factories and ship a Zod adapter, a Valibot adapter, and so on. That multiplies the maintenance surface by the number of validators we choose to support, and still leaves the result unvalidatable. Making them plain functions supports every validator with no adapter at all.

**Ship a first-party `FormData` parser.** Astro could generalize its coercion by asking each vendor for its shape through a vendor-specific introspection layer. That is the same per-vendor maintenance problem, for a feature users already find too opinionated, and it is genuinely useful outside Astro, which is the argument for it being a community package rather than an Astro one.

**Infer `DataMap` as a whole.** Simpler generated output, but it makes the content config's type depend on itself as soon as a schema calls `reference()`, and every collection silently becomes `any`. `InferData<TConfig>` is exported for the configs where it is safe.

**Do nothing.** Astro stays tied to Zod's release cadence, users keep bundling a validator they may not want, and the two most-requested discussions on this subject (#1272, #1116) stay open.

# Adoption strategy

This ships as a **minor**, in Astro 7.x. Nothing breaks.

- Existing Zod schemas keep working unchanged, including the `schema: (context) => …` function form.
- `({ image })`, `reference(collection)`, form `input`, `astro/zod`, `astro:schema`, and the deprecated content types all keep working, and are routed through the new implementations so there is one behaviour, not two.
- Users adopt the new APIs at their own pace, or never, until Astro 8.

The deprecations are removed in **Astro 8**, which gives a full major of overlap. Most of the migration is mechanical and codemod-able:

- `import { z } from 'astro/zod'` → `import { z } from 'zod'` (plus adding the dependency) is a pure rewrite.
- `image()` → `z.string().transform((src) => image(context, { src }))` and `reference('x')` → `z.string().transform((id) => reference('x', id))` are mechanical, including renaming the destructured `({ image })` parameter to `(context)`.
- `InferEntrySchema<C>` → `CollectionEntry<C>['data']` and `DataEntryMap` → `DataMap` are renames.

Form `input` is the one migration that is not mechanical: the handler has to parse, and decide what to do with the issues. It gets the longest runway and the most explicit docs.

**Ecosystem impact.** Integrations that ship collections or loaders are the group most affected. Loader `schema` types widen from Zod to Standard Schema, which is source-compatible for existing Zod loaders. Integrations augmenting `DataEntryMap` should move to `DataMap`. Integrations re-exporting `astro/zod` should depend on `zod` directly. None of this is urgent before Astro 8.

**Docs.** The content collections and actions guides need their examples reworked, a validator-agnostic framing in the introductions, a migration section for each deprecated API, and an upgrade guide entry.

# Unresolved Questions

- **`@standard-community/standard-form` ownership and publishing.** The package currently lives in the Astro monorepo as a placeholder. It is expected to move to the [standard-community](https://github.com/standard-community) organization, alongside its sibling `standard-json`, and be published before this lands. Astro's own dependency on it is temporary: it only backs the deprecated form `input` for the length of the deprecation window, and goes away in Astro 8, after which only users who choose it depend on it. What still needs deciding is who owns and maintains it in the meantime.
- **Should `image()` live somewhere friendlier than `astro/content/image`?** A second import in the content config is a papercut, and the reason for it (keeping `astro:content` free of Node builtins) is invisible to users. `astro/loaders` sets the precedent, but it is worth asking whether `astro/content` as a whole would read better.
- **Is skipping `.schema.json` quiet enough, or too quiet?** It is currently a debug log. A user on a validator without JSON Schema support loses editor autocompletion for data collections with nothing visible to explain why.
