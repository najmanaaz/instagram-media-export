# Instagram Media Export — MCP Server

A TypeScript MCP server that scans a downloaded Instagram data export, organizes media by metadata (date, location, caption), and uploads it to Google Drive in an organized folder/album structure.

## Setup

```bash
npm install
npm run build
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your Google OAuth2 credentials:

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
PORT=3100
```

## Google Drive OAuth2 Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **Google Drive API** under APIs & Services
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Choose **Desktop app** as the application type
6. Download the credentials JSON

### Get a Refresh Token

Run this one-time script to authorize and get a refresh token:

```bash
node -e "
const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const open = require('open');

const oauth2 = new google.auth.OAuth2(
  'YOUR_CLIENT_ID',
  'YOUR_CLIENT_SECRET',
  'http://localhost:3000/callback'
);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/drive.file'],
  prompt: 'consent',
});

const server = http.createServer(async (req, res) => {
  const query = url.parse(req.url, true).query;
  if (query.code) {
    const { tokens } = await oauth2.getToken(query.code);
    console.log('\nRefresh Token:', tokens.refresh_token);
    res.end('Authorization successful! You can close this window.');
    server.close();
  }
}).listen(3000, () => {
  console.log('Open this URL in your browser:\n', authUrl);
});
"
```

Copy the printed refresh token into your `.env` file.

## Running

```bash
npm start
```

The server starts on `http://localhost:3100/mcp` (Streamable HTTP transport).

## Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector http://localhost:3100/mcp
```

## Tools

### `scan_export`
Recursively scans an Instagram data export folder for media files.

**Input:** `{ exportPath: "/path/to/instagram-export" }`

### `get_media_metadata`
Gets detailed metadata for a single media file.

**Input:** `{ filePath: "/path/to/photo.jpg" }`

### `sort_media`
Groups media items by month, year, location, type, or caption keyword.

**Input:** `{ items: [...], groupBy: "month" }`

### `preview_groups`
Generates a human-readable summary of album groups.

**Input:** `{ groups: [...] }`

### `create_drive_folder`
Creates a folder in Google Drive (idempotent).

**Input:** `{ folderName: "My Album", parentFolderId?: "..." }`

### `upload_media_to_drive`
Uploads media files to a Google Drive folder, skipping duplicates.

**Input:** `{ items: [...], targetFolderId: "..." }`

### `migrate_export`
End-to-end migration with resume support: scan, organize, create folders, upload.

**Input:** `{ exportPath: "/path/to/export", groupBy: "month" }`

## Example Tool Call Sequence

```
1. scan_export({ exportPath: "./my-instagram-export" })
2. sort_media({ items: <result.items>, groupBy: "month" })
3. preview_groups({ groups: <result.groups> })
4. migrate_export({ exportPath: "./my-instagram-export", groupBy: "month" })
```

## Test Fixtures

The `test-fixtures/fake-export/` directory contains a minimal Instagram export structure for testing `scan_export` and `sort_media` without real data.
