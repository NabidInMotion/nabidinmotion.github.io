# GDPR Launch Checklist (Germany)

Complete these steps before pointing your domain to production. The codebase is prepared for GDPR. These operator steps are required by law.

## Already implemented in code

- [x] Self hosted fonts (no Google Fonts CDN)
- [x] No cookies, no analytics, no tracking scripts
- [x] No YouTube embeds or third party thumbnail requests
- [x] External links only on click (GitHub, YouTube)
- [x] Content Security Policy with strict `self` only sources
- [x] German Datenschutzerklärung (`datenschutz.html`)
- [x] Impressum (`impressum.html`) per § 5 TMG
- [x] English privacy summary (`privacy.html`)
- [x] Footer links on all pages
- [x] Security headers for Netlify, Vercel, Azure

## You must complete before go live

1. **Impressum address**  
   Edit `impressum.html` and replace `[Straße und Hausnummer]` and `[PLZ]` with your full postal address in Berlin.

2. **Contact email**  
   Replace `privacy@nabidinmotion.com` in `datenschutz.html`, `impressum.html`, `privacy.html`, and `.well-known/security.txt` with your real mailbox. Set up the inbox.

3. **Hosting DPA (AVV)**  
   Sign a Data Processing Agreement with your host (Cloudflare, Netlify, Vercel, Azure, etc.) under Article 28 GDPR.

4. **HTTPS**  
   Deploy only over HTTPS so HSTS and secure cookies (if ever added) work correctly.

5. **EU hosting (optional but recommended)**  
   Choose a host or CDN with EU data processing if you want to minimize third country transfers in server logs.

6. **Domain in legal pages**  
   After you know your domain, update links in `security.txt` and datenschutz if needed.

## Fonts license

Inter and JetBrains Mono are bundled under open licenses (OFL). Font files live in `assets/fonts/`.

## No cookie banner needed

This site does not set non essential cookies. Do not add Google Analytics or similar tools without a consent banner and updated Datenschutzerklärung.
