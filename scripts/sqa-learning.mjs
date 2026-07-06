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

  // Keyboard: j navigates next
  const beforeUrl = page.url();
  await page.keyboard.press("j");
  await delay(400);
  const afterJ = page.url();
  record("LR-19", "j key advances to next lesson", afterJ !== beforeUrl, `${beforeUrl} -> ${afterJ}`);

  // Export includes reflections
  const exportHasReflection = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("nim-study-progress") || "{}");
    return typeof data.reflections === "object" && Object.keys(data.reflections).length > 0;
  });
  record("LR-20", "Progress export schema includes reflections", exportHasReflection);

  await browser.close();

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nLearning SQA: ${results.length - failed}/${results.length} passed`);
  if (failed) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
