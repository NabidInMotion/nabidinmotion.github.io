# Nabid In Motion: Subscriber Study Hub

This is the on-site home for the [Road to Machine Learning](https://github.com/NabidAlam/road-to-machine-learning) curriculum. Subscribers read 265+ lessons here, save progress in the browser, and pick a career path to filter what they see. There are no accounts, no cookies, and no third-party tracking.

**Brand colors:** Deep Obsidian `#0b0f19`, Electric Blue `#3b82f6`  
**Curriculum:** [NabidAlam/road-to-machine-learning](https://github.com/NabidAlam/road-to-machine-learning)  
**This site lives in:** [NabidInMotion/nabidinmotion.github.io](https://github.com/NabidInMotion/nabidinmotion.github.io) under `subscriber-site/`

## Contents

1. [Features](#features)
2. [How it fits together](#how-it-fits-together)
3. [Quick start](#quick-start)
4. [Project structure](#project-structure)
5. [Working with the curriculum](#working-with-the-curriculum)
6. [Auto-sync when you push markdown](#auto-sync-when-you-push-markdown)
7. [Configuration](#configuration)
8. [Local development](#local-development)
9. [Going live](#going-live)
10. [Security and privacy](#security-and-privacy)
11. [Before you launch in Germany](#before-you-launch-in-germany)
12. [npm scripts](#npm-scripts)
13. [When something breaks](#when-something-breaks)

## Features

| Feature | What it does |
|--------|----------------|
| Study hub | Landing page with modules, guides, YouTube cards, and career path picker |
| Reader | `learn.html` with sidebar, table of contents, and prev/next links |
| Career paths | 12 roles from the GitHub README; filters modules and the reader sidebar |
| Progress | Saved in `localStorage` on the device. Mark lessons read, continue where you left off, export or reset |
| Content sync | Markdown becomes sanitized HTML with Shiki syntax highlighting (`dark-plus`) |
| Legal pages | Datenschutz, Impressum, Nutzungsbedingungen, plus English privacy and terms |
| Privacy by design | Self-hosted fonts, no analytics, no embeds, strict headers in production |

## How it fits together

Two Git repos stay separate but work as a pair.

```text
road-to-machine-learning          nabidinmotion (this repo)
  markdown lessons (.md)     →      subscriber-site/ (static HTML/JS/CSS)
  own git history                   subscriber-site/content/ (built JSON)
  submodule checked out here        sync-curriculum.js builds content/
```

When you push markdown to the curriculum repo, a GitHub Action can notify this repo, rebuild `content/`, and commit the result. Your host then redeploys `subscriber-site/`.

The live site never calls GitHub in the browser. It serves pre-built JSON from `content/`. GitHub and YouTube open only when someone clicks a link.

**Build steps (`sync-curriculum.js`):**

1. Read markdown from `road-to-machine-learning/` (or from the GitHub API if the clone is missing)
2. Convert to HTML with `marked`, sanitize, add heading IDs
3. Highlight code with Shiki
4. Rewrite internal links to `learn.html?m=…&l=…`
5. Write JSON under `content/` plus `manifest.json` and `changelog.json`

More detail: [`docs/PLATFORM-ARCHITECTURE.md`](docs/PLATFORM-ARCHITECTURE.md)

## Quick start

Run these from the repo root (one level above `subscriber-site/`):

```bash
npm install
npm run curriculum:init    # first time only: clone the curriculum submodule
npm run curriculum:sync    # pull latest markdown and rebuild content/
npm run site               # preview at http://localhost:3080
```

Then open:

- Hub: http://localhost:3080
- Reader: http://localhost:3080/learn.html?g=learning-roadmap

Use `npm run site`. Do not open the HTML files directly; the reader needs a local server to load JSON.

## Project structure

```text
subscriber-site/
├── index.html                 # Study hub
├── learn.html                 # Lesson reader
├── impressum.html, datenschutz.html, privacy.html, terms.html, …
├── css/                       # brand.css, reader.css, fonts.css
├── js/                        # main, reader, progress, career-path, …
├── data/                      # site-config, modules, career-paths
├── content/                   # Generated. Do not edit by hand.
├── assets/                    # Logo and fonts
├── docs/PLATFORM-ARCHITECTURE.md
├── GDPR-LAUNCH-CHECKLIST.md
├── _headers, vercel.json, staticwebapp.config.json
└── .well-known/security.txt
```

Build tooling at the repo root:

```text
road-to-machine-learning/      # Git submodule (curriculum source)
scripts/sync-curriculum.js
scripts/serve-site.js
.github/workflows/sync-curriculum.yml
```

## Working with the curriculum

`road-to-machine-learning/` is a git submodule. It has its own remote. Edit there, push there, then rebuild the site content here.

```bash
cd road-to-machine-learning
# edit markdown
git add .
git commit -m "Update lesson X"
git push origin main
cd ..

npm run curriculum:sync
npm run site
```

| Command | What it does |
|---------|----------------|
| `npm run curriculum:init` | Clone the submodule (first time) |
| `npm run curriculum:pull` | Pull latest `main` from the curriculum repo |
| `npm run sync:curriculum` | Rebuild `content/` from the local clone or GitHub |
| `npm run curriculum:sync` | Pull submodule, then sync |

Short reference: [`../CURRICULUM.md`](../CURRICULUM.md)

## Auto-sync when you push markdown

After one-time setup, a push to `road-to-machine-learning` `main` can refresh the site without running sync locally.

```text
Push .md → notify-study-hub.yml → repository_dispatch → sync-curriculum.yml → commit content/ → deploy
```

### Setup in the curriculum repo

Workflow: `.github/workflows/notify-study-hub.yml`

Under **Settings → Secrets and variables → Actions**:

| Type | Name | Value |
|------|------|--------|
| Secret | `STUDY_HUB_DISPATCH_TOKEN` | Personal access token (see below) |
| Variable | `STUDY_HUB_REPO` | `NabidInMotion/nabidinmotion.github.io` |

**Create the token**

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Generate a new token
3. Give it access only to `nabidinmotion`
4. Permissions: Contents (read and write), Metadata (read), Actions (read and write)
5. Save the token as `STUDY_HUB_DISPATCH_TOKEN`

A classic token with the `repo` scope (or `public_repo` for a public repo) also works.

### Setup in this repo

Push to `main`:

- `.github/workflows/sync-curriculum.yml`
- `scripts/sync-curriculum.js`
- `subscriber-site/` (and `content/`, or let CI generate it)
- `.gitmodules` and the submodule pointer

Test with **Actions → Sync curriculum → Run workflow**. A daily job at 06:00 UTC runs if dispatch is missed.

## Configuration

**`data/site-config.json`**  
Brand copy, GitHub and YouTube links, playlists, study guide cards. Featured videos need a valid 11-character YouTube `videoId` or they are skipped.

**`data/modules.json`**  
Module titles, summaries, and phase tabs for the hub. Add a row here when you add a new top-level module folder in the curriculum.

**`data/career-paths.json`**  
Maps 12 career roles to module numbers (for example `00-08`, `19`, `25`).

## Local development

```bash
npm run site
```

Serves `subscriber-site/` on port 3080. The dev server does not send CSP headers; production hosts do.

Typical loop: edit markdown → `npm run curriculum:sync` → refresh the browser.

## Going live

**Production URL:** [https://nabidinmotion.github.io](https://nabidinmotion.github.io)

GitHub Pages deploys automatically from `subscriber-site/` via `.github/workflows/deploy-pages.yml`.

One-time setup on [NabidInMotion/nabidinmotion.github.io](https://github.com/NabidInMotion/nabidinmotion.github.io):

1. **Settings → Pages → Build and deployment → Source:** Deploy from branch → **gh-pages** → **/ (root)**
2. Run **Actions → Deploy Study Hub → Run workflow** once after the first push

Curriculum sync (`.github/workflows/sync-curriculum.yml`) rebuilds `content/`; deploy runs after sync or when `subscriber-site/` changes.

| Host | Config |
|------|--------|
| GitHub Pages | `.github/workflows/deploy-pages.yml` (default) |
| Netlify | `_headers` |
| Vercel | `vercel.json` |
| Azure Static Web Apps | `staticwebapp.config.json` |

## Security and privacy

The site is static. There is no server code, no forms, and no user accounts in this repo.

Markdown is sanitized at sync time. The client only allows GitHub and YouTube links. Production uses a strict Content Security Policy; `style-src` includes `'unsafe-inline'` so Shiki code blocks render correctly.

There are no cookies, analytics, or third-party requests on page load. Fonts are self-hosted.

Progress lives in `localStorage` on each visitor device. That is described in `datenschutz.html`.

Security contact: `.well-known/security.txt` points to `security-acknowledgments.html`.

## Before you launch in Germany

1. Fill in the Impressum address in `impressum.html`
2. Monitor `nabidinmotion@gmail.com` for privacy and legal requests
3. Sign a hosting DPA (AVV) with your provider
4. Deploy over HTTPS
5. Ship the latest `content/`

Full checklist: [`GDPR-LAUNCH-CHECKLIST.md`](GDPR-LAUNCH-CHECKLIST.md)

## npm scripts

Run from the repo root:

| Script | Description |
|--------|-------------|
| `npm run site` | Local preview on port 3080 |
| `npm run sync:curriculum` | Build `subscriber-site/content/` |
| `npm run curriculum:init` | Initialize the git submodule |
| `npm run curriculum:pull` | Update submodule to latest remote `main` |
| `npm run curriculum:sync` | Pull submodule and sync |
| `npm run logo` | Regenerate logo (copy to `subscriber-site/assets/`) |

## When something breaks

| Problem | What to try |
|---------|-------------|
| “Curriculum not loaded” | Use `npm run site`, not `file://` |
| Port 3080 in use | Stop the other process or change the port in `serve-site.js` |
| Sync hits GitHub API instead of local files | Run `npm run curriculum:init` |
| Push does not trigger sync | Check `STUDY_HUB_DISPATCH_TOKEN`, `STUDY_HUB_REPO`, and Actions logs in both repos |
| Code blocks have no colors in production | CSP needs `'unsafe-inline'` in `style-src` (already in deploy configs) |
| New module missing on the hub | Add it to `data/modules.json` |
| Wrong modules for a career path | Fix that role in `data/career-paths.json` |

## Related links

| Link | Role |
|------|------|
| [road-to-machine-learning](https://github.com/NabidAlam/road-to-machine-learning) | Curriculum source |
| [nabidinmotion.github.io](https://github.com/NabidInMotion/nabidinmotion.github.io) | Study hub and sync pipeline |
| [Nabid In Motion on YouTube](https://www.youtube.com/@NabidInMotion) | Video companions |

## License

Curriculum content follows the license in [road-to-machine-learning](https://github.com/NabidAlam/road-to-machine-learning). Study hub code is part of the Nabid In Motion project.
