# wp-mnemon

> *Mnemon (μνήμων) — ancient Greek for "one who remembers". A keeper of knowledge.*

Part of [wp-skills](../README.md) — Claude Code skills for WordPress developers.

A Claude Code skill that runs a deep architectural analysis of a WordPress plugin — what it does, how it works, what triggers what, and how data flows through the system. Produces structured documentation across multiple files (overview, architecture, hooks, data, extending).

Paired with the [wp-mnemon subagent](https://github.com/s3rgiosan/wp-agents/tree/main/wp-mnemon) in `wp-agents`, which uses this skill and writes the documentation into Claude's persistent agent memory. The skill itself works standalone in any Claude Code session — invoke it manually when you want a one-shot plugin analysis without persisting to agent memory.

---

## Installation

### Via Claude Code plugin marketplace (recommended)

```
/plugin marketplace add s3rgiosan/wp-skills
/plugin install wp-mnemon@s3rgiosan-wp-skills
```

Or wire `wp-mnemon@s3rgiosan-wp-skills` into `settings.json` under `enabledPlugins` (see the [root README](../README.md#install-via-claude-code-plugin-marketplace-recommended) for the full snippet).

### Via shell script (fallback)

```bash
git clone https://github.com/s3rgiosan/wp-skills.git
cd wp-skills/wp-mnemon

# Default → ~/.claude
bash install.sh

# Custom Claude config dir (override via env var)
CLAUDE_CONFIG_DIR=~/.some-other-dir bash install.sh
```

Uninstall:

```bash
bash uninstall.sh                                       # → ~/.claude
CLAUDE_CONFIG_DIR=~/.some-other-dir bash uninstall.sh   # → custom dir
```

> If you have the `wp-mnemon` subagent from `wp-agents` installed, install this skill **first** — the agent depends on it.

---

## Usage

Open any Claude Code session and ask naturally:

```
"Analyze the WordPress plugin at /var/www/html/wp-content/plugins/my-plugin"
"Analyze https://github.com/woocommerce/woocommerce"
"Walk me through how this plugin bootstraps and what hooks it fires."
```

The skill runs a 13-phase analysis:

0. Determine source — local path or GitHub URL (with API access for the latter).
1. Identify the plugin — main file, header metadata, constants, stated purpose.
2. Map the file structure — directory map, architectural pattern, file count.
3. Architecture & class map — namespaces, autoloading, class hierarchy, traits, singletons.
4. Bootstrap & initialization flow — load sequence through the WordPress lifecycle hooks.
5. Scan all hooks — registered, exposed, and removed actions/filters, each with context.
6. Scan data structures — CPTs, taxonomies, meta keys, options, custom DB tables, transients.
7. Scan integrations — REST API, shortcodes, blocks, WP-CLI commands, assets, cron, third-party plugins.
8. Execution flow tracing — trigger → processing → output for each major feature.
9. Admin & frontend map — admin pages, metaboxes, frontend output, user workflows.
10. Extensibility patterns — template overrides, class extension, filter/action extension points.
11. Write memory files — overview, architecture, hooks, data, and extending docs plus the memory index.
12. Confirm to user — summary of what was analyzed, where memory was written, and key stats.

Output: structured analysis split across overview / architecture / hooks / data / extending.

---

## Private GitHub repos

Pass a token at invocation time:

```
"Analyze https://github.com/myorg/my-private-plugin — token: ghp_xxx"
```

The skill uses the token in `Authorization: Bearer` for GitHub API requests.

---

## Files

```
wp-skills/
└── wp-mnemon/
    ├── .claude-plugin/
    │   └── plugin.json
    ├── install.sh
    ├── uninstall.sh
    ├── README.md                         ← you are here
    └── skills/
        └── wp-mnemon/
            ├── SKILL.md              ← 13-phase deep analysis instructions
            └── scripts/
                ├── scan_classes.sh   ← grep class architecture (local plugins)
                ├── scan_hooks.sh     ← grep all hook patterns (local plugins)
                └── scan_data.sh      ← grep CPTs, meta, options, DB (local plugins)
```

---

## Pairing with the subagent

The [wp-mnemon subagent](https://github.com/s3rgiosan/wp-agents/tree/main/wp-mnemon) (in the companion `wp-agents` repo) consumes this skill and persists results to `~/.claude/agent-memory/wp-mnemon/plugins/{slug}/`. Use the subagent when you want analysis available across future Claude sessions; use the skill directly when you want a one-shot read.

---

## License

[MIT](../LICENSE)
