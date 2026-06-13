import * as path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CreateCloudinaryFolderInputSchema,
  UploadToCloudinaryInputSchema,
  MigrateToCloudinaryInputSchema,
} from "../schemas/cloudinary.js";
import {
  createFolder,
  uploadAsset,
  listAssetsInFolder,
} from "../services/cloudinary-client.js";
import { scanExport } from "../services/instagram-parser.js";
import {
  loadState,
  saveState,
  isFileUploaded,
  markFileUploaded,
  getDefaultStatePath,
} from "../services/migration-state.js";
import {
  DEFAULT_CLOUDINARY_ROOT_FOLDER,
  DEFAULT_BATCH_SIZE,
  MONTH_NAMES,
} from "../constants.js";
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

export function registerCloudinaryTools(server: McpServer): void {
  server.tool(
    "create_cloudinary_folder",
    "Create a folder in Cloudinary",
    CreateCloudinaryFolderInputSchema.shape,
    async ({ folderPath }) => {
      const result = await createFolder(folderPath);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                folderPath: result.path,
                folderName: result.name,
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
    "upload_to_cloudinary",
    "Upload media files to a Cloudinary folder, skipping files already present",
    UploadToCloudinaryInputSchema.shape,
    async ({ items, folder, batchSize }) => {
      const effectiveBatchSize = batchSize ?? DEFAULT_BATCH_SIZE;
      const existingAssets = await listAssetsInFolder(folder);
      const existingNames = new Set(existingAssets.map((a) => a.filename));

      let uploaded = 0;
      let skipped = 0;
      const failed: string[] = [];
      const publicIds: Record<string, string> = {};

      for (let i = 0; i < items.length; i += effectiveBatchSize) {
        const batch = items.slice(i, i + effectiveBatchSize);
        const uploadPromises = batch.map(async (item) => {
          const fileName = path.basename(item.filePath, path.extname(item.filePath));
          if (existingNames.has(fileName)) {
            skipped++;
            return;
          }
          try {
            const result = await uploadAsset(item.filePath, folder);
            publicIds[item.relativePath] = result.publicId;
            existingNames.add(fileName);
            uploaded++;
          } catch (err) {
            const msg =
              err instanceof Error
                ? err.message
                : typeof err === "object" && err !== null && "error" in err
                  ? (err as { error: { message?: string } }).error.message ?? JSON.stringify(err)
                  : String(err);
            failed.push(`${item.relativePath}: ${msg}`);
          }
        });
        await Promise.all(uploadPromises);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { uploaded, skipped, failed, publicIds },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "migrate_to_cloudinary",
    "End-to-end migration: scan Instagram export, organize into groups, create Cloudinary folders, and upload with resume support",
    MigrateToCloudinaryInputSchema.shape,
    async ({ exportPath, groupBy, rootFolderName, stateFilePath }) => {
      const resolvedStatePath =
        stateFilePath || getDefaultStatePath(exportPath);
      const effectiveRootName =
        rootFolderName || DEFAULT_CLOUDINARY_ROOT_FOLDER;

      // Try to resume from existing state
      let state = loadState(resolvedStatePath);
      let rootFolder: string;

      if (state) {
        rootFolder = state.rootFolderId;
      } else {
        // Create root folder
        const created = await createFolder(effectiveRootName);
        rootFolder = created.path;
        state = {
          rootFolderId: rootFolder,
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
        const folderPath = `${rootFolder}/${group.name}`;

        let folderId: string;
        if (state.groups[group.name]?.folderId) {
          folderId = state.groups[group.name].folderId;
        } else {
          const folder = await createFolder(folderPath);
          folderId = folder.path;
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
            const result = await uploadAsset(item.filePath, folderPath);
            markFileUploaded(
              state,
              group.name,
              item.relativePath,
              result.publicId
            );
            totalUploaded++;
            saveState(resolvedStatePath, state);
          } catch (err) {
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
                rootFolder,
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
