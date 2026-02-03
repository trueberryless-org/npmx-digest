import { z } from "astro/zod";
import { TopicSchema, type Topic } from "../lib/schema";

const INFERENCE_URL = "https://models.inference.ai.azure.com/chat/completions";

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

function sanitizeBrand(text: string): string {
  return text.replace(/npmx/gi, "npmx");
}

async function requestInference(payload: object) {
  const token = getRequiredEnv("MODELS_TOKEN");
  const response = await fetch(INFERENCE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "npmx-digest-bot",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Inference failed [${response.status}]: ${errorBody}`);
  }

  return response.json();
}

export async function fetchGitHubEvents(since: Date): Promise<Event[]> {
  const owner = "npmx-dev";
  const repo = "npmx.dev";
  const token = getRequiredEnv("GITHUB_TOKEN");
  const events: Event[] = [];

  const startIso = since.toISOString().split(".")[0] + "Z";
  const endIso = new Date().toISOString().split(".")[0] + "Z";

  const query = encodeURIComponent(
    `repo:${owner}/${repo} is:closed reason:completed -is:unmerged closed:${startIso}..${endIso}`,
  );

  try {
    const response = await fetch(
      `https://api.github.com/search/issues?q=${query}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "npmx-digest-bot",
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (response.ok) {
      const data = await response.json();
      const items = data.items || [];

      items.forEach((item: any) => {
        events.push({
          source: "github",
          title: `${!!item.pull_request ? "Merged PR" : "Closed Issue"} #${item.number}: ${item.title}`,
          description: item.body || "No description provided",
          url: item.html_url,
          timestamp: item.closed_at || item.created_at,
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
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${did}&limit=50&filter=posts_with_replies`,
    );

    if (feedRes.ok) {
      const { feed } = await feedRes.json();

      const posts = feed.reduce((acc: Event[], item: any) => {
        const timestamp = item.reason?.indexedAt || item.post.indexedAt;
        if (new Date(timestamp) >= since) {
          const author = item.post.author.handle;
          acc.push({
            source: "bluesky",
            title: `${item.reason ? `[Repost from @${author}] ` : ""}${item.post.record.text.substring(0, 80)}`,
            description: item.post.record.text,
            url: `https://bsky.app/profile/${author}/post/${item.post.uri.split("/").pop()}`,
            timestamp,
          });
        }
        return acc;
      }, []);

      events.push(...posts);
      LOG.success(`Bluesky: Collected ${events.length} active items.`);
    }
  } catch {
    LOG.error("Bluesky fetch failed.");
  }
  return events;
}

export async function generateSmartDigest(events: Event[]): Promise<Topic[]> {
  if (events.length === 0) return [];

  LOG.ai(
    `Clustering ${events.length} signals into topics (Prioritizing Bluesky)...`,
  );

  const prompt = `You are a technical analyst for npmx. Group these events into 5-6 logical "Topics".
  Each summary should be around 50 words long.
  Return ONLY JSON: { "topics": Topic[] }.

  Topic Structure:
  {
    "title": "string",
    "summary": "string",
    "relevanceScore": number (1-10),
    "sources": [{ "platform": "github" | "bluesky", "url": "string" }]
  }

  Events: ${JSON.stringify(events)}`;

  try {
    const data = await requestInference({
      messages: [
        { role: "system", content: "You are a JSON-only generator. No prose." },
        { role: "user", content: prompt },
      ],
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(data.choices[0].message.content) as {
      topics: Topic[];
    };

    if (!parsed.topics || !Array.isArray(parsed.topics)) {
      throw new Error("AI response missing 'topics' array");
    }

    const topics = parsed.topics.map((t) => {
      const validated = TopicSchema.parse(t);

      const hasBluesky = validated.sources.some(
        (s) => s.platform === "bluesky",
      );

      return {
        ...validated,
        title: sanitizeBrand(validated.title),
        summary: sanitizeBrand(validated.summary),
        relevanceScore: hasBluesky
          ? Math.min(10, validated.relevanceScore + 1)
          : validated.relevanceScore,
      };
    });

    LOG.success(
      `Successfully clustered into ${topics.length} topics with Bluesky priority.`,
    );
    return topics.sort((a, b) => b.relevanceScore - a.relevanceScore);
  } catch (err: any) {
    LOG.error(`AI Clustering failed: ${err.message}`);
    return [];
  }
}

export async function generateCatchyTitle(topic: Topic): Promise<string> {
  const prompt = `You are a tech journalist for npmx. Create a very short (max 5-7 words), catchy headline for this topic.
  Return ONLY the text, no quotes. Topic: ${topic.title} - ${topic.summary}`;

  try {
    const data = await requestInference({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4o-mini",
      temperature: 0.8,
      max_tokens: 30,
    });

    return sanitizeBrand(data.choices[0].message.content.trim());
  } catch {
    LOG.error("Failed to generate title");
    return sanitizeBrand(topic.title);
  }
}
