- Start Date: 2022-08-18
- Reference Issues: <!-- related issues, otherwise leave empty -->
- Implementation PR: <!-- leave empty -->

# Summary

Updating @astrojs/rss to generate feeds that include full `compiledContext()` strings as `content:encoded` in the XML, given a parameter of `contentLength` with a value of `full`.  (This value would default to `summary`, which is the current default behavior.)

# Motivation

I remember when WordPress rolled out the ability to only publish short excerpts in RSS.  Ostensibly, this was to drive traffic to a blog, where analytics about readership could be gathered.  I am not particularly interested in that, so I implemented this change in my own project.  

# Detailed design

Usage in a project's 	`src/pages/rss.xml.js`:

```
const contentLength = 'full';

export const get = () => rss({
    title,
    description,
    site,
    contentLength,
    items: posts.map((post) => ({
      link: post.url,
      title: post.frontmatter.title,
      pubDate: post.frontmatter.publishDate,
      description: post.frontmatter.description,
      content: post.compiledContent(),
    })),
    xmlns: { content: 'http://purl.org/rss/1.0/modules/content/' }
  });
```

Changes in `astro/packages/astro-rss/src/index.ts`:

```
type RSSOptions = {
	...
    	contentLength?: "summary" | "full";
};
```

```
type RSSFeedItem = {
	...
    	/** Item content */
    	content?: string;
};
```

```
export async function generateRSS({ rssOptions, items }: GenerateRSSArgs): Promise<string> {
	const { site, contentLength = 'summary' } = rssOptions;
	...
	// content:encoded should not be used if description is not present (and first) per RSS 2.0 spec
       if (result.description && rssOptions.contentLength === 'full' && result.content) {
            xml += `<content:encoded><![CDATA[${result.content}]]></content:encoded>`
        }	
```

# Drawbacks

I cannot think of any immediate drawbacks, but I'm open to hearing about them from people more familiar with the inner workings of Astro.

# Adoption strategy

This should be a non-breaking change, as the default behavior will continue unless the developer specifically provides the key/value pair `contentLength: 'full'` *and* a value for `content`.

# Unresolved questions

None at this time.