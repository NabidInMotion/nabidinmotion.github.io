/**
 * Reader UX: keyboard nav, print, narrow measure, code copy, Colab links.
 */
const READER_PREFS_KEY = "nim-reader-prefs";

function loadReaderPrefs() {
  try {
    return JSON.parse(localStorage.getItem(READER_PREFS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function saveReaderPrefs(prefs) {
  const safe = {};
  if (typeof prefs?.narrow === "boolean") safe.narrow = prefs.narrow;
  try {
    localStorage.setItem(READER_PREFS_KEY, JSON.stringify(safe));
  } catch {
    /* ignore */
  }
}

export function applyReaderMeasurePref() {
  const prefs = loadReaderPrefs();
  document.body.classList.toggle("reader-narrow", !!prefs.narrow);
  const btn = document.getElementById("reader-measure-toggle");
  if (btn) {
    btn.setAttribute("aria-pressed", prefs.narrow ? "true" : "false");
    btn.textContent = prefs.narrow ? "Wide ::" : "Narrow ::";
  }
}

export function mountReaderMeasureToggle() {
  const btn = document.getElementById("reader-measure-toggle");
  if (!btn) return;
  applyReaderMeasurePref();
  btn.addEventListener("click", () => {
    const prefs = loadReaderPrefs();
    prefs.narrow = !prefs.narrow;
    saveReaderPrefs(prefs);
    applyReaderMeasurePref();
  });
}

export function mountPrintButton() {
  document.getElementById("reader-print")?.addEventListener("click", () => window.print());
}

function githubToColab(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
  if (!m || !m[4].endsWith(".ipynb")) return null;
  return `https://colab.research.google.com/github/${m[1]}/${m[2]}/blob/${m[3]}/${m[4]}`;
}

export function enhanceCodeBlocks(container, githubUrl) {
  if (!container) return;
  const colabUrl = githubUrl ? githubToColab(githubUrl) : null;

  container.querySelectorAll("pre").forEach((pre) => {
    if (pre.closest(".code-block-wrap")) return;
    const wrap = document.createElement("div");
    wrap.className = "code-block-wrap";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.append(pre);

    const toolbar = document.createElement("div");
    toolbar.className = "code-block-toolbar";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "code-block-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async () => {
      const code = pre.querySelector("code")?.innerText || pre.innerText;
      try {
        await navigator.clipboard.writeText(code);
        copyBtn.textContent = "Copied";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 1500);
      } catch {
        copyBtn.textContent = "Failed";
      }
    });
    toolbar.append(copyBtn);

    if (colabUrl) {
      const colab = document.createElement("a");
      colab.className = "code-block-btn";
      colab.href = colabUrl;
      colab.target = "_blank";
      colab.rel = "noopener noreferrer";
      colab.textContent = "Open in Colab";
      toolbar.append(colab);
    }

    wrap.prepend(toolbar);
  });
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function mountReaderKeyboard(options = {}) {
  document.addEventListener("keydown", (event) => {
    if (isTypingTarget(event.target)) return;
    if (document.getElementById("explain-prompt-overlay")?.hidden === false) return;
    if (document.getElementById("focus-end-overlay")?.hidden === false) return;

    const key = event.key.toLowerCase();

    if (key === "j" || event.key === "ArrowRight") {
      const next = document.querySelector(".pager-next");
      if (next) {
        event.preventDefault();
        next.click();
      }
      return;
    }

    if (key === "k" || event.key === "ArrowLeft") {
      const prev = document.querySelector(".pager-prev");
      if (prev) {
        event.preventDefault();
        prev.click();
      }
      return;
    }

    if (key === "/") {
      const search = document.getElementById("sidebar-search");
      if (search) {
        event.preventDefault();
        document.getElementById("reader-sidebar")?.classList.add("open");
        document.getElementById("sidebar-toggle")?.setAttribute("aria-expanded", "true");
        search.focus();
      }
      return;
    }

    if (key === "f") {
      event.preventDefault();
      const picker = document.getElementById("focus-session-picker");
      if (document.body.classList.contains("focus-active")) return;
      if (picker) {
        picker.open = true;
        picker.querySelector("[data-focus-minutes='25']")?.focus();
      } else if (typeof options.onFocusShortcut === "function") {
        options.onFocusShortcut();
      }
    }
  });
}

export function findQuickReferenceLesson(mod) {
  if (!mod?.lessons) return null;
  return mod.lessons.find((l) => l.id.includes("quick-reference")) || null;
}

export function renderCheckpointBanner(container, mod, quickRef) {
  if (!container || !quickRef || !mod) return;
  container.replaceChildren();
  const box = document.createElement("aside");
  box.className = "module-checkpoint-banner";
  box.append(
    document.createTextNode("Before you move on: review the "),
    Object.assign(document.createElement("a"), {
      href: `learn.html?m=${encodeURIComponent(mod.slug)}&l=${encodeURIComponent(quickRef.id)}`,
      textContent: "module checkpoint summary",
    }),
    document.createTextNode(".")
  );
  container.append(box);
  container.hidden = false;
}
