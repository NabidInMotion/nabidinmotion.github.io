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

**Publishing:** edit curriculum → sync locally → open a PR to `main` → Squash merge → GitHub Actions deploys `subscriber-site/` to `gh-pages`. Branch protection on `main` requires this PR step for all site changes.

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

Edit lessons in `road-to-machine-learning/` — it is a full git clone of the curriculum repo. Only the maintainer publishes content. Commit and push from inside that folder, then sync and publish the study hub:

```bash
cd road-to-machine-learning
# edit markdown
git add .
git commit -m "Update lesson X"
git push origin main
cd ..

npm run curriculum:sync
npm run site    # preview locally

# publish to nabidinmotion.github.io
git checkout -b sync/curriculum
git add subscriber-site/content/ road-to-machine-learning
git commit -m "Sync curriculum from road-to-machine-learning."
git push -u origin sync/curriculum
# Open PR on GitHub → Squash merge → Deploy Study Hub runs
```

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

Deploy runs automatically when `subscriber-site/` changes on `main` (via `.github/workflows/deploy-pages.yml` → `gh-pages` branch).

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
