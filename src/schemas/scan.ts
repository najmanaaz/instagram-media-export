import { z } from "zod";

export const ScanExportInputSchema = z.object({
  exportPath: z.string().describe("Path to extracted Instagram export folder"),
});

export const GetMediaMetadataInputSchema = z.object({
  filePath: z.string().describe("Path to a single media file"),
});
