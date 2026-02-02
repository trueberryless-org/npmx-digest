import { z } from "astro/zod";
import { TopicSchema, type Topic } from "../lib/schema";

const EventSchema = z.object({
  source: z.enum(["github", "bluesky"]),
  title: z.string(),
  description: z.string(),
  url: z.string().url().optional(),
  timestamp: z.string(),
});

export type Event = z.infer<typeof EventSchema>;

const LOG = {
  info: (msg: string) => console.log(`\x1b[34m[INFO]\x1b[0m ${msg}`),
  success: (msg: string) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  warn: (msg: string) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
  error: (msg: string) => console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  ai: (msg: string) => console.log(`\x1b[35m[AI]\x1b[0m ${msg}`),
};

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is missing.`);
  }
  return value;
}

async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function sanitizeBrand(text: string): string {
  return text.replace(/npmx/gi, "npmx");
}

export async function fetchGitHubEvents(since: Date): Promise<Event[]> {
  const owner = "npmx-dev";
  const repo = "npmx.dev";
  const token = getRequiredEnv("GITHUB_TOKEN");
  const events: Event[] = [];

  const halfDayInMs = 12 * 60 * 60 * 1000;
  const until = new Date(since.getTime() + halfDayInMs);
  const startIso = since.toISOString().split(".")[0];
  const endIso = until.toISOString().split(".")[0];
  const dateRange = `${startIso}Z..${endIso}Z`;

  const query = encodeURIComponent(
    `repo:${owner}/${repo} is:closed created:${dateRange}`,
  );

  const headers = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "npmx-digest-bot",
    Authorization: `Bearer ${token}`,
  };

  try {
    const response = await fetch(
      `https://api.github.com/search/issues?q=${query}`,
      { headers },
    );

    if (response.ok) {
      const data = await response.json();
      const items = data.items || [];

      items.forEach((item: any) => {
        const isPR = !!item.pull_request;
        events.push({
          source: "github",
          title: `${isPR ? "Merged PR" : "Closed Issue"} #${item.number}: ${item.title}`,
          description: item.body || "No description provided",
          url: item.html_url,
          timestamp: item.created_at,
        });
      });
      LOG.success(`GitHub: Found ${events.length} finalized items.`);
    }
  } catch {
    LOG.error("GitHub fetch failed.");
  }

  return events;
}

export async function fetchBlueskyEvents(since: Date): Promise<Event[]> {
  const handle = "npmx.dev";
  const events: Event[] = [];

  try {
    const resolve = await fetch(
      `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`,
    );
    if (!resolve.ok) return events;
    const { did } = await resolve.json();

    const feedRes = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${did}&limit=30&filter=posts_with_replies`,
    );

    if (feedRes.ok) {
      const { feed } = await feedRes.json();

      const candidates = feed.reduce((acc: Event[], item: any) => {
        const actionTimestamp = item.reason?.indexedAt || item.post.indexedAt;
        const isRecent = new Date(actionTimestamp) >= since;

        if (isRecent) {
          const author = item.post.author.handle;
          const isRepost = !!item.reason;
          const postText = item.post.record.text;

          acc.push({
            source: "bluesky",
            title: `${isRepost ? `[Repost from @${author}] ` : ""}${postText.substring(0, 80)}`,
            description: postText,
            url: `https://bsky.app/profile/${handle}/post/${item.post.uri.split("/").pop()}`,
            timestamp: actionTimestamp,
          });
        }
        return acc;
      }, []);

      const reachabilityResults = await Promise.all(
        candidates.map(async (c: Event) => ({
          event: c,
          isAlive: c.url ? await isUrlReachable(c.url) : false,
        })),
      );

      const aliveEvents = reachabilityResults
        .filter((r) => r.isAlive)
        .map((r) => r.event);

      events.push(...aliveEvents);
      LOG.success(`Bluesky: Collected ${events.length} active items.`);
    }
  } catch {
    LOG.error("Bluesky fetch failed.");
  }
  return events;
}

export async function generateSmartDigest(events: Event[]): Promise<Topic[]> {
  const token = getRequiredEnv("GITHUB_TOKEN");
  if (!token || events.length === 0) return [];

  LOG.ai(
    `Clustering ${events.length} signals into topics (Prioritizing Bluesky)...`,
  );

  // Directive to the AI: Use Bluesky as community anchors
  const prompt = `You are a technical analyst for npmx. Group the following events into 5-6 logical "Topics".

  STRATEGY:
  1. Community Focus: Treat "bluesky" events as high-signal community interests.
  2. Inclusive Clustering: Ensure that "bluesky" posts are not sidelined; weave them into relevant technical topics where possible.
  3. Topic Weight: If a topic includes a "bluesky" post, it should generally have a higher relevanceScore.

  Sort by relevanceScore (1-10). Refer to the project strictly as "npmx" (lowercase).
  Return ONLY a JSON array with this structure: { "topics": Topic[] }.

  Events: ${JSON.stringify(events)}`;

  try {
    const response = await fetch(
      "https://models.inference.ai.azure.com/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          model: "gpt-4o-mini",
          temperature: 0.3, // Lower temp for more stable clustering
          response_format: { type: "json_object" },
        }),
      },
    );

    if (response.ok) {
      const data = await response.json();
      const content = data.choices[0].message.content;
      const parsed = JSON.parse(content);

      // Re-ranking Logic: Slightly boost topics that contain Bluesky content
      const rawTopics = parsed.topics.map((t: any) => {
        const validated = TopicSchema.parse(t);
        const hasBluesky = events.some(
          (e) =>
            e.source === "bluesky" &&
            t.summary.includes(e.title.substring(0, 20)),
        );

        return {
          ...validated,
          title: sanitizeBrand(validated.title),
          summary: sanitizeBrand(validated.summary),
          // Subtle priority boost for community-facing topics
          relevanceScore: hasBluesky
            ? Math.min(10, validated.relevanceScore + 1)
            : validated.relevanceScore,
        };
      });

      // Sort by the new boosted score
      const topics = rawTopics.sort(
        (a: Topic, b: Topic) => b.relevanceScore - a.relevanceScore,
      );

      LOG.success(
        `Successfully clustered into ${topics.length} topics with Bluesky priority.`,
      );
      return topics;
    }
  } catch {
    LOG.error("AI Clustering failed.");
  }
  return [];
}

export async function generateCatchyTitle(topic: Topic): Promise<string> {
  const token = getRequiredEnv("GITHUB_TOKEN");
  if (!token) return "New Update";

  const prompt = `You are a tech journalist for npmx. Create a very short (max 5-7 words), catchy headline for this topic.
  Return ONLY the text, no quotes. Topic: ${topic.title} - ${topic.summary}`;

  try {
    const response = await fetch(
      "https://models.inference.ai.azure.com/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          model: "gpt-4o-mini",
          temperature: 0.8,
          max_tokens: 30,
        }),
      },
    );

    if (response.ok) {
      const data = await response.json();
      const title = data.choices[0].message.content.trim();
      return sanitizeBrand(title);
    }
  } catch {
    LOG.error("Failed to generate title");
  }
  return sanitizeBrand(topic.title);
}
