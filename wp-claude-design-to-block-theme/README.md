# wp-claude-design-to-block-theme

Part of [wp-skills](../README.md) — Claude Code skills for WordPress developers (including the React surfaces of the WP ecosystem).

A Claude Code skill that turns a **Claude design** — a Claude Design canvas or an HTML artifact — into a **WordPress block theme (FSE)**. It unbundles a downloaded canvas into one page per artboard, maps artboards to routes, and reads tokens, links and behavior from the canvas source. The rebuild then follows the [wp-design-to-block-theme](../wp-design-to-block-theme) workflow: capture, tokens, patterns, templates, Interactivity API blocks, and a parity gate.

**Requires [wp-design-to-block-theme](../wp-design-to-block-theme).** Install both.

---

## Installation

### Via Claude Code plugin marketplace (recommended)

```
/plugin marketplace add s3rgiosan/wp-skills
/plugin install wp-design-to-block-theme@s3rgiosan-wp-skills
/plugin install wp-claude-design-to-block-theme@s3rgiosan-wp-skills
```

Or wire both into `settings.json` under `enabledPlugins` (see the [root README](../README.md#install-via-claude-code-plugin-marketplace-recommended) for the full snippet).

### Via shell script (fallback)

```bash
git clone https://github.com/s3rgiosan/wp-skills.git
cd wp-skills

# Default → ~/.claude
bash wp-design-to-block-theme/install.sh
bash wp-claude-design-to-block-theme/install.sh

# Custom Claude config dir (override via env var)
CLAUDE_CONFIG_DIR=~/.some-other-dir bash wp-design-to-block-theme/install.sh
CLAUDE_CONFIG_DIR=~/.some-other-dir bash wp-claude-design-to-block-theme/install.sh
```

Uninstall:

```bash
bash wp-claude-design-to-block-theme/uninstall.sh                              # → ~/.claude
CLAUDE_CONFIG_DIR=~/.some-other-dir bash wp-claude-design-to-block-theme/uninstall.sh # → custom dir
```

---

## Usage

Download the canvas (Share › Export as HTML), keep its `claude.ai/artifact/…` link to hand, and ask naturally:

```
"Turn this Claude Design canvas into a block theme: ~/Downloads/Acme Site.html"
"Build the WordPress theme from this design: https://claude.ai/artifact/…"
"Convert this HTML artifact into an FSE theme."
```

### Scripts

```bash
# Split a downloaded canvas into one standalone page per artboard (+ routes.txt, boards.json)
node skills/wp-claude-design-to-block-theme/scripts/unbundle.mjs "Acme Site.html" --out ./design/pages

# Capture the pages and derive tokens with the core scripts (Playwright installed in the current folder)
node ../wp-design-to-block-theme/skills/wp-design-to-block-theme/scripts/capture.mjs --routes ./design/pages/routes.txt --base ./design/pages --out ./capture/design --behaviors
node ../wp-design-to-block-theme/skills/wp-design-to-block-theme/scripts/css-tokens.mjs ./capture/design --out ./theme-tokens.json --report ./tokens-report.json
```

`unbundle.mjs` has no dependencies and does no network I/O; it reads the export as data and writes only into `--out`.

---

## What's Inside

```
wp-claude-design-to-block-theme/
├── install.sh
├── uninstall.sh
├── README.md                         ← you are here
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── wp-claude-design-to-block-theme/
        ├── SKILL.md                  ← Claude inputs and deltas to the core workflow
        ├── references/
        │   └── claude-design-input.md    ← canvas export, canvas.json, .dc.html anatomy, HTML artifacts, token sources
        └── scripts/
            └── unbundle.mjs          ← canvas export → one page per artboard
```

### Scope of the references

The references describe the Claude design formats only. A single design's choices belong in its project's `CONVERSION-NOTES.md`.

---

## License

[MIT](../LICENSE)
