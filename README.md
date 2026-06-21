# nabidinmotion

This folder on your PC holds **three separate things**. Git and GitHub should only ever see two of them.

| Area | Path | On GitHub? | Who sees it? |
|------|------|------------|--------------|
| **Study hub (website)** | `subscriber-site/` | Yes | Everyone (after Pages deploy) |
| **Curriculum** | `road-to-machine-learning/` | Yes (its own repo) | Everyone ([Road to ML](https://github.com/NabidAlam/road-to-machine-learning)) |
| **Channel studio** | `logo-src/`, `final-exports/`, `render_*.js`, artboards | **No** | Only you (local + `.gitignore`) |

The study hub stays in sync with the curriculum via `scripts/sync-curriculum.js`. Full site docs: [subscriber-site/README.md](subscriber-site/README.md). Submodule notes: [CURRICULUM.md](CURRICULUM.md).

**Using `subscriber-site/assets/logo.png` on the website is fine** — that is a small exported copy for the header. Visitors never get your `logo-src/` sources, `final-exports/` banners, or render tooling.

**Privacy note:** Banner/logo studio files stay on your machine only (`.gitignore`). This repo on GitHub contains the study hub and curriculum sync — not your artboards or exports.

## Study Hub quick start

```bash
npm install
npm run curriculum:init
npm run curriculum:sync
npm run site    # http://localhost:3080
```

For architecture, auto-sync, deployment, and GDPR notes, see [subscriber-site/README.md](subscriber-site/README.md).

## Channel studio (local only — not pushed to GitHub)

These files live in the same folder on your machine for convenience, but they are **gitignored** and isolated from the website and from [road-to-machine-learning](https://github.com/NabidAlam/road-to-machine-learning). Nobody browsing the study hub or the curriculum repo sees them.

Puppeteer loads HTML artboards and exports PNGs you upload to YouTube/Facebook yourself. When you need a logo on the site, copy an export into `subscriber-site/assets/` manually.

### Platform sizes

Layouts follow the rules in `.cursor/skills/SKILL.md` so text stays inside each platform safe zone.

| Platform | Source | Dimensions | Output |
|----------|--------|------------|--------|
| YouTube | `artboard.html` | 2560 × 1440 | `final-exports/youtube/youtube_banner.png` |
| Facebook | `facebook-src/artboard.html` | 820 × 360 | `final-exports/facebook/facebook_cover.png` |

### Project layout

```text
nabidinmotion/                     (GitHub: NabidAlam/nabidinmotion)
├── subscriber-site/               # PUBLIC — deploy this (GitHub Pages)
├── road-to-machine-learning/      # PUBLIC — separate repo (submodule pointer)
├── scripts/                       # PUBLIC — curriculum sync + local preview
├── .github/workflows/             # PUBLIC — auto-sync CI
├── logo-src/                      # PRIVATE — gitignored
├── final-exports/                 # PRIVATE — gitignored
├── artboard.html, render_*.js     # PRIVATE — gitignored
├── package.json
├── CURRICULUM.md
└── README.md
```

### Installation

You need Node.js 18 or newer.

```bash
git clone --recurse-submodules https://github.com/NabidAlam/nabidinmotion.git
cd nabidinmotion
npm install
```

The first install also downloads Chromium for Puppeteer.

### Generate banners

Each platform has its own script. It opens headless Chromium, loads the artboard, waits for fonts to settle, and writes the PNG.

YouTube (2560 × 1440):

```bash
npm run banner
```

Output: `final-exports/youtube/youtube_banner.png`

Facebook (820 × 360):

```bash
npm run facebook
```

Output: `final-exports/facebook/facebook_cover.png`

A successful run prints something like:

```text
OK final-exports\youtube\youtube_banner.png  (802.0 KB, 2560x1440)
OK final-exports\facebook\facebook_cover.png  (124.9 KB, 820x360)
```

### Editing the design

Brand tokens and layout rules live in `.cursor/skills/SKILL.md`. Edit `artboard.html` for YouTube and `facebook-src/artboard.html` for Facebook, then re-run the matching script.

### Tech stack

- Node.js
- Puppeteer (headless Chromium)
- Tailwind CSS via CDN inside the artboards
