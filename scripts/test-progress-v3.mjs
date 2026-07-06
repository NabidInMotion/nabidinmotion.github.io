/**
 * Unit tests for progress.js v3 learning features (no browser).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const progressPath = path.join(root, "subscriber-site/js/progress.js");

const manifest = JSON.parse(
  readFileSync(path.join(root, "subscriber-site/content/manifest.json"), "utf8")
);

function mockStorage() {
  let store = {};
  global.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
  global.window = {
    dispatchEvent: () => true,
  };
}

async function loadProgress() {
  const url = `${pathToFileURL(progressPath).href}?t=${Date.now()}`;
  return import(url);
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

async function run() {
  const p = await loadProgress();
  const {
    findReviewQueue,
    findRefreshSuggestions,
    findGaps,
    getModuleMilestones,
    toggleBookmark,
    findBookmarks,
    markLessonComplete,
    setConfidence,
    recordFocusMinutes,
    getWeeklyFocusProgress,
    setWeeklyFocusGoal,
    pickReflectionPrompt,
    setReflection,
    getReflectionMeta,
    lessonKey,
  } = p;

  mockStorage();

  test("schema defaults to v3 on save", () => {
    markLessonComplete(lessonKey("01-python-for-data-science", "readme"), true, manifest);
    const raw = JSON.parse(localStorage.getItem("nim-study-progress"));
    assert.equal(raw.v, 3);
    assert.ok(raw.completedAt);
  });

  test("review queue uses graduated intervals for Not yet", () => {
    localStorage.clear();
    const key = lessonKey("01-python-for-data-science", "readme");
    setConfidence(key, 0);
    const state = JSON.parse(localStorage.getItem("nim-study-progress"));
    state.confidenceAt[key] = daysAgo(2);
    localStorage.setItem("nim-study-progress", JSON.stringify(state));
    const items = findReviewQueue(manifest);
    assert.ok(items.some((i) => i.key === key));
    assert.equal(items.find((i) => i.key === key).dueDays, 1);
  });

  test("refresh suggestions after 30 days", () => {
    localStorage.clear();
    const key = lessonKey("02-introduction-to-ml", "readme");
    markLessonComplete(key, true, manifest);
    setConfidence(key, 2);
    const state = JSON.parse(localStorage.getItem("nim-study-progress"));
    state.completedAt[key] = daysAgo(31);
    localStorage.setItem("nim-study-progress", JSON.stringify(state));
    const items = findRefreshSuggestions(manifest);
    assert.ok(items.some((i) => i.key === key));
  });

  test("findGaps detects skipped module", () => {
    localStorage.clear();
    const later = manifest.modules[2];
    const earlier = manifest.modules[0];
    markLessonComplete(lessonKey(later.slug, later.lessons[0].id), true, manifest);
    const gaps = findGaps(manifest);
    assert.ok(gaps.some((g) => g.slug === earlier.slug));
  });

  test("module milestone recorded when module complete", () => {
    localStorage.clear();
    const mod = manifest.modules[0];
    for (const lesson of mod.lessons) {
      markLessonComplete(lessonKey(mod.slug, lesson.id), true, manifest);
    }
    const milestones = getModuleMilestones(manifest);
    assert.ok(milestones.some((m) => m.slug === mod.slug));
  });

  test("bookmarks round-trip", () => {
    localStorage.clear();
    const key = lessonKey("01-python-for-data-science", "readme");
    const { ok } = toggleBookmark(key);
    assert.equal(ok, true);
    const items = findBookmarks(manifest);
    assert.equal(items.length, 1);
    assert.equal(items[0].key, key);
    assert.ok(items[0].bookmarkedAt);
  });

  test("focus minutes per lesson and weekly goal", () => {
    localStorage.clear();
    const key = lessonKey("01-python-for-data-science", "readme");
    setWeeklyFocusGoal(120);
    recordFocusMinutes(25, key);
    const weekly = getWeeklyFocusProgress();
    assert.equal(weekly.goal, 120);
    assert.equal(weekly.minutes, 25);
    const state = JSON.parse(localStorage.getItem("nim-study-progress"));
    assert.equal(state.focusByKey[key], 25);
  });

  test("reflection prompt metadata saved", () => {
    localStorage.clear();
    const key = lessonKey("01-python-for-data-science", "readme");
    const prompt = pickReflectionPrompt(key);
    assert.ok(["summary", "confused", "apply"].includes(prompt));
    setReflection(key, "Test reflection", "apply");
    const meta = getReflectionMeta(key);
    assert.equal(meta.prompt, "apply");
  });

  test("v2 import upgrades to v3 fields", async () => {
    localStorage.clear();
    localStorage.setItem(
      "nim-study-progress",
      JSON.stringify({
        v: 2,
        completedLessons: [lessonKey("01-python-for-data-science", "readme")],
        confidence: {},
        confidenceAt: {},
        reflections: {},
      })
    );
    const p2 = await loadProgress();
    const raw = p2.getProgress();
    assert.equal(raw.v, 3);
    assert.ok(Array.isArray(raw.bookmarks));
    assert.equal(raw.weeklyFocusGoal, 90);
  });

  console.log(`\n${passed} tests passed`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
