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

The skill runs a 12-phase analysis:

1. Identify plugin source (local path or GitHub URL).
2. Identify main plugin file + metadata.
3. Map architecture (classes, namespaces, autoloading).
4. Trace bootstrap + initialization.
5. Catalog hooks (registered, exposed, removed).
6. Map data structures (CPTs, meta, options, DB tables).
7. Map REST routes + AJAX handlers.
8. Map admin / frontend UI surfaces.
9. Identify execution flows per feature (trigger → processing → output).
10. Identify third-party integrations.
11. Identify extensibility patterns + extension points.
12. Synthesize practical examples for extending the plugin.

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
    ├── install.sh
    ├── uninstall.sh
    ├── README.md                         ← you are here
    └── .claude/
        └── skills/
            └── wp-mnemon/
                ├── SKILL.md              ← 12-phase deep analysis instructions
                └── scripts/
                    ├── scan_hooks.sh     ← grep all hook patterns (local plugins)
                    ├── scan_data.sh      ← grep CPTs, meta, options, DB (local plugins)
                    └── scan_classes.sh   ← grep class architecture (local plugins)
```

---

## Pairing with the subagent

The [wp-mnemon subagent](https://github.com/s3rgiosan/wp-agents/tree/main/wp-mnemon) (in the companion `wp-agents` repo) consumes this skill and persists results to `~/.claude/agent-memory/wp-mnemon/plugins/{slug}/`. Use the subagent when you want analysis available across future Claude sessions; use the skill directly when you want a one-shot read.

---

## License

[MIT](../LICENSE)
