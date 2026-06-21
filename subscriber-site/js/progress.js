/**
 * localStorage progress for the study hub. No accounts, no server sync.
 */
const STORAGE_KEY = "nim-study-progress";
const SCHEMA_VERSION = 1;

function defaultState() {
  return {
    v: SCHEMA_VERSION,
    completedLessons: [],
    lastLesson: null,
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

export function markLessonComplete(key, complete = true) {
  const state = loadRaw();
  const set = new Set(state.completedLessons);
  if (complete) set.add(key);
  else set.delete(key);
  state.completedLessons = [...set];
  state.lastLesson = complete ? key : state.lastLesson;
  return save(state);
}

export function setLastLesson(key) {
  const state = loadRaw();
  state.lastLesson = key;
  return save(state);
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

export function findContinueLesson(manifest, moduleSlugs = null) {
  const state = loadRaw();
  const allowed = moduleSlugs?.length ? new Set(moduleSlugs) : null;

  if (state.lastLesson) {
    const parsed = parseLessonKey(state.lastLesson, manifest);
    if (parsed) {
      if (parsed.type === "guide" || !allowed || allowed.has(parsed.module)) return parsed;
    }
  }
  for (const mod of manifest.modules || []) {
    if (allowed && !allowed.has(mod.slug)) continue;
    for (const lesson of mod.lessons || []) {
      const key = lessonKey(mod.slug, lesson.id);
      if (!state.completedLessons.includes(key)) {
        return { module: mod.slug, lessonId: lesson.id, title: lesson.title, moduleTitle: mod.title };
      }
    }
  }
  return null;
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
  return { type: "module", module, lessonId, title: lesson.title, moduleTitle: mod.title };
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

export function resetProgress() {
  if (!window.confirm("Reset all learning progress on this device? This cannot be undone.")) return false;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("nim-progress-change", { detail: defaultState() }));
  return true;
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
