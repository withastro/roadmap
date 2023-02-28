<!--
  Note: You are probably looking for `stage-1--discussion-template.md`!
  This template is reserved for anyone championing an already-approved proposal.

  Community members who would like to propose an idea or feature should begin
  by creating a GitHub Discussion. See the repo README.md for more info.

  To use this template: create a new, empty file in the repo under `proposals/${ID}.md`.
  Replace `${ID}` with the official accepted proposal ID, found in the GitHub Issue
  of the accepted proposal.
-->

- Start Date: 2023-02-27
- Reference Issues: https://github.com/withastro/roadmap/issues/473
- Implementation PR: https://github.com/withastro/astro/pull/6356

# Summary

Add a `--watch` flag to `astro check` command.

# Background & Motivation

From the relevant issue:

> In development mode there isn't a way to know if your .astro files contain no errors,
> aside from editor feedback.
>
> If you use astro check you will know about errors, but might not see them until CI unless you remember to run the command before pushing.

# Goals

- A way to check TS errors in .astro files during development workflow.

# Non-Goals

- Having errors reported in the UI. This could be a nice enhancement in the future but would come with some downsides (such as possibly slowing down dev) that we want to punt on.

# Detailed Design

The new feature will use the existing tools that `astro` has. `vite` exposes a [`watcher` option](https://vitejs.dev/config/server-options.html#server-watch)
that allows users to watch files and react accordingly.

The suggested solution would be to be spawn a `vite` server instance, watch `.astro` files changes and
check for diagnostics.

The output emitted will be the same, compared to `astro check`.

```shell
astro check --watch
```

Will output:

```block
13:46:46 [check] Checking files in watch mode
```

The rest of the output will be the same as the command `astro check`.

# Testing Strategy

This feature can be unit tested. The plan is to launch a process and listen to its `stdout` and `stderr`.

This will allow to us inspect the output of the process and test with the correct assertions.

Although, these kinds of tests are very brittle and unstable, because they require
listening to the output of a command, and this command might take a different amount of time based on the OS.

In absence of "stable" unit tests, I only see manual testing as an alternative.

# Drawbacks

- this feature could be implemented in user-land, but it wouldn't offer the same DX to
  developers;
- the command is a long-lived process, which means the user needs to kill the command
  manually;

# Alternatives

The user can use third party tools such as [wireit](https://github.com/google/wireit), although it would mean
that the user wouldn't benefit of future improvements around `astro check --watch`.

Not having such a feature will impact the overall DX of users.

Astro already has its own LSP and VSCode extension, but there might be users who prefer other IDEs,
but this means that users need to rely on IDEs and their LSP protocol.

This proposal will offer a new tool!

# Adoption strategy

- offer a new preview release

# Unresolved Questions

N/A
