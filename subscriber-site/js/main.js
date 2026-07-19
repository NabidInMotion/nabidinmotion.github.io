/**
 * Nabid In Motion Subscriber Study Hub
 * Renders curriculum content with validated data and safe DOM APIs.
 */
import {
  buildLearnUrl,
  buildPracticePath,
  exportProgress,
  importProgress,
  findBookmarks,
  findConfusedLessons,
  findContinueLesson,
  findGaps,
  findInProgressLessons,
  findNextInPath,
  findReflectionLessons,
  findRefreshSuggestions,
  findReviewQueue,
  findFirstReviewDue,
  countReviewDue,
  formatReadingMinutes,
  getModuleMilestones,
  getModuleProgress,
  getStats,
  guideKey,
  lessonKey,
  getWeeklyFocusGoal,
  getWeeklyFocusProgress,
  getWeeklyLessonGoal,
  getWeeklyLessonProgress,
  HOME_BOOKMARK_PREVIEW,
  HOME_CONFUSED_PREVIEW,
  onProgressChange,
  resetProgress,
  setWeeklyFocusGoal,
  setWeeklyLessonGoal,
  setPracticePathNext,
  clearPracticePathNext,
  shouldShowPracticePath,
  syncPracticePathNext,
  storageAvailable,
} from "./progress.js";
import { loadManifest, renderContentError } from "./content-loader.js";
import {
  careerGuideUrl,
  filterSlugs,
  getRoleById,
  getSelectedRoleId,
  loadCareerPaths,
  moduleSlugsForRole,
  onCareerChange,
  roleSummary,
  setSelectedRoleId,
} from "./career-path.js";
import { bindProjectsRefresh, loadProjects, renderProjectsSection } from "./projects.js";
import { initWhatsNew } from "./visit.js";
import {
  clearChildren,
  el,
  externalLink,
  isValidSlug,
  sanitizeLink,
  sanitizeLocalAsset,
  sanitizePlaylistId,
  sanitizeVideoId,
  validateModulesData,
  validateSiteConfig,
  youtubePlaylistUrl,
  youtubeWatch,
} from "./security.js";

const REPO_BASE = "https://github.com/NabidAlam/road-to-machine-learning/tree/main";
const PLAYLIST_INITIAL = 6;

const GUIDE_LOCAL = {
  "How to Use the Study Hub": "how-to-use-the-study-hub",
  "Getting Started": "getting-started",
  "Learning Roadmap": "learning-roadmap",
  "Quick Start": "quick-start",
  "Career Roadmap Guide": "resources--career_roadmap_guide",
  "Full Stack AI Blueprint": "resources--full_stack_ai_engineer_roadmap",
  "System Design Track": "system-design--README",
  "AI Engineering Glossary": "resources--ai_engineering_glossary",
  "AI Myths Busted": "resources--ai_myths_busted",
};

async function loadJSON(path) {
  const res = await fetch(path, { credentials: "same-origin", cache: "default" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function moduleHref(slug) {
  if (!isValidSlug(slug)) return REPO_BASE;
  return buildLearnUrl({ module: slug, lessonId: "readme" });
}

function guideLocalHref(title) {
  const id = GUIDE_LOCAL[title];
  return id ? buildLearnUrl({ guideId: id }) : null;
}

function lessonHref(item) {
  if (item.type === "guide") return buildLearnUrl({ guideId: item.guideId });
  return buildLearnUrl({ module: item.module, lessonId: item.lessonId });
}

function renderWeeklyFocusGoal(container) {
  if (!storageAvailable()) return;
  const { goal, minutes } = getWeeklyFocusProgress();
  const section = el("div", "weekly-goal-panel weekly-focus-panel");
  section.append(el("span", "weekly-goal-label", "Focus goal this week"));

  const count = el("span", "weekly-goal-count", `${minutes} / ${goal} min`);
  section.append(count);

  const bar = el("div", "progress-bar weekly-goal-bar");
  const fill = el("div", "progress-bar-fill");
  const pct = goal > 0 ? Math.min(100, Math.round((minutes / goal) * 100)) : 0;
  fill.style.width = `${pct}%`;
  bar.append(fill);
  section.append(bar);

  const edit = el("label", "weekly-goal-edit");
  edit.append(document.createTextNode("Target: "));
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "600";
  input.className = "weekly-goal-input";
  input.value = String(getWeeklyFocusGoal());
  input.setAttribute("aria-label", "Weekly focus minutes target");
  input.addEventListener("change", () => {
    const val = Number(input.value);
    if (Number.isFinite(val)) setWeeklyFocusGoal(val);
    refreshProgress(manifestRef, roleRef, careerRef);
  });
  edit.append(input, document.createTextNode(" min / week"));
  section.append(edit);

  container.append(section);
}

function renderModuleMilestones(container, manifest, roleId, careerData) {
  if (!storageAvailable() || !manifest) return;
  const slugs = moduleSlugsForRole(roleId, careerData);
  const items = getModuleMilestones(manifest, slugs?.length ? slugs : null);
  if (!items.length) return;

  const section = el("div", "learning-panel learning-panel-milestones");
  section.append(
    el("h3", "learning-panel-title", "Modules completed"),
    el("p", "learning-panel-desc", "Recent module milestones on this device.")
  );
  const list = el("ul", "learning-panel-list");
  for (const mod of items) {
    const row = el("li", "learning-panel-item");
    const link = el("a", "learning-panel-link");
    link.href = buildLearnUrl({ module: mod.slug, lessonId: "readme" });
    link.textContent = mod.title;
    row.append(link);
    row.append(
      el(
        "span",
        "learning-panel-meta",
        `${mod.lessonCount} lessons · ${mod.daysAgo === 0 ? "today" : `${mod.daysAgo}d ago`}`
      )
    );
    list.append(row);
  }
  section.append(list);
  container.append(section);
}

function renderPathGaps(container, manifest, roleId, careerData) {
  if (!storageAvailable() || !manifest) return;
  const slugs = moduleSlugsForRole(roleId, careerData);
  const gaps = findGaps(manifest, slugs?.length ? slugs : null);
  if (!gaps.length) return;

  const section = el("div", "learning-panel learning-panel-gaps");
  section.append(
    el("h3", "learning-panel-title", "Path gaps"),
    el("p", "learning-panel-desc", "Later modules have progress, but these earlier ones do not.")
  );
  const list = el("ul", "learning-panel-list");
  for (const mod of gaps) {
    const row = el("li", "learning-panel-item");
    const link = el("a", "learning-panel-link");
    link.href = buildLearnUrl({ module: mod.slug, lessonId: "readme" });
    link.textContent = mod.title;
    row.append(link);
    row.append(el("span", "learning-panel-meta", `${mod.total} lessons`));
    list.append(row);
  }
  section.append(list);
  container.append(section);
}

function progressItemKey(item) {
  if (!item) return null;
  if (item.key) return item.key;
  if (item.type === "guide" || item.guideId) return guideKey(item.guideId);
  if (item.module) return lessonKey(item.module, item.lessonId);
  return null;
}

function renderInProgressLessons(container, manifest, roleId, careerData) {
  if (!storageAvailable() || !manifest) return;
  const slugs = moduleSlugsForRole(roleId, careerData);
  const scoped = slugs?.length ? slugs : null;
  const cont = findContinueLesson(manifest, scoped);
  const continueKey = progressItemKey(cont);
  const items = findInProgressLessons(manifest, scoped).filter(
    (item) => item.key !== continueKey
  );
  if (!items.length) return;

  const section = el("div", "learning-panel learning-panel-in-progress");
  section.append(
    el("h3", "learning-panel-title", "Started, not finished"),
    el(
      "p",
      "learning-panel-desc",
      "Lessons you opened but have not marked read yet — pick up where you left off."
    )
  );

  const list = el("ul", "learning-panel-list");
  for (const item of items) {
    const row = el("li", "learning-panel-item");
    const link = el("a", "learning-panel-link");
    link.href = lessonHref(item);
    link.textContent = item.title;
    row.append(link);
    if (item.moduleTitle) {
      row.append(el("span", "learning-panel-meta", item.moduleTitle));
    }
    list.append(row);
  }
  section.append(list);
  container.append(section);
}

function noteExcerpt(text, max = 72) {
  let s = String(text ?? "");
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/^#{1,3}\s+/gm, "");
  s = s.replace(/^\s*[-*]\s+/gm, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 3)}…` : s;
}

function renderReflectionNotes(container, manifest, roleId, careerData) {
  if (!storageAvailable() || !manifest) return;
  const slugs = moduleSlugsForRole(roleId, careerData);
  const items = findReflectionLessons(manifest, slugs?.length ? slugs : null);
  if (!items.length) return;

  const preview = items.slice(0, 5);
  const extra = items.length - preview.length;

  const section = el("div", "learning-panel learning-panel-notes");
  section.append(
    el(
      "h3",
      "learning-panel-title",
      items.length > 5 ? `Your notes (${items.length})` : "Your notes"
    ),
    el(
      "p",
      "learning-panel-desc",
      extra > 0
        ? `Saved while reading. ${extra} more note${extra === 1 ? "" : "s"} on other lessons.`
        : "One note per lesson, saved on this device. Open a lesson to edit."
    )
  );

  const list = el("ul", "learning-panel-list");
  for (const item of preview) {
    const row = el("li", "learning-panel-item learning-panel-item--note");
    const link = el("a", "learning-panel-link");
    link.href = lessonHref(item);
    link.textContent = item.title;
    row.append(link);
    const excerpt = noteExcerpt(item.text);
    if (excerpt) {
      row.append(el("span", "learning-panel-meta learning-panel-note-excerpt", excerpt));
    }
    list.append(row);
  }
  section.append(list);
  container.append(section);
}

function renderConfusedLessons(container, manifest, roleId, careerData) {
  if (!storageAvailable() || !manifest) return;
  const slugs = moduleSlugsForRole(roleId, careerData);
  const items = findConfusedLessons(manifest, slugs?.length ? slugs : null, {
    limit: HOME_CONFUSED_PREVIEW,
  });
  if (!items.length) return;

  const section = el("div", "learning-panel learning-panel-confused");
  section.append(
    el("h3", "learning-panel-title", "Still unclear"),
    el(
      "p",
      "learning-panel-desc",
      "Lessons you tagged as still unclear — pick Still unclear when saving a note in the reader."
    )
  );

  const list = el("ul", "learning-panel-list");
  for (const item of items) {
    const row = el("li", "learning-panel-item learning-panel-item--note");
    const link = el("a", "learning-panel-link");
    link.href = lessonHref(item);
    link.textContent = item.title;
    row.append(link);
    const excerpt = noteExcerpt(item.text);
    if (excerpt) {
      row.append(el("span", "learning-panel-meta learning-panel-note-excerpt", excerpt));
    }
    list.append(row);
  }
  section.append(list);
  container.append(section);
}

function renderBookmarks(container, manifest) {
  if (!storageAvailable() || !manifest) return;
  const all = findBookmarks(manifest);
  if (!all.length) return;

  const preview = all.slice(0, HOME_BOOKMARK_PREVIEW);
  const extra = all.length - preview.length;

  const section = el("div", "learning-panel learning-panel-bookmarks");
  const title =
    all.length > HOME_BOOKMARK_PREVIEW
      ? `Bookmarked (${all.length})`
      : "Bookmarked";
  section.append(
    el("h3", "learning-panel-title", title),
    el(
      "p",
      "learning-panel-desc",
      extra > 0
        ? `Recent saves from the reader. ${extra} more in Learn.`
        : "Lessons you saved to revisit from the reader toolbar."
    )
  );

  const list = el("ul", "learning-panel-list");
  for (const item of preview) {
    const row = el("li", "learning-panel-item");
    const link = el("a", "learning-panel-link");
    link.href = lessonHref(item);
    link.textContent = item.title;
    row.append(link);
    if (item.moduleTitle) {
      row.append(el("span", "learning-panel-meta", item.moduleTitle));
    }
    list.append(row);
  }
  section.append(list);

  if (extra > 0) {
    const viewAll = el("a", "learning-panel-more btn btn-ghost btn-sm");
    viewAll.href = "learn.html#bookmarks";
    viewAll.textContent = `View all ${all.length} in Learn ::`;
    section.append(viewAll);
  }

  container.append(section);
}

function renderRefreshSuggestions(container, manifest, roleId, careerData, skipKeys = null) {
  if (!storageAvailable() || !manifest) return;
  const slugs = moduleSlugsForRole(roleId, careerData);
  const items = findRefreshSuggestions(manifest, slugs?.length ? slugs : null).filter(
    (item) => !skipKeys?.has(item.key)
  );
  if (!items.length) return;

  const section = el("div", "learning-panel learning-panel-refresh");
  section.append(
    el("h3", "learning-panel-title", "Worth a refresh"),
    el("p", "learning-panel-desc", "Lessons you read a while ago — a quick skim can help retention.")
  );
  const list = el("ul", "learning-panel-list");
  for (const item of items) {
    const row = el("li", "learning-panel-item");
    const link = el("a", "learning-panel-link");
    link.href = lessonHref(item);
    link.textContent = item.title;
    row.append(link);
    row.append(el("span", "learning-panel-meta", `${item.daysSince}d since read`));
    list.append(row);
  }
  section.append(list);
  container.append(section);
}

function renderWeeklyGoal(container) {
  if (!storageAvailable()) return;
  const { goal, read } = getWeeklyLessonProgress();
  const section = el("div", "weekly-goal-panel");
  section.append(el("span", "weekly-goal-label", "Reading goal this week"));

  const count = el("span", "weekly-goal-count", `${read} / ~${goal} lessons`);
  section.append(count);

  const bar = el("div", "progress-bar weekly-goal-bar");
  const fill = el("div", "progress-bar-fill");
  const pct = goal > 0 ? Math.min(100, Math.round((read / goal) * 100)) : 0;
  fill.style.width = `${pct}%`;
  bar.append(fill);
  section.append(bar);

  const edit = el("label", "weekly-goal-edit");
  edit.append(document.createTextNode("Target: "));
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "50";
  input.className = "weekly-goal-input";
  input.value = String(getWeeklyLessonGoal());
  input.setAttribute("aria-label", "Weekly lesson target");
  input.addEventListener("change", () => {
    const val = Number(input.value);
    if (Number.isFinite(val)) setWeeklyLessonGoal(val);
    refreshProgress(manifestRef, roleRef, careerRef);
  });
  edit.append(input, document.createTextNode(" lessons / week"));
  section.append(edit);

  container.append(section);
}

let manifestRef = null;
let roleRef = "all";
let careerRef = null;

function renderReviewQueue(container, manifest, roleId, careerData, skipKeys = null) {
  if (!storageAvailable() || !manifest) return;
  const slugs = moduleSlugsForRole(roleId, careerData);
  const items = findReviewQueue(manifest, slugs?.length ? slugs : null).filter(
    (item) => !skipKeys?.has(item.key)
  );
  if (!items.length) return;

  const section = el("div", "review-queue-panel");
  section.append(
    el("h3", "review-queue-title", "Worth revisiting"),
    el("p", "review-queue-desc", "Lessons you marked Not yet or Partly — a gentle nudge, not a backlog.")
  );

  const list = el("ul", "review-queue-list");
  for (const item of items) {
    const row = el("li", "review-queue-item");
    const link = el("a", "review-queue-link");
    link.href = lessonHref(item);
    link.textContent = item.title;
    row.append(link);
    row.append(
      el(
        "span",
        "review-queue-meta",
        `${item.confidenceLabel} · ${item.daysSince}d ago · revisit ~${item.dueDays}d`
      )
    );
    list.append(row);
  }
  section.append(list);
  container.append(section);
}

function bookmarkKeysForHome(manifest) {
  return new Set(findBookmarks(manifest).map((item) => item.key));
}

function renderPracticePath(container, manifest, roleId, careerData) {
  if (!storageAvailable() || !manifest) return;
  const slugs = moduleSlugsForRole(roleId, careerData);
  const scoped = slugs?.length ? slugs : null;
  syncPracticePathNext(manifest, scoped);
  const path = buildPracticePath(manifest, scoped);
  if (!shouldShowPracticePath(path)) return;

  const section = el("div", "learning-panel learning-panel-practice");
  section.append(
    el("h3", "learning-panel-title", "Today's practice path"),
    el(
      "p",
      "learning-panel-desc",
      path.hasReview && path.hasLearn
        ? "One review, then one new lesson. Interleaved practice on your career path."
        : path.hasReview
          ? "One review is due. Open it, then continue with the next unread lesson when ready."
          : "No reviews due right now. Start with the next unread lesson on your path."
    )
  );

  const list = el("ol", "practice-path-list");
  for (const [index, step] of path.steps.entries()) {
    const row = el("li", "practice-path-item");
    row.append(el("span", "practice-path-step", String(index + 1)));
    const body = el("div", "practice-path-body");
    body.append(el("span", "practice-path-label", step.stepLabel));
    const link = el("a", "practice-path-link");
    link.href = lessonHref(step);
    link.textContent = step.title;
    body.append(link);
    if (step.stepHint) {
      body.append(el("span", "practice-path-meta", step.stepHint));
    }
    const mins = formatReadingMinutes(step.readingMinutes);
    if (mins) body.append(el("span", "practice-path-meta", mins));
    row.append(body);
    list.append(row);
  }
  section.append(list);

  const actions = el("div", "practice-path-actions");
  const startBtn = el("a", "btn btn-primary practice-path-start");
  const startHref = lessonHref(path.start);
  startBtn.href = path.nextAfterStart ? `${startHref}${startHref.includes("?") ? "&" : "?"}pp=1` : startHref;
  startBtn.textContent = path.steps.length > 1 ? "Start practice ::" : "Open lesson ::";
  startBtn.addEventListener("click", () => {
    if (path.nextAfterStart) setPracticePathNext(path.nextAfterStart);
    else clearPracticePathNext();
  });
  actions.append(startBtn);
  section.append(actions);

  container.append(section);
}

function renderLearningExtras(container, manifest, roleId, careerData) {
  clearChildren(container);
  renderPracticePath(container, manifest, roleId, careerData);
  renderWeeklyGoal(container);
  renderWeeklyFocusGoal(container);
  renderInProgressLessons(container, manifest, roleId, careerData);
  renderConfusedLessons(container, manifest, roleId, careerData);
  renderReflectionNotes(container, manifest, roleId, careerData);
  renderBookmarks(container, manifest);
  const skipKeys = bookmarkKeysForHome(manifest);
  renderModuleMilestones(container, manifest, roleId, careerData);
  renderPathGaps(container, manifest, roleId, careerData);
  renderReviewQueue(container, manifest, roleId, careerData, skipKeys);
  renderRefreshSuggestions(container, manifest, roleId, careerData, skipKeys);
}

function renderProgressHero(container, manifest, roleId, careerData) {
  clearChildren(container);
  if (!manifest) return;

  const roleSlugs = moduleSlugsForRole(roleId, careerData);
  const stats = getStats(manifest, roleSlugs);
  const cont = findContinueLesson(manifest, roleSlugs);
  const upNext = cont ? findNextInPath(manifest, roleSlugs, cont) : null;
  const role = getRoleById(roleId, careerData);

  const card = el("div", "progress-hero");
  const head = el("div", "progress-hero-head");
  head.append(
    el("h2", null, role ? `Progress · ${role.title}` : "Your Progress"),
    el("span", "progress-hero-percent", `${stats.percent}%`)
  );
  card.append(head);

  const bar = el("div", "progress-bar");
  const fill = el("div", "progress-bar-fill");
  fill.style.width = `${stats.percent}%`;
  bar.append(fill);
  card.append(bar);

  const metaText =
    stats.completedCount === 0
      ? role
        ? `${stats.total} lessons in the ${role.title} path. Start reading. Progress saves in your browser.`
        : `${manifest.totalLessons} lessons available. Start reading on site. Progress saves in your browser. No account needed.`
      : role
        ? `${stats.completedCount} of ${stats.total} lessons read for ${role.title} (${stats.percent}%).`
        : stats.guidesCompleted > 0
          ? `${stats.completedCount} of ${manifest.totalLessons} lessons read (${stats.percent}%). ${stats.guidesCompleted} guide${stats.guidesCompleted === 1 ? "" : "s"} marked read. Progress stays on this device only.`
          : `You have read ${stats.completedCount} of ${manifest.totalLessons} lessons (${stats.percent}%). Progress stays on this device only.`;

  card.append(el("p", "progress-hero-meta", metaText));

  if (storageAvailable()) {
    const slugs = roleSlugs?.length ? roleSlugs : null;
    const reviewCount = countReviewDue(manifest, slugs);
    if (reviewCount > 0) {
      const reviewRow = el("p", "progress-hero-review");
      const first = findFirstReviewDue(manifest, slugs);
      if (first) {
        const link = el("a", "progress-hero-review-link");
        link.href = lessonHref(first);
        link.textContent =
          reviewCount === 1
            ? "1 lesson ready to review"
            : `${reviewCount} lessons ready to review`;
        reviewRow.append(link);
      } else {
        reviewRow.textContent =
          reviewCount === 1
            ? "1 lesson ready to review"
            : `${reviewCount} lessons ready to review`;
      }
      card.append(reviewRow);
    }
  }

  if (cont || upNext) {
    const recs = el("div", "progress-hero-recs");
    if (cont) {
      const contRow = el("div", "progress-rec-row");
      const contLabel = el("span", "progress-rec-label", cont.kind === "continue" ? "Continue" : "Start");
      const contLink = el("a", "progress-rec-link");
      contLink.href = lessonHref(cont);
      contLink.textContent = cont.title;
      contRow.append(contLabel, contLink);
      const mins = formatReadingMinutes(cont.readingMinutes);
      if (mins) contRow.append(el("span", "progress-rec-time", mins));
      recs.append(contRow);
    }
    if (upNext && (!cont || upNext.key !== cont.key)) {
      const nextRow = el("div", "progress-rec-row");
      nextRow.append(el("span", "progress-rec-label", "Up next"));
      const nextLink = el("a", "progress-rec-link");
      nextLink.href = lessonHref(upNext);
      nextLink.textContent = upNext.title;
      nextRow.append(nextLink);
      const mins = formatReadingMinutes(upNext.readingMinutes);
      if (mins) nextRow.append(el("span", "progress-rec-time", mins));
      recs.append(nextRow);
    }
    card.append(recs);
  }

  const actions = el("div", "progress-hero-actions");
  const primary = el("div", "progress-hero-actions-primary");
  if (cont) {
    const btn = el("a", "btn btn-primary");
    btn.href = lessonHref(cont);
    btn.textContent = stats.completedCount === 0 ? "Start Learning ::" : "Continue Learning ::";
    primary.append(btn);
  }
  const readBtn = el("a", "btn btn-ghost");
  readBtn.href = role ? careerGuideUrl(role) : buildLearnUrl({ guideId: "learning-roadmap" });
  readBtn.textContent = role ? "View Role Guide ::" : "Open Roadmap ::";
  primary.append(readBtn);
  actions.append(primary);

  if (storageAvailable()) {
    const util = el("div", "progress-hero-actions-util");
    const exportBtn = el("button", "link-btn");
    exportBtn.type = "button";
    exportBtn.textContent = "Export progress";
    exportBtn.addEventListener("click", exportProgress);
    const importBtn = el("button", "link-btn");
    importBtn.type = "button";
    importBtn.textContent = "Import progress";
    importBtn.addEventListener("click", () => {
      importProgress(() => refreshProgress(manifest, roleId, careerData));
    });
    const resetBtn = el("button", "link-btn link-btn-danger");
    resetBtn.type = "button";
    resetBtn.textContent = "Reset progress";
    resetBtn.addEventListener("click", () => {
      if (resetProgress()) refreshProgress(manifest, roleId, careerData);
    });
    util.append(exportBtn, el("span", "sep", "·"), importBtn, el("span", "sep", "·"), resetBtn);
    actions.append(util);
  }

  card.append(actions);

  const extrasHost = document.getElementById("learning-extras");
  if (extrasHost) renderLearningExtras(extrasHost, manifest, roleId, careerData);

  container.append(card);
}

function refreshProgress(manifest, roleId, careerData) {
  manifestRef = manifest;
  roleRef = roleId;
  careerRef = careerData;
  renderProgressHero(document.getElementById("progress-hero"), manifest, roleId, careerData);
  updateModulesSection(roleId, careerData, manifest);
}

let projectsCache = null;

let modulesCache = null;
let careerCache = null;
let selectedRoleId = "all";

function roleModuleSlugs(roleId) {
  return moduleSlugsForRole(roleId, careerCache);
}

function renderCareerSummary(container, roleId, careerData) {
  clearChildren(container);
  const role = getRoleById(roleId, careerData);
  if (!role) {
    container.hidden = true;
    return;
  }

  const slugs = roleModuleSlugs(roleId) || [];
  container.hidden = false;
  container.append(
    el("p", "career-role-summary-text", roleSummary(role, slugs.length)),
    el("span", "career-role-summary-focus", role.focus)
  );

  const links = el("div", "career-role-summary-links");
  const guide = el("a", "link", "Full role guide ::");
  guide.href = careerGuideUrl(role);
  links.append(guide);

  if (role.extras?.length) {
    const note = el("span", "career-role-summary-extra", role.extras.join(" · "));
    links.append(note);
  }
  container.append(links);
}

function renderCareerRoles(container, careerData, roleId, onSelect) {
  clearChildren(container);

  const allCard = el("button", `career-role-card${roleId === "all" ? " selected" : ""}`);
  allCard.type = "button";
  allCard.dataset.roleId = "all";
  allCard.setAttribute("aria-pressed", roleId === "all" ? "true" : "false");
  allCard.append(
    el("span", "career-role-title", "All Modules"),
    el("span", "career-role-focus", "Full curriculum"),
    el("span", "career-role-time", "26 modules")
  );
  allCard.addEventListener("click", () => onSelect("all"));
  container.append(allCard);

  for (const role of careerData.roles) {
    const slugs = moduleSlugsForRole(role.id, careerData) || [];
    const card = el("button", `career-role-card${roleId === role.id ? " selected" : ""}`);
    card.type = "button";
    card.dataset.roleId = role.id;
    card.setAttribute("aria-pressed", roleId === role.id ? "true" : "false");
    card.append(
      el("span", "career-role-title", role.title),
      el("span", "career-role-focus", role.focus),
      el("span", "career-role-time", `${role.time} · ${slugs.length} modules`)
    );
    card.addEventListener("click", () => onSelect(role.id));
    container.append(card);
  }
}

function updateModulesSection(roleId, careerData, manifest) {
  const role = getRoleById(roleId, careerData);
  const slugs = roleModuleSlugs(roleId);
  const count = slugs?.length || modulesCache?.modules.length || 26;

  const heading = document.getElementById("modules-heading");
  const desc = document.getElementById("modules-desc");
  if (heading) {
    heading.textContent = role ? `${count} Modules for ${role.title}` : "26 Modules from Zero to Hero";
  }
  if (desc) {
    desc.textContent = role
      ? `Showing modules from the ${role.title} career path. Phase tabs still work within this filtered set.`
      : "Pick a career path above, then study the modules for your role. Filter by phase or open notebooks on GitHub.";
  }

  renderCareerSummary(document.getElementById("career-role-summary"), roleId, careerData);

  const active = document.querySelector(".phase-tab.active")?.dataset.phase || "all";
  renderPhaseTabs(document.getElementById("phase-tabs"), modulesCache, roleId, careerData, (phase) => {
    renderModules(document.getElementById("module-list"), modulesCache, phase, manifest, roleId, careerData);
  });
  renderModules(document.getElementById("module-list"), modulesCache, active, manifest, roleId, careerData);
}

function renderStats(container, repo) {
  clearChildren(container);
  const items = [
    { num: String(repo.modules), label: "Modules" },
    { num: String(repo.projects), label: "Projects" },
    { num: repo.stars, label: "GitHub Stars" },
    { num: "265", label: "On-Site Lessons" },
  ];

  for (const item of items) {
    const card = el("div", "stat-card");
    card.append(el("div", "num", item.num), el("div", "label", item.label));
    container.append(card);
  }
}

function renderStudyGuides(container, guides, fallbackRepo) {
  clearChildren(container);

  for (const guide of guides) {
    const localHref = guideLocalHref(guide.title) || guide.localGuide;
    const href = localHref || sanitizeLink(guide.href, fallbackRepo);
    const title = String(guide.title || "Guide").slice(0, 120);
    const description = String(guide.description || "").slice(0, 300);

    const card = el("article", "guide-card");
    card.append(el("h3", null, title), el("p", null, description));

    const links = el("div", "guide-card-links");
    const read = el("a", "link btn-read", "Read on site ::");
    read.href = href;
    links.append(read);

    const gh = externalLink(sanitizeLink(guide.href, fallbackRepo), "link link-muted", "GitHub ::");
    links.append(gh);

    card.append(links);
    container.append(card);
  }
}

function renderVideoCard(item, fallbackChannel) {
  const videoId = sanitizeVideoId(item.videoId);
  const playlistId = sanitizePlaylistId(item.playlistId);
  const title = String(item.title || "Video").slice(0, 160);
  const description = String(item.description || "").slice(0, 220);
  const tag = String(item.tag || "").slice(0, 40);

  const playlistHref = youtubePlaylistUrl(playlistId);
  const href = videoId
    ? youtubeWatch(videoId)
    : sanitizeLink(playlistHref || item.url, fallbackChannel);

  const card = el("article", `video-card${playlistId ? " is-playlist" : ""}`);
  const link = externalLink(href, null, "");
  const thumbWrap = el("div", "video-thumb");

  if (tag) thumbWrap.append(el("span", "tag", tag));

  if (videoId) {
    const plate = el("div", "playlist-thumb");
    plate.append(el("span", "playlist-icon", "▶"), el("span", "playlist-label", "YouTube Video"));
    thumbWrap.append(plate);
  } else if (playlistId) {
    const plate = el("div", "playlist-thumb");
    plate.append(el("span", "playlist-icon", "▶"), el("span", "playlist-label", "YouTube Playlist"));
    thumbWrap.append(plate);
  } else {
    thumbWrap.append(el("div", "placeholder", "Watch on YouTube ::"));
  }

  const body = el("div", "video-body");
  body.append(el("h3", null, title));
  if (description) body.append(el("p", "video-desc", description));

  link.append(thumbWrap, body);
  card.append(link);
  return card;
}

function renderVideos(grid, actions, config) {
  clearChildren(grid);
  clearChildren(actions);
  grid.classList.remove("is-expanded");

  const { youtube, links } = config;
  const fallback = links.youtubeChannel;
  const playlists = youtube.featuredPlaylists || [];
  const videos = (youtube.featuredVideos || []).slice(0, 12);
  const hiddenCount = Math.max(0, playlists.length - PLAYLIST_INITIAL);

  for (let i = 0; i < playlists.length; i++) {
    const card = renderVideoCard({ ...playlists[i], tag: playlists[i].tag || "Playlist" }, fallback);
    if (i >= PLAYLIST_INITIAL) card.dataset.beyondInitial = "true";
    grid.append(card);
  }

  for (const v of videos) {
    if (!sanitizeVideoId(v.videoId)) continue;
    grid.append(renderVideoCard(v, fallback));
  }

  if (hiddenCount <= 0) return;

  const showMore = el(
    "button",
    "btn btn-ghost btn-sm",
    `Show ${hiddenCount} more playlist${hiddenCount === 1 ? "" : "s"} ::`,
  );
  showMore.type = "button";
  showMore.addEventListener("click", () => {
    const expanded = grid.classList.toggle("is-expanded");
    showMore.textContent = expanded ? "Show fewer ::" : `Show ${hiddenCount} more playlist${hiddenCount === 1 ? "" : "s"} ::`;
  });

  const browseAll = externalLink(
    `${fallback.replace(/\/$/, "")}/playlists`,
    "btn btn-ghost btn-sm link-muted",
    "Browse all on YouTube ::",
  );

  actions.append(showMore, browseAll);
}

function renderModules(container, modulesData, activePhase, manifest, roleId, careerData) {
  clearChildren(container);

  const map = Object.fromEntries(modulesData.modules.map((m) => [m.slug, m]));
  let slugs = modulesData.modules.map((m) => m.slug);

  if (roleId && roleId !== "all") {
    slugs = filterSlugs(slugs, roleId, careerData);
  }

  if (activePhase !== "all") {
    const phase = modulesData.phases.find((p) => p.id === activePhase);
    const phaseSlugs = phase ? phase.modules.filter(isValidSlug) : slugs;
    slugs = slugs.filter((s) => phaseSlugs.includes(s));
  }

  if (slugs.length === 0) {
    container.append(
      el("p", "module-list-empty", "No modules match this phase for the selected career path.")
    );
    return;
  }

  for (const slug of slugs) {
    const m = map[slug];
    if (!m) continue;

    const prog = manifest ? getModuleProgress(slug, manifest) : null;

    const row = el("div", "module-row");
    row.append(el("span", "module-num", slug.split("-")[0]));

    const info = el("div", "module-info");
    info.append(el("h4", null, m.title), el("p", null, m.summary));
    if (prog && prog.total > 0) {
      info.append(el("span", "module-progress-mini", `${prog.done}/${prog.total} lessons read`));
    }

    const actions = el("div", "module-row-actions");
    const study = el("a", "module-link module-link-primary", "Study ::");
    study.href = moduleHref(slug);
    actions.append(study);
    actions.append(externalLink(`${REPO_BASE}/${encodeURIComponent(slug)}`, "module-link link-muted", "GitHub ::"));

    row.append(info, actions);
    container.append(row);
  }
}

function renderPhaseTabs(container, modulesData, roleId, careerData, onSelect) {
  clearChildren(container);

  let baseSlugs = modulesData.modules.map((m) => m.slug);
  if (roleId && roleId !== "all") {
    baseSlugs = filterSlugs(baseSlugs, roleId, careerData);
  }

  const tabs = [{ id: "all", name: "All Modules" }];
  for (const phase of modulesData.phases) {
    const phaseSlugs = phase.modules.filter(isValidSlug);
    const visible = phaseSlugs.some((s) => baseSlugs.includes(s));
    if (visible) tabs.push({ id: phase.id, name: `Phase ${phase.id}` });
  }

  tabs.forEach((t, index) => {
    const btn = el("button", `phase-tab${index === 0 ? " active" : ""}`, t.name);
    btn.type = "button";
    btn.dataset.phase = t.id;
    btn.addEventListener("click", () => {
      container.querySelectorAll(".phase-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onSelect(t.id);
    });
    container.append(btn);
  });
}

function applyConfig(config) {
  const logo = document.getElementById("brand-logo");
  if (logo) {
    logo.src = sanitizeLocalAsset(config.brand.logo);
    logo.alt = config.brand.name;
  }

  const year = document.getElementById("footer-year");
  if (year) year.textContent = String(new Date().getFullYear());

  const heroTitle = document.getElementById("hero-repo-title");
  if (heroTitle) heroTitle.textContent = config.repo.title;

  const heroDesc = document.getElementById("hero-repo-desc");
  if (heroDesc && config.repo.description) {
    heroDesc.textContent = config.repo.description;
  }

  const tagline = document.getElementById("hero-tagline");
  if (tagline) tagline.textContent = config.brand.tagline;

  const skills = document.getElementById("hero-skills");
  if (skills) skills.textContent = config.brand.skills;

  const linkMap = {
    github: config.links.githubRepo,
    youtube: config.links.youtubeChannel,
    subscribe: config.links.youtubeSubscribe,
    support: config.links.buyMeACoffee,
    amazon: config.links.amazonShop,
  };

  for (const [key, href] of Object.entries(linkMap)) {
    document.querySelectorAll(`[data-link='${key}']`).forEach((a) => {
      a.href = href;
      a.rel = "noopener noreferrer";
    });
  }
}

function showLoadError() {
  const main = document.querySelector("main");
  if (!main) return;
  const note = el("p", "load-error", "We could not load the study materials. Please refresh the page or try again later.");
  main.prepend(note);
}

async function init() {
  let manifest = null;
  try {
    const [rawConfig, rawModules, careerData] = await Promise.all([
      loadJSON("data/site-config.json"),
      loadJSON("data/modules.json"),
      loadCareerPaths(),
    ]);

    careerCache = careerData;
    selectedRoleId = getSelectedRoleId();

    try {
      manifest = await loadManifest();
    } catch (err) {
      const hero = document.getElementById("progress-hero");
      if (hero) renderContentError(hero, err);
    }

    const config = validateSiteConfig(rawConfig);
    const modulesData = validateModulesData(rawModules);
    modulesCache = modulesData;

    applyConfig(config);
    initWhatsNew(document.getElementById("whats-new"));
    renderStats(document.getElementById("stats"), config.repo);
    if (manifest) renderProgressHero(document.getElementById("progress-hero"), manifest, selectedRoleId, careerData);
    manifestRef = manifest;
    roleRef = selectedRoleId;
    careerRef = careerData;

    try {
      projectsCache = await loadProjects();
      renderProjectsSection(document.getElementById("projects-grid"), projectsCache);
      bindProjectsRefresh(document.getElementById("projects-grid"), projectsCache);
    } catch {
      /* projects optional */
    }

    const onRoleSelect = (roleId) => setSelectedRoleId(roleId);
    renderCareerRoles(document.getElementById("career-role-grid"), careerData, selectedRoleId, onRoleSelect);

    renderStudyGuides(document.getElementById("study-guides"), config.studyGuides, config.links.githubRepo);
    renderVideos(
      document.getElementById("video-grid"),
      document.getElementById("video-library-actions"),
      config,
    );
    updateModulesSection(selectedRoleId, careerData, manifest);

    onCareerChange((roleId) => {
      selectedRoleId = roleId;
      renderCareerRoles(document.getElementById("career-role-grid"), careerData, roleId, onRoleSelect);
      if (manifest) refreshProgress(manifest, roleId, careerData);
      else updateModulesSection(roleId, careerData, manifest);
      document.getElementById("modules")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    if (manifest) {
      onProgressChange(() => refreshProgress(manifest, selectedRoleId, careerData));
    }
  } catch {
    showLoadError();
  }
}

document.addEventListener("DOMContentLoaded", init);
