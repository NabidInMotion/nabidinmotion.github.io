# GDPR Launch Checklist (Germany)

Complete these steps before pointing your domain to production. The codebase is prepared for GDPR. Operator steps below are required or strongly recommended by law.

## Already implemented in code

- [x] Self hosted fonts (no Google Fonts CDN)
- [x] No cookies, no analytics, no tracking scripts on the Study Hub
- [x] No YouTube or Facebook embeds or third party thumbnail requests
- [x] External links only on click (GitHub, YouTube, Facebook)
- [x] Content Security Policy via meta tag on all HTML pages (`*.github.io` does not apply HTTP headers)
- [x] German Datenschutzerklärung (`datenschutz.html`) incl. off-site monetization note
- [x] Impressum (`impressum.html`) per § 5 DDG with Gewerbe and English summary
- [x] Nutzungsbedingungen / Terms with open-source, at-your-own-risk, and link disclaimers
- [x] English privacy summary (`privacy.html`)
- [x] Terms acknowledgment banner and lesson content notices
- [x] Progress export, import, and reset (local device only)
- [x] Footer links on all pages
- [x] HTTP security headers in `_headers`, `vercel.json`, `staticwebapp.config.json` (reference for forks / alt hosts; not applied on GitHub Pages)
- [x] Contact email `nabidinmotionofficial@gmail.com` in legal pages and `security.txt`

## Tier 1 — Before go live (required)

- [ ] **Verify Impressum facts** — name, address, Gewerbe registration, Kleinunternehmer status must match reality
- [ ] **Monitor `nabidinmotionofficial@gmail.com`** — privacy, legal, and security reports
- [ ] **Hosting AVV (DPA)** — sign Article 28 GDPR agreement with host (GitHub, Cloudflare, Netlify, Vercel, etc.)
- [ ] **HTTPS only** — deploy with valid TLS (GitHub Pages provides this)
- [ ] **Set production URL** — after deploy, add canonical domain to `security.txt` `Canonical:` line and Impressum if desired
- [ ] **Smoke test** — terms banner, one lesson, export/import progress, external links, mobile nav

## Tier 2 — Platform monetization (YouTube + Facebook)

Revenue is off-site. Study Hub stays ad-free.

- [ ] **YouTube** — channel complies with YouTube Terms, AdSense policies, and copyright rules
- [ ] **Facebook** — profile/page complies with Meta Terms and monetization rules
- [ ] **Do not add** AdSense, Meta Pixel, or analytics to the Study Hub without consent UI and updated Datenschutz

## Tier 3 — Tax and Gewerbe (Germany)

- [ ] **Gewerbe** registration current at Bezirksamt Mitte von Berlin
- [ ] **Steuerberater** — confirm Kleinunternehmer § 19 UStG and declare AdSense/Facebook payouts
- [ ] **Bookkeeping** — track platform payouts even when small

## Tier 4 — Content discipline

- [ ] Label content as educational, not guaranteed outcomes
- [ ] Fix reported serious factual errors in good faith
- [ ] Do not copy unlicensed third-party course material
- [ ] Avoid medical, legal, or investment advice framed as certainty

## Tier 5 — Optional professional review

- [ ] **Medienrecht lawyer** — one-time review of Impressum + Nutzungsbedingungen (recommended, not mandatory for free static site)
- [ ] **Steuerberater** — before first meaningful AdSense tax year

## Fonts license

Inter and JetBrains Mono are bundled under open licenses (OFL). Font files live in `assets/fonts/`.

## No cookie banner needed (today)

This site does not set non essential cookies. Do not add Google Analytics, Meta Pixel, or similar tools without a consent banner and updated Datenschutzerklärung.

## Launch-day quick check

```
[ ] Impressum + Datenschutz + Terms live and linked in footer
[ ] Lesson content notice visible
[ ] No console errors on index + learn pages
[ ] AVR/DPA documented with host
[ ] security.txt reachable at /.well-known/security.txt
```
