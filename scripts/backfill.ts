import { z } from "zod";
import { spawn } from "child_process";

const END_TIME_CONSTANT = "2026-02-03T14:00:00Z";
const WINDOW_HOURS = 8;

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
};

async function copyToClipboard(text: string): Promise<void> {
  const platform = process.platform;
  let command = "";
  let args: string[] = [];

  if (platform === "win32") {
    command = "clip";
  } else if (platform === "darwin") {
    command = "pbcopy";
  } else {
    command = "xsel";
    args = ["--clipboard", "--input"];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    child.on("error", () =>
      reject(new Error(`Failed to use ${command}. Is it installed?`)),
    );
    child.stdin.write(text);
    child.stdin.end();
    child.on("exit", () => resolve());
  });
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Environment variable ${key} is missing.`);
  return value;
}

export async function fetchGitHubEvents(
  start: Date,
  end: Date,
): Promise<Event[]> {
  const owner = "npmx-dev";
  const repo = "npmx.dev";
  const token = getRequiredEnv("GITHUB_TOKEN");
  const events: Event[] = [];

  const startIso = start.toISOString().split(".")[0] + "Z";
  const endIso = end.toISOString().split(".")[0] + "Z";

  const query = encodeURIComponent(
    `repo:${owner}/${repo} is:closed reason:completed -is:unmerged closed:${startIso}..${endIso}`,
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
      for (const item of data.items || []) {
        const isPR = !!item.pull_request;
        events.push({
          source: "github",
          title: `${isPR ? "Merged PR" : "Closed Issue"} #${item.number}: ${item.title}`,
          description: item.body || "",
          url: item.html_url,
          timestamp: item.closed_at,
        });
      }
    }
  } catch {
    LOG.error("GitHub fetch failed.");
  }
  return events;
}

export async function fetchBlueskyEvents(
  start: Date,
  end: Date,
): Promise<Event[]> {
  const handle = "npmx.dev";
  const events: Event[] = [];
  let cursor: string | undefined;
  let reachedBeforeStart = false;

  try {
    const resolve = await fetch(
      `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`,
    );
    if (!resolve.ok) return [];
    const { did } = await resolve.json();

    while (!reachedBeforeStart) {
      const url = new URL(
        "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed",
      );
      url.searchParams.set("actor", did);
      url.searchParams.set("limit", "100");
      url.searchParams.set("filter", "posts_with_replies");
      if (cursor) url.searchParams.set("cursor", cursor);

      const response = await fetch(url.toString());
      if (!response.ok) break;

      const data = await response.json();
      const feed = data.feed || [];
      cursor = data.cursor;

      if (feed.length === 0) break;

      for (const item of feed) {
        const timestamp = item.reason?.indexedAt || item.post.indexedAt;
        const itemDate = new Date(timestamp);

        if (itemDate < start) {
          reachedBeforeStart = true;
          continue;
        }

        if (itemDate <= end) {
          const post = item.post;
          const authorHandle = post.author.handle;
          const postId = post.uri.split("/").pop();
          const isRepost = !!item.reason;

          events.push({
            source: "bluesky",
            title: `${isRepost ? `[Repost from @${authorHandle}] ` : ""}${post.record.text.substring(0, 80)}`,
            description: post.record.text,
            url: `https://bsky.app/profile/${authorHandle}/post/${postId}`,
            timestamp: itemDate.toISOString(),
          });
        }
      }
      if (!cursor) break;
    }
  } catch {
    LOG.error("Bluesky fetch failed.");
  }
  return events;
}

async function run() {
  // Ensuring MODELS_TOKEN exists even if not used for fetching,
  // to maintain consistency with the lib requirement.
  getRequiredEnv("MODELS_TOKEN");

  const end = new Date(END_TIME_CONSTANT);
  const start = new Date(end.getTime() - WINDOW_HOURS * 60 * 60 * 1000);

  LOG.info(`Fetching window: ${start.toISOString()} to ${end.toISOString()}`);

  const [gh, bsky] = await Promise.all([
    fetchGitHubEvents(start, end),
    fetchBlueskyEvents(start, end),
  ]);

  const SOURCE_PRIORITY: Record<string, number> = {
    bluesky: 1,
    github: 2,
  };

  const allEvents = [...gh, ...bsky].sort((a, b) => {
    const timeDiff =
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    if (timeDiff !== 0) return timeDiff;

    const priorityA = SOURCE_PRIORITY[a.source] || 99;
    const priorityB = SOURCE_PRIORITY[b.source] || 99;
    return priorityA - priorityB;
  });

  if (allEvents.length === 0) {
    LOG.warn("No events found.");
    return;
  }

  const finalPayload = {
    metadata: {
      generatedAt: end.toISOString(),
      window: {
        start: start.toISOString(),
        end: end.toISOString(),
        hours: WINDOW_HOURS,
      },
    },
    events: allEvents,
  };

  try {
    const output = JSON.stringify(finalPayload, null, 2);
    await copyToClipboard(output);
    LOG.success(`Copied ${allEvents.length} items with metadata to clipboard!`);
  } catch (err: any) {
    LOG.error(`Clipboard failed: ${err.message}`);
    console.log(JSON.stringify(finalPayload, null, 2));
  }
}

run();
