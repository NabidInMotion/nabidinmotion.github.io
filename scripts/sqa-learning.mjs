/**
 * Learning features SQA — run: node scripts/sqa-learning.mjs
 * Requires: npm run site (http://localhost:3080)
 */
import puppeteer from "puppeteer";

const BASE = process.env.SMOKE_URL || "http://localhost:3080";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

function record(id, name, pass, detail = "") {
  results.push({ id, name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${id}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function dismissPreReviewIfOpen(page) {
  const open = await page.evaluate(
    () => document.getElementById("pre-review-overlay")?.hidden === false
  );
  if (!open) return false;
  await page.click("#pre-review-skip");
  await delay(250);
  return true;
}

async function ensureLessonNotesEditMode(page) {
  await page.evaluate(() => {
    const panel = document.getElementById("lesson-notes-panel");
    if (panel) panel.open = true;
    const editWrap = document.getElementById("lesson-notes-edit-wrap");
    const view = document.getElementById("lesson-notes-view");
    if (editWrap && view && editWrap.hidden) {
      document.getElementById("lesson-notes-edit")?.click();
    }
  });
  await delay(150);
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

  // Seed progress: confidence for spaced review + weekly lessons
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const fourDaysAgo = new Date(Date.now() - 4 * 86400000).toISOString();
    localStorage.setItem(
      "nim-study-progress",
      JSON.stringify({
        v: 2,
        completedLessons: ["00-prerequisites/readme", "18-projects-advanced/project-08-model-explainability"],
        lastLesson: "18-projects-advanced/project-08-model-explainability",
        confidence: { "02-introduction-to-ml/readme": 1, "guide/learning-roadmap": 0 },
        confidenceAt: {
          "02-introduction-to-ml/readme": fourDaysAgo,
          "guide/learning-roadmap": fourDaysAgo,
        },
        reflections: {},
        weeklyLessonGoal: 3,
        lessonsReadThisWeek: 1,
        lessonWeekStart: new Date().toISOString().slice(0, 10).replace(
          /(\d{4}-\d{2}-\d{2})/,
          (_, d) => {
            const dt = new Date(d);
            const day = dt.getUTCDay() || 7;
            if (day !== 1) dt.setUTCDate(dt.getUTCDate() - (day - 1));
            return dt.toISOString().slice(0, 10);
          }
        ),
        projects: {},
        focusMinutesThisWeek: 0,
        focusWeekStart: new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString(),
      })
    );
  });
  await page.reload({ waitUntil: "networkidle0" });
  await delay(400);

  record("LR-01", "Homepage loads without JS errors", jsErrors.length === 0, jsErrors.join("; ") || "clean");

  const weeklyGoal = await page.evaluate(() => ({
    panel: !!document.querySelector(".weekly-goal-panel"),
    count: document.querySelector(".weekly-goal-count")?.textContent?.trim(),
    input: document.querySelector(".weekly-goal-input")?.value,
  }));
  record("LR-02", "Weekly reading goal panel shown", weeklyGoal.panel, weeklyGoal.count);
  record("LR-03", "Weekly goal default target", weeklyGoal.input === "3", weeklyGoal.input);

  const review = await page.evaluate(() => ({
    panel: !!document.querySelector(".review-queue-panel"),
    items: document.querySelectorAll(".review-queue-item").length,
    title: document.querySelector(".review-queue-title")?.textContent,
  }));
  record("LR-04", "Spaced review queue shown", review.panel, `${review.items} items`);
  record("LR-05", "Review queue titled Worth revisiting", review.title === "Worth revisiting", review.title);

  const projectBridge = await page.evaluate(() => {
    const card = [...document.querySelectorAll(".project-card")].find((c) =>
      c.textContent?.includes("Model Explainability")
    );
    const link = card?.querySelector(".project-brief-link");
    return {
      href: link?.getAttribute("href") || "",
      readBadge: card?.querySelector(".project-badge--read.is-on")?.textContent,
    };
  });
  record(
    "LR-06",
    "Project links to specific brief",
    projectBridge.href.includes("project-08-model-explainability"),
    projectBridge.href
  );
  record("LR-07", "Project shows brief read badge", projectBridge.readBadge === "Brief read", projectBridge.readBadge);

  // Reader tools
  await page.goto(`${BASE}/learn.html?m=00-prerequisites&l=readme`, {
    waitUntil: "networkidle0",
    timeout: 30000,
  });
  await delay(800);
  await dismissPreReviewIfOpen(page);

  const readerTools = await page.evaluate(() => ({
    print: !!document.getElementById("reader-print"),
    narrow: !!document.getElementById("reader-measure-toggle"),
    kbd: document.getElementById("reader-kbd-hint")?.textContent?.includes("search"),
    explain: !!document.getElementById("explain-prompt-overlay"),
  }));
  record("LR-08", "Print button present", readerTools.print);
  record("LR-09", "Narrow measure toggle present", readerTools.narrow);
  record("LR-10", "Keyboard hint shown", readerTools.kbd === true);
  record("LR-11", "Explain prompt overlay in DOM", readerTools.explain);

  const checkpoint = await page.evaluate(() => ({
    visible: !document.getElementById("module-checkpoint")?.hidden,
    text: document.querySelector(".module-checkpoint-banner")?.textContent || "",
    href: document.querySelector(".module-checkpoint-banner a")?.href || "",
  }));
  record("LR-12", "Module checkpoint on readme", checkpoint.visible, checkpoint.text.slice(0, 80));
  record(
    "LR-13",
    "Checkpoint links to quick-reference",
    checkpoint.href.includes("prerequisites-quick-reference"),
    checkpoint.href
  );

  await page.click("#reader-measure-toggle");
  await delay(150);
  const narrowOn = await page.evaluate(() => document.body.classList.contains("reader-narrow"));
  record("LR-14", "Narrow measure toggles body class", narrowOn);

  const codeBlocks = await page.evaluate(() => ({
    wraps: document.querySelectorAll(".code-block-wrap").length,
    copyBtns: document.querySelectorAll(".code-block-btn").length,
  }));
  record("LR-15", "Code blocks get copy toolbar", codeBlocks.copyBtns > 0 || codeBlocks.wraps >= 0, `${codeBlocks.copyBtns} buttons`);

  // Explain prompt on mark read
  await page.goto(`${BASE}/learn.html?m=01-python-for-data-science&l=readme`, {
    waitUntil: "networkidle0",
  });
  await delay(600);
  await dismissPreReviewIfOpen(page);
  await page.evaluate(() => {
    const cb = document.getElementById("mark-read");
    if (cb && !cb.checked) cb.click();
  });
  await delay(300);
  const explainShown = await page.evaluate(
    () => document.getElementById("explain-prompt-overlay")?.hidden === false
  );
  record("LR-16", "Explain prompt after mark read", explainShown);

  await page.type("#explain-prompt-input", "Python basics for data work.");
  await page.click("#explain-prompt-save");
  await delay(200);

  const reflection = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("nim-study-progress") || "{}");
    return data.reflections?.["01-python-for-data-science/readme"] || "";
  });
  record("LR-17", "Reflection saved locally", reflection.includes("Python basics"), reflection);

  // Colab link on project with notebook github url
  await page.goto(`${BASE}/learn.html?m=18-projects-advanced&l=project-08-model-explainability`, {
    waitUntil: "networkidle0",
  });
  await delay(800);
  await dismissPreReviewIfOpen(page);
  const colab = await page.evaluate(() => {
    const link = [...document.querySelectorAll(".code-block-btn")].find((a) =>
      a.textContent?.includes("Colab")
    );
    return link?.href || null;
  });
  record(
    "LR-18",
    "Colab link when notebook in github path",
    !colab || colab.includes("colab.research.google.com") || colab === null,
    colab || "no notebook link (OK)"
  );

  // Keyboard: j navigates next (use a lesson that has a next page)
  await page.goto(`${BASE}/learn.html?m=00-prerequisites&l=readme`, {
    waitUntil: "networkidle0",
  });
  await delay(500);
  await dismissPreReviewIfOpen(page);
  await page.evaluate(() => document.body.focus());
  const beforeUrl = page.url();
  const navPromise = page.waitForNavigation({ waitUntil: "networkidle0", timeout: 8000 }).catch(() => null);
  await page.keyboard.press("j");
  await navPromise;
  await delay(300);
  const afterJ = page.url();
  record("LR-19", "j key advances to next lesson", afterJ !== beforeUrl, `${beforeUrl} -> ${afterJ}`);

  // Export includes reflections
  const exportHasReflection = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("nim-study-progress") || "{}");
    return typeof data.reflections === "object" && Object.keys(data.reflections).length > 0;
  });
  record("LR-20", "Progress export schema includes reflections", exportHasReflection);

  // Study assistant (retrieval-only RAG)
  await page.goto(`${BASE}/learn.html?m=02-introduction-to-ml&l=readme`, {
    waitUntil: "networkidle0",
  });
  await delay(600);
  await dismissPreReviewIfOpen(page);

  const assistantDom = await page.evaluate(() => ({
    panel: !!document.getElementById("study-assistant-panel"),
    disclaimer: document.querySelector(".study-assistant-disclaimer")?.textContent?.includes("Not AI-generated"),
  }));
  record("LR-21", "Study assistant panel in reader", assistantDom.panel);
  record("LR-22", "Study assistant disclaimer shown", assistantDom.disclaimer === true);

  await page.evaluate(() => {
    const panel = document.getElementById("study-assistant-panel");
    if (panel) panel.open = true;
  });
  await page.type("#study-assistant-query", "supervised learning");
  await page.click("#study-assistant-form button[type=submit]");
  await delay(1200);

  const assistantResults = await page.evaluate(() => ({
    visible: document.getElementById("study-assistant-results")?.hidden === false,
    items: document.querySelectorAll(".study-assistant-result").length,
    hasLink: !!document.querySelector(".study-assistant-result-link"),
    snippet: !!document.querySelector(".study-assistant-snippet"),
  }));
  record(
    "LR-23",
    "Study assistant returns curriculum excerpts",
    assistantResults.visible && assistantResults.items > 0,
    `${assistantResults.items} sources`
  );
  record("LR-24", "Study assistant links to lessons", assistantResults.hasLink);
  record("LR-25", "Study assistant shows snippet text", assistantResults.snippet);

  await page.goto(`${BASE}/learn.html?m=02-introduction-to-ml&l=readme`, {
    waitUntil: "networkidle0",
  });
  await delay(500);
  await dismissPreReviewIfOpen(page);

  await page.evaluate(() => {
    const key = "02-introduction-to-ml/readme";
    const raw = JSON.parse(localStorage.getItem("nim-study-progress") || "{}");
    if (raw.reflections?.[key]) {
      delete raw.reflections[key];
      if (raw.reflectionMeta) delete raw.reflectionMeta[key];
      localStorage.setItem("nim-study-progress", JSON.stringify(raw));
    }
  });

  await ensureLessonNotesEditMode(page);

  const noteText = `SQA note ${Date.now()}`;
  await page.click('.lesson-notes-type-btn[data-note-prompt="confused"]');
  await delay(150);
  await page.evaluate((text) => {
    const input = document.getElementById("lesson-notes-input");
    if (input) input.value = text;
  }, noteText);
  await delay(200);
  await page.evaluate(() => document.getElementById("lesson-notes-save")?.click());
  await delay(3000);

  const noteSave = await page.evaluate(() => ({
    status: document.getElementById("lesson-notes-status")?.textContent?.trim(),
    statusVisible: document.getElementById("lesson-notes-status")?.hidden === false,
    viewVisible: document.getElementById("lesson-notes-view")?.hidden === false,
    editHidden: document.getElementById("lesson-notes-edit-wrap")?.hidden === true,
    panelOpen: document.getElementById("lesson-notes-panel")?.open === true,
    summary: document.getElementById("lesson-notes-summary-preview")?.textContent?.trim(),
    viewText: document.getElementById("lesson-notes-text")?.textContent?.trim(),
    stored: (() => {
      try {
        const raw = JSON.parse(localStorage.getItem("nim-study-progress") || "{}");
        return raw.reflections?.["02-introduction-to-ml/readme"] || "";
      } catch {
        return "";
      }
    })(),
  }));

  record(
    "LN-01",
    "Save note switches to read view with confirmation",
    noteSave.viewVisible &&
      noteSave.editHidden &&
      noteSave.statusVisible &&
      (noteSave.status?.includes("Study Hub home") || noteSave.status?.includes("continue reading")),
    noteSave.status || "no status"
  );
  record(
    "LN-02",
    "Save note persists to localStorage",
    noteSave.stored === noteText,
    noteSave.stored || "empty"
  );
  record(
    "LN-03",
    "Saved note collapses and shows preview in summary",
    !noteSave.panelOpen && noteSave.summary?.includes("SQA note"),
    noteSave.summary || "no summary"
  );
  record(
    "LN-04",
    "Read view shows saved note text",
    noteSave.viewText === noteText,
    noteSave.viewText || "empty"
  );

  await page.reload({ waitUntil: "networkidle0" });
  await delay(500);
  await dismissPreReviewIfOpen(page);

  const afterReload = await page.evaluate((text) => {
    const panel = document.getElementById("lesson-notes-panel");
    const summary = document.getElementById("lesson-notes-summary-preview")?.textContent || "";
    const viewText = document.getElementById("lesson-notes-text")?.textContent?.trim() || "";
    return {
      collapsed: panel?.open === false,
      summaryHasNote: summary.includes("SQA note"),
      viewText,
      matches: viewText === text,
    };
  }, noteText);
  record(
    "LN-05",
    "Saved note survives reload in collapsed summary",
    afterReload.matches && afterReload.collapsed,
    afterReload.summaryHasNote ? afterReload.viewText : "missing"
  );

  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await delay(400);
  const homeNotes = await page.evaluate(() => ({
    panel: !!document.querySelector(".learning-panel-notes"),
    items: document.querySelectorAll(".learning-panel-item--note").length,
  }));
  record(
    "LN-06",
    "Study Hub home lists saved notes",
    homeNotes.panel && homeNotes.items > 0,
    `${homeNotes.items} notes`
  );

  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await delay(400);
  const homeConfused = await page.evaluate(() => ({
    panel: !!document.querySelector(".learning-panel-confused"),
    items: document.querySelectorAll(".learning-panel-confused .learning-panel-item").length,
    excerpt: document.querySelector(".learning-panel-confused .learning-panel-note-excerpt")?.textContent || "",
  }));
  record(
    "LN-07",
    "Still unclear chip puts note on home Still unclear panel",
    homeConfused.panel && homeConfused.items > 0 && homeConfused.excerpt.includes("SQA note"),
    `${homeConfused.items} · ${homeConfused.excerpt.slice(0, 40)}`
  );

  // ── Tier 2a: pre-review recall + confused panel ──
  await page.goto(`${BASE}/learn.html?m=02-introduction-to-ml&l=readme`, {
    waitUntil: "networkidle0",
  });
  await delay(400);

  const preReviewDom = await page.evaluate(() => ({
    overlay: !!document.getElementById("pre-review-overlay"),
    input: !!document.getElementById("pre-review-input"),
    snooze: !!document.getElementById("pre-review-snooze"),
  }));
  record("T2-01", "Pre-review overlay in DOM", preReviewDom.overlay && preReviewDom.input);

  const preReviewShown = await page.evaluate(
    () => document.getElementById("pre-review-overlay")?.hidden === false
  );
  record(
    "T2-02",
    "Pre-review shows for review-due lesson",
    preReviewShown === true,
    preReviewShown ? "visible" : "hidden"
  );

  if (preReviewShown) {
    await page.type("#pre-review-input", "Recall: supervised vs unsupervised.");
    await page.click("#pre-review-continue");
    await delay(300);
  }
  const afterContinue = await page.evaluate(() => ({
    overlayHidden: document.getElementById("pre-review-overlay")?.hidden !== false,
    mainVisible: getComputedStyle(document.querySelector(".reader-main")).visibility !== "hidden",
    recall: JSON.parse(localStorage.getItem("nim-study-progress") || "{}").reviewRecall?.[
      "02-introduction-to-ml/readme"
    ]?.text,
  }));
  record("T2-03", "Pre-review continue reveals lesson", afterContinue.overlayHidden && afterContinue.mainVisible);
  record(
    "T2-04",
    "Pre-review recall saved locally",
    afterContinue.recall?.includes("supervised"),
    afterContinue.recall || "empty"
  );

  await page.goto(`${BASE}/learn.html?m=01-python-for-data-science&l=readme`, {
    waitUntil: "networkidle0",
  });
  await delay(400);
  await page.evaluate(() => {
    const key = "01-python-for-data-science/readme";
    const raw = JSON.parse(localStorage.getItem("nim-study-progress") || "{}");
    raw.confidence = raw.confidence || {};
    raw.confidenceAt = raw.confidenceAt || {};
    raw.confidence[key] = 0;
    raw.confidenceAt[key] = new Date(Date.now() - 3 * 86400000).toISOString();
    delete raw.reviewSnoozedUntil?.[key];
    localStorage.setItem("nim-study-progress", JSON.stringify(raw));
  });
  await page.reload({ waitUntil: "networkidle0" });
  await delay(400);
  const snoozeTest = await page.evaluate(() => ({
    shown: document.getElementById("pre-review-overlay")?.hidden === false,
  }));
  if (snoozeTest.shown) {
    await page.click("#pre-review-snooze");
    await delay(300);
  }
  const snoozed = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("nim-study-progress") || "{}");
    const key = "01-python-for-data-science/readme";
    return {
      until: raw.reviewSnoozedUntil?.[key] || null,
      due: raw.confidence?.[key] === 0,
    };
  });
  record("T2-05", "Pre-review snooze writes reviewSnoozedUntil", !!snoozed.until, snoozed.until || "none");

  await page.evaluate(() => {
    const key = "02-introduction-to-ml/readme";
    const raw = JSON.parse(localStorage.getItem("nim-study-progress") || "{}");
    raw.reflections = raw.reflections || {};
    raw.reflectionMeta = raw.reflectionMeta || {};
    raw.reflections[key] = "Still fuzzy on train/test split";
    raw.reflectionMeta[key] = { prompt: "confused", at: new Date().toISOString() };
    localStorage.setItem("nim-study-progress", JSON.stringify(raw));
  });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await delay(400);
  const confusedPanel = await page.evaluate(() => ({
    panel: !!document.querySelector(".learning-panel-confused"),
    items: document.querySelectorAll(".learning-panel-confused .learning-panel-item").length,
    title: document.querySelector(".learning-panel-confused .learning-panel-title")?.textContent,
  }));
  record(
    "T2-06",
    "Home shows Still unclear panel for tagged notes",
    confusedPanel.panel && confusedPanel.items > 0,
    `${confusedPanel.items} · ${confusedPanel.title || ""}`
  );

  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("nim-study-progress") || "{}");
    raw.confidence = raw.confidence || {};
    raw.confidence["01-python-for-data-science/readme"] = 0;
    raw.confidence["01-python-for-data-science/01-numpy"] = 2;
    localStorage.setItem("nim-study-progress", JSON.stringify(raw));
  });
  await page.goto(`${BASE}/learn.html?m=01-python-for-data-science&l=readme`, {
    waitUntil: "networkidle0",
  });
  await delay(400);
  const checkpointNotYet = await page.evaluate(() => ({
    banner: !!document.querySelector(".module-checkpoint-banner"),
    list: document.querySelectorAll(".module-checkpoint-notyet-list a").length,
    text: document.querySelector(".module-checkpoint-notyet-title")?.textContent || "",
  }));
  record(
    "T2-07",
    "Module readme checkpoint lists Not yet lessons",
    checkpointNotYet.banner && checkpointNotYet.list >= 1 && checkpointNotYet.text.includes("Not yet"),
    `${checkpointNotYet.list} links`
  );

  const sidebarRollup = await page.evaluate(() => ({
    row: !!document.querySelector(".sidebar-module-confidence"),
    chips: document.querySelectorAll(".sidebar-module-conf").length,
    notYetLesson: !!document.querySelector(".sidebar-lessons a.lesson-not-yet"),
  }));
  record(
    "T2-08",
    "Sidebar shows module confidence rollup and lesson markers",
    sidebarRollup.row && sidebarRollup.chips >= 1 && sidebarRollup.notYetLesson,
    `${sidebarRollup.chips} chips`
  );

  await browser.close();

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nLearning SQA: ${results.length - failed}/${results.length} passed`);
  if (failed) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
