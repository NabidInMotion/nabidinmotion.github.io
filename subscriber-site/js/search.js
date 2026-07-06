/**
 * Client-side curriculum search over pre-built search-index.json (no external API).
 */
import { loadContentJSON } from "./content-loader.js";
import { buildLearnUrl } from "./progress.js";
import { clearChildren, el, escapeHtml } from "./security.js";

let indexCache = null;

export async function loadSearchIndex() {
  if (indexCache) return indexCache;
  indexCache = await loadContentJSON("content/search-index.json");
  return indexCache;
}

const MAX_QUERY_LENGTH = 120;

function tokenize(query) {
  const trimmed = String(query || "").slice(0, MAX_QUERY_LENGTH);
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 8);
}

function scoreEntry(entry, tokens) {
  const hay = `${entry.title} ${entry.text} ${entry.moduleTitle || ""}`.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (entry.title.toLowerCase().includes(t)) score += 4;
    if (hay.includes(t)) score += 1;
  }
  return score;
}

export function searchLessons(index, query, limit = 12) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const results = [];
  for (const entry of index.entries || []) {
    const score = scoreEntry(entry, tokens);
    if (score > 0) results.push({ entry, score });
  }
  results.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));
  return results.slice(0, limit).map((r) => r.entry);
}

function entryHref(entry) {
  if (entry.type === "guide") return buildLearnUrl({ guideId: entry.guideId });
  return buildLearnUrl({ module: entry.module, lessonId: entry.lessonId });
}

export function mountSearch(inputEl, resultsEl, options = {}) {
  let debounce = null;
  const indexPromise = loadSearchIndex().catch(() => null);

  function renderResults(items, query) {
    clearChildren(resultsEl);
    if (!query.trim()) {
      resultsEl.hidden = true;
      return;
    }
    resultsEl.hidden = false;

    if (!items.length) {
      resultsEl.append(el("p", "search-empty", "No lessons match. Try fewer or different words."));
      return;
    }

    const list = el("ul", "search-results-list");
    for (const item of items) {
      const li = el("li", "search-result-item");
      const a = el("a", "search-result-link");
      a.href = entryHref(item);
      a.innerHTML = `<strong>${escapeHtml(item.title)}</strong>`;
      if (item.moduleTitle) {
        a.append(el("span", "search-result-meta", item.moduleTitle));
      }
      if (item.excerpt) {
        a.append(el("span", "search-result-excerpt", item.excerpt));
      }
      li.append(a);
      list.append(li);
    }
    resultsEl.append(list);
  }

  inputEl.maxLength = MAX_QUERY_LENGTH;
  inputEl.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const q = inputEl.value;
      const index = await indexPromise;
      if (!index) {
        clearChildren(resultsEl);
        resultsEl.hidden = false;
        resultsEl.append(el("p", "search-empty", "Search index not loaded yet."));
        return;
      }
      const filtered = options.moduleSlugs?.length
        ? searchLessons(
            {
              entries: index.entries.filter(
                (e) => e.type === "guide" || options.moduleSlugs.includes(e.module)
              ),
            },
            q
          )
        : searchLessons(index, q);
      renderResults(filtered, q);
    }, 180);
  });

  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      inputEl.value = "";
      resultsEl.hidden = true;
      clearChildren(resultsEl);
    }
  });
}
