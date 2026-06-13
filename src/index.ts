import express, { type Request, type Response, type NextFunction } from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerScanTools } from "./tools/scan.js";
import { registerOrganizeTools } from "./tools/organize.js";
import { registerDriveTools } from "./tools/drive.js";

const API_TOKEN = process.env.API_BEARER_TOKEN;

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!API_TOKEN) {
    // No token configured — auth disabled (local development)
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const provided = Buffer.from(header.slice(7));
  const expected = Buffer.from(API_TOKEN);

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    res.status(403).json({ error: "Invalid bearer token" });
    return;
  }

  next();
}

const app = express();
app.use(express.json());
app.use("/mcp", requireAuth);

const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // New session — create a new server + transport pair
  const server = new McpServer({
    name: "instagram-media-export",
    version: "1.0.0",
  });

  registerScanTools(server);
  registerOrganizeTools(server);
  registerDriveTools(server);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) transports.delete(sid);
  };

  await server.connect(transport);

  const sid = transport.sessionId;
  if (sid) transports.set(sid, transport);

  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

const PORT = parseInt(process.env.PORT || "3100", 10);
app.listen(PORT, () => {
  console.log(`Instagram Media Export MCP server running on port ${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
