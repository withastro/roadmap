- Start Date: 2026-05-11
- Reference Issues: https://github.com/withastro/roadmap/discussions/1308
- Implementation PR: https://github.com/withastro/astro/pull/16610
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1358
- Stage 3 PR: https://github.com/withastro/roadmap/pull/1362

# Summary

Add built-in background process management to `astro dev`, enabling AI coding agents to reliably start, monitor, query and stop the dev server.

# Example

## Starting the dev server in the background

```sh
$ astro dev --background
# Blocks until server is ready, logs redirected to .astro/dev.log.
# On success, reports the URL and PID via the logger and detaches:
[astro] Dev server running at http://localhost:4321 (pid 12345)
  Stop:   astro dev stop
  Status: astro dev status
  Logs:   astro dev logs
```

If the dev server is already running for this project, it reports the existing instance:

```sh
$ astro dev --background
[astro] Dev server already running at http://localhost:4321 (pid 12345)
  Stop:   astro dev stop
  Status: astro dev status
  Logs:   astro dev logs
```

Force restart with `--force`:

```sh
$ astro dev --background --force
# Kills existing instance, starts fresh, blocks until ready
[astro] Dev server running at http://localhost:4321 (pid 12346)
  ...
```

If the server fails to start within the timeout (default 30s):

```sh
$ astro dev --background
[error] Dev server failed to start within 30s.
# Exit code 1. Process is killed. No zombie left behind.
```

### Automatic agent detection

When an AI coding agent is detected (via [`am-i-vibing`](https://github.com/ascorbic/am-i-vibing)), background mode and the JSON logger are enabled automatically. Agents can simply run `astro dev` and get background behavior with machine-readable output:


```sh
$ astro dev
{"type":"info","message":"Dev server running at http://localhost:4321 (pid 12345)"}
```

The agent can then query the health endpoint to check if the server is ready and healthy:

```sh
$ curl -s http://localhost:4321/_astro/status
{"ok": true}
```

## Checking status

```sh
$ astro dev status
[astro] Dev server running at http://localhost:4321 (pid 12345, uptime 3600s, background)
```

When nothing is running:

```sh
$ astro dev status
[astro] No dev server is running.
```

## Reading logs

```sh
$ astro dev logs
# Outputs the contents of .astro/dev.log
```

Only works for background servers. Foreground servers log directly to the terminal.

## Stopping the server

```sh
$ astro dev stop
[astro] Stopped dev server (pid 12345).
```

Idempotent; stopping when not running succeeds:

```sh
$ astro dev stop
[astro] No dev server is running.
```

## Health endpoint

All running dev server instances (foreground and background) expose a status endpoint:

```sh
$ curl -s http://localhost:4321/_astro/status
{"ok": true}
```

This is the primary mechanism for agents to query a foreground dev server from another shell session.

# Background & Motivation

AI coding agents are increasingly the primary interface developers use to build Astro sites. These agents need to interact with the dev server constantly: starting it, checking if edits succeeded, reading errors and stopping it when done.

Today, this is painful. The dev server is designed for humans watching a terminal. Agents struggle with:

- **Long-running processes.** Most agents shell out, wait for exit, and read output. A dev server never exits. Agents either hang, or start it and lose track of it.
- **Readiness detection.** There is no reliable signal for "the server is ready to accept requests." Agents resort to polling with `curl`, sleeping for arbitrary durations, or parsing ANSI-colored output for strings like `"Local:"`.
- **HMR feedback.** After editing a file, agents have no way to know whether the HMR update succeeded or failed without making an HTTP request and hoping the error page is parseable. This is the single biggest failure mode observed in agent workflows.
- **Error parsing.** Build and runtime errors are formatted for human readability with colors, box-drawing characters and contextual snippets. Agents cannot reliably extract the file, line number and error type from this output.
- **Process lifecycle.** Agents frequently start duplicate dev servers, lose track of running instances, or leave zombie processes behind. There is no way to check if a server is already running for the current project.

# Goals

- Enable agents to start the dev server as a background process and receive confirmation when it is ready, without polling or heuristics.
- Provide a machine-readable feedback loop for file changes via the health endpoint: is the server healthy, and if not, what went wrong?
- Ensure idempotent, forgiving behavior: starting when already running reports the existing instance; stopping when not running succeeds silently. Agents are bad at tracking state and the CLI should not punish them for it.
- Allow agents to query a running dev server (foreground or background) from a separate shell session via the health endpoint.
- Maintain full backward compatibility with the existing human-friendly `astro dev` experience.
- Design the implementation to be generic enough to support other long-running commands (e.g. `astro preview`) in the future.

# Non-Goals

- **Custom logging framework.** The full custom logging proposal is covered in a [separate RFC](https://github.com/withastro/roadmap/discussions/908#discussioncomment-15852766). This proposal uses the JSON logger when an agent is detected but does not cover the broader custom logger plugin API.
- **Astro MCP server.** This proposal does not cover an MCP server, though it could provide the foundation for one.

# Detailed Design

## CLI Interface

### `astro dev --background`

Starts the dev server as a detached background process. The CLI:

1. Checks for an existing instance for this project (via the lock file).
2. If one is running and `--force` is not set, reports the existing instance via the logger and exits 0.
3. If `--force` is set and a server is running, sends `SIGTERM` to the existing process and waits up to 5 seconds for it to exit before starting a new one.
4. Otherwise, spawns the dev server as a detached child process with output redirected to `.astro/dev.log`.
5. Polls the lock file until the child writes it (indicating the server is listening).
6. On success, reports the URL and PID via the logger, along with hints for `stop`, `status`, and `logs`, then exits 0.
7. On failure or timeout (default 30s), kills the child process, cleans up the lock file, and exits 1.

**Flags:**

| Flag | Description |
|---|---|
| `--background` | Start in background mode. Without this flag, `astro dev` behaves exactly as it does today (unless an agent is detected). |
| `--force` | Kill any existing instance before starting a new one. |

### Automatic agent detection

When `astro dev` is invoked and the [`am-i-vibing`](https://github.com/ascorbic/am-i-vibing) library detects an AI coding agent, background mode and the JSON logger are enabled automatically without the user (or agent) needing to pass `--background` or `--json`. This is skipped when the `ASTRO_DEV_BACKGROUND` environment variable is set, which indicates the current process is the spawned child and should run the foreground dev server.

### `astro dev status`

Queries the current state of the dev server for this project by reading the lock file. Reports whether the server is running, its URL, PID, uptime, and whether it was started in background mode. Always exits 0. "Not running" is information, not an error.

If the lock file references a PID that is no longer running, the stale lock file is cleaned up automatically.

### `astro dev logs`

Reads and outputs the contents of `.astro/dev.log`. Only works for background servers. If the running server was started in foreground mode, an error message directs the user to the terminal where it was started.

### `astro dev stop`

Sends `SIGTERM` to the dev server process referenced in the lock file and waits up to 5 seconds for it to exit. Cleans up the lock file. Idempotent: if no server is running, reports that fact and exits 0.

## Lock File

Each dev server instance (foreground or background) writes a lock file to `.astro/dev.json` inside the project root. This file is written after the server is listening and contains:

```json
{
	"pid": 12345,
	"port": 4321,
	"url": "http://localhost:4321",
	"background": true,
	"startedAt": "2026-05-11T10:00:00.000Z"
}
```

| Field | Type | Description |
|---|---|---|
| `pid` | `number` | Process ID of the dev server. |
| `port` | `number` | The port the server is listening on. |
| `url` | `string` | The full URL of the dev server. |
| `background` | `boolean` | Whether the server was started in background mode. |
| `startedAt` | `string` | ISO 8601 timestamp of when the server started. |

The lock file is:

- **Created** after the dev server starts listening (in both foreground and background modes).
- **Read** by `status`, `logs`, `stop`, and the duplicate detection in `astro dev`.
- **Deleted** when the server is stopped (either via `stop` or normal shutdown).
- **Validated** on read: if the PID is no longer running, the file is removed and the state is treated as "not running."

The `.astro/` directory is already used by Astro for build artifacts and is `.gitignore`'d by default.

### Duplicate server detection

When `astro dev` starts in foreground mode, it checks for an existing lock file. If a live server is already running, it throws an error with the existing server's URL and PID, and suggests using `kill <pid>` or `astro dev --force` to replace it. This prevents agents (and humans) from accidentally starting duplicate dev servers.

## Health Endpoint: `/_astro/status`

All running dev server instances (foreground and background) expose a JSON status endpoint at `/_astro/status`. This is implemented as a Vite plugin (`astro:dev-status`) that registers a middleware handler.

### Response Shape

```json
{"ok": true}
```

The endpoint returns a minimal response confirming the server is healthy. This is sufficient for agents to check if the server is alive and ready to accept requests. See [Unresolved Questions](#unresolved-questions) for possible expansion to include error information, HMR event data, and route lists.

## Process Management

### Spawning

The background server is started using Node.js `child_process.spawn()` with `detached: true` and `stdio` redirected to the log file (`.astro/dev.log`). The child process is spawned using the project-local `astro` binary (`node_modules/.bin/astro`) with the `dev` command and any relevant flags forwarded (`--port`, `--host`, `--config`, `--root`, `--allowed-hosts`).

The environment variable `ASTRO_DEV_BACKGROUND=1` is set on the child process to:

1. Prevent infinite recursion. When the child starts, the agent detection would otherwise trigger background mode again.
2. Signal to the child that it was started in background mode, so the lock file records `background: true`.

After spawning, the parent process polls the lock file (every 200ms) waiting for the child to write it, which signals that the server is ready. Once detected, the parent reports success and exits. The child is `unref()`'d so the parent can exit without waiting for the child.

### Zombie Prevention

Several mechanisms prevent orphaned processes:

- The parent kills the child on timeout.
- The lock file includes the PID. Any `astro dev` invocation validates the PID is alive (using `process.kill(pid, 0)`) before trusting the lock file.
- `--force` always kills an existing instance before starting.
- Stale lock files (where the PID is dead) are automatically cleaned up on any read.

### Signal Handling

The background server handles:

- `SIGTERM`: Graceful shutdown. The dev server's `stop()` method is called, which removes the lock file and closes the HTTP server.
- `SIGKILL`: Cannot be caught; the lock file will be stale. Detected and cleaned up by the next `status`, `stop`, or `astro dev` invocation.

## Logging

The background server redirects both stdout and stderr to `.astro/dev.log`. The format of this file depends on the configured logger:

- **Default (Node logger):** Human-readable text with timestamps and ANSI color codes, the same content that would appear in the terminal if run in foreground mode (e.g. `HH:MM:SS [astro] message`).
- **JSON logger:** Newline-delimited JSON objects with `message`, `label`, and `level` fields (e.g. `{"message":"watching for file changes...","label":null,"level":"info"}`). ANSI color codes are stripped. This is enabled automatically when an AI agent is detected, or manually with `--json`.
- **Custom logger:** Whatever format the user's custom logger implementation writes to stdout/stderr.

The log file is truncated when a new background server starts.

The `logs` command reads this file and writes its contents to stdout.

## Integration with `src/app.ts` (Advanced Routing)

If the project uses `src/app.ts` ([RFC 0056](https://github.com/withastro/roadmap/pull/1344)), the background server and health endpoint work identically. The `/_astro/status` middleware is registered at the Vite layer, before the user's fetch handler, so it is always available regardless of the user's routing configuration.

# Testing Strategy

- **Unit tests** for lock file management: parsing, serialization, validation of required fields, stale detection via `evaluateExistingServer()`. These test the pure logic independent of the filesystem.
- **Unit tests** for CLI output formatters (`formatBackgroundOutput`, `formatStatusOutput`, `formatStopOutput`). These produce JSON representations that can be used programmatically even though the CLI logs via the Astro logger.
- **Integration tests** for the full background lifecycle.
- **Manual testing** with Claude Code, OpenCode and Cursor to validate real-world agent workflows.
- Feature gated behind experimental flags initially. The lock file and duplicate detection are skipped in test and production environments.

# Drawbacks

- **Maintenance surface.** Background process management is platform-sensitive code (PID tracking, signal handling, detached processes). This is inherently more complex and fragile than pure HTTP server code, particularly across different operating systems and Node.js versions.
- **Agents may catch up.** As AI agents improve their ability to manage long-running processes natively (e.g. Claude Code already backgrounds processes), some of this functionality may become redundant. However, the health endpoint and lock file remain valuable regardless, and the background management can be deprecated if/when agents no longer need it.
- **Agent detection heuristics.** Automatic background mode and JSON logging rely on `am-i-vibing` to detect agents. False positives would be surprising (a human's `astro dev` silently backgrounds and switches to JSON output). False negatives are harmless (the agent just needs to pass `--background` and `--json` explicitly).

# Alternatives

## Keep using `bgproc` as an external tool

The [`bgproc`](https://github.com/ascorbic/bgproc) project works today and could be recommended in documentation or agent instructions. However:

- It is less discoverable; agents need to be told about it.
- It cannot provide Astro-specific signals like HMR status, typed error codes or route information.
- It relies on heuristics (port scanning) to detect readiness rather than a first-party signal.
- It adds an external dependency that must be installed separately.

## Health endpoint only (no background management)

We could ship only the `/_astro/status` endpoint and skip the background process management entirely. This would let agents query a foreground dev server from another shell session. However, agents would still struggle with starting and managing the server process itself, which is a significant part of the problem. The health endpoint alone does not solve the long-running process, readiness detection, or lifecycle management issues.

## Custom agent instructions per tool

Rather than building features into Astro, we could maintain per-agent instruction sets (e.g. "in Claude Code, use `&` to background the process and `curl` to check readiness"). This is fragile, hard to maintain across agent versions, and pushes the burden onto every Astro user who uses agents rather than solving it once in the framework.

## Raw JSON output

An earlier design had all CLI commands print raw JSON to stdout (e.g. `{"pid": 12345, "url": "..."}`). This was changed to use Astro's logger so that human users see the normal Astro-styled output. The output format depends on the user's configured logger, so if a JSON logger is configured, these commands will naturally produce JSON. The JSON formatter functions are retained internally for programmatic use and testing.

# Adoption strategy

- **Fully opt-in.** Without `--background`, `astro dev` behaves exactly as it does today, unless an AI agent is detected, in which case background mode is enabled automatically.
- **Not a breaking change.** The new subcommands and flags are additions to the CLI. The `/_astro/status` endpoint is a new route in the dev server that does not conflict with user routes (it uses the `/_astro/` prefix already reserved by Astro). The lock file adds duplicate server detection to foreground mode, but this is a guard against a common mistake, not a behavior change.
- **Experimental phase.** Initially gated behind `--experimental-*` prefixed flags to gather feedback before stabilizing.
- **Agent instruction templates.** Once shipped, we can provide recommended agent instructions (e.g. for `.claude/commands/`, `.opencode/`, etc.) that use `astro dev` and rely on automatic agent detection for the background behavior.
- **Documentation.** A new guide covering agent workflows with the background dev server, including common patterns for starting, checking status, and stopping the server.

# Unresolved Questions

- **Health endpoint expansion.** Should `/_astro/status` include error information, HMR event data, and route lists? The exact shape of an expanded response, and whether it belongs in this RFC or a follow-up, is to be determined.
- **`astro preview --background`.** The background process management could extend to `astro preview` as well, since it is also a long-running server. The implementation should be generic enough to support this, but the exact CLI surface for preview is left to a follow-up.
- **Timeout configurability.** The default startup timeout is 30 seconds. Should this be configurable via a `--timeout` flag or `astro.config`?
- **Log management.** `astro dev logs` dumps all output from the log file. Should it support `--follow` (tail -f behavior), `--tail <n>`, or `--errors` filtering?
- **Stabilized CLI surface.** The final CLI surface (`astro dev stop`, `astro dev status`, etc.) vs flags (`astro dev --stop`) is to be confirmed during the experimental phase.
