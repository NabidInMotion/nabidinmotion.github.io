/**
 * Load synced curriculum JSON with clear errors when content is missing.
 */
export class ContentLoadError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export async function loadContentJSON(path) {
  if (window.location.protocol === "file:") {
    throw new ContentLoadError(
      "file_protocol",
      "Open the site through a local server (npm run site), not as a file on disk."
    );
  }

  const res = await fetch(path, { credentials: "same-origin", cache: "default" });
  const text = await res.text();

  if (!res.ok) {
    throw new ContentLoadError(
      "missing",
      `Curriculum file not found (${path}). Run npm run sync:curriculum, then npm run site.`
    );
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
    throw new ContentLoadError("invalid", `Could not parse curriculum data from ${path}.`);
  }
}

export async function loadManifest() {
  return loadContentJSON("content/manifest.json");
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
  const steps = [
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
