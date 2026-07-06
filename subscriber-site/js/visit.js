/**
 * "New since last visit" — compares local lastSeenCommit to synced curriculum.
 */
import { getLastSeenCommit, markVisitSeen, storageAvailable } from "./progress.js";
import { clearChildren, el } from "./security.js";

export async function loadChangelog() {
  const res = await fetch("content/changelog.json", { credentials: "same-origin", cache: "no-cache" });
  if (!res.ok) return null;
  return res.json();
}

export function getUpdatesSinceLastVisit(changelog, lastSeen) {
  if (!changelog?.entries?.length) return null;
  const latest = changelog.entries[0];
  if (!latest?.commit) return null;
  if (!lastSeen || lastSeen === latest.commit) return null;

  const newEntries = [];
  for (const entry of changelog.entries) {
    if (entry.commit === lastSeen) break;
    newEntries.push(entry);
  }

  if (!newEntries.length) return null;
  return { latest, newEntries, count: newEntries.length };
}

export function renderWhatsNewBanner(container, updateInfo) {
  clearChildren(container);
  if (!updateInfo) {
    container.hidden = true;
    return;
  }

  const { latest, count } = updateInfo;
  container.hidden = false;

  const banner = el("aside", "whats-new-banner");
  banner.setAttribute("role", "status");

  const inner = el("div", "whats-new-inner container");
  const text = el("p", "whats-new-text");
  text.append(
    document.createTextNode(
      count === 1
        ? "Curriculum updated since your last visit. "
        : `${count} curriculum syncs since your last visit. `
    )
  );
  if (latest.commitUrl) {
    const link = el("a", "whats-new-link", `Latest commit ${latest.commit.slice(0, 7)}`);
    link.href = latest.commitUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    text.append(link, document.createTextNode(" · "));
  }
  text.append(document.createTextNode(`${latest.lessonCount || "—"} lessons on site.`));

  const dismiss = el("button", "btn btn-ghost btn-sm");
  dismiss.type = "button";
  dismiss.textContent = "Got it ::";
  dismiss.addEventListener("click", () => {
    markVisitSeen(latest.commit);
    container.hidden = true;
    clearChildren(container);
  });

  inner.append(text, dismiss);
  banner.append(inner);
  container.append(banner);
}

export async function initWhatsNew(container) {
  if (!container || !storageAvailable()) return;
  const changelog = await loadChangelog();
  const lastSeen = getLastSeenCommit();
  const info = getUpdatesSinceLastVisit(changelog, lastSeen);
  renderWhatsNewBanner(container, info);

  if (!info && changelog?.entries?.[0]?.commit) {
    markVisitSeen(changelog.entries[0].commit);
  }
}
