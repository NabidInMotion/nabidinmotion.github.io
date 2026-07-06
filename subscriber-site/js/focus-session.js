/**
 * Optional focus sessions: countdown timer, simplified reader chrome, gentle end screen.
 * Active timer lives in sessionStorage only; weekly totals in localStorage via progress.js.
 */
import { getFocusWeeklyMinutes, getWeeklyFocusProgress, recordFocusMinutes, storageAvailable } from "./progress.js";

const SESSION_KEY = "nim-focus-active";
const TICK_MS = 1000;

let tickTimer = null;
let focusLessonKey = null;

export function setFocusLessonKey(key) {
  focusLessonKey =
    typeof key === "string" && /^(guide\/[\w-]+|[\w-]+\/[\w-]+)$/.test(key) ? key : null;
}

let lessonReadingMinutes = null;
let extendedOnce = false;
let onMarkRead = null;
let onSessionEnd = null;

function formatClock(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.endsAt || !data?.startedAt) return null;
    return data;
  } catch {
    return null;
  }
}

function saveSession(data) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function remainingSeconds(session) {
  return Math.max(0, Math.ceil((new Date(session.endsAt).getTime() - Date.now()) / 1000));
}

function elapsedMinutes(session) {
  const ms = Date.now() - new Date(session.startedAt).getTime();
  return Math.max(1, Math.round(ms / 60000));
}

function setFocusMode(active) {
  document.body.classList.toggle("focus-active", active);
  const sidebar = document.getElementById("reader-sidebar");
  const toggle = document.getElementById("sidebar-toggle");
  if (active) {
    sidebar?.classList.remove("open");
    toggle?.setAttribute("aria-expanded", "false");
  }
}

function showPicker(active) {
  const picker = document.getElementById("focus-session-picker");
  const bar = document.getElementById("focus-session-active");
  if (picker) picker.hidden = !active;
  if (bar) bar.hidden = active;
}

function updateTimerDisplay(seconds) {
  const timer = document.getElementById("focus-timer");
  if (!timer) return;
  timer.textContent = formatClock(seconds);
  timer.setAttribute("aria-label", `${Math.ceil(seconds / 60)} minutes remaining`);
}

function updateWeeklyHint() {
  const hint = document.getElementById("focus-weekly-hint");
  if (!hint || !storageAvailable()) return;
  const { minutes, goal } = getWeeklyFocusProgress();
  if (minutes <= 0) {
    hint.hidden = true;
    return;
  }
  hint.textContent =
    goal > 0
      ? `${minutes} / ${goal} focused min this week (on this device)`
      : `${minutes} focused min this week (on this device)`;
  hint.hidden = false;
}

function hideEndOverlay() {
  const overlay = document.getElementById("focus-end-overlay");
  if (overlay) overlay.hidden = true;
}

function showEndOverlay(session, completedNaturally) {
  if (!session) return;
  const overlay = document.getElementById("focus-end-overlay");
  const title = document.getElementById("focus-end-title");
  const body = document.getElementById("focus-end-body");
  const extendBtn = document.getElementById("focus-end-extend");
  if (!overlay || !title || !body) return;

  const mins = elapsedMinutes(session);
  title.textContent = completedNaturally ? "Focus session complete" : "Session ended";
  body.textContent = completedNaturally
    ? `You focused for about ${mins} minute${mins === 1 ? "" : "s"}. Step away for 5 minutes — stretch, water, no screens — then continue when ready.`
    : `You focused for about ${mins} minute${mins === 1 ? "" : "s"}. Take a short break if you need one.`;

  if (extendBtn) {
    extendBtn.hidden = !completedNaturally || extendedOnce;
  }

  overlay.hidden = false;
  document.getElementById("focus-end-continue")?.focus();
}

function finishSession(completedNaturally) {
  const session = loadSession();
  stopTick();
  if (session && storageAvailable()) {
    recordFocusMinutes(elapsedMinutes(session), focusLessonKey);
    updateWeeklyHint();
  }
  clearSession();
  setFocusMode(false);
  showPicker(true);
  showEndOverlay(session, completedNaturally);
}

function stopTick() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function tick() {
  const session = loadSession();
  if (!session) {
    stopTick();
    setFocusMode(false);
    showPicker(true);
    return;
  }

  const left = remainingSeconds(session);
  updateTimerDisplay(left);

  if (left <= 0) {
    finishSession(true);
  }
}

function startTick() {
  stopTick();
  tick();
  tickTimer = setInterval(tick, TICK_MS);
}

function startSession(minutes) {
  const duration = Math.min(Math.max(Math.round(minutes), 1), 180);
  const now = Date.now();
  const session = {
    startedAt: new Date(now).toISOString(),
    endsAt: new Date(now + duration * 60000).toISOString(),
    durationMinutes: duration,
  };

  if (!saveSession(session)) return false;

  extendedOnce = false;
  hideEndOverlay();
  setFocusMode(true);
  showPicker(false);
  document.getElementById("focus-session-picker")?.removeAttribute("open");
  startTick();
  return true;
}

function exitSessionEarly() {
  const session = loadSession();
  if (!session) return;
  const left = remainingSeconds(session);
  const total = session.durationMinutes * 60;
  const elapsed = total - left;
  if (elapsed < 60) {
    if (!window.confirm("End focus session? Less than a minute elapsed — it will not count toward your weekly total.")) {
      return;
    }
    stopTick();
    clearSession();
    setFocusMode(false);
    showPicker(true);
    hideEndOverlay();
    return;
  }
  if (!window.confirm("End focus session early?")) return;
  finishSession(false);
}

function extendSession() {
  if (extendedOnce) return;
  extendedOnce = true;
  hideEndOverlay();
  startSession(5);
}

export function setLessonReadingMinutes(minutes) {
  lessonReadingMinutes = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null;
  const btn = document.getElementById("focus-preset-lesson");
  if (!btn) return;
  if (lessonReadingMinutes) {
    btn.hidden = false;
    btn.textContent = `This lesson (~${lessonReadingMinutes} min)`;
    btn.dataset.focusMinutes = String(lessonReadingMinutes);
  } else {
    btn.hidden = true;
    btn.removeAttribute("data-focus-minutes");
  }
}

export function mountFocusSession(options = {}) {
  onMarkRead = options.onMarkRead || null;
  onSessionEnd = options.onSessionEnd || null;

  const picker = document.getElementById("focus-session-picker");
  const presets = picker?.querySelector(".focus-session-presets");
  const exitBtn = document.getElementById("focus-exit");
  const overlay = document.getElementById("focus-end-overlay");

  if (!picker || !presets) return;

  presets.querySelectorAll("[data-focus-minutes]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mins = Number(btn.dataset.focusMinutes);
      if (mins > 0) startSession(mins);
    });
  });

  exitBtn?.addEventListener("click", exitSessionEarly);

  document.getElementById("focus-end-continue")?.addEventListener("click", () => {
    hideEndOverlay();
    if (typeof onSessionEnd === "function") onSessionEnd();
  });
  document.getElementById("focus-end-mark")?.addEventListener("click", () => {
    if (typeof onMarkRead === "function") onMarkRead();
    hideEndOverlay();
  });
  document.getElementById("focus-end-extend")?.addEventListener("click", extendSession);

  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) hideEndOverlay();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay && !overlay.hidden) {
      hideEndOverlay();
    }
  });

  updateWeeklyHint();

  const existing = loadSession();
  if (existing && remainingSeconds(existing) > 0) {
    extendedOnce = false;
    setFocusMode(true);
    showPicker(false);
    startTick();
  } else if (existing) {
    finishSession(true);
  }
}

/** Used by SQA on localhost only. */
export function __testFinishFocusSession() {
  if (!loadSession()) return false;
  finishSession(true);
  return true;
}

export function __testStartFocusSession(minutes) {
  return startSession(minutes);
}
