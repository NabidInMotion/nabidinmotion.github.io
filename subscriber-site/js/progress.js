/**
 * localStorage progress for the study hub. No accounts, no server sync.
 */
const STORAGE_KEY = "nim-study-progress";
const SCHEMA_VERSION = 2;
const MAX_IMPORT_BYTES = 256 * 1024;
const PROGRESS_KEY_RE = /^(guide\/[\w-]+|[\w-]+\/[\w-]+)$/;
const PROJECT_ID_RE = /^(beginner|intermediate|advanced)-\d{2}$/;
const CONFIDENCE_LEVELS = new Set([0, 1, 2]);

function isValidProgressKey(key) {
  return typeof key === "string" && key.length > 0 && key.length <= 120 && PROGRESS_KEY_RE.test(key);
}

function isValidProjectId(id) {
  return typeof id === "string" && PROJECT_ID_RE.test(id);
}

function normalizeConfidence(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, level] of Object.entries(raw)) {
    if (!isValidProgressKey(key)) continue;
    const n = Number(level);
    if (CONFIDENCE_LEVELS.has(n)) out[key] = n;
  }
  return out;
}

function normalizeProjects(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const allowed = new Set(["not_started", "in_progress", "done"]);
  const out = {};
  for (const [id, status] of Object.entries(raw)) {
    if (!isValidProjectId(id)) continue;
    if (allowed.has(status)) out[id] = status;
  }
  return out;
}

function normalizeConfidenceAt(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, at] of Object.entries(raw)) {
    if (!isValidProgressKey(key)) continue;
    if (typeof at === "string" && at.length <= 40) out[key] = at;
  }
  return out;
}

function normalizeReflections(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, text] of Object.entries(raw)) {
    if (!isValidProgressKey(key)) continue;
    if (typeof text === "string" && text.trim()) {
      out[key] = text.trim().slice(0, 500);
    }
  }
  return out;
}

const REVIEW_AFTER_DAYS = 3;

function weekStartIso(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

function defaultState() {
  return {
    v: SCHEMA_VERSION,
    completedLessons: [],
    lastLesson: null,
    confidence: {},
    projects: {},
    focusMinutesThisWeek: 0,
    focusWeekStart: weekStartIso(),
    confidenceAt: {},
    reflections: {},
    weeklyLessonGoal: 3,
    lessonsReadThisWeek: 0,
    lessonWeekStart: weekStartIso(),
    lastSeenCommit: null,
    lastVisitAt: null,
    updatedAt: null,
  };
}

function normalizeImportState(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const completedLessons = Array.isArray(data.completedLessons)
    ? [...new Set(data.completedLessons.filter(isValidProgressKey))].slice(0, 500)
    : [];

  let lastLesson = typeof data.lastLesson === "string" && isValidProgressKey(data.lastLesson)
    ? data.lastLesson
    : null;

  const focusMinutesThisWeek =
    typeof data.focusMinutesThisWeek === "number" && data.focusMinutesThisWeek >= 0
      ? Math.min(Math.round(data.focusMinutesThisWeek), 10000)
      : 0;
  const focusWeekStart =
    typeof data.focusWeekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.focusWeekStart)
      ? data.focusWeekStart
      : weekStartIso();

  return {
    v: SCHEMA_VERSION,
    completedLessons,
    lastLesson,
    confidence: normalizeConfidence(data.confidence),
    projects: normalizeProjects(data.projects),
    focusMinutesThisWeek,
    focusWeekStart,
    confidenceAt: normalizeConfidenceAt(data.confidenceAt),
    reflections: normalizeReflections(data.reflections),
    weeklyLessonGoal:
      typeof data.weeklyLessonGoal === "number" && data.weeklyLessonGoal >= 0
        ? Math.min(Math.round(data.weeklyLessonGoal), 50)
        : 3,
    lessonsReadThisWeek:
      typeof data.lessonsReadThisWeek === "number" && data.lessonsReadThisWeek >= 0
        ? Math.min(Math.round(data.lessonsReadThisWeek), 500)
        : 0,
    lessonWeekStart:
      typeof data.lessonWeekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.lessonWeekStart)
        ? data.lessonWeekStart
        : weekStartIso(),
    lastSeenCommit: typeof data.lastSeenCommit === "string" ? data.lastSeenCommit.slice(0, 64) : null,
    lastVisitAt: typeof data.lastVisitAt === "string" ? data.lastVisitAt : null,
    updatedAt: null,
  };
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return defaultState();
    return {
      v: SCHEMA_VERSION,
      completedLessons: Array.isArray(data.completedLessons)
        ? data.completedLessons.filter((k) => typeof k === "string").slice(0, 500)
        : [],
      lastLesson: typeof data.lastLesson === "string" ? data.lastLesson : null,
      confidence: normalizeConfidence(data.confidence),
      projects: normalizeProjects(data.projects),
      focusMinutesThisWeek:
        typeof data.focusMinutesThisWeek === "number" && data.focusMinutesThisWeek >= 0
          ? Math.min(Math.round(data.focusMinutesThisWeek), 10000)
          : 0,
      focusWeekStart:
        typeof data.focusWeekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.focusWeekStart)
          ? data.focusWeekStart
          : weekStartIso(),
      confidenceAt: normalizeConfidenceAt(data.confidenceAt),
      reflections: normalizeReflections(data.reflections),
      weeklyLessonGoal:
        typeof data.weeklyLessonGoal === "number" && data.weeklyLessonGoal >= 0
          ? Math.min(Math.round(data.weeklyLessonGoal), 50)
          : 3,
      lessonsReadThisWeek:
        typeof data.lessonsReadThisWeek === "number" && data.lessonsReadThisWeek >= 0
          ? Math.min(Math.round(data.lessonsReadThisWeek), 500)
          : 0,
      lessonWeekStart:
        typeof data.lessonWeekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.lessonWeekStart)
          ? data.lessonWeekStart
          : weekStartIso(),
      lastSeenCommit: typeof data.lastSeenCommit === "string" ? data.lastSeenCommit : null,
      lastVisitAt: typeof data.lastVisitAt === "string" ? data.lastVisitAt : null,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    };
  } catch {
    return defaultState();
  }
}

function save(state) {
  const next = { ...state, v: SCHEMA_VERSION, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("nim-progress-change", { detail: next }));
    return true;
  } catch {
    return false;
  }
}

export function lessonKey(moduleSlug, lessonId) {
  return `${moduleSlug}/${lessonId}`;
}

export function guideKey(guideId) {
  return `guide/${guideId}`;
}

export function getProgress() {
  return loadRaw();
}

export function isLessonComplete(key) {
  return loadRaw().completedLessons.includes(key);
}

function bumpWeeklyLessons(state) {
  const currentWeek = weekStartIso();
  if (state.lessonWeekStart !== currentWeek) {
    state.lessonsReadThisWeek = 1;
    state.lessonWeekStart = currentWeek;
  } else {
    state.lessonsReadThisWeek = (state.lessonsReadThisWeek || 0) + 1;
  }
}

export function markLessonComplete(key, complete = true) {
  const state = loadRaw();
  const wasComplete = state.completedLessons.includes(key);
  const set = new Set(state.completedLessons);
  if (complete) set.add(key);
  else set.delete(key);
  state.completedLessons = [...set];
  state.lastLesson = complete ? key : state.lastLesson;
  if (complete && !wasComplete) bumpWeeklyLessons(state);
  return save(state);
}

export function setLastLesson(key) {
  const state = loadRaw();
  state.lastLesson = key;
  return save(state);
}

export function getConfidence(key) {
  const level = loadRaw().confidence[key];
  return CONFIDENCE_LEVELS.has(level) ? level : null;
}

/** @param {string} key @param {0|1|2|null} level 0=Not yet, 1=Partly, 2=Yes */
export function setConfidence(key, level) {
  if (!isValidProgressKey(key)) return false;
  const state = loadRaw();
  if (!state.confidenceAt) state.confidenceAt = {};
  if (level === null || level === undefined) {
    delete state.confidence[key];
    delete state.confidenceAt[key];
  } else if (CONFIDENCE_LEVELS.has(level)) {
    state.confidence[key] = level;
    state.confidenceAt[key] = new Date().toISOString();
  } else {
    return false;
  }
  return save(state);
}

export function getReflection(key) {
  return loadRaw().reflections?.[key] || "";
}

export function setReflection(key, text) {
  if (!isValidProgressKey(key)) return false;
  const state = loadRaw();
  if (!state.reflections) state.reflections = {};
  const trimmed = typeof text === "string" ? text.trim().slice(0, 500) : "";
  if (!trimmed) delete state.reflections[key];
  else state.reflections[key] = trimmed;
  return save(state);
}

export function getWeeklyLessonGoal() {
  return loadRaw().weeklyLessonGoal ?? 3;
}

export function setWeeklyLessonGoal(goal) {
  const state = loadRaw();
  state.weeklyLessonGoal = Math.min(Math.max(Math.round(goal), 0), 50);
  return save(state);
}

export function getWeeklyLessonProgress() {
  const state = loadRaw();
  const currentWeek = weekStartIso();
  const read = state.lessonWeekStart === currentWeek ? state.lessonsReadThisWeek || 0 : 0;
  return {
    goal: state.weeklyLessonGoal ?? 3,
    read,
    weekStart: currentWeek,
  };
}

export function findReviewQueue(manifest, moduleSlugs = null, minDays = REVIEW_AFTER_DAYS) {
  const state = loadRaw();
  const now = Date.now();
  const minMs = minDays * 86400000;
  const items = [];

  for (const item of iterLessons(manifest, moduleSlugs)) {
    const level = state.confidence[item.key];
    if (level !== 0 && level !== 1) continue;
    const at = state.confidenceAt?.[item.key];
    if (!at) continue;
    const age = now - new Date(at).getTime();
    if (age < minMs) continue;
    items.push({
      ...item,
      type: "module",
      kind: "review",
      confidenceLevel: level,
      confidenceLabel: level === 0 ? "Not yet" : "Partly",
      daysSince: Math.floor(age / 86400000),
    });
  }

  for (const guide of manifest?.guides || []) {
    const key = guideKey(guide.id);
    const level = state.confidence[key];
    if (level !== 0 && level !== 1) continue;
    const at = state.confidenceAt?.[key];
    if (!at) continue;
    const age = now - new Date(at).getTime();
    if (age < minMs) continue;
    items.push({
      key,
      type: "guide",
      guideId: guide.id,
      title: guide.title,
      confidenceLevel: level,
      confidenceLabel: level === 0 ? "Not yet" : "Partly",
      daysSince: Math.floor(age / 86400000),
      kind: "review",
    });
  }

  items.sort((a, b) => b.daysSince - a.daysSince);
  return items.slice(0, 5);
}

export function getProjectStatus(projectId) {
  return loadRaw().projects[projectId] || "not_started";
}

export function setProjectStatus(projectId, status) {
  if (!isValidProjectId(projectId)) return false;
  const allowed = ["not_started", "in_progress", "done"];
  if (!allowed.includes(status)) return false;
  const state = loadRaw();
  if (status === "not_started") delete state.projects[projectId];
  else state.projects[projectId] = status;
  return save(state);
}

export function getProjectStats(projects) {
  const state = loadRaw();
  const total = projects?.length || 0;
  let done = 0;
  let inProgress = 0;
  for (const p of projects || []) {
    const s = state.projects[p.id] || "not_started";
    if (s === "done") done += 1;
    else if (s === "in_progress") inProgress += 1;
  }
  return { total, done, inProgress, percent: total ? Math.round((done / total) * 100) : 0 };
}

export function getLastSeenCommit() {
  return loadRaw().lastSeenCommit;
}

export function markVisitSeen(commitSha) {
  const state = loadRaw();
  state.lastVisitAt = new Date().toISOString();
  if (typeof commitSha === "string" && commitSha) {
    state.lastSeenCommit = commitSha.slice(0, 64);
  }
  return save(state);
}

function* iterLessons(manifest, moduleSlugs = null) {
  const allowed = moduleSlugs?.length ? new Set(moduleSlugs) : null;
  for (const mod of manifest?.modules || []) {
    if (allowed && !allowed.has(mod.slug)) continue;
    for (const lesson of mod.lessons || []) {
      yield {
        key: lessonKey(mod.slug, lesson.id),
        module: mod.slug,
        lessonId: lesson.id,
        title: lesson.title,
        moduleTitle: mod.title,
        readingMinutes: lesson.readingMinutes || null,
      };
    }
  }
}

export function findFirstIncomplete(manifest, moduleSlugs = null) {
  const state = loadRaw();
  for (const item of iterLessons(manifest, moduleSlugs)) {
    if (!state.completedLessons.includes(item.key)) {
      return { ...item, type: "module" };
    }
  }
  return null;
}

export function findContinueLesson(manifest, moduleSlugs = null) {
  const state = loadRaw();
  const allowed = moduleSlugs?.length ? new Set(moduleSlugs) : null;

  if (state.lastLesson && !state.completedLessons.includes(state.lastLesson)) {
    const parsed = parseLessonKey(state.lastLesson, manifest);
    if (parsed) {
      if (parsed.type === "guide" || !allowed || allowed.has(parsed.module)) {
        return { ...parsed, kind: "continue" };
      }
    }
  }

  const next = findFirstIncomplete(manifest, moduleSlugs);
  return next ? { ...next, kind: "start" } : null;
}

export function findUpNext(manifest, moduleSlugs = null) {
  const cont = findContinueLesson(manifest, moduleSlugs);
  if (!cont) return null;
  return findNextInPath(manifest, moduleSlugs, cont);
}

export function findNextInPath(manifest, moduleSlugs = null, fromItem = null) {
  if (!fromItem) return findFirstIncomplete(manifest, moduleSlugs);

  if (fromItem.type === "guide") {
    return findFirstIncomplete(manifest, moduleSlugs);
  }

  let found = false;
  for (const item of iterLessons(manifest, moduleSlugs)) {
    if (!found) {
      if (item.module === fromItem.module && item.lessonId === fromItem.lessonId) {
        found = true;
      }
      continue;
    }
    return { ...item, type: "module", kind: "next" };
  }
  return null;
}

export function getStats(manifest, moduleSlugs = null) {
  const state = loadRaw();
  if (moduleSlugs?.length) {
    const allowed = new Set(moduleSlugs);
    let total = 0;
    let completed = 0;
    for (const mod of manifest?.modules || []) {
      if (!allowed.has(mod.slug)) continue;
      for (const lesson of mod.lessons || []) {
        total += 1;
        if (isLessonComplete(lessonKey(mod.slug, lesson.id))) completed += 1;
      }
    }
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      total,
      completedCount: completed,
      moduleLessonsCompleted: completed,
      guidesCompleted: 0,
      percent,
      lastLesson: state.lastLesson,
      completedLessons: state.completedLessons,
      scoped: true,
    };
  }

  const total = manifest?.totalLessons || 0;
  const moduleCompleted = state.completedLessons.filter((k) => !k.startsWith("guide/")).length;
  const guideCompleted = state.completedLessons.filter((k) => k.startsWith("guide/")).length;
  const percent = total > 0 ? Math.round((moduleCompleted / total) * 100) : 0;

  return {
    total,
    completedCount: moduleCompleted,
    moduleLessonsCompleted: moduleCompleted,
    guidesCompleted: guideCompleted,
    guideTotal: manifest?.guides?.length || 0,
    percent,
    lastLesson: state.lastLesson,
    completedLessons: state.completedLessons,
    scoped: false,
  };
}

export function getModuleProgress(moduleSlug, manifest) {
  const mod = manifest?.modules?.find((m) => m.slug === moduleSlug);
  if (!mod) return { done: 0, total: 0, percent: 0 };
  const total = mod.lessons.length;
  const done = mod.lessons.filter((l) =>
    isLessonComplete(lessonKey(moduleSlug, l.id))
  ).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

export function parseLessonKey(key, manifest) {
  if (!key) return null;
  if (key.startsWith("guide/")) {
    const guideId = key.slice(6);
    const guide = manifest.guides?.find((g) => g.id === guideId);
    if (!guide) return null;
    return { type: "guide", guideId, title: guide.title };
  }
  const [module, lessonId] = key.split("/");
  const mod = manifest.modules?.find((m) => m.slug === module);
  const lesson = mod?.lessons?.find((l) => l.id === lessonId);
  if (!mod || !lesson) return null;
  return {
    type: "module",
    module,
    lessonId,
    title: lesson.title,
    moduleTitle: mod.title,
    readingMinutes: lesson.readingMinutes || null,
  };
}

export function formatReadingMinutes(minutes) {
  if (!minutes || minutes < 1) return null;
  return minutes === 1 ? "~1 min read" : `~${minutes} min read`;
}

export function getFocusWeeklyMinutes() {
  const state = loadRaw();
  const currentWeek = weekStartIso();
  if (state.focusWeekStart !== currentWeek) return 0;
  return state.focusMinutesThisWeek || 0;
}

export function recordFocusMinutes(minutes) {
  if (!storageAvailable() || !Number.isFinite(minutes) || minutes < 1) return false;
  const rounded = Math.min(Math.round(minutes), 480);
  const state = loadRaw();
  const currentWeek = weekStartIso();
  const prior =
    state.focusWeekStart === currentWeek ? state.focusMinutesThisWeek || 0 : 0;
  return save({
    ...state,
    focusMinutesThisWeek: prior + rounded,
    focusWeekStart: currentWeek,
  });
}

export function exportProgress() {
  const data = loadRaw();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nim-study-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importProgress(onComplete) {
  if (!storageAvailable()) {
    window.alert("Progress storage is not available in this browser.");
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.hidden = true;

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;

    if (file.size > MAX_IMPORT_BYTES) {
      window.alert("That file is too large. Choose a progress export downloaded from this Study Hub.");
      return;
    }

    try {
      const parsed = JSON.parse(await file.text());
      const normalized = normalizeImportState(parsed);
      if (!normalized) {
        window.alert("Invalid progress file. Choose a JSON file exported from this Study Hub.");
        return;
      }

      const count = normalized.completedLessons.length;
      const message = count === 0
        ? "Import this progress file? It will replace progress saved on this device."
        : `Import ${count} completed item${count === 1 ? "" : "s"}? This replaces progress on this device.`;

      if (!window.confirm(message)) return;

      if (!save(normalized)) {
        window.alert("Could not save imported progress. Check that browser storage is available.");
        return;
      }

      if (typeof onComplete === "function") onComplete(normalized);
    } catch {
      window.alert("Could not read that file. Choose a JSON export from this Study Hub.");
    }
  });

  document.body.append(input);
  input.click();
}

export function resetProgress() {
  const message =
    "Reset all learning progress on this device?\n\n" +
    "This clears: lessons read, continue position, confidence ratings, reflections, reading goal progress, project status, and focus time.\n" +
    "Your career path filter and visit history are kept.\n\n" +
    "This cannot be undone.";
  if (!window.confirm(message)) return false;

  const prior = loadRaw();
  const next = {
    ...defaultState(),
    lastSeenCommit: prior.lastSeenCommit,
    lastVisitAt: prior.lastVisitAt,
  };
  return save(next);
}

export function buildLearnUrl({ module, lessonId, guideId }) {
  if (guideId) return `learn.html?g=${encodeURIComponent(guideId)}`;
  const params = new URLSearchParams({ m: module, l: lessonId || "readme" });
  return `learn.html?${params.toString()}`;
}

export function onProgressChange(callback) {
  const handler = (e) => callback(e.detail || loadRaw());
  window.addEventListener("nim-progress-change", handler);
  return () => window.removeEventListener("nim-progress-change", handler);
}

export function storageAvailable() {
  try {
    const k = "__nim_test__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
