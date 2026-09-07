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

The skill auto-triggers on v0 → WordPress theme requests and runs a seven-step flow: capture → tokens → scaffold → layout → patterns → interactivity → verify.

### Scripts

The skill ships two helper scripts (used automatically, or run by hand):

```bash
# Capture a deployed design (needs Playwright)
node skills/wp-v0-to-block-theme/scripts/capture.mjs <url> --out ./capture

# Map Tailwind tokens → theme.json settings (Tailwind v4 @theme CSS or v3 JS config)
node skills/wp-v0-to-block-theme/scripts/tokens.mjs <tailwind.config.js | globals.css>
```

`capture.mjs` requires Playwright (`npx playwright install chromium`). `tokens.mjs` has no dependencies and does no network I/O.

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
        ├── SKILL.md                  ← the seven-step workflow
        ├── references/
        │   ├── tokens-mapping.md     ← Tailwind → theme.json map
        │   ├── shadcn-to-core-blocks.md
        │   ├── section-to-pattern.md
        │   ├── interactivity-recipes.md
        │   └── parity-pitfalls.md    ← per-section parity checklist
        └── scripts/
            ├── capture.mjs           ← Playwright design capture
            └── tokens.mjs            ← Tailwind → theme.json settings
```

The skill composes with the other WordPress skills — `wp-block-themes`, `wp-patterns`, `wp-block-development`, `wp-interactivity-api` — when they are installed, delegating scaffolding, pattern, and interactivity depth to them.
