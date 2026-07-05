/**
 * Portfolio project tracker (local only, separate from lesson read checkboxes).
 */
import {
  buildLearnUrl,
  getProjectStats,
  getProjectStatus,
  onProgressChange,
  setProjectStatus,
  storageAvailable,
} from "./progress.js";
import { clearChildren, el } from "./security.js";

const TIER_LABELS = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export async function loadProjects() {
  const res = await fetch("data/projects.json", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Failed to load projects");
  const data = await res.json();
  return Array.isArray(data.projects) ? data.projects : [];
}

const STATUS_OPTIONS = [
  ["not_started", "Not started"],
  ["in_progress", "In progress"],
  ["done", "Done"],
];

function renderProjectCard(project) {
  const status = getProjectStatus(project.id);
  const card = el("article", `project-card project-card--${status.replace("_", "-")}`);

  const head = el("div", "project-card-head");
  head.append(
    el("span", "project-tier", TIER_LABELS[project.tier] || project.tier),
    el("h3", "project-title", project.title)
  );
  card.append(head);

  if (project.skills) card.append(el("p", "project-skills", project.skills));

  const statusWrap = el("div", "project-status-group");
  statusWrap.setAttribute("role", "group");
  statusWrap.setAttribute("aria-label", `Status for ${project.title}`);

  for (const [value, label] of STATUS_OPTIONS) {
    const btn = el("button", `project-status-btn${status === value ? " active" : ""}`);
    btn.type = "button";
    btn.textContent = label;
    btn.setAttribute("aria-pressed", status === value ? "true" : "false");
    btn.disabled = !storageAvailable();
    btn.addEventListener("click", () => {
      setProjectStatus(project.id, value);
      statusWrap.querySelectorAll(".project-status-btn").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      card.className = `project-card project-card--${value.replace("_", "-")}`;
    });
    statusWrap.append(btn);
  }
  card.append(statusWrap);

  const moduleLink = el("a", "project-module-link", "Open module brief ::");
  moduleLink.href = buildLearnUrl({ module: project.module, lessonId: "readme" });
  card.append(moduleLink);

  return card;
}

export function renderProjectsSection(container, projects, activeTier = "all") {
  clearChildren(container);
  if (!projects?.length) return;

  const stats = getProjectStats(projects);
  const summary = el("p", "project-summary");
  summary.textContent =
    stats.done === 0
      ? `${stats.total} portfolio projects. Track build progress separately from reading lessons.`
      : `${stats.done} of ${stats.total} projects marked done${stats.inProgress ? ` · ${stats.inProgress} in progress` : ""}.`;
  container.append(summary);

  const tabs = el("div", "project-tier-tabs");
  tabs.setAttribute("role", "tablist");
  const tiers = ["all", "beginner", "intermediate", "advanced"];
  const grid = el("div", "project-grid");

  let currentTier = activeTier;

  function paint() {
    clearChildren(grid);
    const filtered =
      currentTier === "all" ? projects : projects.filter((p) => p.tier === currentTier);
    for (const p of filtered) grid.append(renderProjectCard(p));
  }

  for (const tier of tiers) {
    const btn = el("button", `project-tier-tab${currentTier === tier ? " active" : ""}`);
    btn.type = "button";
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", currentTier === tier ? "true" : "false");
    btn.textContent = tier === "all" ? "All" : TIER_LABELS[tier];
    btn.addEventListener("click", () => {
      currentTier = tier;
      tabs.querySelectorAll(".project-tier-tab").forEach((b) => {
        b.classList.toggle("active", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });
      paint();
    });
    tabs.append(btn);
  }

  container.append(tabs, grid);
  paint();
}

export function bindProjectsRefresh(container, projects) {
  return onProgressChange(() => renderProjectsSection(container, projects));
}
