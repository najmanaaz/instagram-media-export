import { z } from "zod";

const MediaItemSchema = z.object({
  filePath: z.string(),
  relativePath: z.string(),
  type: z.enum(["image", "video"]),
  metadataFile: z.string().optional(),
  timestamp: z.string().optional(),
  caption: z.string().optional(),
  location: z.string().optional(),
  fileSize: z.number(),
  hash: z.string().optional(),
});

const AlbumGroupSchema = z.object({
  name: z.string(),
  criteria: z.string(),
  items: z.array(MediaItemSchema),
  dateRange: z
    .object({ start: z.string(), end: z.string() })
    .optional(),
  itemCount: z.number(),
});

export const SortMediaInputSchema = z.object({
  items: z.array(MediaItemSchema).describe("Array of media items to sort"),
  groupBy: z
    .enum(["month", "year", "location", "type", "caption_keyword"])
    .describe("Grouping criteria"),
  keyword: z
    .string()
    .optional()
    .describe("Keyword to filter captions (required when groupBy is caption_keyword)"),
});

export const PreviewGroupsInputSchema = z.object({
  groups: z.array(AlbumGroupSchema).describe("Album groups to preview"),
});
