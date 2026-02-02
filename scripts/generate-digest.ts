import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { PostSchema, type Topic } from "../src/lib/schema";
import {
  fetchGitHubEvents,
  fetchBlueskyEvents,
  generateSmartDigest,
  generateCatchyTitle,
} from "../src/lib/events";

const POST_DIR = join(process.cwd(), "src/content/posts");

function pickWeightedTopic(topics: Topic[]): Topic {
  const totalWeight = topics.reduce((sum, t) => sum + t.relevanceScore, 0);
  let random = Math.random() * totalWeight;

  for (const topic of topics) {
    if (random < topic.relevanceScore) return topic;
    random -= topic.relevanceScore;
  }

  return topics[0];
}

function getPostType(date: Date): "daily" | "midday" | "nightly" {
  const hour = date.getUTCHours() + 1; // Basic UTC+1 adjustment

  // Shifted 1h early to protect against early GitHub Action triggers
  const isDaily = hour >= 5 && hour < 13; // Target 6am
  const isMidday = hour >= 13 && hour < 21; // Target 2pm

  if (isDaily) return "daily";
  if (isMidday) return "midday";
  return "nightly"; // Target 10pm
}

async function run() {
  console.log("\n\x1b[1m🚀 Generating Intelligent Topic Digest\x1b[0m");

  const now = new Date();
  const windowSize = 8 * 60 * 60 * 1000;
  const startTime = new Date(now.getTime() - windowSize);

  try {
    const [gh, bs] = await Promise.all([
      fetchGitHubEvents(startTime),
      fetchBlueskyEvents(startTime),
    ]);

    const allEvents = [...gh, ...bs];
    const topics = await generateSmartDigest(allEvents);

    if (topics.length === 0) {
      console.log("\x1b[33mNo topics found. Skipping generation.\x1b[0m");
      return;
    }

    const heroTopic = pickWeightedTopic(topics);
    const catchyTitle = await generateCatchyTitle(heroTopic);

    const type = getPostType(now);
    const dateStr = now.toISOString().split("T")[0];
    const slug = `${dateStr}-${type}`;

    const postData = {
      title: catchyTitle,
      date: now.toISOString(),
      type,
      topics,
    };

    const validatedPost = PostSchema.parse(postData);

    await mkdir(POST_DIR, { recursive: true });
    await writeFile(
      join(POST_DIR, `${slug}.json`),
      JSON.stringify(validatedPost, null, 2),
    );

    console.log(`\x1b[32m✅ Digest complete: ${slug}.json\x1b[0m`);
    console.log(`\x1b[35m[TITLE]\x1b[0m ${catchyTitle}\n`);
  } catch (error) {
    console.error("\x1b[31mCritical Failure:\x1b[0m", error);
    process.exit(1);
  }
}

run();
