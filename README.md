# shorti-fi — QR Code Generator

A fast, private, client-side QR code generator. Part of the **shorti-fi** toolkit (QR codes today, URL shortener next).

**Everything runs in your browser — no server, no analytics, no data leaves your device.**

## Features

- **6 content types:** URL, plain text, WiFi, vCard, email (`mailto:`), phone (`tel:`)
- **Custom styling:** foreground/background colors, square / rounded / dots module styles, matching eye styles, transparent background
- **Center logo** with automatic error-correction boost to level H (recovers ~30% damage)
- **Scannability guardrails:** standards-compliant 4-module quiet zone, contrast checker (warns below 4:1 or light-on-dark), logo size cap with warning above 20%
- **Export:** PNG download at 512 / 1024 / 2048 px, plus copy-to-clipboard
- **PWA:** works offline via a tiny service worker
- **Privacy:** settings persist in `localStorage`; your *content* (WiFi passwords, vCards, URLs) is never stored

## Tech stack

| Piece | Choice | Why |
|---|---|---|
| Build | Vite + vanilla TypeScript | tiny bundle, instant load |
| QR encoding | [`uqr`](https://github.com/unjs/uqr) (~3 KB, zero deps) | matrix only — we own rendering |
| Rendering | custom `<canvas>` renderer | rounded dots, colors, logos, retina-crisp |
| Tests | Vitest | payload escaping (WiFi/vCard) is where generators break |

## Getting started

```bash
npm install
npm run dev      # start dev server
npm test         # 30 tests: payload formatters + DOM wiring
npm run build    # type-check + production build → dist/
npm run preview  # serve the production build
```

## Project structure

```
shorti-fi/
├─ index.html
├─ public/
│  ├─ sw.js                  # offline service worker
│  ├─ manifest.webmanifest   # PWA manifest
│  └─ icon.svg
├─ src/
│  ├─ main.ts        # wiring + state + export actions
│  ├─ payloads.ts    # URL/text/WiFi/vCard/email/phone → exact encode string
│  ├─ encoder.ts     # uqr wrapper → boolean matrix (ECC L/M/Q/H)
│  ├─ renderer.ts    # canvas drawing: dots, eyes, logo, contrast checks
│  ├─ export.ts      # PNG download + clipboard, offscreen exact-size render
│  ├─ ui.ts          # tabs, form config, controls, settings persistence
│  └─ style.css
└─ tests/
   ├─ payloads.test.ts  # escaping edge cases, validation
   └─ dom.test.ts       # live preview, tabs, warnings, privacy
```

## Manual QA checklist

Scan every case with **iOS Camera** and an **Android** camera app:

- [ ] URL — plain domain (`example.com`) and full URL with query params
- [ ] Text — ASCII text
- [ ] Text — **emoji / unicode** (e.g. `こんにちは 🎉 ünïcödé`)
- [ ] WiFi — password containing `;` `"` `\` `:` `,` (escape-sensitive)
- [ ] WiFi — hidden network checkbox, and "No password" security
- [ ] vCard — minimal (first + last name only) and full (all optional fields)
- [ ] vCard — name containing commas/semicolons (`John, Jr.` / `Doe;Smith`)
- [ ] Email — with subject + body
- [ ] Phone — with and without leading `+`
- [ ] Logo at **10% / 20% / 25%** — 25% must show the >20% warning; all must scan
- [ ] **Light-on-dark colors** — must show the "lighter than background" warning
- [ ] **Very long URL** — must either render and scan, or show the "data too long" error (never a blank canvas)
- [ ] Dot styles: square / rounded / dots × eye styles: square / rounded
- [ ] Transparent background PNG export
- [ ] Export sizes 512 / 1024 / 2048 px — all scan
- [ ] Copy to clipboard works in Chrome; falls back gracefully in Safari
- [ ] Dark mode (prefers-color-scheme) — controls remain legible
- [ ] Mobile width ≤ 375px — preview stacks above controls, no horizontal scroll
- [ ] Reload with settings customized — settings restored, content NOT restored
- [ ] Airplane mode → reload — app still loads (service worker)

## Performance budget

| Asset | Budget | Actual (gzip) |
|---|---|---|
| JS | < 20 KB | ~9.7 KB |
| CSS | inlined | ~1.4 KB |
| Fonts | none | 0 |
| Requests after load | — | `main.js` only (CSS inlined) |

## Deploy — Cloudflare Pages

### Via Git (recommended)

1. Push this repo to GitHub/GitLab.
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Build settings:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Deploy. Every push to `main` triggers a new deployment.

### Via Wrangler (CLI, no Git)

```bash
npm run build
npx wrangler pages deploy dist --project-name shorti-fi
```

> Static only — no Functions needed. Everything is client-side.

## Roadmap

- [x] Phase 0–6: QR generator (payloads, encoder, renderer, UI, export)
- [ ] URL shortener (the other half of shorti-fi) — needs a storage backend, e.g. Cloudflare Workers KV