- Start Date: 2022-09-10
- Reference Issues: https://github.com/withastro/astro/issues/3601,
  https://github.com/withastro/docs/issues/806
- Implementation PR: <!-- leave empty -->

# Summary

[integration API] The injected script during the `page-ssr` stage should be run
on every page and behave exactly as the frontmatter code in astro pages.

# Motivation

I'm working on implementing an i18n integration called
[`astro-i18next`](https://github.com/yassinedoghri/astro-i18next). The more I
work on it, the more I dig myself into a rabbit hole. All of which - I believe -
is because a path I explored previously did not pan out, resulting in a hacky,
incomplete implementation and lots of head scratching.

The aim of the `astro-i18next` integration is to inject an internationalization
logic on every page: load translation strings, detect and change language, etc.
And ultimately, it should work for both SSG and SSR.

Given what's documented in the astro docs regarding the `page-ssr` stage of
`injectScript`:

> "page-ssr": Imported as a separate module in the frontmatter of every Astro
> page component. Because this stage imports your script, the **Astro global is
> not available** and your script **will only be run once** when the import is
> first evaluated.

It is not ideal for the use case I'm trying to solve.

The limitations were documented after starting a discussion
[on Discord](https://discord.com/channels/830184174198718474/987756543946682398),
and here's the resulting
[issue for reference](https://github.com/withastro/docs/issues/806).

So, the `page-ssr` stage was first designed to work with injecting a CSS import
into every page (Tailwind integration use case).

I have been working with those limitations for a few months now and was actually
able to implement some features. For example, to have the change language
feature work, I created
[a CLI tool that generates localized pages](https://github.com/yassinedoghri/astro-i18next#generate)
and adds the import and function call to change the language on every page.

I could keep going like this and provide extra work (and a lot of time) into
implementing each feature with DX improvements outside of the Astro scope...
But, at the end of the day, I think this has to do with the integration API
being inadequate for use cases such as i18n (and essentially any use cases
needing to have logic run on every page).

Moreover, what reinforces me to think that the `page-ssr`'s behavior should
change is that I'm getting more and more feedback on `astro-i18next` with bugs
(https://github.com/yassinedoghri/astro-i18next/issues/37) and a struggle to
offer a better API and DX
(https://github.com/yassinedoghri/astro-i18next/issues/30).

To conclude, as per the docs page, the sentence "Astro Integrations add new
functionality and behaviors for your project **with only a few lines of code**"
is rendered inexact because of those limitations.

# Detailed design

There are 2 types of use cases at stake here:

- tailwind integration (only load css globally, running once at startup is ok -
  though maybe not ideal as it may require manual server restarts?)
- i18n integration (needs to run a script on every page to work properly)

`"page-ssr"` must be changed to accomodate the latter use case, be run on every
page, with access to
[the runtime API](https://docs.astro.build/en/reference/api-reference) (at least
the global Astro variable).

# Drawbacks

The main (big) thing I see is the potential conflicts between the script that is
injected during the `page-ssr` stage and the frontmatter script in the astro
page.

# Alternatives

As explained above, the alternative is to hack your way around the limitations
and reinvent the wheel.

> What is the impact of not doing this?

Less adoption in the integration API, _a lot more_ work for integration
maintainers.

# Adoption strategy

> If we implement this proposal, how will existing Astro developers adopt it?

No change in the API, docs would need to be changed as there would not be any
(or less) limitations.

> Is this a breaking change? Can we write a codemod?

Not a breaking change.

> Can we provide a runtime adapter library for the original API it replaces?

No, as this relates the integration / adapter API.

> How will this affect other projects in the Astro ecosystem?

This would alleviate the work of existing / new integrations, resulting in an
emergence of more powerful integrations.

# Unresolved questions

What if we inject getStaticPaths and have a conflicting getStaticPaths in a
page?
