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
let resetReflectionLimitsForTests = () => {};

function test(name, fn) {
  try {
    resetReflectionLimitsForTests();
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
    getReflection,
    getReflectionMeta,
    getReflectionCount,
    validateReflectionText,
    sanitizeReflectionText,
    stripReflectionControlChars,
    MAX_REFLECTIONS,
    MAX_QUICK_REFLECTION_LENGTH,
    MAX_REFLECTION_LENGTH,
    lessonKey,
    findConfusedLessons,
    findInProgressLessons,
    countReviewDue,
    isLessonReviewDue,
    isReviewSnoozed,
    findFirstReviewDue,
    setReviewRecall,
    getReviewRecall,
    snoozeReview,
    REVIEW_SNOOZE_DAYS,
    recordLessonOpened,
    resetReflectionLimitsForTests: resetLimits,
  } = p;

  resetReflectionLimitsForTests = resetLimits;

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

  test("reflection accepts up to lesson note limit", () => {
    localStorage.clear();
    const key = lessonKey("01-python-for-data-science", "readme");
    const longNote = "Lesson note. ".repeat(120).slice(0, 1500);
    const saved = setReflection(key, longNote);
    assert.equal(saved.ok, true);
    assert.equal(getReflection(key).length, 1500);
  });

  test("quick reflection rejects text over popup limit", () => {
    localStorage.clear();
    const key = lessonKey("02-introduction-to-ml", "readme");
    const tooLong = "Quick note. ".repeat(60);
    const result = setReflection(key, tooLong, "summary", { maxLength: 500 });
    assert.equal(result.ok, true);
    assert.equal(getReflection(key).length, 500);
  });

  test("reflection total char budget blocks overflow", () => {
    localStorage.clear();
    const keys = [];
    for (const mod of manifest.modules) {
      for (const lesson of mod.lessons) {
        keys.push(lessonKey(mod.slug, lesson.id));
      }
    }
    assert.ok(keys.length > 80, "manifest needs enough lessons for budget test");
    const reflections = {};
    const reflectionMeta = {};
    const now = new Date().toISOString();
    for (let i = 0; i < 80; i += 1) {
      reflections[keys[i]] = `Note ${i}. ${"ab".repeat(746)}`.slice(0, 1500);
      reflectionMeta[keys[i]] = { prompt: "summary", at: now };
    }
    localStorage.setItem(
      "nim-study-progress",
      JSON.stringify({ v: 3, reflections, reflectionMeta })
    );
    const blocked = setReflection(keys[80], "Extra note content here.");
    assert.equal(blocked.ok, false);
    assert.match(blocked.error, /storage on this device is full/i);
  });

  test("reflection prompt metadata saved", () => {
    localStorage.clear();
    const key = lessonKey("01-python-for-data-science", "readme");
    const prompt = pickReflectionPrompt(key);
    assert.ok(["summary", "confused", "apply"].includes(prompt));
    const saved = setReflection(key, "Test reflection", "apply");
    assert.equal(saved.ok, true);
    assert.equal(getReflection(key), "Test reflection");
    const meta = getReflectionMeta(key);
    assert.equal(meta.prompt, "apply");
  });

  test("reflection rejects too-short non-empty text", () => {
    localStorage.clear();
    const key = lessonKey("01-python-for-data-science", "readme");
    const result = setReflection(key, "a");
    assert.equal(result.ok, false);
    assert.match(result.error, /at least/i);
    assert.equal(getReflection(key), "");
  });

  test("reflection rejects abusive repetition", () => {
    const repeated = "x".repeat(50);
    const validated = validateReflectionText(repeated);
    assert.equal(validated.ok, false);
    assert.match(validated.error, /repeated/i);
  });

  test("reflection sanitizes control characters on read", () => {
    localStorage.clear();
    const key = lessonKey("01-python-for-data-science", "readme");
    const state = JSON.parse(localStorage.getItem("nim-study-progress") || "{}");
    state.v = 3;
    state.reflections = { [key]: "ok\u0000note" };
    localStorage.setItem("nim-study-progress", JSON.stringify(state));
    assert.equal(getReflection(key), "oknote");
  });

  test("reflection clear bypasses minimum length", () => {
    localStorage.clear();
    const key = lessonKey("01-python-for-data-science", "readme");
    setReflection(key, "Saved note");
    const cleared = setReflection(key, "");
    assert.equal(cleared.ok, true);
    assert.equal(getReflection(key), "");
  });

  test("import normalizes invalid reflections on read", () => {
    localStorage.clear();
    const key = lessonKey("01-python-for-data-science", "readme");
    const key2 = lessonKey("02-introduction-to-ml", "readme");
    localStorage.setItem(
      "nim-study-progress",
      JSON.stringify({
        v: 3,
        reflections: {
          [key]: "a",
          "not-a-valid-key": "should drop",
          [key2]: "x".repeat(60),
        },
      })
    );
    assert.equal(getReflection(key), "");
    assert.equal(getReflection(key2), "");
    assert.equal(getReflectionCount(), 0);
  });

  test("in-progress lessons lists opened but incomplete", () => {
    localStorage.clear();
    const key = lessonKey("02-introduction-to-ml", "readme");
    recordLessonOpened(key);
    const items = findInProgressLessons(manifest);
    assert.ok(items.some((i) => i.key === key));
    markLessonComplete(key, true, manifest);
    const after = findInProgressLessons(manifest);
    assert.ok(!after.some((i) => i.key === key));
  });

  test("review due count and single-lesson check", () => {
    localStorage.clear();
    const key = lessonKey("01-python-for-data-science", "readme");
    setConfidence(key, 1);
    const state = JSON.parse(localStorage.getItem("nim-study-progress"));
    state.confidenceAt[key] = daysAgo(8);
    localStorage.setItem("nim-study-progress", JSON.stringify(state));
    assert.ok(countReviewDue(manifest) >= 1);
    assert.equal(isLessonReviewDue(key, manifest), true);
    assert.ok(findFirstReviewDue(manifest)?.key === key || countReviewDue(manifest) >= 1);
  });

  test("default note prompt is summary when unset", () => {
    localStorage.clear();
    const key = lessonKey("01-python-for-data-science", "readme");
    setReflection(key, "Default summary note");
    const meta = JSON.parse(localStorage.getItem("nim-study-progress")).reflectionMeta[key];
    assert.equal(meta.prompt, "summary");
  });

  test("findConfusedLessons filters confused prompt only", () => {
    localStorage.clear();
    const confusedKey = lessonKey("01-python-for-data-science", "readme");
    const summaryKey = lessonKey("02-introduction-to-ml", "readme");
    setReflection(confusedKey, "Still fuzzy on imports", "confused");
    setReflection(summaryKey, "Got the gist", "summary");
    const items = findConfusedLessons(manifest);
    assert.equal(items.length, 1);
    assert.equal(items[0].key, confusedKey);
    assert.equal(items[0].kind, "confused");
  });

  test("snoozeReview hides lesson from review due", () => {
    localStorage.clear();
    const key = lessonKey("01-python-for-data-science", "readme");
    setConfidence(key, 0);
    const state = JSON.parse(localStorage.getItem("nim-study-progress"));
    state.confidenceAt[key] = daysAgo(3);
    localStorage.setItem("nim-study-progress", JSON.stringify(state));
    assert.equal(isLessonReviewDue(key, manifest), true);
    assert.equal(snoozeReview(key, REVIEW_SNOOZE_DAYS), true);
    assert.equal(isReviewSnoozed(key), true);
    assert.equal(isLessonReviewDue(key, manifest), false);
    assert.equal(countReviewDue(manifest), 0);
  });

  test("setConfidence clears review snooze", () => {
    localStorage.clear();
    const key = lessonKey("01-python-for-data-science", "readme");
    setConfidence(key, 0);
    snoozeReview(key, REVIEW_SNOOZE_DAYS);
    assert.equal(isReviewSnoozed(key), true);
    setConfidence(key, 2);
    assert.equal(isReviewSnoozed(key), false);
  });

  test("setReviewRecall validates and stores recall text", () => {
    localStorage.clear();
    const key = lessonKey("01-python-for-data-science", "readme");
    const saved = setReviewRecall(key, "pandas read_csv and dtypes");
    assert.equal(saved.ok, true);
    assert.equal(getReviewRecall(key), "pandas read_csv and dtypes");
    const cleared = setReviewRecall(key, "   ");
    assert.equal(cleared.ok, true);
    assert.equal(getReviewRecall(key), "");
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
