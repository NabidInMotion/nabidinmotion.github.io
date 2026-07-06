/**
 * Tier 1 SQA smoke suite — run: node scripts/sqa-tier1.mjs
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

  await page.setViewport({ width: 1280, height: 900 });

  // ── TC-01: Homepage loads without JS errors ──
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0", timeout: 20000 });
  record("TC-01", "Homepage loads without JS errors", jsErrors.length === 0, jsErrors.join("; ") || "clean");

  // ── TC-02: Core dynamic sections render ──
  const counts = await page.evaluate(() => ({
    guides: document.getElementById("study-guides")?.children.length ?? 0,
    videos: document.getElementById("video-grid")?.children.length ?? 0,
    career: document.getElementById("career-role-grid")?.children.length ?? 0,
    modules: document.getElementById("module-list")?.children.length ?? 0,
    projects: document.querySelectorAll(".project-card").length,
    stats: document.getElementById("stats")?.children.length ?? 0,
  }));
  record("TC-02a", "Curriculum guides render", counts.guides >= 6, `${counts.guides} cards`);
  record("TC-02b", "Video library renders", counts.videos >= 1, `${counts.videos} cards`);
  record("TC-02c", "Career path roles render", counts.career >= 12, `${counts.career} cards`);
  record("TC-02d", "Module list renders", counts.modules >= 26, `${counts.modules} rows`);
  record("TC-02e", "Project tracker renders", counts.projects === 23, `${counts.projects} cards`);
  record("TC-02f", "Stats bar renders", counts.stats >= 4, `${counts.stats} stat cards`);

  // ── TC-03: Continue + Up next (progress hero) ──
  const hero = await page.evaluate(() => {
    const el = document.getElementById("progress-hero");
    return {
      hasContent: (el?.textContent?.trim().length ?? 0) > 20,
      hasContinue: !!el?.querySelector(".progress-rec-row"),
      hasPrimaryBtn: !!el?.querySelector(".btn-primary"),
      hasBar: !!el?.querySelector(".progress-bar-fill"),
    };
  });
  record("TC-03a", "Progress hero renders", hero.hasContent);
  record("TC-03b", "Continue/Start recommendation visible", hero.hasContinue || hero.hasPrimaryBtn);
  record("TC-03c", "Progress bar present", hero.hasBar);

  // ── TC-04: Project status buttons (not native select) ──
  const projectUi = await page.evaluate(() => {
    const card = document.querySelector(".project-card");
    return {
      hasButtons: !!card?.querySelector(".project-status-group"),
      noSelect: !document.querySelector(".project-status-select"),
      btnCount: card?.querySelectorAll(".project-status-btn").length ?? 0,
    };
  });
  record("TC-04a", "Project status uses buttons (not dropdown)", projectUi.hasButtons && projectUi.noSelect);
  record("TC-04b", "Project card has 3 status options", projectUi.btnCount === 3);

  // Click "In progress" on first project
  await page.click(".project-card .project-status-btn:nth-child(2)");
  await delay(200);
  const projectStatus = await page.evaluate(() => {
    const active = document.querySelector(".project-card .project-status-btn.active");
    return active?.textContent?.trim() ?? "";
  });
  record("TC-04c", "Project status click updates selection", projectStatus === "In progress", projectStatus);

  // ── TC-05: Career path filter ──
  await page.click(".career-role-card[data-role-id='ml-engineer']");
  await delay(300);
  const filtered = await page.evaluate(() => ({
    selected: document.querySelector(".career-role-card.selected")?.dataset.roleId,
    moduleCount: document.getElementById("module-list")?.children.length ?? 0,
  }));
  record("TC-05", "Career path filter updates modules", filtered.selected === "ml-engineer" && filtered.moduleCount > 0 && filtered.moduleCount < 26, `${filtered.moduleCount} modules`);

  // Reset to all
  await page.click(".career-role-card[data-role-id='all']");

  // ── TC-06: What's new banner logic ──
  const whatsNew = await page.evaluate(() => {
    const el = document.getElementById("whats-new");
    return { exists: !!el, hidden: el?.hidden ?? true, hasBanner: !!el?.querySelector(".whats-new-banner") };
  });
  record("TC-06", "What's-new container present (shows only when updates pending)", whatsNew.exists, whatsNew.hasBanner ? "banner visible" : "hidden (expected if no pending updates)");

  // ── TC-07: Reader page loads ──
  jsErrors.length = 0;
  await page.goto(`${BASE}/learn.html?m=00-prerequisites&l=readme`, { waitUntil: "networkidle0", timeout: 20000 });
  record("TC-07", "Reader page loads without JS errors", jsErrors.length === 0, jsErrors.join("; ") || "clean");

  // ── TC-08: Confidence check-in ──
  const confidence = await page.evaluate(() => {
    const wrap = document.getElementById("confidence-checkin");
    return {
      visible: wrap && !wrap.hidden,
      btnCount: wrap?.querySelectorAll("[data-confidence]").length ?? 0,
    };
  });
  record("TC-08a", "Confidence check-in visible on lesson", confidence.visible);
  record("TC-08b", "Confidence has 4 controls (3 levels + clear)", confidence.btnCount === 4);

  await page.click('[data-confidence="2"]');
  await delay(200);
  const confActive = await page.evaluate(() =>
    document.querySelector('[data-confidence="2"]')?.classList.contains("active")
  );
  record("TC-08c", "Confidence 'Yes' selection persists in UI", confActive === true);

  // ── TC-09: Mark as read ──
  await page.evaluate(() => {
    const cb = document.getElementById("mark-read");
    if (cb && !cb.checked) cb.click();
  });
  await delay(200);
  const markRead = await page.evaluate(() => document.getElementById("mark-read")?.checked);
  record("TC-09", "Mark as read checkbox works", markRead === true);

  // ── TC-10: Full-text search ──
  const searchInput = await page.$("#sidebar-search");
  record("TC-10a", "Search input present in sidebar", !!searchInput);

  await page.type("#sidebar-search", "python", { delay: 30 });
  await delay(400);
  const searchResults = await page.evaluate(() => ({
    visible: !document.getElementById("sidebar-search-results")?.hidden,
    count: document.querySelectorAll(".search-result-item").length,
    hasTitle: !!document.querySelector(".search-result-title"),
  }));
  record("TC-10b", "Search returns results for 'python'", searchResults.count > 0, `${searchResults.count} hits`);
  record("TC-10c", "Search results panel opens", searchResults.visible && searchResults.hasTitle);

  await page.keyboard.press("Escape");
  await delay(200);
  const searchCleared = await page.evaluate(() => document.getElementById("sidebar-search")?.value === "");
  record("TC-10d", "Search clears on Escape", searchCleared);

  // ── TC-11: Search index file reachable ──
  const indexRes = await page.goto(`${BASE}/content/search-index.json`, { waitUntil: "networkidle0" });
  const indexBody = await page.evaluate(() => document.body.textContent);
  let indexOk = false;
  try {
    const parsed = JSON.parse(indexBody);
    indexOk = Array.isArray(parsed.entries) && parsed.entries.length >= 200;
  } catch { /* */ }
  record("TC-11", "Search index JSON valid and populated", indexOk && indexRes.status() === 200);

  // ── TC-12: Progress export/import controls ──
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  const progressUtils = await page.evaluate(() => ({
    export: !!document.querySelector(".progress-hero-actions-util .link-btn"),
    reset: document.querySelectorAll(".progress-hero-actions-util .link-btn").length >= 3,
  }));
  record("TC-12", "Progress export/import/reset controls present", progressUtils.export && progressUtils.reset);

  // ── TC-13: Schema v2 localStorage ──
  const storage = await page.evaluate(() => {
    const raw = localStorage.getItem("nim-study-progress");
    if (!raw) return { ok: true, note: "no data yet" };
    try {
      const d = JSON.parse(raw);
      return { ok: d.v === 2, note: `v=${d.v}, lessons=${d.completedLessons?.length}` };
    } catch {
      return { ok: false, note: "invalid json" };
    }
  });
  record("TC-13", "Progress schema v2 in localStorage", storage.ok, storage.note);

  // ── TC-14: Reading minutes in manifest ──
  const manifestRes = await page.goto(`${BASE}/content/manifest.json`, { waitUntil: "networkidle0" });
  const manifestOk = await page.evaluate(() => {
    try {
      const m = JSON.parse(document.body.textContent);
      const lesson = m.modules?.[0]?.lessons?.[0];
      return !!lesson?.readingMinutes && m.totalLessons >= 200;
    } catch {
      return false;
    }
  });
  record("TC-14", "Manifest includes readingMinutes", manifestOk && manifestRes.status() === 200);

  // ── TC-15: Changelog for whats-new ──
  const changelogRes = await page.goto(`${BASE}/content/changelog.json`, { waitUntil: "networkidle0" });
  const changelogOk = await page.evaluate(() => {
    try {
      const c = JSON.parse(document.body.textContent);
      return Array.isArray(c.entries) && c.entries.length > 0 && !!c.entries[0].commit;
    } catch {
      return false;
    }
  });
  record("TC-15", "Changelog JSON valid for whats-new feature", changelogOk && changelogRes.status() === 200);

  await browser.close();

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log("\n── Summary ──");
  console.log(`${passed}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFailed:");
    failed.forEach((f) => console.log(`  ${f.id}: ${f.name} — ${f.detail}`));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
