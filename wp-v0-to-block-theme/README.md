# wp-v0-to-block-theme

Part of [wp-skills](../README.md) — Claude Code skills for WordPress developers (including the React surfaces of the WP ecosystem).

A Claude Code skill that translates a **v0 (Vercel)** design — React/Next + Tailwind + shadcn/ui — into a **WordPress block theme (FSE)**. There is no automatic converter: React components never port directly, so the skill splits the work into the mechanical parts it automates (capturing the rendered design, mapping Tailwind tokens to `theme.json`) and the judgment parts it guides (rebuilding each section as patterns, templates, and Interactivity API blocks).

---

## Installation

### Via Claude Code plugin marketplace (recommended)

```
/plugin marketplace add s3rgiosan/wp-skills
/plugin install wp-v0-to-block-theme@s3rgiosan-wp-skills
```

Or wire `wp-v0-to-block-theme@s3rgiosan-wp-skills` into `settings.json` under `enabledPlugins` (see the [root README](../README.md#install-via-claude-code-plugin-marketplace-recommended) for the full snippet).

### Via shell script (fallback)

```bash
git clone https://github.com/s3rgiosan/wp-skills.git
cd wp-skills/wp-v0-to-block-theme

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

Open a Claude Code session with the design's downloaded code and/or its deployed preview URL to hand, and ask naturally:

```
"Turn this v0 design into a WordPress block theme: https://my-design.vercel.app"
"Convert this v0 export into an FSE theme."
"Map this Tailwind config to theme.json."
```

The skill auto-triggers on v0 → WordPress theme requests and runs a nine-step flow: routes + capture → tokens → scaffold → layout → patterns → content → interactivity → verify → handover.

### Scripts

The skill ships three helper scripts (used automatically, or run by hand):

```bash
# Capture the design (deployed, or a local `npm run dev`) per route and breakpoint (needs Playwright)
node skills/wp-v0-to-block-theme/scripts/capture.mjs --routes routes.txt --base https://my-design.vercel.app --out ./capture/design --behaviors

# Map Tailwind tokens → theme.json settings, plus the .dark palette as a style variation
node skills/wp-v0-to-block-theme/scripts/tokens.mjs app/globals.css --out ./theme-settings.json --dark-out ./styles/dark.json

# Capture the WordPress rebuild with the same routes, then run the parity gate (exit 0 = pass)
node skills/wp-v0-to-block-theme/scripts/capture.mjs --routes routes.txt --base http://mysite.test --out ./capture/local
node skills/wp-v0-to-block-theme/scripts/compare.mjs ./capture/design ./capture/local
```

Pass `--help` to any script for the full flag list. `capture.mjs` and `compare.mjs` require Playwright (`npx playwright install chromium`); `tokens.mjs` has no dependencies and does no network I/O.

---

## What's Inside

```
wp-v0-to-block-theme/
├── install.sh
├── uninstall.sh
├── README.md                         ← you are here
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── wp-v0-to-block-theme/
        ├── SKILL.md                  ← the nine-step workflow
        ├── references/
        │   ├── tokens-mapping.md         ← Tailwind → theme.json map, fonts, fluid type, dark-mode variation
        │   ├── shadcn-to-core-blocks.md  ← shadcn/ui → core blocks, layout/form/icon recipes, block styles
        │   ├── section-to-pattern.md     ← route map, segmentation, patterns, images, content, bindings
        │   ├── interactivity-recipes.md  ← Interactivity API widget recipes + directive reference
        │   └── parity-pitfalls.md        ← parity gates and named failure modes
        └── scripts/
            ├── capture.mjs           ← Playwright capture of the design or the rebuild
            ├── tokens.mjs            ← Tailwind → theme.json settings
            └── compare.mjs           ← design vs rebuild parity gate
```

The skill composes with the other WordPress skills — `wp-block-themes`, `wp-patterns`, `wp-block-development`, `wp-interactivity-api` — when they are installed, delegating scaffolding, pattern, and interactivity depth to them.

### Scope of the references

The references hold only what holds for any v0 design: how v0, Tailwind, shadcn/ui and lucide output behaves, and how WordPress core behaves. A single design's choices, such as its link styling, surface colors or layout quirks, do not belong here. The capture measures them for each design, and each project's `CONVERSION-NOTES.md` records them.

---

## License

[MIT](../LICENSE)
