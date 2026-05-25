---
name: wp-plugin-code-audit
description: >
  Use when auditing a WordPress plugin for security, performance, coding
  standards, and WordPress.org guidelines compliance. Triggers: "audit this
  plugin", "review the plugin", "is this plugin secure", "code audit", "security
  review", "plugin code review", "is this plugin safe to install", "check this
  plugin for vulnerabilities", "review plugin for performance", or any request
  to evaluate the quality / safety of a WordPress plugin from a local checkout,
  a single file/function, or a remote source (wp.org slug, GitHub URL).
---

# WordPress Plugin Code Audit

Opinionated, verification-first audit workflow for WordPress plugins. Produces a markdown report with findings sorted by risk, a fix recommendation per finding, and a final **GO / NO-GO / GO WITH FIXES** verdict.

> **Scope:** WordPress plugins — local checkout (directory path), targeted file / function, or remote (wp.org slug, GitHub URL). Not themes. Not bulk repo sweeps — one plugin at a time.

> **Verification discipline:** every finding written to the report must be verified against source. Pattern matchers and subagents over-flag SQLi, missing nonces, and missing escapes. See `references/false-positive-traps.md` before reporting any of those categories.

---

## When To Use This Skill

- Reviewing a third-party plugin before installing it on a production site.
- Auditing your own plugin before a release (or before a WordPress.org submission).
- Reviewing a feature branch where someone added or substantially changed a plugin.
- Security sweep after a client reports something feels off.
- Spot-check on a single suspicious file or function.

If the goal is "is this safe / good enough / mergeable", this is the right reference.

---

## Phases (Always In Order)

1. **Discover** — identify plugin shape (size, architecture, dependencies, surfaces).
2. **Tool scan** — run PHPCS+WPCS, PHPStan, Plugin Check if available; collect raw findings.
3. **Manual read** — read entry file, hooks, REST routes, AJAX, admin pages, DB queries, file ops, CLI. Tools miss intent.
4. **Verify** — every candidate finding traced through source. No unverified findings in the report.
5. **Report** — write `AUDIT.md` with severity-sorted findings, fix per finding, verdict.

Skipping phase 4 is how false positives ship and erode trust. Don't.

---

## 1. Discover

Before reading code, scope the plugin. Write the scope inline at the top of the report — sets reader expectations.

```bash
# Plugin entry, version, requires
head -40 plugin-name.php
grep -RhE "^\s*\*?\s*(Plugin Name|Version|Requires at least|Requires PHP|License|Text Domain):" --include="*.php" .

# Surface area
find . -type f -name "*.php" -not -path "*/vendor/*" -not -path "*/node_modules/*" | wc -l
find . -name "block.json"
grep -RlE "register_rest_route" --include="*.php" .
grep -RlE "add_action\(\s*['\"]wp_ajax_" --include="*.php" .
grep -RlE "(WP_CLI::add_command|add_command\()" --include="*.php" .
grep -RlE "register_(activation|deactivation|uninstall)_hook" --include="*.php" .
grep -RlE "(add_menu_page|add_options_page|add_submenu_page)" --include="*.php" .

# Dependencies
test -f composer.json && jq '.require, .["require-dev"]' composer.json
test -f package.json && jq '.dependencies, .devDependencies' package.json

# Source vs build artifacts
test -d vendor && echo "vendor/ shipped (audit included)"
test -d dist && echo "dist/ shipped (likely build output — audit source if available)"
```

For remote audits (wp.org slug, GitHub URL): `references/remote-fetch.md`.

---

## 2. Tool scan

Run what's available; don't block on absence. Pure-read fallback works.

| Tool | Command | Catches |
|---|---|---|
| **PHPCS + WPCS** | `phpcs --standard=WordPress,WordPress-VIP-Go path/` | Standards, common security smells, escape/sanitize hints |
| **PHPStan** | `phpstan analyse --level=5 path/` | Type bugs, null derefs, undefined vars |
| **Plugin Check** | `wp plugin check <slug>` | wp.org reviewer rules; closest to official approval criteria |
| **Composer audit** | `composer audit` (in plugin dir) | Known CVEs in PHP deps |
| **npm audit** | `npm audit --omit=dev` | Known CVEs in JS deps (skip if `dist/` is not built from source) |

Capture output to `/tmp/audit-<slug>/`. Reference findings by tool + rule code in the report (e.g. `[WPCS WordPress.Security.EscapeOutput.OutputNotEscaped]`).

Details + interpretation: `references/tooling.md`.

> Tools generate **candidates**, not findings. A WPCS warning is a hint to look — not a confirmed bug. Verify (phase 4) before reporting.

---

## 3. Manual read

Tools catch patterns; people catch intent. Read in this order:

1. **Main plugin file** — header, constants, autoloader, hook registrations.
2. **Activation / deactivation / uninstall hooks** — DB schema, options, capabilities, cron unscheduling.
3. **REST routes** — every `register_rest_route`. Inspect `permission_callback`, argument validation (`args`), response shape (does it leak meta?).
4. **AJAX handlers** — every `wp_ajax_*` and `wp_ajax_nopriv_*`. Capability + nonce + sanitization.
5. **Admin pages + form handlers** — Settings API or hand-rolled? Nonces, caps, `register_setting()` sanitize callbacks.
6. **DB queries** — every `$wpdb->query`, `->get_results`, `->get_var`, `->prepare`, `->insert`, `->update`, `->delete`. Trace inputs.
7. **File ops** — `file_get_contents`, `file_put_contents`, `fopen`, `unlink`, `move_uploaded_file`, `wp_handle_upload`, `wp_upload_bits`. Path traversal? Extension whitelist?
8. **HTTP egress** — `wp_remote_*`. SSRF if URL is user-controlled.
9. **Deserialization** — `unserialize`, `maybe_unserialize` on user-controllable or low-trust stored data → object injection.
10. **Capability checks** — every `current_user_can`. Missing? Wrong cap (`read` instead of `manage_options`)?
11. **i18n** — translation functions used? Text domain matches plugin slug? Late-init load (post `init`)?
12. **Cron** — `wp_schedule_event` registrations. Cleared in deactivation? Hook callback registered before scheduling?

Apply the four checklists:

- `references/security-checklist.md` — auth, nonces, caps, sanitize, escape, SQLi, CSRF, SSRF, file ops, deserialization, secrets in code, allowlist patterns.
- `references/performance-checklist.md` — autoloaded options, expensive queries, missing indexes, transients without TTL, cache-thrashing hooks, cron storms, enqueue scope, asset weight.
- `references/standards-checklist.md` — WPCS rules, function/class prefixing, i18n, deprecated APIs, plugin header completeness, GPL compatibility.
- `references/false-positive-traps.md` — verification procedures for SQLi / nonce / escape / sanitize before flagging.

---

## 4. Verify (mandatory)

For every candidate finding, before adding to the report, run the verification procedure for its category:

| Candidate | Verification |
|---|---|
| **SQL injection** | Trace the input. Is it `$wpdb->prepare()`'d? `esc_sql()`'d? Whitelisted via `post_type_exists` / `in_array` against a static list? If yes → not exploitable. Note as "fragile, not exploitable" only if a refactor would break the guard. |
| **Missing nonce** | Is the endpoint admin-only with a real capability gate (`manage_options`, not `read`)? Is it a REST route with cookie auth + meaningful `permission_callback`? Verify the threat model before flagging. |
| **Missing escape** | Confirm the output context (HTML body / attr / URL / JS / CSS). Confirm the value isn't already escaped upstream. Wrong-escape ≠ missing-escape. |
| **Missing sanitize** | Trace the value to its sink. Sanitization for storage ≠ sanitization for output. Storage sanitization matters when input shape matters or when the sink later doesn't escape. |

If verification fails, **drop the finding**. Note in the report's appendix: "Verified false: <pattern>, <reason>" — this saves the next auditor's time and shows your work.

This phase exists because subagents and pattern scanners over-flag in WP. Real audit: a subagent flagged `PostToPost.php:67` as IN-clause SQLi; verified false (`post_type_exists()` in ctor + `esc_sql()` applied). Always re-run findings against source.

Full traps + procedures: `references/false-positive-traps.md`.

---

## 5. Report

Write to `AUDIT.md` in CWD (or path the user specifies). Inline summary in chat: verdict + counts + top-3-to-fix.

Minimum report skeleton (full template + worked examples: `references/report-template.md`):

```markdown
# Audit: <plugin-name> <version>

**Verdict:** GO / NO-GO / GO WITH FIXES
**Counts:** <C> critical, <H> high, <M> medium, <L> low, <I> info
**Top 3 to fix first:**
1. ...
2. ...
3. ...

## Scope
- Path / source: ...
- LOC: ... PHP, ... JS
- Surface: REST endpoints (N), AJAX handlers (N), admin pages (N), CLI commands (N), blocks (N)
- Dependencies (PHP): ...
- Dependencies (JS): ...
- Tools run: PHPCS (yes/no), PHPStan (yes/no), Plugin Check (yes/no)

## Critical
- **`file.php:line` — short title.** Description with the trace through source.
  Why it's exploitable / what breaks.
  *Fix:* concrete change.

## High
...same format...

## Medium
...same format...

## Low
...same format...

## Info
...same format...

## Verified false (appendix)
- `file.php:line` — pattern that looked like X but isn't because Y.

## Tooling output
- PHPCS: `/tmp/audit-<slug>/phpcs.txt` (N errors, N warnings)
- PHPStan: `/tmp/audit-<slug>/phpstan.txt` (level 5, N errors)
- Plugin Check: `/tmp/audit-<slug>/plugin-check.txt` (N issues)
```

---

## Severity Rubric

| Severity | Rule of thumb | Examples |
|---|---|---|
| **Critical** | Exploitable from the network with low / no privilege; remote code execution; auth bypass; data loss. | Unauthenticated SQLi; arbitrary file upload via REST; `eval()` on user input; auth bypass on admin action; arbitrary file read via path traversal. |
| **High** | Exploitable with auth but below the privilege required for the impact; data integrity; CSRF on destructive admin actions; persistent XSS by editor+; sensitive info disclosure; missing activation hook (data loss). | Subscriber-readable user/post enumeration; capability check missing on settings save; deserialization on stored user-controlled meta; missing nonce on destructive admin-ajax. |
| **Medium** | Reliability / fragility / hardening; functionally exploitable only in narrow scenarios. | Query builder counter desync; SQL builder fragile under refactor; transient with no TTL; option `autoload=yes` for large blob; reflected XSS only in admin-self context. |
| **Low** | Code smell with no realistic exploit path; standards violations that don't change behavior; cosmetic. | Hardcoded table names; non-prefixed names that don't currently collide; missing `wp_set_script_translations` despite shipped `.pot`. |
| **Info** | Observations / suggestions; not bugs. | "No PHPStan config"; "uninstall hook leaves tables — acceptable; document". |

---

## Verdict Rules

| Findings | Verdict |
|---|---|
| Any **Critical** | **NO-GO** |
| ≥3 **High**, OR any High that's network-exploitable with low privilege | **NO-GO** |
| 1–2 **High** + Medium / Low | **GO WITH FIXES** (Highs become top-3-to-fix-first) |
| 0 High, only Medium / Low, total > 5 | **GO WITH FIXES** |
| 0 High, 0 Medium, or total ≤ 5 with no High | **GO** |

State the verdict + two-sentence reasoning. Reader should know why.

---

## Anti-patterns

- **"PHPCS says missing escape, must be a bug."** PHPCS flags patterns. Verify context first.
- **Listing every PHPCS warning as a finding.** PHPCS finds candidates, not findings. Filter aggressively.
- **Skipping the verify phase under time pressure.** A false-positive-laden report trains people to ignore audits.
- **Hand-waving "looks fine" without reading hook callbacks.** Hooks are where the bugs live.
- **Reporting on the build output (`dist/`).** Audit source. Note when source isn't shipped (then audit the build, downgrade confidence).
- **No verdict.** Every audit ends in GO / NO-GO / GO WITH FIXES. "It depends" is not a verdict.
- **Top-3-to-fix-first list missing or has 7 items.** Three. Force prioritization.

---

## References

- `references/security-checklist.md` — security audit categories with detection patterns + verification procedures.
- `references/performance-checklist.md` — performance audit categories.
- `references/standards-checklist.md` — WPCS + WordPress.org plugin guidelines.
- `references/false-positive-traps.md` — verification procedures for SQLi, nonce, escape, sanitize.
- `references/report-template.md` — full `AUDIT.md` template with worked examples.
- `references/tooling.md` — PHPCS / PHPStan / Plugin Check commands + interpretation.
- `references/remote-fetch.md` — fetching plugins from wp.org slug or GitHub URL.

---

## Related skills

- `wp-plugin-development` — building plugins (forward-looking patterns the audit checks for).
- `wp-plugin-directory-guidelines` — wp.org submission rules (used in the standards checklist).
- `wp-phpstan` — PHPStan setup for WP projects (deepens the static analysis step).
- `wp-performance` — performance investigation when audit findings need deeper triage.
- `wp-project-triage` / `10up-project-triage` — repo-shape inspection (useful in Discover phase).
