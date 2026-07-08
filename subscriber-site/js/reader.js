/**
 * In-site curriculum reader. Loads pre-sanitized content from content/.
 */
import {
  buildLearnUrl,
  countReviewDue,
  exportProgress,
  findBookmarks,
  findFirstReviewDue,
  getConfidence,
  getModuleProgress,
  getReflection,
  getReflectionMeta,
  getStats,
  guideKey,
  importProgress,
  isBookmarked,
  isLessonReviewDue,
  isLessonComplete,
  lessonKey,
  markLessonComplete,
  MAX_BOOKMARKS,
  onProgressChange,
  parseLessonKey,
  pickReflectionPrompt,
  recordLessonOpened,
  REFLECTION_PROMPTS,
  resetProgress,
  setConfidence,
  setLastLesson,
  setReflection,
  storageAvailable,
  toggleBookmark,
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
import { mountFocusSession, setFocusLessonKey, setLessonReadingMinutes } from "./focus-session.js";
import { maybeExplainPrompt, mountExplainPrompt } from "./explain-prompt.js";
import {
  applyReaderMeasurePref,
  enhanceCodeBlocks,
  findQuickReferenceLesson,
  mountPrintButton,
  mountReaderKeyboard,
  mountReaderMeasureToggle,
  renderCheckpointBanner,
} from "./reader-tools.js";
import { mountSearch } from "./search.js";
import { mountStudyAssistant } from "./study-assistant.js";
import { formatSyncDate } from "./site-meta.js";
import { clearChildren, el } from "./security.js";

const SLUG_RE = /^[0-9]{2}-[a-z0-9-]+$/;
const LESSON_RE = /^[a-z0-9][a-z0-9.-]{0,80}$/i;
const GUIDE_RE = /^[a-z0-9][a-z0-9-]{0,120}$/i;
const BOOKMARKS_HASH = "#bookmarks";

let manifest = null;
let current = null;
let currentTitle = "";
let careerData = null;
let selectedRoleId = "all";

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

function lessonHref(item) {
  if (item.type === "guide" || item.guideId) {
    return buildLearnUrl({ guideId: item.guideId });
  }
  return buildLearnUrl({ module: item.module, lessonId: item.lessonId });
}

function roleModuleSlugs() {
  const slugs = moduleSlugsForRole(selectedRoleId, careerData);
  return slugs?.length ? slugs : null;
}

function updateReviewDueBanner(route) {
  const banner = document.getElementById("review-due-banner");
  if (!banner || !storageAvailable() || !manifest) {
    if (banner) banner.hidden = true;
    return;
  }

  const slugs = roleModuleSlugs();
  const count = countReviewDue(manifest, slugs);
  if (!count) {
    banner.hidden = true;
    clearChildren(banner);
    return;
  }

  const key = currentKey(route);
  const currentDue = key ? isLessonReviewDue(key, manifest, slugs) : false;
  const first = findFirstReviewDue(manifest, slugs);

  clearChildren(banner);
  banner.hidden = false;

  if (currentDue) {
    banner.append(
      el("span", "review-due-banner-label", "Worth revisiting today"),
      el(
        "span",
        "review-due-banner-hint",
        "Recall key ideas before scrolling — then re-read if needed."
      )
    );
    return;
  }

  const label = el("span", "review-due-banner-label");
  label.textContent =
    count === 1 ? "1 lesson ready to review" : `${count} lessons ready to review`;

  if (first) {
    const link = el("a", "review-due-banner-link");
    link.href = lessonHref(first);
    link.textContent = `Start with “${first.title.length > 48 ? `${first.title.slice(0, 45)}…` : first.title}”`;
    banner.append(label, document.createTextNode(" · "), link);
  } else {
    banner.append(label);
  }
}

function updateLessonNotesUI(route) {
  const panel = document.getElementById("lesson-notes-panel");
  const promptEl = document.getElementById("lesson-notes-prompt");
  const input = document.getElementById("lesson-notes-input");
  const clearBtn = document.getElementById("lesson-notes-clear");
  if (!panel || !input) return;

  const key = currentKey(route);
  if (!key || !storageAvailable()) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  const meta = getReflectionMeta(key);
  const promptId = meta?.prompt || pickReflectionPrompt(key);
  const prompt = REFLECTION_PROMPTS[promptId] || REFLECTION_PROMPTS.summary;
  if (promptEl) {
    promptEl.textContent = meta?.at
      ? `${prompt.title} — saved ${formatSyncDate(meta.at) || "on this device"}`
      : prompt.title;
  }
  input.placeholder = prompt.placeholder;
  input.value = getReflection(key);
  if (clearBtn) clearBtn.hidden = !input.value.trim();
  panel.open = !!input.value.trim();
}

function bindLessonNotes() {
  const panel = document.getElementById("lesson-notes-panel");
  const input = document.getElementById("lesson-notes-input");
  const saveBtn = document.getElementById("lesson-notes-save");
  const clearBtn = document.getElementById("lesson-notes-clear");
  if (!panel || !input || !storageAvailable()) return;

  saveBtn?.addEventListener("click", () => {
    if (!current) return;
    const key = currentKey(current);
    if (!key) return;
    const text = input.value.trim();
    const promptId = getReflectionMeta(key)?.prompt || pickReflectionPrompt(key);
    setReflection(key, text, promptId);
    updateLessonNotesUI(current);
  });

  clearBtn?.addEventListener("click", () => {
    if (!current) return;
    const key = currentKey(current);
    if (!key) return;
    if (!window.confirm("Clear your note for this lesson on this device?")) return;
    setReflection(key, "");
    input.value = "";
    updateLessonNotesUI(current);
  });

  input.addEventListener("input", () => {
    if (clearBtn) clearBtn.hidden = !input.value.trim();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      saveBtn?.click();
    }
  });
}

function setSanitizedHtml(container, html) {
  clearChildren(container);
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  while (wrap.firstChild) container.appendChild(wrap.firstChild);
}

function scrollToHash() {
  const hash = window.location.hash;
  if (!hash || hash === BOOKMARKS_HASH) return;
  const id = decodeURIComponent(hash.slice(1));
  requestAnimationFrame(() => {
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function lessonUrlHash() {
  const hash = window.location.hash;
  return hash === BOOKMARKS_HASH ? "" : hash;
}

function stripBookmarksHash() {
  if (window.location.hash === BOOKMARKS_HASH) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
}

let bookmarkNoticeTimer = null;

function showBookmarkNotice(message) {
  const node = document.getElementById("bookmark-notice");
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  clearTimeout(bookmarkNoticeTimer);
  bookmarkNoticeTimer = setTimeout(() => {
    node.hidden = true;
  }, 5000);
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

function removeSidebarBookmark(item) {
  if (!storageAvailable() || !item?.key || !isBookmarked(item.key)) return;
  const label = item.title.length > 60 ? `${item.title.slice(0, 57)}…` : item.title;
  toggleBookmark(item.key);
  showBookmarkNotice(`Removed “${label}” from bookmarks.`);
}

function renderSidebarBookmarks() {
  const section = document.getElementById("sidebar-bookmarks-section");
  const nav = document.getElementById("sidebar-bookmarks-nav");
  const countEl = document.getElementById("sidebar-bookmarks-count");
  if (!section || !nav || !manifest) return;

  if (!storageAvailable()) {
    section.hidden = true;
    return;
  }

  const items = findBookmarks(manifest);
  if (!items.length) {
    section.hidden = true;
    clearChildren(nav);
    return;
  }

  section.hidden = false;
  if (countEl) countEl.textContent = `(${items.length})`;

  const activeKey = current ? currentKey(current) : null;

  clearChildren(nav);
  for (const item of items) {
    const row = el("div", "sidebar-bookmark-row");
    const link = el(
      "a",
      item.key === activeKey ? "sidebar-bookmark-link active" : "sidebar-bookmark-link"
    );
    link.href =
      item.type === "guide"
        ? buildLearnUrl({ guideId: item.guideId })
        : buildLearnUrl({ module: item.module, lessonId: item.lessonId });
    const title =
      item.title.length > 48 ? `${item.title.slice(0, 45)}…` : item.title;
    link.append(el("span", "sidebar-bookmark-title", title));
    if (item.moduleTitle) {
      link.append(el("span", "sidebar-bookmark-meta", item.moduleTitle));
    } else {
      link.title = item.title;
    }
    row.append(link);

    const removeBtn = el("button", "sidebar-bookmark-remove");
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", `Remove “${item.title}” from bookmarks`);
    removeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeSidebarBookmark(item);
    });
    row.append(removeBtn);

    nav.append(row);
  }
}

function focusBookmarksSidebar() {
  const section = document.getElementById("sidebar-bookmarks-section");
  const panel = document.getElementById("sidebar-bookmarks-panel");
  const sidebar = document.getElementById("reader-sidebar");
  const toggle = document.getElementById("sidebar-toggle");
  if (section?.hidden) return;
  if (panel) panel.open = true;
  if (sidebar && window.matchMedia("(max-width: 900px)").matches) {
    sidebar.classList.add("open");
    toggle?.setAttribute("aria-expanded", "true");
  }
  section?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  stripBookmarksHash();
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

function promptExplainIfNeeded(route) {
  const key = currentKey(route);
  if (!key || !currentTitle) return;
  maybeExplainPrompt({ lessonKey: key, lessonTitle: currentTitle });
}

function updateBookmarkUI(route) {
  const btn = document.getElementById("lesson-bookmark");
  if (!btn) return;
  const key = currentKey(route);
  if (!key || !storageAvailable()) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  const saved = isBookmarked(key);
  btn.classList.toggle("active", saved);
  btn.setAttribute("aria-pressed", saved ? "true" : "false");
  btn.textContent = saved ? "Bookmarked ::" : "Bookmark ::";
}

function bindBookmarkButton() {
  const btn = document.getElementById("lesson-bookmark");
  if (!btn || !storageAvailable()) return;
  btn.addEventListener("click", () => {
    if (!current) return;
    const key = currentKey(current);
    if (!key) return;
    const wasSaved = isBookmarked(key);
    const { evicted } = toggleBookmark(key);
    updateBookmarkUI(current);
    renderSidebarBookmarks();
    if (!wasSaved && evicted) {
      const parsed = parseLessonKey(evicted, manifest);
      const removed = parsed?.title || "Oldest bookmark";
      showBookmarkNotice(
        `Bookmark saved. Removed oldest to stay within ${MAX_BOOKMARKS}: “${removed}”.`
      );
    }
  });
}

function updateMarkRead(route) {
  const checkbox = document.getElementById("mark-read");
  const key = currentKey(route);
  if (!key || !checkbox) return;
  checkbox.checked = isLessonComplete(key);
  checkbox.onchange = () => {
    const wasComplete = isLessonComplete(key);
    markLessonComplete(key, checkbox.checked, manifest);
    renderSidebarGuides(document.getElementById("sidebar-guides"));
    renderSidebarModules(document.getElementById("sidebar-modules"));
    renderSidebarBookmarks();
    updateProgressUI();
    if (checkbox.checked && !wasComplete) promptExplainIfNeeded(route);
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
    const checkpointHost = document.getElementById("module-checkpoint");
    if (checkpointHost) checkpointHost.hidden = true;
    const notesPanel = document.getElementById("lesson-notes-panel");
    if (notesPanel) notesPanel.hidden = true;
    const reviewBanner = document.getElementById("review-due-banner");
    if (reviewBanner) reviewBanner.hidden = true;
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
  currentTitle = content.title || resolved.meta.title || "";
  setSanitizedHtml(contentEl, content.html);
  enhanceCodeBlocks(contentEl, content.githubUrl);
  scrollToHash();
  renderLessonLegal(content);

  const checkpointHost = document.getElementById("module-checkpoint");
  if (checkpointHost) {
    if (route.type === "module" && route.lessonId === "readme" && resolved.mod) {
      const quickRef = findQuickReferenceLesson(resolved.mod);
      if (quickRef) renderCheckpointBanner(checkpointHost, resolved.mod, quickRef);
      else {
        checkpointHost.hidden = true;
        clearChildren(checkpointHost);
      }
    } else {
      checkpointHost.hidden = true;
      clearChildren(checkpointHost);
    }
  }

  githubLink.href = content.githubUrl;
  githubLink.hidden = false;

  renderBreadcrumb({ ...route, mod: resolved.mod }, content);
  renderPager({ ...route, mod: resolved.mod });
  updateMarkRead(route);
  updateConfidenceUI(route);
  updateBookmarkUI(route);
  updateLessonNotesUI(route);
  updateReviewDueBanner(route);
  renderSidebarBookmarks();

  const readingMinutes = resolved.meta.readingMinutes || content.readingMinutes || null;
  setLessonReadingMinutes(readingMinutes);

  const key = currentKey(route);
  if (key) {
    setLastLesson(key);
    recordLessonOpened(key);
    setFocusLessonKey(key);
  } else {
    setFocusLessonKey(null);
  }

  history.replaceState(
    null,
    "",
    buildLearnUrl(
      route.type === "guide"
        ? { guideId: route.guideId }
        : { module: route.module, lessonId: route.lessonId }
    ) + lessonUrlHash()
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
    renderSidebarBookmarks();
    if (current) {
      updateMarkRead(current);
      updateConfidenceUI(current);
      updateBookmarkUI(current);
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

  mountSearch(input, results, { moduleSlugs: slugs, limit: 8 });
}

function bindStudyAssistant() {
  mountStudyAssistant({
    manifest,
    getModuleSlugs: () =>
      selectedRoleId !== "all"
        ? filterSlugs(manifest.modules.map((m) => m.slug), selectedRoleId, careerData)
        : null,
  });
}

async function init() {
  try {
    [manifest, careerData] = await Promise.all([loadManifest(), loadCareerPaths()]);
    selectedRoleId = getSelectedRoleId();
    bindChrome();
    bindConfidenceCheckin();
    bindBookmarkButton();
    bindContentAnchors(document.getElementById("reader-content"));
    mountFocusSession({
      onMarkRead: () => {
        const checkbox = document.getElementById("mark-read");
        if (!checkbox || !current) return;
        const wasComplete = checkbox.checked;
        checkbox.checked = true;
        const key = currentKey(current);
        if (key) markLessonComplete(key, true, manifest);
        renderSidebarGuides(document.getElementById("sidebar-guides"));
        renderSidebarModules(document.getElementById("sidebar-modules"));
        renderSidebarBookmarks();
        updateProgressUI();
        if (!wasComplete) promptExplainIfNeeded(current);
      },
      onSessionEnd: () => {
        if (current) promptExplainIfNeeded(current);
      },
    });
    mountExplainPrompt();
    bindLessonNotes();
    mountReaderMeasureToggle();
    mountPrintButton();
    applyReaderMeasurePref();
    mountReaderKeyboard();
    bindSearch();
    bindStudyAssistant();
    renderSidebarGuides(document.getElementById("sidebar-guides"));
    renderSidebarModules(document.getElementById("sidebar-modules"));
    renderSidebarBookmarks();
    updateProgressUI();

    onCareerChange((roleId) => {
      selectedRoleId = roleId;
      renderSidebarModules(document.getElementById("sidebar-modules"));
      renderSidebarBookmarks();
      updateProgressUI();
      if (current) updateReviewDueBanner(current);
    });

    onProgressChange(() => {
      if (!current) return;
      updateLessonNotesUI(current);
      updateReviewDueBanner(current);
      updateConfidenceUI(current);
    });

    let route = parseRoute();
    if (route.type === "default") {
      route = { type: "guide", guideId: "learning-roadmap" };
    }
    const openBookmarks = window.location.hash === BOOKMARKS_HASH;
    await showLesson(route);

    if (openBookmarks) {
      focusBookmarksSidebar();
    }
  } catch (err) {
    const contentEl = document.getElementById("reader-content");
    renderContentError(contentEl, err);
    document.getElementById("reader-progress-wrap").hidden = true;
  }
}

document.addEventListener("DOMContentLoaded", init);
