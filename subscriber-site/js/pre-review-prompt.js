/**
 * Pre-review recall prompt — shown before content when a lesson is due for review.
 * Local only; optional recall text saved with progress export.
 */
import {
  getReviewRecall,
  isLessonReviewDue,
  isReviewSnoozed,
  MAX_QUICK_REFLECTION_LENGTH,
  REVIEW_SNOOZE_DAYS,
  setReviewRecall,
  snoozeReview,
  storageAvailable,
} from "./progress.js";

let pending = null;
const dismissedThisSession = new Set();

function overlayEl() {
  return document.getElementById("pre-review-overlay");
}

function setReaderBlocked(blocked) {
  const main = document.getElementById("reader-main");
  if (main) main.inert = blocked;
  document.body.classList.toggle("reader-pre-review-active", blocked);
}

export function shouldShowPreReview({ lessonKey, manifest, moduleSlugs }) {
  if (!storageAvailable() || !lessonKey || !manifest) return false;
  if (dismissedThisSession.has(lessonKey)) return false;
  if (!isLessonReviewDue(lessonKey, manifest, moduleSlugs)) return false;
  if (isReviewSnoozed(lessonKey)) return false;
  return true;
}

function showPreReviewStatus(message, { error = false } = {}) {
  const node = document.getElementById("pre-review-status");
  if (!node) return;
  node.textContent = message;
  node.hidden = !message;
  node.classList.toggle("pre-review-status--error", error);
}

export function hidePreReviewPrompt() {
  const overlay = overlayEl();
  if (overlay) overlay.hidden = true;
  setReaderBlocked(false);
  const resolve = pending?.resolve;
  pending = null;
  resolve?.();
}

export function maybePreReviewPrompt({ lessonKey, lessonTitle, manifest, moduleSlugs }) {
  return new Promise((resolve) => {
    if (!shouldShowPreReview({ lessonKey, manifest, moduleSlugs })) {
      setReaderBlocked(false);
      resolve();
      return;
    }

    pending = { lessonKey, lessonTitle, resolve };
    const overlay = overlayEl();
    const title = document.getElementById("pre-review-title");
    const input = document.getElementById("pre-review-input");
    const snoozeBtn = document.getElementById("pre-review-snooze");
    if (!overlay || !title || !input) {
      setReaderBlocked(false);
      pending = null;
      resolve();
      return;
    }

    const shortTitle =
      lessonTitle.length > 60 ? `${lessonTitle.slice(0, 57)}…` : lessonTitle;
    title.textContent = `Quick recall — “${shortTitle}”`;
    input.value = getReviewRecall(lessonKey);
    showPreReviewStatus("");
    if (snoozeBtn) {
      snoozeBtn.textContent = `Snooze · ${REVIEW_SNOOZE_DAYS} days`;
    }

    setReaderBlocked(true);
    overlay.hidden = false;
    input.focus();
  });
}

function finishDismiss(lessonKey) {
  if (lessonKey) dismissedThisSession.add(lessonKey);
  hidePreReviewPrompt();
}

export function mountPreReviewPrompt() {
  const overlay = overlayEl();
  const input = document.getElementById("pre-review-input");
  const continueBtn = document.getElementById("pre-review-continue");
  const skipBtn = document.getElementById("pre-review-skip");
  const snoozeBtn = document.getElementById("pre-review-snooze");
  if (!overlay || !input) return;

  continueBtn?.addEventListener("click", () => {
    if (!pending) return hidePreReviewPrompt();
    const text = input.value;
    if (text.trim()) {
      const result = setReviewRecall(pending.lessonKey, text);
      if (!result.ok) {
        showPreReviewStatus(result.error, { error: true });
        if (result.text !== undefined) input.value = result.text;
        return;
      }
    }
    finishDismiss(pending.lessonKey);
  });

  skipBtn?.addEventListener("click", () => {
    if (!pending) return hidePreReviewPrompt();
    finishDismiss(pending.lessonKey);
  });

  snoozeBtn?.addEventListener("click", () => {
    if (!pending) return hidePreReviewPrompt();
    snoozeReview(pending.lessonKey, REVIEW_SNOOZE_DAYS);
    finishDismiss(pending.lessonKey);
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay && pending) finishDismiss(pending.lessonKey);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && pending) finishDismiss(pending.lessonKey);
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      continueBtn?.click();
    }
  });
}
