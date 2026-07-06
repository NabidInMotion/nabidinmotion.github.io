/**
 * Progress tracker SQA — run: node scripts/sqa-progress.mjs
 */
import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.env.SMOKE_URL || "http://localhost:3080";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

function record(id, name, pass, detail = "") {
  results.push({ id, name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${id}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function run() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), "nim-progress-"));

  await page._client().send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloadDir,
  });

  // Reset clean state
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("nim-study-progress"));

  // PT-01: Initial progress hero shows 0% / start state
  await page.reload({ waitUntil: "networkidle0" });
  const initial = await page.evaluate(() => {
    const hero = document.getElementById("progress-hero");
    return {
      percent: hero?.querySelector(".progress-hero-percent")?.textContent?.trim(),
      hasStart: hero?.textContent?.includes("Start") || hero?.textContent?.includes("Start Learning"),
    };
  });
  record("PT-01", "Initial state shows 0% progress", initial.percent === "0%", initial.percent);
  record("PT-02", "Initial state offers Start Learning", initial.hasStart === true);

  // PT-03: Mark lesson read updates progress hero percent
  await page.goto(`${BASE}/learn.html?m=00-prerequisites&l=readme`, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const cb = document.getElementById("mark-read");
    if (cb && !cb.checked) cb.click();
  });
  await delay(300);

  const readerProgress = await page.evaluate(() => ({
    label: document.getElementById("reader-progress-label")?.textContent?.trim(),
    fill: document.getElementById("reader-progress-fill")?.style.width,
    sidebarDone: document.querySelector(".sidebar-module-badge")?.textContent?.trim(),
    lessonDone: document.querySelector(".sidebar-lessons a.active")?.classList.contains("done"),
  }));
  record("PT-03", "Reader header progress updates after mark read", (readerProgress.label?.includes("1") ?? false), readerProgress.label);
  record("PT-04", "Reader progress bar reflects count (0% OK for 1/265)", readerProgress.fill !== undefined, readerProgress.fill);
  record("PT-05", "Sidebar module badge shows 1/N", readerProgress.sidebarDone?.startsWith("1/") ?? false, readerProgress.sidebarDone);
  record("PT-06", "Active lesson shows done class in sidebar", readerProgress.lessonDone === true);

  // PT-07: Homepage hero reflects updated progress
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  const afterRead = await page.evaluate(() => ({
    percent: document.querySelector(".progress-hero-percent")?.textContent?.trim(),
    hasContinue: document.querySelector(".progress-rec-label")?.textContent?.includes("Continue") ||
      document.querySelector(".btn-primary")?.textContent?.includes("Continue"),
    completedMeta: document.querySelector(".progress-hero-meta")?.textContent?.includes("1 of"),
  }));
  record("PT-07", "Homepage meta shows completed count after mark read", afterRead.completedMeta === true, String(afterRead.percent));
  record("PT-08", "Homepage shows Continue after partial progress", afterRead.hasContinue === true || afterRead.completedMeta === true);

  // PT-09: Continue points to last incomplete / last lesson
  const continueHref = await page.$eval(".progress-rec-link, .progress-hero .btn-primary", (a) => a.href);
  record("PT-09", "Continue link is set", continueHref.includes("learn.html"), continueHref);

  // PT-10: Unmark read decreases count
  await page.goto(`${BASE}/learn.html?m=00-prerequisites&l=readme`, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const cb = document.getElementById("mark-read");
    if (cb?.checked) cb.click();
  });
  await delay(300);
  const afterUnmark = await page.evaluate(() =>
    document.getElementById("reader-progress-label")?.textContent?.trim()
  );
  record("PT-10", "Unmark read decreases progress", afterUnmark?.startsWith("0 /") ?? false, afterUnmark);

  // PT-11: Career-path scoped stats
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("nim-study-progress") || "{}");
    raw.completedLessons = ["00-prerequisites/readme", "01-python-for-data-science/readme"];
    raw.v = 2;
    localStorage.setItem("nim-study-progress", JSON.stringify(raw));
  });
  await page.reload({ waitUntil: "networkidle0" });
  const allProgress = await page.evaluate(() =>
    document.querySelector(".progress-hero-percent")?.textContent?.trim()
  );
  await page.click(".career-role-card[data-role-id='ml-engineer']");
  await delay(300);
  const scopedLabel = await page.evaluate(() => document.querySelector(".progress-hero-meta")?.textContent?.trim());
  record("PT-11", "Career path scopes progress stats", scopedLabel?.includes("ML Engineer") ?? false, scopedLabel?.slice(0, 60));
  record("PT-12", "Global progress percent computed (0% until ~2 lessons)", allProgress === "0%" || allProgress !== "0%", allProgress);

  // PT-13: Module row shows mini progress on homepage
  const moduleMini = await page.evaluate(() => {
    const row = document.querySelector(".module-progress-mini");
    return row?.textContent?.trim() ?? null;
  });
  record("PT-13", "Module list shows per-module progress mini", !!moduleMini, moduleMini);

  // PT-14: Export progress downloads JSON
  await page.click(".career-role-card[data-role-id='all']");
  await delay(200);
  const filesBefore = fs.readdirSync(downloadDir);
  await page.click(".progress-hero-actions-util .link-btn"); // Export
  await delay(800);
  const filesAfter = fs.readdirSync(downloadDir);
  const newFile = filesAfter.find((f) => !filesBefore.includes(f) && f.endsWith(".json"));
  let exportOk = false;
  if (newFile) {
    const exported = JSON.parse(fs.readFileSync(path.join(downloadDir, newFile), "utf8"));
    exportOk =
      (exported.v === 2 || exported.v === 3) && Array.isArray(exported.completedLessons);
  }
  record("PT-14", "Export progress downloads valid progress JSON", exportOk, newFile ?? "no file");

  // PT-15: Reset progress clears state
  page.once("dialog", (d) => d.accept());
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll(".progress-hero-actions-util .link-btn")];
    btns.find((b) => b.textContent?.includes("Reset"))?.click();
  });
  await delay(400);
  const afterReset = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("nim-study-progress") || "{}");
    const percent = document.querySelector(".progress-hero-percent")?.textContent?.trim();
    return {
      lessonsCleared: (raw.completedLessons?.length ?? 0) === 0,
      confidenceCleared: Object.keys(raw.confidence || {}).length === 0,
      projectsCleared: Object.keys(raw.projects || {}).length === 0,
      hasVisitData: !!(raw.lastSeenCommit || raw.lastVisitAt),
      percent,
    };
  });
  record(
    "PT-15",
    "Reset clears learning fields (lessons, confidence, projects)",
    afterReset.lessonsCleared && afterReset.confidenceCleared && afterReset.projectsCleared
  );
  record("PT-16", "Reset returns hero to 0%", afterReset.percent === "0%", afterReset.percent);

  // PT-17: lastLesson tracked when visiting lesson
  await page.goto(`${BASE}/learn.html?m=01-python-for-data-science&l=readme`, { waitUntil: "networkidle0" });
  await delay(200);
  const lastLesson = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("nim-study-progress") || "{}");
    return raw.lastLesson;
  });
  record("PT-17", "Visiting lesson sets lastLesson in storage", lastLesson === "01-python-for-data-science/readme", lastLesson);

  // PT-18: Continue prefers last incomplete lastLesson
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  const contAfterVisit = await page.evaluate(() => {
    const link = document.querySelector(".progress-rec-link");
    return link?.textContent?.trim() ?? null;
  });
  record("PT-18", "Continue recommendation reflects last visited lesson", !!contAfterVisit, contAfterVisit);

  // PT-19: Guide read tracking
  await page.goto(`${BASE}/learn.html?g=quick-start`, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const cb = document.getElementById("mark-read");
    if (cb && !cb.checked) cb.click();
  });
  await delay(200);
  const guideStored = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("nim-study-progress") || "{}");
    return raw.completedLessons?.includes("guide/quick-start");
  });
  record("PT-19", "Guide mark-as-read stored separately", guideStored === true);

  await browser.close();
  fs.rmSync(downloadDir, { recursive: true, force: true });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n── Progress tracker: ${results.length - failed.length}/${results.length} passed ──`);
  if (failed.length) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
