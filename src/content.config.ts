import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { PostSchema } from "./lib/schema";

const posts = defineCollection({
  loader: glob({ pattern: "**/[^_]*.json", base: "./src/content/posts" }),
  schema: PostSchema,
});

export const collections = { posts };
