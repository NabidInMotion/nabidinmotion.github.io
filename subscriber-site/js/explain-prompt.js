/**
 * Optional "explain it back" retrieval prompt — local only, exported with progress.
 */
import {
  getReflection,
  pickReflectionPrompt,
  REFLECTION_PROMPTS,
  setReflection,
  storageAvailable,
} from "./progress.js";

let pending = null;

function overlayEl() {
  return document.getElementById("explain-prompt-overlay");
}

export function hideExplainPrompt() {
  const overlay = overlayEl();
  if (overlay) overlay.hidden = true;
  pending = null;
}

export function maybeExplainPrompt({ lessonKey, lessonTitle }) {
  if (!storageAvailable() || !lessonKey || !lessonTitle) return;
  if (getReflection(lessonKey)) return;

  const promptId = pickReflectionPrompt(lessonKey);
  const prompt = REFLECTION_PROMPTS[promptId] || REFLECTION_PROMPTS.summary;

  pending = { lessonKey, lessonTitle, promptId };
  const overlay = overlayEl();
  const title = document.getElementById("explain-prompt-title");
  const desc = document.getElementById("explain-prompt-desc");
  const input = document.getElementById("explain-prompt-input");
  if (!overlay || !title || !input) return;

  const shortTitle =
    lessonTitle.length > 60 ? `${lessonTitle.slice(0, 57)}…` : lessonTitle;
  title.textContent = `${prompt.title} — “${shortTitle}”`;
  if (desc) desc.textContent = prompt.desc;
  input.placeholder = prompt.placeholder;
  input.value = "";
  overlay.hidden = false;
  input.focus();
}

export function mountExplainPrompt() {
  const overlay = overlayEl();
  const input = document.getElementById("explain-prompt-input");
  const saveBtn = document.getElementById("explain-prompt-save");
  const skipBtn = document.getElementById("explain-prompt-skip");
  if (!overlay || !input) return;

  saveBtn?.addEventListener("click", () => {
    if (!pending) return hideExplainPrompt();
    const text = input.value.trim();
    if (text) setReflection(pending.lessonKey, text, pending.promptId);
    hideExplainPrompt();
  });

  skipBtn?.addEventListener("click", hideExplainPrompt);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) hideExplainPrompt();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideExplainPrompt();
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      saveBtn?.click();
    }
  });
}
