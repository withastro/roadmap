Start Date: 2024-05-01

- Reference Issues: https://github.com/withastro/roadmap/issues/898
- Implementation PR: https://github.com/withastro/astro/pull/10858

# Summary

Astro actions make it easy to define and call backend functions with type-safety.

# Example

Define Astro actions in a `src/actions/index.ts` file. Create a new action with the `defineAction()` utility, specifying a backend `handler` function and type-checked arguments using an `input` schema. All actions are exported from a `server` object:

```ts
import { defineAction, z } from "astro:actions";

export const server = {
  like: defineAction({
    // accept json
    input: z.object({ postId: z.string() }),
    handler: async ({ postId }, context) => {
      // update likes in db

      return likes;
    },
  }),
  comment: defineAction({
    // accept form requests
    accept: "form",
    input: z.object({
      postId: z.string(),
      author: z.string(),
      body: z.string(),
    }),
    handler: async ({ postId }, context) => {
      // insert comments in db

      return comment;
    },
  }),
};
```

Then, call an action from your client components using the `actions` object from `astro:actions`. You can pass a type-safe object when using JSON, or a `FormData` object when using `accept: 'form'` in your action definition:

```tsx
// src/components/blog.tsx
import { actions } from "astro:actions";
import { useState } from "preact/hooks";

export function Like({ postId }: { postId: string }) {
  const [likes, setLikes] = useState(0);
  return (
    <button
      onClick={async () => {
        const newLikes = await actions.like({ postId });
        setLikes(newLikes);
      }}
    >
      {likes} likes
    </button>
  );
}

export function Comment({ postId }: { postId: string }) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const result = await actions.blog.comment(formData);
        // handle result
      }}
    >
      <input type="hidden" name="postId" value={postId} />
      <label for="author">Author</label>
      <input id="author" type="text" name="author" />
      <textarea rows={10} name="body"></textarea>
      <button type="submit">Post</button>
    </form>
  );
}
```

# Background & Motivation

Form submissions are a core building block of the web that Astro has yet to form an opinion on (pun intended).

So far, Astro has been rewarded for waiting on the platform and the Astro community to mature before designing a primitive. By waiting on view transitions, we found a SPA-like routing solution grounded in native APIs. By waiting on libSQL, we found a data storage solution for content sites and apps alike. Now, we've waited on other major frameworks to forge new paths with form actions. This includes Remix actions, SvelteKit actions, React server actions, and more.

At the same time, Astro just launched its database primitive: Astro DB. This is propelling the Astro community from static content to more dynamic use cases, including like counters and comment widgets. To meet our community where it's heading, Astro needs to make backend functions simple.

# Goals

- **You no longer need boilerplate to safely parse the request body** based on the `Content-Type`.
- **You can pass JSON or FormData payloads to an action.**
- **You no longer need boilerplate to retrieve form data values** from the request body. The action should be able to enumerate expected input names, and the handler should be able to retrieve these values without a type cast. In other words, no more bangs `!` or `as string` casts as in the example `formData.get('expected')! as string`.
- **You can call an action using a standard HTML `form` element**.
- **You can use client JavaScript to call an action** using scripts or islands. When doing so, data returned by the action is type-safe without type casting. Note: This should consider form handling in popular component frameworks, like the [`useActionState()`](https://react.dev/reference/react-dom/hooks/useFormState) and [`useFormStatus()`](https://react.dev/reference/react-dom/hooks/useFormStatus) hooks in React 19.
- **You can declare actions as an endpoint** to call from prerendered / static pages.

# Non-Goals

- **A solution to client-side validation.** Validation is a major piece to forms with several community libraries to choose from (ex. react-hook-form). Astro may recommend standard HTML attributes for client validation including the `required` and `type` properties on an input.
- Declaring actions within `.astro` frontmatter. Frontmatter forms a function closure, which can lead to misuse of variables within an action handler. This challenge is shared by `getStaticPaths()` and it would be best to avoid repeating this pattern in future APIs.

# Detailed Design

All actions are declared in a global actions handler: the `src/actions.ts` file. Similar to Astro middleware, users may switch to using `src/actions/index.ts` to store related code in a directory.

You can define an action using the `defineAction()` utility from the `astro:actions` module. This accepts the `handler` property to define your server-side request handler. If your action accepts arguments, apply the `schema` property to validate parameters with Zod.

This example defines a `like` action, which accepts a `postId` as a string and updates the like count on a related database entry. That action is exposed for use in your application with an exported `server` object passing `like` as a property:

```ts
// src/actions/index.ts
import { defineAction, z } from "astro:actions";
import { db, Likes, eq, sql } from "astro:db";

export const server = {
  like: defineAction({
    input: z.object({ postId: z.string() }),
    handler: async ({ postid }) => {
      const { likes } = await db
        .update(Likes)
        .set({
          likes: sql`likes + 1`,
        })
        .where(eq(Likes.postId, postId))
        .returning()
        .get();
      return likes;
    },
  }),
};
```

Now, this action is callable from client components and server forms.

> **@bholmesdev Note:** Users will call actions by importing an `actions` object from the `astro:actions` virtual module. To avoid misleading auto-import suggestions, we use the name `server` instead of `actions` for server code.

### Call actions from a client component

To call an action from a client component, you can import the `actions` object from `astro:actions`. This will include `like()` as a function, which accepts type-safe arguments as a JSON object.

Implementation: When imported on the client, the `actions` object will _not_ expose server code. It will instead expose a proxy object that calls a given action using a `fetch()` call. The object path will mirror the request URL that is fetched. For example, a call to `actions.like()` will generate a fetch to the URL `/_actions/like`. For nested objects like `actions.blog.like()`, dot chaining is used: `/_actions/blog.like`. The request is routed to your action using an injected handler at `/_actions/[...path]`.

This example uses Preact to call the action on a button press and tracks the current likes with `useState()`:

```tsx
// src/components/Like.tsx
import { actions } from "astro:actions";
import { useState } from "preact/hooks";

export function Like({ postId }: { postId: string }) {
  const [likes, setLikes] = useState(0);
  return (
    <button
      onClick={async () => {
        const newLikes = await actions.like({ postId });
        setLikes(newLikes);
      }}
    >
      {likes} likes
    </button>
  );
}
```

## Handle form requests

Actions are callable with JSON objects by default. For more extensive forms, you may prefer to submit fields using [the web-standard FormData object](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects). This object includes all `input` element values within a given `form`, and is the default argument using form actions in React 19.

To accept form data from an action, define a new action with the `accept` property set to `'form'`. You can validate the action `input` using the same Zod `object()` function you would use for a JSON action. In this example, we will create a `comment` action that expects a `postId`, `author`, and `body` as string fields on a form:

```ts
// src/actions/index.ts
import { defineAction, z } from "astro:actions";

export const server = {
  comment: defineAction({
    accept: "form",
    input: z.object({
      postId: z.string(),
      author: z.string().optional(),
      body: z.string(),
    }),
    handler: async ({ postId, author, body }) => {
      // persist comment in a database
    },
  }),
};
```

You can also handle an untyped `FormData` object by setting the `input` to `z.instanceof(FormData)`.

See the [Form API complete reference](#form-api-complete-reference) for all Zod validators we want to support. 

### Call actions with form data from a client component

You can call an action with `FormData` using a client component. This example uses a Preact component with a form `onSubmit` function to create a new `FormData` object. The form includes input names that match the expected properties of our `comment` action, with a hidden input for `postId`, a text input for `author`, and a `textarea` for a long-form `body`:

```tsx
import { actions } from "astro:actions";

// src/components/Comment.tsx
export function Comment({ postId }: { postId: string }) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const result = await actions.blog.comment(formData);
        // handle result
      }}
    >
      <input type="hidden" name="postId" value={postId} />
      <label for="author">Author</label>
      <input id="author" type="text" name="author" />
      <textarea rows={10} name="body"></textarea>
      <button type="submit">Post</button>
    </form>
  );
}
```

### Add progressive enhancement with fallbacks

> Note: You will need server-rendering for progressive fallbacks. Be sure to [opt out of prerendering](https://docs.astro.build/en/guides/server-side-rendering/#opting-out-of-pre-rendering-in-hybrid-mode) on the page containing a progressively enhanced form.

Actions work well when client JavaScript is enabled. However, you may see unexpected behavior when a form is submitted _before_ your component's JavaScript loads. This is common on slow internet connections or older devices. To offer a fallback experience, you can add a progressive fallback to your form.

To add a fallback, add the `method="POST"` property to your `<form>` element. Then, call the `getNameProps()` function from `astro:actions` with the action you want to use (ex. `getNameProps(actions.comment)`). Spread the result onto an `input` within your form to apply metadata for Astro to handle the request:

```tsx
import { actions, getNameProps } from 'astro:actions';

// src/components/Comment.jsx
export function Comment({ postId }: { postId: string }) {
	return (
		<form method="POST" onSubmit={...}>
			<input {...getNameProps(actions.comment)} />
			{/* result:
			<input
				type="hidden"
				name="_astroAction"
				value="/_actions/comment" />
			*/}
		</form>
	)
}
```

Implementation: The `getNameProps()` function returns hidden input attributes to tell Astro which action should handle the request. Using middleware, Astro will intercept incoming requests with a form data `Content-type`. The form data is parsed to check for the `_astroAction` field and call the appropriate action.

### Handle an action result on the server

When using a progressive fallback, you can get the result of an action from your Astro frontmatter. Call `Astro.getActionResult()` with the action you want (ex. `Astro.getActionResult(actions.comment)`). This will return type-safe data when a matching POST request is received and `undefined` otherwise.

```astro
---
import { actions } from 'astro:actions';

const comment = Astro.getActionResult(actions.comment);
---

{comment && (
	<article class="new-comment">
		{/* ... */}
	</article>
)}
```

## Handle errors

Actions can raise exceptions for any number of reasons: an invalid input, an unauthorized request, a missing resource, etc. By default, these errors will `throw` wherever your action is called.

To handle errors in your code without using a `try / catch`, you can chain the `.safe()` function onto your existing actions. This will change the return type to either a `data` object with the result, or an `error` object with the exception.

You can call `.safe()` from a client component to handle `data` and `error`:

```tsx
// src/components/Like.tsx
import { actions } from 'astro:actions';

export function Like() {
	return (
		<button onClick={async () => {
			const { data, error } = await actions.like.safe({ postId });
			if (data) // set state
			// otherwise, handle the error
		}}>
			{likes} likes
		</button>
	)487918
}
```

You can also use `.safe` when getting the action result from your Astro frontmatter. Add `.safe` to the end of your action when passing to `Astro.getActionResult()`:

```astro
---
import { actions } from 'astro:actions';

const { data, error } = Astro.getActionResult(actions.like.safe);
if (data) // handle result
// otherwise, show an error message
---
```

### Input validation errors

Your `input` schema gives you type safety wherever you call your action. Still, you may have further refinements in your Zod schema that can raise a validation error at runtime.

You can check if an `error` is caused by input validation by using the `isInputError()` function. This will return a [Zod error](https://zod.dev/?id=error-handling) with utilities to format error messages. To parse form input errors by name, use the `.formErrors.fieldErrors` property. This example shows an error message if a comment's `body` field is invalid:

```tsx
// src/components/Comment.tsx
import { actions, isInputError } from "astro:actions";
import { useState } from "preact/hooks";

export function Comment({ postId }: { postId: string }) {
  const [bodyError, setBodyError] = useState(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const { error } = await actions.blog.comment.safe(formData);
        if (error && isInputError(error)) {
          setBodyError(error.formErrors.fieldErrors.body);
        }
        // handle result
      }}
    >
      <textarea rows={10} name="body"></textarea>
      {bodyError && <p class="error">{bodyError}</p>}
      <button type="submit">Post</button>
    </form>
  );
}
```

## Custom errors

You may need to raise an exception from your action `handler()`. For this, `astro:actions` provides an `ActionError` object. This includes a `code` to set a human-readable status code like `'BAD_REQUEST'` or `'FORBIDDEN'`. These match the codes supplied by the [tRPC error object.](https://trpc.io/docs/server/error-handling) `ActionError` also includes an optional `message` property to pass information about the error.

This example creates an `updateUsername` action, and raises an `ActionError` with the code `NOT_FOUND` when a given user ID is not found:

```ts
import { defineAction, ActionError } from "astro:actions";
import { db, User, eq } from "astro:db";

export const server = {
  updateUsername: defineAction({
    input: z.object({ id: z.string(), name }),
    handler: async ({ id, name }) => {
      const result = await db.update(User).set({ name }).where(eq(User.id, id));
      if (result.rowsAffected === 0) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: `User with id ${id} not found.`,
        });
      }
      return id;
    },
  }),
};
```

To handle this error, you can call your action using the `.safe()` extension and check whether an `error` is present. This property will be of type `ActionError`.

## Access API context

You can access the Astro API context from the second argument in your action `handler()`. This grants access to the base `request` object, cookies, middleware `locals` and more.

This example gates `getUser()` requests by checking for a session cookie. If the user is unauthorized, you can raise a "bad request" error for the client to handle.

```ts
// src/actions/index.ts
import { defineAction, ActionError, z } from "astro:actions";
import { db, Comment, Likes, eq, sql } from "astro:db";

export const server = {
  getUsers: defineAction({
    handler: async (_, context) => {
      if (!context.cookies.has('expected-session')) {
        throw new ActionError({
          code: "UNAUTHORIZED",
        });
      }
      // return users
    },
  }),
};
```

## Integration actions

Astro integrations can inject routes and middleware. We'd like to expand this pattern for actions as well.

To inject an action, integrations can use the `injectAction()` utility on the `astro:config:setup` hook. This accepts an `entrypoint` with the path to your action handler. Use a relative path for local integrations, or the package export name (ex. `@my-integration/comments/entrypoint`) for integrations installed as a package.

If you are creating an npm package, apply the `astro/client` types reference to an `env.d.ts` in your project. This will define types for the `astro:actions` module:

```ts
// my-integration/src/env.d.ts

/// <reference types="astro/client />
```

Your entrypoint should define and export actions the same way as user actions. We also recommend wrapping actions with a named object to avoid conflicts with user actions. This example defines the entrypoint of a "comments" integration nested within a `comments` object:

```ts
import { defineAction, z } from "astro:actions";

export const server = {
  comments: {
    create: defineAction({
      input: z.object({
        /* ... */
      }),
      handler: () => {
        /* ... */
      },
    }),
  },
};
```

There are still unanswered questions concerning action types and namespacing. See "unanswered questions" at the end for discussion.

# Form API complete reference

You can use a Zod object to validate form requests when using `accept: 'form'`. The standard `FormData` object exposes form values as strings using `.get()`. Astro actions allow further parsing to booleans or numbers, and unlocks Zod refinement functions like `email()` or `regex()`.

The following validation functions are supported:
```ts
// src/actions/index.ts
import { defineAction, formData, z } from 'astro:actions/config';
import { db, Comment, Likes, eq, sql } from 'astro:db';

export default {
	like: defineAction({
		input: z.object({
			// Parse as a string
			name: z.string().optional(),
			// Parse with further string validation like `email`
			email: z.string().email(),
			// Parse as a number
			quantity: z.number(),
			// Parse as a boolean.
			// Checks if the property is present
			// using formData.has()
			newsletterOptIn: z.boolean(),
			// Parse as a file upload.
			// pairs with inputs of `type="file"`
			avatar: z.instanceof(File),
			// Parse as an array of fields.
			// Gets all inputs of the same `name`
			// using formData.getAll()
			contacts: z.array(z.string().optional()),
		}),
		handler: async (data) => {...}
	}),
});
```

# Testing Strategy

- Integration tests calling an action from popular client component frameworks. Namely React 19 form actions and Preact submit handlers.
- Integrations tests for progressive fallback middleware.
- Unit tests for input validation for JSON and form inputs.

# Drawbacks

- Endpoints already exists. To reduce complexity, we could provide utility functions to existing REST calls instead of building a new convention. The reasons we pursued actions despite this drawback: it's convenient to declare multiple actions in one file, actions enable end-to-end type safety with the client _and_ go-to definition in your editor. A plain `fetch()` call cannot provide this complete experience.
- We could avoid the Zod validation piece entirely, and provide the raw request body for users to bring their own validation solutions. However, doing so would reintroduce boilerplate for FormData parsing and JSON validation. This is a common problem across the Astro community, so it feels right to solve with a first party solution. As an escape hatch, the `APIContext` object is available to parse the request and validate manually.
- We could restrict actions to be JSON-only to avoid the complexity of form parsing. This is tRPC's solution that scales well to React SPAs. However, it seems the industry is moving to embrace FormData. For instance, React 19 form actions pass the FormData object to actions by default. JSON-only would also block progressively enhanced forms, since the browser _must_ send a form payload in a zero-JS scenario.

# Alternatives

## Alternative places to declare an action

Before deciding on a `src/actions/` convention, we considered a few different places to declare actions:

1. **In the `.astro` component itself.** We explored this early on since it felt the most streamlined. It was also proposed [in a separate roadmap discussion](https://github.com/withastro/roadmap/discussions/490) by core member @matthewp. However, we quickly saw the limitations of `export`-ing from Astro frontmatter. Frontmatter creates a function closure, which can lead to misuse of variables within an action handler. This challenge is shared by `getStaticPaths()` and it would be best to avoid repeating this pattern in future APIs.
2. **In a TypeScript file of the same name as your page.** For instance, a `page.ts` file alongside a `page.astro` file. This follows SvelteKit's convention of "look-behind files" and addresses our frontmatter closure problem. However, using this convention would lock your `.astro` route into dynamic rendering, which forces refactors onto the developer. [See this comment](https://github.com/withastro/roadmap/issues/898#issuecomment-2062627485) for some more complete thoughts.
3. **In a separate endpoint file using an `actions` export.** For instance, a `src/pages/api.ts` file. This allows similar colocation with routes to (2) while keeping dynamic handlers separate from static content. This solution may let you switch from REST exports like `POST` to a single `actions` export containing one or several handlers:

```ts
// src/pages/blog/api.ts

export const actions = {
  like: defineAction(...),
}
```

We admittedly *wanted* to like (3), since users value colocation with Astro pages. However, we quickly found ourselves centralizing actions to a `src/pages/api.ts` or some equivalent, which wasn't much different from a `src/actions/index.ts`.

It was also helpful to interrogate what colocation really means. When working on Astro Studio, we didn't colocate backend handlers with presentational UI in `pages/`; we organized our API by _domain models_ in our database. Using tRPC, we built nested routers for `User`, `Project`, `Workspace`, and a few other concepts like so:

```ts
// src/procedures/trpc.ts
app({
  user: userRouter, // from ./users.ts
  github: githubRouter, // from ./github.ts
  project: projectRouter, // from ./projects/.ts
});

// in the Studio app
trpc.user.auth();
trpc.github.createTemplate();
trpc.project.create();
```

This pattern mirrors REST-ful APIs: keep business logic close to the data, not the presentation. We brought this philosophy to the actions API as well.

## Alternative ways to call an action

Related to our alternatives for defining actions, we found alternative ways to call an action.

### Type-safe fetch

One option used a type-safe `fetch()` helper to autocomplete available routes in your project and infer the return type. This is similar to [Nuxt's `useFetch()` utility](https://nuxt.com/docs/getting-started/data-fetching#usefetch)

```ts
// src/pages/blog/like.ts
import { defineAction, z } from "astro:action";

export const action = defineAction({
  input: z.object({ postId: z.string() }),
  handler: async ({ postId }) => {
    // write to DB
    return likes;
  },
});
```

Then, from application code:

```tsx
import { safeFetch } from "astro:action";

export async function Comment() {
  return (
    <button
      onClick={async () => {
        const likes = await safeFetch("/blog/like");
        // ^ number
      }}
    >
      ...
    </button>
  );
}
```

This came with two potential issues:

- No go-to-definition in your editor. This is a win for tRPC and React server actions we would like to mirror.
- Limited to one action per file. This grows tedious for a series of related actions on a single database model (`getProject()`, `addProject()`, `setProjectStatus()`...)

### Server actions

Another option would mirror React server actions. Instead of masking behind an `astro:actions` module, you could declare and call actions with direct imports into your client code. This would require some way to signal to the bundler that the action should be handled safely when imported on the client.

One option is a special naming convention for action files. For example, declaring action files with a `[name].action.ts` extension.

Another is a bundler pragma like `"use server"` or an import attribute like `as { type: 'action' }`. This comes at a cost: **Forgetting the decorator means server code will be bundled into the client.** This is a severe punishment for forgetting a bundler flag. What's more, it's hard for a bundler to warn when a user forgets this flag. Server actions could be declared in any file, and a server action without `"use server"` is just... a function. For safety, users must [ruthlessly flag server-only code](https://nextjs.org/blog/security-nextjs-server-components-actions), and frameworks must blacklist common server modules like `astro:db` NodeJS libraries.

In the end, concerns with learning curve and bundler rules pushed us away from server actions. We may revisit compatibility as the React server action ecosystem grows.

## Alternative to progressive fallbacks

We implemented progressive fallbacks using middleware to intercept form requests. As an alternative, we considered adding a fallback handler on the `defineAction()` definition.

From the caller, you could apply the action directly to your form `action` property instead of a hidden input. The action's `.toString()` property would output the API path as `/_actions/[name]`:

```ts
import { actions } from "astro:actions";

export function Comment() {
  return (
    <form method="POST" action={actions.comment}>
      {/*...*/}
    </form>
  );
}
```

By default, the action would handle the POST payload and redirect back to the referring page using the `Referer` header. To define custom handling for success or error cases, you could add `onSuccess()` and `onError()` functions to your action definition:

```ts
import { defineAction, z } from "astro:actions";

export const server = {
  comment: defineAction({
    input: z.object({
      /*...*/
    }),
    handler: () => {
      /*...*/
    },
    onSuccess({ output, redirect, referer }) {
      return redirect(`/some/other/page?comment=${output.comment}`);
    },
    onError({ error, redirect, referer }) {
      const url = new URL(referer);
      url.searchParams.add("error", JSON.stringify(error));
    },
  }),
};
```

This approach has one major benefit over our current design: **the page containing a form does _not_ need to be server rendered.** The form `action` redirects to your server endpoint, which may redirect back to prerendered routes.

However, the solutions has a few cons that outweigh this benefit:

- Results are no longer type-safe. Instead, you must encode errors as URL search params and parse on the redirected page. This requires type casting for validation errors to infer a Zod payload. It also adds a restriction on payload size based on the max URL length.
- Users could not set fallbacks for actions injected by integrations. Since `onSuccess` and `onError` are tied to the action, it would be tough for integrations to embed custom logic. They would likely need a contract on how search params are encoded, and provide helper functions to read these search params from Astro pages.

We may introduce a hybrid of approaches in the future: Keep middleware-based handling to cover the widest set of use cases, and add an `onSuccess()` handler if needed for static site redirects.

# Adoption strategy

- Release with an `experimental` flag in the next minor version.
- Baseline as a stable feature after at least 2 weeks of user feedback.
  
To ensure this change is nonbreaking, we must respect users with their own `src/actions/` directory. We can likely add a special `Symbol` to the `defineAction` utility to detect when users are using Astro actions. If not, safely ignore the directory.

# Unresolved Questions

There are unresolved questions for injecting actions from an integration:

1. How are `astro:actions` types updated to include integration actions? And how can these updated types be used in an integration package for testing?
2. What is the best story for namespace conflicts? We can match the status quo set by Astro DB tables: error if a user defines a conflicting name, and encourage integration authors to choose specific names to better avoid conflicts. This feels acceptable but incomplete long term. For instance, what if an integration wants to allow _the user_ to define a namespace for the action? How would that configuration be reflected in the package code for an `entrypoint` file? And the types?
