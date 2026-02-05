import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  fetchBlueskyEvents,
  fetchGitHubEvents,
  generateCatchyTitle,
  generateSmartDigest,
} from "../src/lib/events";
import { PostSchema, type Topic } from "../src/lib/schema";

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

async function getRecentTitles(count = 15): Promise<string[]> {
  try {
    const files = await readdir(POST_DIR);
    const jsonFiles = files
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, count);

    const titles: string[] = [];
    for (const file of jsonFiles) {
      const content = await readFile(join(POST_DIR, file), "utf-8");
      const data = JSON.parse(content);
      if (data.title) titles.push(data.title);
    }
    return titles;
  } catch {
    return [];
  }
}

async function run() {
  console.log("\n\x1b[1m🚀 Generating Intelligent Topic Digest\x1b[0m");

  const now = new Date();
  const marks = [6, 14, 22];
  const windowSize = 8 * 60 * 60 * 1000; // 8 hours: event fetch window
  const snapWindow = 2 * 60 * 60 * 1000; // 2 hours: snap-to-future threshold

  const candidates: Date[] = [];
  [-1, 0, 1].forEach((dayOffset) => {
    marks.forEach((hour) => {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + dayOffset);
      d.setUTCHours(hour, 0, 0, 0);
      candidates.push(d);
    });
  });

  const futureMark = candidates
    .filter((d) => d.getTime() >= now.getTime())
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const pastMark = candidates
    .filter((d) => d.getTime() < now.getTime())
    .sort((a, b) => b.getTime() - a.getTime())[0];

  if (!futureMark || !pastMark) {
    throw new Error("Failed to compute time marks from candidates");
  }

  const diffToFuture = futureMark.getTime() - now.getTime();
  const nearestMark = diffToFuture <= snapWindow ? futureMark : pastMark;

  const startTime = new Date(nearestMark.getTime() - windowSize);

  console.log(
    `\x1b[34m[INFO]\x1b[0m Target Mark: ${nearestMark.toISOString()}`
  );
  console.log(
    `\x1b[34m[INFO]\x1b[0m Window: ${startTime.toISOString()} -> ${nearestMark.toISOString()}`
  );

  try {
    const [gh, bs, recentTitles] = await Promise.all([
      fetchGitHubEvents(startTime, nearestMark),
      fetchBlueskyEvents(startTime, nearestMark),
      getRecentTitles(20),
    ]);

    const allEvents = [...gh, ...bs];
    const topics = await generateSmartDigest(allEvents);

    if (topics.length === 0) {
      console.log("\x1b[33mNo topics found. Skipping generation.\x1b[0m");
      return;
    }

    const heroTopic = pickWeightedTopic(topics);
    const catchyTitle = await generateCatchyTitle(heroTopic, recentTitles);

    const type = getPostType(nearestMark);
    const dateStr = nearestMark.toISOString().split("T")[0];
    const slug = `${dateStr}-${type}`;

    const postData = {
      title: catchyTitle,
      date: nearestMark.toISOString(),
      type,
      topics,
    };

    const validatedPost = PostSchema.parse(postData);

    await mkdir(POST_DIR, { recursive: true });
    await writeFile(
      join(POST_DIR, `${slug}.json`),
      JSON.stringify(validatedPost, null, 2)
    );

    console.log(`\x1b[32m✅ Digest complete: ${slug}.json\x1b[0m`);
    console.log(`\x1b[35m[TITLE]\x1b[0m ${catchyTitle}\n`);
  } catch (error) {
    console.error("\x1b[31mCritical Failure:\x1b[0m", error);
    process.exit(1);
  }
}

run();
