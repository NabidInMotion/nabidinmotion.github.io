# Nabid In Motion: Subscriber Study Hub

This is the on-site home for the [Road to Machine Learning](https://github.com/NabidAlam/road-to-machine-learning) curriculum. Subscribers read 265+ lessons here, save progress in the browser, and pick a career path to filter what they see. There are no accounts, no cookies, and no third-party tracking.

**Live site:** [https://nabidinmotion.github.io](https://nabidinmotion.github.io)  
**Brand colors:** Deep Obsidian `#0b0f19`, Electric Blue `#3b82f6`  
**Curriculum:** [NabidAlam/road-to-machine-learning](https://github.com/NabidAlam/road-to-machine-learning) (maintainer-authored only)  
**This site lives in:** [NabidInMotion/nabidinmotion.github.io](https://github.com/NabidInMotion/nabidinmotion.github.io) under `subscriber-site/`

## Contents

1. [Features](#features)
2. [How it fits together](#how-it-fits-together)
3. [Quick start](#quick-start)
4. [Project structure](#project-structure)
5. [Working with the curriculum](#working-with-the-curriculum)
6. [Publishing to production](#publishing-to-production)
7. [Optional CI sync](#optional-ci-sync)
8. [Configuration](#configuration)
9. [Local development](#local-development)
10. [Going live](#going-live)
11. [Security and privacy](#security-and-privacy)
12. [Before you launch in Germany](#before-you-launch-in-germany)
13. [npm scripts](#npm-scripts)
14. [When something breaks](#when-something-breaks)

## Features

| Feature | What it does |
|--------|----------------|
| Study hub | Landing page with modules, guides, YouTube cards, and career path picker |
| Reader | `learn.html` with sidebar, table of contents, and prev/next links |
| Career paths | 12 roles from the GitHub README; filters modules and the reader sidebar |
| Progress | Saved in `localStorage` on the device. Mark lessons read, continue where you left off, export or reset |
| Content sync | Markdown becomes sanitized HTML with Shiki syntax highlighting (`dark-plus`) |
| Legal pages | Datenschutz, Impressum, Nutzungsbedingungen, plus English privacy and terms |
| Privacy by design | Self-hosted fonts, no analytics, no embeds, CSP via meta tag on all HTML pages |

## How it fits together

Two Git repos stay separate but work as a pair.

```text
road-to-machine-learning          nabidinmotion (this repo)
  markdown lessons (.md)     →      subscriber-site/ (static HTML/JS/CSS)
  maintainer-authored only          subscriber-site/content/ (built JSON)
  submodule checked out here        sync-curriculum.js builds content/
```

The maintainer edits curriculum, syncs locally, and publishes via pull request to `main`. GitHub Actions then deploys `subscriber-site/` to GitHub Pages.

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
├── _headers, vercel.json, staticwebapp.config.json  # alt-host reference only
└── .well-known/security.txt
```

Build tooling at the repo root:

```text
road-to-machine-learning/      # Git submodule (curriculum source)
scripts/sync-curriculum.js
scripts/serve-site.js
.github/workflows/sync-curriculum.yml
.github/workflows/deploy-pages.yml
```

## Working with the curriculum

`road-to-machine-learning/` is a git submodule with its own remote. **Only the maintainer adds or merges curriculum content.** External pull requests are not accepted.

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

## Publishing to production

`main` is protected by a GitHub ruleset (pull request required, force push blocked). **All changes reach the live site only after you merge a PR.**

Recommended workflow:

```text
1. Edit curriculum (road-to-machine-learning) → push to its main
2. npm run curriculum:sync          # rebuild subscriber-site/content/
3. git checkout -b your-branch
4. git add … → commit → push → open PR
5. Review the diff (especially content/ for curriculum updates)
6. Squash merge to main
7. Deploy Study Hub Action runs → nabidinmotion.github.io updates
```

Site code changes (JS, CSS, HTML) follow the same PR → merge → deploy path.

## Optional CI sync

A GitHub Action (`.github/workflows/sync-curriculum.yml`) can rebuild `content/` from the submodule. Triggers: manual dispatch, daily schedule, or `repository_dispatch` from the curriculum repo.

**Note:** With branch protection on `main`, the current workflow cannot push synced content directly — the job fails at `git push`. Use the [manual publish workflow](#publishing-to-production) above, or update the workflow to open a pull request instead of pushing to `main`.

Cross-repo auto-trigger setup (optional, in curriculum repo):

```text
Push .md → notify-study-hub.yml → repository_dispatch → sync-curriculum.yml
```

See [Optional CI sync setup](#optional-ci-sync-setup) below if you want this later.

### Optional CI sync setup

Workflow in curriculum repo: `.github/workflows/notify-study-hub.yml`

Under **Settings → Secrets and variables → Actions** in `road-to-machine-learning`:

| Type | Name | Value |
|------|------|--------|
| Secret | `STUDY_HUB_DISPATCH_TOKEN` | Fine-grained PAT with access to the study hub repo |
| Variable | `STUDY_HUB_REPO` | `NabidInMotion/nabidinmotion.github.io` |

Test with **Actions → Sync curriculum → Run workflow** in the study hub repo.

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

Serves `subscriber-site/` on port 3080. The dev server does not send security headers; production on `*.github.io` uses CSP meta tags in HTML instead of HTTP headers.

Typical loop: edit markdown → `npm run curriculum:sync` → refresh the browser.

## Going live

**Production URL:** [https://nabidinmotion.github.io](https://nabidinmotion.github.io) (GitHub Pages only — no custom domain)

GitHub Actions deploys `subscriber-site/` to the `gh-pages` branch via `.github/workflows/deploy-pages.yml` when `subscriber-site/` changes on `main`.

One-time setup on [NabidInMotion/nabidinmotion.github.io](https://github.com/NabidInMotion/nabidinmotion.github.io):

1. **Settings → Pages → Source:** Deploy from branch → **gh-pages** → **/ (root)**
2. **Settings → Actions → General → Workflow permissions:** Read and write
3. Run **Actions → Deploy Study Hub → Run workflow** once after the first push

Files `_headers`, `vercel.json`, and `staticwebapp.config.json` are **reference configs for forks or alternate hosts**. GitHub Pages does not apply them on `*.github.io`.

## Security and privacy

The site is static. There is no server code, no forms, and no user accounts in this repo.

- **Content:** Markdown is sanitized at sync time (`sanitize-html`). The reader uses pre-built HTML from trusted sync output.
- **Client:** Dynamic links are limited to GitHub and YouTube (`security.js`). URL params are regex-validated. Progress import is size-capped and normalized.
- **CSP:** All HTML pages include a Content-Security-Policy meta tag (`default-src 'self'`, …). `style-src` includes `'unsafe-inline'` for Shiki code blocks. GitHub Pages does not send HTTP CSP/HSTS — meta tags are the production control on `*.github.io`.
- **Privacy:** No cookies, analytics, or third-party requests on page load. Fonts are self-hosted.
- **Progress:** Stored in `localStorage` on each visitor device (see `datenschutz.html`).

Security contact: `.well-known/security.txt` → `security-acknowledgments.html`.

## Before you launch in Germany

1. Verify Impressum facts in `impressum.html` match reality
2. Monitor `nabidinmotionofficial@gmail.com` for privacy and legal requests
3. Sign a hosting DPA (AVV) with GitHub as host
4. HTTPS is provided by GitHub Pages
5. Ship the latest `content/` via PR merge before announcing updates

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
| Cannot merge PR (“protected ref”) | Adjust ruleset: turn off **Restrict updates**, or add **Repository admin** to bypass |
| Sync curriculum Action fails on push | Expected with branch protection — sync locally and open a PR instead |
| Code blocks have no colors | CSP meta tag needs `'unsafe-inline'` in `style-src` (already set on HTML pages) |
| New module missing on the hub | Add it to `data/modules.json` |
| Wrong modules for a career path | Fix that role in `data/career-paths.json` |

## Related links

| Link | Role |
|------|------|
| [nabidinmotion.github.io](https://nabidinmotion.github.io) | Live study hub |
| [road-to-machine-learning](https://github.com/NabidAlam/road-to-machine-learning) | Curriculum source |
| [nabidinmotion.github.io repo](https://github.com/NabidInMotion/nabidinmotion.github.io) | Study hub code and deploy |
| [Nabid In Motion on YouTube](https://www.youtube.com/@NabidInMotion) | Video companions |

## License

Curriculum content follows the license in [road-to-machine-learning](https://github.com/NabidAlam/road-to-machine-learning). Study hub code is part of the Nabid In Motion project.
