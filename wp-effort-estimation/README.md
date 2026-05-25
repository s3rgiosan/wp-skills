# wp-effort-estimation

Part of [wp-skills](../README.md) — Claude Code skills for WordPress developers (including the React surfaces of the WP ecosystem).

A Claude Code skill that produces structured effort estimates for WordPress
development tasks — and the React work that lives inside the WP context
(Gutenberg blocks, the Interactivity API, block themes, headless WP frontends).
Every estimate returns a complexity tier, hours/days midpoint, confidence range,
subtask breakdown, assumptions, and risks — ready to drop into Jira, Linear, or
a client proposal.

---

## Installation

Clone the repo and run the install script from the `wp-effort-estimation` directory:

```bash
git clone https://github.com/s3rgiosan/wp-skills.git
cd wp-skills/wp-effort-estimation

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

Open any Claude Code session and ask naturally:

```
"How long would it take to build a custom WooCommerce checkout flow?"
"Estimate: migrate a Next.js pages router app to the app router."
"Can we ship a block theme conversion in a sprint?"
"Break this ticket down and size it."
"Story points for adding a faceted search page in WP?"
```

The skill auto-triggers on effort/scope/complexity questions involving WordPress
(or React in a WP context — blocks, editor, Interactivity API, headless) and
returns output in this shape:

```
## Effort Estimate

**Task:** [one-line description]
**Stack:** WordPress / React-in-WP / Both
**Complexity Tier:** [S / M / L / XL]
**Estimate:** ~[X hours / X days]
**Confidence Range:** [low]–[high] [hours/days]

### Breakdown
| Subtask | Estimate |
...

### What's Included
...

### Risks & Unknowns
...

### Recommendations
...
```

---

## What's Inside

Stack-specific reference files with base estimates and risk multipliers:

- **WordPress** — theme work, Gutenberg blocks, plugin dev, WooCommerce,
  ACF, CPT/taxonomy, performance, migrations.
- **React (in a WP context)** — block editor components, Interactivity API stores,
  admin UIs, headless WP frontends (Next.js / Faust), state management, routing,
  data fetching from the WP REST API / WPGraphQL.

General multipliers cover greenfield vs legacy, missing designs, third-party
integrations, accessibility, tests, and i18n.

---

## Files

```
wp-skills/
└── wp-effort-estimation/
    ├── install.sh
    ├── uninstall.sh
    ├── README.md                        ← you are here
    └── .claude/
        └── skills/
            └── wp-effort-estimation/
                ├── SKILL.md             ← estimation process + output template
                └── references/
                    ├── wordpress.md     ← WP task taxonomy + risks
                    └── react.md         ← React-in-WP task taxonomy + risks
```
