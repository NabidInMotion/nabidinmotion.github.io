/**
 * Site-wide legal meta: content sync stamp, terms acknowledgment banner.
 */
import { loadManifest } from "./content-loader.js";

const TERMS_STORAGE_KEY = "nim-terms-v1";
const TERMS_VERSION = "2026-06-22";

const DEFAULT_MONETIZATION_LINKS = {
  buyMeACoffee: "https://buymeacoffee.com/nabidinmotion",
  amazonShop: "https://www.amazon.de/shop/nabidinmotion",
};

function isHttpsUrl(urlString) {
  try {
    return new URL(urlString).protocol === "https:";
  } catch {
    return false;
  }
}

export async function fetchSiteLinks() {
  try {
    const res = await fetch("data/site-config.json");
    if (!res.ok) return { ...DEFAULT_MONETIZATION_LINKS };
    const raw = await res.json();
    const links = raw?.links || {};
    return {
      buyMeACoffee: isHttpsUrl(links.buyMeACoffee)
        ? links.buyMeACoffee
        : DEFAULT_MONETIZATION_LINKS.buyMeACoffee,
      amazonShop: isHttpsUrl(links.amazonShop)
        ? links.amazonShop
        : DEFAULT_MONETIZATION_LINKS.amazonShop,
    };
  } catch {
    return { ...DEFAULT_MONETIZATION_LINKS };
  }
}

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
  const isDe = (document.documentElement.lang || "en").toLowerCase().startsWith("de");
  const edu = isDe
    ? "Nur zu Bildungszwecken · Keine Genauigkeitsgarantie · Nutzung auf eigenes Risiko"
    : "Educational only · No accuracy guarantee · Use at your own risk";
  legalLine.innerHTML =
    `${edu} · <a href="nutzungsbedingungen.html">Nutzungsbedingungen</a> · <a href="terms.html">Terms (EN)</a>`;
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

export function enhanceFooterCopyright() {
  const isDe = (document.documentElement.lang || "en").toLowerCase().startsWith("de");
  const notice = isDe ? "Alle Rechte vorbehalten." : "All rights reserved.";

  document.querySelectorAll(".site-footer #footer-year").forEach((yearEl) => {
    const line = yearEl.closest("p");
    if (!line || line.dataset.rightsReserved === "1") return;

    const full = line.textContent || "";
    if (/all rights reserved|alle rechte vorbehalten/i.test(full)) {
      line.dataset.rightsReserved = "1";
      return;
    }

    for (const node of line.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      if (!node.textContent.includes("Nabid In Motion")) continue;
      node.textContent = node.textContent.replace(
        /(Nabid In Motion)\.?\s*/,
        `$1. ${notice} `,
      );
      line.dataset.rightsReserved = "1";
      return;
    }
  });
}

function monetizationCopy(isDe) {
  return {
    supportLabel: isDe ? "Unterstützen" : "Support",
    shopLabel: isDe ? "Shop" : "Shop",
    shopLabelLong: isDe ? "Shop (Affiliate)" : "Shop (affiliate)",
    supportTitle: isDe
      ? "Freiwillige Unterstützung über Buy Me a Coffee (externer Zahlungsdienst). Der Study Hub bleibt kostenlos."
      : "Optional voluntary support via Buy Me a Coffee (third-party payment). The Study Hub stays free.",
    shopTitle: isDe
      ? "Affiliate-Link: Beim Kauf über diesen Link erhalte ich ggf. eine Provision, ohne Mehrkosten für Sie."
      : "Affiliate link: we may earn a commission at no extra cost to you.",
    heroLead: isDe
      ? "Kostenlos · freiwillige Unterstützung willkommen"
      : "Free forever · optional support welcome",
  };
}

function createMonetizationLink(kind, links, { className = "", labels }) {
  const a = document.createElement("a");
  a.href = kind === "support" ? links.buyMeACoffee : links.amazonShop;
  a.target = "_blank";
  a.rel = kind === "support" ? "noopener noreferrer" : "noopener noreferrer sponsored";
  a.dataset.link = kind === "support" ? "support" : "amazon";
  a.title = kind === "support" ? labels.supportTitle : labels.shopTitle;
  a.textContent = kind === "support" ? labels.supportLabel : labels.shopLabel;
  if (className) a.className = className;
  return a;
}

export function enhanceHeaderMonetization(links = DEFAULT_MONETIZATION_LINKS) {
  const isDe = (document.documentElement.lang || "en").toLowerCase().startsWith("de");
  const labels = monetizationCopy(isDe);

  document.querySelectorAll(".site-header .nav-links").forEach((ul) => {
    if (ul.dataset.monetizationHeader === "1" || ul.querySelector("[data-link='support']")) {
      ul.dataset.monetizationHeader = "1";
      return;
    }

    const li = document.createElement("li");
    li.className = "nav-item-support";
    li.append(createMonetizationLink("support", links, { className: "nav-link-support", labels }));
    ul.append(li);
    ul.dataset.monetizationHeader = "1";
  });

  const readerMeta = document.querySelector(".reader-header-meta");
  if (readerMeta && !readerMeta.querySelector("[data-link='support']")) {
    const support = createMonetizationLink("support", links, {
      className: "btn btn-ghost btn-sm nav-link-support",
      labels,
    });
    support.textContent = `${labels.supportLabel} ::`;
    readerMeta.insertBefore(support, readerMeta.firstChild);
  }
}

export function enhanceHeroMonetization(links = DEFAULT_MONETIZATION_LINKS) {
  const heroActions = document.querySelector(".hero .hero-actions");
  if (!heroActions || document.querySelector(".hero-support-hint")) return;

  const isDe = (document.documentElement.lang || "en").toLowerCase().startsWith("de");
  const labels = monetizationCopy(isDe);

  const hint = document.createElement("p");
  hint.className = "hero-support-hint";
  hint.append(`${labels.heroLead} — `);

  const support = createMonetizationLink("support", links, { labels });
  support.className = "hero-support-link";
  support.textContent = labels.supportLabel;
  hint.append(support);

  const sep = document.createElement("span");
  sep.className = "hero-support-sep";
  sep.setAttribute("aria-hidden", "true");
  sep.textContent = " · ";
  hint.append(sep);

  const shop = createMonetizationLink("amazon", links, { labels });
  shop.className = "hero-support-link";
  shop.textContent = labels.shopLabelLong;
  hint.append(shop);

  heroActions.insertAdjacentElement("afterend", hint);
}

export function enhanceFooterMonetization(links = DEFAULT_MONETIZATION_LINKS) {
  const isDe = (document.documentElement.lang || "en").toLowerCase().startsWith("de");
  const labels = monetizationCopy(isDe);
  const supportLabel = labels.supportLabel;
  const shopLabel = isDe ? "Shop (Affiliate)" : "Shop";
  const supportTitle = labels.supportTitle;
  const shopTitle = labels.shopTitle;

  document.querySelectorAll(".site-footer .footer-links").forEach((ul) => {
    if (ul.dataset.monetization === "1" || ul.querySelector("[data-link='support']")) {
      ul.dataset.monetization = "1";
      return;
    }

    const supportLi = document.createElement("li");
    const supportA = document.createElement("a");
    supportA.href = links.buyMeACoffee;
    supportA.target = "_blank";
    supportA.rel = "noopener noreferrer";
    supportA.dataset.link = "support";
    supportA.title = supportTitle;
    supportA.textContent = supportLabel;
    supportLi.append(supportA);

    const shopLi = document.createElement("li");
    const shopA = document.createElement("a");
    shopA.href = links.amazonShop;
    shopA.target = "_blank";
    shopA.rel = "noopener noreferrer sponsored";
    shopA.dataset.link = "amazon";
    shopA.title = shopTitle;
    shopA.textContent = shopLabel;
    shopLi.append(shopA);

    ul.append(supportLi, shopLi);
    ul.dataset.monetization = "1";
  });

  const noteText = isDe
    ? "Amazon-Shop: Affiliate-Link (ggf. Provision). Buy Me a Coffee: freiwillige Unterstützung — der Study Hub bleibt kostenlos."
    : "Amazon Shop: affiliate link (commission possible). Buy Me a Coffee: optional support — the Study Hub stays free.";

  document.querySelectorAll(".site-footer .footer-inner").forEach((inner) => {
    if (inner.querySelector(".footer-monetization-note")) return;
    const linksUl = inner.querySelector(".footer-links");
    if (!linksUl) return;
    const note = document.createElement("p");
    note.className = "footer-monetization-note";
    note.textContent = noteText;
    linksUl.insertAdjacentElement("afterend", note);
  });
}

export async function initSiteMeta(options = {}) {
  const year = document.getElementById("footer-year");
  if (year) year.textContent = String(new Date().getFullYear());

  enhanceFooterCopyright();

  const [manifest, monetizationLinks] = await Promise.all([fetchManifest(), fetchSiteLinks()]);
  enhanceHeaderMonetization(monetizationLinks);
  enhanceHeroMonetization(monetizationLinks);
  enhanceFooterMonetization(monetizationLinks);

  initMobileNav();

  if (options.showBanner !== false) initTermsBanner();

  renderContentStamp(document.getElementById("content-stamp"), manifest);
  return manifest;
}
