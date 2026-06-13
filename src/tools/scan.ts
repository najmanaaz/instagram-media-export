import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ScanExportInputSchema, GetMediaMetadataInputSchema } from "../schemas/scan.js";
import { scanExport, parseMetadata } from "../services/instagram-parser.js";

export function registerScanTools(server: McpServer): void {
  server.tool(
    "scan_export",
    "Recursively scan an Instagram data export folder for media files and their metadata",
    ScanExportInputSchema.shape,
    async ({ exportPath }) => {
      const items = await scanExport(exportPath);
      const totalSizeBytes = items.reduce((sum, i) => sum + i.fileSize, 0);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { items, totalCount: items.length, totalSizeBytes },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "get_media_metadata",
    "Get detailed metadata for a single media file from an Instagram export",
    GetMediaMetadataInputSchema.shape,
    async ({ filePath }) => {
      const item = await parseMetadata(filePath);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(item, null, 2),
          },
        ],
      };
    }
  );
}
