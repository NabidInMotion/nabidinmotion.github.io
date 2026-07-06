/**
 * Focus session SQA — run: node scripts/sqa-focus.mjs
 * Requires: npm run site (http://localhost:3080)
 */
import puppeteer from "puppeteer";

const BASE = process.env.SMOKE_URL || "http://localhost:3080";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

function record(id, name, pass, detail = "") {
  results.push({ id, name, pass, detail });
  const icon = pass ? "PASS" : "FAIL";
  console.log(`[${icon}] ${id}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function run() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(e.message));
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/learn.html?m=18-projects-advanced&l=readme`, {
    waitUntil: "networkidle0",
    timeout: 30000,
  });
  await delay(800);

  record("FS-01", "Reader loads without JS errors", jsErrors.length === 0, jsErrors.join("; ") || "clean");

  const hasFocus = await page.evaluate(
    () => !!document.getElementById("focus-session-picker")
  );
  record("FS-02", "Focus control present", hasFocus);

  await page.click(".focus-session-trigger");
  await delay(200);

  const presets = await page.evaluate(() =>
    [...document.querySelectorAll(".focus-preset-btn")].map((b) => b.textContent.trim())
  );
  record("FS-03", "Duration presets shown", presets.includes("25 min"), presets.join(", "));

  await page.click('[data-focus-minutes="15"]');
  await delay(300);

  const active = await page.evaluate(() => ({
    focusActive: document.body.classList.contains("focus-active"),
    timer: document.getElementById("focus-timer")?.textContent?.trim(),
    pickerHidden: document.getElementById("focus-session-picker")?.hidden,
    barVisible: !document.getElementById("focus-session-active")?.hidden,
  }));
  record("FS-04", "15 min starts focus mode", active.focusActive, JSON.stringify(active));
  record(
    "FS-05",
    "Timer shows countdown",
    /^\d+:\d{2}$/.test(active.timer || ""),
    active.timer
  );

  await page.click("#focus-exit");
  await delay(400);

  const afterExit = await page.evaluate(() => ({
    focusActive: document.body.classList.contains("focus-active"),
    session: sessionStorage.getItem("nim-focus-active"),
  }));
  record("FS-06", "Exit ends focus mode", !afterExit.focusActive && !afterExit.session);

  // Lesson preset from readingMinutes
  const lessonPreset = await page.evaluate(() => {
    const btn = document.getElementById("focus-preset-lesson");
    return {
      hidden: btn?.hidden,
      minutes: btn?.dataset?.focusMinutes,
      text: btn?.textContent?.trim(),
    };
  });
  record(
    "FS-07",
    "This lesson preset uses readingMinutes",
    !lessonPreset.hidden && Number(lessonPreset.minutes) > 0,
    lessonPreset.text
  );

  // End screen + weekly total
  await page.evaluate(async () => {
    const mod = await import("./js/focus-session.js");
    mod.__testStartFocusSession(1);
    await new Promise((r) => setTimeout(r, 50));
    mod.__testFinishFocusSession();
  });
  await delay(300);

  const endState = await page.evaluate(() => ({
    overlayVisible: !document.getElementById("focus-end-overlay")?.hidden,
    title: document.getElementById("focus-end-title")?.textContent,
    weekly: localStorage.getItem("nim-study-progress"),
  }));
  record("FS-08", "End overlay appears", endState.overlayVisible, endState.title);

  let weeklyMins = 0;
  try {
    weeklyMins = JSON.parse(endState.weekly || "{}").focusMinutesThisWeek || 0;
  } catch {
    weeklyMins = 0;
  }
  record("FS-09", "Weekly focus minutes recorded", weeklyMins >= 1, `${weeklyMins} min`);

  await page.click("#focus-end-continue");
  await delay(200);
  const overlayHidden = await page.evaluate(
    () => document.getElementById("focus-end-overlay")?.hidden
  );
  record("FS-10", "Continue dismisses end overlay", overlayHidden === true);

  await browser.close();

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nFocus SQA: ${results.length - failed}/${results.length} passed`);
  if (failed) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
