import { z } from "zod";

export const createPromptSchema = z.object({
  title: z.string().trim().min(8, "make it a real question").max(200),
  categoryId: z.string().cuid(),
  description: z.string().trim().max(1000).optional(),
  tags: z
    .array(z.string().trim().toLowerCase().min(2).max(24))
    .max(5)
    .default([]),
  maxUsers: z.number().int().min(2).max(10).default(10),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
});
export type CreatePromptDto = z.infer<typeof createPromptSchema>;

export const feedQuerySchema = z.object({
  cursor: z.string().optional(),
  category: z.string().optional(), // category slug
  sort: z.enum(["new", "hot"]).default("new"),
});
export type FeedQueryDto = z.infer<typeof feedQuerySchema>;
