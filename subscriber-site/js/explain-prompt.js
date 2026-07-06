/**
 * Optional "explain it back" retrieval prompt — local only, exported with progress.
 */
import { getReflection, setReflection, storageAvailable } from "./progress.js";

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

  pending = { lessonKey, lessonTitle };
  const overlay = overlayEl();
  const title = document.getElementById("explain-prompt-title");
  const input = document.getElementById("explain-prompt-input");
  if (!overlay || !title || !input) return;

  title.textContent = `What did you learn from “${lessonTitle.length > 60 ? `${lessonTitle.slice(0, 57)}…` : lessonTitle}”?`;
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
    if (text) setReflection(pending.lessonKey, text);
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
