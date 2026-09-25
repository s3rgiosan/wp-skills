# Report Template

The project report reuses the plugin skill's finding format, severity headings, `[DECISION]` callouts and table, verified-false appendix (false positives only), and Recommendation reachability rule (plugin `references/report-template.md`). What changes is the shape: the report is **sectioned by area**, and it is **one self-contained document**. Every component audit (plugin skill or theme skill) is embedded as an annex that carries all of that component's findings; the report never points to another report file.

---

## Where to write it

Plugin skill rules apply (plugin `references/shared-conventions.md` → Report: ask first, default `.claude/`, check git-ignore status, never overwrite). Deltas:

- Project report: `PROJECT-SECURITY-AUDIT-<yyyy-mm-dd>.md`; same-day rerun `PROJECT-SECURITY-AUDIT-<yyyy-mm-dd>-<HHMM>.md`.
- **The deliverable is that one file.** Component audits run with the plugin and theme skills, and their working reports may be written to the audit's working folder while the audit runs (outside the project, never next to the deliverable). They are merged into the report as annexes and are not part of the deliverable; the report never names or links them.
- Git-ignore pattern to check and offer: `PROJECT-SECURITY-AUDIT-*.md`.
- Never inside the audited project's tracked tree unless the owner confirms it is ignored.

---

## Citing evidence

The report outlives the audit's working folder. Cite evidence by its source: `file:line` in the audited code, "the owner's answers (<date>)", "the production file check (<date>)", or a named tool and its version. Never cite a scratch file name, a temp path, or an internal working document; when tool output matters, say which tool produced it and that the raw output was not retained. **Never cite another report file** by name or path, and never write "see component report": point inside the document instead ("see Annex 2", "see P-acme-forms-H1").

**Plain language only.** The report is read by people who never saw how the audit was run. No process words: no "orchestrator", "scanner", "subagent", brief names, "section file", phase numbers ("phase 6a", "phase 6b"; say "the production file check" or "live-site checks") or tool-pipeline jargon, and no model tiers or "single-model run". "Scanner" is fine when it names a real security tool the project uses. Never name the audit skills (`wp-plugin-code-audit`, `wp-theme-code-audit`, `wp-project-security-audit`, `wp-plugin-audit-remediation`) or their scripts and files (`inventory.sh`, `dep-audit.sh`, `vuln-lookup.sh`, `bundled-libs.sh`, `prod-check.sh`, `live-check.sh`, `candidates.tsv`). Describe the method in plain terms: "a component inventory", "known-vulnerability lookups at production versions", "core files against the official wordpress.org checksums", "a read-only production check the owner ran". External tools and data sources stay named so a reader can rerun or check them: PHPCS/WPCS, PHPStan, Theme Check, Plugin Check, `composer audit`, `npm audit`, WPVulnerability, Wordfence, Patchstack, OSV, the wordpress.org checksum and plugin APIs, php.net. The audited project's own files (its deploy scripts, lockfiles) are evidence and stay. Evidence is labelled with the plain labels below. Untracked local files (local artifact rule, `inventory.md` §11) are not mentioned anywhere in the report: not as findings, not in Verified false, not in Method.

## Evidence labels

Every Critical and High carries one of these on its **Evidence** line; lower severities carry one where it helps. The legend is repeated in Appendix F (Method).

| Label written in the report | Meaning |
|---|---|
| **independently re-checked in source** | A second reviewer re-read the cited code and confirmed the finding. |
| **traced in source (single review)** | The finding was traced through the cited code once, by the reviewer who reported it. |
| **confirmed on production files** | The cited code is identical in a production export or in the owner's production file check. |
| **advisory and version match** | A published advisory covers the installed version; the vulnerable code was not traced. |
| **owner's production check** | Established from output or files the owner fetched from production. |
| **observed on the live site (owner-authorized)** | Seen in the read-only live-site checks the owner authorized. |

A Critical or High reported with only "traced in source (single review)" blocks the report: re-check it in source first.

## Finding IDs

| Area | Prefix | Example | Detailed in |
|---|---|---|---|
| General / codebase, including correlations | `G-` | `G-H2` | the General / codebase section |
| Plugin | `P-<slug>-` | `P-acme-forms-H1` | the plugin's subsection, or its annex when it had a full audit |
| Theme | `T-<slug>-` | `T-acme-theme-M3` | the theme's subsection, or its annex when it had a full audit |

A component audit's own local IDs map one to one onto the prefixed IDs (`P-acme-forms-H1` is the audit's `H1`); never renumber when merging. Components without a full audit (managed or committed third-party, advisory lookup or focused review only) still get `P-<slug>-` / `T-<slug>-` IDs, allocated in the report. IDs follow the plugin skill's permanence rules (plugin `references/shared-conventions.md` → Finding IDs are permanent): allocate once, never renumber, withdrawn and superseded IDs stay reserved.

**Count once.** The header counts equal the number of distinct finding IDs per severity across the whole document. A finding summarized in the main body and detailed in an annex is one finding.

**Current state only.** Each finding states its current severity and the rationale for it. When the owner's answer changes a rating (masking confirmed, a role has no members, a site is not production), rewrite the severity and rationale to match and keep the ID; cite the answer as evidence ("the owner confirmed the CI variables are masked and protected (2026-06-01)"). The report never records how a finding was rated before, and has no severity-change notes, no withdrawn or superseded entries, no mapping to a previous report's IDs, and no reference to a previous report file. That history belongs in the remediation log or the working notes. ID gaps stay silent.

**Evidence** on every Critical and High: one of the labels in Evidence labels above.

---

## Skeleton

````markdown
# Project security audit: <project name>

## TL;DR

**Overall:** <the verdict for production as deployed, in one plain sentence>

**What needs attention now**
- <3 to 5 bullets across all areas: what is wrong, why it matters, who could exploit it in plain terms>

**What is in good shape**
- <2 to 3 verified positives>

**Recommended next steps**
1. <containment first>
2. ...

**At a glance:** <C> critical · <H> high · <M> medium · <L> low · <I> info; most serious issues in <areas, in plain words>.

(Contract: plugin `references/shared-conventions.md` → Report → TL;DR. Shareable on its own: no IDs, no paths beyond a
site path, no process or tool names, every claim backed by a verified finding.)

**Verdict (production as deployed):** GO / NO-GO / GO WITH FIXES
**Counts:** 🔴 <C> critical · 🟠 <H> high · 🟡 <M> medium · 🟢 <L> low · ⚪ <I> info
**By area:** General <n> · Plugins <n> (custom <n>, committed third-party <n>, managed third-party <n>) · Themes <n>
**Top 3 to fix first:**
1. `<ID>` short title (area)
2. ...
3. ...
**Decisions needed from the owner:** <D> (omit when D = 0)

---

## Summary

Two to four sentences for the technical reader (the plain-language summary is the TL;DR above): what was audited, the verdict reasoning, and what drives it.

| Area | 🔴 | 🟠 | 🟡 | 🟢 | ⚪ |
|---|---|---|---|---|---|
| General / codebase | | | | | |
| Plugins: custom | | | | | |
| Plugins: committed third-party | | | | | |
| Plugins: managed third-party | | | | | |
| Themes | | | | | |

**Findings.** One row per finding across all areas, by permanent ID, in severity order. The table is an index into the
area sections: IDs, severities and titles match the headings exactly. No effort column (effort estimation is out of scope).

| Finding | Area | Category | Recommendation | Priority |
|---|---|---|---|---|
| `P-acme-slider-pro-C1` · Unauthenticated file read | Plugins: committed third-party | security | Block the route at the edge until the vendor ships a fix | Critical |
| `G-H1` · Environment backup served from the webroot | General | security | Exclude the file from the deploy; rotate the API key | High |
| `G-M4` · Front page runs an uncached remote call | General | performance | Cache the response | Medium |

Category is security, performance or standards.

**Glossary** (optional): one line per technical term the TL;DR could not avoid.

---

## General / codebase

**Scope.** Root shape · core version (production) · multisite and sites (production / legacy) · same-origin sites ·
hosting · CI provider · deploy path and exclude list · lockfiles audited · production check run (yes, owner-run <date> / no) ·
live-site checks run (yes, owner-authorized <date> / no) · **not covered:** infrastructure as code (Terraform, Kubernetes
manifests, Dockerfiles found: list them; IaC scanning recommended as a follow-up), anything else out of scope.

**Platform.** WordPress <version> (production) · PHP <version> (production; supported / security fixes only / end of life
per php.net) · core and PHP updates owned by: host / team / nobody.

Best-practice findings (standards category) may cite 10up's public Engineering Best Practices
(https://10up.github.io/Engineering-Best-Practices/) as the reference standard, alongside the WordPress coding standards.

### Dependencies
(table from `dependency-audit.md` §6)

### Deploy, CI and exposure
### Secrets
### wp-config.php and hosting hardening
### Live-site exposure (when run)
### Users and access
### Development tools, activity logging and approved plugins
### Privacy and data hygiene
### Dependency monitoring and existing code-scanning results
### Core and PHP
### Topology and production drift
### Cross-component correlations

(findings in plugin-skill format, `G-` IDs, each under the subsection it belongs to)

---

## Plugins

### Custom plugins

#### acme-forms
**Identity:** 3.2.0 (production 3.2.0) · custom · owned by the project · update channel: deploy from repo, `Update URI: false` ·
active: site 1 active, site 2 inactive · full audit: see Annex 1 (verdict GO WITH FIXES)

One line per finding, by prefixed ID, each detailed in the annex:
- `P-acme-forms-H1` · `includes/rest/Entries.php:41` · subscriber-readable entries export (see Annex 1)
- ...

### Committed third-party plugins

#### acme-slider-pro
**Identity:** 2.4.0 (production 2.4.0, files differ: see P-acme-slider-pro-H2) · committed premium · example-vendor ·
no update channel (committed copy, outside the vendor's updater) · active: site 1 · focused review of high-risk code + advisory lookup

(findings in full, `P-acme-slider-pro-` IDs)

### Managed third-party plugins

#### acme-gallery
**Identity:** 4.1.0 (lockfile 4.2.0, production 4.1.0) · wp.org via Composer · example-vendor · updates through Composer ·
active: site 1, site 2 · lookup only

---

## Themes

### Custom themes
#### acme-theme
**Identity:** 2.0.0 · custom block theme · owned by the project · deploy from repo · active: site 1 · full audit: see Annex 2

### Child themes
#### acme-child (child theme of example-parent 3.1.0; parent third-party, lookup only)
**Identity:** ... · full audit: see Annex 3

### Third-party themes

---

## Decisions needed from the owner
(plugin-skill table; one row per `[DECISION]` finding across all areas, by prefixed ID)

## Recommendation
Verdict reasoning, the fix order, and the reachability rule: every recommendation works within the deploy path and
ownership recorded above.

## Future considerations
Strategic items too large for a fix line, each with one or two sentences on why and what it would take to decide:
replatforming a classic or page-builder site to the block editor, retiring a legacy site, consolidating or splitting a
multisite, moving off an end-of-life hosting stack, commissioning a professional penetration test. Not findings: no IDs,
no severity, not counted in the verdict.

---

## Appendix A: Component inventory

| Type | Slug | Version (lock / disk / prod) | Bucket | Source and update channel | Ownership | Active per site | Depth | Verdict |
|---|---|---|---|---|---|---|---|---|

Every plugin, theme, must-use plugin and drop-in, including those with no findings.

## Appendix B: Checked and clean
One line per check that found nothing, with the command or source.

## Appendix C: Verified false
False positives only: patterns that looked like a bug and are not, with the reason.

## Appendix D: Open questions for production
Each question, what it would change, and which finding it holds open.

## Appendix E: Sources
What the audit was based on: repository URL and commit, branch; production plugin and theme lists and when they were
received; production check and live-site check output and dates; database export used or not (never its contents);
results imported from the project's own code-scanning tools. Name private material by title and date only; never link it.
Never list other report files here: component audits are in the annexes.

## Appendix F: Method
What was reviewed and how deeply (full audit, focused review of high-risk code, advisory lookup), tools available and
unavailable, how active status was established (WP-CLI / database / not verified), what was static only, production
files received and when they were deleted, confidence.

**Audit runs.** One row per run, so the reader knows what the current findings rest on:

| Date | Run | What it covered |
|---|---|---|
| 2026-05-29 | First audit | Repository at commit `a1b2c3d`: component inventory, dependency advisories (`composer audit`, `npm audit`), known-vulnerability lookups (WPVulnerability) at local versions, static code review |
| 2026-06-01 | Owner answers and production check | Production plugin list, read-only production check (core files against the official wordpress.org checksums), owner-authorized live-site checks |
| 2026-06-15 | Second audit | Repository at commit `d4e5f6a` after fixes; lookups at production versions; production export compared with the repository |

Include the evidence-label legend:

| Label | Meaning |
|---|---|
| independently re-checked in source | A second reviewer re-read the cited code. |
| traced in source (single review) | Traced through the cited code once. |
| confirmed on production files | Cited code identical in a production export or production file check. |
| advisory and version match | Published advisory covers the installed version; code not traced. |
| owner's production check | From output or files the owner fetched from production. |
| observed on the live site (owner-authorized) | Seen in the authorized read-only live-site checks. |

---

## Annexes

One annex per component that had a full audit (custom plugins, custom themes, child themes), numbered in the order
they appear in the Plugins and Themes sections. Each annex is complete on its own terms; nothing in it points outside
the document.

## Annex 1: acme-forms (plugin)
**Identity:** version, source, ownership, update channel, active per site · **Verdict:** GO WITH FIXES

### Findings
Every finding of the component audit, all severities, with its prefixed ID and the plugin-skill finding format:
location, precondition (lowest role or condition), impact, evidence (with its label), fix.

### Verified false
Candidates the component audit dropped, with the reason.

### Checked and clean
A short list of the checks that found nothing.

### Sections audited
The component audit's sections-audited line.

(Per-component open questions go to Appendix D, and owner decisions to the Decisions table; they are not repeated
here.)

## Annex 3: acme-child (child theme of example-parent)
...
````

---

## Worked example (fabricated)

The project, components, versions, counts and dates below are fabricated.

````markdown
# Project security audit: Acme Corp marketing site

## TL;DR

**Overall:** The site should not stay as it is: one problem needs containment today, and it can be contained without
taking the site offline.

**What needs attention now**
- Anyone on the internet, without logging in, can read the site's private configuration, including its database
  password, through an add-on that shows image sliders. The add-on's maker has not released a fix yet.
- A backup of the site's settings, including a key for the mail service, can be downloaded by anyone from the public site.
- Logged-in subscribers can download every form submission, including names and email addresses.

**What is in good shape**
- WordPress itself is on a supported, up-to-date version.
- No signs of tampering: production files match the repository and the official WordPress release.

**Recommended next steps**
1. Block the vulnerable slider path at the edge today, and change the database password afterwards.
2. Remove the settings backup from the public site and replace the mail service key.
3. Restrict the form export to administrators.
4. Ask the slider's maker for a fixed release, or plan to replace the add-on.

**At a glance:** 1 critical · 3 high · 4 medium · 2 low · 3 info; the most serious issues are in a third-party slider
add-on and in what the deploy publishes.

**Verdict (production as deployed):** NO-GO
**Counts:** 🔴 1 critical · 🟠 3 high · 🟡 4 medium · 🟢 2 low · ⚪ 3 info
**By area:** General 5 · Plugins 6 (custom 3, committed third-party 2, managed third-party 1) · Themes 2
**Top 3 to fix first:**
1. `P-acme-slider-pro-C1` unauthenticated file read through the slider's preview route (committed third-party)
2. `G-H1` environment backup with a mail API key served from the webroot (general)
3. `P-acme-forms-H1` subscriber-readable entries export (custom)

## Summary

Multisite with two production sites. The committed premium slider carries an unauthenticated file read with no
vendor fix, and the deploy publishes a tracked environment backup. NO-GO until
`P-acme-slider-pro-C1` is mitigated.

| Finding | Area | Category | Recommendation | Priority |
|---|---|---|---|---|
| `P-acme-slider-pro-C1` · Unauthenticated file read through the preview route | Plugins: committed third-party | security | Block the route at the edge; report to example-vendor | Critical |
| `G-H1` · Environment backup with a mail API key served from the webroot | General | security | Exclude the file from the deploy; rotate the key | High |
| `P-acme-forms-H1` · Subscriber-readable entries export | Plugins: custom | security | Require `manage_options` on the export route | High |
| ... | | | | |

## General / codebase

### Deploy, CI and exposure

### 🟠 HIGH — G-H1: `.distignore` — An environment backup with a mail API key is served from the webroot

**Severity rationale.** Unauthenticated download of a live API key for the mail service. Not Critical: the key
sends mail only and grants no site access.

**Description.** The deploy copies the repository root to `wp-content/` and excludes what `.distignore` lists
(`.git`, `node_modules`). `.env.backup` is tracked and not excluded, so it lands at
`https://example.com/wp-content/.env.backup`. It holds `MAIL_API_KEY` (`.env.backup:2`, `a1b2…`).

**Verified.** Read `bin/deploy.sh:10-20` and `.distignore`. Owner confirmed the webserver has no deny rule for
dotfiles. Evidence: independently re-checked in source.

**Fix.** Add `.env*` to `.distignore`; remove the file from the repository; rotate the key with the mail provider.

## Plugins

### Committed third-party plugins

#### acme-slider-pro
**Identity:** 2.4.0 (production 2.4.0) · committed premium · example-vendor · no update channel (committed copy) ·
active: site 1 · focused review of high-risk code + advisory lookup (no advisories on record; free slug has 2, version line differs: not applied)

### 🔴 CRITICAL — P-acme-slider-pro-C1: `includes/Preview.php:60` — Unauthenticated file read through the preview route

**Severity rationale.** Network-exploitable, no authentication; reads `wp-config.php`.

**Description.** `register_rest_route( 'acme-slider/v1', '/preview', ... )` with `permission_callback` `__return_true`
passes `$request['template']` to `file_get_contents( ACME_SLIDER_DIR . $template )` with no path normalization.

**Verified.** Read `includes/Preview.php:40-80`; no `realpath` or allowlist on the path. Evidence: independently
re-checked in source.

**Fix.** No fixed version exists. Report to example-vendor (security contact in the plugin header). Until a fix ships,
mitigate without editing the plugin: block `/wp-json/acme-slider/v1/preview` at the edge, or remove the route from a
project-owned must-use plugin (`add_filter( 'rest_endpoints', ... )`). Edits to the plugin's files are overwritten on
the next vendor update, and this copy is committed: any local patch is a fork to re-apply after every update.
````

### Annex example (fabricated)

````markdown
## Annex 1: acme-forms (plugin)

**Identity:** 3.2.0 (production 3.2.0) · custom · owned by the project · deploy from repo · active: site 1 ·
**Verdict:** GO WITH FIXES

### Findings

### 🟠 HIGH — P-acme-forms-H1: `includes/rest/Entries.php:40` — Subscriber-readable entries export

**Precondition.** Any logged-in account; registration is open, so any visitor can get one.
**Impact.** Downloads every form entry (names, emails, messages) as CSV.
**Description.** The export route's `permission_callback` checks `is_user_logged_in()` only.
**Evidence.** Read `includes/rest/Entries.php:30-60`. Evidence: independently re-checked in source.
**Fix.** Require `manage_options` in the `permission_callback`.

### 🟢 LOW — P-acme-forms-L1: `acme-forms.php:12` — Text domain loaded after `init`

**Evidence.** Read `acme-forms.php:10-14`. Evidence: traced in source (single review).
**Fix.** Load the text domain on `init`.

### Verified false
- `includes/Admin/List.php:88`: IN-clause looked injectable; the values come from a fixed allowlist.

### Checked and clean
- Nonces on every admin form · no `unserialize` on request data · no direct file access without `ABSPATH`.

### Sections audited
Security ✓ · performance ✓ · standards ✓ · integration n/a · false-positive traps ✓
````

The header counts this plugin's H1 and L1 once each, although H1 also appears as a one-line summary in the Plugins
section.
