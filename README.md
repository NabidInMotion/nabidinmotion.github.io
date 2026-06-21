# Nabid In Motion — Study Hub

Static study hub for the [Road to Machine Learning](https://github.com/NabidAlam/road-to-machine-learning) curriculum. Subscribers read 265+ lessons in the browser, track progress locally, and filter modules by career path. No accounts, no cookies, no third-party tracking.

**Live site:** deploy `subscriber-site/` (GitHub Pages or similar)  
**Curriculum source:** [NabidAlam/road-to-machine-learning](https://github.com/NabidAlam/road-to-machine-learning) (git submodule)

Full site documentation: [subscriber-site/README.md](subscriber-site/README.md)  
Submodule notes: [CURRICULUM.md](CURRICULUM.md)

## How it fits together

Two Git repos work as a pair:

```text
road-to-machine-learning          nabidinmotion (this repo)
  markdown lessons (.md)     →      subscriber-site/ (static HTML/JS/CSS)
  own git history                   subscriber-site/content/ (built JSON)
  submodule checked out here        scripts/sync-curriculum.js
```

When you push markdown to the curriculum repo, a GitHub Action can notify this repo, rebuild `content/`, and redeploy the site.

## Quick start

Requires Node.js 18 or newer.

```bash
git clone --recurse-submodules https://github.com/NabidAlam/nabidinmotion.git
cd nabidinmotion
npm install
npm run curriculum:init    # first time only
npm run curriculum:sync    # pull latest markdown and rebuild content/
npm run site               # http://localhost:3080
```

## Working with the curriculum

Edit lessons in `road-to-machine-learning/` — it is a full git clone of the curriculum repo, not a copy. Commit and push from inside that folder, then sync the site:

```bash
cd road-to-machine-learning
git checkout main
# edit markdown
git add .
git commit -m "Update lesson"
git push origin main
cd ..

npm run curriculum:sync
npm run site
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
├── .github/workflows/           # Auto-sync when curriculum changes
├── package.json
├── CURRICULUM.md
└── README.md
```

## Brand assets

Place the site logo at `subscriber-site/assets/logo.png`. It appears in the header and browser tab on every page. Source design files stay local and are not part of this repo.

## Going live

Run `npm run curriculum:sync` before deploy, or let GitHub Actions commit fresh `content/` after a curriculum push. Point your host at the `subscriber-site` directory.

For architecture, auto-sync setup, security headers, and GDPR launch checklist, see [subscriber-site/README.md](subscriber-site/README.md).

## Links

| Resource | URL |
|----------|-----|
| Study hub repo | [NabidAlam/nabidinmotion](https://github.com/NabidAlam/nabidinmotion) |
| Curriculum repo | [NabidAlam/road-to-machine-learning](https://github.com/NabidAlam/road-to-machine-learning) |
| YouTube | [@NabidInMotion](https://www.youtube.com/@NabidInMotion) |
