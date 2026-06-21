/**
 * Nabid In Motion Subscriber Study Hub
 * Renders curriculum content with validated data and safe DOM APIs.
 */
import {
  buildLearnUrl,
  exportProgress,
  findContinueLesson,
  getModuleProgress,
  getStats,
  onProgressChange,
  resetProgress,
  storageAvailable,
} from "./progress.js";
import { loadManifest, renderContentError } from "./content-loader.js";
import {
  careerGuideUrl,
  filterSlugs,
  getRoleById,
  getSelectedRoleId,
  loadCareerPaths,
  moduleSlugsForRole,
  onCareerChange,
  roleSummary,
  setSelectedRoleId,
} from "./career-path.js";
import {
  clearChildren,
  el,
  externalLink,
  isValidSlug,
  sanitizeLink,
  sanitizeLocalAsset,
  sanitizePlaylistId,
  sanitizeVideoId,
  validateModulesData,
  validateSiteConfig,
  youtubePlaylistUrl,
  youtubeWatch,
} from "./security.js";

const REPO_BASE = "https://github.com/NabidAlam/road-to-machine-learning/tree/main";

const GUIDE_LOCAL = {
  "Getting Started": "getting-started",
  "Learning Roadmap": "learning-roadmap",
  "Quick Start": "quick-start",
  "Career Roadmap Guide": "resources--career_roadmap_guide",
  "Full Stack AI Blueprint": "resources--full_stack_ai_engineer_roadmap",
  "System Design Track": "system-design--README",
};

async function loadJSON(path) {
  const res = await fetch(path, { credentials: "same-origin", cache: "default" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function moduleHref(slug) {
  if (!isValidSlug(slug)) return REPO_BASE;
  return buildLearnUrl({ module: slug, lessonId: "readme" });
}

function guideLocalHref(title) {
  const id = GUIDE_LOCAL[title];
  return id ? buildLearnUrl({ guideId: id }) : null;
}

function renderProgressHero(container, manifest, roleId, careerData) {
  clearChildren(container);
  if (!manifest) return;

  const roleSlugs = moduleSlugsForRole(roleId, careerData);
  const stats = getStats(manifest, roleSlugs);
  const cont = findContinueLesson(manifest, roleSlugs);
  const role = getRoleById(roleId, careerData);

  const card = el("div", "progress-hero");
  const head = el("div", "progress-hero-head");
  head.append(
    el("h2", null, role ? `Progress · ${role.title}` : "Your Progress"),
    el("span", "progress-hero-percent", `${stats.percent}%`)
  );
  card.append(head);

  const bar = el("div", "progress-bar");
  const fill = el("div", "progress-bar-fill");
  fill.style.width = `${stats.percent}%`;
  bar.append(fill);
  card.append(bar);

  const metaText =
    stats.completedCount === 0
      ? role
        ? `${stats.total} lessons in the ${role.title} path. Start reading — progress saves in your browser.`
        : `${manifest.totalLessons} lessons available. Start reading on site — progress saves in your browser. No account needed.`
      : role
        ? `${stats.completedCount} of ${stats.total} lessons read for ${role.title} (${stats.percent}%).`
        : stats.guidesCompleted > 0
          ? `${stats.completedCount} of ${manifest.totalLessons} lessons read (${stats.percent}%). ${stats.guidesCompleted} guide${stats.guidesCompleted === 1 ? "" : "s"} marked read. Progress stays on this device only.`
          : `You have read ${stats.completedCount} of ${manifest.totalLessons} lessons (${stats.percent}%). Progress stays on this device only.`;

  card.append(el("p", "progress-hero-meta", metaText));

  const actions = el("div", "progress-hero-actions");
  const primary = el("div", "progress-hero-actions-primary");
  if (cont) {
    const href =
      cont.type === "guide"
        ? buildLearnUrl({ guideId: cont.guideId })
        : buildLearnUrl({ module: cont.module, lessonId: cont.lessonId });
    const btn = el("a", "btn btn-primary");
    btn.href = href;
    btn.textContent = stats.completedCount === 0 ? "Start Learning ::" : "Continue Learning ::";
    primary.append(btn);
  }
  const readBtn = el("a", "btn btn-ghost");
  readBtn.href = role ? careerGuideUrl(role) : buildLearnUrl({ guideId: "learning-roadmap" });
  readBtn.textContent = role ? "View Role Guide ::" : "Open Roadmap ::";
  primary.append(readBtn);
  actions.append(primary);

  if (storageAvailable()) {
    const util = el("div", "progress-hero-actions-util");
    const exportBtn = el("button", "link-btn");
    exportBtn.type = "button";
    exportBtn.textContent = "Export progress";
    exportBtn.addEventListener("click", exportProgress);
    const resetBtn = el("button", "link-btn link-btn-danger");
    resetBtn.type = "button";
    resetBtn.textContent = "Reset progress";
    resetBtn.addEventListener("click", () => {
      if (resetProgress()) refreshProgress(manifest, roleId, careerData);
    });
    util.append(exportBtn, el("span", "sep", "·"), resetBtn);
    actions.append(util);
  }

  card.append(actions);
  container.append(card);
}

function refreshProgress(manifest, roleId, careerData) {
  renderProgressHero(document.getElementById("progress-hero"), manifest, roleId, careerData);
  updateModulesSection(roleId, careerData, manifest);
}

let modulesCache = null;
let careerCache = null;
let selectedRoleId = "all";

function roleModuleSlugs(roleId) {
  return moduleSlugsForRole(roleId, careerCache);
}

function renderCareerSummary(container, roleId, careerData) {
  clearChildren(container);
  const role = getRoleById(roleId, careerData);
  if (!role) {
    container.hidden = true;
    return;
  }

  const slugs = roleModuleSlugs(roleId) || [];
  container.hidden = false;
  container.append(
    el("p", "career-role-summary-text", roleSummary(role, slugs.length)),
    el("span", "career-role-summary-focus", role.focus)
  );

  const links = el("div", "career-role-summary-links");
  const guide = el("a", "link", "Full role guide ::");
  guide.href = careerGuideUrl(role);
  links.append(guide);

  if (role.extras?.length) {
    const note = el("span", "career-role-summary-extra", role.extras.join(" · "));
    links.append(note);
  }
  container.append(links);
}

function renderCareerRoles(container, careerData, roleId, onSelect) {
  clearChildren(container);

  const allCard = el("button", `career-role-card${roleId === "all" ? " selected" : ""}`);
  allCard.type = "button";
  allCard.dataset.roleId = "all";
  allCard.setAttribute("aria-pressed", roleId === "all" ? "true" : "false");
  allCard.append(
    el("span", "career-role-title", "All Modules"),
    el("span", "career-role-focus", "Full curriculum"),
    el("span", "career-role-time", "26 modules")
  );
  allCard.addEventListener("click", () => onSelect("all"));
  container.append(allCard);

  for (const role of careerData.roles) {
    const slugs = moduleSlugsForRole(role.id, careerData) || [];
    const card = el("button", `career-role-card${roleId === role.id ? " selected" : ""}`);
    card.type = "button";
    card.dataset.roleId = role.id;
    card.setAttribute("aria-pressed", roleId === role.id ? "true" : "false");
    card.append(
      el("span", "career-role-title", role.title),
      el("span", "career-role-focus", role.focus),
      el("span", "career-role-time", `${role.time} · ${slugs.length} modules`)
    );
    card.addEventListener("click", () => onSelect(role.id));
    container.append(card);
  }
}

function updateModulesSection(roleId, careerData, manifest) {
  const role = getRoleById(roleId, careerData);
  const slugs = roleModuleSlugs(roleId);
  const count = slugs?.length || modulesCache?.modules.length || 26;

  const heading = document.getElementById("modules-heading");
  const desc = document.getElementById("modules-desc");
  if (heading) {
    heading.textContent = role ? `${count} Modules for ${role.title}` : "26 Modules from Zero to Hero";
  }
  if (desc) {
    desc.textContent = role
      ? `Showing modules from the ${role.title} career path. Phase tabs still work within this filtered set.`
      : "Filter by phase or browse the full path. Study on site with saved progress, or open notebooks on GitHub.";
  }

  renderCareerSummary(document.getElementById("career-role-summary"), roleId, careerData);

  const active = document.querySelector(".phase-tab.active")?.dataset.phase || "all";
  renderPhaseTabs(document.getElementById("phase-tabs"), modulesCache, roleId, careerData, (phase) => {
    renderModules(document.getElementById("module-list"), modulesCache, phase, manifest, roleId, careerData);
  });
  renderModules(document.getElementById("module-list"), modulesCache, active, manifest, roleId, careerData);
}

function renderStats(container, repo) {
  clearChildren(container);
  const items = [
    { num: String(repo.modules), label: "Modules" },
    { num: String(repo.projects), label: "Projects" },
    { num: repo.stars, label: "GitHub Stars" },
    { num: "265", label: "On-Site Lessons" },
  ];

  for (const item of items) {
    const card = el("div", "stat-card");
    card.append(el("div", "num", item.num), el("div", "label", item.label));
    container.append(card);
  }
}

function renderStudyGuides(container, guides, fallbackRepo) {
  clearChildren(container);

  for (const guide of guides) {
    const localHref = guideLocalHref(guide.title) || guide.localGuide;
    const href = localHref || sanitizeLink(guide.href, fallbackRepo);
    const title = String(guide.title || "Guide").slice(0, 120);
    const description = String(guide.description || "").slice(0, 300);

    const card = el("article", "guide-card");
    card.append(el("h3", null, title), el("p", null, description));

    const links = el("div", "guide-card-links");
    const read = el("a", "link btn-read", "Read on site ::");
    read.href = href;
    links.append(read);

    const gh = externalLink(sanitizeLink(guide.href, fallbackRepo), "link link-muted", "GitHub ::");
    links.append(gh);

    card.append(links);
    container.append(card);
  }
}

function renderVideoCard(item, fallbackChannel) {
  const videoId = sanitizeVideoId(item.videoId);
  const playlistId = sanitizePlaylistId(item.playlistId);
  const title = String(item.title || "Video").slice(0, 160);
  const description = String(item.description || "").slice(0, 220);
  const tag = String(item.tag || "").slice(0, 40);

  const playlistHref = youtubePlaylistUrl(playlistId);
  const href = videoId
    ? youtubeWatch(videoId)
    : sanitizeLink(playlistHref || item.url, fallbackChannel);

  const card = el("article", `video-card${playlistId ? " is-playlist" : ""}`);
  const link = externalLink(href, null, "");
  const thumbWrap = el("div", "video-thumb");

  if (tag) thumbWrap.append(el("span", "tag", tag));

  if (videoId) {
    const plate = el("div", "playlist-thumb");
    plate.append(el("span", "playlist-icon", "▶"), el("span", "playlist-label", "YouTube Video"));
    thumbWrap.append(plate);
  } else if (playlistId) {
    const plate = el("div", "playlist-thumb");
    plate.append(el("span", "playlist-icon", "▶"), el("span", "playlist-label", "YouTube Playlist"));
    thumbWrap.append(plate);
  } else {
    thumbWrap.append(el("div", "placeholder", "Watch on YouTube ::"));
  }

  const body = el("div", "video-body");
  body.append(el("h3", null, title));
  if (description) body.append(el("p", "video-desc", description));

  link.append(thumbWrap, body);
  card.append(link);
  return card;
}

function renderVideos(container, config) {
  clearChildren(container);
  const { youtube, links } = config;
  const fallback = links.youtubeChannel;

  const playlists = (youtube.featuredPlaylists || []).slice(0, 6);
  const videos = (youtube.featuredVideos || []).slice(0, 12);

  for (const p of playlists) {
    container.append(renderVideoCard({ ...p, tag: p.tag || "Playlist" }, fallback));
  }
  for (const v of videos) {
    if (!sanitizeVideoId(v.videoId)) continue;
    container.append(renderVideoCard(v, fallback));
  }
}

function renderModules(container, modulesData, activePhase, manifest, roleId, careerData) {
  clearChildren(container);

  const map = Object.fromEntries(modulesData.modules.map((m) => [m.slug, m]));
  let slugs = modulesData.modules.map((m) => m.slug);

  if (roleId && roleId !== "all") {
    slugs = filterSlugs(slugs, roleId, careerData);
  }

  if (activePhase !== "all") {
    const phase = modulesData.phases.find((p) => p.id === activePhase);
    const phaseSlugs = phase ? phase.modules.filter(isValidSlug) : slugs;
    slugs = slugs.filter((s) => phaseSlugs.includes(s));
  }

  if (slugs.length === 0) {
    container.append(
      el("p", "module-list-empty", "No modules match this phase for the selected career path.")
    );
    return;
  }

  for (const slug of slugs) {
    const m = map[slug];
    if (!m) continue;

    const prog = manifest ? getModuleProgress(slug, manifest) : null;

    const row = el("div", "module-row");
    row.append(el("span", "module-num", slug.split("-")[0]));

    const info = el("div", "module-info");
    info.append(el("h4", null, m.title), el("p", null, m.summary));
    if (prog && prog.total > 0) {
      info.append(el("span", "module-progress-mini", `${prog.done}/${prog.total} lessons read`));
    }

    const actions = el("div", "module-row-actions");
    const study = el("a", "module-link module-link-primary", "Study ::");
    study.href = moduleHref(slug);
    actions.append(study);
    actions.append(externalLink(`${REPO_BASE}/${encodeURIComponent(slug)}`, "module-link link-muted", "GitHub ::"));

    row.append(info, actions);
    container.append(row);
  }
}

function renderPhaseTabs(container, modulesData, roleId, careerData, onSelect) {
  clearChildren(container);

  let baseSlugs = modulesData.modules.map((m) => m.slug);
  if (roleId && roleId !== "all") {
    baseSlugs = filterSlugs(baseSlugs, roleId, careerData);
  }

  const tabs = [{ id: "all", name: "All Modules" }];
  for (const phase of modulesData.phases) {
    const phaseSlugs = phase.modules.filter(isValidSlug);
    const visible = phaseSlugs.some((s) => baseSlugs.includes(s));
    if (visible) tabs.push({ id: phase.id, name: `Phase ${phase.id}` });
  }

  tabs.forEach((t, index) => {
    const btn = el("button", `phase-tab${index === 0 ? " active" : ""}`, t.name);
    btn.type = "button";
    btn.dataset.phase = t.id;
    btn.addEventListener("click", () => {
      container.querySelectorAll(".phase-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onSelect(t.id);
    });
    container.append(btn);
  });
}

function applyConfig(config) {
  const logo = document.getElementById("brand-logo");
  if (logo) {
    logo.src = sanitizeLocalAsset(config.brand.logo);
    logo.alt = config.brand.name;
  }

  const year = document.getElementById("footer-year");
  if (year) year.textContent = String(new Date().getFullYear());

  const heroTitle = document.getElementById("hero-repo-title");
  if (heroTitle) heroTitle.textContent = config.repo.title;

  const heroDesc = document.getElementById("hero-repo-desc");
  if (heroDesc && config.repo.description) {
    heroDesc.textContent = config.repo.description;
  }

  const tagline = document.getElementById("hero-tagline");
  if (tagline) tagline.textContent = config.brand.tagline;

  const skills = document.getElementById("hero-skills");
  if (skills) skills.textContent = config.brand.skills;

  const linkMap = {
    github: config.links.githubRepo,
    youtube: config.links.youtubeChannel,
    subscribe: config.links.youtubeSubscribe,
  };

  for (const [key, href] of Object.entries(linkMap)) {
    document.querySelectorAll(`[data-link='${key}']`).forEach((a) => {
      a.href = href;
      a.rel = "noopener noreferrer";
    });
  }
}

function showLoadError() {
  const main = document.querySelector("main");
  if (!main) return;
  const note = el("p", "load-error", "We could not load the study materials. Please refresh the page or try again later.");
  main.prepend(note);
}

async function init() {
  let manifest = null;
  try {
    const [rawConfig, rawModules, careerData] = await Promise.all([
      loadJSON("data/site-config.json"),
      loadJSON("data/modules.json"),
      loadCareerPaths(),
    ]);

    careerCache = careerData;
    selectedRoleId = getSelectedRoleId();

    try {
      manifest = await loadManifest();
    } catch (err) {
      const hero = document.getElementById("progress-hero");
      if (hero) renderContentError(hero, err);
    }

    const config = validateSiteConfig(rawConfig);
    const modulesData = validateModulesData(rawModules);
    modulesCache = modulesData;

    applyConfig(config);
    renderStats(document.getElementById("stats"), config.repo);
    if (manifest) renderProgressHero(document.getElementById("progress-hero"), manifest, selectedRoleId, careerData);

    const onRoleSelect = (roleId) => setSelectedRoleId(roleId);
    renderCareerRoles(document.getElementById("career-role-grid"), careerData, selectedRoleId, onRoleSelect);

    renderStudyGuides(document.getElementById("study-guides"), config.studyGuides, config.links.githubRepo);
    renderVideos(document.getElementById("video-grid"), config);
    updateModulesSection(selectedRoleId, careerData, manifest);

    onCareerChange((roleId) => {
      selectedRoleId = roleId;
      renderCareerRoles(document.getElementById("career-role-grid"), careerData, roleId, onRoleSelect);
      if (manifest) refreshProgress(manifest, roleId, careerData);
      else updateModulesSection(roleId, careerData, manifest);
    });

    if (manifest) {
      onProgressChange(() => refreshProgress(manifest, selectedRoleId, careerData));
    }
  } catch {
    showLoadError();
  }
}

document.addEventListener("DOMContentLoaded", init);
