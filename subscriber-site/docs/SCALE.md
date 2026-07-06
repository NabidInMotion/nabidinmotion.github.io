# Scale & abuse resistance (100k+ concurrent readers)

The Study Hub is a **static site**: HTML, CSS, JS, and pre-built JSON. There is **no user-facing API**, no accounts, and no server-side state. That architecture is the right foundation for large traffic.

## What scales automatically

| Layer | Behavior |
|-------|----------|
| **GitHub Pages + Fastly CDN** | Static files served from the edge; no app server to overload. |
| **Client-only progress** | `localStorage` on each device — zero backend load from 100k users tracking lessons. |
| **Build-time sanitization** | Curriculum HTML is sanitized during `npm run sync:curriculum`; reader trusts synced snapshots only. |
| **No third-party runtime fetches** | Page load does not call YouTube, GitHub, or analytics APIs — only same-origin JSON. |

## Client-side abuse guards

Implemented in `subscriber-site/js/`:

| Guard | Where |
|-------|--------|
| Progress import capped at 256 KB | `progress.js` |
| Progress blob capped at 512 KB read/write | `progress.js` |
| Lesson keys validated on load and import | `progress.js` |
| Reflections max 500 chars | `progress.js` |
| Career role IDs validated | `career-path.js` |
| Search query max 120 chars, 8 tokens | `search.js` |
| Lesson JSON max 2 MB per file | `content-loader.js` |
| Reader prefs whitelist (`narrow` only) | `reader-tools.js` |
| Dev server: GET/HEAD only, path traversal blocked | `scripts/serve-site.js` |

These protect **individual browsers** from malformed imports or extensions stuffing storage. They do **not** affect other users — there is no shared server state to corrupt.

## Cache strategy (bandwidth at scale)

| Asset | Fetch policy | Why |
|-------|--------------|-----|
| `manifest.json`, `search-index.json`, `changelog.json` | `cache: no-cache` | Small metadata; revalidate each session so curriculum updates propagate. |
| Lesson JSON (`content/modules/...`) | `cache: default` + `?v=<syncedAt>` | Large files; browser/CDN cache per curriculum version after manifest loads. |
| CSS, JS, assets | Long CDN cache via `_headers` / host config | Immutable between deploys. |

After `loadManifest()`, `setContentVersion()` busts lesson cache when curriculum syncs without forcing re-download on every page view.

## Production hardening checklist

### Already in repo

- [x] Strict CSP, HSTS, frame denial in `_headers`, `vercel.json`, `staticwebapp.config.json`
- [x] Content cache rules for `/content/*`
- [x] Versioned lesson fetches
- [x] Progress normalization on load (not just import)

### Required before expecting 100k concurrent on GitHub Pages alone

GitHub Pages **does not apply** `_headers` or custom `Cache-Control`. For serious scale or DDoS protection:

1. **Put Cloudflare (or similar) in front of the custom domain** — WAF, DDoS mitigation, and cache rules that mirror `_headers`.
2. **Monitor GitHub Pages bandwidth** — soft limits apply; CDN caching reduces origin hits.
3. **Optional: migrate host** to Cloudflare Pages, Netlify, or Vercel where `_headers` / `vercel.json` are enforced natively.

### Not needed (unless you add dynamic features)

- Application rate limiting — no APIs to throttle
- Database connection pools — no database
- Session servers — progress is local-only

## Threat model summary

| Threat | Impact | Mitigation |
|--------|--------|------------|
| Traffic spike / DDoS | Site slow or unavailable | CDN + WAF in front of origin |
| Hammering lesson JSON | Bandwidth cost | Versioned URLs + CDN cache; avoid `no-cache` on large files |
| Malicious progress import | Single browser only | Size cap + schema normalization |
| localStorage flooding | Single browser only | Validated keys + 512 KB cap |
| XSS via curriculum | All users if build compromised | `sanitize-html` at sync; git integrity |
| Search DoS | Single tab only | 265 entries, debounced, query capped |

## Deploy note

Default workflow: `.github/workflows/deploy-pages.yml` → `gh-pages` branch.

Security headers and cache rules take full effect when the site is served from a host that reads `_headers` or when Cloudflare transform rules replicate them.
