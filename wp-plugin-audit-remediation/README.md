# wp-plugin-audit-remediation

Part of [wp-skills](../README.md) — Claude Code skills for WordPress developers.

A Claude Code skill for the phase **after** a plugin code audit: tracking and verifying the fixes. It maintains a remediation log (per-finding status, what changed, how it was verified, what's still owed by the owner), keeps the audit report's `file:line` citations readable as the code changes, and proves that "mechanical" changes — renames, `phpcbf` runs, refactors — actually changed no behaviour.

Companion to [wp-plugin-code-audit](../wp-plugin-code-audit). Run the audit first; use this to remediate against its report.

---

## Installation

### Via Claude Code plugin marketplace (recommended)

```
/plugin marketplace add s3rgiosan/wp-skills
/plugin install wp-plugin-audit-remediation@s3rgiosan-wp-skills
```

Or wire `wp-plugin-audit-remediation@s3rgiosan-wp-skills` into `settings.json` under `enabledPlugins` (see the [root README](../README.md#install-via-claude-code-plugin-marketplace-recommended) for the full snippet).

### Via shell script (fallback)

```bash
git clone https://github.com/s3rgiosan/wp-skills.git
cd wp-skills/wp-plugin-audit-remediation

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

---

## Usage

Open any Claude Code session, once you have an audit report, and ask naturally:

```
"The audit report is done — start a remediation log."
"Mark finding H1 fixed and verify it."
"Where are we on the audit findings?"
"Is this rename behaviour-neutral, or did it change logic?"
"Did that phpcbf run change any behaviour, or only formatting?"
"Freeze the audited version before we start fixing."
```

---

## What it does

Two rules that earn their place (both cheap, both done before the first fix):

1. **Freeze an immutable copy of the audited version** beside the report. Every `file.php:line` citation dies the moment fixing starts — a copy of exactly what was audited keeps the whole report readable for its entire life.
2. **Prove behaviour-neutrality — don't claim it.** A PHP token-stream diff (whitespace and comments excluded) turns "I only renamed things" / "it's just a formatter" into a measurement, and catches the auto-fixer that flips `==` to `===` — a behaviour change wearing formatting's clothes.

Plus the **remediation log**: a `REMEDIATION-<yyyy-mm-dd>.md` companion with one row per finding — status, what changed, how it was verified, and (for owner-blocked findings) the exact question and default. It answers "where are we?" without re-reading every finding.

| File | Covers |
|---|---|
| **`SKILL.md`** | The two rules, the remediation log, status vocabulary, handing back |
| **`references/behaviour-neutrality-check.md`** | Token-stream diff script + how to read the result (empty / rename-only / not-neutral) |
| **`references/remediation-log-template.md`** | The `REMEDIATION-<yyyy-mm-dd>.md` companion-document skeleton |

---

## Related

- [wp-plugin-code-audit](../wp-plugin-code-audit) — produces the audit report this skill remediates against.
