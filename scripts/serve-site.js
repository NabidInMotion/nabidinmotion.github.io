/**
 * Minimal static server for subscriber-site (handles paths with spaces on Windows).
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.SITE_PORT || 3080);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "subscriber-site");
const MAX_BODY_BYTES = 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]).replace(/^\/+/, "");
  const resolved = path.normalize(path.join(ROOT, decoded));
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}

function cacheControlFor(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");
  if (rel.startsWith("assets/")) return "public, max-age=31536000, immutable";
  // Dev server: never cache app JS/CSS/content so curriculum sync + bugfixes show up on refresh.
  if (rel.startsWith("content/") || rel.startsWith("css/") || rel.startsWith("js/") || rel.startsWith("data/")) {
    return "no-cache";
  }
  return "no-cache";
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
      res.end("Method not allowed");
      return;
    }

    const contentLength = Number(req.headers["content-length"] || 0);
    if (contentLength > MAX_BODY_BYTES) {
      res.writeHead(413, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Payload too large");
      return;
    }

    let filePath = safePath(req.url === "/" ? "/index.html" : req.url);
    if (!filePath) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    let st = await stat(filePath).catch(() => null);
    if (st?.isDirectory()) filePath = path.join(filePath, "index.html");

    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": cacheControlFor(filePath),
      "X-Content-Type-Options": "nosniff",
    };

    if (req.method === "HEAD") {
      st = await stat(filePath).catch(() => null);
      if (!st) {
        res.writeHead(404, headers);
        res.end();
        return;
      }
      res.writeHead(200, { ...headers, "Content-Length": st.size });
      res.end();
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log("");
  console.log("  Nabid In Motion Study Hub");
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → http://localhost:${PORT}/learn.html?g=learning-roadmap`);
  console.log("");
  console.log("  Curriculum: subscriber-site/content/ (265 lessons)");
  console.log("  Refresh content: npm run sync:curriculum");
  console.log("");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  Port ${PORT} is already in use — the Study Hub may already be running.`);
    console.error(`  Open http://localhost:${PORT} in your browser.\n`);
    process.exit(0);
  }
  throw err;
});
