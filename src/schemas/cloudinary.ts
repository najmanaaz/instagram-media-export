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

export const CreateCloudinaryFolderInputSchema = z.object({
  folderPath: z
    .string()
    .describe("Folder path to create in Cloudinary (e.g. 'instagram-export/2024-01')"),
});

export const UploadToCloudinaryInputSchema = z.object({
  items: z.array(MediaItemSchema).describe("Media items to upload"),
  folder: z
    .string()
    .describe("Cloudinary folder path to upload into"),
  batchSize: z
    .number()
    .optional()
    .describe("Number of files to upload concurrently (default 10)"),
});

export const MigrateToCloudinaryInputSchema = z.object({
  exportPath: z.string().describe("Path to extracted Instagram export folder"),
  groupBy: z
    .enum(["month", "year", "location", "type"])
    .describe("How to organize media into sub-folders"),
  rootFolderName: z
    .string()
    .optional()
    .describe("Name for the root Cloudinary folder"),
  stateFilePath: z
    .string()
    .optional()
    .describe("Path to migration state file for resume support"),
});
