- Start Date: 2024-04-02
- Reference Issues: https://github.com/withastro/roadmap/issues/811
- Implementation PR: 

# Summary

Provide the infrastructure to protect Astro websites from CSRF attacks

# Example

```js
// astro.config.mjs
export default defineConfig({
  csrfProtection: ["origin", "cookie"]
})
```

# Background & Motivation


Most background is available here: https://owasp.org/www-community/attacks/csrf

Astro should provide some level of security to users.

# Goals

- Add the required checks to prevent CSRF, by checking the routes that can be called via `POST`, `PUT`, `PATCH`, or `DELETE` requests.
- Add the required checks to prevent CSRF in case the application behind a reverse proxy.

# Non-Goals

- Give the users the possibility to customise the implementation of the protection at route level.

# Detailed Design

The solution should work only on on-demand applications (SSR), and applications with `server: "hybrid"` for routes that opt-out prerendering. 

The solutions proposed should work only on request meant to **modify** data: `POST`, `PUT`, `PATCH`, or `DELETE`. Other requests should be exempt from the CSRF check.

We will call these requests as **known requests**.


During the exploration phase, I found two ways to implement CSRF.

## `"origin"` option

The header `origin` is a header that is preset and set by all modern browsers and there's no way to temper it. If the header `origin` won't match
the origin of the URL, Astro will return a 403.

This solution should fit most websites.

## `"cookie"` option

The cookie solution is an alternative way to provide CSRF protection. It will be heavily inspired from [Angular](https://angular.io/guide/http-security-xsrf-protection).

When the **first** `GET` request is sent to the application, Astro will create a token that will be saved inside a cookie named `Astro-csrf-token`. This token will be read in the **known requests** and it doesn't match the expected value, it means that the request isn't genuine.

The token must be unique for each user and must be verifiable by the server; his prevents the client from making up its own tokens.

This solution should fit more esoteric scenarios, where applications are behind reverse proxies.

# Testing Strategy

Testing this feature will require e2e tests.

# Drawbacks

Having these security checks could prevent some applications from running, so users should know when to opt-in these options.

# Alternatives

N/A

# Adoption strategy

Please consider:

- initial experimental flag;
- remove the flag once we're confident in the implementation of the feature;
