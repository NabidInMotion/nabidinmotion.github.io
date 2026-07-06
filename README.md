# Nabid In Motion — Study Hub

Static study hub for the [Road to Machine Learning](https://github.com/NabidAlam/road-to-machine-learning) curriculum. Subscribers read 265+ lessons in the browser, track progress locally, and filter modules by career path. No accounts, no cookies, no third-party tracking.

**Live site:** [https://nabidinmotion.github.io](https://nabidinmotion.github.io)  
**Repo:** [NabidInMotion/nabidinmotion.github.io](https://github.com/NabidInMotion/nabidinmotion.github.io)  
**Curriculum source:** [NabidAlam/road-to-machine-learning](https://github.com/NabidAlam/road-to-machine-learning) (git submodule, maintainer-only)

Full site documentation: [subscriber-site/README.md](subscriber-site/README.md)  
Submodule notes: [CURRICULUM.md](CURRICULUM.md)

## How it fits together

Two Git repos work as a pair:

```text
road-to-machine-learning          nabidinmotion (this repo)
  markdown lessons (.md)     →      subscriber-site/ (static HTML/JS/CSS)
  maintainer-authored only          subscriber-site/content/ (built JSON)
  submodule checked out here        scripts/sync-curriculum.js
```

The live site at `nabidinmotion.github.io` serves pre-built JSON from `content/`. The browser never calls GitHub at runtime.

**Publishing:** edit curriculum → sync locally → open a PR to `main` → merge → GitHub Actions deploys `subscriber-site/` to [nabidinmotion.github.io](https://nabidinmotion.github.io). Branch protection on `main` requires a pull request for all changes.

## Maintainer publish workflow

Use this every time you update lessons or site code. **Do not push directly to `main`.**

```text
road-to-machine-learning          nabidinmotion (this repo)
─────────────────────────          ─────────────────────────
1. Edit markdown
2. commit + push to main     →    3. npm run curriculum:sync
                                  4. branch → commit → push → PR to main
                                  5. merge PR → Deploy Study Hub runs
                                  6. live site updates (~1–2 min)
```

### A. Curriculum changes (new or edited lessons)

```bash
# 1 — In road-to-machine-learning (separate repo)
cd road-to-machine-learning
# edit .md files
git add .
git commit -m "Update lesson X"
git push origin main
cd ..

# 2 — In nabidinmotion (study hub)
npm run curriculum:sync          # pull submodule + rebuild subscriber-site/content/
npm run site                     # optional: preview at http://localhost:3080

# 3 — Publish via pull request (required: main is protected)
git checkout main
git pull origin main
git checkout -b sync/curriculum
git add subscriber-site/content/ road-to-machine-learning
git commit -m "Sync curriculum from road-to-machine-learning."
git push -u origin HEAD

# 4 — On GitHub: open PR → base: main → review diff → merge
#     (use your remote name if not origin, e.g. git push -u brand HEAD)
# 5 — Actions → Deploy Study Hub runs automatically after merge
```

### B. Site-only changes (JS, CSS, HTML, features)

Skip `curriculum:sync` unless content also changed.

```bash
git checkout main
git pull origin main
git checkout -b feature/your-change
# edit subscriber-site/ …
git add .
git commit -m "Describe the site change."
git push -u origin HEAD
# Open PR → merge to main → Deploy Study Hub runs
```

### What to include in each PR

| You changed… | Stage in the PR |
|--------------|-----------------|
| Lesson markdown only | `subscriber-site/content/` + `road-to-machine-learning` submodule pointer |
| Site UI or behaviour | Files under `subscriber-site/` (and `package.json` / scripts if needed) |
| Both | Run `npm run curriculum:sync`, then commit content + site files together |

### GitHub Actions (automatic after merge)

| Workflow | When it runs | What it does |
|----------|----------------|--------------|
| **Deploy Study Hub** | Push to `main` touching `subscriber-site/` or deploy workflow | Builds artifact → deploys to GitHub Pages |
| **Sync curriculum** | Manual, daily schedule, or optional cross-repo trigger | Rebuilds `content/` in CI — **fails on push to `main`** while branch protection is on; use the manual workflow above instead |

The **Sync curriculum** Action is optional. Day-to-day publishing is: **push Road to ML → `npm run curriculum:sync` → PR to `main`**.

## Quick start

Requires Node.js 18 or newer.

```bash
git clone --recurse-submodules https://github.com/NabidInMotion/nabidinmotion.github.io.git
cd nabidinmotion
npm install
npm run curriculum:init    # first time only
npm run curriculum:sync    # pull latest markdown and rebuild content/
npm run site               # http://localhost:3080
```

## Working with the curriculum

`road-to-machine-learning/` is a git submodule (maintainer-only). See **[Maintainer publish workflow](#maintainer-publish-workflow)** for the full push → sync → PR steps.

| Command | What it does |
|---------|----------------|
| `npm run curriculum:init` | Clone the curriculum submodule (first time) |
| `npm run curriculum:pull` | Pull latest `main` from the curriculum repo |
| `npm run sync:curriculum` | Rebuild `subscriber-site/content/` from local clone or GitHub |
| `npm run curriculum:sync` | Pull submodule, then sync |
| `npm run site` | Local preview at http://localhost:3080 |

## Project layout

```text
nabidinmotion/
├── subscriber-site/               # Deploy this — static study hub
│   ├── index.html, learn.html
│   ├── js/, css/, data/
│   ├── content/                 # Built from curriculum markdown
│   └── assets/logo.png          # Site logo (exported copy)
├── road-to-machine-learning/    # Git submodule — curriculum source
├── scripts/
│   ├── sync-curriculum.js       # Markdown → sanitized HTML + Shiki
│   └── serve-site.js            # Local dev server
├── .github/workflows/           # Deploy + optional curriculum sync
├── package.json
├── CURRICULUM.md
└── README.md
```

## Brand assets

Place the site logo at `subscriber-site/assets/logo.png`. It appears in the header and browser tab on every page. Source design files stay local and are not part of this repo.

## Going live

Production is **GitHub Pages only** at [https://nabidinmotion.github.io](https://nabidinmotion.github.io).

Deploy runs automatically when `subscriber-site/` changes on `main` (workflow: `.github/workflows/deploy-pages.yml`, source: **GitHub Actions** in repo Settings → Pages).

For architecture, security, publishing workflow, and GDPR checklist, see [subscriber-site/README.md](subscriber-site/README.md).

## License and copyright

**Do not use the MIT License for this repository.** The Study Hub is not open source for copying.

| Component | License |
|-----------|---------|
| **Study Hub** (this repo: code, design, JS/CSS, curated site) | **All rights reserved** — see [LICENSE](LICENSE) |
| **Curriculum markdown** (`road-to-machine-learning/`) | [MIT](https://github.com/NabidAlam/road-to-machine-learning/blob/main/LICENSE) in the curriculum repo only |

Visitors may use the live site for personal learning. Copying, cloning, or republishing the Study Hub without written permission is prohibited. See [Nutzungsbedingungen](subscriber-site/nutzungsbedingungen.html) (DE) and [Terms](subscriber-site/terms.html) (EN).

*This notice is not legal advice. For full protection under German law (UrhG), consult a qualified lawyer.*

## Links

| Resource | URL |
|----------|-----|
| Live study hub | [nabidinmotion.github.io](https://nabidinmotion.github.io) |
| Study hub repo | [NabidInMotion/nabidinmotion.github.io](https://github.com/NabidInMotion/nabidinmotion.github.io) |
| Curriculum repo | [NabidAlam/road-to-machine-learning](https://github.com/NabidAlam/road-to-machine-learning) |
| YouTube | [@NabidInMotion](https://www.youtube.com/@NabidInMotion) |
