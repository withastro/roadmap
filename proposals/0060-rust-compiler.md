- Start Date: 2026-05-05
- Reference Issues: https://github.com/withastro/compiler/issues
- Implementation PR: https://github.com/withastro/compiler-rs
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1356
- Stage 3 PR: https://github.com/withastro/roadmap/pull/1357

# Summary

Create a new compiler for Astro, without HTML correction, easier to maintain, more correct, and adopt it as the official Astro compiler going forward.

# Example

The public API of the Rust compiler is intentionally as compatible as possible with `@astrojs/compiler` for the calls Astro itself uses. The result shape (`code`, `map`, `css`, `scripts`, `hydratedComponents`, …) matches what Astro consumes today.

```diff
+import { transform } from "@astrojs/compiler-rs";

const result = transform(source, {
  filename: "/Users/astro/Code/project/src/pages/index.astro",
  sourcemap: "both",
});
```

The notable shape differences are described individually in [Detailed Design and Adoption strategy](#detailed-design), but the overall usage is nonetheless the same.

# Background & Motivation

The Astro compiler turns `.astro` files into JavaScript modules, for Astro to then execute.

[The current implementation, written in Go, has been serving us since Astro 0.21](https://github.com/withastro/compiler). After several years of production use, a few things have become clear:

- **Maintenance has stalled.** The codebase is hard to onboard onto, and the team has not been successful in finding contributors (internal or external) who are both willing and able to maintain Go code. Issues sit open for long periods, because nobody on the core team is comfortable owning fixes there.
- **Proper architecture and tooling is needed**. The Go compiler uses its own HTML parsing, does its TS understanding itself, has its own (although forked from esbuild) CSS parsing, etc. A lot of tooling now exists that we can rely on instead of owning ourselves, especially in the Rust ecosystem, reducing our surface area to cover ourselves and reducing bugs.
- **HTML correction has been a long-standing source of bugs.** The behavior surprises users, makes debugging harder, and is increasingly out of step with how modern frameworks treat author-written markup.
- **JSX-style strictness is often more valuable than HTML's behavior.** HTML is on purpose lenient with regards to unclosed tags and attributes, but the vast majority of the time this only results in broken or unexpected results in the browser.

# Goals

- Create a new official compiler for Astro.
- Make the new compiler maintainable by the current team and approachable for new contributors.
- Reach feature and behavior parity with the current Go compiler for everything that is not explicitly being dropped, so that existing Astro projects continue to build without needing changes in most cases.
- Match or exceed the current compiler's performance on real-world Astro projects.
- Run in every environment Astro itself supports today.
- Supports semantically invalid HTML structures, but reject (what is commonly perceived as) syntactically invalid ones.

# Non-Goals

- **HTML correction is intentionally being dropped.** The new compiler will not silently rewrite author markup to be "valid HTML". Behavior changes from this will be documented as part of the migration, but reintroducing correction is out of scope.
- **Supporting syntactically invalid HTML**. Unclosed tags like `<div>Hello` will now results in an error, like they would in JSX, so will unterminated attributes: `<div class="Hello >World</div>`
- **No new language features.** This proposal is specifically about replacing the implementation, not about extending the `.astro` syntax. Any syntax-level changes are separate proposals.
- **TSX output.** A compiler for Astro itself and a compiler for the TSX output needed by the language server has different requirements. As such, I propose to focus this new effort on what's needed for runtime, and consider more relevant and suited alternatives for the language-server down the line.
- **AST parity.** The Go compiler returned its own AST format, completely different from other tools. As part of relying on existing libraries, we could now return a more standard AST.

# Detailed Design

## Compilation pipeline

The structure is somewhat similar to how the Go compiler worked:

1. **Parse**: `oxc` parses the `.astro` file into an estree + astro extensions AST. Astro-specific extensions (frontmatter fence, jsx differences, slot semantics, etc) parsing is added on top of `oxc` currently [via a fork](https://github.com/withastro/oxc/pull/2). See [oxc relationship](#oxc-relationship)
2. **Scan**: `AstroScanner` walks the AST once to collect the metadata Astro's runtime needs: hoisted scripts, hydrated/client-only/server-deferred components, presence of `<head>`, propagation flag, scoped-style hash inputs, the list of extractable `<style>` blocks, etc.
3. **Codegen**: `AstroCodegen` walks the AST and emits the final JavaScript module. This was known as "printing" in the Go compiler.

CSS scoping is done using `lightningcss`'s CSS handling, which supports all the modern CSS goodies and then some.

Unlike the Go compiler, there is only one printer to JS. JSON printing does not need to happens anymore as the parse step can directly return an AST, and TSX handling is considered out of scope.

## Public API changes

The TypeScript-facing API is the same as the current compiler, except for the addition of a `preprocessStyles` function (see [Options](#options)), and the following changes:

### Sync by default

The main exported functions `transform` and `parse` are now sync, with async versions available from another entrypoint. This is done both for performance reasons, and because there's no actual async code anymore into those paths.

### Options

- `resolvePath` is now implemented as a post-processing step in the JS wrapper rather than a callback into the binding, because making NAPI call back into JS for every component is both slow and awkward. The binding emits placeholder specifiers when `resolvePath`is specified, the wrapper then rewrites `client:component-path` strings after compilation. This is invisible to callers.
- `preprocessedStyles` is a new option that lets the caller hand back preprocessed CSS to be injected at codegen time, this is done so for the same reasons as `resolvePath`. Preprocessed CSS can be provided either manually, or through the new `preprocessStyles` function.

## Diagnostics

The shape of diagnostics is slightly different, as oxc, like many other Rust tools, can return errors with multiple locations and instructions ("labels")

## Distribution

The NAPI crate produces:

- Native bindings for `darwin-arm64`, `darwin-x64`, `linux-arm64-gnu`, `linux-arm64-musl`, `linux-x64-gnu`, `linux-x64-musl`, `win32-arm64-msvc`, `win32-x64-msvc`. These ship as `@astrojs/compiler-binding-<triple>` packages, picked up via npm `optionalDependencies`.
- A `wasm32-wasi` artifact, shipped as `@astrojs/compiler-binding-wasm32-wasi`. This is the fallback for environments without a matching native binding (browser-based playgrounds, WebContainers, restrictive serverless environments, etc).

The `@astrojs/compiler-rs` user-facing package depends on a single `@astrojs/compiler-binding` dispatcher.

## oxc relationship

The compiler depends on a small number of oxc crates (`oxc_parser`, `oxc_ast`, `oxc_ast_visit`, `oxc_codegen`, `oxc_span`, `oxc_estree`, plus a few transitive ones) from a `feat/astro` branch on our fork of oxc.

The intent is to keep that branch small, focused and rebase it against upstream oxc, and to possibly work with the VoidZero team to eventually upstream official Astro support.

## Performance

Anecdotal numbers from real projects (Astro docs, astro.build) show the new compiler faster or equivalent than the Go compiler in all cases, with also a slightly lower memory overhead at times.

| Build                   | Time (s) |
| ----------------------- | -------- |
| docs.astro.build        | 198.938  |
| docs.astro.build + rust | 186.671  |

In general, Astro compilation is rarely the bottleneck compared to processing Markdown or bundling files, as such the gains in real time are typically very small, even if the gain in CPU times are more consequent.


# Testing Strategy

1. **Rust unit tests**, colocated with the modules they cover, both in the compiler and in the parser.
2. **Rust snapshot tests**, Using `insta`. Mostly port of the Go snapshots.
3. **TypeScript integration tests**, same as the Go compiler

Finally, E2E behavior is tested directly in Astro's test suite.

# Drawbacks

- **Full rewrite.** Rewrites are always fun, but always kinda suck. However, this one has reached parity fast enough to not be a problem.
- **Native binaries.** Shipping per-platform native bindings introduces install-time complexity (optional deps, etc), but the ship has largely sailed on that in the ecosystem and Astro already depends on native deps.
- **AST shape change.** Tools that parse Astro files via `@astrojs/compiler` and consume its bespoke AST will need to adapt to the ESTree/JSX shape. In practice the only consumers of that AST in the ecosystem are `prettier-plugin-astro` and the language server.
- **No TSX output.** The language server currently relies on `convertToTSX()`, which this new compiler won't implement. A proper solution for the TSX output will be explored separately from this effort, and the language server will temporarily keep using the old compiler for now.

# Alternatives

- **Keep the Go compiler.** Continue investing in maintainability of the existing implementation. However, the issues and changes we'd like are also not addressable without something close to a rewrite.
- **Rewrite in TypeScript.** Definitely the easiest one, but at this point there's more modern tooling available in Rust than in TypeScript, and performance could be a concern too.

# Adoption strategy

For end users:

- No changes are required to the Astro config or anything, the Rust compiler will be enabled by default invisibly.
- A handful of users will hit the new strict-parsing errors (unclosed tags, unterminated attributes, etc). These are real bugs in their templates that the Go compiler used to silently paper over, the diagnostics will naturally guide users towards finding those issues.
- As the previous compiler's HTML correction was based on the HTML spec, every case of discernible differences in rendered output to browsers were unreliable bugs that cannot be detected. Users will need to inspect their pages to make sure there are no regressions. Most of the bugs in the compiler in this area are in somewhat niche contexts in modern times (tables, iframes etc.) which should hopefully limit the impact.

For Astro core:

- Calls to `@astrojs/compiler` are removed in favor of the new package, and small adjustments (ex: for the new diagnostic shape) are done to comply.

For ecosystem tooling:

- **`prettier-plugin-astro`**, keeps using `@astrojs/compiler`'s `parse` for now. Down the line a new plugin consuming the ESTree + Astro AST will need to be created. The new AST being much more complete should lead to overall major improvements to the formatting experience down the line.
- **Astro VS Code extension / language server**, keeps using `@astrojs/compiler`'s `convertToTSX` for now. A Stage 1 follow-up will scope a replacement (separate from this RFC, per Non-Goals).


# Unresolved Questions

N/A.
