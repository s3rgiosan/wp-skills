# Subagent Briefs

Standalone brief templates for the phase 2 and phase 3 fan-out, and the merge. Each brief is complete on its own: a subagent receives only the brief, the inventory, and the paths filled in below, never the conversation.

Fill the placeholders before dispatch: `<PROJECT>` (project root), `<WP_ROOT>`, `<SCRATCH>` (the run's scratch folder, outside the project and outside any git repository), `<SKILL>` (this skill's folder), `<SCRIPTS>` (`<SKILL>/scripts/`), `<WORK_REPORTS>` (`<SCRATCH>/component-audits/`: where component audits write their working reports; never next to the deliverable), `<DATE>`, `<PLUGIN_SKILL>` and `<THEME_SKILL>` (the located skill folders; see SKILL.md → Shared conventions).

---

## Model tiers

| Tier | Use for |
|---|---|
| **Strongest available model** | custom plugin and theme audits (phase 3), the merge, correlation (phase 5), the spot-check of every Critical and High |
| **Mid-tier model** | dependency audit, vulnerability lookup and vendor compromise, secrets, deploy and exposure, access and privacy, committed third-party hotspot passes |
| **Smallest model** | running a script or command list (including the authorized live-site check) and returning pass/fail with counts, no interpretation |

When only one model is available, use it for everything; the tiers are a cost choice, not a correctness one.

---

## Rules every brief includes

Paste this block into every brief:

```text
READ-ONLY. You audit; you never change the project.
- Do not edit, create, move or delete anything under <PROJECT> or <WP_ROOT>.
- Do not run composer install/update/require, npm install/ci/update, wp plugin install/activate/deactivate/update,
  wp db import/export/query with writes, git add/commit/checkout/stash/reset/push, or any migration.
- Do not start, stop or restart services (web server, database, containers, local environment). If something you
  need is not running, write it under "Open questions for production" and continue.
- Write only to your section file in <SCRATCH>/sections/ and to scratch files under <SCRATCH>/work/<your-name>/.
- Never open database dumps (*.sql, *.sql.gz, *.dump). List candidate ones by path and size only.
- Local artifact rule (<SKILL>/references/inventory.md §11): dumps, archives, logs, exports, backups and IDE or OS files
  are raised only when tracked in git (or in its history), present on production, or copied by a deploy that does not
  run from a clean checkout. Untracked local files, and scratch tables in a local database, are never raised and never
  written into the section file.
- Secrets: record key or variable name, file:line and the first 4 characters of the value followed by "…". Never more,
  in any file you write.
- wp-config.php and .env: constant or variable names and booleans only. Never values.
- Every number you write comes from a command whose output you saved under <SCRATCH>/work/<your-name>/.
- Every candidate is marked "scanner-cited". Only the orchestrator marks "verified by orchestrator". These are internal
  statuses; the report writes them as plain labels: "verified by orchestrator" becomes "independently re-checked in
  source", "scanner-cited" becomes "traced in source (single review)" (or "advisory and version match" for a lookup
  hit not traced in code). See report-template.md → Evidence labels.
- The report is read by people who never see <SCRATCH>. Cite evidence by its source (file:line in the audited
  code, "the owner's answers (date)", "the production file check (date)"), never by a scratch file name or a temp path.
```

## Section file contract

Each scanner writes exactly one file, `<SCRATCH>/sections/<NN>-<name>.md`, with these sections in this order (empty sections say "None."):

```markdown
# <NN> <name>

## Scope covered
What was scanned (paths, lockfiles, components), what was skipped and why, tools available / unavailable.

## Candidates
### <proposed ID> · <severity> · `<file>:<line>` · short title
- Area: General / Plugin <slug> / Theme <slug>
- Ownership: custom / third-party distributed / committed or forked / abandoned or closed
- Trace: source to sink, or the lookup record (source, range, production version)
- Precondition: the lowest role or condition that reaches it
- Status: scanner-cited
- Fix line: per the ownership table (plugin SKILL.md → Report → Fix guidance by ownership)

## Checked and clean
One line per check that produced nothing, with the command.

## Verified false
Candidates dropped, with the reason and the command or file read that disproved them.

## Open questions for production
Questions only the owner or production can answer, each with what it would change.

## Commands run
Command, output file under <SCRATCH>/work/, and the count it produced.
```

Proposed IDs use the area prefix (`G-`, `P-<slug>-`, `T-<slug>-`) plus severity letter and a scanner-local number (`G-H1`). The orchestrator allocates final IDs at the merge; scanners never assume theirs are final.

### Completeness: every candidate row is accounted for

`vuln-lookup.sh`, `dep-audit.sh` and `bundled-libs.sh` each write a `candidates.tsv`: the authoritative candidate list (first column `advisory_id`, second column the component or lockfile). A scanner that consumes one must account for **every row** in its section file: either as a candidate under Candidates (with its proposed ID) or under Verified false with a one-line reason (dismissed, misattributed, not reachable, dev only, duplicate of another row). No silent drops, whatever the severity. Cite the `advisory_id` and the component slug (or lockfile path) on the same line, so the check below can find it.

Before handing back, run the coverage check and include its last line in the section file's Commands run. Zero missing is required.

```bash
cat > <SCRATCH>/work/coverage.py <<'PYCHECK'
import csv, sys
rows = list(csv.DictReader(open(sys.argv[1]), delimiter="\t"))
lines = [l for f in sys.argv[2:] for l in open(f, errors="replace")]
key2 = list(rows[0].keys())[1] if rows else None
missing = [r for r in rows if not any(r["advisory_id"] in l and r[key2].split()[-1] in l for l in lines)]
for r in missing:
    print("MISSING:", r["advisory_id"], r[key2])
print("rows: %d, missing: %d" % (len(rows), len(missing)))
sys.exit(1 if missing else 0)
PYCHECK
python3 <SCRATCH>/work/coverage.py <SCRATCH>/vulns/candidates.tsv <SCRATCH>/sections/20-vulnerabilities.md
```

---

## S1. Command runner (smallest model)

```text
You run commands and report results. You do not interpret findings.
<READ-ONLY block>
Run, in order, saving stdout and stderr of each under <SCRATCH>/work/runner/:
  bash <SCRIPTS>/inventory.sh --root <PROJECT> --out <SCRATCH>/inventory [--db-fallback --db-socket <SOCKET>] [--custom-prefix <PREFIX>]
       [--approved <APPROVED_LIST>] [--php-version <PROD_PHP>]
  bash <SCRIPTS>/dep-audit.sh --root <PROJECT> --inventory <SCRATCH>/inventory/inventory.json --out <SCRATCH>/deps
  bash <SCRIPTS>/vuln-lookup.sh --inventory <SCRATCH>/inventory/inventory.json --out <SCRATCH>/vulns [--prod-versions <FILE>]
       [--php-version <PROD_PHP>]
  bash <SCRIPTS>/bundled-libs.sh --root <PROJECT> --inventory <SCRATCH>/inventory/inventory.json --out <SCRATCH>/libs --osv
Never type database credentials into a command; --db-fallback reads them from wp-config.php itself.
Report back, per command: exit code, the summary lines it printed, and any error line. Nothing else.
Section file: <SCRATCH>/sections/00-runner.md with one line per command: PASS or FAIL, counts, output path.
```

## S2. Dependency audit (mid-tier)

```text
Goal: every dependency advisory in <PROJECT>, classified by whether it reaches production.
<READ-ONLY block>
Inputs: <SCRATCH>/deps/dep-audit.json and dep-audit.md, <SCRATCH>/inventory/inventory.json.
Method: follow <SKILL>/references/dependency-audit.md. Resolve every Ships value that starts with "check" by reading the
build line it cites and the deploy files listed in the inventory. Group dev-only advisories into one Info per lockfile.
Advisories in lockfiles owned by third-party components go under that component's area.
Account for every row of <SCRATCH>/deps/candidates.tsv (Section file contract → Completeness) and run the coverage check
against 10-dependencies.md before handing back; zero missing.
Also check continuous monitoring (dependency-audit.md §5): Dependabot, Renovate or Snyk config covering every shipping
lockfile directory. If existing scanner results were provided (SonarQube, Snyk, code scanning SARIF), list each result
as a candidate cited "[<tool>]", traced like any other.
Section file: <SCRATCH>/sections/10-dependencies.md
```

## S3. Vulnerability lookup and vendor compromise (mid-tier)

```text
Goal: known advisories at the production version for every plugin, theme and core, and vendor trust signals.
<READ-ONLY block>
Inputs: <SCRATCH>/vulns/vulns.json and vulns.md, the inventory, the owner's production list if provided.
Method: follow <SKILL>/references/component-vuln-lookup.md and vendor-compromise.md.
- For every hit marked "assumed shared code", grep the premium source for the function, route or file the advisory
  names; keep the candidate only if found, citing file:line.
- Resolve every version-line flag by reading the advisory against the installed source.
- Read <SCRATCH>/libs/bundled-libs.md: for every library (all components, including lookup-only ones) confirm the
  version, check the library's own advisories, and say whether it loads on the front end.
- Read the "Supply-chain signals" block at the top of vulns.md first; each entry is a vendor-compromise candidate.
- Before grepping premium source for an assumed-shared-code hit, confirm the advisory describes this product
  (misattributed advisories go to verified false as "misattributed to this slug").
- Below Critical and High: trace at least one assumed-shared-code hit per component when source is available; list
  the untraced rest under open questions.
- For each third-party vendor: update endpoint hosts, closed plugins by the same author, supply-chain advisories.
- "No data" components: list them; they are not clean.
- Read the "## PHP" section of vulns.md (the `php` field of vulns.json): an unsupported or end-of-life production PHP
  version is a finding under the report's Core and PHP section. When no PHP version was supplied, note that instead of
  a finding.
- Completeness: every row of <SCRATCH>/vulns/candidates.tsv and <SCRATCH>/libs/candidates.tsv appears in the section file,
  as a candidate or under Verified false with a reason, including Medium and Low "assumed shared code" rows. Run the
  coverage check for both lists against 20-vulnerabilities.md before handing back; zero missing.
Section file: <SCRATCH>/sections/20-vulnerabilities.md
```

## S4. Secrets and history (mid-tier)

```text
Goal: secrets and sensitive files in tracked files and git history, masked.
<READ-ONLY block>
Method: follow <SKILL>/references/secrets-scan.md. Keep only file:line from grep output; open each line yourself and
write the masked form (name, file:line, first 4 characters + "…"). Separate public identifiers from secrets.
List candidate database dumps and archives (inventory.json → project.local_artifact_candidates: tracked, in history or
on production) by name and size; never open them. Untracked local files are out of scope; leave them out entirely.
Section file: <SCRATCH>/sections/30-secrets.md. Before finishing, grep your own section file for any run of 12 or more
characters from a matched value; if found, rewrite the entry.
```

## S5. Deploy, CI and exposure (mid-tier)

```text
Goal: what reaches the production webroot and what leaks on the way.
<READ-ONLY block>
Inputs: inventory.json (deploy_files, ci_files, hosting_hints, orphaned_mu_loaders), the owner's deploy answer.
Method: follow <SKILL>/references/deploy-and-exposure.md. Start from <SCRATCH>/inventory/webroot-exposure.tsv: every
path marked "reaches webroot if deployed" is a required input to the exposure finding. Then: exclude-list coverage, CI log leakage
(set -x, echoed variables, credentials in URLs), PHP under uploads, logs and exports written to web-readable paths,
must-use loaders and drop-ins, wp-config.php hardening constants (names and booleans only). Apply the local artifact
rule: only tracked or production files are exposure candidates; untracked local files are left out entirely.
Section file: <SCRATCH>/sections/40-deploy-exposure.md
```

## S6. Custom plugin audit (strongest model), one per plugin

```text
Goal: a full wp-plugin-code-audit of <PROJECT>/<path-to-plugin>, written as a working report that the merge embeds as an
annex of the project report.
<READ-ONLY block>
Load the wp-plugin-code-audit skill from <PLUGIN_SKILL> and follow it end to end, with these fixed answers:
- Report path: <WORK_REPORTS>/plugins/<slug>/AUDIT-<DATE>.md, in the working folder (outside the project, never next to
  the deliverable). Do not ask where to write: this fixed path is the "user already specified a path" case in the plugin
  skill's own Report → Where to write the report rule, so the rule is satisfied, not overridden. Never overwrite: if it
  exists, use AUDIT-<DATE>-<HHMM>.md. Write it in plain language: no process words, evidence cited by source.
- Distribution and update channel, active status per site, production version: from the inventory entry below.
- Operating constraints: from the owner's answers below, or "not reported".
- Environment: static only unless told otherwise; skip phase 5 (Reproduce) if no disposable environment is provided.
Inventory entry: <paste the component's JSON>
Owner answers: <paste>
Section file: <SCRATCH>/sections/5x-plugin-<slug>.md containing only: the working report path, the verdict, the counts,
and one line per finding (local ID, severity, file:line, title, precondition). The working report is the source of truth
for the annex; the project report never names it.
```

## S7. Custom theme audit (strongest model), one per theme

```text
Goal: a full wp-theme-code-audit of <PROJECT>/<path-to-theme>, written as a working report that the merge embeds as an
annex of the project report.
<READ-ONLY block>
Load wp-theme-code-audit from <THEME_SKILL> (it loads wp-plugin-code-audit from <PLUGIN_SKILL>) and follow it end to
end. Fixed answers as in S6, with report path <WORK_REPORTS>/themes/<slug>/THEME-AUDIT-<DATE>.md.
For a child theme, name the parent and its bucket; the parent is audited separately only if it is custom.
Data-supplying plugins: from the inventory (active plugins whose fields the templates render).
Section file: <SCRATCH>/sections/6x-theme-<slug>.md in the same short form as S6.
```

## S8. Committed third-party hotspot pass (mid-tier), one per component

```text
Goal: the high-yield vulnerability classes in third-party code that is committed to the repo and outside its vendor's
update path. Not a full audit.
<READ-ONLY block>
Target: <PROJECT>/<path>. Skip vendor/ and node_modules/ inside it.
Check, reading every hit in context (plugin skill references/security-checklist.md for each class, and
references/false-positive-traps.md before writing any candidate):
- register_rest_route with permission_callback __return_true or missing, and what the callback does (§1.1);
- wp_ajax_nopriv_ handlers, and wp_ajax_ handlers without a capability check or nonce (§1.2, §2);
- file paths built from request input: include/require, file_get_contents, fopen, unlink, readfile (§6);
- unserialize / maybe_unserialize on request data, cookies, or options a low role can write (§8);
- remote update or licence endpoints: hosts, whether responses are verified, whether they can install code;
- direct-access PHP files that bootstrap WordPress themselves (require of wp-load.php) or lack an ABSPATH guard.
Fix lines follow the "committed or forked" row of the ownership table: update from the vendor, report, mitigate
without editing vendor files; any local patch is a fork.
Section file: <SCRATCH>/sections/7x-hotspot-<slug>.md
```

## S9. Access, privacy and hygiene (mid-tier)

```text
Goal: who can log in with what power, development tools on production, admin-action logging, and where personal data
lives. Counts and IDs only.
<READ-ONLY block>
- Never write a user name, display name or email. Role counts, user IDs and booleans only.
Inputs: inventory.json (active_status.sites[].role_counts, open_registration, default_role, access, signals,
outside_wp_content, project.database_dumps), prod-check output section 12 if the owner ran it.
Method: follow <SKILL>/references/access-and-privacy.md: role and super admin counts per site, open registration and
default role, application passwords, dormant accounts where a log plugin exposes it; development tools active on
production (confirm what each flagged slug is); activity-log presence (Info when absent); plugins not on the approved
list; personal data stores in custom code and whether they register personal-data exporters and erasers; dumps that
are local artifact candidates (tracked, in history or on production), described by name and size only; data on a remote,
reachable staging system. Local development databases and untracked local dumps are out of scope; leave them out.
Section file: <SCRATCH>/sections/45-access-privacy.md
```

## S10. Live-site checks (smallest model), only after written owner authorization

```text
Goal: run the read-only live checks against <SITE_URL> and report results. You do not interpret findings.
Precondition: the orchestrator confirms the owner authorized requests to <SITE_URL> for this audit (who, when).
If that confirmation is missing from this brief, stop and report "not authorized".
Run: bash <SCRIPTS>/live-check.sh --url <SITE_URL> --authorized --out <SCRATCH>/live
Do not run any other request against the site: no curl by hand, no login attempts, no scanners.
Section file: <SCRATCH>/sections/80-live.md with the script output summary (status codes, yes/no markers) and the
authorization line.
```

## M. Merge (strongest model, normally the orchestrator)

```text
Goal: one self-contained PROJECT-AUDIT-<DATE>.md from the section files and the component audits' working reports.
Inputs: every file in <SCRATCH>/sections/, every working report under <WORK_REPORTS>, the inventory, and the raw
candidate lists <SCRATCH>/vulns/candidates.tsv, <SCRATCH>/deps/candidates.tsv, <SCRATCH>/libs/candidates.tsv.
Steps:
0. Completeness across the pipeline: run the coverage check with every raw `candidates.tsv` (vulns, deps, libs) against
   all section files together (`python3 <SCRATCH>/work/coverage.py <list> <SCRATCH>/sections/*.md`). Any missing row goes
   back to its scanner, or the orchestrator traces it; a row is never dropped at the merge.
1. Check each section file against the contract. Reject and rerun any that is missing sections, cites numbers without
   a command, or contains an unmasked secret or a wp-config value.
2. Verify (SKILL.md → Verify): apply the project traps; open the source for every Critical and High and mark each
   "verified by orchestrator" or leave "scanner-cited" (never promote without reading the source). In the report, write
   the plain evidence labels (report-template.md → Evidence labels), never the internal statuses.
3. Correlate (references/correlation.md) across sections and the working reports.
   When a previous report exists, compare against it internally, only to catch misses: check the raw script outputs
   (candidates.tsv, vulns.json, dep-audit.json, bundled-libs.json, inventory.json) before calling any previous finding
   "missed". A finding present in the raw output but absent from the section files is a scanner omission: restore it.
   "Missed" is only for findings absent from the raw outputs too. None of this comparison goes into the report: no
   reconciliation appendix, no mapping to previous IDs, no reference to the previous report file, no re-rating notes.
4. Allocate final IDs: G- for general and correlations, P-<slug>- and T-<slug>- mapping one to one onto each component
   audit's local IDs (the plugin audit's H1 becomes P-acme-forms-H1). Never renumber.
5. Build the annexes: one "Annex N: <slug> (plugin | theme | child theme of <parent>)" per working report, carrying every
   finding (all severities: location, precondition, impact, evidence with its plain label, fix) under its prefixed ID,
   the verified-false items, a short checked-and-clean list and the sections-audited list. Move each component's open
   questions to Appendix D and its owner decisions to the Decisions table.
6. Write the report from references/report-template.md, sectioned by area. Write the TL;DR last and place it first:
   Overall, What needs attention now (3 to 5), What is in good shape (2 to 3, verified only), Recommended next steps
   (3 to 5, containment first), At a glance. Check every TL;DR claim against a verified finding in the body; no IDs,
   file paths, plugin internals, attack mechanics, tool, skill or process words; it must read correctly if forwarded alone. The Plugins and Themes subsections summarize
   each annexed finding in one line with "see Annex N". Never name or link a working report or any other report file,
   never write "see component report", and use no process words (orchestrator, scanner, subagent, brief ids, section
   file, model tiers, "single-model run"). Never name the audit skills or their scripts and files (inventory.sh,
   dep-audit.sh, vuln-lookup.sh, bundled-libs.sh, prod-check.sh, live-check.sh, candidates.tsv); describe the method in
   plain terms and name only external tools and data sources (PHPCS/WPCS, PHPStan, Theme Check, Plugin Check,
   composer audit, npm audit, WPVulnerability, Wordfence, Patchstack, OSV, the wordpress.org APIs, php.net). Header counts are distinct finding IDs per severity across the whole document: a finding in the main body and
   its annex is counted once. Check: every prefixed ID in the annexes appears in the Summary findings table, and the
   header counts equal the number of distinct IDs per severity (grep the finding headings).
6b. State current severities only. Fill the Method "Audit runs" table (date, run, what it covered) from the runs of
   this audit; record withdrawn, superseded and re-rated findings in the working notes (or the remediation log), never
   in the report.
7. Delete <SCRATCH>/work/ contents that hold copies of project or production files; keep section files and working
   reports until the owner has the report. They are not part of the deliverable.
```
