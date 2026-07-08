/**
 * Sync markdown curriculum from road-to-machine-learning into subscriber-site/content/.
 *
 * Source priority:
 *   1. Local clone at road-to-machine-learning/ (git submodule — independent repo)
 *   2. GitHub raw API fallback when the clone is missing
 *
 * Run: npm run sync:curriculum
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { bundledLanguages, createHighlighter } from "shiki";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "subscriber-site", "content");
const REPO = "NabidAlam/road-to-machine-learning";
const BRANCH = "main";
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const GITHUB_BLOB = `https://github.com/${REPO}/blob/${BRANCH}`;
const CURRICULUM_DIR = process.env.CURRICULUM_DIR || path.join(ROOT, "road-to-machine-learning");

const MODULE_RE = /^\d{2}-[a-z0-9-]+$/;
const ROOT_GUIDES = new Set([
  "FOUNDATION_AND_JOB_READINESS.md",
  "GETTING_STARTED.md",
  "HOW_TO_USE_THE_STUDY_HUB.md",
  "LEARNING_ROADMAP.md",
  "QUICK_START.md",
  "README.md",
  "TIME_SERIES_LEARNING_PATH.md",
]);

const SANITIZE = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    "img",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "pre",
    "code",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "details",
    "summary",
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ["href", "name", "target", "rel"],
    code: ["class"],
    pre: ["class"],
    img: ["src", "alt", "title"],
    h1: ["id"],
    h2: ["id"],
    h3: ["id"],
    h4: ["id"],
    h5: ["id"],
    h6: ["id"],
  },
  allowedSchemes: ["http", "https", "mailto"],
};

marked.setOptions({ gfm: true, breaks: false });

const SHIKI_THEME = "dark-plus";

const LANG_ALIASES = {
  py: "python",
  js: "javascript",
  ts: "typescript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  yml: "yaml",
  md: "markdown",
  "c++": "cpp",
  "c#": "csharp",
  cs: "csharp",
  docker: "dockerfile",
  text: "plaintext",
  txt: "plaintext",
};

function normalizeLang(lang) {
  if (!lang) return "plaintext";
  const key = lang.toLowerCase().trim();
  return LANG_ALIASES[key] || key;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function readingMinutesFromMarkdown(md) {
  const words = md.replace(/```[\s\S]*?```/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function plainExcerpt(md, maxLen = 180) {
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+]\([^)]+\)/g, " ")
    .replace(/[#>*_~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trim()}…`;
}

function highlightCodeInHtml(html, highlighter) {
  const pattern = /<pre><code(?: class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    parts.push(html.slice(lastIndex, match.index));
    const [, langClass, encoded] = match;
    const code = decodeHtmlEntities(encoded);
    const candidates = langClass
      ? [normalizeLang(langClass), "plaintext"]
      : ["plaintext"];
    let rendered = match[0];
    for (const lang of candidates) {
      try {
        rendered = highlighter.codeToHtml(code, { lang, theme: SHIKI_THEME });
        break;
      } catch {
        /* try next language */
      }
    }
    parts.push(rendered);
    lastIndex = pattern.lastIndex;
  }
  parts.push(html.slice(lastIndex));
  return parts.join("");
}

async function createSyntaxHighlighter() {
  return createHighlighter({
    themes: [SHIKI_THEME],
    langs: Object.keys(bundledLanguages),
  });
}

function slugifyHeading(text) {
  const plain = text.replace(/<[^>]+>/g, "").trim();
  return plain
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function addHeadingIds(html) {
  const counts = new Map();
  return html.replace(/<h([1-6])(?![^>]*\sid=)([^>]*)>([\s\S]*?)<\/h\1>/gi, (match, level, attrs, inner) => {
    let slug = slugifyHeading(inner);
    if (!slug) return match;
    const seen = counts.get(slug) || 0;
    counts.set(slug, seen + 1);
    if (seen > 0) slug = `${slug}-${seen}`;
    const safeId = slug.replace(/[^a-z0-9-]/g, "");
    return `<h${level} id="${safeId}"${attrs}>${inner}</h${level}>`;
  });
}

function lessonIdFromRepoPath(repoPath) {
  const parts = repoPath.split("/");
  const filename = parts[parts.length - 1];
  const base = filename.replace(/\.md$/i, "");
  if (base.toLowerCase() !== "readme") return base;
  // <module>/README.md is the module overview
  if (parts.length === 2) return "readme";
  // Nested README.md (e.g. project folders) — unique id from parent directory
  return parts[parts.length - 2];
}

function titleFromFilename(filename) {
  const base = filename.replace(/\.md$/i, "");
  if (base.toLowerCase() === "readme") return "Overview";
  return base
    .replace(/^\d+-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}

function stripCodeFences(md) {
  return md.replace(/```[\s\S]*?```/g, "");
}

function titleFromMarkdown(md, fallback) {
  const body = stripCodeFences(stripBom(md));
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].replace(/[#*`]/g, "").trim().slice(0, 160) : fallback;
}

/** Study Hub CSP allows img-src 'self' data: only — replace external images with text links. */
function replaceExternalImages(html) {
  const linkedImg =
    /<a\s+([^>]*?)>\s*<img\s+([^>]*?)\/?>\s*<\/a>/gi;
  let out = html.replace(linkedImg, (match, aAttrs, imgAttrs) => {
    const hrefMatch = aAttrs.match(/\bhref="([^"]+)"/i);
    const altMatch = imgAttrs.match(/\balt="([^"]*)"/i);
    if (!hrefMatch) return match;
    const href = hrefMatch[1];
    const label = (altMatch?.[1] || "Open link").trim() || "Open link";
    const extraAttrs = aAttrs
      .replace(/\bhref="[^"]*"/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const attrs = extraAttrs ? ` ${extraAttrs}` : "";
    return `<a href="${href}" class="curriculum-media-link"${attrs}>${label}</a>`;
  });

  out = out.replace(/<img\s+([^>]*?)\/?>/gi, (match, imgAttrs) => {
    const srcMatch = imgAttrs.match(/\bsrc="([^"]+)"/i);
    if (!srcMatch) return match;
    const src = srcMatch[1];
    if (src.startsWith("data:")) return match;
    const altMatch = imgAttrs.match(/\balt="([^"]*)"/i);
    const label = (altMatch?.[1] || "Image").trim() || "Image";
    return `<span class="curriculum-media-fallback">${label}</span>`;
  });

  return out;
}

function toLearnHref(moduleSlug, lessonId) {
  const params = new URLSearchParams({ m: moduleSlug, l: lessonId });
  return `learn.html?${params.toString()}`;
}

function toGuideHref(guideId) {
  const params = new URLSearchParams({ g: guideId });
  return `learn.html?${params.toString()}`;
}

function rewriteLinks(html, contextPath) {
  const dir = path.posix.dirname(contextPath);

  return html.replace(/href="([^"]+)"/g, (full, href) => {
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) return full;

    let hash = "";
    let target = href;
    const hashIdx = target.indexOf("#");
    if (hashIdx !== -1) {
      hash = target.slice(hashIdx);
      target = target.slice(0, hashIdx);
    }
    if (!target) return `href="${hash}"`;

    if (target.startsWith("./")) target = target.slice(2);

    const blobMatch = target.match(
      new RegExp(`github\\.com/${REPO.replace("/", "\\/")}/blob/${BRANCH}/(.+)$`)
    );
    if (blobMatch) {
      const repoPath = decodeURIComponent(blobMatch[1]);
      return rewriteRepoPath(repoPath, full, hash);
    }

    const treeMatch = target.match(
      new RegExp(`github\\.com/${REPO.replace("/", "\\/")}/tree/${BRANCH}/(.+)$`)
    );
    if (treeMatch) {
      const repoPath = decodeURIComponent(treeMatch[1]);
      if (MODULE_RE.test(repoPath.split("/")[0])) {
        return `href="${toLearnHref(repoPath.split("/")[0], "readme")}${hash}"`;
      }
    }

    if (target.endsWith(".md") && !target.startsWith("http")) {
      const resolved = path.posix.normalize(path.posix.join(dir === "." ? "" : dir, target));
      return rewriteRepoPath(resolved, full, hash);
    }

    if (target.startsWith("http") && !target.includes("github.com")) {
      return `href="${href}" target="_blank" rel="noopener noreferrer"`;
    }

    if (target.startsWith("http") && target.includes("github.com")) {
      return `href="${href}" target="_blank" rel="noopener noreferrer"`;
    }

    return full;
  });

  function rewriteRepoPath(repoPath, original, hash = "") {
    const parts = repoPath.split("/");
    if (MODULE_RE.test(parts[0])) {
      const slug = parts[0];
      const file = parts[parts.length - 1];
      if (file.endsWith(".md")) {
        return `href="${toLearnHref(slug, lessonIdFromRepoPath(repoPath))}${hash}"`;
      }
      return `href="${toLearnHref(slug, "readme")}${hash}"`;
    }
    if (parts[0] === "resources" || parts[0] === "system-design") {
      const guideId = repoPath.replace(/\.md$/i, "").replace(/\//g, "--");
      return `href="${toGuideHref(guideId)}"`;
    }
    const rootFile = parts[parts.length - 1];
    if (ROOT_GUIDES.has(rootFile)) {
      const guideId = rootFile.replace(/\.md$/i, "").replace(/_/g, "-").toLowerCase();
      return `href="${toGuideHref(guideId)}"`;
    }
    const href = `${GITHUB_BLOB}/${repoPath}${hash}`;
    return `href="${href}" target="_blank" rel="noopener noreferrer"`;
  }
}

function shouldSync(repoPath) {
  if (repoPath.startsWith(".github/")) return false;
  if (!repoPath.endsWith(".md")) return false;

  const top = repoPath.split("/")[0];
  if (MODULE_RE.test(top)) return true;
  if (ROOT_GUIDES.has(repoPath)) return true;
  if (repoPath.startsWith("resources/")) return true;
  if (repoPath.startsWith("system-design/")) return true;
  return false;
}

function categorize(repoPath) {
  const top = repoPath.split("/")[0];
  if (MODULE_RE.test(top)) {
    return {
      type: "module",
      module: top,
      lessonId: lessonIdFromRepoPath(repoPath),
      outPath: path.join("modules", top, `${lessonIdFromRepoPath(repoPath)}.json`),
    };
  }
  if (ROOT_GUIDES.has(repoPath)) {
    const guideId = repoPath.replace(/\.md$/i, "").replace(/_/g, "-").toLowerCase();
    return {
      type: "guide",
      guideId,
      outPath: path.join("guides", `${guideId}.json`),
    };
  }
  const guideId = repoPath.replace(/\.md$/i, "").replace(/\//g, "--");
  return {
    type: "guide",
    guideId,
    outPath: path.join("guides", `${guideId}.json`),
  };
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "NabidInMotion-Curriculum-Sync/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchTree() {
  const url = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "NabidInMotion-Curriculum-Sync/1.0" },
  });
  if (!res.ok) throw new Error(`Failed to fetch tree: ${res.status}`);
  const data = await res.json();
  return data.tree.filter((f) => f.type === "blob" && shouldSync(f.path)).map((f) => f.path);
}

async function fetchLatestCommit() {
  const url = `https://api.github.com/repos/${REPO}/commits/${BRANCH}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "NabidInMotion-Curriculum-Sync/1.0" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    sha: data.sha,
    url: data.html_url,
    date: data.commit?.committer?.date || null,
    message: (data.commit?.message || "").split("\n")[0].slice(0, 120),
  };
}

async function localCloneReady(dir) {
  try {
    const gitPath = path.join(dir, ".git");
    const stat = await fs.stat(gitPath);
    return stat.isDirectory() || stat.isFile();
  } catch {
    try {
      await fs.access(path.join(dir, "README.md"));
      const entries = await fs.readdir(dir);
      return entries.some((name) => MODULE_RE.test(name));
    } catch {
      return false;
    }
  }
}

async function listLocalMarkdownFiles(rootDir) {
  const files = [];

  async function walk(absDir, relDir = "") {
    const entries = await fs.readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git") continue;
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        await walk(path.join(absDir, entry.name), relPath);
      } else if (entry.isFile()) {
        const posix = relPath.replace(/\\/g, "/");
        if (shouldSync(posix)) files.push(posix);
      }
    }
  }

  await walk(rootDir);
  return files.sort();
}

async function fetchLocalCommit(rootDir) {
  try {
    const { stdout: sha } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: rootDir });
    const { stdout: meta } = await execFileAsync(
      "git",
      ["log", "-1", "--format=%aI|%s"],
      { cwd: rootDir }
    );
    const [date, message] = meta.trim().split("|");
    const trimmedSha = sha.trim();
    return {
      sha: trimmedSha,
      url: `https://github.com/${REPO}/commit/${trimmedSha}`,
      date: date || null,
      message: (message || "").slice(0, 120),
    };
  } catch {
    return null;
  }
}

async function resolveCurriculumSource() {
  if (await localCloneReady(CURRICULUM_DIR)) {
    return {
      mode: "local",
      paths: await listLocalMarkdownFiles(CURRICULUM_DIR),
      commit: await fetchLocalCommit(CURRICULUM_DIR),
      readMarkdown: (repoPath) => fs.readFile(path.join(CURRICULUM_DIR, repoPath), "utf8"),
    };
  }

  return {
    mode: "remote",
    paths: await fetchTree(),
    commit: await fetchLatestCommit(),
    readMarkdown: (repoPath) => fetchText(`${RAW}/${repoPath}`),
  };
}

async function loadChangelog() {
  try {
    const raw = await fs.readFile(path.join(OUT, "changelog.json"), "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

async function processFile(repoPath, highlighter, readMarkdown) {
  const md = stripBom(await readMarkdown(repoPath));
  const cat = categorize(repoPath);
  const fallbackTitle = titleFromFilename(path.basename(repoPath));
  const title = titleFromMarkdown(md, fallbackTitle);
  let html = marked.parse(md);
  html = rewriteLinks(html, repoPath);
  html = replaceExternalImages(html);
  html = sanitizeHtml(html, {
    ...SANITIZE,
    allowedAttributes: {
      ...SANITIZE.allowedAttributes,
      a: [...(SANITIZE.allowedAttributes.a || []), "class"],
      span: ["class", "title"],
    },
  });
  html = addHeadingIds(html);
  html = highlightCodeInHtml(html, highlighter);

  const payload = {
    title,
    html,
    source: repoPath,
    githubUrl: `${GITHUB_BLOB}/${repoPath}`,
    module: cat.module || null,
    lessonId: cat.lessonId || null,
    guideId: cat.guideId || null,
    type: cat.type,
    readingMinutes: readingMinutesFromMarkdown(md),
  };

  const outFile = path.join(OUT, cat.outPath);
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(payload), "utf8");
  return {
    repoPath,
    ...cat,
    title,
    readingMinutes: payload.readingMinutes,
    excerpt: plainExcerpt(md),
  };
}

async function main() {
  const source = await resolveCurriculumSource();
  const { paths, commit, readMarkdown, mode } = source;

  if (mode === "local") {
    console.log(`Using local curriculum clone: ${CURRICULUM_DIR}`);
  } else {
    console.log("Local clone not found — fetching from GitHub API…");
    console.log(`Tip: run npm run curriculum:init to add road-to-machine-learning/ as a submodule.`);
  }

  const priorChangelog = await loadChangelog();
  console.log(`Syncing ${paths.length} markdown files…`);
  console.log("Loading VS Code syntax theme (dark-plus)…");
  const highlighter = await createSyntaxHighlighter();

  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  const entries = [];
  const batchSize = 8;
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((p) => processFile(p, highlighter, readMarkdown).catch((err) => {
      console.error(`  skip ${p}: ${err.message}`);
      return null;
    })));
    entries.push(...results.filter(Boolean));
    process.stdout.write(`  ${Math.min(i + batchSize, paths.length)}/${paths.length}\r`);
  }
  console.log(`\nProcessed ${entries.length} files.`);

  const modulesMap = new Map();
  for (const e of entries) {
    if (e.type !== "module") continue;
    if (!modulesMap.has(e.module)) {
      modulesMap.set(e.module, { slug: e.module, lessons: [] });
    }
    modulesMap.get(e.module).lessons.push({
      id: e.lessonId,
      title: e.title,
      source: e.repoPath,
      path: `modules/${e.module}/${e.lessonId}.json`,
      readingMinutes: e.readingMinutes || null,
    });
  }

  for (const mod of modulesMap.values()) {
    mod.lessons.sort((a, b) => {
      if (a.id === "readme") return -1;
      if (b.id === "readme") return 1;
      return a.id.localeCompare(b.id);
    });
  }

  const guides = entries
    .filter((e) => e.type === "guide")
    .map((e) => ({
      id: e.guideId,
      title: e.title,
      source: e.repoPath,
      path: `guides/${e.guideId}.json`,
      readingMinutes: e.readingMinutes || null,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const modulesJson = await fs.readFile(
    path.join(ROOT, "subscriber-site", "data", "modules.json"),
    "utf8"
  );
  const { modules: moduleMeta } = JSON.parse(modulesJson);
  const metaBySlug = Object.fromEntries(moduleMeta.map((m) => [m.slug, m]));

  const searchEntries = entries.map((e) => {
    if (e.type === "guide") {
      return {
        type: "guide",
        guideId: e.guideId,
        title: e.title,
        excerpt: e.excerpt,
        text: e.excerpt,
      };
    }
    return {
      type: "module",
      module: e.module,
      lessonId: e.lessonId,
      title: e.title,
      moduleTitle: metaBySlug[e.module]?.title || e.module,
      excerpt: e.excerpt,
      text: e.excerpt,
      readingMinutes: e.readingMinutes || null,
    };
  });

  const modules = [...modulesMap.values()]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((m) => ({
      ...m,
      title: metaBySlug[m.slug]?.title || m.slug,
      summary: metaBySlug[m.slug]?.summary || "",
    }));

  const syncedAt = new Date().toISOString();
  const termsVersion = "2026-06-21";

  const manifest = {
    version: 1,
    syncedAt,
    repo: `https://github.com/${REPO}`,
    totalLessons: entries.length,
    modules,
    guides,
    legal: {
      termsVersion,
      termsUrl: "nutzungsbedingungen.html",
      termsUrlEn: "terms.html",
      contentSyncedAt: syncedAt,
      sourceCommit: commit?.sha || null,
      sourceCommitUrl: commit?.url || `https://github.com/${REPO}/commits/${BRANCH}`,
      sourceCommitDate: commit?.date || null,
      sourceCommitMessage: commit?.message || null,
      license: "MIT",
      notice:
        "Educational content only. May be updated without prior notice. No warranty. See nutzungsbedingungen.html.",
    },
  };

  const changelogEntry = {
    syncedAt,
    commit: commit?.sha || null,
    commitUrl: commit?.url || null,
    lessonCount: entries.length,
    termsVersion,
  };
  const changelog = {
    version: 1,
    entries: [changelogEntry, ...priorChangelog].slice(0, 50),
  };

  await fs.writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await fs.writeFile(path.join(OUT, "changelog.json"), JSON.stringify(changelog, null, 2), "utf8");
  await fs.writeFile(
    path.join(OUT, "search-index.json"),
    JSON.stringify({ version: 1, syncedAt, entries: searchEntries }, null, 0),
    "utf8"
  );
  console.log(`Manifest: ${manifest.totalLessons} lessons, ${modules.length} modules, ${guides.length} guides.`);
  console.log(`Search index: ${searchEntries.length} entries.`);
  if (commit?.sha) console.log(`Source commit: ${commit.sha.slice(0, 7)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
