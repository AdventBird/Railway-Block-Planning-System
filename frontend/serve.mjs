/* ==========================================================================
   Railway Block Planning Portal — local static server (zero dependencies)
   --------------------------------------------------------------------------
   ES-module builds do not load from file:// (browser CORS rule), so run the
   portal over HTTP:  double-click start-portal.bat   (or:  node serve.mjs)
   Then sign in — the React prototype at network-diagram/dist works because
   it is served from the same origin.
   ========================================================================== */
import http from "http";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5252);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    // "/" → the built app (production demo). Dev servers use `npm run dev`.
    if (urlPath === "/index.html") urlPath = "/dist/index.html";
    const filePath = path.normalize(path.join(ROOT, urlPath));
    // Traversal guard: the resolved path must stay INSIDE the portal root
    // (startsWith(ROOT + sep) also rejects sibling directories like ./portal-evil).
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 - not found: " + urlPath);
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      });
      res.end(data);
    });
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad request");
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`Portal is already running -> http://localhost:${PORT}/`);
    console.log("(Open that address in your browser if it did not open.)");
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}/`;
  console.log("=================================================");
  console.log("  Railway Block Planning Portal");
  console.log(`  ->  ${url}`);
  console.log("  Sign in (e.g. admin@railways.gov.in / admin123)");
  console.log("  Keep this window open. Press Ctrl+C to stop.");
  console.log("=================================================");
  if (process.platform === "win32" && process.env.PORTAL_NO_OPEN !== "1") {
    exec(`start "" "${url}"`);
  }
});