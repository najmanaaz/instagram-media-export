export interface MediaItem {
  filePath: string;
  relativePath: string;
  type: "image" | "video";
  metadataFile?: string;
  timestamp?: string;
  caption?: string;
  location?: string;
  fileSize: number;
  hash?: string;
}

export interface AlbumGroup {
  name: string;
  criteria: string;
  items: MediaItem[];
  dateRange?: { start: string; end: string };
  itemCount: number;
}

export interface MigrationState {
  rootFolderId: string;
  exportPath: string;
  groups: Record<
    string,
    {
      folderId: string;
      uploaded: Record<string, { driveFileId: string; uploadedAt: string }>;
    }
  >;
  startedAt: string;
  lastUpdatedAt: string;
}

export type GroupByOption =
  | "month"
  | "year"
  | "location"
  | "type"
  | "caption_keyword";
