---
name: wp-project-audit
description: >
  Use when auditing a whole WordPress project (a wp-content repo, a full site
  root, or a Bedrock-style layout) for security and known vulnerabilities, or
  deciding whether a site is safe as deployed. Triggers: "audit this project",
  "audit the whole site", "security audit of this WordPress site", "is this
  site safe", "check every plugin and theme for vulnerabilities", "project
  security review", "vulnerability sweep", "is production compromised", "supply
  chain check for our plugins", or any request covering more than one plugin or
  theme, dependencies, deploy, CI, secrets or production drift. Orchestrates
  wp-plugin-code-audit and wp-theme-code-audit; requires both.
---

# WordPress Project Audit

Opinionated, verification-first security and vulnerability audit of a whole WordPress project. It inventories every component, runs the sweeps no single-component audit can see (dependencies, known advisories at the production version, vendor compromise, secrets and git history, deploy, CI and webroot exposure), dispatches custom plugins and themes to their component audits, correlates findings across components, and ends with a **GO / NO-GO / GO WITH FIXES** verdict for **production as deployed**, plus a verdict per component.

> **Requires `wp-plugin-code-audit` and `wp-theme-code-audit`.** This skill orchestrates both and builds on their conventions: the severity rubric (including the subscriber-exploitable and silent-corruption rules), `[DECISION]` markers, verdict rules, permanent finding IDs, report location and filename rules, `false-positive-traps.md`, and the Fix guidance by ownership table all live in the plugin skill and apply here unchanged. Custom plugins are audited with `wp-plugin-code-audit`, custom themes (including child themes) with `wp-theme-code-audit`, each producing its own report. Install all three. "The plugin skill" means `wp-plugin-code-audit` and "plugin `references/<file>`" a file in its `references/` folder; "the theme skill" and "theme `references/<file>`" likewise for `wp-theme-code-audit`. Locate them by layout: after `install.sh`, `../wp-plugin-code-audit/` and `../wp-theme-code-audit/` from this skill's folder; in a repo checkout, `../../../wp-plugin-code-audit/skills/wp-plugin-code-audit/` and `../../../wp-theme-code-audit/skills/wp-theme-code-audit/`; after a marketplace install, find the installed skill folders (do not guess a cache path).

> **Scope:** one WordPress project: every plugin, theme, must-use plugin, drop-in and the core version, the dependency lockfiles, the deploy and CI configuration, the git history, and (optionally, owner-run) the production install. Not a penetration test: nothing is sent to production except what the owner runs or explicitly authorizes (phase 6).

> **Read-only, always.** No installs, updates, activations, migrations, commits or service starts. Scripts write only to an output directory outside the project. If something needed is not running, ask the owner before starting it.

> **Verification discipline:** every finding is traced through source or through the lookup record at the production version. Scanners and pattern matchers over-flag; run the plugin skill's `false-positive-traps.md` procedures and the project traps in Verify before anything reaches the report.

---

## When To Use This Skill

- A security audit of a site or repository with more than one custom component.
- "Is production safe?" after an advisory, a vendor compromise, or a report that something feels off.
- Taking over a project: what is installed, who owns it, what is exposed, what is out of date.
- A pre-launch or handover review that must cover dependencies, deploy and secrets, not only code.

For one plugin or one theme, use `wp-plugin-code-audit` or `wp-theme-code-audit` directly.

---

## Shared conventions

Read these in the plugin and theme skills before the first audit. Only the deltas are stated here.

| Convention | Where | Delta for projects |
|---|---|---|
| Severity rubric, subscriber-exploitable rule, silent-corruption rule | plugin `SKILL.md` → Severity Rubric | Rate at the **production** version and on the **production** sites. Same-origin sites and production config can raise a rating (see Correlate). |
| Role-to-severity table for rendered content | theme `references/theme-security-checklist.md` (table at the top) | Role counts come from the inventory environment or the owner. Zero today lowers likelihood, not severity. |
| `[DECISION]` findings | plugin `SKILL.md` → Owner-decision findings | Collected across all areas into one table, by prefixed ID. |
| Verdict rules | plugin `SKILL.md` → Verdict Rules | Applied to the project as deployed, and separately per component for the inventory column. See Verdict. |
| Permanent finding IDs | plugin `SKILL.md` → Finding IDs are permanent | Area prefixes `G-`, `P-<slug>-`, `T-<slug>-`, mapping one to one onto each component audit's local IDs. The report states each finding's current severity and rationale only: no re-rating notes, withdrawn or superseded entries, or previous-report mappings. |
| Report location and filename | plugin `SKILL.md` → Report | One self-contained `PROJECT-AUDIT-<yyyy-mm-dd>.md`; component audits embedded as annexes. See Report. |
| False-positive traps | plugin `references/false-positive-traps.md` | Plus the project traps in Verify. |
| Fix guidance by ownership | plugin `SKILL.md` → Report → Fix guidance by ownership | The bucket from the inventory decides the row. Never "edit the vendor's files" as the fix for distributed third-party code. |
| Theme verification (reachability, kses on core fields, multisite admins, third-party write paths, chains) | theme `SKILL.md` → Verify | Applies to theme findings merged into this report, and to correlations that involve a theme. |

---

## Phases (Always In Order)

1. **Discover and inventory**: root shape, topology, hosting, CI, deploy, lockfiles, platform state (core and PHP), code outside `wp-content`; every component with its bucket, versions and active status per site. Ask the owner for the production lists up front.
2. **Automated sweeps** *(parallel)*: dependency audits and monitoring, known-vulnerability lookup at the production version, wp.org signals, vendor compromise, bundled libraries, secrets and git history, deploy, CI and exposure, users and access, privacy and hygiene, existing scanner results.
3. **Component depth** *(parallel)*: custom plugins to `wp-plugin-code-audit`, custom themes to `wp-theme-code-audit`, committed third-party code to a hotspot pass, managed third-party code to lookups only.
4. **Verify**: plugin-skill discipline plus the project traps; spot-check every Critical and High against source.
5. **Correlate**: cross-component findings that need two or more components, or a component plus config.
6. **Production verification** *(optional)*: an owner-run, read-only check script with known-good manifests, and owner-authorized read-only live-site HTTP checks.
7. **Report**: one self-contained `PROJECT-AUDIT-<yyyy-mm-dd>.md`, sectioned by area, with every component audit embedded as an annex.

Skipping Verify is how false positives ship. Skipping the up-front production questions is how the audit rates the wrong versions.

---

## 1. Discover and inventory

Full procedure: `references/inventory.md`.

```bash
SKILL_DIR=<this skill's folder>
OUT=$(mktemp -d)/project-audit        # outside the project; the scripts refuse a path inside it
bash "$SKILL_DIR/scripts/inventory.sh" --root /path/to/project --out "$OUT/inventory"
# Database fallback for active status when WP-CLI cannot connect. Credentials are read from wp-config.php by the
# script and passed to the client in a temporary mode-600 option file; never type them on a command line.
bash "$SKILL_DIR/scripts/inventory.sh" --root /path/to/project --out "$OUT/inventory" \
  --db-fallback --db-socket /path/to/mysqld.sock
```

Before marking active status unverified, check the project's own documentation (README, CLAUDE.md or other agent instructions, contributor notes) for a documented way to reach the local database, such as the socket path; pass it with `--db-socket` / `--db-port` / `--mysql-bin`.

The script detects the root shape (wp-content repo, full site root, Bedrock-style `web/app`), reads plugin, theme, must-use and drop-in headers, guesses each component's bucket (git-tracked, `composer.lock` source, premium artifact), lists every lockfile, CI file, deploy script and exclude list, hosting hints, local artifacts by name, size and tracked status (only tracked or production ones are candidates: `references/inventory.md` §11), and orphaned must-use loaders. Active status per site comes from WP-CLI (read-only, `--skip-plugins --skip-themes`), then from a read-only database query of `active_plugins` per options table plus `active_sitewide_plugins` per network; if neither works, every component is `unverified`.

**Ask the owner up front, in one message, before the sweeps:**

1. The **production plugin and theme lists with versions, per site** (`wp plugin list` / `wp theme list` output, or an admin screenshot), or read-only production access.
2. **Which sites are production and which are legacy**, and whether any share an origin (a subdirectory or proxied path).
3. The **deploy target**: which branch, which host, which command or pipeline.
4. **Which committed components are custom** (the script marks them `committed (confirm custom or third-party)`).
5. The **production PHP version**, and who owns core and PHP updates (host or team).
6. An **approved plugin list**, if the organization keeps one (optional; `--approved`).
7. Whether **live-site checks** against the production URL are authorized (optional; phase 6).
8. Whether any **services** the audit would need (local database, local site) may be started. Default: no.

Record lockfile vs disk vs production version drift per component. Lookups use the production version.

The inventory also records platform state (PHP constraints, core version), unexpected files in the WordPress root and every drop-in core loads (`_get_dropins()`), role counts and registration settings, development tools and activity-log plugins, plugins missing from the approved list, dependency-monitoring and existing-scanner configs, and infrastructure-as-code files (`references/inventory.md` §6 to §8). **Infrastructure as code is not covered by this audit:** list what was found in Scope and recommend IaC scanning as a follow-up.

---

## 2. Automated sweeps (parallel)

| Sweep | Reference | Script |
|---|---|---|
| Dependency audits per lockfile, with a dev / runtime / ships-to-production column and build-flag checks | `references/dependency-audit.md` | `scripts/dep-audit.sh` |
| Known vulnerabilities per component at the production version (WPVulnerability, Wordfence feed fallback), free and premium slugs, version-line sanity | `references/component-vuln-lookup.md` | `scripts/vuln-lookup.sh` |
| wp.org staleness, closed plugins, slug ownership (unclaimed slug and no `Update URI`: hijack risk, plugins and themes) | `references/component-vuln-lookup.md` §6 | `scripts/vuln-lookup.sh` |
| Vendor compromise: closed plugins by the same author, supply-chain advisories, update endpoint hosts, known-good compare | `references/vendor-compromise.md` | manifests via `scripts/prod-check.sh manifest` |
| Bundled libraries in **every** component (custom, committed and managed): PDF viewers, jQuery and jQuery UI, sliders, lightboxes, Select2, Moment, Lodash, Handlebars, TinyMCE copies and others, checked against each library's own advisories | `references/bundled-libraries.md` | `scripts/bundled-libs.sh --osv` |
| Webroot exposure: every tracked top-level path and non-runtime file (docs, agent config, lockfiles, scripts, configs, dotfolders) that no deploy exclude list removes | `references/deploy-and-exposure.md` §2 | `inventory.sh` → `webroot-exposure.tsv` |
| Secrets and sensitive files in tracked files and git history, masked | `references/secrets-scan.md` | grep recipes |
| Deploy, CI and exposure: exclude-list coverage, CI log leakage, PHP under uploads, orphaned must-use loaders, logs and exports in web-readable paths, `wp-config.php` hardening (names and booleans only) | `references/deploy-and-exposure.md` | grep recipes |
| Continuous dependency monitoring: Dependabot, Renovate or Snyk config, GitHub security alerts; missing monitoring is a finding | `references/dependency-audit.md` §5 | inventory signal |
| PHP end of life against php.net's active releases | `references/inventory.md` §6 | `scripts/vuln-lookup.sh --php-version` |
| Users and access (role counts, super admins, open registration and default role, application passwords, dormant accounts), development tools active on production, admin-action logging, approved-plugin list | `references/access-and-privacy.md`, `references/inventory.md` §8 | inventory signals, `prod-check.sh` §12 |
| Privacy and data hygiene: where personal data lives, exporters and erasers in custom code, production data in tracked or deployed dumps and on reachable staging systems (local artifact rule: `references/inventory.md` §11; dumps never read) | `references/access-and-privacy.md` §4 | grep recipes |

```bash
bash "$SKILL_DIR/scripts/dep-audit.sh" --root /path/to/project --inventory "$OUT/inventory/inventory.json" --out "$OUT/deps"
bash "$SKILL_DIR/scripts/bundled-libs.sh" --root /path/to/project --inventory "$OUT/inventory/inventory.json" --out "$OUT/libs" --osv
bash "$SKILL_DIR/scripts/vuln-lookup.sh" --inventory "$OUT/inventory/inventory.json" \
  --prod-versions "$OUT/prod-versions.txt" --out "$OUT/vulns"
```

Script output is candidates, never findings. A lookup with no data is not a clean result: premium, custom and committed code needs the depth its bucket calls for.

**Existing scanner results.** When the project already runs SonarQube, Snyk, GitHub code scanning (CodeQL) or another scanner (`inventory.json` → `project.existing_scanner_configs`) and the owner can share recent results (a SARIF or JSON export, or read access), ingest them as candidates: each goes through Verify like any tool output and is cited as `[<tool>]`. Never treat a scanner's severity as the rating, and never count its open alerts as findings without tracing them.

---

## 3. Component depth (parallel)

| Bucket | Depth | Output |
|---|---|---|
| **Custom plugin** | full `wp-plugin-code-audit` | a working report in the audit's working folder, merged into the report as an annex |
| **Custom theme** (including child themes) | full `wp-theme-code-audit`; for a child, the parent is named and audited separately only if custom | a working report in the audit's working folder, merged into the report as an annex |
| **Committed third-party** | hotspot pass: unauthenticated REST `permission_callback`, `nopriv` AJAX, file paths built from input, `unserialize` on request or low-trust data, remote update endpoints, direct-access PHP that bootstraps WordPress | findings in the project report under the component |
| **Managed third-party** (wp.org, premium artifact, VCS) | lookups only (phase 2), unless a lookup or the owner gives a reason to read code | lookup results under the component |
| **Must-use and drop-ins** | custom: full plugin-skill review; third-party: as its owning bucket; every loader checked for missing targets | as above |
| **Core** | version lookup; checksums in phase 6 | General |

Give each component audit the answers the component skill would otherwise ask for: a working report path in the audit's working folder (outside the project, never next to the deliverable; the working report is merged into an annex and never referenced), distribution and update channel from the inventory, active status per site, the production version, and the owner's operating constraints. Brief templates: `references/subagent-briefs.md` (S6, S7, S8).

### Fan-out plan

Run the phase 2 sweeps and the phase 3 component audits as parallel subagents. Each scanner writes **one section file** to a scratch folder outside the project (`<scratch>/sections/NN-name.md`) following the output contract in `references/subagent-briefs.md`; the orchestrator merges.

| Work | Model tier |
|---|---|
| Custom plugin and theme audits, the merge, correlation, spot-checks | the strongest available model |
| Dependency audit, vulnerability lookup and vendor compromise, secrets, deploy and exposure, access and privacy, hotspot passes | a mid-tier model |
| Running the scripts (and the authorized live-site check) and returning pass/fail with counts | the smallest model |

Every brief carries the read-only block, the masking rules and the section contract, so a subagent needs nothing from the conversation.

**Sequential fallback.** When subagents are unavailable, run the same briefs one after another in this order, writing the same section files: runner (scripts), dependencies, vulnerabilities and vendor, secrets, deploy and exposure, access and privacy, then one component audit at a time (custom plugins, custom themes, hotspot passes). The merge is identical. Say in the method section that the run was sequential.

---

## 4. Verify (mandatory)

Apply the plugin skill's Verify table and `false-positive-traps.md` to every code finding, and the theme skill's Verify rules to every theme finding. Then the project traps:

| Trap | Check |
|---|---|
| **Dev-only advisory** | The Ships column says no: Info, grouped per lockfile. Never a Critical because the tool said critical. |
| **Premium component with no data** | "No data" is not clean. The bucket decides the depth; say what was read. |
| **Free-slug advisory on a premium build** | Marked "assumed shared code" until the vulnerable function or route is found in the premium source (`file:line`), else verified false. |
| **Version-line mismatch** | Installed and advisory numbering differ (premium line vs free line, fork, namesake): resolve by reading the advisory against the source before matching a range. |
| **Inactive or unreachable component** | Inactive on every production site: Info as dead code, unless it has directly requestable PHP or a must-use loader (correlation rule 9). Active status `unverified`: rate as active and say so. |
| **Local vs production version** | Every lookup finding states which version it matched. A local-only version is a note, not a finding. |
| **Namesake slug** | A custom component with advisories under its slug is almost always a different product on wp.org. |
| **Development-tool slug match** | The inventory flags slugs that look like debug, profiler, file-manager or database tools. Confirm what the plugin is before rating. |
| **Untracked local artifact** | A dump, archive, log, export, backup or IDE/OS file that exists only on the local copy (not tracked in git or its history, not on production, not copied by a non-clean-checkout deploy) is out of scope: not a finding, not verified false, not mentioned anywhere in the report. Scratch tables in a local database are the same: at most an open question about production. Rule: `references/inventory.md` §11. |
| **Soft 404 in live checks** | A `200` HTML page for `/.env` or `/.git/HEAD` is usually the theme's 404 template; only a content marker proves exposure. |
| **Public identifier as a secret** | Publishable keys and site keys are public by design (`secrets-scan.md` §1). |

**Assumed-shared-code hits below Critical and High** (free-slug advisories on premium builds): when the premium source is available, trace at least one per component to source (find the function, route or file the advisory names) and apply the result to the others with the same root cause; record the rest as "assumed shared code, not traced" and list them under open questions. When the source is not available, mark every one assumed and list them under open questions. A Critical or High is never reported without a trace.

**Supply-chain signals** (`vulns.md` top block: backdoor, injected or malicious code, compromised or sold plugin, hijacked updates) go to `references/vendor-compromise.md` whatever their version match.

**Every raw candidate is accounted for.** `vuln-lookup.sh`, `dep-audit.sh` and `bundled-libs.sh` each write a `candidates.tsv`, the authoritative candidate list. Every row ends up in the report as a finding or in Verified false with a reason; scanners and the merge run the coverage check in `references/subagent-briefs.md` (Section file contract → Completeness) and require zero missing rows. The merge reads the raw candidate lists, not only section files. When comparing with a previous report, check the raw script outputs before calling a previous finding "missed": missed means absent from the raw outputs too, not only from a section file. That comparison is an internal check to catch misses; its results are never report content.

**Spot-check every Critical and High against source before the report.** Open the cited file and lines (or the advisory and the matching source) yourself. Internally a finding is either re-checked by the merge or cited by one reviewer; in the report that becomes a plain evidence label: "independently re-checked in source", "traced in source (single review)", "confirmed on production files", "advisory and version match", "owner's production check" or "observed on the live site (owner-authorized)" (legend: `references/report-template.md` → Evidence labels). A Critical or High with only a single review does not go into the report: re-check it first.

**Counts are findings too** (plugin `SKILL.md` → Verify): every number in the report comes from a captured command.

---

## 5. Correlate

Cross-component findings, each needing **two or more components, or a component plus config**. Rules with fabricated examples: `references/correlation.md`.

1. Build flags x dev advisories.
2. Deploy excludes x files present.
3. Lockfile vs disk vs production drift.
4. Widened kses or capability filters x meta or REST exposure x role counts.
5. Third-party write path x custom template sink.
6. Same-origin legacy site x any XSS.
7. File editing enabled x any path to an admin session.
8. Unmanaged production components x known advisories.
9. Inactive-but-deployed code with public endpoints.

Correlations are `G-` findings that cite each part's own ID. Rate the chain end to end under the rubric; the parts keep their own IDs and ratings.

---

## 6. Production verification (optional)

Two optional parts. Both are read-only; neither is run without the owner's go-ahead.

### 6a. Production check (owner-run)

For questions only production can answer: is the deployed copy the committed copy, is core intact, what does the real `wp-config.php` set, is there a dropper. Full procedure: `references/production-check.md`.

```bash
# Locally, from trusted copies (vendor zips for the deployed versions, the repo at the deployed commit):
bash "$SKILL_DIR/scripts/prod-check.sh" manifest /path/to/trusted/acme-slider-pro plugin-acme-slider-pro.sha256
# The owner, on production, from the WordPress root:
bash prod-check.sh check --manifests ./manifests --ioc-names ioc-names.txt --ioc-strings ioc-strings.txt --out ~/prod-check
```

It compares core against the official checksums (`https://api.wordpress.org/core/checksums/1.0/?version=<v>&locale=<l>`, or `wp core verify-checksums`), wp.org plugins with `wp plugin verify-checksums`, and every manifest; looks for near-miss core file names (a dropper named like a core file with one letter changed); prints the `wp-config.php` structure as constant names and booleans only; and greps for suspicious call patterns. Its output contains no names, emails, values or secrets.

Production files the owner sends are kept **outside the webroot and outside any git repository**, never quoted beyond `path:line`, and deleted afterwards.

### 6b. Live-site checks (owner-authorized)

Safe, rate-limited HTTP requests against a site the owner controls and has authorized in writing: sensitive paths (`/.env`, `/.git/HEAD`, `/wp-config.php`, `/wp-config.php.bak`, `/readme.html`, `/license.txt`, `/xmlrpc.php`, `/wp-json/wp/v2/users`), directory listing on uploads, security headers (Content-Security-Policy, X-Frame-Options or `frame-ancestors`, Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy), HTTPS redirect and mixed content, login protection as observed on one page load (rate limiting, CAPTCHA, MFA and SSO are confirmed with the owner; never brute force), and WAF or CDN presence from response headers (`cf-ray`, `x-sucuri-id`, server headers). Full procedure: `references/live-site-checks.md`.

```bash
bash "$SKILL_DIR/scripts/live-check.sh" --url https://example.com --authorized --out "$OUT/live"
```

The OWASP ZAP baseline scan is an optional extra for this phase: passive mode only, with the same explicit authorization. Record who authorized what, and when, in the report's Sources.

---

## 7. Report

Follow the plugin skill's report rules (plugin `SKILL.md` → Report): ask where to write, default to `.claude/`, check git-ignore status, keep a dated history, never overwrite, inline summary in chat (path + verdict + counts + top 3).

Deltas:

- **Filename:** `PROJECT-AUDIT-<yyyy-mm-dd>.md`; same-day rerun `PROJECT-AUDIT-<yyyy-mm-dd>-<HHMM>.md`.
- **One self-contained document.** The deliverable is the single `PROJECT-AUDIT-<yyyy-mm-dd>.md`. Every full component audit is embedded as an annex, "Annex N: <slug> (plugin | theme | child theme of <parent>)", carrying all of that component's findings (all severities, with location, precondition, impact, evidence and fix), its verified-false items, a short checked-and-clean list and its sections-audited list. Per-component open questions go to Appendix D and owner decisions to the Decisions table. Working reports from the component audits stay in the audit's working folder (never next to the deliverable) and are never referenced: the report never names or links another report file and never says "see component report"; it says "see Annex N". Offer to git-ignore `PROJECT-AUDIT-*.md`.
- **Plain language.** No process words in the report (orchestrator, scanner, subagent, brief names, section files, model tiers), and never the names of the audit skills or their scripts and files: describe the method in plain terms and name only external tools and data sources (`references/report-template.md` → Citing evidence); evidence uses the plain labels in `references/report-template.md` → Evidence labels, with the legend in the Method appendix.
- **Counts:** the header counts equal the distinct finding IDs per severity across the whole document; a finding summarized in the main body and detailed in an annex is counted once.
- **Structure, by area:**
  1. **Summary**: a plain-language executive summary for non-technical readers first, then the project verdict (production as deployed), counts per area and severity, top 3 to fix first across all areas, decisions needed from the owner, and a **findings table** (Finding: ID and title · Area · Category: security / performance / standards · Recommendation: one line · Priority: severity). No effort column: effort estimation is out of scope. An optional short glossary follows.
  2. **General / codebase**: Scope (including what is not covered, such as infrastructure as code), platform state (WordPress and PHP versions, PHP support status, who owns core and PHP updates), dependencies, lockfiles and dependency monitoring, deploy and CI, webroot and live-site exposure, secrets, `wp-config.php` and hosting hardening, users and access, development tools, activity logging and approved plugins, privacy and data hygiene, multisite and origin topology, production drift, cross-component correlations.
  3. **Plugins**: custom, then committed third-party, then managed third-party. Each subsection opens with an **identity line**: version (and production version), source, ownership, update channel, active status per site.
  4. **Themes**: custom, child (with the parent named), third-party; same identity line.
  5. **Component inventory** (appendix): every plugin and theme, including those with no findings, with a per-component verdict column.
  6. **Future considerations**: strategic items too large for a fix line (replatforming a classic or page-builder site to the block editor, retiring a legacy site, consolidating a multisite, commissioning a professional penetration test). No IDs, not counted in the verdict.
  7. **Checked and clean, verified false, open questions for production, sources, method** (with the evidence-label legend).
  8. **Annexes**: one per full component audit, as above. Sources say what the audit was based on: repository URL and commit, branch, production lists and when they were received, production and live check dates, database export used or not. Private material is named, never linked.
- **IDs:** `G-` general, `P-<slug>-` plugins, `T-<slug>-` themes (for example `P-acme-forms-H1`), mapping one to one onto each component audit's local IDs (never renumber when building the annexes). When an owner answer changes a rating, rewrite the severity and rationale and keep the ID; the report shows only the current state. Method carries an **Audit runs** table (date, run, what it covered); history of how the report itself changed is not report content.
- **Fix lines** follow the plugin skill's Fix guidance by ownership table, by bucket: custom code gets the code change; distributed third-party code gets update, report, or mitigate without touching vendor files, and the fix says edits to the vendor's files are overwritten on update; committed copies are forks, and any local patch is recorded as one.

- **Standards reference (optional):** best-practice findings may cite 10up's public Engineering Best Practices (https://10up.github.io/Engineering-Best-Practices/) alongside the WordPress coding standards.

Full skeleton and a fabricated worked example: `references/report-template.md`.

### Verdict

- **Project verdict** uses the plugin skill's Verdict Rules over every finding that applies to **production as deployed**: active components on production sites, production versions, production config. Findings that only apply locally, or only to inactive and unreachable code, do not drive it. When production versions or config are unconfirmed, say so in the verdict reasoning.
- **Per-component verdict** (inventory column): the verdict of the component's annex for fully audited components; for lookup and hotspot components, the same rules over that component's findings, or "lookup clean" / "no data" when there are none.
- `[DECISION]` findings do not enter the table (plugin `SKILL.md` → Verdict Rules), but say which ones block fixes.

---

## After the audit

Hand off to `wp-plugin-audit-remediation` for the remediation log, the frozen audited copy and the behaviour-neutrality checks. Track the report's prefixed IDs in the log; each annex's IDs map one to one onto the component audit's C/H/M/L/I IDs.

---

## Anti-patterns

- **Auditing the local checkout and calling it production.** Ask for the production lists first; rate at the production version.
- **Recalling active status.** Read it (WP-CLI or database) or write "unverified".
- **Starting services to get an answer.** Ask first.
- **Treating "no CVE" as clean.** Premium and committed code with no advisories can hold unauthenticated Criticals.
- **Rating dev-only advisories by the tool's severity.** The Ships column decides.
- **Applying free-slug advisories to premium builds without reading the premium source.**
- **Telling the owner to edit a vendor's files** as the fix for distributed third-party code.
- **Unmasked secrets or wp-config values** anywhere: notes, section files, the report.
- **Opening database dumps.** Identify them by name and size only.
- **Live-site requests without written authorization**, or against anything the owner does not control. No login attempts, ever.
- **User names or emails in the report.** Role counts and IDs only.
- **Merging scanner output without spot-checking the Criticals and Highs.**
- **Renumbering IDs** when an owner answer changes a severity.

---

## References

- `references/inventory.md`: root shapes, topology, buckets, active status per site with the database fallback, production versions and drift.
- `references/dependency-audit.md`: per-lockfile audits, runtime / dev / ships-to-production, build-flag checks.
- `references/component-vuln-lookup.md`: WPVulnerability, Wordfence feed, wp.org; free and premium slugs; version-line sanity; bundled libraries; staleness and slug ownership.
- `references/vendor-compromise.md`: vendor trust checks, update endpoints, known-good comparison.
- `references/deploy-and-exposure.md`: exclude lists, webroot exposure, CI log leakage, uploads, must-use loaders, `wp-config.php` hardening.
- `references/secrets-scan.md`: patterns, public identifiers vs secrets, masking, git history, database dumps.
- `references/correlation.md`: cross-component rules with fabricated examples.
- `references/access-and-privacy.md`: users and access, development tools on production, admin-action logging, privacy and data hygiene.
- `references/live-site-checks.md`: owner-authorized read-only HTTP checks, optional OWASP ZAP baseline, rating.
- `references/production-check.md`: owner-run check, manifests, reading the output, handling production files.
- `references/subagent-briefs.md`: standalone briefs per scanner and the merge, output contract, model tiers.
- `references/report-template.md`: area-sectioned skeleton and a fabricated worked example.
- `references/bundled-libraries.md`: the signature table `bundled-libs.sh` reads (grow it by adding rows) and how to check versions.
- `scripts/inventory.sh`, `scripts/dep-audit.sh`, `scripts/vuln-lookup.sh`, `scripts/bundled-libs.sh`, `scripts/prod-check.sh`, `scripts/live-check.sh`: bash entry points; python3 standard library for JSON and version comparison; curl and the public APIs for lookups; `jq` not required. All read-only on the audited project, writing to the directory passed with `--out` (default a new temp dir).
- Plugin skill `SKILL.md` (rubric, verdict, IDs, report rules, Fix guidance by ownership), `references/false-positive-traps.md`, `references/security-checklist.md`, `references/standards-checklist.md` (folder slug ownership), `references/report-template.md`.
- Theme skill `SKILL.md` (Verify), `references/theme-security-checklist.md` (role table, bundled libraries).

---

## Related skills

- `wp-plugin-code-audit` (**required**): shared rubric, verdict, IDs, report rules, checklists; audits each custom plugin.
- `wp-theme-code-audit` (**required**): audits each custom and child theme.
- `wp-plugin-audit-remediation`: the phase after the audit.
- `wp-wpcli-and-ops`: WP-CLI usage for the read-only commands the owner runs.
- `wp-project-triage`: repo-shape inspection, useful alongside the inventory.
