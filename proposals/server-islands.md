- Start Date: 2024-06-25
- Reference Issues: https://github.com/withastro/roadmap/issues/945
- Implementation PR: https://github.com/withastro/astro/pull/11305

# Summary

Allow islands of server-rendered content that renders after the page load, allowing more cacheable pages.

# Example

A component, Astro or framework, can be deferred using the `server:defer` directive:

```astro
<Avatar server:defer>
  <div slot="fallback">Guest</div>
</Avatar>
```

The page can also pass props like normal. These props are included in the request to fetch the server island:

```astro
---
import Like from "../components/Like";

export const prerender = true;

const post = await getPost(Astro.params.slug)
---
<Like server:defer post={post.id} />
```

# Background & Motivation

Personalized and dynamic content reduce the ability to cache pages. Forgoing that content in the initial page request allows more effective caching strategies. This allows a CDN to deliver an initial page, either from static content or server-rendered and cached content, closer to the user immediately in most cases. Personal and dynamic content can still be delivered after the initial HTML request.

## Definitions

- **Personalized content**: Content on a web page that is distinct for a user, usually one who is logged in. Examples include a logged in user's avatar and menu items.
- **Dynamic content**: Content delivered on a page that changes frequently. An example would be a carousel of *related products* on an ecommerce site.

# Goals

- Allow deferred content to be rendered asynchronously with the page request.
- Explicit opt-in to server islands; no magic discovery based on a heuristic.
- Host agnostic and simplicity are preferred. Ideally when prerendering the static pages can be deployed to any host.
- Individual server islands per usage, no global fetch of all islands, to allow parallel and async loading.
- Allow access to on-demand rendering features in deferred components, such as cookies and the response object.

# Non-Goals

- Prerendering of deferred components, only specified fallback content will be rendered.
- Static content inside of a server island; like with client islands once you are inside of a server island all components rendered within are also server rendered.
- Zero JS. For portability and simplicity, using a small client script to fetch the island is a better approach.

# Detailed Design

Server islands are declared with the `server:defer` directive. The compiler will:

- Scan components looking for this directive.
- When it finds one, traces the component to its associated import statement.
- Creates metadata, like with client islands, returned from compilation that gives a list of each island used in each component.

In Astro a route is created, `/_server-islands/[name]` that serves discovered islands. During the "server" phase of the build the islands are discovered and collected into a map.

## Naming algorithm

After the server build there is a secondary build for the discovered islands. Each island is given a distinct name using this algorithm:

- A component is by default named its usage. If `src/components/Avatar.astro` is imported as `Avatar` and used as a server island it is by default named `Avatar`.
- If the same component is used somewhere else, but renamed to another name, the first discovered usage serves as the name.
- If another component has already claimed the name `Avatar` then the name is appended a number, `Avatar1`. The name is recursively checked with the number incremented until it finds a distinct name.

## Rendering

### Island rendering

Server islands are rendered with the same rules as a `partial`; no `<doctype>` is appended to them, nor are scripts and styles included in the response. Since the islands are used within pages their scripts and styles are already collected, bundled, and injected as part of the page's own build process.

When a request for `/_server-islands/Avatar` comes through the runtime:

- Looks in the `serverComponents` field in the `SSRManifest`. This field is a `Map<string, () => Promise<ComponentInstance>>` where the key is the component's distinct name and the value is a function that will return a promise for the component. This is similar to the data structure used to lazy load pages.
- The server island calls the value of this map to retrieve the `ComponentInstance` which is then rendered inside of the endpoint.

### Page rendering

When the page renders, either at build time (`output: 'hybrid'`) or at runtime (`output: 'server'`), components with the `server:defer` directive are not rendered. Instead a script is injected (explained in next section).

Additionally the `slot="fallback"` is rendered and returned before the hydration script. The hydration script is injected along with stringified:

- Component `name` as described in the naming algorithm.
- `props` passed to the component. An island can be rendered multiple times; the props are representative of a particular usage.
- `slots` that are passed to the island component.

### Props serialization

Since the island is replaced with a script and fallback content at build time, the props must be serializable. This is done using `JSON.stringify`.

Additionally the props will be encrypted using [Web Crypto](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API). Upon build Astro will create a new key which will be used for prop encryption. The same key is shipped the island routes in order to decrypt.

Note that this an additional form of protection only intended to protect against accidental leakage of secrets. It is *not* a replacement for per-request authentication, which should happen when islands render, nor is it intended to protect against CSRF. Islands are read-requests and should not suffer from CSRF in general.

## Hydration

The hydration script performs the following steps:

- Creates an HTTP request to `/_server-islands/[name]`
- Consumes the body of the request into a string.
- Turns the string of HTML into a document fragment.
- Removes the fallback content, if there is any.
- Injects the new fragment.
- Removes the script.

# Testing Strategy

This feature spans multiple parts of Astro so it will be tested in layers:

## Compiler

- The compiler piece of this mostly deals with the metadata that is returned. So integration/wasm tests will be added to verify the right output.

## Rendering

- Fixture tests for server generated content, dev and build, to ensure the script is emitted for islands.

## E2E

- Playwright tests to verify the island hydrates, requests the server contents, and renders it properly on the client. 

# Drawbacks

- There is overlap between this feature and client directives, particularly `client:only` which can include fallback content. It is hard to explain why you would use server islands over this feature. One reason is that client directives that fetch from an API cause a waterfall that is not included with server directives which only have a small inlined script.

# Alternatives

The major alternative implementation idea is to not fetch the islands via a script but rather to do so inside of an Edge function and then stitch together the HTML as the islands stream in. Such an approach would have these advantages:

- Prevention of a waterfall caused by the island only being fetched once the page loads.
- No fallback content needed. Fallback requires design considerations, using an Edge function would be more akin to SSR.

However this approach has some downsides:

- Eliminates the caching advantage gained by the script approach. Since the edge function injects personalized content the page cannot be cached globally.
- Only works will with Edge functions, so limited choice of hosts. Loss of portability.
- The page's main content will often be delayed from being visible to the user as it is blocked by server islands being fetched further up in the page.

# Adoption strategy

- Experimental release while the stage 3 RFC goes through revisions.
- This is an opt-in feature that does not include any breaking changes to existing features. Only users who want to use it will.
- This feature requires compiler integration so there are no similar features in the Astro ecosystem.

# Unresolved Questions

- During stage 2 there was some discussion about `props` which get serialized to the island. It could make sense to encrypt them to prevent mistakening leaking secrets. How/if this can be done hasn't been determined yet.

