# wp-plugin-code-audit

Part of [wp-skills](../README.md) — Claude Code skills for WordPress developers.

A Claude Code skill that runs an opinionated, verification-first audit of a WordPress plugin and produces a markdown report with severity-sorted findings, fix recommendations, a collected list of `[DECISION]` questions only the plugin's owner can answer, and a final **GO / NO-GO / GO WITH FIXES** verdict.

Covers security, performance, WordPress coding standards, WordPress.org Plugin Directory guidelines, and cross-plugin integration. Works against a local plugin directory, a single file / function, or a remote source (wp.org slug, GitHub URL).

---

## Installation

### Via Claude Code plugin marketplace (recommended)

```
/plugin marketplace add s3rgiosan/wp-skills
/plugin install wp-plugin-code-audit@s3rgiosan-wp-skills
```

Or wire `wp-plugin-code-audit@s3rgiosan-wp-skills` into `settings.json` under `enabledPlugins` (see the [root README](../README.md#install-via-claude-code-plugin-marketplace-recommended) for the full snippet).

### Via shell script (fallback)

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

The skill runs a six-phase audit (one optional):

1. **Discover** — scope plugin (size, surfaces, dependencies).
2. **Tool scan** — run PHPCS+WPCS, PHPStan, Plugin Check, Composer/npm audit if available.
3. **Manual read** — read main file, hooks, REST routes, AJAX, admin pages, DB queries, file ops.
4. **Verify** — every candidate finding traced through source before being written.
5. **Reproduce** *(optional)* — where an environment is available, build the smallest fixture that triggers the top findings and capture before/after; put the recipe in the report. Skipped cleanly when read-only.
6. **Report** — write a dated `AUDIT-<yyyy-mm-dd>.md` with Critical / High / Medium / Low / Info findings + verdict.

Outputs a dated `AUDIT-<yyyy-mm-dd>.md` file (it asks where to write it — defaulting to a non-public location like `.claude/` so vulnerability details don't get committed to a public repo, and keeping a per-day history) plus a short inline summary in chat (verdict + counts + top-3-to-fix).

---

## What the report looks like

````markdown
# Audit: acme-forms 2.1.0

## TL;DR

**Overall:** Safe to keep running once two problems are fixed; neither needs the site taken offline.

**What needs attention now**
- Anyone on the internet, without logging in, can read draft form submissions.
- A settings screen can be changed by tricking a logged-in administrator into clicking a crafted link.

**What is in good shape**
- Form data is stored and read safely: no way was found to inject database commands.

**Recommended next steps**
1. Restrict the submissions endpoint to users who can edit forms.
2. Add the missing request check to the settings screen.

**At a glance:** 0 critical · 2 high · 3 medium · 1 low · 1 info; the two most serious issues are in the submissions endpoint and the settings screen.

**Verdict:** GO WITH FIXES
**Counts:** 🔴 0 critical · 🟠 2 high · 🟡 3 medium · 🟢 1 low · ⚪ 1 info
**Top 3 to fix first:**
1. `includes/rest/Submissions.php:46` — unauthenticated endpoint returns draft form submissions
2. `includes/Settings.php:60` — settings save has no nonce check
3. `includes/Helpers.php:109` — request-scoped static cache never invalidated

## Summary

| Finding | Area | Category | Recommendation | Priority |
|---|---|---|---|---|
| H1 · Unauthenticated submissions endpoint | REST | security | Require `edit_posts` in the route's `permission_callback` | High |
| H2 · Settings save missing nonce | admin | security | Add `check_admin_referer()` | High |
| M1 · Uncached query on every page load | front end | performance | Cache the result in a transient | Medium |

## Scope
- LOC: 4,200 PHP, 1,100 JS
- Surface: REST endpoints (3), AJAX handlers (5), admin pages (2), CLI (0), blocks (1)
- Tools run: PHPCS (yes), PHPStan level 5 (yes), Plugin Check (no — no WP install)

...

## Findings

### 🟠 HIGH — H1: `includes/rest/Submissions.php:46` — Unauthenticated endpoint returns draft form submissions
**Description.** ...trace through source...
**Verified.** Read Submissions.php:42–87. permission_callback is __return_true...
**Fix.**
```php
'permission_callback' => fn() => current_user_can( 'edit_posts' ),
```

### 🟡 MEDIUM — M1: ...
...

## Verified false (appendix)
- `Helpers/Query.php:67` — IN clause looked like SQLi; verified false (post_type_exists()
  guard + esc_sql()). Logged as Medium for fragility instead.
````

---

## What's in the skill

| File | Covers |
|---|---|
| **`SKILL.md`** | Audit phases, severity rubric, verdict rules, report section order |
| **`references/security-checklist.md`** | Auth, nonces, capabilities, sanitize, escape, SQLi, file ops, SSRF, deserialization, secrets |
| **`references/performance-checklist.md`** | Autoloaded options, queries, transients, cron, HTTP API, asset enqueue, custom tables |
| **`references/standards-checklist.md`** | WPCS rules, prefixing, i18n, plugin header, GPL, wp.org guidelines |
| **`references/integration-checklist.md`** | Cross-plugin coupling (companions writing shared data via direct SQL, stored foreign IDs, hook races, cache staleness) + WooCommerce HPOS / Cart-Checkout-Blocks declarations — conditional |
| **`references/false-positive-traps.md`** | Verification procedures for the 4 most over-flagged categories (SQLi, nonce, escape, sanitize) |
| **`references/report-template.md`** | Full `AUDIT-<yyyy-mm-dd>.md` template + worked examples |
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
