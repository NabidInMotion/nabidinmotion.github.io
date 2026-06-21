# Study Hub Platform Architecture

Step by step plan to turn the subscriber site into a full on site learning hub synced with [road-to-machine-learning](https://github.com/NabidAlam/road-to-machine-learning), with progress saved in the browser and no user accounts. Designed for GDPR compliance in Germany.

---

## 1. What exists today

| Layer | Status | Detail |
|-------|--------|--------|
| Content sync script | Done | `npm run sync:curriculum` → `subscriber-site/content/` |
| On-site reader | Done | `learn.html` — 265 lessons, VS Code syntax colors |
| Progress | Done | localStorage on device only |
| Auto sync on GitHub push | Optional | GitHub Action + cross-repo dispatch (see below) |
| Live GitHub API in browser | No | By design (GDPR + speed) |

**Summary:** GitHub is the **source of truth**. The study site holds a **built snapshot** (JSON/HTML), not a live connection. Users never call GitHub until they click “View on GitHub”.

---

## 1b. How sync works (source → site)

```text
  YOU                          BUILD                         STUDY SITE
  ───                          ─────                         ──────────

  Push .md to                  npm run sync:curriculum       subscriber-site/content/
  road-to-machine-learning  ─►  (or CI on schedule)     ─►   manifest.json
  (main branch)                    │                          modules/…/lesson.json
                                   │                          guides/….json
                                   ▼                          changelog.json
                            GitHub API (tree + raw)
                            marked + sanitize + Shiki
                            heading IDs + link rewrite
                                   │
                                   ▼
                            Deploy subscriber-site/
                            (Vercel / Azure / Cloudflare)
```

| Step | What happens |
|------|----------------|
| 1 | `sync-curriculum.js` lists all `.md` files on `main` via GitHub API |
| 2 | Downloads each file from `raw.githubusercontent.com` |
| 3 | Converts to safe HTML, adds heading anchors, highlights code (Shiki `dark-plus`) |
| 4 | Rewrites internal links → `learn.html?m=…&l=…` |
| 5 | Writes JSON under `content/` + updates `manifest.json` with sync time + commit SHA |
| 6 | You deploy `subscriber-site/` — subscribers read the snapshot |

**Not automatic today unless you enable CI** (see section 1c).

**Manual sync (local):**

```bash
npm run sync:curriculum
npm run site   # preview at http://localhost:3080
# then commit content/ and deploy
```

**Also update manually when adding a new module folder:**

| File | Why |
|------|-----|
| `subscriber-site/data/modules.json` | Hub module list, phase tabs, titles |
| `subscriber-site/data/site-config.json` | Study guide cards (optional) |

Sync discovers new markdown automatically; the hub UI reads `modules.json` for layout.

---

## 1c. Automatic sync (recommended)

Three patterns — pick one:

| Pattern | When content updates | Best for |
|---------|----------------------|----------|
| **A. Push → dispatch → sync** | Minutes after you push to road-to-machine-learning | Production, you want “push = live” |
| **B. Scheduled sync (daily)** | Once per day | Low maintenance, good enough |
| **C. Sync on deploy** | Every deploy runs `npm run sync:curriculum` first | No `content/` in git; always fresh at build |

**Already in this repo:** `.github/workflows/sync-curriculum.yml` (daily + manual + `repository_dispatch`).

**For pattern A**, copy `scripts/road-to-ml-notify-study-hub.yml.example` into  
`road-to-machine-learning/.github/workflows/` and set secrets (see file comments).

```text
  road-to-machine-learning          study hub repo (this repo)
  push main ──► notify workflow ──► repository_dispatch
                                         │
                                         ▼
                                   sync-curriculum.yml
                                         │
                                         ▼
                                   commit content/ + deploy
```

---

## 2. Target architecture (Phase 1 to 5) — largely implemented

```text
┌──────────────────────────────────────────────────────────────────┐
│                     BUILD TIME (your machine / CI)               │
│  road-to-machine-learning repo  ──►  sync-curriculum.js          │
│         (GitHub)                      │                          │
│                                       ▼                          │
│                         subscriber-site/content/                 │
│                         (static HTML or sanitized MD per module) │
└──────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                     RUNTIME (subscriber browser)                 │
│  CDN ──► index.html (hub)                                        │
│       ──► learn.html + content/00-prerequisites/index.html ...   │
│       ──► progress.js ──► localStorage only (device)             │
│       ──► No server, no accounts, no tracking                    │
└──────────────────────────────────────────────────────────────────┘
```

**Principles**

1. **Static first** — scales to 100k users, minimal attack surface  
2. **Content bundled at build** — no live GitHub API calls from user browsers (GDPR and speed)  
3. **Progress stays on device** — localStorage only, never sent to a server  
4. **No accounts** — no registration, no passwords, no personal data collection  
5. **Opt in control** — export and reset progress buttons (GDPR user rights on device data)

---

## 3. Step by step implementation plan

### Step 1 — Content sync pipeline (build time)

**Goal:** Copy curriculum from GitHub into your site so users read on your domain.

**Tasks**

1. Add `scripts/sync-curriculum.js` in project root  
2. Pull from `NabidAlam/road-to-machine-learning` (clone or GitHub raw API)  
3. For each module folder `00` to `25`, copy:
   - `README.md` (main lesson text)
   - Linked notebooks stay as optional download links (too heavy to inline initially)  
4. Convert markdown to **sanitized HTML** at build time (use `marked` + DOMPurify in Node, not in browser)  
5. Output to `subscriber-site/content/{slug}/index.html`  
6. Copy root guides into `subscriber-site/content/guides/` (Getting Started, Learning Roadmap, etc.)  
7. Add npm script: `npm run sync:curriculum`

**GDPR note:** Content is self hosted. Users do not contact GitHub until they click “View on GitHub”.

**Deliverable:** `content/` tree with readable module pages.

---

### Step 2 — Module reader UI

**Goal:** Unified reading experience inside your brand shell.

**Tasks**

1. Create `learn.html` template (or one HTML per module generated at sync)  
2. Layout:
   - Left sidebar: phase filter + module list with progress icons  
   - Center: rendered lesson content  
   - Right rail (optional): links to matching YouTube playlist / GitHub source  
3. Navigation: `learn.html?module=02-introduction-to-ml` or `/content/02-introduction-to-ml/`  
4. Styling: reuse `brand.css` + new `reader.css` (typography for code blocks, headings)  
5. Update hub `index.html` module rows: primary button **Study on site**, secondary **Open on GitHub**

**GDPR note:** Still no third party loads. Fonts remain self hosted. CSP unchanged.

**Deliverable:** Users can read full module README content without leaving the site.

---

### Step 3 — localStorage progress engine

**Goal:** Save study status on the user device with no account.

**Tasks**

1. Add `js/progress.js` with a versioned schema:

```json
{
  "v": 1,
  "completedModules": ["00-prerequisites", "01-python-for-data-science"],
  "lastModule": "02-introduction-to-ml",
  "lastVisitedAt": "2026-06-21T12:00:00.000Z",
  "checklist": {
    "02-introduction-to-ml": ["read-intro", "run-first-notebook"]
  }
}
```

2. API surface:
   - `getProgress()` / `setModuleComplete(slug)` / `setLastModule(slug)`  
   - `exportProgress()` → download JSON file  
   - `resetProgress()` → clear with confirmation dialog  
3. UI:
   - Checkbox on each module: “Mark as complete”  
   - Hub hero: “Continue where you left off” button  
   - Phase tabs show completion counts (e.g. `Phase 2 · 2/4`)  
4. Storage key: `nim-study-progress` (namespaced, version migrated on change)  
5. Graceful fallback if localStorage blocked (private mode): show message, site still readable

**GDPR note (Germany)**

| Question | Answer |
|----------|--------|
| Is localStorage personal data? | Can be, if it identifies a person. Here it stores **only learning progress**, no name, email, or ID. |
| Legal basis | Art. 6(1)(f) GDPR legitimate interest, or Art. 6(1)(b) if viewed as service the user requested |
| Cookie banner required? | **No**, for strictly functional storage that does not track across sites (eDPB: not ePrivacy “cookie” marketing/analytics) |
| Must disclose? | **Yes** in `datenschutz.html` (new section: “Lokal gespeicherte Lernfortschritte”) |
| User rights | Provide **Export** and **Delete** (reset) in UI. Data never leaves device unless user exports |

**Deliverable:** Progress persists across visits on the same browser. No server.

---

### Step 4 — Hub dashboard integration

**Goal:** Landing page becomes a study command center.

**Tasks**

1. Progress summary cards on hub (modules done, current phase, last visit)  
2. “Recommended next module” based on `lastModule` or first incomplete in path  
3. Link study guides to on site `/content/guides/getting-started.html` instead of GitHub only  
4. Optional: link each module to matching YouTube video ID in `site-config.json` when you add IDs

**Deliverable:** Subscribers open one site and plan, read, and track progress.

---

### Step 5 — GDPR and legal updates

**Goal:** Stay compliant after localStorage and content expansion.

**Tasks**

1. Update `datenschutz.html`:
   - Section on localStorage (purpose, retention until user clears, no transmission)  
   - Section on self hosted curriculum content  
2. Add progress controls footer link: “Lernfortschritt verwalten” → small modal (export / reset)  
3. Keep Impressum address and email filled before production  
4. Sign hosting AVV with CDN or static host  
5. Update `GDPR-LAUNCH-CHECKLIST.md`

**Deliverable:** Legal pages match actual behavior.

---

### Step 6 — Deploy and operations

**Goal:** Production ready in Germany at scale.

**Tasks**

1. Deploy `subscriber-site/` to Cloudflare Pages or similar (EU option)  
2. HTTPS + existing security headers  
3. CI: on push to main, run `sync:curriculum` then deploy  
4. Manual or weekly sync when GitHub repo updates  
5. Monitor only host access logs (disclosed in Datenschutz)

**Deliverable:** Live URL for subscribers, fast and GDPR aligned.

---

## 4. Folder structure (target)

```text
youtube-thumbnail-studio/
├── scripts/
│   └── sync-curriculum.js       # Pull + convert GitHub content
├── subscriber-site/
│   ├── index.html               # Hub dashboard
│   ├── learn.html               # Reader shell (or per module static pages)
│   ├── content/                 # SYNCED from GitHub (do not hand edit)
│   │   ├── 00-prerequisites/
│   │   │   └── index.html
│   │   ├── 01-python-for-data-science/
│   │   │   └── index.html
│   │   └── guides/
│   │       └── getting-started.html
│   ├── js/
│   │   ├── main.js
│   │   ├── progress.js          # localStorage engine
│   │   ├── reader.js            # Sidebar + navigation
│   │   └── security.js
│   ├── data/
│   │   ├── modules.json
│   │   └── site-config.json
│   ├── datenschutz.html
│   ├── impressum.html
│   └── docs/
│       └── PLATFORM-ARCHITECTURE.md
```

---

## 5. What we deliberately do not build

| Feature | Reason |
|---------|--------|
| User accounts | GDPR complexity, server, passwords, breach risk |
| Server side progress DB | Stores personal data, needs DPA and security ops |
| Google Analytics | Needs consent banner, tracking |
| Live GitHub API in browser | Sends user IP to GitHub on every page load |
| YouTube embeds | Sets third party cookies; use click to open only |
| Comments on site | Moderation, abuse, GDPR |

---

## 6. Recommended build order (sprints)

| Sprint | Focus | User visible outcome |
|--------|--------|----------------------|
| **Sprint 1** | Step 1 sync pipeline + 3 pilot modules | Read 3 modules on site |
| **Sprint 2** | Step 2 reader UI for all modules | Full curriculum on site |
| **Sprint 3** | Step 3 localStorage progress | Checkmarks + continue learning |
| **Sprint 4** | Step 4 hub dashboard | One place to prepare |
| **Sprint 5** | Step 5 legal + Step 6 deploy | Production in Germany |

---

## 7. Success criteria

- [ ] Subscriber reads Getting Started and at least one module **without leaving** the site  
- [ ] Progress survives browser refresh (localStorage)  
- [ ] Export and reset progress works  
- [ ] No account creation anywhere  
- [ ] Datenschutz describes localStorage accurately  
- [ ] No third party requests on page load  
- [ ] GitHub repo update → re-run sync → content updates within one deploy  

---

## 8. Next action

Start **Sprint 1**: implement `scripts/sync-curriculum.js` and ship three pilot modules (`00-prerequisites`, `01-python-for-data-science`, `02-introduction-to-ml`) with a minimal `learn.html` reader.

After you confirm, implementation can begin in that order.
