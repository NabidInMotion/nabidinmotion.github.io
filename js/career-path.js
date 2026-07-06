/**
 * Career path selection — filters modules by target role (from GitHub README table).
 */
const STORAGE_KEY = "nim-career-role";
const ROLE_ID_RE = /^[a-z0-9-]{1,40}$/;

let pathsData = null;

function loadRoleId() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return typeof id === "string" && id.length > 0 ? id : "all";
  } catch {
    return "all";
  }
}

function isValidRoleId(roleId, data = pathsData) {
  if (!roleId || roleId === "all") return true;
  if (!ROLE_ID_RE.test(roleId)) return false;
  if (data && !data.roles.some((r) => r.id === roleId)) return false;
  return true;
}

export function getSelectedRoleId() {
  const id = loadRoleId();
  return isValidRoleId(id) ? id : "all";
}

export function setSelectedRoleId(roleId) {
  try {
    if (!roleId || roleId === "all") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      if (!isValidRoleId(roleId)) return false;
      localStorage.setItem(STORAGE_KEY, roleId);
    }
    window.dispatchEvent(new CustomEvent("nim-career-change", { detail: { roleId: roleId || "all" } }));
    return true;
  } catch {
    return false;
  }
}

export function onCareerChange(callback) {
  const handler = (e) => callback(e.detail?.roleId || loadRoleId());
  window.addEventListener("nim-career-change", handler);
  return () => window.removeEventListener("nim-career-change", handler);
}

export async function loadCareerPaths() {
  if (pathsData) return pathsData;
  const res = await fetch("data/career-paths.json", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Failed to load career paths");
  pathsData = await res.json();
  return pathsData;
}

export function parseModuleNumbers(specs) {
  const nums = new Set();
  for (const spec of specs) {
    const parts = String(spec).split(",").map((s) => s.trim());
    for (const part of parts) {
      const range = part.match(/^(\d{2})\s*-\s*(\d{2})$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        for (let i = start; i <= end; i++) nums.add(String(i).padStart(2, "0"));
      } else {
        const single = part.match(/^(\d{2})/);
        if (single) nums.add(single[1]);
      }
    }
  }
  return [...nums].sort();
}

export function moduleSlugsForRole(roleId, data = pathsData) {
  if (!roleId || roleId === "all" || !data) return null;
  const role = data.roles.find((r) => r.id === roleId);
  if (!role) return null;
  const nums = parseModuleNumbers(role.modules);
  const slugs = nums.map((n) => data.moduleSlugs[n]).filter(Boolean);
  return [...new Set(slugs)];
}

export function getRoleById(roleId, data = pathsData) {
  if (!data || !roleId || roleId === "all") return null;
  return data.roles.find((r) => r.id === roleId) || null;
}

export function filterSlugs(allSlugs, roleId, data = pathsData) {
  const allowed = moduleSlugsForRole(roleId, data);
  if (!allowed) return allSlugs;
  const set = new Set(allowed);
  return allSlugs.filter((s) => set.has(s));
}

export function careerGuideUrl(role) {
  if (!role?.guideAnchor) {
    return "learn.html?g=resources--career_roadmap_guide";
  }
  return `learn.html?g=resources--career_roadmap_guide#${encodeURIComponent(role.guideAnchor)}`;
}

export function roleSummary(role, slugCount) {
  if (!role) return "";
  return `${role.title} · ${slugCount} modules · est. ${role.time}`;
}
