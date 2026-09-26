import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;

  if (requestedPath.startsWith("/artifacts/")) {
    requestedPath = requestedPath.replace("/artifacts/", "/artifacts/");
  }

  const safePath = path.normalize(path.join(rootDir, requestedPath));

  if (!safePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(safePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Web app is running at http://localhost:${PORT}`);
});
