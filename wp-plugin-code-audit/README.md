# wp-plugin-code-audit

Part of [wp-skills](../README.md) — Claude Code skills for WordPress developers.

A Claude Code skill that runs an opinionated, verification-first audit of a WordPress plugin and produces a markdown report with severity-sorted findings, fix recommendations, and a final **GO / NO-GO / GO WITH FIXES** verdict.

Covers security, performance, WordPress coding standards, and WordPress.org Plugin Directory guidelines. Works against a local plugin directory, a single file / function, or a remote source (wp.org slug, GitHub URL).

---

## Installation

```bash
git clone https://github.com/s3rgiosan/wp-skills.git
cd wp-skills/wp-plugin-code-audit

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

Open any Claude Code session and ask naturally:

```
"Audit this plugin for security issues."
"Is this plugin safe to install on production?"
"Code review the plugin at ./wp-content/plugins/foo — full audit."
"Review the akismet plugin from wp.org — full audit."
"Audit https://github.com/author/wp-plugin at tag v1.2.3."
"Spot check this function for SQLi — feels off."
"Performance review of this plugin before we ship."
```

The skill runs a five-phase audit:

1. **Discover** — scope plugin (size, surfaces, dependencies).
2. **Tool scan** — run PHPCS+WPCS, PHPStan, Plugin Check, Composer/npm audit if available.
3. **Manual read** — read main file, hooks, REST routes, AJAX, admin pages, DB queries, file ops.
4. **Verify** — every candidate finding traced through source before being written.
5. **Report** — write `AUDIT.md` with Critical / High / Medium / Low / Info findings + verdict.

Outputs an `AUDIT.md` file plus a short inline summary in chat (verdict + counts + top-3-to-fix).

---

## What the report looks like

````markdown
# Audit: my-plugin 1.2.3

**Verdict:** GO WITH FIXES
**Counts:** 0 critical, 2 high, 4 medium, 3 low, 2 info
**Top 3 to fix first:**
1. `includes/rest/Search.php:46` — unauthenticated search leaks private titles
2. `plugin.php:60` — no activation hook; tables never created on frontend-only sites
3. `includes/Helpers.php:109` — request-scoped static cache never invalidated

## Scope
- LOC: 4,200 PHP, 1,100 JS
- Surface: REST endpoints (3), AJAX handlers (5), admin pages (2), CLI (0), blocks (1)
- Tools run: PHPCS (yes), PHPStan level 5 (yes), Plugin Check (no — no WP install)

## High
### H-1. `includes/rest/Search.php:46` — Unauthenticated search returns private post titles
**Description.** ...trace through source...
**Verified.** Read Search.php:42–87. permission_callback is __return_true...
**Fix.**
```php
'permission_callback' => fn() => current_user_can( 'edit_posts' ),
```

## Medium
...

## Verified false (appendix)
- `Helpers/Query.php:67` — IN clause looked like SQLi; verified false (post_type_exists()
  guard + esc_sql()). Logged as Medium for fragility instead.
````

---

## What's in the skill

| File | Covers |
|---|---|
| **`SKILL.md`** | Audit phases, severity rubric, verdict rules, report skeleton |
| **`references/security-checklist.md`** | Auth, nonces, capabilities, sanitize, escape, SQLi, file ops, SSRF, deserialization, secrets |
| **`references/performance-checklist.md`** | Autoloaded options, queries, transients, cron, HTTP API, asset enqueue, custom tables |
| **`references/standards-checklist.md`** | WPCS rules, prefixing, i18n, plugin header, GPL, wp.org guidelines |
| **`references/false-positive-traps.md`** | Verification procedures for the 4 most over-flagged categories (SQLi, nonce, escape, sanitize) |
| **`references/report-template.md`** | Full `AUDIT.md` template + worked examples |
| **`references/tooling.md`** | PHPCS / PHPStan / Plugin Check / Composer audit / npm audit |
| **`references/remote-fetch.md`** | Fetching plugins from wp.org slug or GitHub URL (with reproducibility metadata) |

---

## Philosophy

**Verification before claims.** Every finding in the report has a trace through source. Subagents and pattern matchers over-flag SQLi, missing nonces, and missing escapes — `false-positive-traps.md` gives explicit verification procedures for each category. False positives in security reports are worse than no report: they train people to ignore audits.

**Every audit ends with a verdict.** GO / NO-GO / GO WITH FIXES. "It depends" is not a verdict. The rubric is in `SKILL.md`; the reader knows the rule even when they disagree with the call.

**Top 3 to fix first.** Force prioritization. A report with 15 findings and no priority list ships nothing. Three named items, in the inline summary and at the top of the file.

---

## Related skills

- `wp-plugin-development` — building plugins (the forward-looking patterns the audit checks for).
- `wp-plugin-directory-guidelines` — wp.org submission rules.
- `wp-phpstan` — PHPStan setup for WP projects.
- `wp-performance` — when performance findings need deeper triage.

---

## License

[MIT](../LICENSE)
