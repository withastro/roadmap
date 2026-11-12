**If you have feedback and the feature is released as experimental, please leave it on the Stage 3 PR. Otherwise, comment on the Stage 2 issue (links below).**

- Start Date: 2026-09-16
- Reference Issues: https://github.com/withastro/roadmap/discussions/1272, https://github.com/withastro/roadmap/discussions/1116
- Implementation PR: https://github.com/withastro/astro/pull/17892
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1428
- Stage 3 PR: https://github.com/withastro/roadmap/pull/1438

# Summary

Decouple Astro's public APIs from Zod. Content collection schemas and action inputs accept any [Standard Schema](https://standardschema.dev) validator. Astro replaces the Zod-only helpers (`image()`, `reference()`, and form `input`) with validator-agnostic equivalents.

# Example

This example validates a collection with Valibot and does not use Zod:

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

Images and references become ordinary functions that you call from a schema transform. They no longer act as schema factories supplied by Astro:

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

Because these functions return plain values, you can validate their results in later schema steps:

```ts
cover: z
  .string()
  .transform((src) => image(context, { src }))
  .refine((cover) => (cover.width ?? 0) >= 1000, 'cover must be at least 1000px wide'),
```

Actions accept any Standard Schema validator for JSON payloads. For example:

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

Form actions parse their own `FormData` with the validator of their choice:

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
        return comment;
      },
    }),
  };
```

# Background & Motivation

Astro has used Zod for a long time, both internally and in its public APIs. This RFC changes only the public APIs.

Work on Astro 6 exposed the cost of that coupling. Astro ships a copy of Zod through `astro/zod`, so each Zod major becomes an Astro major. Users cannot upgrade Zod independently, and Astro cannot upgrade Zod without risking a breaking change. Users who prefer Valibot or ArkType, or already use one elsewhere in their stack, must install and bundle a second validator just for their content config.

[Standard Schema](https://standardschema.dev) addresses this problem, and the ecosystem has converged on it. Adopting it is not a drop-in change because Astro's public APIs do more than validate:

- `astro/zod` re-exports Astro's own copy of Zod.
- Astro provides Zod schema factories to collection schemas: `image()` from the schema context and `reference()` from `astro:content`.
- Form actions coerce `FormData` into an object by walking the Zod schema. This requires introspection that the spec does not describe.
- `astro sync` writes each collection's entry type by resolving the Zod schema it found.

The work is not limited to calling `~standard.validate` instead of `safeParse`. Astro must redesign the four places where it inspects or constructs schemas rather than using them only for validation.

# Goals

- Allow users to use other validators than Zod
- Be backward compatible
- Ensure Astro's internal validator does not leak into the runtime

# Non-goals

- Replace Zod as Astro's internal validator. Astro continues to parse its own config, manifests, and loader returns with Zod. Users do not see this internal use.
- Remove the deprecated APIs in this RFC. The changes ship in a minor release, and the removals are scheduled for Astro 8.
- Ship a first-party `FormData` parser. Astro defers that to a community package (see [Form actions](#form-actions)).
- Support validators that do not implement Standard Schema.

# Detailed Design

## Terminology

- **Standard Schema**: the [spec](https://standardschema.dev) a validator implements by exposing a `~standard` property with a `validate()` method. Zod (3.24+), Valibot (1.0+), ArkType (2.0+), and many others implement it.
- **Standard JSON Schema**: the [companion spec](https://standardschema.dev/json-schema) for describing a schema as JSON Schema. It is optional, and Astro treats it as a capability rather than a requirement.
- **Vendor**: the validator behind a schema, read from `schema['~standard'].vendor` (`'zod'`, `'valibot'`, `'arktype'`, and other values).

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

A schema that does not implement Standard Schema is rejected with `InvalidCollectionSchemaError`. This avoids a failure deep in the content layer. Astro formats validation issues from every vendor as the existing bulleted schema-error list. It also resolves the YAML line for the first issue from its path, so the error points to the relevant line in the entry.

The same applies to loaders: `Loader['schema']` and `Loader['createSchema']` are typed as `StandardSchemaV1` instead of `z.$ZodType`.

### From schema factories to plain functions

`image()` and `reference()` were Zod-specific because they returned Zod schemas. `image()` returned a Zod string with a transform, and `reference()` returned a Zod type that parsed an ID into a reference object. Users could include these schemas in their own schemas only when both schemas used the same library.

Standard Schema does not address schema construction. It describes how to validate *with* a schema, but it does not define a portable schema constructor. Astro therefore stops building schemas for these helpers. Both become functions that transform values, and users call them through their validator's transform mechanism:

```ts
cover: z.string().transform((src) => image(context, { src })),
```

The Zod example uses `.transform()`. The Valibot equivalent uses `v.pipeAsync()` and `v.transformAsync()`:

```ts
cover: v.pipeAsync(v.string(), v.transformAsync((src) => image(context, { src }))),
```

The ArkType equivalent uses `.pipe()`:

```ts
author: type('string').pipe((id) => reference('authors', id)),
```

Astro supplies the behavior, and each validator supplies its own transform mechanism. Users write the validator-specific call in the same style as the rest of the schema.

This also makes the results available for further validation. The old helpers ended the field's schema. The new functions return a value to the user's schema chain, so later steps such as `.refine()`, `v.check()`, or another `.pipe()` can validate it.

The phrase "any Standard Schema validator" has one constraint. A validator must provide a transform mechanism, and `image()` requires an *async* transform because it reads the file. Zod and Valibot support both. ArkType has synchronous morphs but [does not support asynchronous morphs](https://arktype.io/docs/faq), so users cannot call `image()` inside an ArkType schema. The synchronous `reference()` function works with ArkType. Users who use ArkType for a collection with images must resolve those images outside the schema or choose another validator for that collection.

### `image()`

The `image` helper used to come from the schema context and return a Zod schema. As a result, it worked only with Zod, and users could not validate its result in later schema steps.

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

Astro exports this function from a separate entry point rather than from `astro:content`, following the pattern used by `astro/loaders`. The function accesses the filesystem, while `astro:content` must remain free of Node built-ins so it can run on Cloudflare and Deno. A continuous integration check enforces that boundary. Content configs run in Node.

`image(context, { src })` returns a marker object with `src`, `width`, `height`, and `format` values read from the file:

```ts
type ContentImageField = {
  src: string;
} & Partial<Omit<ImageMetadata, 'src' | 'fsPath'>>;
```

For example, during sync, the helper can return this value for a 1200 × 800 PNG:

```ts
{
  src: '/@fs/project/src/content/blog/cover.png',
  width: 1200,
  height: 800,
  format: 'png',
}
```

The exact `src` depends on Vite and the build mode. Users can adapt the helper's value in another transform to produce a different validated shape. This example adds a nested `dimensions` field and validates it. The top-level `src` marker remains for Astro to resolve at read time:

```ts
cover: z.string()
  .transform((src) => image(context, { src }))
  .transform((cover) => ({
    ...cover,
    dimensions: { width: cover.width, height: cover.height },
  }))
  .pipe(z.object({
    src: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
    format: z.string().optional(),
    dimensions: z.object({
      width: z.number().optional(),
      height: z.number().optional(),
    }),
  })),
```

Astro resolves the image while syncing content:

1. A remote URL passes through unchanged. So does an entry whose loader does not provide an absolute path.
2. Astro looks for a sibling file directly on disk. It normalizes a bare filename found this way to `./name`, matching Markdown frontmatter resolution. If a `./` or `../` source does not resolve, Astro reports an error immediately.
3. Astro passes other sources, such as a Vite alias, a root-absolute path, or a bare specifier with no sibling file, to Vite's plugin container. This matches how Vite resolves the source at read time. The resolver is available for the duration of a sync, and `image()` reads it from the current context. If no resolver is available, as when a loader runs outside a sync, Astro defers resolution to read time.

Resolving images during sync has two effects:

- Astro reports a missing image, broken alias, or invalid root-absolute path during sync and identifies the entry. The error does not wait until read time.
- The schema and later transforms can access and validate the image dimensions.

At this point, `src` is not final. It is a `/@fs/...` URL in development and a hashed emitted asset in a build. Only Vite knows the final value. Astro keeps `src` as a marker until read time, then merges the real `ImageMetadata` over the stored object so fields added by later transforms survive. SVGs resolve to a component factory rather than metadata, so Astro replaces the value instead of merging into it.

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

The lookup accepts the values supported by the schema form: an entry identifier as a string or number, or a reference object produced by an earlier parse. Re-parsing already-transformed data is therefore a no-op. Any other value causes `InvalidContentReferenceError` during sync rather than a validation issue on the field.

Astro does not check whether the entry exists at this point. A reference can point to a collection whose loader has not run yet. Astro verifies that each referenced entry exists after all loaders finish by walking the store.

The single-argument form still returns a Zod schema, is routed through the same resolution (reporting failures as validation issues, so they are collected alongside the schema's others), and is removed in Astro 8.

### JSON Schema for data collections

Astro generates a `.schema.json` file for each data collection to provide editor completion and validation. Astro previously generated the file with `z.toJSONSchema()`. It now uses [Standard JSON Schema](https://standardschema.dev/json-schema), detected at runtime through `~standard.jsonSchema.input`.

Astro uses `libraryOptions`, the spec's mechanism for vendor-specific parameters, to normalize two behaviors across validators. These behaviors match Astro's defaults elsewhere:

- A type with no JSON representation degrades to `{}` instead of aborting conversion. This preserves the collection's `.schema.json` when one field has no JSON representation.
- A date is described as the ISO string a data file actually holds.

Zod, Valibot, and ArkType provide entries. Astro converts schemas from other validators with their own defaults. If a validator does not implement the spec, Astro skips the file and logs the collection name. The rest of the collection continues to work.

### Type inference

`astro sync` used to resolve each collection's schema and write its resulting type into `.astro/content.d.ts`. This worked only for Zod schemas. The generated file now points to the config, and TypeScript infers the types from it:

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

`DataMap` maps each collection name to the type of its entry's `data`. The other types in `astro:content` derive from `DataMap`. Entry types therefore stay accurate as users edit schemas instead of reflecting only the last sync.

Astro writes each collection name on a separate line instead of inferring the whole map. This distinction prevents a type cycle. The content config calls `reference()`, whose type depends on `keyof DataMap`. Inferring the entire `DataMap` would make the config's type depend on itself and cause every collection to resolve to `any`. Writing the collection names explicitly breaks the cycle. Astro also exports `InferData<TConfig>`, which infers the whole map for configs that do not call `reference()`.

`DataMap` is an interface. Projects can augment it to provide a collection type manually or to describe a collection shipped by an integration that Astro cannot infer:

```ts
declare module 'astro:content' {
  interface DataMap {
    blog: { title: string; draft: boolean };
  }
}
```

When `DataMap` is empty, as in a project that has not synced, it falls back to `Record<string, any>`. This prevents missing sync output from causing type errors throughout the project.

Live collections use `LiveDataMap`, keyed by collection name and mapping to the types accepted or returned by each loader. A project declares only the parts it uses:

```ts
declare module 'astro:content' {
  interface LiveDataMap {
    products: { data: Product; entryFilter: { sku: string } };
  }
}
```

- `data` is the loader's return type, or the collection schema's output type when the collection has a schema.
- `entryFilter` and `collectionFilter` are the types accepted by `getLiveEntry()` and `getLiveCollection()`.
- `error` is the type of error the loader can return.

Astro does not read live collections at sync time, so it cannot write their names out as it does for `DataMap`. Inferring the whole `LiveDataMap` is safe because live configs do not reference it.

As before, a collection with no schema has type `any`. A loader that builds its schema while loading through `createSchema()` has no schema in the config for TypeScript to infer. In this case, `astro sync` continues to generate its types in a separate file.

The following types remain exported until Astro 8, when Astro removes them:

| Deprecated | Replacement |
| --- | --- |
| `DataEntryMap` | `DataMap` |
| `InferEntrySchema<C>` | `CollectionEntry<C>['data']` |
| `InferLoaderSchema<C>` | `CollectionEntry<C>['data']` |
| `ContentCollectionKey` | `CollectionKey` |
| `DataCollectionKey` | `CollectionKey` |

`@astrojs/yaml2ts` uses `CollectionEntry<C>['data']` to type Markdown frontmatter.

## Actions

### JSON actions

The `input` option accepts any Standard Schema validator. The handler receives the validator's *output* type, and the client uses its *input* type. This matches the existing Zod behavior:

```ts
export function defineAction<TOutput, TInputSchema extends StandardSchemaV1 | undefined>(params: {
  accept?: 'json';
  input?: TInputSchema;
  handler: ActionHandler<TInputSchema, TOutput>;
}): ActionClient<TOutput, 'json', TInputSchema> & string;
```

Astro validates input with `await inputSchema['~standard'].validate(unparsedInput)`. It throws validation issues as `ActionInputError`, as before.

### Form actions

Converting `FormData` into the value a schema expects requires knowing the schema's shape. For example, the parser might convert `age=25` to `{ age: 25 }`, a checkbox to a boolean, or dotted keys to nested objects. Standard Schema covers validation but does not provide a portable way to inspect a schema. Astro's current implementation walks the Zod abstract syntax tree, so it cannot support other validators.

Users have also found this option too opinionated. Astro defines the coercion rules, and users cannot change them when a form needs different behavior.

Astro deprecates `input` on form actions rather than generalizing it. Users parse `FormData` in the handler with [`@standard-community/standard-form`](https://github.com/standard-community/standard-form). The package supports the user's validator and leaves coercion and error reporting under their control. It selects a handler by `~standard.vendor` and imports that handler lazily, so projects install only the validators they use. Zod support is built in, and `loadVendor()` registers or overrides other handlers.

During the deprecation window, Astro routes its own form handling through the same package so both paths behave consistently. A form action with a non-Zod `input` throws `ActionsInvalidInputSchemaError`. The error names the vendor and directs users to parse input in the handler. Astro removes form action `input` in Astro 8.

Two additional details affect `defineAction`:

- `defineAction` has three overloads: form, JSON, and a fallback for a non-literal `accept` value, such as a value forwarded from a wrapper. The fallback remains Zod-only, matching the existing behavior. Astro removes it in Astro 8 along with form action `input`.
- `defineAction` checks `input` at runtime with an `isStandardSchema` guard. Types reject invalid schemas, but an untyped actions file would otherwise fail later in the request.

### `ActionInputError`

`ActionInputError#fields` is built from Standard Schema issues. It supports both path segment shapes allowed by the spec: a key or a `{ key }` object. The `#issues` property remains typed as `z.$ZodIssue[]` because changing it would break users who read `issue.code`. Astro maps non-Zod issues to that shape with `code: 'custom'`, Zod's code for issues that do not come from a built-in check. In Astro 8, the property changes to `StandardSchemaV1.Issue[]`.

## `astro/zod`

`astro/zod` stays so that libraries and integrations can continue to use it.

## New errors

| Error | When |
| --- | --- |
| `InvalidCollectionSchemaError` | `schema` is not a Standard Schema validator |
| `InvalidContentReferenceError` | `reference()` was given something it cannot turn into a reference |
| `ActionsInvalidInputSchemaError` | `input` is not a Standard Schema validator, or a form action was given a non-Zod one |

# Testing Strategy

The implementation pull request covers these tests:

- **Unit tests** cover `defineAction` overloads and runtime guards, `ActionInputError` field extraction across vendors, schema validation through the Standard Schema interface, `image()` source resolution (sibling, relative miss, alias, root-absolute, remote, and no resolver), resolver scoping across overlapping syncs, and data transforms through the store.
- **Type tests** cover a Zod collection, a non-Zod collection, a collection with no schema, a loader schema, a `createSchema()` loader, a collection whose schema calls `reference()`, manually augmented `DataMap` and `LiveDataMap` entries, and action input and output inference for each validator.
- **Integration tests** cover `astro sync` output, content collection fixtures using both `image()` and `reference()` forms, `.schema.json` generation across vendors, omission of that file when a validator lacks the capability, and image errors reported during sync rather than at read time.
- **Regression tests** verify that deprecated forms behave as before throughout the deprecation window.

# Drawbacks

- **More deprecated APIs.** Astro deprecates `astro:schema`, `image()` as a context helper, `reference(collection)`, form `input`, and five content types at the same time. Users who prefer Zod receive multiple deprecation warnings and must manage them until Astro 8.
- **More verbose `image()` and `reference()` calls.** `z.string().transform((src) => image(context, { src }))` is longer than `image()`, and the wrapper adds code that the old API hid. The new form supports composition, so users can validate the result in later schema steps.
- **Form parsing moves to a community package.** Users who prefer the existing `input` option must parse `FormData` in the handler with a package Astro does not own. This reduces convenience but gives users control over coercion and error reporting.
- **Transform support varies by validator.** `image()` requires an async transform, which ArkType does not support. Therefore, users cannot call `image()` inside an ArkType schema. Standard Schema does not define transforms, so it cannot address this limitation.
- **Some errors have less detail.** Astro's collection errors previously used Zod issue codes. Standard Schema guarantees only `message` and `path`, so errors from non-Zod validators contain less structure.
- **More choices for users to learn.** Documentation and examples must still choose a validator, and users face this choice when creating their first collection. The docs and official examples continue to use Zod, while explaining other validators as an option for users who need them.

# Alternatives

**Keep Zod and upgrade it more often.** This does not resolve the coupling. Zod major versions remain tied to Astro major versions, and users still cannot choose another validator.

**Make `zod` a peer dependency.** Users control the version, but must still use Zod. Peer dependency ranges also create version-management work.

**Provide adapters for each validator.** Astro could keep these helpers as schema factories and ship adapters for Zod, Valibot, and other validators. This multiplies maintenance work by the number of supported validators and still prevents users from validating the helper's result. Plain functions support every validator without adapters.

**Ship a first-party `FormData` parser.** Astro could generalize coercion by inspecting each validator through a vendor-specific API. This creates the same per-vendor maintenance burden for a feature users already find too opinionated. A general-purpose parser is also useful outside Astro, which supports providing it as a community package instead.

**Infer the whole `DataMap`.** This produces simpler generated output, but makes the content config's type depend on itself when a schema calls `reference()`. Every collection then silently becomes `any`. Astro exports `InferData<TConfig>` for configs where whole-map inference is safe.

**Do nothing.** Astro remains tied to Zod's release cadence, and users continue to bundle a validator they might not want. The two most-requested discussions on this subject, [1272](https://github.com/withastro/roadmap/discussions/1272) and [1116](https://github.com/withastro/roadmap/discussions/1116), remain unresolved.

# Adoption strategy

This ships in an Astro 7.x minor release. Existing behavior remains compatible.

- Existing Zod schemas continue to work, including the `schema: (context) => ...` function form.
- The deprecated `({ image })`, `reference(collection)`, form `input`, `astro:schema`, and content types continue to work. Astro routes them through the new implementations to maintain one behavior path.
- Users can adopt the new APIs at any time before Astro 8.

Astro removes the deprecated APIs in **Astro 8**, providing a full major release for migration. Most changes are mechanical and can be automated with a codemod:

- Replace `image()` with `z.string().transform((src) => image(context, { src }))`. Replace `reference('x')` with `z.string().transform((id) => reference('x', id))`. Rename a destructured `({ image })` parameter to `(context)`.
- Replace `InferEntrySchema<C>` with `CollectionEntry<C>['data']`, and replace `DataEntryMap` with `DataMap`.

Form action `input` requires a manual migration. The handler must parse the form and decide how to handle validation issues. This change has the longest deprecation period and the most detailed documentation.

**Ecosystem impact.** Integrations that provide collections or loaders are most affected. Loader `schema` types widen from Zod to Standard Schema, which remains source-compatible with existing Zod loaders. Integrations that augment `DataEntryMap` should switch to `DataMap`. Integrations can continue to use `astro/zod`.

**Documentation.** The content collections and actions guides need updated examples and validator-agnostic introductions. They also need migration sections for each deprecated API and an entry in the upgrade guide.
