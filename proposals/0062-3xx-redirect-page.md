**If you have feedback and the feature is released as experimental, please leave it on the Stage 3 PR. Otherwise, comment on the Stage 2 issue (links below).**

- Start Date: 2026-09-25
- Reference Issues: https://github.com/withastro/roadmap/discussions/844
- Implementation PR: https://github.com/withastro/astro/pull/18015
- Stage 2 Issue: https://github.com/withastro/roadmap/issues/1170
- Stage 3 PR: https://github.com/withastro/roadmap/pull/1444

# Summary

Allow to have a **known** file called `3xx.astro` that allows to return a personalised version of a redirect page

# Example

Enable the experimental flag in `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  experimental: {
    redirectPage: true,
  },
});
```

Create `src/pages/3xx.astro` to customize the page Astro writes for static redirects:

```astro
---
const { from, to, status, delay } = Astro.props;
---

<html lang="en">
  <head>
    <meta http-equiv="refresh" content={`${delay};url=${to}`} />
    <meta name="robots" content="noindex" />
    <title>Redirecting</title>
  </head>
  <body>
    <p>This page has moved.</p>
    <p>Redirecting from {from} to {to} with status {status}.</p>
    <p><a href={to}>Continue to the destination</a></p>
  </body>
</html>
```

The page receives `from`, `to`, `status`, and `delay` as props for each redirect. It must render a `<meta http-equiv="refresh">` tag that points to `to`, because the tag performs the redirect in static output.

# Background & Motivation

Since we introduced i18n routing, there have been cases where this new features uses the redirect engine used by Astro.

This showed some shortcomings in features:

- it's not possible to personalise the markup of the page
- it's not possible to change the delay of the redirect, which affects whether search engines treat it as temporary or permanent in SSG
- i18n routing users can't translate the page

The existing redirect page is generated from a fixed template. Users cannot customize its markup, wording, or refresh delay, which limits branding and translations. The original discussion also identified an i18n case where a redirect generated for the default locale can replace the rendered root page.

This design narrows the solution to prerendered redirects. Static output cannot send a `Location` response header, so the HTML page and its refresh tag perform the redirect. Server-rendered redirects send a `Location` header and do not need a personalized response body. In addition, i18n fallback routing defaults to rewriting, so not every fallback uses a redirect.

# Goals

- similar to `404.astro`, to have a `3xx.astro` file that will serve any 3 hundred status code
- users can use any markup inside the page
- fallback to the built-in redirect layout if nothing is provided

# Non-Goals

- Personalizing the body of server-rendered redirects, which rely on an HTTP `Location` header.
- Adding a separate `redirectDelay` configuration option. A custom page controls its own refresh delay.
- Providing a locale-specific `3xx.astro` route. The page can derive the locale from its `from` and `to` props.
- Changing the behavior of Astro redirects when the experimental flag is disabled.

# Detailed Design

## Configuration and route

Add `experimental.redirectPage`, a boolean that defaults to `false`. When the flag is enabled, Astro looks for `src/pages/3xx.astro` and uses it to render the body of prerendered redirects. When the flag is disabled, Astro uses the existing built-in redirect template, and any `src/pages/3xx.astro` file behaves as a normal page.

The `/3xx` route is a known status-code page, alongside `/404` and `/500`. Astro excludes it from i18n route processing and writes it as `3xx.html` in static output, regardless of the configured build format. A direct request or prerender of `/3xx` renders it as an ordinary page without redirect props. Page authors should handle that case if they access `Astro.props` values that only exist during redirect rendering.

## Redirect props

Astro renders the page separately for each prerendered redirect and passes these props through the existing initial-props rendering channel:

- `from`: The source pathname being redirected.
- `to`: The destination from the redirect response's `Location` header.
- `status`: The redirect's HTTP status code.
- `delay`: The delay in seconds used by Astro's built-in template. The default is `2` for status `302` and `0` for other redirect statuses.

The props are regular component props, not additional properties on the `Astro` global. A page can use them to render translated copy, destination links, or status-specific content. It can choose a different refresh delay by rendering its own meta refresh value. The `delay` prop reports the built-in default and does not constrain the custom page.

## Rendering and fallback

Astro renders the custom page inside the application request handler rather than in the static output generator. This uses the normal page rendering pipeline and works with adapter-provided prerenderers without changing their public interface.

The page render runs with the original redirect request and redirect props. Astro skips middleware for this internal render because middleware has already processed the original request. The page render itself has a successful page status. Astro then creates the redirect response with the original redirect status and headers, including `Location`, and the rendered HTML body.

If the project does not provide `3xx.astro`, Astro leaves the response without a body. If rendering the custom page fails, Astro logs the error and also leaves the response without a body. In both cases, the static output generator uses the existing built-in redirect template. A custom page that renders successfully is used as-is.

## Static output generation and validation

The static output generator prefers an existing response body for a redirect. When the response has no body, it generates the existing built-in template. The `build.redirects` option retains its existing behavior for redirect routes. This feature does not change that option.

The refresh tag is the redirect mechanism for static output, so Astro checks each custom page body for a `<meta http-equiv="refresh">` tag whose target matches the redirect destination. If the page omits the tag or points it elsewhere, Astro emits a build warning that identifies the source and destination. Astro does not replace the custom page or fail the build because of this warning. Attribute values are decoded before comparison so HTML-escaped destinations, such as URLs with query parameters, can match.

The validation only checks that the page contains a matching refresh target. It does not validate other behavior or guarantee that a browser or crawler follows the tag.

## Redirect sources and scope

The custom page applies to prerendered responses that represent redirects and have a `Location` header with no response body. This includes redirects generated from Astro's `redirects` configuration, `Astro.redirect()` in prerendered pages, and i18n redirects that use static output.

Server-rendered redirects remain unchanged. They use an HTTP `Location` header, so the body is not required to navigate. The feature does not add `redirectDelay` to Astro configuration. Users who need a different delay can set it in their custom page.

# Testing Strategy

- Unit-test route recognition for `/3xx` and static output filename selection.
- Test custom page rendering and props for redirect responses, including the default delay for `302` and other redirect statuses.
- Test that rendering is disabled when the flag is off, that a missing custom page falls back to the built-in template, and that a failing custom page does not prevent the fallback.
- Test that the internal page render does not run middleware a second time and that the original redirect status and headers are preserved.
- Test refresh-tag validation for matching and mismatching destinations, missing tags, multiple meta tags, quoted and unquoted attributes, and HTML-escaped destination values.
- Test static output generation with a custom response body, the built-in fallback, and a warning when the custom page does not contain a matching refresh tag.
- Test that i18n processing skips the `/3xx` route and that the flag does not change server-rendered redirect responses.
- Test an i18n-generated static redirect, including the default-locale root redirect raised in the original discussion.

# Drawbacks

- The build can check the rendered HTML for a matching tag, but it cannot ensure that the page's markup, scripts, or other behavior cause a redirect in every browser.
- The `/3xx` pathname becomes a special route when the feature is enabled, and users need to account for the fact that direct rendering does not include redirect props.
- Locale-specific route files are not provided. Users must derive locale-specific content from the source and destination paths.

# Alternatives

## Add a `redirectDelay` configuration option

The original discussion proposed a `redirectDelay` option that would adjust the built-in page without requiring a custom page. This does not let users change the surrounding markup or translate its content. With a custom page, users can choose the delay and markup together, so the separate option is not part of this design.

## Add redirect properties to the `Astro` global

The original discussion considered `Astro.redirectTo` and `Astro.redirectFrom`. The implementation instead passes redirect details as component props, following the feedback on the Stage 1 discussion and the existing props channel used for special page rendering.

## Keep the built-in template

Users can disable generated redirect pages or post-process build output, but neither approach provides a framework-supported way to customize every generated page with the details of its redirect. The built-in template remains the fallback when the custom page is absent or fails to render.

# Adoption strategy

The feature is opt-in behind `experimental.redirectPage` and defaults to `false`. Existing projects keep the built-in redirect template without configuration changes. Users who enable the flag can add `src/pages/3xx.astro` and customize its markup.

The feature is additive and does not require a migration or codemod. It can ship as an experimental feature so users can test static redirect behavior and provide feedback before maintainers consider removing the flag.

# Unresolved Questions

None.
