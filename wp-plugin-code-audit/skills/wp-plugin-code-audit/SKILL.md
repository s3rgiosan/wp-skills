---
name: wp-plugin-code-audit
description: >
  Use when auditing a WordPress plugin for security, performance, coding
  standards, WordPress.org guidelines compliance, and cross-plugin integration.
  Triggers: "audit this plugin", "review the plugin", "is this plugin secure",
  "code audit", "security review", "plugin code review", "is this plugin safe to
  install", "check this plugin for vulnerabilities", "review plugin for
  performance", "does this plugin conflict with another", or any request to
  evaluate the quality / safety of a WordPress plugin from a local checkout,
  a single file/function, or a remote source (wp.org slug, GitHub URL).
---

# WordPress Plugin Code Audit

Opinionated, verification-first audit workflow for WordPress plugins. Produces a markdown report with findings sorted by risk, a fix recommendation per finding, owner-decision (`[DECISION]`) questions only the owner can answer, an optional reproduction step, and a final **GO / NO-GO / GO WITH FIXES** verdict. Covers security, performance, coding standards, WordPress.org guidelines, and cross-plugin integration.

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
5. **Reproduce** *(optional, high value)* — where an environment is available, build the smallest fixture that triggers the top findings and capture before/after. Skip cleanly when read-only.
6. **Report** — write `AUDIT-<yyyy-mm-dd>.md` to a non-public location with severity-sorted findings, fix per finding, verdict.

Skipping phase 4 is how false positives ship and erode trust. Don't. Phase 5 is the one optional phase — it confirms a finding is real, but never replaces the source tracing in phase 4 that explains *why*.

---

## 1. Discover

Before reading code, scope the plugin. Write the scope inline at the top of the report — sets reader expectations.

**Ask up front: is this plugin the system of record for the data it writes, or a view over someone else's?** A plugin owns the authoritative copy of something (stock levels, entitlements, expiry dates, booking capacity, invoice numbers, backup archives, anything doing two-way sync) versus merely displaying or caching data whose source of truth lives elsewhere. Corrupting the system of record is a different class of problem from rendering it wrongly — the authoritative value is gone, not just shown wrong — and it changes how the Severity Rubric's silent-corruption rule applies. It's usually answerable in the first ten minutes; record the answer in the Scope section.

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

**`Update URI` absent on a non-wp.org plugin is itself a finding, not just a classification.** Any plugin classified private / GitHub / marketplace that lacks an `Update URI` header is exposed to wp.org slug hijacking: `wp_update_plugins()` broadcasts its folder slug to the wp.org update API, and an unclaimed matching slug can be published by anyone at a higher version and served as an "update" — silently, if auto-updates are on. Verify slug ownership and recommend `Update URI: false` (or a real updater URL) — see `references/standards-checklist.md` → §2 → Folder slug ownership.

### Capture operating constraints

Distribution is *how the plugin ships*. These are *the conditions it runs under* — and they're invisible in the plugin's own source, so you have to ask. Each one changes what the audit finds or what it can recommend. **You can't read these out of the code; ask the user.** Record the answers in the report's Scope section.

| Question | Why it changes the audit |
|---|---|
| **Who else writes this data?** Another plugin, a scheduled import, an external integration, a human in the admin, a staging-to-production sync. | Concurrency, precedence and overwrite bugs live here and are invisible in the plugin's own source. A per-record hook that's a mild "uncached query" note becomes a real finding once a nightly sync touches thousands of records; a writer that overwrites what the plugin computes is the premise of a design-risk section. This is the system-of-record question (Discover, above) from the other side — the plugin may *own* the data (silent-corruption rule) yet still not be its *only* writer. |
| **How do changes actually reach production?** Version control + CI, or a file copied over by hand. | Determines which remediations are reachable at all. "Put it under version control" is not advice for an owner who hand-edits on the server — see the Report-phase reachability rule. Hand-edited deployments change the fix: keep it a single file so a partial upload can't leave a half-working plugin, put the changelog *inside* the file (the header version is the only history that will exist), and set `Update URI: false` so an auto-update can't discard the edits. |
| **What's already planned?** A multilingual layer, a platform migration, a headless front end, a new integration not yet installed. | Turns "not applicable today" findings into ones worth writing now, while they're cheap. Two High findings can live entirely in the *interaction* between the plugin and a layer that isn't installed yet. |

### Skip ignored paths and dependencies

Read `.gitignore` and `.distignore` if present. **Skip their excluded paths during the scan** — auditing `tests/`, `*.md`, dev configs, or `.git/` wastes effort and adds noise.

**Skip `vendor/` and `node_modules/` by default**, even when they ship in the release. Auditing third-party dependency code is out of scope for a plugin audit unless the user explicitly asks for it (e.g. "audit the bundled dependencies too"). Audit the plugin's own code; assume deps are the upstream maintainers' responsibility.

List what you skipped in the report's Scope section ("Ignored (gitignore/distignore): …", and note `vendor/`/`node_modules/` skipped) so the reader knows the coverage boundary. If the user wants deps included, scan them and say so in Scope.

```bash
if [ -f .gitignore ];  then echo "--- .gitignore ---";  cat .gitignore;  fi
if [ -f .distignore ]; then echo "--- .distignore ---"; cat .distignore; fi
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

**Branch reviews: `/security-review` as an extra candidate source (optional).** When the audit target is a feature branch or a set of pending changes, and Claude Code's built-in `/security-review` is available, run it on the branch. It reviews the diff only and has no WordPress-specific knowledge, so treat its output like any other tool: candidates that go through Verify, cited in the report as `[security-review]`. Skip it for whole-plugin audits, where the diff is not the audit's scope.

---

## 3. Manual read

Tools catch patterns; people catch intent. Read in this order:

1. **Main plugin file** — header, constants, autoloader, hook registrations.
2. **Activation / deactivation / uninstall hooks** — DB schema, options, capabilities, cron unscheduling.
3. **REST routes** — every `register_rest_route`. Inspect `permission_callback`, argument validation (`args`), response shape (does it leak meta?).
4. **AJAX handlers** — every `wp_ajax_*` and `wp_ajax_nopriv_*`. Capability + nonce + sanitization.
5. **Admin pages + form handlers** — Settings API or hand-rolled? Nonces, caps, `register_setting()` sanitize callbacks.
6. **DB queries** — every `$wpdb->query`, `->get_results`, `->get_var`, `->prepare`, `->insert`, `->update`, `->delete`. Trace inputs.
7. **File ops** — `file_get_contents`, `file_put_contents`, `fopen`, `unlink`, `move_uploaded_file`, `wp_handle_upload`, `wp_upload_bits`. Path traversal? Extension allowlist?
8. **HTTP egress** — `wp_remote_*`. SSRF if URL is user-controlled.
9. **Deserialization** — `unserialize`, `maybe_unserialize` on user-controllable or low-trust stored data → object injection.
10. **Capability checks** — every `current_user_can`. Missing? Wrong cap (`read` instead of `manage_options`)?
11. **i18n** — translation functions used? Text domain matches plugin slug? Late-init load (post `init`)?
12. **Cron** — `wp_schedule_event` registrations. Cleared in deactivation? Hook callback registered before scheduling?
13. **Companion source (conditional)** — when Discover's "who else writes this data?" named a companion plugin that touches the same data, **read that companion's source for the shared-data path.** This class of finding is invisible from the audited plugin alone. Trigger only; not "read every other plugin." See `references/integration-checklist.md`.

Apply the five checklists. **Traverse every section of every checklist; don't skim and assume coverage.** A common audit failure is forgetting to read a reference file end-to-end and missing entire categories (secrets storage, IDOR, ABSPATH guards, error-response disclosure).

- `references/security-checklist.md` — auth, nonces, caps, **IDOR**, sanitize, escape, SQLi, CSRF, SSRF, file ops, deserialization, secrets in code, **stored credentials**, **error response & info disclosure**, **direct file access**, **personal data without exporters or erasers**.
- `references/performance-checklist.md` — autoloaded options, expensive queries, missing indexes, transients without TTL, cache-thrashing hooks, cron storms, enqueue scope, asset weight.
- `references/standards-checklist.md` — WPCS rules, function/class prefixing, i18n, deprecated APIs, plugin header completeness, GPL compatibility.
- `references/integration-checklist.md` — cross-plugin coupling invisible from a single plugin: companions writing shared data via direct SQL (hooks never fire), stored foreign IDs vs record-duplicating layers, hook-ordering races, cache staleness, WooCommerce HPOS / Cart-Checkout-Blocks declarations. **Conditional — apply only when a companion touches the same data.**
- `references/false-positive-traps.md` — verification procedures for SQLi / nonce / escape / sanitize before flagging.

**Traversal checklist** — before moving to phase 4, confirm you ran each detection in every section of each file. If a section produced zero candidates, note that in the report's Scope section under "Sections audited" — it shows your work and tells the reader nothing was skipped.

---

## 4. Verify (mandatory)

Trace every candidate finding through source before it enters the report. The per-category verification table, the drop-and-record rule and the "counts are findings too" rule are in `references/shared-conventions.md` → Verify. Category procedures: `references/false-positive-traps.md`.

---

## 5. Reproduce (optional, high value)

Where an environment is available, build the smallest fixture that triggers the top findings and capture before/after. Run it after Verify, never in its place. Rules: `references/shared-conventions.md` → Reproduce.

---

## 6. Report

Read `references/shared-conventions.md` → Report before writing. It covers where to write (ask first, default `.claude/`, check git-ignore status), the dated filename that never overwrites, plain-terms and TL;DR rules, fix guidance by ownership, and permanent finding IDs.

Plugin specifics:

- **Filename:** `AUDIT-<yyyy-mm-dd>.md`; same-day re-audit `AUDIT-<yyyy-mm-dd>-<HHMM>.md`. Git-ignore pattern: `AUDIT-*.md`.
- **Full skeleton:** `references/report-template.md`.

Required section order:

1. `# Audit: <plugin-name> <version>`
2. `## TL;DR`
3. `## Summary`
4. `## Scope`
5. `## Findings`
6. `## Verified false (appendix)`
7. `## Decisions needed from the owner` — omit when there are no `[DECISION]` findings.
8. `## Recommendation`
9. `## Sources`
10. `## Tooling output`
11. `## Audit metadata`

### Writing fix recommendations

Most fixes are one or two lines and need no extra guidance. When a fix changes structure (moving a hand-rolled settings form to the Settings API, reworking activation and uninstall, splitting a handler into a REST route with a real `permission_callback`), consult `wp-plugin-development` if it is installed, so the recommended fix is idiomatic. It is not required: without it, write the fix from the checklists.

---

## Severity and verdict

Rate every finding with the Severity Rubric in `references/shared-conventions.md`, including the subscriber-exploitable rule, the silent-corruption rule (it depends on the system-of-record answer from Discover) and the distribution amplifier. Mark owner-decision findings with `[DECISION]` as described there. Close with a verdict from its Verdict Rules: GO / NO-GO / GO WITH FIXES, with two-sentence reasoning.

---

## After the audit

The report is the start of the work, not the end — findings get fixed, the owner needs to know what changed, and `[DECISION]` findings wait on their answers. That remediation phase has its own skill: **`wp-plugin-audit-remediation`**. It covers the per-finding remediation log, freezing an immutable copy of the audited version so the report's `file:line` citations stay readable once fixing starts, and proving that renames / formatter runs / mechanical refactors changed no behaviour. Hand off to it when the verdict is written.

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

- `references/shared-conventions.md` — verification, reproduction, report rules, permanent finding IDs, severity rubric, `[DECISION]` findings, verdict rules. Shared with `wp-theme-code-audit` and `wp-project-security-audit`.
- `references/security-checklist.md` — security audit categories with detection patterns + verification procedures.
- `references/performance-checklist.md` — performance audit categories.
- `references/standards-checklist.md` — WPCS + WordPress.org plugin guidelines.
- `references/integration-checklist.md` — cross-plugin coupling and platform compatibility declarations (conditional; applies when a companion writes the same data or a layer duplicates referenced records).
- `references/false-positive-traps.md` — verification procedures for SQLi, nonce, escape, sanitize.
- `references/report-template.md` — full `AUDIT-<yyyy-mm-dd>.md` template with worked examples.
- `references/tooling.md` — PHPCS / PHPStan / Plugin Check commands + interpretation.
- `references/remote-fetch.md` — fetching plugins from wp.org slug or GitHub URL.

---

## Related skills

- `wp-plugin-audit-remediation` — the phase after this one: remediation log, immutable audited copy, behaviour-neutrality proof for fixes. Hand off once the report is written.
- `wp-plugin-development` — building plugins (forward-looking patterns the audit checks for). Optional at report time for structural fix recommendations; see Report → Writing fix recommendations.
- `wp-plugin-directory-guidelines` — wp.org submission rules (used in the standards checklist).
- `wp-phpstan` — PHPStan setup for WP projects (deepens the static analysis step).
- `wp-performance` — performance investigation when audit findings need deeper triage.
- `wp-project-triage` — repo-shape inspection (useful in Discover phase).
