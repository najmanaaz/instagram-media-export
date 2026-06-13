import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import {
  MEDIA_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MEDIA_DIRS,
} from "../constants.js";
import type { MediaItem } from "../types.js";

function getMediaType(ext: string): "image" | "video" {
  return IMAGE_EXTENSIONS.has(ext) ? "image" : "video";
}

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await walkDir(fullPath);
      results.push(...sub);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function findMetadataFile(filePath: string): string | undefined {
  const dir = path.dirname(filePath);
  const stem = path.basename(filePath, path.extname(filePath));
  const jsonPath = path.join(dir, `${stem}.json`);
  if (fs.existsSync(jsonPath)) {
    return jsonPath;
  }
  return undefined;
}

interface InstagramMediaEntry {
  uri?: string;
  creation_timestamp?: number;
  title?: string;
  media_metadata?: {
    photo_metadata?: {
      exif_data?: Array<{
        latitude?: number;
        longitude?: number;
      }>;
    };
  };
}

function parseInstagramJson(
  raw: unknown
): InstagramMediaEntry | undefined {
  // Per-file JSON: array with objects containing a "media" array
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object" && "media" in item) {
        const mediaArr = (item as { media: InstagramMediaEntry[] }).media;
        if (Array.isArray(mediaArr) && mediaArr.length > 0) {
          return mediaArr[0];
        }
      }
      // Could also be a direct array of media entries
      if (item && typeof item === "object" && "uri" in item) {
        return item as InstagramMediaEntry;
      }
    }
    return undefined;
  }
  // Direct object with media fields
  if (raw && typeof raw === "object" && "uri" in raw) {
    return raw as InstagramMediaEntry;
  }
  // Object wrapping a media array
  if (
    raw &&
    typeof raw === "object" &&
    "media" in raw
  ) {
    const mediaArr = (raw as { media: InstagramMediaEntry[] }).media;
    if (Array.isArray(mediaArr) && mediaArr.length > 0) {
      return mediaArr[0];
    }
  }
  return undefined;
}

export async function parseMetadata(filePath: string): Promise<MediaItem> {
  const absPath = path.resolve(filePath);
  const stat = await fsp.stat(absPath);
  const ext = path.extname(absPath).toLowerCase();

  const item: MediaItem = {
    filePath: absPath,
    relativePath: filePath,
    type: getMediaType(ext),
    fileSize: stat.size,
  };

  const metadataFile = findMetadataFile(absPath);
  if (metadataFile) {
    item.metadataFile = metadataFile;
    try {
      const raw = JSON.parse(await fsp.readFile(metadataFile, "utf-8"));
      const entry = parseInstagramJson(raw);
      if (entry) {
        if (entry.creation_timestamp) {
          item.timestamp = new Date(
            entry.creation_timestamp * 1000
          ).toISOString();
        }
        if (entry.title) {
          item.caption = entry.title;
        }
        const exif =
          entry.media_metadata?.photo_metadata?.exif_data;
        if (exif && exif.length > 0) {
          const loc = exif[0];
          if (loc.latitude !== undefined && loc.longitude !== undefined) {
            if (loc.latitude !== 0 || loc.longitude !== 0) {
              item.location = `${loc.latitude},${loc.longitude}`;
            }
          }
        }
      }
    } catch {
      // Metadata parse failed — continue without it
    }
  }

  // Compute hash
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(absPath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  item.hash = hash.digest("hex");

  return item;
}

export async function scanExport(exportPath: string): Promise<MediaItem[]> {
  const absExportPath = path.resolve(exportPath);
  const items: MediaItem[] = [];

  // Walk known media directories
  for (const mediaDir of MEDIA_DIRS) {
    const fullDir = path.join(absExportPath, mediaDir);
    const files = await walkDir(fullDir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!MEDIA_EXTENSIONS.has(ext)) continue;

      const relativePath = path.relative(absExportPath, file);
      const metadataFile = findMetadataFile(file);
      const stat = await fsp.stat(file);

      const item: MediaItem = {
        filePath: file,
        relativePath,
        type: getMediaType(ext),
        fileSize: stat.size,
      };

      if (metadataFile) {
        item.metadataFile = metadataFile;
        try {
          const raw = JSON.parse(
            await fsp.readFile(metadataFile, "utf-8")
          );
          const entry = parseInstagramJson(raw);
          if (entry) {
            if (entry.creation_timestamp) {
              item.timestamp = new Date(
                entry.creation_timestamp * 1000
              ).toISOString();
            }
            if (entry.title) {
              item.caption = entry.title;
            }
            const exif =
              entry.media_metadata?.photo_metadata?.exif_data;
            if (exif && exif.length > 0) {
              const loc = exif[0];
              if (
                loc.latitude !== undefined &&
                loc.longitude !== undefined
              ) {
                if (loc.latitude !== 0 || loc.longitude !== 0) {
                  item.location = `${loc.latitude},${loc.longitude}`;
                }
              }
            }
          }
        } catch {
          // Skip metadata parsing errors
        }
      }

      items.push(item);
    }
  }

  return items;
}
