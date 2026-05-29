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
5. **Report** — write `AUDIT-<yyyy-mm-dd>.md` to a non-public location with severity-sorted findings, fix per finding, verdict.

Skipping phase 4 is how false positives ship and erode trust. Don't.

---

## 1. Discover

Before reading code, scope the plugin. Write the scope inline at the top of the report — sets reader expectations.

```bash
# Plugin entry, version, requires
head -40 plugin-name.php
grep -RhE "^\s*\*?\s*(Plugin Name|Version|Requires at least|Requires PHP|License|Text Domain|Update URI):" --include="*.php" .

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

### Capture distribution + update channel

Distribution shape affects severity weighting and the remediation path. Record in the report's Scope section:

| Question | How to determine |
|---|---|
| **Distribution:** wp.org / GitHub / private / commercial marketplace | Check plugin header `Update URI`, presence of `readme.txt`, GitHub remote, vendor name; ask the user if unclear. |
| **Update mechanism:** wp.org auto-updates / GitHub Updater / private updater / manual upload | wp.org slug → wp.org updates; `Update URI` set → custom updater; neither → manual. |
| **Author contact** | Plugin header `Author` / `Author URI`. Record so the report can recommend disclosure path. |
| **Audience** | Internal staff only? Multi-tenant public? Affects who the attacker realistically is. |

A private plugin with no update mechanism amplifies severity — the site owner can't auto-patch when the author ships a fix. Note this in the Scope section AND in the verdict reasoning if it changes the call.

### Skip ignored paths and dependencies

Read `.gitignore` and `.distignore` if present. **Skip their excluded paths during the scan** — auditing `tests/`, `*.md`, dev configs, or `.git/` wastes effort and adds noise.

**Skip `vendor/` and `node_modules/` by default**, even when they ship in the release. Auditing third-party dependency code is out of scope for a plugin audit unless the user explicitly asks for it (e.g. "audit the bundled dependencies too"). Audit the plugin's own code; assume deps are the upstream maintainers' responsibility.

List what you skipped in the report's Scope section ("Ignored (gitignore/distignore): …", and note `vendor/`/`node_modules/` skipped) so the reader knows the coverage boundary. If the user wants deps included, scan them and say so in Scope.

```bash
test -f .gitignore  && echo "--- .gitignore ---"  && cat .gitignore
test -f .distignore && echo "--- .distignore ---" && cat .distignore
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

Apply the four checklists. **Traverse every section of every checklist; don't skim and assume coverage.** A common audit failure is forgetting to read a reference file end-to-end and missing entire categories (secrets storage, IDOR, ABSPATH guards, error-response disclosure).

- `references/security-checklist.md` — auth, nonces, caps, **IDOR**, sanitize, escape, SQLi, CSRF, SSRF, file ops, deserialization, secrets in code, **stored credentials**, **error response & info disclosure**, **direct file access**.
- `references/performance-checklist.md` — autoloaded options, expensive queries, missing indexes, transients without TTL, cache-thrashing hooks, cron storms, enqueue scope, asset weight.
- `references/standards-checklist.md` — WPCS rules, function/class prefixing, i18n, deprecated APIs, plugin header completeness, GPL compatibility.
- `references/false-positive-traps.md` — verification procedures for SQLi / nonce / escape / sanitize before flagging.

**Traversal checklist** — before moving to phase 4, confirm you ran each detection in every section of each file. If a section produced zero candidates, note that in the report's Scope section under "Sections audited" — it shows your work and tells the reader nothing was skipped.

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

### Where to write the report

The report contains vulnerability details. **Never let it leak into a public repo by accident** — the default of writing to the project root is unsafe in a git-tracked plugin.

**Always ask the user where to write the report before writing it.** Don't silently default to the root. Offer concrete options, with the safest first:

1. **`.claude/`** (create it if missing) — the convention for "important project context", and commonly git-excluded. Recommended default.
2. **A custom path** the user gives (e.g. somewhere outside the repo).
3. **The project root (CWD)** — only after confirming it won't be committed.

Before writing to any git-tracked location, check whether the report (or `AUDIT-*.md`) is matched by `.gitignore`. If not, warn the user inline and offer to add `AUDIT-*.md` to `.gitignore` first. Skip the question only if the user already specified a path in their request.

### Filename — keep history, never overwrite

Name the report `AUDIT-<yyyy-mm-dd>.md` (e.g. `AUDIT-2026-05-29.md`). Re-audits on a later day produce a new dated file — the history is preserved for reference. If a file with today's date already exists (a second audit the same day), append a time suffix: `AUDIT-<yyyy-mm-dd>-<HHMM>.md`. **Never overwrite an existing audit report.**

Inline summary in chat: report path + verdict + counts + top-3-to-fix.

Minimum report skeleton (full template + worked examples: `references/report-template.md`):

```markdown
# Audit: <plugin-name> <version>

**Verdict:** GO / NO-GO / GO WITH FIXES
**Counts:** 🔴 <C> critical · 🟠 <H> high · 🟡 <M> medium · 🟢 <L> low · ⚪ <I> info
**Top 3 to fix first:**
1. ...
2. ...
3. ...

## Scope
- Path / source: ...
- Distribution: wp.org / GitHub / private / commercial · Update channel: ...
- Author / contact: ...
- LOC: ... PHP, ... JS
- Surface: REST endpoints (N), AJAX handlers (N), admin pages (N), CLI commands (N), blocks (N)
- Dependencies (PHP): ...
- Dependencies (JS): ...
- Tools run: PHPCS (yes/no), PHPStan (yes/no), Plugin Check (yes/no)
- Ignored (gitignore/distignore): ... · `vendor/` + `node_modules/` skipped (deps out of scope unless requested)
- Sections audited: security ✓ performance ✓ standards ✓ FP-traps ✓

## Findings

### 🔴 CRITICAL — C1: `file.php:line` — short title
Description with the trace through source. Why it's exploitable / what breaks.
*Fix:* concrete change.

### 🟠 HIGH — H1: `file.php:line` — short title
...same format...

### 🟡 MEDIUM — M1: ...
### 🟢 LOW — L1: ...
### ⚪ INFO — I1: ...

## Verified false (appendix)
- `file.php:line` — pattern that looked like X but isn't because Y.

## Recommendation
- Two-sentence verdict reasoning.
- If distribution is private and findings require an author fix: who to contact + suggested disclosure path.

## Tooling output
- PHPCS: `/tmp/audit-<slug>/phpcs.txt` (N errors, N warnings)
- PHPStan: `/tmp/audit-<slug>/phpstan.txt` (level 5, N errors)
- Plugin Check: `/tmp/audit-<slug>/plugin-check.txt` (N issues)
```

---

## Severity Rubric

Each finding in the report gets a traffic-light emoji + severity tag in its heading (e.g. `### 🔴 CRITICAL — C1: …`). The emoji is for fast scanning; the tag is the canonical level.

| Severity | Emoji | Rule of thumb | Examples |
|---|---|---|---|
| **Critical** | 🔴 | Exploitable from the network with low / no privilege; remote code execution; auth bypass; data loss; **OR** destructive / business-critical action reachable by the lowest-privilege authenticated role (Subscriber / Customer — roles auto-granted on registration or checkout on most WP sites). | Unauthenticated SQLi; arbitrary file upload via REST; `eval()` on user input; auth bypass on admin action; arbitrary file read via path traversal; **subscriber-exploitable AJAX that overwrites product catalog / generates billing documents / exports private data / sends emails on the site's behalf**; SSRF reachable by any authenticated user. |
| **High** | 🟠 | Exploitable with auth but below the privilege required for the impact; data integrity; CSRF on destructive admin actions; persistent XSS by editor+; sensitive info disclosure; missing activation hook (data loss); plaintext credential storage. | Editor-exploitable destructive action (Editor cap doesn't include `manage_options` but the action requires it); capability check missing on settings save when only admins can reach the form; deserialization on stored editor-writable meta; API keys in plaintext in `wp_options` autoloaded; missing nonce on destructive admin-ajax that already has correct cap check. |
| **Medium** | 🟡 | Reliability / fragility / hardening; functionally exploitable only in narrow scenarios. | Query builder counter desync; SQL builder fragile under refactor; transient with no TTL; option `autoload=yes` for large blob; reflected XSS only in admin-self context; hard `die()` returning plaintext from an AJAX endpoint (info disclosure + breakage). |
| **Low** | 🟢 | Code smell with no realistic exploit path; standards violations that don't change behavior; cosmetic. | Hardcoded table names; non-prefixed names that don't currently collide; missing `wp_set_script_translations` despite shipped `.pot`; integer cast missing on `$_REQUEST['id']` that goes to a function that handles non-int gracefully. |
| **Info** | ⚪ | Observations / suggestions; not bugs. | "No PHPStan config"; "uninstall hook leaves tables — acceptable; document"; "Plugin header missing optional fields". |

### Subscriber-exploitable rule (critical)

If you are tempted to call a finding **High** because it requires authentication, ask: **what role is required?**

- Subscriber / Customer / any auto-granted role → treat as **Critical**. On most WordPress sites with WooCommerce, BuddyPress, bbPress, course / membership plugins, or open registration, getting a Subscriber account is trivially obtained (account creation at checkout, free signup, etc.). Treat Subscriber-reachable destructive actions the same as unauthenticated.
- Editor / Shop Manager / similar elevated-but-not-admin → **High**.
- Admin / `manage_options` → CSRF (missing nonce) is **High**; capability check alone makes destructive actions **not** Critical.

Distribution amplifier: if the plugin has no update channel (private, no `Update URI`), bump anything Critical/High that requires an author fix by half a level in the verdict reasoning — the site owner can't auto-patch.

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
- `references/report-template.md` — full `AUDIT-<yyyy-mm-dd>.md` template with worked examples.
- `references/tooling.md` — PHPCS / PHPStan / Plugin Check commands + interpretation.
- `references/remote-fetch.md` — fetching plugins from wp.org slug or GitHub URL.

---

## Related skills

- `wp-plugin-development` — building plugins (forward-looking patterns the audit checks for).
- `wp-plugin-directory-guidelines` — wp.org submission rules (used in the standards checklist).
- `wp-phpstan` — PHPStan setup for WP projects (deepens the static analysis step).
- `wp-performance` — performance investigation when audit findings need deeper triage.
- `wp-project-triage` / `10up-project-triage` — repo-shape inspection (useful in Discover phase).
