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

export const CreateDriveFolderInputSchema = z.object({
  folderName: z.string().describe("Name of the folder to create"),
  parentFolderId: z
    .string()
    .optional()
    .describe("ID of the parent folder in Google Drive"),
});

export const UploadMediaToDriveInputSchema = z.object({
  items: z.array(MediaItemSchema).describe("Media items to upload"),
  targetFolderId: z
    .string()
    .describe("Google Drive folder ID to upload into"),
  batchSize: z
    .number()
    .optional()
    .describe("Number of files to upload concurrently (default 10)"),
});

export const MigrateExportInputSchema = z.object({
  exportPath: z.string().describe("Path to extracted Instagram export folder"),
  groupBy: z
    .enum(["month", "year", "location", "type"])
    .describe("How to organize media into sub-folders"),
  rootFolderName: z
    .string()
    .optional()
    .describe("Name for the root Google Drive folder"),
  parentFolderId: z
    .string()
    .optional()
    .describe("Google Drive parent folder ID for the root folder"),
  stateFilePath: z
    .string()
    .optional()
    .describe("Path to migration state file for resume support"),
});
