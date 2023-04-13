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
    ["/old_1", "/new_1"],
    ["/old_1", "/new_1"]
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
  - Make available via integrations API.
- Provide an API for request-specific data
- Non-Node runtimes specific APIs. ie. Cloudflare Durable Objects.
  - Add middleware from adapter.

# Non-Goals

- Route specific middleware, middlewares that are run **only on specific** routes

# Detailed Design

To define a middleware, a user would need to create a physical file under the `src/` folder, called `middleware.js`.

The resolution of the file follow the ECMA standards, which means that the following 
alternatives are all valid in Astro:
- `src/middleware.js`
- `src/middleware.ts`
- `src/middleware/index.js`
- `src/middleware/index.ts`

The file **must export** a function called `onRequest`. The exported function
_must not be a **default** export_. 

> **Note**: this part of the proposal differs from the [Stage 2](https://github.com/withastro/roadmap/issues/531) proposal. Read the 
> [drawback section](#default-export) to understand why.

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

A middleware will look like this, in TypeScript:

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

The `locals` object is a new API introduced by this RFC. The `locals` object is a new
global object that can be manipulated inside the middleware, and then it can be
accessed inside any `.astro` file:

```md
---
const user = Astro.locals.user;
---

<div>
  <p>{user.handle}</p>
</div>

```

The RFC provides a way to make `locals` typed. The implementation will leverage the existing
mechanism in place to type `Props`. The user will change the file `env.d.ts` and add the 
following code:

```ts
declare module "astro" {
  interface Locals {
    user: {
        handle: string
    }
  }
}
```

Doing so, the user will be able to leverage the type-checking and auto-completion of TypeScript inside a file
called `middleware.ts` or `middleware.js` using JSDoc.


The `locals` object has the following restrictions:
1. it can store only serializable information; 
2. it can't be overridden by other values that are different from objects;

## `locals` needs to be serializable

The reason why the information must be serializable is that it's not safe to store
information that can be evaluated at runtime. If, for example, we were able to store
a JavaScript function, an attacker would be able to exploit the victim website
and execute some unsafe code.

In order avoid so, the new code will do a sanity check **in development mode**. 
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
Make sure you store only data that are serializable.

> **Note**: The content of the error is not final. The docs team will review it.  


## `locals` can't be overridden

The value of `locals` needs to be an object, and it can't be overridden at runtime. Doing
so would risk to wipe out all the information stored by the user.

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

The `next` function is a widely used function inside the middleware pattern. With the `next`
function, a user can retrieve the `Response` of a request.

This is very useful in case, for example, a user needs to modify the HTML (the body) of the 
response.

Another usage of the `next` function, is to call the "next" middleware.

A user is not forced to call the `next` function, and there are various reasons to not to. 
For example, a user might not need it, or they might want to stop the chain of middlewares
in case some validation fails.

The next section will explain more in detail how `next` function can be used and how 
a user can have multiple middleware.

## Multiple middlewares

The RFC proposes a new API to combine multiple middlewares into one. The new API
is exposed via the new `astro/middleware` module. The new API is called `sequence`.

Following an example of how a user can combine more than one middleware:

```js
import {sequence} from "astro/middleware";

function validation() {}
function auth() {}

export const onRequest = sequence(validation, auth);
```
When working with many middlewares, it's important to understand the order of 
how the code is executed.

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
Will result in the following console order:

```
validation request
auth request
greeting request
greeting response
auth response
validation response
```

When working with multiple middlewares, a middleware will always get the context of the previous
middleware, from left to right. When the response has been resolved, then
this response will travel from the right to left.

```block
              Context/Request           Context/Request
validation --------------------> auth --------------------> greeting 

Then
                   Response                  Response
validation <-------------------- auth <-------------------- greeting
```

Eventually, `valiation` will be the **last** middleware to get the `Response` before being
handled to Astro and rendered by the browser.

## Middleware workflow and examples



# Testing Strategy

How will this feature's implementation be tested? Explain if this can be tested with
unit tests or integration tests or something else. If relevant, explain the test
cases that will be added to cover all of the ways this feature might be used.

# Drawbacks

## Default export

Why should we _not_ do this? Please consider:

- Implementation cost, both in term of code size and complexity.
- Whether the proposed feature can be implemented in user space.
- Impact on teaching people Astro.
- Integration of this feature with other existing and planned features
- Cost of migrating existing Astro applications (_is it a breaking change?_)

There are tradeoffs to choosing any path. Attempt to identify them here.

# Alternatives

What other designs have been considered? What is the impact of not doing this?

# Adoption strategy

Please consider:

- If we implement this proposal, how will existing Astro developers adopt it?
- Is this a breaking change? Can we write a codemod?
- Can we provide a runtime adapter library for the original API it replaces?
- How will this affect other projects in the Astro ecosystem?

# Unresolved Questions

Optional, but suggested for first drafts.
What parts of the design are still to be determined?
