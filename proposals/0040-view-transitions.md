- Start Date: 2023-06-29
- Reference Issues: https://github.com/withastro/roadmap/issues/532
- Implementation PR: https://github.com/withastro/astro/pull/7511

# Summary

Introduce APIs to make using [View Transitions](https://developer.chrome.com/docs/web-platform/view-transitions/) as easy as possible in Astro. This proposal includes:

- A component `<ViewTransitions />` that adds a client-side router that uses View Transitions to update the page.
- A set of directives that allow specifying animations on specific elements.

# Example

## Enabling support

A user can enable view-transitions one of two ways:

```diff
<html>
  <head>
+    <meta name="view-transition" content="same-origin" />
  </head>
  <body>
    <!-- Content here -->
  </body>
</html>
```

Adding this meta tag to the head will enable the built-in support for MPA view transitions. *However*, this currently only works in Chrome Canary behind a flag. A more practical usage is to use our `<ViewTransitions />` built-in component:

```diff
+ ---
+ import { ViewTransitions } from 'astro:transitions';
+ ---
<html>
  <head>
-    <meta name="view-transition" content="same-origin" />
+    <ViewTransitions />
  </head>
  <body>
    <!-- Content here -->
  </body>
</html>
```

Simply by doing this the site will do a cross-fade between pages (browser default). If that's all you want then there's nothing else to do.

## Animations

You can use our built-in animations by using the `transition:animate` directive like so:

```astro
---
import { ViewTransitions } from 'astro:transitions';
---
<html>
  <head>
    <ViewTransitions />
  </head>
  <body transition:animate="slide">
    <!-- Content here -->
  </body>
</html>
```

This will do an animation where the body slides in and out. On back navigation it has the opposite animation.

# Background & Motivation

View Transitions aligns very well with Astro's content site focus. We still believe that MPA is the right approach to building this type of site. With View Transitions there is the prospect of keeping multi-page architecture but enabling smooth transitions between pages and eliminating the "full page refresh" look that a lot of people dislike.

However, currently View Transitions are a new API and there's a bit of work needed to use them. This proposal seeks to make it easier.

## Animations

By default a view transition uses a cross-fade animation. The old page fades out and the new page fades in. The default animation is fine, but some times you'll want to do more. You can do this yourself if you want, by using the various pseudo-selectors in CSS, like so:

```css
@keyframes fadeIn {
  from { opacity: 0; }
}

@keyframes fadeOut {
  to { opacity: 0; }
}

@keyframes slideFromRight {
  from { transform: translateX(100%); }
}

@keyframes slideToLeft {
  to { transform: translateX(-100%); }
}

body {
  view-transition-name: body;
}

/* Old stuff going out */
::view-transition-old(body) {
  animation: 90ms cubic-bezier(0.4, 0, 1, 1) both fadeOut,
			300ms cubic-bezier(0.4, 0, 0.2, 1) both slideToLeft;
}

/* New stuff coming in */
::view-transition-new(body) {
  animation: 210ms cubic-bezier(0, 0, 0.2, 1) 90ms both fadeIn,
    300ms cubic-bezier(0.4, 0, 0.2, 1) both slideFromRight;
}
```

However this amounts to a lot of code. Also you have to create a unique `view-transition-name` for each element that you want to animate. This can be tricky to do, especially if trying to animate a list; impossible if done dynamically.

With this proposal Astro will auto-generate a `view-transition-name` for you that is distinct to just that element.

# Goals

- Provide a router that works with the SPA view transition API.
- Provide some built-in animations.
- Provide a way to persist some DOM between page navigations (the media player use-case).
- Have some fallback for browser that do not support view transitions. Ideally we would mimick the API as closely as possible; but it's more likely that we will only be able to support a subset of animations.

# Non-Goals

- App-like use-cases are still not a goal here. Many should be able to be used with these new APIs, but we'd still recommend using an island with a client-side router for full apps.
- This is not something you turn on to always get client-side routing; it's not a configuration toggle. Instead you control what pages use CSR by using the `<ViewTransitions />` component or adding the built-in meta tag.

# Out of scope

- It's possible to do in-page animations using view transitions. This gives you the nice morphing effect. This is something we are set up to support, but do not currently have an API for and not the use-case this proposal is targeting.

# Detailed Design

There are 3 parts to this proposal:

- A component that allows View Transitions to occur.
- Some directives to control which elements get special transitions and animations.
- A directive to persist an island between pages.

## ViewTransitions component

The `<ViewTransitions />` component is the router for view transition support. It includes a script that will:

- Intercept forward navigates within the site (same origin).
- Intercept back buttons.

From there it acts as a router and:

- Fetches the next page via `fetch()`.
- Tells the browser it is entering a view transition via the `document.startTransition()` API.
- Swaps the contents of the page to the next page.

Animations are provided via CSS and the ViewTransitions component does not need to trigger them. `document.startTransition(cb)` takes a callback. Inside that callback the actual DOM manipulation occurs. The browser will:

- Take a screenshot of the page between the callback.
- Take a screenshot after the callback.
- Use the CSS animations to transition to the next view.

### Opt-in per route

To enable CSR the `<ViewTransitions />` must be on each page where it is wanted. Usually apps will have a layout component or a head component. Using ViewTransitions there will enable it on every page that uses that component.

Once the ViewTransitions client-side script is installed it will persist between *all pages* until a MPA navigation occurs. That's because the browser does not unload scripts. To ensure that only pages that ask for CSR get it, this component will need to check for the presence of a special meta tag, `<meta name="astro-view-transition">` which is added by the ViewTransitions component. If this tag does not exist then the component knows to allow MPA navigation to the next page.

## Animation directives

There are 2 directives used to control animations for specific elements.

### transition:animate

This is the directive you'll most often use. You can use it to set a specific animation on an element between pages:

```astro
<body transition:animate="slide">
  <header transition:animate="morph"></header>
</body>
```

With this the body will do a slide animation. However the header will not, it is specified to d a morph. The user will see the slide everywhere on the page *except* for the header.

Here are the built-in animations:

- __slide__: A slide in and out animation. The old page slides out to the left and the new page slides in from the right. On backwards navigation the opposite occurs; the old page slides out to the right and the new page slides in from the left.
- __fade__: This is a cross fade where the old page fades out to `opacity: 0` and the new page fades in.
- __morph__: This tells the browser to morph the element between pages. What this looks like is dependent on how the element is different between pages and is determined by the browser. If you have an image in both old and new pages but the elements are otherwise different, you'll see animation where the old element seems to "morph" into the new one. If the elements are completely different, however, you'll see a cross-fade.

The algorithm for determining the `view-transition-name` is:

1. Take the hash used for the component, which will be something like `abcde`.
2. Use a depth-first counter to assign an index for the component, for example `5`.
3. Hash these two values creating a new hash, for example `fghijkl`.
4. When rendering, keep a count of the number of `transition:animate` calls there are and increment a counter for each one. The final id becomes `fghijkl-5` and that is used as the `view-transition-name`.

### transition:name

When using a `transition:animate` Astro will automatically assign that element a `view-transition-name`. This is because in most cases the elements are roughly the same between pages.

Some times you might want to morph two different elements that come from different components and live at different locations within the page. The auto-assigned names will not result in the morphing that you desire. In this case you can specify the `view-transition-name` yourself:

__one.astro__

```astro
<li transition:animate="morph" transition:name="video">
```

__two.astro__

```astro
<div class="hero" transition:animate="morph" transition:name="video">
```

## Advanced animation API

Animations can be customized by importing the animation from `astro:transitions`:

```astro
---
import { slide } from "astro:transitions";
---

<body transition:animate={slide({ duration: 50 })}>
```

This allows users to define their own animations. The API for what these functions returns is:

```ts
export interface TransitionAnimation {
  name: string; // The name of the keyframe
  delay?: number | string;
  duration?: number | string;
  easing?: string;
	fillMode?: string;
	direction?: string;
}

export interface TransitionAnimationPair {
	old: TransitionAnimation | TransitionAnimation[];
	new: TransitionAnimation | TransitionAnimation[];
}

export interface TransitionDirectionalAnimations {
	forwards: TransitionAnimationPair;
	backwards: TransitionAnimationPair;
}
```

This defines:

- `forwards` and `backwards` transitions to handle the case where you want the animation to go in the reverse direction when the user hits the Back button.
- `old` and `new` so that you can control the old and new pages separately.

Note here that you still need to define a [keyframe](https://developer.mozilla.org/en-US/docs/Web/CSS/@keyframes) some where else, such as imported CSS.

## Persistent islands

Some times you have elements which are exactly the same between pages, but you want to keep some state that exists. A common use-case for this is a media player. You have a song playing and want the song to continue playing on the next page.

An island can be set to persist using the `transition:persist` directive:

```astro
<MediaPlayer client:load transition:persist>
```

Astro will give this island an id using the same algorithm used to calculate the `view-transition-name`. You can also specify a name like: `transition:persist="media"` for the case where the elements are in very different spots on the page.

When the next page loads Astro will pull the island's root `<astro-island>` from the old page and have it replace the same element on the next page.

## Fallback

In order to support browsers that do not support native view transition APIs, Astro will simulate the behavior using regular CSS and DOM manipulation. On a transition Astro will:

- Add the `data-astro-transition-fallback="old"` attribute to the outgoing page.
- Wait for animations to end.
- Add the `data-astro-transition-fallback="new"` to the incoming page.
- Replace the `document.documentElement` with the incoming page.
- Wait for animations to end.
- Remove the `data-astro-transition-fallback` attribute.

Internally Astro will enable these animations to work in both environments by using selectors in the inserted CSS. A user can control fallback behavior with the `fallback` prop on the `ViewTransitions` component.

```astro
---
import { ViewTransitions } from 'astro:transitions';
---

<ViewTransitions fallback="none">
```

The possible values are:

- `animate`: The default, perform a fallback with simulated animations.
- `swap`: A fallback where the DOM is swapped without animations.
- `none`: Do not fallback for non-supporting browsers, allow MPA navigation.

## Events

These are some initial events that are dispatched on the `document`:

### After swap

> Tentatively shown as `astro:afterswap` here, but the name is subject to bikeshedding before released.

This event occurs during a transition, immediately after the new page has been swapped in for the old page. This gives you a chance to update the DOM before it is painted by the browser.

A use-case is to restore dark mode:

```html
<script>
  function setDarkMode() {
    if(localStorage.darkMode) {
      document.documentElement.classList.add('dark-mode');
    }
  }

  document.addEventListener('astro:afterswap', setDarkMode);
  setDarkMode();
</script>
```

### Page load

> Tentatively shown as `astro:pageload` here, but the name is subject to bikeshedding before released.

This event occurs after a navigation has occured, the DOM is swapped, and all resources have been loaded. This event happens both on initial page load and on any transitions, so it is a good place to do any sort of page setup logic:

```html
<script>
  function setupPage() {
    /** ... */
  }

  document.addEventListener('astro:pageload', setupPage);
</script>
```

# Testing Strategy

This feature is mostly client-side so it will be tested via the Playwright e2e test suite.

# Drawbacks

- This feature is primarily about taking advantage of cutting edge features. Currently it is Chromium browsers only. There is some risk that other browsers will not adopt these APIs and we'll be left having to do a fallback for a long time.
- Full apps that never navigate to different pages are still likely better served by client-side routers. This router is targeting multi-page sites where you want to make transitions appear more smooth and integrated.

# Alternatives

- SPA mode toggle was prototyped here: https://github.com/withastro/docs/issues/3314  This worked really well and the same technique is used by other frameworks. The major downside to this approach was that it was a boolean; either your entire site used CSR or none did. View transitions allowed a more granular approach.
- Persistent islands proposal is here: https://github.com/withastro/roadmap/discussions/307 The idea of keeping an island between navigation is now part of this proposal.

# Adoption strategy

## Release 1
- Support for browsers with `document.startTransition` (Chromium browsers at the moment).
- Custom animations

# Release 2
- Fallback for Safari and Firefox. Likely this will be more limited in scope (only certain types of animations).

# Release 3
- Persistent islands


# Unresolved Questions

Optional, but suggested for first drafts.
What parts of the design are still to be determined?
