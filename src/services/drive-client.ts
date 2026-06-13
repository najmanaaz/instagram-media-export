import { google } from "googleapis";
import * as fs from "node:fs";
import * as path from "node:path";
import mime from "mime-types";
import { RESUMABLE_UPLOAD_THRESHOLD } from "../constants.js";

function getAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Google OAuth2 credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN environment variables."
    );
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

function getDrive() {
  return google.drive({ version: "v3", auth: getAuth() });
}

export async function createFolder(
  name: string,
  parentId?: string
): Promise<{ id: string; webViewLink: string }> {
  const drive = getDrive();

  // Check for existing folder with same name under same parent (idempotent)
  const query = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
  ];
  if (parentId) {
    query.push(`'${parentId}' in parents`);
  }

  const existing = await drive.files.list({
    q: query.join(" and "),
    fields: "files(id, webViewLink)",
    spaces: "drive",
  });

  if (existing.data.files && existing.data.files.length > 0) {
    const file = existing.data.files[0];
    return {
      id: file.id!,
      webViewLink: file.webViewLink || `https://drive.google.com/drive/folders/${file.id}`,
    };
  }

  const parents = parentId ? [parentId] : undefined;
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents,
    },
    fields: "id, webViewLink",
  });

  return {
    id: res.data.id!,
    webViewLink:
      res.data.webViewLink ||
      `https://drive.google.com/drive/folders/${res.data.id}`,
  };
}

export async function uploadFile(
  filePath: string,
  folderId: string,
  mimeType?: string
): Promise<{ id: string; webViewLink: string }> {
  const drive = getDrive();
  const fileName = path.basename(filePath);
  const resolvedMime =
    mimeType || mime.lookup(filePath) || "application/octet-stream";
  const stat = fs.statSync(filePath);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: resolvedMime,
      body: fs.createReadStream(filePath),
    },
    fields: "id, webViewLink",
    // googleapis automatically uses resumable upload for larger files
    ...(stat.size > RESUMABLE_UPLOAD_THRESHOLD ? {} : {}),
  });

  return {
    id: res.data.id!,
    webViewLink:
      res.data.webViewLink ||
      `https://drive.google.com/file/d/${res.data.id}/view`,
  };
}

export async function listFilesInFolder(
  folderId: string
): Promise<{ name: string; id: string }[]> {
  const drive = getDrive();
  const files: { name: string; id: string }[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      spaces: "drive",
      pageSize: 1000,
      pageToken,
    });

    if (res.data.files) {
      for (const f of res.data.files) {
        if (f.id && f.name) {
          files.push({ id: f.id, name: f.name });
        }
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}
