- Start Date: 2022-07-14
- Reference Issues: 
- Implementation PR: [astro#3934](https://github.com/withastro/astro/pull/3934)

# Summary

Adds a "context" available in Astro files during SSR that can be provided from the SSR entrypoint. In template files, this is `Astro.context`, and in API routes, this is the `context` property of the route's parameter.

# Example

## A minimal example

In the client, in an Astro template file:

```astro
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width" />
		<title>Astro</title>
	</head>
	<body>
		<p>Welcome, {Astro.context.user.name}</p>
	</body>
</html>
```

In the client, in an API endpoint:

```typescript
export function get({ params, context }) {
  return context.user.name;
}
```

In the server, using NodeJS SSR adapter:

```typescript
import { createServer } from 'http';

const { handler } = await import('./path-to-entrypoint.mjs');

server = createServer((req, res) => {
  handler(req, res, { user: { name: 'Elvis' } });
});

server.listen();
```

## A bit more realistic example

In the server, using NodeJS SSR adapter:

```typescript
import { createServer } from 'http';
import express from 'express';
import expressSession from 'express-session';
import passport from 'passport';
import { MyStrategy } from 'my-passport-strategy-library';

const app = express();

app.use(expressSession({ secret: 'parsley' }));

passport.use(new MyStrategy());
app.use(passport.initialize());
app.use(passport.session());

const { handler } = await import('./path-to-entrypoint.mjs');

app.use((req, res, next) => {
  handler(req, res, { user: req.user }, next);
});

server.listen();
```

# Motivation

Using the NodeJS SSR adapter, it is already possible to integrate an Astro SSR
website into a server using Express/Koa. The purpose of this change is to make
it possible for state that is already derived by the server (such as
authentication state) to easily be passed from Express/Koa to an Astro template
via `Astro.context`, so that this information does not have to be re-derived
from `Astro.request.headers`. 

This allows users who already have existing infrastructure for deriving session
state from a request to avoid re-implementing it to make it work in Astro
templates, and allows the server to avoid paying the penalty of deriving that
state twice per request.

# Detailed design

We would add a new parameter to the entrypoint exposed by the NodeJS entrypoint.
This parameter is the context, which is available during rendering as
`Astro.context` inside of `.astro` files, and as the `context` property on the
argument given to API routes. This `context` can be anything, or
`null`/`undefined` if it is not used. It is `null` when page is not being served
using SSR, or when the page is being served through an SSR integration other
than the NodeJS integration.

This requires modifying the NodeJS adapter to have a compatible function
signature, plumbing the `context` value through the SSR stack, and exposing it
on the `Astro` faux-global. At the time of writing, a possible implementation is
available in [astro#3934](https://github.com/withastro/astro/pull/3934).

# Drawbacks

This change, as described, would only be usable via the NodeJS adapter. Further
work would be required to bring feature parity to the other SSR adapters.

# Alternatives

No other designs have been considered, because I do not have any other ideas. If
this change is not made, then it will be more difficult to use Astro's SSR
features effectively in a comprehensive web application, because it will be hard
to access much of the state of the request during rendering.

# Adoption strategy

As implemented in [astro#3934](https://github.com/withastro/astro/pull/3934),
this is a breaking change because it changes the signature of the NodeJS
entrypoint. It is possible that the `context` parameter could be made the last
parameter in order to avoid this, but I preferred to uphold the NodeJS
convention of having a callback be the last parameter.

Given that the SSR API is still considered experimental and that users are
advised to pin their version of Astro, this would not be considered a breaking
change to Astro overall.

# Unresolved questions

Still to be determined:
- `context` is a vague name; may be appropriate considering it can contain any
  information the end-user desires, but it is possible that more specific names
  may be better
- `context` is currently just set to `null` when it is not provided by an
  adapter; may be appropriate to throw an exception when it is accessed
  improperly instead
