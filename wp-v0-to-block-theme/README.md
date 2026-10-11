# wp-v0-to-block-theme

Part of [wp-skills](../README.md) — Claude Code skills for WordPress developers (including the React surfaces of the WP ecosystem).

A Claude Code skill that translates a **v0 (Vercel)** design — React/Next + Tailwind + shadcn/ui — into a **WordPress block theme (FSE)**. There is no automatic converter: React components never port directly, so the skill splits the work into the mechanical parts it automates (capturing the rendered design, mapping Tailwind tokens to `theme.json`) and the judgment parts it guides (rebuilding each section as patterns, templates, and Interactivity API blocks).

**Requires [wp-design-to-block-theme](../wp-design-to-block-theme).** That skill holds the workflow, the capture, token and parity scripts, and the rebuild references; this one adds the Tailwind token mapping and the shadcn/ui component map. Install both.

---

## Installation

### Via Claude Code plugin marketplace (recommended)

```
/plugin marketplace add s3rgiosan/wp-skills
/plugin install wp-design-to-block-theme@s3rgiosan-wp-skills
/plugin install wp-v0-to-block-theme@s3rgiosan-wp-skills
```

Or wire `wp-design-to-block-theme@s3rgiosan-wp-skills` and `wp-v0-to-block-theme@s3rgiosan-wp-skills` into `settings.json` under `enabledPlugins` (see the [root README](../README.md#install-via-claude-code-plugin-marketplace-recommended) for the full snippet).

### Via shell script (fallback)

```bash
git clone https://github.com/s3rgiosan/wp-skills.git
cd wp-skills

# Default → ~/.claude
bash wp-design-to-block-theme/install.sh
bash wp-v0-to-block-theme/install.sh

# Custom Claude config dir (override via env var)
CLAUDE_CONFIG_DIR=~/.some-other-dir bash wp-design-to-block-theme/install.sh
CLAUDE_CONFIG_DIR=~/.some-other-dir bash wp-v0-to-block-theme/install.sh
```

Uninstall:

```bash
bash wp-v0-to-block-theme/uninstall.sh                              # → ~/.claude
CLAUDE_CONFIG_DIR=~/.some-other-dir bash wp-v0-to-block-theme/uninstall.sh # → custom dir
```

---

## Usage

Open a Claude Code session with the design's downloaded code and/or its deployed preview URL to hand, and ask naturally:

```
"Turn this v0 design into a WordPress block theme: https://design.example.com"
"Convert this v0 export into an FSE theme."
"Map this Tailwind config to theme.json."
```

The skill auto-triggers on v0 → WordPress theme requests and runs the core ten-step flow (routes + capture → content model → tokens → scaffold → layout → patterns → content → interactivity → verify → handover) with the v0 deltas.

### Scripts

The skill ships `tokens.mjs`; capture and parity run with the core scripts:

```bash
# Map Tailwind tokens → theme.json settings, plus the .dark palette as a style variation
node skills/wp-v0-to-block-theme/scripts/tokens.mjs app/globals.css --out ./theme-settings.json --dark-out ./styles/dark.json

# Capture the design (deployed, or a local `npm run dev`), then the rebuild, then the parity gate (core scripts)
node ../wp-design-to-block-theme/skills/wp-design-to-block-theme/scripts/capture.mjs --routes routes.txt --base https://design.example.com --out ./capture/design --behaviors
node ../wp-design-to-block-theme/skills/wp-design-to-block-theme/scripts/capture.mjs --routes routes.txt --base http://mysite.test --out ./capture/local
node ../wp-design-to-block-theme/skills/wp-design-to-block-theme/scripts/compare.mjs ./capture/design ./capture/local
```

Pass `--help` to any script for the full flag list. `tokens.mjs` has no dependencies and does no network I/O.

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
        ├── SKILL.md                  ← v0 inputs and deltas to the core workflow
        ├── references/
        │   ├── tailwind-tokens.md        ← Tailwind/shadcn tokens → theme.json, next/font, .dark variation
        │   └── shadcn-to-core-blocks.md  ← shadcn/ui → core blocks
        └── scripts/
            └── tokens.mjs            ← Tailwind → theme.json settings
```

The skill composes with the other WordPress skills — `wp-block-themes`, `wp-patterns`, `wp-block-development`, `wp-interactivity-api` — when they are installed, delegating scaffolding, pattern, and interactivity depth to them.

### Scope of the references

The references hold only what holds for any v0 design: how v0, Tailwind, shadcn/ui and lucide output behaves. WordPress core behavior lives in the core skill's references. A single design's choices, such as its link styling, surface colors or layout quirks, do not belong here. The capture measures them for each design, and each project's `CONVERSION-NOTES.md` records them.

---

## License

[MIT](../LICENSE)
