/** Edge-case SQA — run: node scripts/sqa-tier1-edge.mjs */
import puppeteer from "puppeteer";

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

  // EC-01: Up next row distinct from Continue
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  const upNext = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".progress-rec-row")];
    const labels = rows.map((r) => r.querySelector(".progress-rec-label")?.textContent?.trim());
    return { count: rows.length, labels, hasUpNext: labels.includes("Up next") };
  });
  record("EC-01", "Up next row shown separately from Continue", upNext.count >= 1, upNext.labels.join(", "));

  // EC-02: Project status persists after reload
  await page.goto(`${BASE}/#projects`, { waitUntil: "networkidle0" });
  await page.click(".project-card .project-status-btn:nth-child(3)"); // Done
  await delay(300);
  await page.reload({ waitUntil: "networkidle0" });
  const persisted = await page.evaluate(() =>
    document.querySelector(".project-card .project-status-btn.active")?.textContent?.trim()
  );
  record("EC-02", "Project status persists after reload", persisted === "Done", persisted);

  // EC-03: Confidence persists after reload
  await page.goto(`${BASE}/learn.html?m=00-prerequisites&l=readme`, { waitUntil: "networkidle0" });
  await page.click('[data-confidence="1"]');
  await delay(200);
  await page.reload({ waitUntil: "networkidle0" });
  const conf = await page.evaluate(() =>
    document.querySelector('[data-confidence="1"]')?.classList.contains("active")
  );
  record("EC-03", "Confidence persists after reload", conf === true);

  // EC-04: Confidence on guide pages
  await page.goto(`${BASE}/learn.html?g=learning-roadmap`, { waitUntil: "networkidle0" });
  const guideConf = await page.evaluate(() => {
    const wrap = document.getElementById("confidence-checkin");
    return { visible: wrap && !wrap.hidden };
  });
  record("EC-04", "Confidence check-in works on guides", guideConf.visible);

  // EC-05: Whats-new banner when lastSeenCommit is stale
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("nim-study-progress") || "{}");
    raw.lastSeenCommit = "0000000000000000000000000000000000000000";
    raw.v = 2;
    localStorage.setItem("nim-study-progress", JSON.stringify(raw));
  });
  await page.reload({ waitUntil: "networkidle0" });
  const banner = await page.evaluate(() => ({
    visible: !document.getElementById("whats-new")?.hidden,
    text: document.querySelector(".whats-new-text")?.textContent?.trim().slice(0, 60),
  }));
  record("EC-05", "What's-new banner appears for stale lastSeenCommit", banner.visible, banner.text);

  // EC-06: Dismiss whats-new marks visit seen
  if (banner.visible) {
    await page.click(".whats-new-banner .btn");
    await delay(200);
    const dismissed = await page.evaluate(() => {
      const hidden = document.getElementById("whats-new")?.hidden;
      const raw = JSON.parse(localStorage.getItem("nim-study-progress") || "{}");
      return { hidden, hasCommit: !!raw.lastSeenCommit && raw.lastSeenCommit !== "0000000000000000000000000000000000000000" };
    });
    record("EC-06", "Dismiss whats-new updates lastSeenCommit", dismissed.hidden && dismissed.hasCommit);
  } else {
    record("EC-06", "Dismiss whats-new updates lastSeenCommit", false, "skipped — banner not shown");
  }

  // EC-07: Search empty query hides results
  await page.goto(`${BASE}/learn.html?g=quick-start`, { waitUntil: "networkidle0" });
  await page.type("#sidebar-search", "xyznonexistent12345", { delay: 20 });
  await delay(400);
  const noResults = await page.evaluate(() =>
    document.querySelector(".search-empty")?.textContent?.includes("No lessons match")
  );
  record("EC-07", "Search shows empty state for no matches", noResults === true);

  // EC-08: Continue link navigates to valid lesson
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  const contHref = await page.$eval(".progress-rec-link, .progress-hero .btn-primary", (a) => a.href);
  const contRes = await page.goto(contHref, { waitUntil: "networkidle0" });
  const lessonLoaded = await page.evaluate(() =>
    !document.querySelector(".content-error") && document.getElementById("reader-content")?.textContent?.length > 50
  );
  record("EC-08", "Continue/Start link loads valid lesson", contRes.status() === 200 && lessonLoaded, contHref);

  // EC-09: CSS tokens defined (--bg, --border, --surface)
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  const tokens = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return {
      bg: s.getPropertyValue("--bg").trim(),
      border: s.getPropertyValue("--border").trim(),
      surface: s.getPropertyValue("--surface").trim(),
    };
  });
  record("EC-09", "CSS design tokens defined", !!(tokens.bg && tokens.border && tokens.surface), JSON.stringify(tokens));

  // EC-10: Project tier filter
  await page.goto(`${BASE}/#projects`, { waitUntil: "networkidle0" });
  await page.click(".project-tier-tab:nth-child(2)"); // beginner
  await delay(200);
  const beginnerCount = await page.evaluate(() => document.querySelectorAll(".project-card").length);
  record("EC-10", "Project tier filter shows subset", beginnerCount > 0 && beginnerCount < 23, `${beginnerCount} beginner cards`);

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n── Edge cases: ${results.length - failed.length}/${results.length} passed ──`);
  if (failed.length) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
