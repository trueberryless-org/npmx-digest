import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import sanitizeHtml from "sanitize-html";

export async function GET(context: APIContext) {
  const posts = await getCollection("posts");
  const sortedPosts = posts.sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );

  return rss({
    title: "npmx.digest",
    description:
      "An automated news aggregation website that summarizes npmx activity from GitHub and Bluesky every 8 hours.",
    site: context.site!,
    stylesheet: "/rss/pretty-feed-v3.xsl",
    items: sortedPosts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.topics.map((t) => t.summary).join(" "),
      link: `/posts/${post.id}`,
      content: sanitizeHtml(
        `
        <h2>Intelligence Topics</h2>
        ${post.data.topics
          .map(
            (topic) => `
          <div>
            <h3>${topic.title} (Signal: ${topic.relevanceScore}/10)</h3>
            <p>${topic.summary}</p>
            <p>Sources: ${topic.sources
              .map((source) => `<a href="${source.url}">${source.platform}</a>`)
              .join(", ")}</p>
          </div>
        `
          )
          .join("")}
      `
      ),
    })),
    customData: `<language>en-us</language>`,
  });
}
