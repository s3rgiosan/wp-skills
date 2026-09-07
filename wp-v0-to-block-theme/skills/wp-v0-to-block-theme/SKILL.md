---
name: wp-v0-to-block-theme
description: >
  Use when turning a v0 (Vercel) design — or any React/Next + Tailwind + shadcn/ui
  export or deployed preview — into a WordPress block theme (FSE). Triggers: "v0 to
  WordPress", "v0 to block theme", "convert this v0 design", "Vercel design to WP theme",
  "Tailwind to theme.json", a v0.dev / *.vercel.app URL paired with a WordPress theme
  request, or a downloaded v0 export that must become a block theme. Not for classic
  (PHP template) themes, and not for standalone React apps with no WordPress target.
---

# v0 → WordPress Block Theme

## Overview

v0 emits **React/Next + Tailwind + shadcn/ui** (runtime components). A block theme is **static block markup (HTML), `theme.json`, PHP patterns, and Interactivity API** behavior. No automatic converter exists: React components never port — every section is **rebuilt** as block markup, with the design as reference.

Split the work: **mechanical** (token extraction, design capture — run the scripts) vs **judgment** (composing blocks, patterns vs custom blocks — the model). Do the mechanical parts first so the rebuild references real tokens and real markup.

## Inputs (use whatever exists)

- **Deployed URL** (v0 preview, `*.vercel.app`) — best source of rendered markup + computed CSS. Feed to `scripts/capture.mjs`.
- **Downloaded code** — source of the Tailwind config (feed to `scripts/tokens.mjs`) and component markup/behavior.
- **Screenshots only** — visual reference; rebuild from scratch.

## Workflow

Steps 1–2 are scripts; the rest is the rebuild. Delegate depth to the referenced files and, when installed, to the named WordPress skills.

1. **Capture.** `scripts/capture.mjs <url>` → per-breakpoint DOM, computed CSS, screenshots. Read downloaded code for the Tailwind config and component behavior. Segment the page per `references/section-to-pattern.md`. When there is no deployed URL, skip capture and read the downloaded code's classes/JSX by hand for markup and behavior instead — flag fluid min/max (step 2) and the parity checklist (step 7) as estimates, since they then rest on manual reading rather than measured `computed-*.json`.
2. **Tokens → theme.json.** `scripts/tokens.mjs <config-or-css>` → a `theme.json` `settings` fragment. Refine against `references/tokens-mapping.md` (fluid type, nested colors, edge cases). Tokens **before** patterns.
3. **Scaffold.** `style.css`, `theme.json` (merge step 2), `templates/`, `parts/`, `patterns/`, `functions.php`, `package.json` (`@wordpress/scripts`), `src/`. Delegate to **wp-block-themes**.
4. **Layout.** Header/footer → `parts/*.html`. Page types → `templates/*.html` (index, front-page, page, single, archive, 404).
5. **Sections → patterns.** One `patterns/*.php` per section. **Core blocks first**, styled via tokens; custom block only where core cannot express it — raise first. Inventory the design's lucide icons up front (linked icon → linkable primitive, not a bare decorative SVG); author shared elements once, vary by modifier. Use `references/shadcn-to-core-blocks.md` and `references/section-to-pattern.md`. Delegate to **wp-patterns** / **wp-block-development**.
6. **Interactivity.** Accordions, tabs, sliders, mobile nav → **Interactivity API** (`data-wp-*` + store), server-rendered then hydrated; cross-region controls share one namespace. See `references/interactivity-recipes.md`. Delegate to **wp-interactivity-api**.
7. **Verify.** Activate locally; Site Editor loads parts/patterns and tokens resolve. Run the **per-section parity checklist** (computed CSS local vs deployed, per breakpoint) *during* the rebuild and again here — see `references/parity-pitfalls.md`. Exercise every interactive block. `npm run build` clean, no console errors.

A v0 redesign after the build is a **re-capture + diff pass** against the current patterns/blocks, not a rebuild.

## Scripts

- `scripts/capture.mjs <url> [--out DIR] [--breakpoints 390,768,1280]` — Playwright capture. Needs `npx playwright install chromium`. `--help` for flags.
- `scripts/tokens.mjs <tailwind.config.js | globals.css> [--out FILE]` — Tailwind v3 JS config or v4 `@theme` CSS → theme.json settings. No network. `--help` for flags.

## Common Mistakes

- Pasting React/JSX into patterns — patterns are block markup, not JSX. Rebuild.
- Hardcoding px/hex — reference theme.json tokens so global styles stay editable.
- Defaulting to a custom block or `ServerSideRender` — prefer core blocks; raise a custom block first.
- Eyeballing screenshots — use computed CSS from `capture.mjs` for real values.
- Editing patterns with `perl -0pi` / `sed` — they carry translatable non-ASCII UI text that stream editors double-encode. Use structured edits.
- Cover overlay hiding the image — a preset color class emits `background-color:…!important`; clear it with `background-color:transparent!important` + `background-image`, not the `background` shorthand.
- `minimumColumnWidth` for a fixed row — it auto-fills and leaves empty tracks; use `columnCount:N` for a set N.
- Hand-writing `aria-*`/`data-*`/`role` onto a core block's saved HTML — it invalidates on re-serialise; put it on a wrapper or a custom block.
- Building a classic PHP-template theme — this skill is block themes only.
