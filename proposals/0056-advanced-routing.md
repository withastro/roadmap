- Start Date: 2026-04-21
- Reference Issues: https://github.com/withastro/roadmap/discussions/1320
- Implementation PR: https://github.com/withastro/astro/pull/16366
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1342
- Stage 3 PR: https://github.com/withastro/roadmap/pull/1344

# Summary

Provides greater control over the request lifecycle in Astro as well as the ability to use server frameworks that use the Request/Response APIs such as [Hono](https://hono.dev/), allowing the user to inject logic between Astro features such as i18n, redirects, rewrites, sessions, and even the pages directory.

# Example

The minimal API for this proposal is a `src/app.ts` file with the following shape:

```ts
export default {
  fetch(request: Request) {
    return new Response('ok', {
      status: 200
    });
  }
}
```

In order to be useful, we also provide ways to call into Astro's request handling features, one through a low-level module `astro/fetch` with plain functions that handle requests, and through a higher-level `astro/hono` which provides middleware for use with Hono apps.

__astro/fetch__

This is the low-level API that includes request handlers for various Astro features. The user has the ability to call them in any order.

```ts
import { FetchState, redirects, pages } from 'astro/fetch';

export default {
  fetch(request: Request) {
    const state = new FetchState(request);

    // Check redirects first
    const redirect = redirects(state);
    if (redirect) return redirect;

    // Render pages
    return pages(state);
  }
}
```

For users who don't need fine-grained control, a combined `astro()` handler runs all features in the default order:

```ts
import { FetchState, astro } from 'astro/fetch';

export default {
  fetch(request: Request) {
    const state = new FetchState(request);
    return astro(state);
  }
}
```

__astro/hono__

This is the higher-level API targeting Hono specifically. Features are provided as Astro middleware and can be mixed and matched.

```ts
import { astro } from 'astro/hono';
import { Hono } from 'hono';

const app = new Hono();

app.use(astro());

export default app;
```

# Background & Motivation

Astro started as a static site generator with simple file-based routing. As use-cases for Astro grew we needed to add new ways to configure routing; redirects through Astro config, middleware through a special `src/middleware.ts` file, Actions through a special file, i18n through config (or middleware).

Despite this, users run into limitations with the current approach:

- **No explicit request ordering.** If you need auth to run before Astro rendering and logging to run after, you're relying on implicit middleware ordering that Astro controls. There's no way to say "run this, then Astro, then that."
- **Features are tightly coupled to Astro internals.** Middleware, Actions, rewrites, and i18n are all baked into Astro's request handling. They can't be used independently, reordered, or replaced -- they run when and how Astro decides.
- **Hard to integrate non-Astro request logic.** If you want to mount an API from another library, add rate limiting, or run platform-specific logic before Astro sees the request, you're working against the framework rather than with it.
- **Not all requests reach user code.** Requests that do not match a RouteData object never get passed through Astro's pipeline or reach user middleware, leading users to add logic in front of Astro through their platform's own APIs.

This proposal aims to consolidate a single pipeline for Astro request handling where all requests go into, and the user has complete control.

# Goals

- Allow developers to have complete control over requests coming into their Astro application.
- Provide an API that is completely compatible with Fetch handlers, such as Hono, so users can gain the benefit of those ecosystems.
- Break individual Astro features into small APIs that can be composed however the user wishes.

# Non-Goals

- Creating a single "entry point" that covers all platform-specific APIs. This API still runs after adapters.
- Removing any features; this is just a different way to control what order features run. Features such as injectRoute will still exist, even if it would be possible to implement similar functionality through Hono middleware.
- Provide ways for integrations to inject code into the pipeline. The user has complete control over the request pipeline in this proposal; in fact they have to include the right middleware to even render pages.

# Detailed Design

## `src/app.ts`

The entrypoint for this feature is a `src/app.ts` file whose default export is an object with a `fetch` method. This shape was chosen because it is the standard entrypoint convention used by [Cloudflare Workers](https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/), [Bun](https://bun.sh/docs/api/http#export-default-syntax), and [Hono](https://hono.dev/docs/api/hono#fetch). By aligning with this existing pattern, `src/app.ts` is instantly familiar to anyone who has used those runtimes, and fetch handlers written for those platforms can be reused with minimal changes.

For type-safety, Astro will export a `Fetchable` interface:

```ts
import type { Fetchable } from 'astro';

export default {
  async fetch(request) {
    return new Response('ok');
  }
} satisfies Fetchable;
```

The `Fetchable` type ensures the `fetch` method has the correct signature (it must accept a `Request` and return a `Response` or `Promise<Response>`). This aligns with other platforms, for ex. Bun, which use `satisfies` to type the shape.

## Handler Architecture

Currently most of the logic to resolve what gets called during a request is contained within the App class. This class doubles as the external API used by adapters to render pages.

The bulk of the changes for this proposal will be to extract the logic out of the App class and into feature-specific handler classes. Each feature is organized as a class, but the API of each handler varies depending on what it does. There are a few common patterns:

- **Request interceptors** check the request and may return a response early (e.g. redirects). These have a `handle(state: FetchState)` method that returns a `Response` or `undefined`:

```ts
class RedirectsHandler {
  handle(state: FetchState): Response | undefined {
    // ...
  }
}
```

- **Post-processors** run after the main response has been produced and may mutate it (e.g. i18n rerouting unhandled requests). These expose a method like `finalize()`.
- **Helpers** provide checks or utilities that other handlers use, without directly producing or modifying responses.

This proposal doesn't aim to enforce a single interface across all handlers, as the methods vary depending on what each feature needs to do.

The user-facing API in `astro/fetch` wraps these classes as plain functions (e.g. `redirects(state)`, `pages(state)`). The `astro/hono` API wraps them further as Hono middleware. See the [Feature Handlers](#feature-handlers) and [Hono API](#hono-api) sections below for details.

Internally, handler classes require configuration from Astro's SSR manifest (route table, i18n settings, etc.). To keep the user-facing API simple, the `astro/fetch` module imports the manifest via a Vite virtual module (`virtual:astro:manifest`) at build time and passes it into the handler constructors. This means users just call `redirects(state)` rather than needing to import and wire up the manifest themselves. The handler classes themselves remain pure and accept the manifest as a constructor argument, which makes them directly unit-testable without the virtual module.

## FetchState

Every request has additional state associated with it. Some of it is specific to the adapter such as the `clientAddress`, while other state is loaded during the request lifecycle, such as the `APIContext` object that is created to pass to user middleware.

The `FetchState` object is the representation of this state and needs to be created by the user when using the `astro/fetch` API. The expected public surface includes:

- `request` - The current `Request` object.
- `response` - The `Response` produced by handlers, if any.
- `routeData` - The matched route information.
- `pathname` - The resolved pathname for the request.
- `cookies` - The `AstroCookies` instance for reading/writing cookies.

> **Note:** The exact shape of `FetchState` is still a work in progress and may change during the review and implementation process.

Usage:

```ts
import { FetchState, pages, redirects } from 'astro/fetch';

export default {
  fetch(request: Request) {
    const state = new FetchState(request);

    // Run the redirects
    const response = redirects(state);
    if(response) {
      return response;
    }

    // Continue...
    return pages(state);
  }
}
```

Note that using the `astro/hono` API the creation of FetchState is not necessary, since Hono has its own Context object; handlers can get/create a FetchState by inspecting HonoContext for a certain key (likely `astro.fetchState`).

### Context Providers

`FetchState` includes a **provider registry** that allows handlers to lazily contribute values to the `APIContext` and `Astro` global. This is the mechanism that powers features like sessions and cache — instead of being created eagerly during request setup, they are registered as providers and only instantiated when user code accesses them.

```ts
interface ContextProvider<T> {
  /** Factory called lazily on the first access. */
  create: () => T;
  /** Optional cleanup / persist callback. */
  finalize?: (value: T) => Promise<void> | void;
}
```
The API on `FetchState`:

- `provide<T>(key, provider)` — Registers a provider. The `create` factory is deferred until the first time accessed.
- `resolve<T>(key)` — Lazily calls `create()`, caches the result, and returns it. Returns `undefined` if no provider was registered.
- `finalizeAll()` — Runs all registered `finalize` callbacks for providers that were actually resolved. Returns synchronously when nothing needs finalizing.

For example, the `sessions()` handler registers a provider that lazily creates an `AstroSession` and persists it on finalize:

```ts
state.provide<AstroSession>('session', {
  create() {
    return new AstroSession({ cookies, config, ... });
  },
  finalize(session) {
    return session.persist();
  },
});
```

From the user's perspective they only need to add the `session()` handler/middleware and then they get `ctx.session` / `Astro.session` as values. This could also be used by 3rd party integrations.

## Feature Handlers

Each Astro feature is exposed as a plain function from `astro/fetch`. These functions fall into three categories based on their return type:

- **Early-exit handlers** return `Response | undefined`. If they return a `Response`, the request is handled and the caller should stop. If `undefined`, the caller continues to the next handler.
- **Wrapping handlers** take a `next` callback and always return a `Response`. They run logic before and/or after the inner handler.
- **Post-processors** take an existing `Response` and return a (possibly modified) `Response`.

All handlers take a `FetchState` as their first argument. Here is each handler, what it does, and its signature:

### `trailingSlash(state)`

Enforces the `trailingSlash` config option (`'always'`, `'never'`, or `'ignore'`). If the request pathname doesn't match the configured policy, returns a `301` redirect to the corrected URL. Otherwise returns `undefined`. Call it first, before any other handler.

```ts
function trailingSlash(state: FetchState): Response | undefined
```

### `redirects(state)`

Checks if the matched route is a redirect configured via `astro.config`. If so, returns the redirect `Response`. Otherwise returns `undefined`.

```ts
function redirects(state: FetchState): Promise<Response> | undefined
```

### `actions(state)`

Handles Astro Action requests. For RPC actions (JSON API calls via `actions.myAction()`), executes the action and returns a `Response` containing the result. For form actions (progressive enhancement via `<form>`), executes the action and stores the result on the state so the page can read it via `Astro.getActionResult()`, then returns `undefined` to let page rendering continue. For non-action requests, returns `undefined`.

```ts
function actions(state: FetchState): Promise<Response | undefined> | undefined
```

### `sessions(state)`

Registers the session provider on the state. The session object is created lazily — only when user code accesses `ctx.session` or `Astro.session`. No-op if sessions are not configured in `astro.config`.

Call this early, before middleware runs. After the response is produced, call `state.finalizeAll()` in a `finally` block to persist any session mutations.

```ts
function sessions(state: FetchState): Promise<void> | void
```

Returns `undefined` when sessions are not configured.

### `middleware(state, next)`

Runs the user's `src/middleware.ts` (if present) around the `next` callback. The user's `onRequest` handler receives the usual `APIContext` and a `next` function. If no user middleware is configured, calls `next` directly.

```ts
function middleware(
  state: FetchState,
  next: (state: FetchState) => Promise<Response>,
): Promise<Response>
```

The `next` callback is where you put the inner handlers (typically `pages`):

```ts
const response = await middleware(state, (s) => pages(s));
```

### `pages(state)`

Renders the matched page or endpoint and returns the response. This is the core rendering handler — it loads the route's component module, executes it, and builds the response. Returns 404/500 error pages when appropriate.

```ts
function pages(state: FetchState): Promise<Response>
```

### `i18n(state, response)`

Post-processes a response against the app's i18n configuration. Handles locale redirects for the root URL, 404 responses for invalid locales, and fallback routing. Returns the response unmodified if i18n is not configured or the strategy is `'manual'`.

```ts
function i18n(state: FetchState, response: Response): Promise<Response>
```

Call this after the response has been produced (typically by `middleware` + `pages`).

### `cache(state, next)`

Wraps a render callback with cache provider logic. Handles runtime caching (providers that implement `onRequest`), CDN-based providers (headers only), and the no-cache case transparently. Cache headers are applied and stripped internally.

```ts
function cache(
  state: FetchState,
  next: () => Promise<Response>,
): Promise<Response>
```

### `astro(state)`

The combined handler that runs all features in the default order. Equivalent to composing every handler above in the standard sequence: trailing slash → redirects → sessions → actions → cache → middleware → pages → i18n, with error handling and finalization.

```ts
function astro(state: FetchState): Promise<Response>
```

Most users who don't need fine-grained control should use this.

### Composing handlers

Here's how the individual handlers compose into a full pipeline:

```ts
import {
  FetchState, trailingSlash, redirects,
  sessions, actions, middleware, pages, i18n
} from 'astro/fetch';

export default {
  async fetch(request: Request) {
    const state = new FetchState(request);

    // Early exits — return immediately if they handle the request.
    const slash = trailingSlash(state);
    if (slash) return slash;

    const redirect = redirects(state);
    if (redirect) return redirect;

    // Register session provider (lazy, no-op if unconfigured).
    sessions(state);

    const action = await actions(state);
    if (action) return action;

    try {
      // Middleware wraps page rendering; i18n post-processes.
      const response = await middleware(state, () => pages(state));
      return await i18n(state, response);
    } finally {
      // Persist sessions, etc.
      await state.finalizeAll();
    }
  }
};
```

The power of this API is that you can slot your own logic anywhere. Add auth before `pages`, add logging around `middleware`, skip `i18n` entirely, or replace `pages` with your own rendering — it's all just function calls.

## Platform Entrypoints

`src/app.ts` runs within Astro's request handling, after the adapter and any platform-specific entrypoint (e.g. Cloudflare's `worker.ts`). The layering is:

1. **Adapter / platform entrypoint** (e.g. `worker.ts`) - Platform-specific logic, receives the raw platform request.
2. **`src/app.ts`** - User's fetch handler, receives a standard `Request`.
3. **Feature handlers** - Astro features like redirects, pages, etc.

`src/app.ts` does not replace platform entrypoints. Users who need platform-specific APIs (e.g. Durable Objects, queues) still use their platform's entrypoint for those concerns.

## Hono API

A hono-specific API of middleware will be provided as `astro/hono`. These will be thin wrappers around the lower-level feature handlers that essentially just store FetchState on HonoContext, but otherwise just directly call into the handlers.

User-facing API will look like:

```ts
import { redirects, actions, pages } from 'astro/hono';
import { Hono } from 'hono';

const app = new Hono();
app.use(redirects());
app.use(actions());
app.use(pages());

export default app;
```

Astro will not depend on Hono, except as a devDependency for the sake of testing. The user will be expected to bring their own version of Hono.

# Testing Strategy

This proposal intends to refactor much of Astro's request handling to improve testing. Each handler will take as little information as possible; a subset of the Manifest if possible, as global configuration, but otherwise take the `FetchState` object which can easily be created.

As described in the Detailed Design section, the `astro/fetch` wrapper layer handles manifest wiring via a virtual module, while the underlying handler classes accept the manifest as a plain argument. This separation means handlers can be directly unit tested with mock manifest data.

The higher-level `astro/fetch` and `astro/hono` will likely need to be tested via integration tests.

# Drawbacks

This is a significant refactor of the rendering pipeline. Although the goal is not to break any tests, it's possible that untested implicit behavior might be affected. For example, currently redirects are processed as part of rendering as they are part of the RouteList. By pulling it out, it's possible to break route matching as redirects runs before pages. The intent is preserve route matching rules despite redirects running at an earlier time.

Additionally this is a fairly low-level API allowing the users full control over the request pipeline. For example, even pages do not get rendered with this API if the pages handler is not called. This can cause unexpected behavior for users who only want to tweak the request or handle application-specific scenarios upfront. The `astro()` handler is designed as a solution to this, it's the "do all of the Astro things" API.

Because the user controls the pipeline, debugging can be harder. Errors that previously produced clear Astro error messages may instead manifest as silent failures -- for example, forgetting to include the `pages()` handler means no pages render, but there's no error, just an empty response. We should consider what kind of warnings or developer tooling can help catch common mistakes like missing handlers.

# Alternatives

Early in the design process it was expected that we directly depend on `Hono` and only provide the `astro/hono` APIs. The reason for taking this initial approach was to avoid creating our own framework APIs that are similar to but slightly different from Hono.

A lot of feedback was provided about not wanting to directly depend on Hono. Part of this was motivated by not wanting to prefer one framework over others, and some of the feedback was concern about breaking changes in Hono affecting Astro.

So the compromise was to provide an easy way to use Hono while also providing a lower-level Fetch handler shaped API, along with the proposed `astro/fetch` API.

# Adoption strategy

The `src/app.ts` module will be opt-in. Without this file Astro will behave as it normally does.

Initially this feature will be gated by an `experimental.advancedRouting` flag. In the next major version of Astro there will be no flag, meaning that `src/app.ts` becomes a special-file that users can't use for other purposes.

To accommodate projects which already have a `app.ts` file, this will be configurable:

```
export default defineConfig({
  fetchFile: 'fetch.ts'
});
```

The shape will be:

```ts
type FetchFile = string | null;
```

The usage of `null` will disable the feature; this is useful if the user has their own `app.ts` file but don't want to define their own fetch handler file.

# Unresolved Questions

The exact shape of every feature handler is in-progress and not known. I think the shape of these can be discussed in the review process.

How should users call into Astro from platform-specific entrypoints? For example, a Cloudflare `worker.ts` that needs to export Durable Objects alongside Astro's handler might look something like:

```ts
import { handler } from 'astro/fetch';

export class MyDurableObject { ... }

export default {
  fetch: handler
}
```

This proposal does not currently address this use case, but it may be something we want to support as part of or alongside this work.
