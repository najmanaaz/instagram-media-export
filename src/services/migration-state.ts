import * as fs from "node:fs";
import * as path from "node:path";
import type { MigrationState } from "../types.js";
import { DEFAULT_STATE_FILENAME } from "../constants.js";

export function getDefaultStatePath(exportPath: string): string {
  return path.join(exportPath, DEFAULT_STATE_FILENAME);
}

export function loadState(stateFilePath: string): MigrationState | null {
  try {
    if (!fs.existsSync(stateFilePath)) return null;
    const raw = fs.readFileSync(stateFilePath, "utf-8");
    return JSON.parse(raw) as MigrationState;
  } catch {
    return null;
  }
}

export function saveState(
  stateFilePath: string,
  state: MigrationState
): void {
  state.lastUpdatedAt = new Date().toISOString();
  fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), "utf-8");
}

export function isFileUploaded(
  state: MigrationState,
  groupName: string,
  relativePath: string
): boolean {
  const group = state.groups[groupName];
  if (!group) return false;
  return relativePath in group.uploaded;
}

export function markFileUploaded(
  state: MigrationState,
  groupName: string,
  relativePath: string,
  driveFileId: string
): void {
  if (!state.groups[groupName]) {
    state.groups[groupName] = { folderId: "", uploaded: {} };
  }
  state.groups[groupName].uploaded[relativePath] = {
    driveFileId,
    uploadedAt: new Date().toISOString(),
  };
}
