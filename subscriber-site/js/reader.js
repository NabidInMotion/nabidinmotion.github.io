/**
 * In-site curriculum reader. Loads pre-sanitized content from content/.
 */
import {
  buildLearnUrl,
  CONFIDENCE_LABELS,
  countReviewDue,
  DEFAULT_REFLECTION_PROMPT,
  exportProgress,
  findBookmarks,
  findFirstReviewDue,
  findModuleNotYetLessons,
  getConfidence,
  getModuleConfidenceRollup,
  getModuleProgress,
  getReflection,
  getReflectionMeta,
  getStats,
  guideKey,
  importProgress,
  isBookmarked,
  isLessonReviewDue,
  isLessonComplete,
  lessonKey,
  markLessonComplete,
  MAX_BOOKMARKS,
  MAX_REFLECTION_LENGTH,
  MIN_REFLECTION_LENGTH,
  onProgressChange,
  parseLessonKey,
  recordLessonOpened,
  REFLECTION_PROMPTS,
  resetProgress,
  setConfidence,
  setLastLesson,
  setReflection,
  storageAvailable,
  toggleBookmark,
} from "./progress.js";
import { loadContentJSON, loadManifest, renderContentError } from "./content-loader.js";
import {
  filterSlugs,
  getRoleById,
  getSelectedRoleId,
  loadCareerPaths,
  moduleSlugsForRole,
  onCareerChange,
} from "./career-path.js";
import { mountFocusSession, setFocusLessonKey, setLessonReadingMinutes } from "./focus-session.js";
import { maybeExplainPrompt, mountExplainPrompt } from "./explain-prompt.js";
import { hidePreReviewPrompt, maybePreReviewPrompt, mountPreReviewPrompt, shouldShowPreReview } from "./pre-review-prompt.js";
import {
  applyReaderMeasurePref,
  enhanceCodeBlocks,
  findQuickReferenceLesson,
  mountPrintButton,
  mountReaderKeyboard,
  mountReaderMeasureToggle,
  renderModuleCheckpoint,
} from "./reader-tools.js";
import { mountSearch } from "./search.js";
import { mountStudyAssistant } from "./study-assistant.js";
import { formatSyncDate } from "./site-meta.js";
import { clearChildren, el } from "./security.js";

const SLUG_RE = /^[0-9]{2}-[a-z0-9-]+$/;
const LESSON_RE = /^[a-z0-9][a-z0-9.-]{0,80}$/i;
const GUIDE_RE = /^[a-z0-9][a-z0-9-]{0,120}$/i;
const BOOKMARKS_HASH = "#bookmarks";

let manifest = null;
let current = null;
let currentTitle = "";
let careerData = null;
let selectedRoleId = "all";

function parseRoute() {
  const params = new URLSearchParams(window.location.search);
  const guideId = params.get("g");
  const module = params.get("m");
  const lessonId = params.get("l") || "readme";

  if (guideId && GUIDE_RE.test(guideId)) return { type: "guide", guideId };
  if (module && SLUG_RE.test(module) && LESSON_RE.test(lessonId)) {
    return { type: "module", module, lessonId };
  }
  return { type: "default" };
}

function findContentPath(route) {
  if (route.type === "guide") {
    const guide = manifest.guides.find((g) => g.id === route.guideId);
    return guide ? { ...route, meta: guide, path: guide.path } : null;
  }
  if (route.type === "module") {
    const mod = manifest.modules.find((m) => m.slug === route.module);
    const lesson = mod?.lessons.find((l) => l.id === route.lessonId);
    if (!mod || !lesson) return null;
    return { ...route, meta: lesson, mod, path: lesson.path };
  }
  return null;
}

function currentKey(route) {
  if (route.type === "guide") return guideKey(route.guideId);
  if (route.type === "module") return lessonKey(route.module, route.lessonId);
  return null;
}

function lessonHref(item) {
  if (item.type === "guide" || item.guideId) {
    return buildLearnUrl({ guideId: item.guideId });
  }
  return buildLearnUrl({ module: item.module, lessonId: item.lessonId });
}

function roleModuleSlugs() {
  const slugs = moduleSlugsForRole(selectedRoleId, careerData);
  return slugs?.length ? slugs : null;
}

function updateReviewDueBanner(route) {
  const banner = document.getElementById("review-due-banner");
  if (!banner || !storageAvailable() || !manifest) {
    if (banner) banner.hidden = true;
    return;
  }

  const slugs = roleModuleSlugs();
  const count = countReviewDue(manifest, slugs);
  if (!count) {
    banner.hidden = true;
    clearChildren(banner);
    return;
  }

  const key = currentKey(route);
  const currentDue = key ? isLessonReviewDue(key, manifest, slugs) : false;
  const first = findFirstReviewDue(manifest, slugs);

  clearChildren(banner);
  banner.hidden = false;

  if (currentDue) {
    banner.append(
      el("span", "review-due-banner-label", "Worth revisiting today"),
      el(
        "span",
        "review-due-banner-hint",
        "Recall key ideas before scrolling — then re-read if needed."
      )
    );
    return;
  }

  const label = el("span", "review-due-banner-label");
  label.textContent =
    count === 1 ? "1 lesson ready to review" : `${count} lessons ready to review`;

  if (first) {
    const link = el("a", "review-due-banner-link");
    link.href = lessonHref(first);
    link.textContent = `Start with “${first.title.length > 48 ? `${first.title.slice(0, 45)}…` : first.title}”`;
    banner.append(label, document.createTextNode(" · "), link);
  } else {
    banner.append(label);
  }
}

function notePromptId(key) {
  const meta = key ? getReflectionMeta(key) : null;
  const id = meta?.prompt;
  return id === "summary" || id === "confused" || id === "apply" ? id : DEFAULT_REFLECTION_PROMPT;
}

function getNotePromptFromChips() {
  const active = document.querySelector(".lesson-notes-type-btn[aria-pressed='true']");
  const id = active?.dataset.notePrompt;
  return id === "summary" || id === "confused" || id === "apply" ? id : DEFAULT_REFLECTION_PROMPT;
}

function setNotePromptChips(promptId) {
  const id =
    promptId === "summary" || promptId === "confused" || promptId === "apply"
      ? promptId
      : DEFAULT_REFLECTION_PROMPT;
  document.querySelectorAll(".lesson-notes-type-btn").forEach((btn) => {
    const on = btn.dataset.notePrompt === id;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("is-selected", on);
  });
  updateNotePromptHint(id);
  const hint = document.getElementById("lesson-notes-type-hint");
  hint?.classList.add("lesson-notes-type-hint--flash");
  window.setTimeout(() => hint?.classList.remove("lesson-notes-type-hint--flash"), 450);
  const input = document.getElementById("lesson-notes-input");
  const prompt = REFLECTION_PROMPTS[id] || REFLECTION_PROMPTS.summary;
  if (input && lessonNotesMode === "edit") {
    input.placeholder = prompt.placeholder;
  }
}

function updateNotePromptHint(promptId) {
  const hint = document.getElementById("lesson-notes-type-hint");
  if (!hint) return;
  const prompt = REFLECTION_PROMPTS[promptId] || REFLECTION_PROMPTS.summary;
  if (lessonNotesMode === "view") {
    hint.textContent =
      "Tap another type to move this note on Study Hub home. Use Edit note to change the text.";
  } else {
    hint.textContent = `${prompt.homeHint || ""} Then Save note.`;
  }
}

function syncNoteTypeChipInteraction() {
  const panel = document.getElementById("lesson-notes-panel");
  const interactive = Boolean(panel?.open && !panel.hidden);
  document.querySelectorAll(".lesson-notes-type-btn").forEach((btn) => {
    btn.tabIndex = interactive ? 0 : -1;
    btn.setAttribute("aria-disabled", interactive ? "false" : "true");
  });
  if (interactive) {
    updateNotePromptHint(getNotePromptFromChips());
  }
}

function handleNoteTypeChipClick(chip) {
  if (!current || chip.getAttribute("aria-disabled") === "true") return;
  const newId = chip.dataset.notePrompt;
  if (newId !== "summary" && newId !== "confused" && newId !== "apply") return;

  const key = currentKey(current);
  if (!key) return;

  if (notePromptId(key) === newId && lessonNotesMode === "view") return;

  if (lessonNotesMode === "view") {
    const saved = getReflection(key).trim();
    if (!saved) {
      setNotePromptChips(newId);
      setLessonNotesMode("edit");
      return;
    }
    lessonNotesSaving = true;
    const result = setReflection(key, saved, newId);
    lessonNotesSaving = false;
    if (!result.ok) {
      showLessonNotesStatus(result.error, { error: true });
      return;
    }
    setNotePromptChips(newId);
    const prompt = REFLECTION_PROMPTS[newId] || REFLECTION_PROMPTS.summary;
    showLessonNotesStatus(prompt.savedStatus || "Note type updated on Study Hub home.");
    updateLessonNotesUI(current, { preserveStatus: true });
    return;
  }

  setNotePromptChips(newId);
  updateNotesDirtyState();
}

function notePreview(text, max = 52) {
  const stripped = stripMarkdownForPreview(text);
  if (!stripped) return "Add a note for this lesson";
  return stripped.length > max ? `${stripped.slice(0, max - 1)}…` : stripped;
}

function stripMarkdownForPreview(text) {
  let s = String(text ?? "");
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/^#{1,3}\s+/gm, "");
  s = s.replace(/^\s*[-*]\s+/gm, "");
  s = s.replace(/^\s*>\s?/gm, "");
  s = s.replace(/\s+>\s+/g, " — ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function unescapeHtmlEntities(text) {
  return String(text ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeAttr(text) {
  // Minimal attribute escaping for safe href injection.
  return String(text ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isSafeHttpUrl(url) {
  if (typeof url !== "string") return false;
  if (url.length > 2048) return false;
  return /^https?:\/\/[^\s)]+$/i.test(url);
}

function renderInlineMarkdown(md) {
  // Convert a small markdown subset into HTML.
  // Always escapes the input first, so the only HTML we output is from our own templates.
  let s = escapeHtml(md);

  // Inline code
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold and italic
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Inline quote (same line): " … > quoted text"
  s = s.replace(/(?:^|\s)&gt;\s+([^<\n]+)/g, (match, quote) => {
    const lead = match.startsWith("&gt;") ? "" : " ";
    return `${lead}<span class="lesson-notes-inline-quote">${quote.trim()}</span>`;
  });

  // Links: [label](https://example.com)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, labelEsc, urlEsc) => {
    const url = unescapeHtmlEntities(urlEsc);
    if (!isSafeHttpUrl(url)) return `${labelEsc} (${escapeHtml(url)})`;
    const href = escapeAttr(url);
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${labelEsc}</a>`;
  });

  return s;
}

function renderMarkdownToSafeHtml(md) {
  const text = String(md ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");
  let i = 0;
  const out = [];

  const isBlockStart = (line) => {
    if (/^```/.test(line)) return true;
    if (/^#{1,3}\s+/.test(line)) return true;
    if (/^\s*>/.test(line)) return true;
    if (/^\s*[-*]\s+/.test(line)) return true;
    return false;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (/^```/.test(line)) {
      const fence = line.match(/^```/);
      const lang = fence ? line.slice(3).trim() : "";
      i += 1;
      const buf = [];
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      // Skip closing fence if present
      if (i < lines.length && /^```/.test(lines[i])) i += 1;
      const codeEsc = escapeHtml(buf.join("\n"));
      out.push(`<pre><code data-lang="${escapeAttr(lang)}">${codeEsc}</code></pre>`);
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,3})\s+(.+)\s*$/);
    if (h) {
      const level = h[1].length;
      const content = renderInlineMarkdown(h[2]);
      out.push(`<h${level}>${content}</h${level}>`);
      i += 1;
      continue;
    }

    // Blockquote
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote>${renderInlineMarkdown(buf.join("\n")).replace(/\n/g, "<br/>")}</blockquote>`);
      continue;
    }

    // Lists
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      const lis = items.map((it) => `<li>${renderInlineMarkdown(it)}</li>`).join("");
      out.push(`<ul>${lis}</ul>`);
      continue;
    }

    // Paragraphs
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      buf.push(lines[i]);
      i += 1;
    }
    const paragraph = buf.join("\n");
    const content = renderInlineMarkdown(paragraph).replace(/\n/g, "<br/>");
    out.push(`<p>${content}</p>`);
  }

  return out.join("");
}

function renderLessonNoteMarkdown(container, text) {
  if (!container) return;
  const trimmed = String(text ?? "").trim();
  container.innerHTML = trimmed ? renderMarkdownToSafeHtml(trimmed) : "";
}

function insertNoteFormat(kind) {
  const input = document.getElementById("lesson-notes-input");
  if (!input) return;

  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? 0;
  const value = input.value;
  const selected = value.slice(start, end);
  let insert = "";
  let selectStart = start;
  let selectEnd = start;

  switch (kind) {
    case "bullet": {
      const lines = (selected || "").split("\n");
      const bulletLines = lines.map((line) => (line.trim() ? `- ${line.replace(/^\s*[-*]\s+/, "")}` : "- "));
      insert = selected ? bulletLines.join("\n") : "- ";
      selectEnd = start + insert.length;
      break;
    }
    case "heading":
      insert = selected ? `## ${selected}` : "## ";
      selectEnd = start + insert.length;
      break;
    case "bold":
      insert = selected ? `**${selected}**` : "**bold**";
      if (!selected) {
        selectStart = start + 2;
        selectEnd = start + 6;
      } else {
        selectEnd = start + insert.length;
      }
      break;
    case "quote": {
      const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const beforeCursor = value.slice(lineStart, start);
      const atLineStart = beforeCursor.trim() === "";
      const lines = (selected || "").split("\n");
      if (selected) {
        insert = lines
          .map((line) => (line.trim() ? `> ${line.replace(/^\s*>\s?/, "")}` : "> "))
          .join("\n");
      } else if (!atLineStart) {
        insert = "\n> ";
      } else {
        insert = "> ";
      }
      selectEnd = start + insert.length;
      break;
    }
    case "code":
      if (selected.includes("\n")) {
        insert = `\`\`\`\n${selected}\n\`\`\``;
        selectEnd = start + insert.length;
      } else {
        insert = `\`${selected || "code"}\``;
        if (!selected) {
          selectStart = start + 1;
          selectEnd = start + 5;
        } else {
          selectEnd = start + insert.length;
        }
      }
      break;
    default:
      return;
  }

  input.value = value.slice(0, start) + insert + value.slice(end);
  input.focus();
  input.setSelectionRange(selectStart, selectEnd);
  updateNotesDirtyState();
  updateLessonNotesHint();
  updateLessonNotesLivePreview();
}

function updateLessonNotesLivePreview() {
  const input = document.getElementById("lesson-notes-input");
  const preview = document.getElementById("lesson-notes-live-preview");
  const toggle = document.getElementById("lesson-notes-preview-toggle");
  if (!input || !preview || !toggle || toggle.getAttribute("aria-pressed") !== "true") return;
  renderLessonNoteMarkdown(preview, input.value);
}

function toggleLessonNotesPreview() {
  const preview = document.getElementById("lesson-notes-live-preview");
  const toggle = document.getElementById("lesson-notes-preview-toggle");
  const input = document.getElementById("lesson-notes-input");
  if (!preview || !toggle || !input) return;

  const on = toggle.getAttribute("aria-pressed") !== "true";
  toggle.setAttribute("aria-pressed", on ? "true" : "false");
  preview.hidden = !on;
  if (on) {
    renderLessonNoteMarkdown(preview, input.value);
  } else {
    preview.innerHTML = "";
  }
}

function buildNotePrintDocument({ lessonTitle, promptTitle, savedAt, noteHtml }) {
  const safeLessonTitle = escapeHtml(lessonTitle || "Lesson note");
  const safePromptTitle = escapeHtml(promptTitle || "Note");
  const safeSavedAt = escapeHtml(savedAt || "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${safeLessonTitle} — Note</title>
  <meta name="referrer" content="no-referrer" />
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:28px;color:#0f172a}
    h1{font-size:1.15rem;margin:0 0 0.5rem}
    .meta{margin:0 0 1rem;color:#475569;font-size:0.9rem}
    .note{padding:14px 16px;border:1px solid rgba(15,23,42,0.14);border-radius:12px;background:#f8fafc}
    .note p{margin:0 0 0.7rem}
    .note p:last-child{margin-bottom:0}
    .note pre{white-space:pre;overflow:auto;padding:12px 14px;border-radius:10px;background:#0b1220;color:#e5e7eb;border:1px solid rgba(15,23,42,0.16)}
    .note code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
    .note blockquote{margin:0.7rem 0;padding:8px 12px;border-left:3px solid #3b82f6;background:rgba(59,130,246,0.08);color:#475569;border-radius:8px}
    .note .lesson-notes-inline-quote{display:inline-block;margin-left:0.15rem;padding:2px 6px;border-left:2px solid #3b82f6;background:rgba(59,130,246,0.08);color:#475569;border-radius:6px;font-style:italic}
    .note ul{padding-left:1.25rem;margin:0 0 0.7rem}
    .note li{margin:0.25rem 0}
    .note a{color:#0369a1}
    .note h1,.note h2,.note h3{margin:0.2rem 0 0.7rem}
    .note strong{font-weight:700}
    .note em{font-style:italic}
    @media print {
      body { margin: 18mm; }
      .note { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${safeLessonTitle}</h1>
  <div class="meta">${safePromptTitle}${safeSavedAt ? ` · saved ${safeSavedAt}` : ""}</div>
  <div class="note">${noteHtml}</div>
</body>
</html>`;
}

function exportLessonNotePdf({ lessonTitle, promptTitle, savedAt, noteHtml }) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "Note export");
  iframe.style.cssText =
    "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;left:-9999px;top:0";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const doc = iframe.contentDocument || frameWindow?.document;
  if (!doc || !frameWindow) {
    iframe.remove();
    return { ok: false, error: "Could not prepare export on this device." };
  }

  doc.open();
  doc.write(
    buildNotePrintDocument({ lessonTitle, promptTitle, savedAt, noteHtml })
  );
  doc.close();

  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 1500);
  };

  const printFrame = () => {
    try {
      frameWindow.focus();
      frameWindow.print();
      cleanup();
      return { ok: true };
    } catch {
      iframe.remove();
      return { ok: false, error: "Could not open print dialog on this device." };
    }
  };

  if (doc.readyState === "complete") {
    return printFrame();
  }

  iframe.addEventListener(
    "load",
    () => {
      printFrame();
    },
    { once: true }
  );
  return { ok: true };
}

let lessonNotesMode = "edit";

function setLessonNotesMode(mode) {
  lessonNotesMode = mode;
  const view = document.getElementById("lesson-notes-view");
  const edit = document.getElementById("lesson-notes-edit-wrap");
  const panel = document.getElementById("lesson-notes-panel");
  const exportBtn = document.getElementById("lesson-notes-export-pdf");
  if (!view || !edit) return;
  view.hidden = mode !== "view";
  edit.hidden = mode !== "edit";
  panel?.classList.toggle("lesson-notes-panel--viewing", mode === "view");
  panel?.classList.toggle("lesson-notes-panel--editing", mode === "edit");
  syncNoteTypeChipInteraction();
  if (exportBtn) exportBtn.hidden = mode !== "view";
  if (mode === "edit") {
    updateLessonNotesHint();
  } else {
    const hint = document.getElementById("lesson-notes-hint");
    if (hint) hint.hidden = true;
    const preview = document.getElementById("lesson-notes-live-preview");
    const toggle = document.getElementById("lesson-notes-preview-toggle");
    if (preview) {
      preview.hidden = true;
      preview.innerHTML = "";
    }
    if (toggle) toggle.setAttribute("aria-pressed", "false");
  }
}

function updateLessonNotesSummary(text) {
  const preview = document.getElementById("lesson-notes-summary-preview");
  if (!preview) return;
  const key = currentKey(current);
  const chip = key ? REFLECTION_PROMPTS[notePromptId(key)]?.chip : null;
  const excerpt = notePreview(text);
  preview.textContent =
    chip && String(text).trim() ? `${chip} · ${excerpt}` : excerpt;
}

function updateLessonNotesUI(route, { forceEdit = false, preserveStatus = false } = {}) {
  const panel = document.getElementById("lesson-notes-panel");
  const promptEl = document.getElementById("lesson-notes-prompt");
  const input = document.getElementById("lesson-notes-input");
  const textEl = document.getElementById("lesson-notes-text");
  const hintEl = document.getElementById("lesson-notes-view-hint");
  if (!panel || !input || !textEl) return;

  const key = currentKey(route);
  if (!key || !storageAvailable()) {
    panel.hidden = true;
    return;
  }

  const saved = getReflection(key);
  const meta = getReflectionMeta(key);
  const promptId = notePromptId(key);
  const prompt = REFLECTION_PROMPTS[promptId] || REFLECTION_PROMPTS.summary;
  const hasSaved = !!saved.trim();

  panel.hidden = false;
  updateLessonNotesSummary(saved);
  setNotePromptChips(promptId);

  if (promptEl && !preserveStatus) {
    const savedAt = meta?.at ? formatSavedAt(meta.at) : null;
    promptEl.textContent = savedAt
      ? `${prompt.chip || prompt.title} — saved ${savedAt}`
      : hasSaved
        ? prompt.chip || prompt.title
        : "Open My note, pick a type, then Save note (text optional).";
  }

  input.placeholder = prompt.placeholder;
  input.value = saved;
  renderLessonNoteMarkdown(textEl, saved);

  if (hintEl) {
    hintEl.textContent = hasSaved
      ? "Saved on this device for this lesson. Open Study Hub home to see all your notes."
      : "";
    hintEl.hidden = !hasSaved;
  }

  if (forceEdit) {
    setLessonNotesMode("edit");
    panel.open = true;
    updateLessonNotesHint();
  } else if (!hasSaved) {
    setLessonNotesMode("edit");
    panel.open = false;
    updateLessonNotesHint();
  } else {
    setLessonNotesMode("view");
    panel.open = false;
  }

  panel.classList.remove("lesson-notes-panel--dirty");
  syncNoteTypeChipInteraction();
}

function saveLessonNote() {
  if (!current || !storageAvailable()) return false;
  const input = document.getElementById("lesson-notes-input");
  const saveBtn = document.getElementById("lesson-notes-save");
  const promptEl = document.getElementById("lesson-notes-prompt");
  const panel = document.getElementById("lesson-notes-panel");
  if (!input) return false;

  const key = currentKey(current);
  if (!key) return false;

  const text = input.value;
  const promptId = getNotePromptFromChips();
  const prompt = REFLECTION_PROMPTS[promptId] || REFLECTION_PROMPTS.summary;

  lessonNotesSaving = true;
  const result = setReflection(key, text, promptId);
  lessonNotesSaving = false;

  if (!result.ok) {
    showLessonNotesStatus(result.error, { error: true });
    if (result.text !== undefined) input.value = result.text;
    updateLessonNotesHint();
    return false;
  }

  const savedText = result.text || "";
  if (!savedText) {
    updateLessonNotesUI(current, { forceEdit: true });
    showLessonNotesStatus("Note cleared on this device.");
    return true;
  }

  renderLessonNoteMarkdown(document.getElementById("lesson-notes-text"), savedText);
  updateLessonNotesSummary(savedText);
  setLessonNotesMode("view");
  updateLessonNotesUI(current, { preserveStatus: true });

  const savedLabel = new Date().toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (promptEl) {
    promptEl.textContent = `${prompt.chip || prompt.title} — ✓ saved just now (${savedLabel})`;
  }
  showLessonNotesStatus(
    prompt.savedStatus || "Saved — continue reading. Reopen My note anytime or find it on Study Hub home."
  );

  if (saveBtn) {
    const prior = saveBtn.textContent;
    saveBtn.textContent = "Saved ✓";
    saveBtn.disabled = true;
    setTimeout(() => {
      saveBtn.textContent = prior;
      saveBtn.disabled = false;
    }, 2000);
  }

  setTimeout(() => {
    if (panel && lessonNotesMode === "view") panel.open = false;
  }, 2200);

  return true;
}

function clearLessonNote() {
  if (!current) return;
  const key = currentKey(current);
  if (!key) return;
  if (!window.confirm("Clear your note for this lesson on this device?")) return;
  const result = setReflection(key, "");
  if (!result.ok) {
    showLessonNotesStatus(result.error, { error: true });
    return;
  }
  updateLessonNotesUI(current, { forceEdit: true });
  showLessonNotesStatus("Note cleared on this device.");
}

function bindLessonNotes() {
  const panel = document.getElementById("lesson-notes-panel");
  const input = document.getElementById("lesson-notes-input");
  if (!panel || !input || !storageAvailable()) return;

  panel.addEventListener("toggle", (event) => {
    syncNoteTypeChipInteraction();
    if (!panel.open || !current) return;
    const key = currentKey(current);
    if (!key) return;
    const saved = getReflection(key).trim();
    if (saved && lessonNotesMode !== "edit") {
      setLessonNotesMode("view");
    } else if (!saved) {
      setLessonNotesMode("edit");
      if (event.isTrusted) input.focus();
    }
  });

  panel.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-note-prompt]");
    if (chip) {
      event.preventDefault();
      handleNoteTypeChipClick(chip);
      return;
    }
    if (event.target.closest("#lesson-notes-save")) {
      event.preventDefault();
      saveLessonNote();
      return;
    }
    if (event.target.closest("#lesson-notes-export-pdf")) {
      event.preventDefault();
      const key = currentKey(current);
      if (!key) return;
      const savedText = getReflection(key).trim();
      if (!savedText) {
        showLessonNotesStatus("Add a note first, then export it.", { error: true });
        return;
      }

      const meta = getReflectionMeta(key);
      const promptId = notePromptId(key);
      const prompt = REFLECTION_PROMPTS[promptId] || REFLECTION_PROMPTS.summary;

      const noteHtml = renderMarkdownToSafeHtml(savedText);
      const savedAtLabel = meta?.at ? formatSavedAt(meta.at) : null;
      const result = exportLessonNotePdf({
        lessonTitle: currentTitle || "Lesson note",
        promptTitle: prompt.title,
        savedAt: savedAtLabel,
        noteHtml,
      });

      if (!result.ok) {
        showLessonNotesStatus(result.error, { error: true });
        return;
      }

      showLessonNotesStatus("Print dialog opened — choose Save as PDF.");
      return;
    }
    if (event.target.closest("#lesson-notes-cancel")) {
      event.preventDefault();
      if (!current) return;
      const key = currentKey(current);
      if (!key) return;
      input.value = getReflection(key);
      if (getReflection(key).trim()) {
        setLessonNotesMode("view");
        panel.classList.remove("lesson-notes-panel--dirty");
      } else {
        setLessonNotesMode("edit");
      }
      return;
    }
    if (event.target.closest("#lesson-notes-edit")) {
      event.preventDefault();
      setLessonNotesMode("edit");
      input.focus();
      return;
    }
    const formatBtn = event.target.closest("[data-note-format]");
    if (formatBtn) {
      event.preventDefault();
      insertNoteFormat(formatBtn.dataset.noteFormat);
      return;
    }
    if (event.target.closest("#lesson-notes-preview-toggle")) {
      event.preventDefault();
      toggleLessonNotesPreview();
      return;
    }
    if (
      event.target.closest("#lesson-notes-clear-view") ||
      event.target.closest("#lesson-notes-clear")
    ) {
      event.preventDefault();
      clearLessonNote();
    }
  });

  input.addEventListener("input", () => {
    updateNotesDirtyState();
    updateLessonNotesHint();
    updateLessonNotesLivePreview();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      saveLessonNote();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      document.getElementById("lesson-notes-cancel")?.click();
    }
  });
}

function setSanitizedHtml(container, html) {
  clearChildren(container);
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  while (wrap.firstChild) container.appendChild(wrap.firstChild);
}

function scrollToHash() {
  const hash = window.location.hash;
  if (!hash || hash === BOOKMARKS_HASH) return;
  const id = decodeURIComponent(hash.slice(1));
  requestAnimationFrame(() => {
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function lessonUrlHash() {
  const hash = window.location.hash;
  return hash === BOOKMARKS_HASH ? "" : hash;
}

function stripBookmarksHash() {
  if (window.location.hash === BOOKMARKS_HASH) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
}

let bookmarkNoticeTimer = null;
let lessonNotesStatusTimer = null;
let lessonNotesSaving = false;

function formatSavedAt(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("de-DE", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16);
  }
}

function showLessonNotesStatus(message, { error = false } = {}) {
  const node = document.getElementById("lesson-notes-status");
  const panel = document.getElementById("lesson-notes-panel");
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  node.classList.toggle("lesson-notes-status--error", error);
  panel?.classList.toggle("lesson-notes-panel--saved", !error);
  if (panel && !panel.open) panel.open = true;
  clearTimeout(lessonNotesStatusTimer);
  lessonNotesStatusTimer = setTimeout(() => {
    node.hidden = true;
    node.classList.remove("lesson-notes-status--error");
    panel?.classList.remove("lesson-notes-panel--saved");
  }, error ? 8000 : 5000);
}

function updateLessonNotesHint() {
  const input = document.getElementById("lesson-notes-input");
  const hint = document.getElementById("lesson-notes-hint");
  if (!input || !hint || lessonNotesMode !== "edit") {
    if (hint) hint.hidden = true;
    return;
  }
  hint.hidden = false;
  const len = input.value.length;
  const parts = [`${len}/${MAX_REFLECTION_LENGTH}`];
  if (len > 0 && len < MIN_REFLECTION_LENGTH) {
    parts.push(`at least ${MIN_REFLECTION_LENGTH} characters to save`);
  } else {
    parts.push("leave empty to clear");
  }
  hint.textContent = parts.join(" · ");
  hint.classList.toggle("lesson-notes-hint--warn", len > 0 && len < MIN_REFLECTION_LENGTH);
}

function updateNotesDirtyState() {
  const input = document.getElementById("lesson-notes-input");
  const promptEl = document.getElementById("lesson-notes-prompt");
  const panel = document.getElementById("lesson-notes-panel");
  if (!input || !promptEl || !current || !panel || panel.hidden || lessonNotesMode !== "edit") {
    return;
  }
  const key = currentKey(current);
  if (!key) return;
  const stored = getReflection(key);
  const storedPrompt = notePromptId(key);
  const dirty =
    input.value.trim() !== stored || getNotePromptFromChips() !== storedPrompt;
  panel.classList.toggle("lesson-notes-panel--dirty", dirty);
  const promptId = getNotePromptFromChips();
  const prompt = REFLECTION_PROMPTS[promptId] || REFLECTION_PROMPTS.summary;
  if (dirty) {
    promptEl.textContent = `${prompt.chip || prompt.title} — unsaved changes`;
  }
}

function showBookmarkNotice(message) {
  const node = document.getElementById("bookmark-notice");
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  clearTimeout(bookmarkNoticeTimer);
  bookmarkNoticeTimer = setTimeout(() => {
    node.hidden = true;
  }, 5000);
}

function bindContentAnchors(container) {
  container.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || !container.contains(link)) return;
    const href = link.getAttribute("href");
    if (!href || !href.startsWith("#") || href.length < 2) return;
    event.preventDefault();
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}${href}`);
    const id = decodeURIComponent(href.slice(1));
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function guideLink(guide) {
  const a = el("a", current?.type === "guide" && current.guideId === guide.id ? "active" : "");
  a.href = buildLearnUrl({ guideId: guide.id });
  a.textContent = guide.title.length > 48 ? `${guide.title.slice(0, 45)}…` : guide.title;
  return a;
}

function appendGuideLinks(parent, guides) {
  for (const guide of guides) parent.append(guideLink(guide));
}

function appendGuideGroup(container, label, guides, collapsible = false) {
  if (!guides.length) return;

  if (!collapsible) {
    appendGuideLinks(container, guides);
    return;
  }

  const group = el("details", "sidebar-guide-group");
  const hasActive = guides.some((g) => current?.type === "guide" && current.guideId === g.id);
  if (hasActive) group.open = true;

  const summary = el("summary", null, `${label} (${guides.length})`);
  group.append(summary);

  const list = el("div", "sidebar-guide-list");
  appendGuideLinks(list, guides);
  group.append(list);
  container.append(group);
}

function removeSidebarBookmark(item) {
  if (!storageAvailable() || !item?.key || !isBookmarked(item.key)) return;
  const label = item.title.length > 60 ? `${item.title.slice(0, 57)}…` : item.title;
  toggleBookmark(item.key);
  showBookmarkNotice(`Removed “${label}” from bookmarks.`);
}

function renderSidebarBookmarks() {
  const section = document.getElementById("sidebar-bookmarks-section");
  const nav = document.getElementById("sidebar-bookmarks-nav");
  const countEl = document.getElementById("sidebar-bookmarks-count");
  if (!section || !nav || !manifest) return;

  if (!storageAvailable()) {
    section.hidden = true;
    return;
  }

  const items = findBookmarks(manifest);
  if (!items.length) {
    section.hidden = true;
    clearChildren(nav);
    return;
  }

  section.hidden = false;
  if (countEl) countEl.textContent = `(${items.length})`;

  const activeKey = current ? currentKey(current) : null;

  clearChildren(nav);
  for (const item of items) {
    const row = el("div", "sidebar-bookmark-row");
    const link = el(
      "a",
      item.key === activeKey ? "sidebar-bookmark-link active" : "sidebar-bookmark-link"
    );
    link.href =
      item.type === "guide"
        ? buildLearnUrl({ guideId: item.guideId })
        : buildLearnUrl({ module: item.module, lessonId: item.lessonId });
    const title =
      item.title.length > 48 ? `${item.title.slice(0, 45)}…` : item.title;
    link.append(el("span", "sidebar-bookmark-title", title));
    if (item.moduleTitle) {
      link.append(el("span", "sidebar-bookmark-meta", item.moduleTitle));
    } else {
      link.title = item.title;
    }
    row.append(link);

    const removeBtn = el("button", "sidebar-bookmark-remove");
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", `Remove “${item.title}” from bookmarks`);
    removeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeSidebarBookmark(item);
    });
    row.append(removeBtn);

    nav.append(row);
  }
}

function focusBookmarksSidebar() {
  const section = document.getElementById("sidebar-bookmarks-section");
  const panel = document.getElementById("sidebar-bookmarks-panel");
  const sidebar = document.getElementById("reader-sidebar");
  const toggle = document.getElementById("sidebar-toggle");
  if (section?.hidden) return;
  if (panel) panel.open = true;
  if (sidebar && window.matchMedia("(max-width: 900px)").matches) {
    sidebar.classList.add("open");
    toggle?.setAttribute("aria-expanded", "true");
  }
  section?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  stripBookmarksHash();
}

function renderSidebarGuides(container) {
  clearChildren(container);

  const featuredIds = ["getting-started", "learning-roadmap", "quick-start", "readme"];
  const core = featuredIds.map((id) => manifest.guides.find((g) => g.id === id)).filter(Boolean);
  const systemDesign = manifest.guides
    .filter((g) => g.id.startsWith("system-design--"))
    .sort((a, b) => a.id.localeCompare(b.id));
  const resources = manifest.guides
    .filter((g) => g.id.startsWith("resources--"))
    .sort((a, b) => a.id.localeCompare(b.id));
  const other = manifest.guides.filter(
    (g) =>
      !featuredIds.includes(g.id) &&
      !g.id.startsWith("system-design--") &&
      !g.id.startsWith("resources--")
  );

  appendGuideLinks(container, core);
  appendGuideGroup(container, "System Design", systemDesign, true);
  appendGuideGroup(container, "Resources", resources, true);
  if (other.length) appendGuideGroup(container, "More", other, true);
}

function appendModuleConfidenceRollup(parent, moduleSlug) {
  const rollup = getModuleConfidenceRollup(moduleSlug, manifest);
  if (!rollup.rated) return;

  const row = el("div", "sidebar-module-confidence");
  row.setAttribute(
    "aria-label",
    `Confidence among ${rollup.rated} rated lessons: Yes ${rollup.percentYes} percent, Partly ${rollup.percentPartly} percent, Not yet ${rollup.percentNotYet} percent`
  );

  const segments = [
    { cls: "sidebar-conf-yes", label: "Yes", percent: rollup.percentYes, count: rollup.yes },
    { cls: "sidebar-conf-partly", label: "Partly", percent: rollup.percentPartly, count: rollup.partly },
    { cls: "sidebar-conf-notyet", label: "Not yet", percent: rollup.percentNotYet, count: rollup.notYet },
  ].filter((segment) => segment.count > 0);

  for (const segment of segments) {
    row.append(
      el("span", `sidebar-module-conf ${segment.cls}`, `${segment.label} ${segment.percent}%`)
    );
  }

  parent.append(row);
}

function renderSidebarModules(container) {
  clearChildren(container);

  let modules = manifest.modules;
  if (selectedRoleId !== "all") {
    const allowed = new Set(filterSlugs(modules.map((m) => m.slug), selectedRoleId, careerData));
    modules = modules.filter((m) => allowed.has(m.slug));
  }

  if (modules.length === 0) {
    container.append(
      el("p", "sidebar-empty", "No modules for this career path. Choose another role on the study hub.")
    );
    return;
  }

  for (const mod of modules) {
    const prog = getModuleProgress(mod.slug, manifest);
    const group = el("details", "sidebar-module");
    if (current?.type === "module" && current.module === mod.slug) group.open = true;

    const summary = el("summary");
    const title = el("span", "sidebar-module-title", mod.title);
    const badge = el("span", "sidebar-module-badge", `${prog.done}/${prog.total}`);
    summary.append(title, badge);
    group.append(summary);

    appendModuleConfidenceRollup(group, mod.slug);

    const list = el("div", "sidebar-lessons");
    for (const lesson of mod.lessons) {
      const key = lessonKey(mod.slug, lesson.id);
      const done = isLessonComplete(key);
      const confidence = getConfidence(key);
      const classes = [
        current?.type === "module" && current.module === mod.slug && current.lessonId === lesson.id
          ? "active"
          : "",
        done ? "done" : "",
        confidence === 0 ? "lesson-not-yet" : "",
        confidence === 1 ? "lesson-partly" : "",
        confidence === 2 ? "lesson-yes" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const a = el("a", classes);
      a.href = buildLearnUrl({ module: mod.slug, lessonId: lesson.id });
      a.textContent = lesson.title.length > 42 ? `${lesson.title.slice(0, 39)}…` : lesson.title;
      if (confidence !== null) {
        a.title = `Confidence: ${CONFIDENCE_LABELS[confidence] || "Rated"}`;
      }
      list.append(a);
    }
    group.append(list);
    container.append(group);
  }
}

function renderBreadcrumb(route, content) {
  const nav = document.getElementById("reader-breadcrumb");
  clearChildren(nav);

  const home = el("a", null, "Study Hub");
  home.href = "index.html";
  nav.append(home, el("span", "sep", " / "));

  if (route.type === "guide") {
    nav.append(el("span", null, content.title));
    return;
  }

  const modLink = el("a", null, route.mod.title);
  modLink.href = buildLearnUrl({ module: route.module, lessonId: "readme" });
  nav.append(modLink, el("span", "sep", " / "), el("span", null, content.title));
}

function findNeighbors(route) {
  if (route.type === "guide") return { prev: null, next: null };
  const lessons = route.mod.lessons;
  const idx = lessons.findIndex((l) => l.id === route.lessonId);
  return {
    prev: idx > 0 ? lessons[idx - 1] : null,
    next: idx >= 0 && idx < lessons.length - 1 ? lessons[idx + 1] : null,
  };
}

function renderLessonLegal(content) {
  const box = document.getElementById("lesson-legal");
  if (!box) return;
  box.hidden = false;
  clearChildren(box);

  const synced = formatSyncDate(manifest?.syncedAt);
  const commit = manifest?.legal?.sourceCommit?.slice(0, 7);

  box.append(
    el("p", "lesson-legal-title", "Content notice"),
    el(
      "p",
      "lesson-legal-text",
      `Source: ${content.source}. Synced ${synced}${commit ? ` (GitHub ${commit})` : ""}. ` +
        "This lesson may differ from versions you saw before. Open-source educational material. Not guaranteed accurate or complete. Use at your own risk. External links may change. " +
        "See Nutzungsbedingungen for liability terms."
    )
  );

  const links = el("p", "lesson-legal-links");
  const terms = el("a", null, "Nutzungsbedingungen");
  terms.href = "nutzungsbedingungen.html";
  const gh = el("a", null, "View on GitHub");
  gh.href = content.githubUrl;
  gh.target = "_blank";
  gh.rel = "noopener noreferrer";
  links.append(terms, document.createTextNode(" · "), gh);
  box.append(links);
}

function renderPager(route) {
  const nav = document.getElementById("reader-pager");
  clearChildren(nav);
  const { prev, next } = findNeighbors(route);

  if (prev) {
    const a = el("a", "pager-btn pager-prev");
    a.href = buildLearnUrl({ module: route.module, lessonId: prev.id });
    a.textContent = `← ${prev.title.slice(0, 40)}`;
    nav.append(a);
  }
  if (next) {
    const a = el("a", "pager-btn pager-next");
    a.href = buildLearnUrl({ module: route.module, lessonId: next.id });
    a.textContent = `${next.title.slice(0, 40)} →`;
    nav.append(a);
  }
}

function updateProgressUI() {
  const roleSlugs = moduleSlugsForRole(selectedRoleId, careerData);
  const stats = getStats(manifest, roleSlugs);
  const role = getRoleById(selectedRoleId, careerData);
  const wrap = document.getElementById("reader-progress-wrap");
  const label = document.getElementById("reader-progress-label");
  const fill = document.getElementById("reader-progress-fill");

  wrap.hidden = false;
  label.textContent = role
    ? `${role.title}: ${stats.completedCount} / ${stats.total} (${stats.percent}%)`
    : `${stats.completedCount} / ${stats.total} read (${stats.percent}%)`;
  fill.style.width = `${stats.percent}%`;
  fill.parentElement.setAttribute("aria-valuenow", String(stats.percent));
}

function updateModuleCheckpoint(route) {
  const checkpointHost = document.getElementById("module-checkpoint");
  if (!checkpointHost) return;
  if (route?.type === "module" && route.lessonId === "readme" && route.mod) {
    const quickRef = findQuickReferenceLesson(route.mod);
    const notYetLessons = findModuleNotYetLessons(route.module, manifest);
    renderModuleCheckpoint(checkpointHost, route.mod, { quickRef, notYetLessons });
  } else {
    checkpointHost.hidden = true;
    clearChildren(checkpointHost);
  }
}

function updateConfidenceUI(route) {
  const wrap = document.getElementById("confidence-checkin");
  if (!wrap) return;
  const key = currentKey(route);
  if (!key) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const current = getConfidence(key);
  wrap.querySelectorAll("[data-confidence]").forEach((btn) => {
    const level = btn.dataset.confidence === "" ? null : Number(btn.dataset.confidence);
    btn.classList.toggle("active", current === level);
    btn.setAttribute("aria-pressed", current === level ? "true" : "false");
  });
}

function bindConfidenceCheckin() {
  const wrap = document.getElementById("confidence-checkin");
  if (!wrap || !storageAvailable()) return;

  wrap.querySelectorAll("[data-confidence]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!current) return;
      const key = currentKey(current);
      if (!key) return;
      const raw = btn.dataset.confidence;
      const level = raw === "" ? null : Number(raw);
      setConfidence(key, level);
      updateConfidenceUI(current);
    });
  });
}

function promptExplainIfNeeded(route) {
  const key = currentKey(route);
  if (!key || !currentTitle) return;
  maybeExplainPrompt({ lessonKey: key, lessonTitle: currentTitle });
}

function updateBookmarkUI(route) {
  const btn = document.getElementById("lesson-bookmark");
  if (!btn) return;
  const key = currentKey(route);
  if (!key || !storageAvailable()) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  const saved = isBookmarked(key);
  btn.classList.toggle("active", saved);
  btn.setAttribute("aria-pressed", saved ? "true" : "false");
  btn.textContent = saved ? "Bookmarked ::" : "Bookmark ::";
}

function bindBookmarkButton() {
  const btn = document.getElementById("lesson-bookmark");
  if (!btn || !storageAvailable()) return;
  btn.addEventListener("click", () => {
    if (!current) return;
    const key = currentKey(current);
    if (!key) return;
    const wasSaved = isBookmarked(key);
    const { evicted } = toggleBookmark(key);
    updateBookmarkUI(current);
    renderSidebarBookmarks();
    if (!wasSaved && evicted) {
      const parsed = parseLessonKey(evicted, manifest);
      const removed = parsed?.title || "Oldest bookmark";
      showBookmarkNotice(
        `Bookmark saved. Removed oldest to stay within ${MAX_BOOKMARKS}: “${removed}”.`
      );
    }
  });
}

function updateMarkRead(route) {
  const checkbox = document.getElementById("mark-read");
  const key = currentKey(route);
  if (!key || !checkbox) return;
  checkbox.checked = isLessonComplete(key);
  checkbox.onchange = () => {
    const wasComplete = isLessonComplete(key);
    markLessonComplete(key, checkbox.checked, manifest);
    renderSidebarGuides(document.getElementById("sidebar-guides"));
    renderSidebarModules(document.getElementById("sidebar-modules"));
    renderSidebarBookmarks();
    updateProgressUI();
    if (checkbox.checked && !wasComplete) promptExplainIfNeeded(route);
  };
}

async function showLesson(route) {
  const resolved = findContentPath(route);
  const contentEl = document.getElementById("reader-content");
  const githubLink = document.getElementById("github-source");

  if (!resolved) {
    clearChildren(contentEl);
    contentEl.append(
      el("h1", null, "Lesson not found"),
      el("p", null, "Pick a module or guide from the sidebar, or return to the study hub.")
    );
    githubLink.hidden = true;
    document.getElementById("lesson-legal").hidden = true;
    const checkpointHost = document.getElementById("module-checkpoint");
    if (checkpointHost) checkpointHost.hidden = true;
    const notesPanel = document.getElementById("lesson-notes-panel");
    if (notesPanel) notesPanel.hidden = true;
    const reviewBanner = document.getElementById("review-due-banner");
    if (reviewBanner) reviewBanner.hidden = true;
    hidePreReviewPrompt();
    clearChildren(document.getElementById("reader-breadcrumb"));
    clearChildren(document.getElementById("reader-pager"));
    const markWrap = document.querySelector(".mark-read");
    if (markWrap) markWrap.hidden = true;
    return;
  }

  hidePreReviewPrompt();

  const markWrap = document.querySelector(".mark-read");
  if (markWrap) markWrap.hidden = false;

  current = route.type === "guide"
    ? { type: "guide", guideId: route.guideId }
    : { type: "module", module: route.module, lessonId: route.lessonId, mod: resolved.mod };

  document.title = `${resolved.meta.title} · Nabid In Motion`;

  const lessonKeyForRecall = currentKey(route);
  const moduleSlugs = roleModuleSlugs();
  const main = document.getElementById("reader-main");
  let preReviewGate = false;
  let content;

  try {
    if (
      shouldShowPreReview({
        lessonKey: lessonKeyForRecall,
        manifest,
        moduleSlugs,
      })
    ) {
      document.body.classList.add("reader-pre-review-active");
      if (main) main.inert = true;
      preReviewGate = true;
    }

    content = await loadContentJSON(`content/${resolved.path}`);
    currentTitle = content.title || resolved.meta.title || "";
    setSanitizedHtml(contentEl, content.html);

    await maybePreReviewPrompt({
      lessonKey: lessonKeyForRecall,
      lessonTitle: currentTitle,
      manifest,
      moduleSlugs,
    });
    preReviewGate = false;
  } catch (err) {
    if (preReviewGate) {
      document.body.classList.remove("reader-pre-review-active");
      if (main) main.inert = false;
    }
    throw err;
  }

  enhanceCodeBlocks(contentEl, content.githubUrl);
  scrollToHash();
  renderLessonLegal(content);

  const checkpointHost = document.getElementById("module-checkpoint");
  if (checkpointHost) updateModuleCheckpoint({ ...route, mod: resolved.mod });

  githubLink.href = content.githubUrl;
  githubLink.hidden = false;

  renderBreadcrumb({ ...route, mod: resolved.mod }, content);
  renderPager({ ...route, mod: resolved.mod });
  updateMarkRead(route);
  updateConfidenceUI(route);
  updateBookmarkUI(route);
  updateLessonNotesUI(route);
  updateReviewDueBanner(route);
  renderSidebarBookmarks();

  const readingMinutes = resolved.meta.readingMinutes || content.readingMinutes || null;
  setLessonReadingMinutes(readingMinutes);

  const key = currentKey(route);
  if (key) {
    setLastLesson(key);
    recordLessonOpened(key);
    setFocusLessonKey(key);
  } else {
    setFocusLessonKey(null);
  }

  history.replaceState(
    null,
    "",
    buildLearnUrl(
      route.type === "guide"
        ? { guideId: route.guideId }
        : { module: route.module, lessonId: route.lessonId }
    ) + lessonUrlHash()
  );
}

function bindChrome() {
  document.getElementById("footer-year").textContent = String(new Date().getFullYear());

  document.getElementById("export-progress").addEventListener("click", exportProgress);
  document.getElementById("import-progress").addEventListener("click", () => {
    importProgress(() => window.location.reload());
  });
  document.getElementById("reset-progress").addEventListener("click", () => {
    if (resetProgress()) window.location.reload();
  });

  const toggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("reader-sidebar");
  toggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  sidebar.addEventListener("click", (event) => {
    if (event.target.closest("a") && sidebar.classList.contains("open")) {
      sidebar.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  if (!storageAvailable()) {
    const note = el("p", "storage-warning", "Progress cannot be saved in this browser (private mode or storage blocked).");
    document.getElementById("reader-main").prepend(note);
  }

  onProgressChange(() => {
    updateProgressUI();
    renderSidebarGuides(document.getElementById("sidebar-guides"));
    renderSidebarModules(document.getElementById("sidebar-modules"));
    renderSidebarBookmarks();
    if (current) {
      updateMarkRead(current);
      updateConfidenceUI(current);
      updateBookmarkUI(current);
      updateModuleCheckpoint(current);
    }
  });
}

function bindSearch() {
  const input = document.getElementById("sidebar-search");
  const results = document.getElementById("sidebar-search-results");
  if (!input || !results) return;

  const slugs =
    selectedRoleId !== "all"
      ? filterSlugs(manifest.modules.map((m) => m.slug), selectedRoleId, careerData)
      : null;

  mountSearch(input, results, { moduleSlugs: slugs, limit: 8 });
}

function bindStudyAssistant() {
  mountStudyAssistant({
    manifest,
    getModuleSlugs: () =>
      selectedRoleId !== "all"
        ? filterSlugs(manifest.modules.map((m) => m.slug), selectedRoleId, careerData)
        : null,
  });
}

async function init() {
  try {
    [manifest, careerData] = await Promise.all([loadManifest(), loadCareerPaths()]);
    selectedRoleId = getSelectedRoleId();
    bindChrome();
    bindConfidenceCheckin();
    bindBookmarkButton();
    bindContentAnchors(document.getElementById("reader-content"));
    mountFocusSession({
      onMarkRead: () => {
        const checkbox = document.getElementById("mark-read");
        if (!checkbox || !current) return;
        const wasComplete = checkbox.checked;
        checkbox.checked = true;
        const key = currentKey(current);
        if (key) markLessonComplete(key, true, manifest);
        renderSidebarGuides(document.getElementById("sidebar-guides"));
        renderSidebarModules(document.getElementById("sidebar-modules"));
        renderSidebarBookmarks();
        updateProgressUI();
        if (!wasComplete) promptExplainIfNeeded(current);
      },
      onSessionEnd: () => {
        if (current) promptExplainIfNeeded(current);
      },
    });
    mountExplainPrompt();
    mountPreReviewPrompt();
    bindLessonNotes();
    mountReaderMeasureToggle();
    mountPrintButton();
    applyReaderMeasurePref();
    mountReaderKeyboard();
    bindSearch();
    bindStudyAssistant();
    renderSidebarGuides(document.getElementById("sidebar-guides"));
    renderSidebarModules(document.getElementById("sidebar-modules"));
    renderSidebarBookmarks();
    updateProgressUI();

    onCareerChange((roleId) => {
      selectedRoleId = roleId;
      renderSidebarModules(document.getElementById("sidebar-modules"));
      renderSidebarBookmarks();
      updateProgressUI();
      if (current) updateReviewDueBanner(current);
    });

    onProgressChange(() => {
      if (!current || lessonNotesSaving) return;
      updateLessonNotesUI(current);
      updateReviewDueBanner(current);
      updateConfidenceUI(current);
    });

    let route = parseRoute();
    if (route.type === "default") {
      route = { type: "guide", guideId: "learning-roadmap" };
    }
    const openBookmarks = window.location.hash === BOOKMARKS_HASH;
    await showLesson(route);

    if (openBookmarks) {
      focusBookmarksSidebar();
    }
  } catch (err) {
    const contentEl = document.getElementById("reader-content");
    renderContentError(contentEl, err);
    document.getElementById("reader-progress-wrap").hidden = true;
  }
}

document.addEventListener("DOMContentLoaded", init);
