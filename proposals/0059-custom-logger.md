<!--
  Note: You are probably looking for `stage-1--discussion-template.md`!
  This template is reserved for anyone championing an already-approved proposal.

  Community members who would like to propose an idea or feature should begin
  by creating a GitHub Discussion. See the repo README.md for more info.

  To use this template: create a new, empty file in the repo under `proposals/${ID}.md`.
  Replace `${ID}` with the official accepted proposal ID, found in the GitHub Issue
  of the accepted proposal.
-->

**If you have feedback and the feature is released as experimental, please leave it on the Stage 3 PR. Otherwise,
comment on the Stage 2 issue (links below).**

- Start Date: 2026-04-07
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: https://github.com/withastro/astro/pull/16477
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1335
- Stage 3 PR: https://github.com/withastro/roadmap/pull/1339

# Summary

Add support for configurable log handlers in Astro, allowing users to replace the default console output with custom
logging implementations (e.g. structured JSON).

# Example

Using a built-in handler to get JSON logs:

```js
// astro.config.mjs
import { defineConfig, logHandlers } from "astro/config";

export default defineConfig({
  experimental: {
    logger: logHandlers.json({ 
      pretty: false,
      level: "warn"
    }),
  },
});
```

Using a third-party handler:

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import { pino } from "astro-pino-logger";

export default defineConfig({
  experimental: {
    logger: pino({ destination: "/var/log/app.log" }),
  },
});
```

# Background & Motivation

Users deploying Astro SSR to production need structured logging for integration with log aggregation services like
Kibana, Logstash, CloudWatch, and Grafana/Loki. Agents running builds and dev locally work better with JSON. Today,
Astro's logger is hardcoded – `BaseApp` uses `consoleLogDestination` which cannot be replaced, even by adapter authors.
Error logs in rendering are split across multiple lines and formatted for human reading, making them unparseable by log
aggregation tools.

This is a common requirement for any production SSR deployment and has been widely requested for a long time (this is
currently the most upvoted feature request).

# Goals

- Allow users to configure a custom log handler that receives all Astro log output
- Support structured logging (JSON) for production deployments out of the box
- Provide a `--json` CLI flag for zero-config JSON output (e.g. `astro build --json`, `astro dev --json`, `astro preview --json`)
- Follow the established `{ entrypoint, config }` factory pattern used by session drivers, font providers etc
- Work across all scopes: build, dev, and SSR runtime
- Ensure Vite logs flow through the custom handler (they already route through Astro's logger)

# Non-Goals

- Request-scoped child loggers with correlation IDs
- Replacing the `debug` package integration – separate concern
- Separate handlers per scope (build vs server) – single handler with platform detection if needed
- Redaction capabilities, library authors are responsible for that

# Detailed Design

The proposal is split into three main sub-features, somewhat interconnected internally, but different from the user's point
of view.

- Emit Astro logs using the JSON format.
- Provide users control over the destination of where logs are written, and how.
- A runtime API for custom logs.

The objective is to provide users with powers over the destination of the log, and structured logs. Users will receive
the log message, and they decide where the log is written.

This is also true for Astro's built-in logs.

## JSON logger

Users will be able to change the look and feel of the logs in JSON format in two ways:

CLI via `--json`

```shell
astro dev --json
```

Configuration via the proper handler

```js
import { logHandler } from "astro/config";

export default defineConfig({
  logger: logHandler.json({ 
    pretty: true,
    level: "warn"
  }),
});
```

Eventually, a log like the following will be turned into JSON:

```shell
# now
11:13:51 [content] Syncing content
```

```shell
# json
{ "time": "11:13:51", "label": "content", "message": "Syncing content" }
```

## Customize logger

Users can swap Astro's default logger with their own, however they also become responsible for the printing of Astro's
logs. All of Astro's logs will be redirected
to the logger provided by the user.

```js
import pino from "astro-pino-logger";

export default defineConfig({
  logger: pino({ destination: "/var/log/app.log" }),
});
```

Library authors can use the `AstroLoggerDestination` interface if they need to create custom loggers:

```ts
// astro-pino-logger/src/handler.ts
import type { AstroLoggerMessage, AstroLoggerDestination } from "astro";

interface PinoConfig {
  destination?: string;
  level?: string;
}

const pinoLogger = (config: PinoConfig = {}): AstroLoggerDestination => {
  return {
    write(event: AstroLoggerMessage) {
      pino[event.level]({ label: event.label }, event.message);
    },
    flush() {
      pino.flush();
    },
    close() {
      pino.flush();
      pino.destination?.end();
    },
  };
}

export default pinoLogger;
```

The `AstroLoggerDestination` interface will be defined as follows:

```ts
export interface AstroLoggerDestination {
  /** Write a log event. Called synchronously on every log call. */
  write: (chunk: AstroLoggerMessage) => void;
  /** Flush buffered writes without releasing resources. Optional. */
  flush?: () => void | Promise<void>;
  /** Flush and release resources (file descriptors, connections). Optional. Implies flush. */
  close?: () => void | Promise<void>;
}
```

`flush` and `close` are optional, but needed for two particular cases:

- Allow third-party logging systems to use their `flush` and `close` APIs.
- SSR, where the file descriptors of the destinations must be closed. Particularly:
  - `flush` is needed in serverless environments (Vercel, Netlify, Cloudflare, etc.) so that logs are written to the
    destination at the end of a rendering request, without closing the file descriptor.
  - `close` is needed in server environments (Node.js, Bun, Deno, etc.) so that logs are written to the destination
    when a `SIGTERM`/`SIGINT` signal is sent by the server, and the file descriptor can be closed safely.

## Runtime

The `Astro` global and `APIContext` type will expose a new `log` field that can be used as follows:

```ts
// endpoint.ts
export const GET = (context: APIContext) => {
  context.log.info("Hello!");
  return Response.json({ greeting: "Hello world" });
};
```

Methods exposed:

- `Astro.log.info`
- `Astro.log.warn`
- `Astro.log.error`

## Configuration

The configuration will accept a `logger` object:

```ts
export default defineConfig({
  logger: {
    entrypoint: "astro/logger/default",
    config: {},
  },
});
```

Where the configuration has the following shape:

```ts
export interface LogHandlerConfig {
  entrypoint: string | URL;
  config?: Record<string, any>;
}
```

Internally, Astro will load the specifier using a simple dynamic import.

The type `config` is optional, and when provided, is passed as parameter to the function exported by the entrypoint.

## Built-in handlers

Astro will expose some default handlers, as well as some utilities. All exported from the `astro/config` entrypoint.

### `logHandlers.json(config?)`

A logger that writes to `stdout` and `stderr`, but the information is printed in JSON format. When `pretty` is provided,
fields are broken down on multiple lines.

```ts
import { defineConfig, logHandlers } from "astro/config";

export default defineConfig({
  logger: logHandlers.json({ 
    pretty: true,
    level: "warn"
  }),
});
```


### `logHandlers.console(config?)`

A logger that writes to `console`. Each level is mapped to the respective console binding:
- "error" -> `console.error`
- "warn" -> `console.warn`
- "info" -> `console.info`

```ts
import { defineConfig, logHandlers } from "astro/config";

export default defineConfig({
  logger: logHandlers.console({ 
    pretty: true,
    level: "warn"
  }),
});
```

### `logHandlers.node(config?)`

A logger that writes to `stdout` and `stderr`.

```ts
import { defineConfig, logHandlers } from "astro/config";

export default defineConfig({
  logger: logHandlers.node({ 
    pretty: true,
    level: "warn"
  }),
});
```

### `logHandlers.compose(...LogHandlerConfig[])`

With this API, users will be able to configure multiple logger destinations. Under the hood, `compose` will create a
destination where `write`, `flush` and `close` are called for all handlers.

```ts
import { defineConfig, logHandlers } from "astro/config";
import pino from "astro-pino-logger";

export default defineConfig({
  logger: logHandlers.compose(
    logHandlers.json(),
    pino({ destination: "/var/log/app.log" }),
  ),
});
```

## Additional APIs

We will provide some utilities so that users can create better logging. As designed, if users create their own logger, Astro's logs will flow into their destination.

### `matchesLevel`

```ts
import { matchesLevel } from "astro/logger";

const dest = {
  write(message) {
    if (matchesLevel(message.level, 'info')) {
      // write something in the custom destination
    }
  },
};
```

## Internals

Internally, Astro already has a logger, however types and implementation might not fit the new APIs. We will expose the internals to users, which means options and such will need to be documented.

Internal refactors are expected (renaming, change of APIs, etc.).

# Testing Strategy

- The objective is to unit test the majority of the use cases, so the architecture of the feature must account for that.
- Few integration tests to verify `write`, `flush` and `close` are called in the correct focal points.

# Drawbacks

- This design also redirects our internal logs to the library authors, so users will need to filter them if they don't want them.
- The initialization of the logger is now asynchronous due to `entrypoint`
- The logger configuration must be serializable, no runtime functions.
- `flush` and `close` are `async` and could cause a failure point in the runtime if these functions fail, and the more handlers there are, the more awaited functions we have.

# Alternatives

- I did consider `astro:logger`, but internally our logger is initialized before the dev server, plus the logger is mostly runtime, so preferred avoiding Vite as much as possible.
- I considered an API where custom loggers will receive only user-defined logs, however this would have made the internal implementation more complex, probably caused mismatches of what's printed (look and feel).

# Adoption strategy

- The feature ships behind `experimental.logger`.
- Alternatively, users can use JSON logging via `--experimental-json`.
- After some testing time, the experimental flag will be removed, and the new feature will be shipped in a minor

# Unresolved Questions

- `flush` and `close` are asynchronous functions, and in the presence of multiple handlers we might need to await them. Should we call them without await? I wouldn't want to delay rendering. How do we catch errors if they fail?
- `debug` info level has been kept out of the picture because we use [`obug`](https://npmx.dev/package/obug) for it, which is noisy and completely different from the rest of the logs. Should we keep it out? Docs should address the differences from normal logging.
