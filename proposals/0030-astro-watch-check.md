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

Add a `--watch` flag to the `astro check` command.

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

The suggested solution will use [`chokidar`](https://www.npmjs.com/package/chokidar), a battle tested
file watcher for Node.js.

The file watcher will ignore files inside `node_modules` by default and listen to changes to `.astro` files.

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

Override the default logger with one that is possible to inspect, listen to the stream of messages emitted by the watcher
and make sure that the messages received are correct.

In addition to unit tests, the feature will be manually tested with demo projects.

# Drawbacks

- This feature could be implemented in userland, but it wouldn't offer the same DX to
  developers;
- The command is a long-lived process, which means the user needs to terminate the command
  manually;

# Alternatives

The user can use third party tools such as [wireit](https://github.com/google/wireit), although it would mean
that the user wouldn't benefit of future improvements around `astro check --watch`.

Not having such a feature will impact the overall DX of users.

This proposal will offer a new tool!

# Adoption strategy

- Create a preview release for user feedback.
- Release the feature in as a `minor` without experimental flags since it is a small improvement without many questions.

# Unresolved Questions

N/A
