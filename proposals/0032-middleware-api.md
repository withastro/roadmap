<!--
  Note: You are probably looking for `stage-1--discussion-template.md`!
  This template is reserved for anyone championing an already-approved proposal.

  Community members who would like to propose an idea or feature should begin
  by creating a GitHub Discussion. See the repo README.md for more info.

  To use this template: create a new, empty file in the repo under `proposals/${ID}.md`.
  Replace `${ID}` with the official accepted proposal ID, found in the GitHub Issue
  of the accepted proposal.
-->

- Start Date: 
- Reference Issues: 
  - https://github.com/withastro/roadmap/issues/531
- Implementation PR: https://github.com/withastro/astro/pull/6721

# Summary

Introduce a middleware to Astro, where you can define code that runs on every request. 
This API should work regardless of the rendering mode (SSG or SSR) or adapter used. 
Also introduces a simple way to share request-specific data between proposed middleware, 
API routes, and `.astro` routes.

# Example

The middleware pattern is useful to read `Request` and manipulate the `Response`, other than
set and share information across endpoints and pages.


For example, here's an example of how a user can share some information across routes:
```js
export const onRequest = (context, next) => {
    if (!context.request.url.endsWith("/")) {
        context.locals.isIndex = false;
    } else {
        context.locals.isIndex = true;
    }
}
```

Or, set some logic to make redirects:
```js
const redirects = new Map([
    ["/old-1", "/new-1"],
    ["/old-1", "/new-1"]
])

export const onRequest = (context, next) => {
    for (const [oldRoute, newRoute] of redirects) {
        if (context.request.url.endsWith(oldRoute)) {
            return context.redirect(newRoute, 302);
        }
    }
}
```

# Background & Motivation

Middleware has been one of the most heavily requested feature in Astro. 
It's useful for handling common tasks like auth guards and setting cache headers. 

For me, it would make handling authentication much easier.


# Goals

- Provide a way intercept requests and responses, allowing users to set cookies and headers
- Works both in SSR and SSG mode
- Allow users to use community-created middlewares (libraries)


# Out of Scope

This is a list of requirements that won't be implemented as part of this RFC but 
will be implemented in the second iteration of the middleware project:

- Non-Node runtimes specific APIs. ie. Cloudflare Durable Objects.
- Add middleware from adapter.
- Type-safe payload. Being able infer types from the previous middleware.

# Non-Goals

- Route specific middleware, middlewares that are run **only on specific** routes



# Detailed Design

## Changes from the Stage 2 proposal

- `resolve` has been renamed to `next`;
- `next` doesn't accept an `APIContext` to work;
- `locals` values need to be serializable to avoid the introduction of
  non-user code from third-party libraries that can run scripts;
- `middleware` export function has been renamed `onRequest`. This name change
  has two benefits:
  1. It shows intent and explains when this function is called;
  2. It allows adding more functions with the `on*` prefix in the future, which could show the intent
     of when the function is called in the Astro route life cycle;

## Implementation instructions

To define a middleware, a user must create a physical file under the [`config.srcDir`](https://docs.astro.build/en/reference/configuration-reference/#srcdir) 
folder, called `middleware.js`.

The resolution of the file follows the ECMA standards, which means that the following
alternatives are all valid in Astro:
- `src/middleware.js`
- `src/middleware.ts`
- `src/middleware/index.js`
- `src/middleware/index.ts`

The file **must export** a function called `onRequest`. The exported function
_must not be a **default** export_.

Eventually, the file system of the `src/` folder will look like this:

```
src
├── env.d.ts
├── middleware
│   └── index.ts
└── pages
    ├── first.astro
    ├── index.astro
    └── second.astro
```

Every time a page or endpoint is about to be rendered, the middleware is called.

A middleware will look like this in TypeScript:

```ts
import { MiddlewareRequestHandler, APIContext, MiddlewareNextResponse } from "astro"

const onRequest: MiddlewareRequestHandler = async (context: APIContext, next: MiddlewareNextResponse) => {
    const { locals, request } = context;
    // access to the request
    if (request.url.endsWith("/old-url")) {
        return new Response("body", {
            status: 200
        })
    }   
    locals.user = {};
}

export { onRequest }
```

Alternatively, a user can use the utility API to type the middleware:

```ts
import {defineMiddleware} from "astro/middleware";


const onRequest = defineMiddlware(async (context, next) => {
    
});
```

The `locals` object is a new API introduced by this RFC. The `locals` object is a new
Astro global object that can be manipulated inside the middleware, and then it can be
accessed inside any `.astro` file:

```astro
---
const user = Astro.locals.user;
---

<div>
  <p>{user.handle}</p>
</div>

```

The RFC provides a way to make `locals` typed. The implementation will leverage the existing
mechanism to type `Props`. The user will change the file `env.d.ts` and add the
following code:

```ts
/// <reference types="astro/client" />

interface Locals {
    user: {
        handle: string
    }
}
```

By doing so, the user can leverage the type-checking and auto-completion of TypeScript inside a file
called `middleware.ts` or `middleware.js` using JSDoc.


The `locals` object has the following restrictions:
1. it can store only serializable information;
2. it can't be overridden by other values that are different from objects;

## `locals` needs to be serializable

The information must be serializable because storing
information that evaluates at runtime is unsafe. If, for example, we were able to store
With a JavaScript function, an attacker could exploit the victim's website
and execute some unsafe code.

Astro will do a sanity check **in development mode**.
Some code like this:

```js
export const onRequest = (contex, next) => {
    context.locals.someInfo = {
        f() {
            alert("Hello!!")
        }
    }
} 
```

Storing unsafe information will result in an Astro error:

> The information stored in Astro.locals are not serializable when visiting "/index" path.
Make sure you store only serializable data.

> **Note**: The content of the error is not final. The docs team will review it.


## `locals` can't be overridden

The value of `locals` needs to be an object, and it can't be overridden at runtime. Doing
so would risk wiping out all the information stored by the user.

So, if there's some code like this:

```js
export const onRequest = (contex, next) => {
    context.locals = 111;
} 
```

Astro will emit an error like this:

> The locals can only be assigned to an object. Other values like numbers, strings, etc. are not accepted.

> **Note**: The content of the error is not final. The docs team will review it.

### `context` and `next`

When defining a middleware, the function accepts two arguments: `context` and `next`

The `next` function is widely used in the middleware pattern. With the `next`
function, a user can retrieve the `Response` of a request.

Reading a response is very useful in case; for example, a user needs to modify the HTML (the body) of the
response.

Another usage of the `next` function is to call the "next" middleware.

Calling the `next` function is not mandatory, and there are various reasons not to.
For example, a user might not need it, or they might want to stop the chain of middleware
in case some validation fails.

The next section will explain in more detail how `next` function can be used and how
a user can have multiple middlewares.

## Multiple middlewares

The RFC proposes a new API to combine multiple middleware into one. The new API
is available via the new `astro/middleware` module. The new API is called `sequence`.

Following is an example of how a user can combine more than one middleware:

```js
import {sequence} from "astro/middleware";

function validation() {}
function auth() {}

export const onRequest = sequence(validation, auth);
```
When working with many middlewares, it's important to understand the execution order.

Let's take the following code:

```js
import {sequence} from "astro/middleware";

async function validation(_, next) {
    console.log("validation request");
    const response = await next();
    console.log("validation response");
    return response;
}
async function auth(_, next) {
  console.log("auth request");
  const response = await next();
  console.log("auth response");
  return response;

}
async function greeting(_, next) {
  console.log("greeting request");
  const response = await next();
  console.log("greeting response");
  return response;

}

export const onRequest = sequence(validation, auth, greeting);
```
This will result in the following console order:

```
validation request
auth request
greeting request
greeting response
auth response
validation response
```

When working with multiple middleware, a middleware will always get the context of the previous
middleware, from left to right. When the response resolves, then
this response will travel from right to left.

```block
              Context/Request           Context/Request
validation --------------------> auth --------------------> greeting 


                ===> Then the response is created <===
                

                   Response                  Response
greeting ----------------------> auth --------------------> validation
```

Eventually, `validation` will be the **last** middleware to get the `Response` before being
handled to Astro and rendered by the browser.

## Middleware workflow and examples

Following some use cases with some examples to understand how the middleware work and
the expectation from the user's point of view.

### Redirects

It's an example provided before, but it's worth showing it again:

```js
const redirects = new Map([
    ["/old-1", "/new-1"],
    ["/old-2", "/new-2"]
])

export const onRequest = (context, next) => {
    for (const [oldRoute, newRoute] of redirects) {
        if (context.request.url.endsWith(oldRoute)) {
            return context.redirect(newRoute);
        }
    }
}
```

### HTML manipulation

An example, could the to **redact** some sensible information from the HTML being emitted:

```js
export const onRequest = async (context, next) => {
   const response = await next();
   const html = response.text();
   const redactedHtml = html.replace("PRIVATE INFO", "REDACTED");
   
   return new Response(redactedHtml, {
     status: 200,
     headers: response.headers
   });
}
```

### Validation and authentication

```ts
import { sequence } from "astro/middleware";
import type { 
  MiddlewareResponseHandler, 
  MiddlewareNextResponse, 
  APIContext 
} from "astro";
import { doAuth } from "some-auth-library";


const validation: MiddlewareResponseHandler = async ({ request, locals }: APIContext, next: MiddlewareNextResponse) => {
    const formData = await request.formData();
    const userName = formData.get("username");
    const password = formData.get("password");
    // important information exist, let's continue to auth
    if (typeof userName !== "undefined" && typeof userName !== "undefined") {
        return await next();
    } else {
        // We don't call `next`. Doing the `auth` function is not executed.
        // We store some information in `locals` so the UI can show an error message.
        locals.validationMessage = "Important information are missing";
    }
}

const auth: MiddlewareResponseHandler = async ({ request, redirect }: APIContext, next: MiddlewareNextResponse) => {
  // The user expectation is that `validation` was already executed (check `sequence`).
  // This means we don't need to check if `userName` or `password` exit.
  // If they don't exist, it's an user error.
  const formData = await request.formData();
  const userName = formData.get("username");
  const password = formData.get("password");
  
  // We run the authentication using a third-party service
  const result = await doAuth({ userName, password });
  if (result.status === "SUCCESS") {
      return redirect("/secure-area");
  } else {
    locals.validationMessage = "User name and/or password are invalid";
  }
}


export const onRequest = sequence(validation, auth);
```

It's important to note that `locals` is an object that **lives and dies within a single Astro route**;
when your route page is rendered, `locals` won't exist anymore and a new one
will be created.

If a user needs to persist some information that lives among multiple pages
requests, they will need to store that information somewhere else.

## Restrictions and expectations

In order to set user expectations, the Astro middleware have the following restrictions:
- a middleware needs to return a `Response`;
- a middleware needs to call `next`;

If the user doesn't do any of these two, Astro will throw an error. Plus,
the user is required to return exactly a `Response`. Failing to do so will result in
Astro throwing an error.

# Testing Strategy

This feature requires integration tests. We need to have tests for  
multiple scenarios:
- development server;
- static build;
- SSR build;
- adapters (Node.js, deno, Cloudflare, etc.);

# Drawbacks

The RFC doesn't break any existing code. It's an additional feature that should
not break the existing behaviour of an Astro application.

Even though the middleware pattern is widely spread among backend frameworks, it's not
always easy to explain how the pattern works and the user expectations.

I would expect some reports about "why my code doesn't work" and find out that
the issue was around the user code.

This feature will unlock new patterns inside an Astro application, and I would expect more work from the Documentation Team
to frame the "most-used recipes" around the usage of middleware.

Due to Astro code base architecture, the implementation of the feature will have to happen in
three different places, risking having duplicated code or missing logic.

# Alternatives

I have considered implementing middleware using the configuration API.

While this strategy is well-established in the Astro ecosystem, it could slow down
the implementation of middleware logic in user-land because the user would be forced
to create some boilerplate just to use the new logic.

While Astro could have provided some API to reduce the boilerplate, this felt tedious. 
Plus, this would have forced us to **crate another configuration field** where the user
could specify the order of the middleware.


# Adoption strategy

Considering how big the feature is, the API will be released under an experimental flag.

Users can opt in via new flag:

```js
export default defineConfig({
  experimental: {
      middleware: true
  }
})
```

Plus, a user can enable this experimental feature via CLI using a 
new argument called `--experimental-middleware`.

The team will seek feedback from the community and fix bugs if they arise.  
After an arbitrary about of time, the experimental flag will be removed.
