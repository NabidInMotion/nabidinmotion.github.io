/**
 * Client-side hardening for the static study hub.
 * Escapes untrusted strings, validates URLs, and builds DOM safely.
 */

const ALLOWED_LINK_HOSTS = new Set([
  "github.com",
  "www.youtube.com",
  "youtube.com",
]);

const ALLOWED_IMAGE_HOSTS = new Set([
  "img.youtube.com",
]);

const PLAYLIST_ID_RE = /^PL[\w-]{10,}$/;
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const SLUG_RE = /^[0-9]{2}-[a-z0-9-]+$/;
const LOCAL_ASSET_RE = /^assets\/(?:fonts\/)?[a-zA-Z0-9._-]+$/;

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isAllowedLink(urlString) {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:") return false;
    return ALLOWED_LINK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function isAllowedImage(urlString) {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:") return false;
    return ALLOWED_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function isValidPlaylistId(id) {
  return typeof id === "string" && PLAYLIST_ID_RE.test(id);
}

export function sanitizePlaylistId(id) {
  return isValidPlaylistId(id) ? id : "";
}

export function youtubePlaylistUrl(playlistId) {
  const id = sanitizePlaylistId(playlistId);
  if (!id) return "";
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`;
}

export function isValidVideoId(id) {
  return typeof id === "string" && VIDEO_ID_RE.test(id);
}

export function isValidSlug(slug) {
  return typeof slug === "string" && SLUG_RE.test(slug);
}

export function isValidLocalAsset(path) {
  return typeof path === "string" && LOCAL_ASSET_RE.test(path);
}

export function sanitizeLink(urlString, fallback) {
  return isAllowedLink(urlString) ? urlString : fallback;
}

export function sanitizeVideoId(id) {
  return isValidVideoId(id) ? id : "";
}

export function sanitizeLocalAsset(path, fallback = "assets/logo.png") {
  return isValidLocalAsset(path) ? path : fallback;
}

export function assertPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 9999) return fallback;
  return Math.floor(n);
}

export function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function externalLink(href, className, label) {
  const a = el("a", className, label);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

export function validateSiteConfig(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Invalid site configuration.");

  const links = raw.links || {};
  const brand = raw.brand || {};
  const repo = raw.repo || {};

  return {
    brand: {
      name: String(brand.name || "Nabid In Motion").slice(0, 80),
      tagline: String(brand.tagline || "").slice(0, 200),
      skills: String(brand.skills || "").slice(0, 200),
      logo: sanitizeLocalAsset(brand.logo),
    },
    links: {
      youtubeChannel: sanitizeLink(links.youtubeChannel, "https://www.youtube.com/@NabidInMotion"),
      youtubeSubscribe: sanitizeLink(links.youtubeSubscribe, "https://www.youtube.com/@NabidInMotion?sub_confirmation=1"),
      githubRepo: sanitizeLink(links.githubRepo, "https://github.com/NabidAlam/road-to-machine-learning"),
      githubProfile: sanitizeLink(links.githubProfile, "https://github.com/NabidAlam"),
    },
    repo: {
      title: String(repo.title || "Road to ML").slice(0, 120),
      description: String(repo.description || "").slice(0, 500),
      stars: String(repo.stars || "").slice(0, 20),
      modules: assertPositiveInt(repo.modules, 26),
      projects: assertPositiveInt(repo.projects, 23),
    },
    youtube: {
      channelId: typeof raw.youtube?.channelId === "string" ? raw.youtube.channelId.slice(0, 30) : "",
      featuredPlaylists: Array.isArray(raw.youtube?.featuredPlaylists) ? raw.youtube.featuredPlaylists.slice(0, 12) : [],
      featuredVideos: Array.isArray(raw.youtube?.featuredVideos) ? raw.youtube.featuredVideos.slice(0, 24) : [],
    },
    studyGuides: Array.isArray(raw.studyGuides) ? raw.studyGuides.slice(0, 24) : [],
  };
}

export function youtubeThumb(videoId) {
  const id = sanitizeVideoId(videoId);
  if (!id) return "";
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

export function youtubeWatch(videoId) {
  const id = sanitizeVideoId(videoId);
  if (!id) return "https://www.youtube.com/@NabidInMotion";
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}

export function validateModulesData(raw) {
  if (!raw || !Array.isArray(raw.modules)) throw new Error("Invalid modules data.");

  const modules = raw.modules
    .filter((m) => m && isValidSlug(m.slug))
    .slice(0, 40)
    .map((m) => ({
      slug: m.slug,
      title: String(m.title || "").slice(0, 120),
      summary: String(m.summary || "").slice(0, 300),
    }));

  const phases = Array.isArray(raw.phases)
    ? raw.phases.slice(0, 20).map((p) => ({
        id: String(p.id || "").slice(0, 10),
        name: String(p.name || "").slice(0, 80),
        modules: Array.isArray(p.modules) ? p.modules.filter(isValidSlug).slice(0, 20) : [],
      }))
    : [];

  return { modules, phases };
}
