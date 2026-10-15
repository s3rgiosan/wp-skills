# wp-design-to-block-theme

Part of [wp-skills](../README.md) — Claude Code skills for WordPress developers (including the React surfaces of the WP ecosystem).

A Claude Code skill that turns any rendered web design (a deployed preview, a local dev server, or static HTML files) into a **WordPress block theme (FSE)**. There is no automatic converter, so the skill splits the work into the mechanical parts it automates (capturing the rendered pages, deriving `theme.json` tokens from what they paint, gating parity with the design and between the front end and the block editor) and the judgment parts it guides (rebuilding each section as patterns, templates, and Interactivity API blocks).

It is also the shared core for the source skills, which add what depends on where a design came from:

- [wp-v0-to-block-theme](../wp-v0-to-block-theme): v0 (Vercel) exports — React/Next + Tailwind + shadcn/ui.
- [wp-claude-design-to-block-theme](../wp-claude-design-to-block-theme): Claude Design canvases and HTML artifacts.

---

## Installation

### Via Claude Code plugin marketplace (recommended)

```
/plugin marketplace add s3rgiosan/wp-skills
/plugin install wp-design-to-block-theme@s3rgiosan-wp-skills
```

Or wire `wp-design-to-block-theme@s3rgiosan-wp-skills` into `settings.json` under `enabledPlugins` (see the [root README](../README.md#install-via-claude-code-plugin-marketplace-recommended) for the full snippet).

### Via shell script (fallback)

```bash
git clone https://github.com/s3rgiosan/wp-skills.git
cd wp-skills/wp-design-to-block-theme

# Default → ~/.claude
bash install.sh

# Custom Claude config dir (override via env var)
CLAUDE_CONFIG_DIR=~/.some-other-dir bash install.sh
```

Uninstall:

```bash
bash uninstall.sh                              # → ~/.claude
CLAUDE_CONFIG_DIR=~/.some-other-dir bash uninstall.sh # → custom dir
```

---

## Usage

Open a Claude Code session with the design to hand and ask naturally:

```
"Turn this design into a WordPress block theme: https://preview.example.com"
"Convert these static HTML pages into an FSE theme."
"Extract theme.json tokens from this page."
"The editor doesn't match the front end of this theme; run an editor parity pass."
```

The skill runs a ten-step flow: routes + capture → content model → tokens → scaffold → layout → patterns → content → interactivity → verify → handover.

### Scripts

```bash
# Playwright, once, in a working folder outside the theme
npm i -D playwright && npx playwright install chromium

# Capture the design per route and breakpoint (URLs, or a folder of HTML files as --base)
node skills/wp-design-to-block-theme/scripts/capture.mjs --routes routes.txt --base ./design-pages --out ./capture/design --behaviors

# Derive theme.json settings and draft styles from what the pages paint
node skills/wp-design-to-block-theme/scripts/css-tokens.mjs ./capture/design --out ./theme-tokens.json --dark-out ./styles/dark.json --report ./tokens-report.json

# Capture the WordPress rebuild, then run the parity gate (exit 0 = pass)
node skills/wp-design-to-block-theme/scripts/capture.mjs --routes wp-routes.txt --base http://mysite.test --out ./capture/local
node skills/wp-design-to-block-theme/scripts/compare.mjs ./capture/design ./capture/local --map about=about-us

# Capture the block editor on the same routes, then run the editor-parity gate (exit 0 = pass)
WP_USER=admin WP_PASSWORD=password node skills/wp-design-to-block-theme/scripts/capture-editor.mjs --routes wp-routes.txt --base http://mysite.test --out ./capture/editor
node skills/wp-design-to-block-theme/scripts/compare.mjs ./capture/local ./capture/editor --editor
```

Pass `--help` to any script for the full flag list. `capture.mjs`, `capture-editor.mjs` and `compare.mjs` load Playwright from the current directory; `capture-editor.mjs` logs in to the local site and changes no content or editor preference; `css-tokens.mjs` has no dependencies and does no network I/O.

---

## What's Inside

```
wp-design-to-block-theme/
├── install.sh
├── uninstall.sh
├── README.md                         ← you are here
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── wp-design-to-block-theme/
        ├── SKILL.md                  ← the ten-step workflow
        ├── references/
        │   ├── content-model.md          ← where each piece of content lives; decisions to ask; no placeholders
        │   ├── theme-json-tokens.md      ← tokens → theme.json, fonts, fluid type, dark-mode variation
        │   ├── html-to-core-blocks.md    ← design markup → core blocks, layout/form/icon recipes, block styles
        │   ├── section-to-pattern.md     ← route map, segmentation, patterns, images, content, bindings
        │   ├── interactivity-recipes.md  ← Interactivity API widget recipes + directive reference
        │   ├── editor-parity.md          ← editor canvas = front end: styles, custom block edit, ServerSideRender decision, editor gate
        │   └── parity-pitfalls.md        ← parity gates and named failure modes
        └── scripts/
            ├── capture.mjs           ← Playwright capture of the design or the rebuild
            ├── capture-editor.mjs    ← Playwright capture of the block editor canvas per route
            ├── css-tokens.mjs        ← rendered styles → theme.json settings
            ├── compare.mjs           ← design vs rebuild, or front end vs editor, parity gate
            └── lib/                  ← collectors and helpers shared by the capture scripts
```

The skill composes with the other WordPress skills — `wp-block-themes`, `wp-patterns`, `wp-block-development`, `wp-interactivity-api` — when they are installed, delegating scaffolding, pattern, and interactivity depth to them.

### Scope of the references

The references hold only what holds for any design and for WordPress core. A single design's choices, such as its link styling, surface colors or layout quirks, do not belong here. The capture measures them for each design, and each project's `CONVERSION-NOTES.md` records them.

---

## License

[MIT](../LICENSE)
