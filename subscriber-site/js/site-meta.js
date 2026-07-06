/**
 * Site-wide legal meta: content sync stamp, terms acknowledgment banner.
 */
import { loadManifest } from "./content-loader.js";

const TERMS_STORAGE_KEY = "nim-terms-v1";
const TERMS_VERSION = "2026-06-22";

export async function fetchManifest() {
  try {
    return await loadManifest();
  } catch {
    return null;
  }
}

export function formatSyncDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export function renderContentStamp(container, manifest) {
  if (!container) return;
  container.replaceChildren();

  const legal = manifest?.legal || {};
  const synced = formatSyncDate(manifest?.syncedAt || legal.contentSyncedAt);
  const commit = legal.sourceCommit ? legal.sourceCommit.slice(0, 7) : null;
  const commitUrl = legal.sourceCommitUrl || manifest?.repo;

  const line = document.createElement("p");
  line.className = "content-stamp";

  const parts = [`Curriculum synced: ${synced}`];
  if (commit) parts.push(`GitHub commit: ${commit}`);
  parts.push("Content may change without prior notice");

  line.textContent = parts.join(" · ");

  if (commit && commitUrl) {
    line.textContent = "";
    line.append("Curriculum synced: ", synced, " · GitHub commit: ");
    const a = document.createElement("a");
    a.href = commitUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = commit;
    line.append(a, " · Content may change without prior notice");
  }

  container.append(line);

  const legalLine = document.createElement("p");
  legalLine.className = "content-stamp-legal";
  legalLine.innerHTML =
    'Educational only · No accuracy guarantee · Use at your own risk · <a href="nutzungsbedingungen.html">Nutzungsbedingungen</a> · <a href="terms.html">Terms (EN)</a>';
  container.append(legalLine);
}

export function initMobileNav() {
  const nav = document.querySelector(".site-header .nav");
  if (!nav) return;
  const links = nav.querySelector(".nav-links");
  if (!links || nav.querySelector(".nav-toggle")) return;

  if (!links.id) links.id = "site-nav";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nav-toggle btn btn-ghost btn-sm";
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", links.id);
  btn.textContent = "Menu ::";

  btn.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Close ::" : "Menu ::";
  });

  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target)) {
      links.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = "Menu ::";
    }
  });

  links.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      links.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = "Menu ::";
    });
  });

  nav.append(btn);
}

export function initTermsBanner() {
  if (window.location.protocol === "file:") return;

  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(TERMS_STORAGE_KEY) || "null");
  } catch {
    stored = null;
  }
  if (stored?.version === TERMS_VERSION) return;

  const banner = document.createElement("aside");
  banner.className = "terms-banner";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Terms notice");
  banner.innerHTML = `
    <div class="terms-banner-inner container">
      <p>
        <strong>Notice:</strong> Free open-source educational material. We do not guarantee accuracy or completeness.
        External links may change. Use at your own risk. By continuing, you accept the
        <a href="nutzungsbedingungen.html">Nutzungsbedingungen (DE)</a> and
        <a href="terms.html">Terms of Use (EN)</a>.
      </p>
      <button type="button" class="btn btn-primary btn-sm" id="terms-accept">Understood ::</button>
    </div>
  `;
  document.body.append(banner);

  document.getElementById("terms-accept")?.addEventListener("click", () => {
    try {
      localStorage.setItem(
        TERMS_STORAGE_KEY,
        JSON.stringify({ version: TERMS_VERSION, acceptedAt: new Date().toISOString() })
      );
    } catch {
      /* ignore */
    }
    banner.remove();
  });
}

export async function initSiteMeta(options = {}) {
  const year = document.getElementById("footer-year");
  if (year) year.textContent = String(new Date().getFullYear());

  initMobileNav();

  if (options.showBanner !== false) initTermsBanner();

  const manifest = await fetchManifest();
  renderContentStamp(document.getElementById("content-stamp"), manifest);
  return manifest;
}
