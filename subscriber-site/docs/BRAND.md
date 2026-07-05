# Nabid In Motion Study Hub — Product Brand

## Positioning

**Privacy by design. Structure for a 265-lesson ML journey.**

The Study Hub is the subscriber companion to the open [Road to Machine Learning](https://github.com/NabidAlam/road-to-machine-learning) curriculum and the [Nabid In Motion](https://www.youtube.com/@NabidInMotion) YouTube channel. It is not a login-walled course platform.

## Brand promise

| We do | We do not |
|-------|-----------|
| Save progress in the browser only | Require accounts |
| Let users export/import their data | Sync progress to our servers |
| Open lessons on-site with syntax highlighting | Embed YouTube or load Google thumbnails |
| Filter by career path locally | Track users with analytics |
| Sync curriculum from GitHub automatically | Gate content behind paywalls on-site |

**Tagline (internal):** *Your progress never leaves your device unless you export it.*

## Voice

- Direct, engineer-to-engineer — no hype, no “10x” fluff
- Honest about scope: educational material, no warranty
- Bilingual legal layer (DE primary, EN mirror) for EU/Germany launch
- Terminal-inspired UI cues (`::` prompts) without cosplay

## Tier 1 features (privacy-first, client-side)

All dynamic behaviour runs in the browser or is pre-built at curriculum sync time. No third-party APIs at runtime.

1. **Continue + Up next** — career-path-aware lesson recommendations from local progress
2. **Project tracker** — separate checklist for 23 portfolio projects (not the same as “lesson read”)
3. **Confidence check-ins** — optional self-assessment per lesson (Not yet / Partly / Yes), stored locally
4. **New since last visit** — compares local `lastSeenCommit` to synced curriculum changelog
5. **Full-text search** — offline index built at sync; search runs entirely in the browser

## Data stored locally

Key: `nim-study-progress` (schema v2)

```json
{
  "v": 2,
  "completedLessons": ["00-prerequisites/readme"],
  "lastLesson": "00-prerequisites/01-python-basics",
  "confidence": { "00-prerequisites/01-python-basics": 2 },
  "projects": { "beginner-01": "in_progress" },
  "lastSeenCommit": "152cc96…",
  "lastVisitAt": "2026-07-05T10:00:00.000Z",
  "updatedAt": "2026-07-05T10:00:00.000Z"
}
```

Separate keys: `nim-career-role`, `nim-terms-v1` (unchanged).

## Live site

- **URL:** https://nabidinmotion.github.io
- **Repo:** NabidInMotion/nabidinmotion.github.io
- **Curriculum source:** NabidAlam/road-to-machine-learning (submodule)
