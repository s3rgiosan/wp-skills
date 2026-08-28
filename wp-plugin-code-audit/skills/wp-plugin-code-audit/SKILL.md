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
13. **Companion source (conditional)** — when Discover's "who else writes this data?" named a companion plugin that touches the same data, **read that companion's source for the shared-data path.** This class of finding is invisible from the audited plugin alone. Trigger only; not "read every other plugin." See `references/integration-checklist.md`.

Apply the five checklists. **Traverse every section of every checklist; don't skim and assume coverage.** A common audit failure is forgetting to read a reference file end-to-end and missing entire categories (secrets storage, IDOR, ABSPATH guards, error-response disclosure).

- `references/security-checklist.md` — auth, nonces, caps, **IDOR**, sanitize, escape, SQLi, CSRF, SSRF, file ops, deserialization, secrets in code, **stored credentials**, **error response & info disclosure**, **direct file access**.
- `references/performance-checklist.md` — autoloaded options, expensive queries, missing indexes, transients without TTL, cache-thrashing hooks, cron storms, enqueue scope, asset weight.
- `references/standards-checklist.md` — WPCS rules, function/class prefixing, i18n, deprecated APIs, plugin header completeness, GPL compatibility.
- `references/integration-checklist.md` — cross-plugin coupling invisible from a single plugin: companions writing shared data via direct SQL (hooks never fire), stored foreign IDs vs record-duplicating layers, hook-ordering races, cache staleness, WooCommerce HPOS / Cart-Checkout-Blocks declarations. **Conditional — apply only when a companion touches the same data.**
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

**Counts are findings too.** Any number that appears in the report — call sites, occurrences, endpoints, LOC, handlers, queries — must come from a command whose output you captured, not from reading. Counting by eye is how `__()` "called 14 times" ships when it's called six (an accidental tally of the prefix, which happened to occur 17 times). A count is the cheapest thing a reader spot-checks: one wrong number and every other number in the report is suspect. If you can't produce the command that yields the figure, don't put the figure in the report — describe it qualitatively instead ("several", "throughout").

This phase exists because subagents and pattern scanners over-flag in WP. Real audit: a subagent flagged `PostToPost.php:67` as IN-clause SQLi; verified false (`post_type_exists()` in ctor + `esc_sql()` applied). Always re-run findings against source.

Full traps + procedures: `references/false-positive-traps.md`.

---

## 5. Reproduce (optional, high value)

A code audit is a reading exercise, and often there's no environment — this phase is **optional and never a requirement**. But where you *can* run the plugin, a finding the reader can trigger themselves stops being a claim. It also surfaces what reading misses: a null cast to `(int) 0` that renders a confident "0 available" (an unconfigured dependency indistinguishable from a genuinely empty one) is obvious in a fixture and easy to read past in source.

Run this **after Verify, not instead of it.** Reproduction confirms a finding is real; only the phase-4 source trace explains *why*, and that trace still belongs in the report.

- **Build the smallest fixture that exercises the top findings.** Usually two or three records: a product with two variants, a membership with an expiring plan, a form with one conditional field, a booking that crosses a capacity boundary. Capture before/after (add one item → correct; add a second → the bug).
- **Put the fixture recipe in the report** — the exact records and settings — so the owner can reproduce it without you. Reference it from the finding (`**Reproduced.**`).
- **When reproduction isn't possible, say so and say what it costs:** name which findings remain traced-only, and state that they should be reproduced before *and* after any fix. An Info finding recording "audit was static, no environment reached" is appropriate.

---

## 6. Report

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
**Decisions needed from the owner:** <D> — see § Decisions needed from the owner (omit this line when D = 0)

## Scope
- Path / source: ...
- Distribution: wp.org / GitHub / private / commercial · Update channel: ...
- Author / contact: ...
- LOC: ... PHP, ... JS
- Surface: REST endpoints (N), AJAX handlers (N), admin pages (N), CLI commands (N), blocks (N)
- System of record: yes / no — what authoritative data it owns (stock, entitlements, invoices, backups, …), or "view over <source>"
- Operating constraints: other writers of this data (…), how changes reach production (VCS+CI / hand-edited on server), what's planned (multilingual / migration / headless / new integration) — or "none reported"
- Dependencies (PHP): ...
- Dependencies (JS): ...
- Tools run: PHPCS (yes/no), PHPStan (yes/no), Plugin Check (yes/no)
- Ignored (gitignore/distignore): ... · `vendor/` + `node_modules/` skipped (deps out of scope unless requested)
- Sections audited: security ✓ · performance ✓ · standards ✓ · integration ✓ (or n/a — no shared-data companion) · FP-traps ✓

## Findings

### 🔴 CRITICAL — C1: `file.php:line` — short title
Description with the trace through source. Why it's exploitable / what breaks.
*Fix:* concrete change.

### 🟠 HIGH — H1: `file.php:line` — short title
...same format...

### 🟡 MEDIUM — M1: ...
### 🟡 MEDIUM — M5: `file.php:line` — short title [DECISION]

> **[DECISION] Needs a decision from the owner.** <the question, in one sentence> Default if unanswered: <what current behaviour does>.

...same format...
### 🟢 LOW — L1: ...
### ⚪ INFO — I1: ...

## Verified false (appendix)
- `file.php:line` — pattern that looked like X but isn't because Y.
- M9 — withdrawn: traced properly, not exploitable. ID retired, not reused.
- I3 — superseded: environment later reached; Highs reproduced. See H1–H4 repro.

## Decisions needed from the owner

Findings marked `[DECISION]`, collected. Omit the whole section when there are none.

| | Question | Default if unanswered | Consequence / blocks |
|---|---|---|---|
| **M5** | ... | ... | free-standing / blocks C1, H2 |

## Recommendation
- Two-sentence verdict reasoning.
- If distribution is private and findings require an author fix: who to contact + suggested disclosure path.
- **Every recommendation must be reachable within the operating constraints captured in Discover.** Where the obvious fix is one the owner has already ruled out (e.g. "put it under version control" when they hand-edit on the server), say what to do *instead* — don't issue advice they can't follow. Unreachable advice makes the whole report read as written for someone else.

## Tooling output
- PHPCS: `/tmp/audit-<slug>/phpcs.txt` (N errors, N warnings)
- PHPStan: `/tmp/audit-<slug>/phpstan.txt` (level 5, N errors)
- Plugin Check: `/tmp/audit-<slug>/plugin-check.txt` (N issues)
```

### Finding IDs are permanent

Findings are numbered within severity — C1, H1, M1, L1, I1. **Allocate an ID once and never reuse or renumber it. IDs are labels, not positions.** The moment anything outside the report references a finding — a generated HTML/PDF, a client's tracking spreadsheet, an email, a ticket, the remediation log — renumbering makes "M11" ambiguous with no way to tell which finding was meant. Reports *do* change (a re-audit, a finding withdrawn after tracing it properly, a section rewritten), and the default behaviour on change is to renumber and let every derived artifact silently disagree.

- **Withdrawing a finding does not free its number.** Move it to the verified-false appendix and note it: `M9 — withdrawn, see appendix`. The number stays retired.
- **A finding that changes severity keeps its original ID.** Note the change in the finding; do **not** move it into the new severity's numbering. This is the non-obvious case — the instinct is to renumber, and an ID that survives its own severity change is far more useful than one that reads tidily.
- **A finding that was correct when written but no longer describes reality is *superseded*, not withdrawn.** Keep the ID, mark it superseded, and point to what replaced it. Withdrawn means the finding was wrong; superseded means the situation moved underneath it. The common case is a phase-5 reversal: an Info finding recording "runtime verification not possible, environment unreachable" that later *becomes* possible and reproduces the Highs — that finding wasn't an error, so `superseded → see <repro>` is accurate where `withdrawn` would read as "we got that wrong".
- **New findings take the next unused number in their severity, even if that leaves gaps.** Gaps are the point: a gap says "something was here and is now withdrawn/superseded", which is information. Renumbering to close it destroys the ability to reference the report from outside itself.

Remediation-discovered findings get their own namespace, not the next audit number — see `wp-plugin-audit-remediation`.

---

## Severity Rubric

Each finding in the report gets a traffic-light emoji + severity tag in its heading (e.g. `### 🔴 CRITICAL — C1: …`). The emoji is for fast scanning; the tag is the canonical level.

| Severity | Emoji | Rule of thumb | Examples |
|---|---|---|---|
| **Critical** | 🔴 | Exploitable from the network with low / no privilege; remote code execution; auth bypass; data loss; **OR** destructive / business-critical action reachable by the lowest-privilege authenticated role (Subscriber / Customer — roles auto-granted on registration or checkout on most WP sites); **OR** silently corrupts data the plugin is the system of record for, cumulatively, in a way that cannot be reconstructed from other data the site holds — regardless of the privilege required to trigger it. | Unauthenticated SQLi; arbitrary file upload via REST; `eval()` on user input; auth bypass on admin action; arbitrary file read via path traversal; **subscriber-exploitable AJAX that overwrites product catalog / generates billing documents / exports private data / sends emails on the site's behalf**; SSRF reachable by any authenticated user; **a refund handler that silently decrements true stock on every refund with no way to rebuild the real quantity; a backup routine that silently backs up nothing**. |
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

### Silent-corruption rule (critical)

The privilege axis above asks *who can trigger this?* — the right question for a finding that **exposes** data. It is the wrong question for a finding that **writes wrong data**, where the worst case is the site owner doing their job correctly while the plugin quietly records the wrong value. For those, don't ask who can trigger it. Ask three questions:

1. **Is the wrong state visible?** Does anything surface it — an error, a notice, a log line, an admin warning, an email — or nothing at all?
2. **Does it accumulate?** A one-off bad row, or a little more drift on every operation?
3. **Is it reconstructible?** Can the correct value be rebuilt from other data the site still holds (order history, an upstream source, an audit log)?

**Silent AND cumulative AND unreconstructible → Critical**, regardless of the privilege required to trigger it. All three conditions must hold: any one of them false drops the finding back to the ordinary data-integrity ladder (High for a genuine integrity bug, Medium for reliability / desync). A site can run for weeks accumulating drift before anyone notices, and by then the original values are gone.

This only reaches Critical when the plugin is the **system of record** for the corrupted data (see Discover) — it owns the authoritative copy. A plugin that renders someone else's data wrongly is a display bug, not silent corruption; the authoritative value is still intact upstream. The purest example isn't commerce: a backup plugin that silently doesn't back up has no attack surface at all and can still end a business.

### Owner-decision findings (`[DECISION]`)

Some findings aren't defects. The code is doing something defensible, a *different* defensible thing is also possible, and only whoever holds authority over that trade-off can choose. Engineering cannot close these, and listing them next to real defects implies it can. Marking them turns a report from "here are N problems" into "here are N−k problems and k questions for you" — a more actionable thing to hand someone.

"Owner" is deliberately role-neutral. Depending on the engagement it's the developer auditing their own plugin, the client who commissioned the work, another developer who owns the subsystem, the product owner, the site owner, or a compliance contact. Don't assume an agency-and-client shape — often the owner is the person reading the report.

Common shapes (none domain-specific): **exposure** (should this be visible to end users at all?); **override** (silently overrule an explicit human setting, or refuse and explain?); **degradation** (is this failure mode acceptable under load, or is hardening worth its cost?); **retention** (what happens to the data on uninstall — is any of it personal data?); **fail open or fail closed** (when a dependency is unavailable, block or let through?); **model choice at an integration boundary** (two valid representations, wrong pick expensive to reverse).

Mark and collect:

- **Marker.** Append the text token `[DECISION]` to the finding heading (keep its severity emoji + ID), and put a one-line callout directly under it. Text, not a glyph — it stays greppable without unicode (`grep '\[DECISION\]' AUDIT-*.md`), reads distinctly from the severity emoji rather than as a sixth level, and survives conversion to HTML / PDF / email where emoji coverage is inconsistent.

  ```markdown
  ### 🟡 MEDIUM — M5: `file.php:line` — short title [DECISION]

  > **[DECISION] Needs a decision from the owner.** <the question, in one sentence> Default if unanswered: <what current behaviour does>.
  ```

- **Collected section.** A `## Decisions needed from the owner` table immediately before `## Recommendation`, plus the pointer line in the summary block at the top of the report.

Rules that keep the class useful rather than a dumping ground:

- **Non-critical by construction.** If the current behaviour is outright *wrong*, it's a defect — give it a real severity, not a decision marker. This class is for genuine forks in the road.
- **Doesn't move the verdict on its own** (see Verdict Rules) — but an unanswered decision can block *other* work. Record which findings each one blocks; call out any that block everything.
- **Every one states its default.** What happens if no answer arrives. "We kept current behaviour" must be an explicit choice, not a silent one.
- **Not a parking lot.** If the answer is knowable from the code, it isn't a decision — it's a finding you haven't finished. Resolve it.

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

`[DECISION]` findings don't enter this table — they're questions, not defects, and can't be closed by engineering. But if an unanswered one blocks other work (e.g. it gates all integration until resolved), say so in the reasoning; the verdict can be GO WITH FIXES while a decision still blocks the fix.

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
- `wp-plugin-development` — building plugins (forward-looking patterns the audit checks for).
- `wp-plugin-directory-guidelines` — wp.org submission rules (used in the standards checklist).
- `wp-phpstan` — PHPStan setup for WP projects (deepens the static analysis step).
- `wp-performance` — performance investigation when audit findings need deeper triage.
- `wp-project-triage` / `10up-project-triage` — repo-shape inspection (useful in Discover phase).
