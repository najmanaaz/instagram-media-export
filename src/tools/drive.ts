import * as path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CreateDriveFolderInputSchema,
  UploadMediaToDriveInputSchema,
  MigrateExportInputSchema,
} from "../schemas/drive.js";
import {
  createFolder,
  uploadFile,
  listFilesInFolder,
} from "../services/drive-client.js";
import { scanExport } from "../services/instagram-parser.js";
import {
  loadState,
  saveState,
  isFileUploaded,
  markFileUploaded,
  getDefaultStatePath,
} from "../services/migration-state.js";
import { DEFAULT_ROOT_FOLDER_NAME, DEFAULT_BATCH_SIZE, MONTH_NAMES } from "../constants.js";
import type { MediaItem, AlbumGroup, MigrationState } from "../types.js";

function groupItems(
  items: MediaItem[],
  groupBy: "month" | "year" | "location" | "type"
): AlbumGroup[] {
  const groups = new Map<string, MediaItem[]>();

  for (const item of items) {
    let key: string;
    switch (groupBy) {
      case "month": {
        if (item.timestamp) {
          const d = new Date(item.timestamp);
          const month = String(d.getMonth() + 1).padStart(2, "0");
          key = `${d.getFullYear()}-${month} ${MONTH_NAMES[d.getMonth()]}`;
        } else {
          key = "Unknown Date";
        }
        break;
      }
      case "year":
        key = item.timestamp
          ? String(new Date(item.timestamp).getFullYear())
          : "Unknown Date";
        break;
      case "location":
        key = item.location || "No Location";
        break;
      case "type":
        key = item.type === "image" ? "Images" : "Videos";
        break;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  return [...groups.entries()].map(([name, groupItems]) => ({
    name,
    criteria: `${groupBy}:${name}`,
    items: groupItems,
    itemCount: groupItems.length,
  }));
}

export function registerDriveTools(server: McpServer): void {
  server.tool(
    "create_drive_folder",
    "Create a folder in Google Drive (idempotent — reuses existing folder with same name)",
    CreateDriveFolderInputSchema.shape,
    async ({ folderName, parentFolderId }) => {
      const result = await createFolder(folderName, parentFolderId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                folderId: result.id,
                folderName,
                webViewLink: result.webViewLink,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "upload_media_to_drive",
    "Upload media files to a Google Drive folder, skipping files already present",
    UploadMediaToDriveInputSchema.shape,
    async ({ items, targetFolderId, batchSize }) => {
      const effectiveBatchSize = batchSize ?? DEFAULT_BATCH_SIZE;
      const existingFiles = await listFilesInFolder(targetFolderId);
      const existingNames = new Set(existingFiles.map((f) => f.name));

      let uploaded = 0;
      let skipped = 0;
      const failed: string[] = [];
      const driveFileIds: Record<string, string> = {};

      // Process in batches
      for (let i = 0; i < items.length; i += effectiveBatchSize) {
        const batch = items.slice(i, i + effectiveBatchSize);
        const uploadPromises = batch.map(async (item) => {
          const fileName = path.basename(item.filePath);
          if (existingNames.has(fileName)) {
            skipped++;
            return;
          }
          try {
            const result = await uploadFile(item.filePath, targetFolderId);
            driveFileIds[item.relativePath] = result.id;
            existingNames.add(fileName);
            uploaded++;
          } catch (err) {
            failed.push(
              `${item.relativePath}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        });
        await Promise.all(uploadPromises);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { uploaded, skipped, failed, driveFileIds },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "migrate_export",
    "End-to-end migration: scan Instagram export, organize into groups, create Drive folders, and upload with resume support",
    MigrateExportInputSchema.shape,
    async ({
      exportPath,
      groupBy,
      rootFolderName,
      parentFolderId,
      stateFilePath,
    }) => {
      const resolvedStatePath =
        stateFilePath || getDefaultStatePath(exportPath);
      const effectiveRootName = rootFolderName || DEFAULT_ROOT_FOLDER_NAME;

      // Try to resume from existing state
      let state = loadState(resolvedStatePath);
      let rootFolderId: string;

      if (state) {
        rootFolderId = state.rootFolderId;
      } else {
        // Create root folder
        const rootFolder = await createFolder(
          effectiveRootName,
          parentFolderId
        );
        rootFolderId = rootFolder.id;
        state = {
          rootFolderId,
          exportPath: path.resolve(exportPath),
          groups: {},
          startedAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
        };
        saveState(resolvedStatePath, state);
      }

      // Scan export
      const items = await scanExport(exportPath);
      const groups = groupItems(items, groupBy);

      let totalUploaded = 0;
      let totalSkipped = 0;
      let groupsCreated = 0;

      for (const group of groups) {
        // Create sub-folder
        let folderId: string;
        if (state.groups[group.name]?.folderId) {
          folderId = state.groups[group.name].folderId;
        } else {
          const folder = await createFolder(group.name, rootFolderId);
          folderId = folder.id;
          if (!state.groups[group.name]) {
            state.groups[group.name] = { folderId, uploaded: {} };
          } else {
            state.groups[group.name].folderId = folderId;
          }
          groupsCreated++;
          saveState(resolvedStatePath, state);
        }

        // Upload files in this group
        for (const item of group.items) {
          if (isFileUploaded(state, group.name, item.relativePath)) {
            totalSkipped++;
            continue;
          }
          try {
            const result = await uploadFile(item.filePath, folderId);
            markFileUploaded(
              state,
              group.name,
              item.relativePath,
              result.id
            );
            totalUploaded++;
            saveState(resolvedStatePath, state);
          } catch (err) {
            // Log but continue
            console.error(
              `Failed to upload ${item.relativePath}:`,
              err instanceof Error ? err.message : err
            );
          }
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                rootFolderId,
                groupsCreated,
                totalUploaded,
                totalSkipped,
                stateFilePath: resolvedStatePath,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
