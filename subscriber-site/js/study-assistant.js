/**
 * Study assistant — retrieval-only RAG over synced curriculum (no LLM, no network).
 * Answers are excerpts from published lessons with source links.
 */
import { loadContentJSON } from "./content-loader.js";
import { buildLearnUrl } from "./progress.js";
import { loadSearchIndex, searchRanked } from "./search.js";
import { clearChildren, el } from "./security.js";

const MAX_QUERY_LENGTH = 120;
const MAX_SOURCES = 5;
const MAX_ENRICH = 2;
const MAX_SNIPPET_CHARS = 420;
const MIN_SCORE = 1;

export function resolveEntryPath(manifest, entry) {
  if (!manifest || !entry) return null;
  if (entry.type === "guide") {
    const guide = manifest.guides?.find((g) => g.id === entry.guideId);
    return guide?.path || null;
  }
  const mod = manifest.modules?.find((m) => m.slug === entry.module);
  const lesson = mod?.lessons?.find((l) => l.id === entry.lessonId);
  return lesson?.path || null;
}

function filterIndex(index, moduleSlugs) {
  if (!moduleSlugs?.length) return index;
  const allowed = new Set(moduleSlugs);
  return {
    entries: (index.entries || []).filter(
      (e) => e.type === "guide" || allowed.has(e.module)
    ),
  };
}

/** Pure retrieval — testable without the DOM. */
export function retrieveRankedSources(index, query, { limit = MAX_SOURCES, moduleSlugs = null } = {}) {
  const filtered = filterIndex(index, moduleSlugs);
  return searchRanked(filtered, query, limit).filter((r) => r.score >= MIN_SCORE);
}

function htmlToPlain(html) {
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  return (wrap.textContent || "").replace(/\s+/g, " ").trim();
}

function excerptAroundQuery(plain, query) {
  if (!plain) return "";
  const tokens = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 8);
  const lower = plain.toLowerCase();
  let anchor = -1;
  for (const t of tokens) {
    const idx = lower.indexOf(t);
    if (idx !== -1) {
      anchor = idx;
      break;
    }
  }
  if (anchor === -1) {
    const cut = plain.slice(0, MAX_SNIPPET_CHARS);
    return plain.length > MAX_SNIPPET_CHARS ? `${cut}…` : cut;
  }
  const start = Math.max(0, anchor - 100);
  const slice = plain.slice(start, start + MAX_SNIPPET_CHARS);
  const prefix = start > 0 ? "…" : "";
  const suffix = start + MAX_SNIPPET_CHARS < plain.length ? "…" : "";
  return `${prefix}${slice}${suffix}`;
}

function entryHref(entry) {
  if (entry.type === "guide") return buildLearnUrl({ guideId: entry.guideId });
  return buildLearnUrl({ module: entry.module, lessonId: entry.lessonId });
}

function sourceLabel(entry) {
  if (entry.type === "guide") return entry.title;
  const mod = entry.moduleTitle || entry.module;
  return `${mod} · ${entry.title}`;
}

async function enrichSource(manifest, ranked, query) {
  const path = resolveEntryPath(manifest, ranked.entry);
  if (!path) {
    return {
      entry: ranked.entry,
      score: ranked.score,
      snippet: ranked.entry.excerpt || ranked.entry.text || "",
      href: entryHref(ranked.entry),
      label: sourceLabel(ranked.entry),
    };
  }
  try {
    const lesson = await loadContentJSON(`content/${path}`);
    const plain = htmlToPlain(lesson.html || "");
    const snippet = excerptAroundQuery(plain, query) || ranked.entry.excerpt || "";
    return {
      entry: ranked.entry,
      score: ranked.score,
      snippet,
      href: entryHref(ranked.entry),
      label: sourceLabel(ranked.entry),
    };
  } catch {
    return {
      entry: ranked.entry,
      score: ranked.score,
      snippet: ranked.entry.excerpt || ranked.entry.text || "",
      href: entryHref(ranked.entry),
      label: sourceLabel(ranked.entry),
    };
  }
}

export async function retrieveSources(query, { manifest, moduleSlugs = null } = {}) {
  const trimmed = String(query || "").trim().slice(0, MAX_QUERY_LENGTH);
  if (!trimmed) return [];

  const index = await loadSearchIndex();
  const ranked = retrieveRankedSources(index, trimmed, { moduleSlugs });
  if (!ranked.length) return [];

  const top = ranked.slice(0, MAX_SOURCES);
  const enrichCount = Math.min(MAX_ENRICH, top.length);
  const enriched = await Promise.all(
    top.slice(0, enrichCount).map((r) => enrichSource(manifest, r, trimmed))
  );
  const rest = top.slice(enrichCount).map((r) => ({
    entry: r.entry,
    score: r.score,
    snippet: r.entry.excerpt || r.entry.text || "",
    href: entryHref(r.entry),
    label: sourceLabel(r.entry),
  }));
  return [...enriched, ...rest];
}

function renderSources(container, sources, query) {
  clearChildren(container);
  if (!query.trim()) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  if (!sources.length) {
    container.append(
      el(
        "p",
        "study-assistant-empty",
        "No matching excerpts in the synced curriculum. Try different words or open the lesson list in the sidebar."
      )
    );
    return;
  }

  const intro = el("p", "study-assistant-results-intro");
  intro.textContent = `Found ${sources.length} excerpt${sources.length === 1 ? "" : "s"} from published lessons (not AI-generated):`;
  container.append(intro);

  const list = el("ol", "study-assistant-results-list");
  for (const src of sources) {
    const li = el("li", "study-assistant-result");
    const link = el("a", "study-assistant-result-link");
    link.href = src.href;
    link.textContent = src.label;
    li.append(link);
    if (src.snippet) {
      const p = el("p", "study-assistant-snippet", src.snippet);
      li.append(p);
    }
    list.append(li);
  }
  container.append(list);
}

export function mountStudyAssistant(options = {}) {
  const panel = document.getElementById("study-assistant-panel");
  const form = document.getElementById("study-assistant-form");
  const input = document.getElementById("study-assistant-query");
  const results = document.getElementById("study-assistant-results");
  const status = document.getElementById("study-assistant-status");
  if (!panel || !form || !input || !results) return;

  input.maxLength = MAX_QUERY_LENGTH;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) {
      results.hidden = true;
      clearChildren(results);
      return;
    }

    if (status) {
      status.hidden = false;
      status.textContent = "Searching curriculum…";
    }
    results.hidden = true;

    try {
      const sources = await retrieveSources(query, {
        manifest: options.manifest,
        moduleSlugs: options.getModuleSlugs?.() || null,
      });
      renderSources(results, sources, query);
      if (status) status.hidden = true;
    } catch {
      clearChildren(results);
      results.hidden = false;
      results.append(
        el("p", "study-assistant-empty", "Could not search curriculum. Try again in a moment.")
      );
      if (status) status.hidden = true;
    }
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      input.value = "";
      results.hidden = true;
      clearChildren(results);
      if (status) status.hidden = true;
    }
  });
}
