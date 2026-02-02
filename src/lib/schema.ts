import { z } from "zod";

export const SourceSchema = z.object({
  platform: z.string(),
  url: z.string().url(),
});

export const TopicSchema = z.object({
  title: z.string(),
  summary: z.string(),
  relevanceScore: z.number().min(0).max(10),
  sources: z.array(SourceSchema),
});

export const PostSchema = z.object({
  title: z.string(),
  date: z.coerce.date(),
  type: z.enum(["daily", "nightly"]),
  topics: z.array(TopicSchema),
});

export type Source = z.infer<typeof SourceSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type Post = z.infer<typeof PostSchema>;
