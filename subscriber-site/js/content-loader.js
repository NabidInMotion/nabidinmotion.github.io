/**
 * Load synced curriculum JSON with clear errors when content is missing.
 */
export class ContentLoadError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const MAX_JSON_BYTES = 2 * 1024 * 1024;
const META_PATHS = new Set([
  "content/manifest.json",
  "content/search-index.json",
  "content/changelog.json",
]);

let contentVersion = null;

/** Cache-bust lesson JSON after manifest load (syncedAt or commit). */
export function setContentVersion(version) {
  if (typeof version === "string" && version.length > 0 && version.length <= 64) {
    contentVersion = version;
  }
}

function versionedPath(path) {
  if (META_PATHS.has(path) || path.includes("?") || !contentVersion) return path;
  return `${path}?v=${encodeURIComponent(contentVersion)}`;
}

function fetchCacheMode(path) {
  return META_PATHS.has(path) ? "no-cache" : "default";
}

export async function loadContentJSON(path) {
  if (window.location.protocol === "file:") {
    throw new ContentLoadError(
      "file_protocol",
      "Open the site through a local server (npm run site), not as a file on disk."
    );
  }

  const res = await fetch(versionedPath(path), {
    credentials: "same-origin",
    cache: fetchCacheMode(path),
  });
  const text = await res.text();

  if (!res.ok) {
    throw new ContentLoadError(
      "missing",
      `Curriculum file not found (${path}). Run npm run sync:curriculum, then npm run site.`
    );
  }

  if (text.length > MAX_JSON_BYTES) {
    throw new ContentLoadError("invalid", `Curriculum file too large (${path}).`);
  }

  const trimmed = text.trimStart();
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
    throw new ContentLoadError(
      "wrong_server",
      "Curriculum JSON returned a web page instead of data. Use npm run site and open http://localhost:3080 (not port 3000 if another app uses it)."
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    const hint =
      window.location.hostname.endsWith("github.io")
        ? " If you opened this page before a recent deploy, hard-refresh (Ctrl+Shift+R) to clear cached curriculum files."
        : "";
    throw new ContentLoadError(
      "invalid",
      `Could not parse curriculum data from ${path}.${hint}`
    );
  }
}

export async function loadManifest() {
  const manifest = await loadContentJSON("content/manifest.json");
  const version =
    manifest?.syncedAt ||
    manifest?.legal?.sourceCommit ||
    manifest?.legal?.contentSyncedAt ||
    null;
  if (version) setContentVersion(String(version));
  return manifest;
}

export function renderContentError(container, error) {
  container.replaceChildren();
  const box = document.createElement("div");
  box.className = "content-error";

  const h2 = document.createElement("h2");
  h2.textContent = "Curriculum not loaded";
  box.append(h2);

  const p = document.createElement("p");
  p.textContent = error?.message || "Unknown error.";
  box.append(p);

  const ol = document.createElement("ol");
  const steps =
    error?.code === "invalid" && window.location.hostname.endsWith("github.io")
      ? [
          "Hard-refresh this page (Ctrl+Shift+R or Cmd+Shift+R)",
          "If it still fails, wait one minute and try again (GitHub Pages cache)",
          "Open the study hub homepage and pick the lesson from the sidebar",
        ]
      : [
          "Run npm run sync:curriculum in the project folder",
          "Run npm run site",
          "Open http://localhost:3080",
          "Click Read Roadmap or Learn",
        ];
  for (const step of steps) {
    const li = document.createElement("li");
    li.textContent = step;
    ol.append(li);
  }
  box.append(ol);
  container.append(box);
}
