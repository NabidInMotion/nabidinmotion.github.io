/**
 * In-site curriculum reader. Loads pre-sanitized content from content/.
 */
import {
  buildLearnUrl,
  exportProgress,
  getConfidence,
  getModuleProgress,
  getStats,
  guideKey,
  importProgress,
  isLessonComplete,
  lessonKey,
  markLessonComplete,
  onProgressChange,
  resetProgress,
  setConfidence,
  setLastLesson,
  storageAvailable,
} from "./progress.js";
import { loadContentJSON, loadManifest, renderContentError } from "./content-loader.js";
import {
  filterSlugs,
  getRoleById,
  getSelectedRoleId,
  loadCareerPaths,
  moduleSlugsForRole,
  onCareerChange,
} from "./career-path.js";
import { mountFocusSession, setLessonReadingMinutes } from "./focus-session.js";
import { mountSearch } from "./search.js";
import { formatSyncDate } from "./site-meta.js";
import { clearChildren, el } from "./security.js";

const SLUG_RE = /^[0-9]{2}-[a-z0-9-]+$/;
const LESSON_RE = /^[a-z0-9][a-z0-9.-]{0,80}$/i;
const GUIDE_RE = /^[a-z0-9][a-z0-9-]{0,120}$/i;

let manifest = null;
let current = null;
let careerData = null;
let selectedRoleId = "all";

async function loadJSON(path) {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function parseRoute() {
  const params = new URLSearchParams(window.location.search);
  const guideId = params.get("g");
  const module = params.get("m");
  const lessonId = params.get("l") || "readme";

  if (guideId && GUIDE_RE.test(guideId)) return { type: "guide", guideId };
  if (module && SLUG_RE.test(module) && LESSON_RE.test(lessonId)) {
    return { type: "module", module, lessonId };
  }
  return { type: "default" };
}

function findContentPath(route) {
  if (route.type === "guide") {
    const guide = manifest.guides.find((g) => g.id === route.guideId);
    return guide ? { ...route, meta: guide, path: guide.path } : null;
  }
  if (route.type === "module") {
    const mod = manifest.modules.find((m) => m.slug === route.module);
    const lesson = mod?.lessons.find((l) => l.id === route.lessonId);
    if (!mod || !lesson) return null;
    return { ...route, meta: lesson, mod, path: lesson.path };
  }
  return null;
}

function currentKey(route) {
  if (route.type === "guide") return guideKey(route.guideId);
  if (route.type === "module") return lessonKey(route.module, route.lessonId);
  return null;
}

function setSanitizedHtml(container, html) {
  clearChildren(container);
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  while (wrap.firstChild) container.appendChild(wrap.firstChild);
}

function scrollToHash() {
  const hash = window.location.hash;
  if (!hash) return;
  const id = decodeURIComponent(hash.slice(1));
  requestAnimationFrame(() => {
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function bindContentAnchors(container) {
  container.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || !container.contains(link)) return;
    const href = link.getAttribute("href");
    if (!href || !href.startsWith("#") || href.length < 2) return;
    event.preventDefault();
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}${href}`);
    const id = decodeURIComponent(href.slice(1));
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function guideLink(guide) {
  const a = el("a", current?.type === "guide" && current.guideId === guide.id ? "active" : "");
  a.href = buildLearnUrl({ guideId: guide.id });
  a.textContent = guide.title.length > 48 ? `${guide.title.slice(0, 45)}…` : guide.title;
  return a;
}

function appendGuideLinks(parent, guides) {
  for (const guide of guides) parent.append(guideLink(guide));
}

function appendGuideGroup(container, label, guides, collapsible = false) {
  if (!guides.length) return;

  if (!collapsible) {
    appendGuideLinks(container, guides);
    return;
  }

  const group = el("details", "sidebar-guide-group");
  const hasActive = guides.some((g) => current?.type === "guide" && current.guideId === g.id);
  if (hasActive) group.open = true;

  const summary = el("summary", null, `${label} (${guides.length})`);
  group.append(summary);

  const list = el("div", "sidebar-guide-list");
  appendGuideLinks(list, guides);
  group.append(list);
  container.append(group);
}

function renderSidebarGuides(container) {
  clearChildren(container);

  const featuredIds = ["getting-started", "learning-roadmap", "quick-start", "readme"];
  const core = featuredIds.map((id) => manifest.guides.find((g) => g.id === id)).filter(Boolean);
  const systemDesign = manifest.guides
    .filter((g) => g.id.startsWith("system-design--"))
    .sort((a, b) => a.id.localeCompare(b.id));
  const resources = manifest.guides
    .filter((g) => g.id.startsWith("resources--"))
    .sort((a, b) => a.id.localeCompare(b.id));
  const other = manifest.guides.filter(
    (g) =>
      !featuredIds.includes(g.id) &&
      !g.id.startsWith("system-design--") &&
      !g.id.startsWith("resources--")
  );

  appendGuideLinks(container, core);
  appendGuideGroup(container, "System Design", systemDesign, true);
  appendGuideGroup(container, "Resources", resources, true);
  if (other.length) appendGuideGroup(container, "More", other, true);
}

function renderSidebarModules(container) {
  clearChildren(container);

  let modules = manifest.modules;
  if (selectedRoleId !== "all") {
    const allowed = new Set(filterSlugs(modules.map((m) => m.slug), selectedRoleId, careerData));
    modules = modules.filter((m) => allowed.has(m.slug));
  }

  if (modules.length === 0) {
    container.append(
      el("p", "sidebar-empty", "No modules for this career path. Choose another role on the study hub.")
    );
    return;
  }

  for (const mod of modules) {
    const prog = getModuleProgress(mod.slug, manifest);
    const group = el("details", "sidebar-module");
    if (current?.type === "module" && current.module === mod.slug) group.open = true;

    const summary = el("summary");
    const title = el("span", "sidebar-module-title", mod.title);
    const badge = el("span", "sidebar-module-badge", `${prog.done}/${prog.total}`);
    summary.append(title, badge);
    group.append(summary);

    const list = el("div", "sidebar-lessons");
    for (const lesson of mod.lessons) {
      const key = lessonKey(mod.slug, lesson.id);
      const done = isLessonComplete(key);
      const a = el(
        "a",
        `${current?.type === "module" && current.module === mod.slug && current.lessonId === lesson.id ? "active" : ""}${done ? " done" : ""}`
      );
      a.href = buildLearnUrl({ module: mod.slug, lessonId: lesson.id });
      a.textContent = lesson.title.length > 42 ? `${lesson.title.slice(0, 39)}…` : lesson.title;
      list.append(a);
    }
    group.append(list);
    container.append(group);
  }
}

function renderBreadcrumb(route, content) {
  const nav = document.getElementById("reader-breadcrumb");
  clearChildren(nav);

  const home = el("a", null, "Study Hub");
  home.href = "index.html";
  nav.append(home, el("span", "sep", " / "));

  if (route.type === "guide") {
    nav.append(el("span", null, content.title));
    return;
  }

  const modLink = el("a", null, route.mod.title);
  modLink.href = buildLearnUrl({ module: route.module, lessonId: "readme" });
  nav.append(modLink, el("span", "sep", " / "), el("span", null, content.title));
}

function findNeighbors(route) {
  if (route.type === "guide") return { prev: null, next: null };
  const lessons = route.mod.lessons;
  const idx = lessons.findIndex((l) => l.id === route.lessonId);
  return {
    prev: idx > 0 ? lessons[idx - 1] : null,
    next: idx >= 0 && idx < lessons.length - 1 ? lessons[idx + 1] : null,
  };
}

function renderLessonLegal(content) {
  const box = document.getElementById("lesson-legal");
  if (!box) return;
  box.hidden = false;
  clearChildren(box);

  const synced = formatSyncDate(manifest?.syncedAt);
  const commit = manifest?.legal?.sourceCommit?.slice(0, 7);

  box.append(
    el("p", "lesson-legal-title", "Content notice"),
    el(
      "p",
      "lesson-legal-text",
      `Source: ${content.source}. Synced ${synced}${commit ? ` (GitHub ${commit})` : ""}. ` +
        "This lesson may differ from versions you saw before. Open-source educational material. Not guaranteed accurate or complete. Use at your own risk. External links may change. " +
        "See Nutzungsbedingungen for liability terms."
    )
  );

  const links = el("p", "lesson-legal-links");
  const terms = el("a", null, "Nutzungsbedingungen");
  terms.href = "nutzungsbedingungen.html";
  const gh = el("a", null, "View on GitHub");
  gh.href = content.githubUrl;
  gh.target = "_blank";
  gh.rel = "noopener noreferrer";
  links.append(terms, document.createTextNode(" · "), gh);
  box.append(links);
}

function renderPager(route) {
  const nav = document.getElementById("reader-pager");
  clearChildren(nav);
  const { prev, next } = findNeighbors(route);

  if (prev) {
    const a = el("a", "pager-btn pager-prev");
    a.href = buildLearnUrl({ module: route.module, lessonId: prev.id });
    a.textContent = `← ${prev.title.slice(0, 40)}`;
    nav.append(a);
  }
  if (next) {
    const a = el("a", "pager-btn pager-next");
    a.href = buildLearnUrl({ module: route.module, lessonId: next.id });
    a.textContent = `${next.title.slice(0, 40)} →`;
    nav.append(a);
  }
}

function updateProgressUI() {
  const roleSlugs = moduleSlugsForRole(selectedRoleId, careerData);
  const stats = getStats(manifest, roleSlugs);
  const role = getRoleById(selectedRoleId, careerData);
  const wrap = document.getElementById("reader-progress-wrap");
  const label = document.getElementById("reader-progress-label");
  const fill = document.getElementById("reader-progress-fill");

  wrap.hidden = false;
  label.textContent = role
    ? `${role.title}: ${stats.completedCount} / ${stats.total} (${stats.percent}%)`
    : `${stats.completedCount} / ${stats.total} read (${stats.percent}%)`;
  fill.style.width = `${stats.percent}%`;
  fill.parentElement.setAttribute("aria-valuenow", String(stats.percent));
}

function updateConfidenceUI(route) {
  const wrap = document.getElementById("confidence-checkin");
  if (!wrap) return;
  const key = currentKey(route);
  if (!key) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const current = getConfidence(key);
  wrap.querySelectorAll("[data-confidence]").forEach((btn) => {
    const level = btn.dataset.confidence === "" ? null : Number(btn.dataset.confidence);
    btn.classList.toggle("active", current === level);
    btn.setAttribute("aria-pressed", current === level ? "true" : "false");
  });
}

function bindConfidenceCheckin() {
  const wrap = document.getElementById("confidence-checkin");
  if (!wrap || !storageAvailable()) return;

  wrap.querySelectorAll("[data-confidence]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!current) return;
      const key = currentKey(current);
      if (!key) return;
      const raw = btn.dataset.confidence;
      const level = raw === "" ? null : Number(raw);
      setConfidence(key, level);
      updateConfidenceUI(current);
    });
  });
}

function updateMarkRead(route) {
  const checkbox = document.getElementById("mark-read");
  const key = currentKey(route);
  if (!key || !checkbox) return;
  checkbox.checked = isLessonComplete(key);
  checkbox.onchange = () => {
    markLessonComplete(key, checkbox.checked);
    renderSidebarGuides(document.getElementById("sidebar-guides"));
    renderSidebarModules(document.getElementById("sidebar-modules"));
    updateProgressUI();
  };
}

async function showLesson(route) {
  const resolved = findContentPath(route);
  const contentEl = document.getElementById("reader-content");
  const githubLink = document.getElementById("github-source");

  if (!resolved) {
    clearChildren(contentEl);
    contentEl.append(
      el("h1", null, "Lesson not found"),
      el("p", null, "Pick a module or guide from the sidebar, or return to the study hub.")
    );
    githubLink.hidden = true;
    document.getElementById("lesson-legal").hidden = true;
    clearChildren(document.getElementById("reader-breadcrumb"));
    clearChildren(document.getElementById("reader-pager"));
    const markWrap = document.querySelector(".mark-read");
    if (markWrap) markWrap.hidden = true;
    return;
  }

  const markWrap = document.querySelector(".mark-read");
  if (markWrap) markWrap.hidden = false;

  current = route.type === "guide"
    ? { type: "guide", guideId: route.guideId }
    : { type: "module", module: route.module, lessonId: route.lessonId, mod: resolved.mod };

  document.title = `${resolved.meta.title} · Nabid In Motion`;

  const content = await loadContentJSON(`content/${resolved.path}`);
  setSanitizedHtml(contentEl, content.html);
  scrollToHash();
  renderLessonLegal(content);

  githubLink.href = content.githubUrl;
  githubLink.hidden = false;

  renderBreadcrumb({ ...route, mod: resolved.mod }, content);
  renderPager({ ...route, mod: resolved.mod });
  updateMarkRead(route);
  updateConfidenceUI(route);

  const readingMinutes = resolved.meta.readingMinutes || content.readingMinutes || null;
  setLessonReadingMinutes(readingMinutes);

  const key = currentKey(route);
  if (key) setLastLesson(key);

  history.replaceState(
    null,
    "",
    buildLearnUrl(
      route.type === "guide"
        ? { guideId: route.guideId }
        : { module: route.module, lessonId: route.lessonId }
    ) + window.location.hash
  );
}

function bindChrome() {
  document.getElementById("footer-year").textContent = String(new Date().getFullYear());

  document.getElementById("export-progress").addEventListener("click", exportProgress);
  document.getElementById("import-progress").addEventListener("click", () => {
    importProgress(() => window.location.reload());
  });
  document.getElementById("reset-progress").addEventListener("click", () => {
    if (resetProgress()) window.location.reload();
  });

  const toggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("reader-sidebar");
  toggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  sidebar.addEventListener("click", (event) => {
    if (event.target.closest("a") && sidebar.classList.contains("open")) {
      sidebar.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  if (!storageAvailable()) {
    const note = el("p", "storage-warning", "Progress cannot be saved in this browser (private mode or storage blocked).");
    document.getElementById("reader-main").prepend(note);
  }

  onProgressChange(() => {
    updateProgressUI();
    renderSidebarGuides(document.getElementById("sidebar-guides"));
    renderSidebarModules(document.getElementById("sidebar-modules"));
    if (current) {
      updateMarkRead(current);
      updateConfidenceUI(current);
    }
  });
}

function bindSearch() {
  const input = document.getElementById("sidebar-search");
  const results = document.getElementById("sidebar-search-results");
  if (!input || !results) return;

  const slugs =
    selectedRoleId !== "all"
      ? filterSlugs(manifest.modules.map((m) => m.slug), selectedRoleId, careerData)
      : null;

  mountSearch(input, results, { moduleSlugs: slugs });
}

async function init() {
  try {
    [manifest, careerData] = await Promise.all([loadManifest(), loadCareerPaths()]);
    selectedRoleId = getSelectedRoleId();
    bindChrome();
    bindConfidenceCheckin();
    bindContentAnchors(document.getElementById("reader-content"));
    mountFocusSession({
      onMarkRead: () => {
        const checkbox = document.getElementById("mark-read");
        if (!checkbox || !current) return;
        checkbox.checked = true;
        const key = currentKey(current);
        if (key) markLessonComplete(key, true);
        renderSidebarGuides(document.getElementById("sidebar-guides"));
        renderSidebarModules(document.getElementById("sidebar-modules"));
        updateProgressUI();
      },
    });
    bindSearch();
    renderSidebarGuides(document.getElementById("sidebar-guides"));
    renderSidebarModules(document.getElementById("sidebar-modules"));
    updateProgressUI();

    onCareerChange((roleId) => {
      selectedRoleId = roleId;
      renderSidebarModules(document.getElementById("sidebar-modules"));
      updateProgressUI();
    });

    let route = parseRoute();
    if (route.type === "default") {
      route = { type: "guide", guideId: "learning-roadmap" };
    }
    await showLesson(route);
  } catch (err) {
    const contentEl = document.getElementById("reader-content");
    renderContentError(contentEl, err);
    document.getElementById("reader-progress-wrap").hidden = true;
  }
}

document.addEventListener("DOMContentLoaded", init);
