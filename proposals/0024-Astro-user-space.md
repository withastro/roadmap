- Start Date: 2022-06-16
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: <!-- leave empty -->

# Summary

Provide a user namespace in the `Astro` global that allows for developers to implememnt plugins that can be used within Astro templates
without having to import libraries into the templates, instead provide them as part of a user namespace.

The current propsal is `Astro.extend.` and takes inspiration from jQuery plugins, where a function can easily be added to
the namespace.

# Example

This is a useless example that provides an idea of how you attach to the namespace and could provide a function
to return some content HTML.

The stucture of a plugin is a default function that is called that passes the `Astro` context and a configuration, as seen below

plugin1.js
```mjs
export default function(Astro, config) {
    return (userConfig) => {
        const { default1, default2, Content } = {...config, ...userConfig}; 
        Astro.extend.myNewFuntion = (value1, value2, UserContent) => {
            if (UserContent) {
                return (<UserContent value1={value1 || default1 }  value2={value2 || default2 }>)
            }
            return (<Content value1={value1 || default1 }  value2={value2 || default2 }>)
        }
    }
}
```

Here is a item with a async function that renders a list, as part of this example a parameter is provided to show
a function could return the results instead of the rendered HTML, but in reality these would be two different methods:

plugin2.js
```mjs
export default function(Astro, config) {
    return async (userConfig, onlyReturnData) => {
        Astro.extend.menuCreate = (url) => {
            const result = await fetch(userConfig?.url || config.url);
            const rows = await result.json();
            if (onlyReturnData) {
                return rows;
            }

            return (
                <ul class="menu">
                    {rows.map(row => {
                        (<li><a href={row.url}>{row.label}</a></li>)
                    })}
                </ul>
                )
        }
    }
}
```

Loading it might be something like this, this is not a definative design but just an idea to illustrate the configuration needs

```mjs
import { defineConfig, definePlugin } from 'astro/config';
import react from '@astrojs/react';

import plugin1 from './plugin1.js';
import plugin2 from './plugin2.js';
import * as Config from './config.json';

// https://astro.build/config
export default defineConfig({
  site: 'https://example.com',
  outDir: 'dist',
  integrations: [react()],
  plugins: [ definePlugin(plugin1, Config.plugin1), definePlugin(plugin2, Config.plugin2)],
});
```

The define plugin method in this implementation would be something like this:
```mjs
export function definePlugin(plugin, config) {
    return plugin(Astro, config);
}
```

# Motivation

These differ in use from integrations in that they provide globally available template and data functions
that can be used in any template. They should be lightweight and provide helpful features.

This design is not finaland would serve better from discussion around the needs, vs Integrations

# Detailed design

The namespace of any user object should not be able to clash or overide any global `Astro` namespace, as such
the `Astro.extend` namespace contains all the plugin functions named - each one can take custom parameters. Each one
should have the Astro namespace available to get data from and react to.

# Drawbacks

Bad plugins can cause issues such as rendering issues, dependency clashes, memory leaks and segmentation faults.

Would most likely want to implemenent some kind of security or accountability?

Can this be better served already in the existing Integrations API? Does it just need some new features to support
this?

# Alternatives

Some easier way of doing this in the integrations API?

# Adoption strategy

Ideally this would not be a breaking change - once added it would allow plugins to be created and distributed via
node, or via local import.

# Unresolved questions

Is this even a good idea 😄 Ideally the purpose is ease of adding lightweight features that can help users
with rendering SSR content by extending the namespace easier than the current way.

Maybe it's just a question of documentation and how developers can provide these features