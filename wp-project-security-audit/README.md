# wp-project-audit

Part of [wp-skills](../README.md): Claude Code skills for WordPress developers.

A Claude Code skill that runs an opinionated, verification-first security and vulnerability audit of a **whole WordPress project** (a `wp-content` repo, a full site root, or a Bedrock-style layout) and produces an area-sectioned markdown report with severity-sorted findings, fix recommendations by ownership, a collected list of `[DECISION]` questions only the owner can answer, and a **GO / NO-GO / GO WITH FIXES** verdict for **production as deployed**, with a verdict per component.

It covers everything the component audits cannot see: the component inventory with active status per site, dependency advisories with a ships-to-production column, known vulnerabilities at the production version (free and premium slugs, version-line sanity), wp.org staleness and slug-hijack risk, vendor compromise, bundled libraries, secrets and git history, deploy excludes, CI log leakage, webroot exposure, `wp-config.php` hardening, users and access, privacy and data hygiene, PHP end of life, dependency monitoring, optional owner-authorized live-site checks, and cross-component correlations. Custom plugins and themes are dispatched to their component audits, each producing its own report.

Orchestrates [wp-plugin-code-audit](../wp-plugin-code-audit) and [wp-theme-code-audit](../wp-theme-code-audit), and **requires both**: the severity rubric, `[DECISION]` markers, verdict rules, permanent finding IDs, report location rules, false-positive traps and the fix-guidance-by-ownership table live in the plugin skill and are referenced, not copied.

---

## Installation

Install **all three**: `wp-plugin-code-audit`, `wp-theme-code-audit` and `wp-project-audit`.

### Via Claude Code plugin marketplace (recommended)

```
/plugin marketplace add s3rgiosan/wp-skills
/plugin install wp-plugin-code-audit@s3rgiosan-wp-skills
/plugin install wp-theme-code-audit@s3rgiosan-wp-skills
/plugin install wp-project-audit@s3rgiosan-wp-skills
```

The plugin manifest declares `wp-plugin-code-audit` and `wp-theme-code-audit` as dependencies. Or wire all three `@s3rgiosan-wp-skills` entries into `settings.json` under `enabledPlugins` (see the [root README](../README.md#install-via-claude-code-plugin-marketplace-recommended) for the full snippet).

### Via shell script (fallback)

```bash
git clone https://github.com/s3rgiosan/wp-skills.git
cd wp-skills

# Default → ~/.claude (install the required component audit skills too)
bash wp-plugin-code-audit/install.sh
bash wp-theme-code-audit/install.sh
bash wp-project-audit/install.sh

# Custom Claude config dir (override via env var)
CLAUDE_CONFIG_DIR=~/.some-other-dir bash wp-plugin-code-audit/install.sh
CLAUDE_CONFIG_DIR=~/.some-other-dir bash wp-theme-code-audit/install.sh
CLAUDE_CONFIG_DIR=~/.some-other-dir bash wp-project-audit/install.sh
```

Uninstall:

```bash
bash wp-project-audit/uninstall.sh                                       # → ~/.claude
CLAUDE_CONFIG_DIR=~/.some-other-dir bash wp-project-audit/uninstall.sh   # → custom dir
```

### Requirements for the scripts

Bash, `python3` (standard library only), `git`, and `curl` for the public lookups. `composer` and `npm` are used for read-only lockfile audits when present; `jq` is not required. WP-CLI and a local database are optional: the database fallback reads credentials from `wp-config.php` itself, never from the command line, and active status falls back to "unverified" when neither works.

---

## Usage

Open a Claude Code session in the project and ask naturally:

```
"Audit this WordPress project for security issues."
"Is this site safe as deployed? Check every plugin and theme."
"Run a vulnerability sweep over this wp-content repo at the production versions."
"A vendor we use was compromised: are we affected?"
"Check the deploy, CI and secrets for this site before handover."
```

The skill runs seven phases (one optional):

1. **Discover and inventory**: root shape, multisite and table prefixes, same-origin sites, hosting, CI, deploy scripts and exclude lists, every lockfile; each component with bucket, versions and active status per site. Asks for the production plugin and theme lists up front.
2. **Automated sweeps** *(parallel)*: dependency audits, known-vulnerability lookup, wp.org signals, vendor compromise, bundled libraries, secrets and git history, deploy, CI and exposure.
3. **Component depth** *(parallel)*: custom plugins to `wp-plugin-code-audit`, custom themes to `wp-theme-code-audit`, committed third-party code to a hotspot pass, managed third-party code to lookups.
4. **Verify**: every candidate traced; every Critical and High spot-checked against source and marked verified by orchestrator or scanner-cited.
5. **Correlate**: findings that need two or more components, or a component plus config.
6. **Production verification** *(optional)*: an owner-run read-only check script with known-good manifests, core checksums and near-miss dropper names, and owner-authorized read-only live-site HTTP checks.
7. **Report**: one self-contained `PROJECT-AUDIT-<yyyy-mm-dd>.md`, sectioned by area, with every component audit embedded as an annex and evidence in plain-language labels.

The sweeps and component audits run as parallel subagents with model tiers (strongest model for custom-code review and the merge, mid-tier for sweeps, smallest for running scripts), each writing one section file that the orchestrator merges. Without subagents, the same briefs run sequentially.

---

## What the report looks like

````markdown
# Project audit: Acme Corp marketing site

**Verdict (production as deployed):** NO-GO
**Counts:** 1 critical, 3 high, 4 medium, 2 low, 3 info
**By area:** General 5 · Plugins 6 (custom 3, committed third-party 2, managed third-party 1) · Themes 2
**Top 3 to fix first:**
1. `P-acme-slider-pro-C1` unauthenticated file read through the slider's preview route
2. `G-H1` premium zips with a licence key served from the webroot
3. `P-acme-forms-H1` subscriber-readable entries export

## General / codebase
### Deploy, CI and exposure
### 🟠 HIGH — G-H1: `deploy/excludes.txt` — Premium zips and a licence key are served from the webroot
...

## Plugins
### Committed third-party plugins
#### acme-slider-pro
**Identity:** 2.4.0 (production 2.4.0) · committed premium · example-vendor · no update channel · active: site 1
### 🔴 CRITICAL — P-acme-slider-pro-C1: `includes/Preview.php:58` — Unauthenticated file read through the preview route
...

## Appendix A: Component inventory
| Type | Slug | Version (lock / disk / prod) | Bucket | Source and update channel | Ownership | Active per site | Depth | Verdict |
````

---

## What's in the skill

| File | Covers |
|---|---|
| **`SKILL.md`** | Phases, shared-convention deltas, fan-out plan and sequential fallback, project verification traps, verdict and report rules |
| **`references/inventory.md`** | Root shapes, topology, buckets, active status per site with the database fallback, production versions and drift |
| **`references/dependency-audit.md`** | Per-lockfile audits, runtime / dev / ships-to-production, build-flag checks |
| **`references/component-vuln-lookup.md`** | WPVulnerability, Wordfence feed, wp.org; free and premium slugs; version-line sanity; bundled libraries; staleness and slug ownership |
| **`references/vendor-compromise.md`** | Vendor trust checks, update endpoint hosts, known-good comparison |
| **`references/deploy-and-exposure.md`** | Exclude-list coverage, webroot exposure, CI log leakage, uploads, must-use loaders, `wp-config.php` hardening |
| **`references/secrets-scan.md`** | Patterns, public identifiers vs secrets, masking, git history, database dumps |
| **`references/correlation.md`** | Nine cross-component rules with fabricated examples |
| **`references/access-and-privacy.md`** | Users and access (counts only), development tools on production, admin-action logging, privacy and data hygiene |
| **`references/live-site-checks.md`** | Owner-authorized read-only HTTP checks: sensitive paths, listing, security headers, HTTPS, login protection, WAF hints; optional OWASP ZAP baseline |
| **`references/production-check.md`** | Owner-run check, manifests, reading the output, handling production files |
| **`references/subagent-briefs.md`** | Standalone briefs per scanner and the merge, output contract, model tiers |
| **`references/report-template.md`** | Area-sectioned skeleton and a fabricated worked example |
| **`scripts/inventory.sh`** | Components, buckets, lockfiles, CI and deploy files, active status and role counts per site, webroot exposure against deploy excludes (`webroot-exposure.tsv`), platform state, code outside `wp-content`, development tools, activity logs, approved list, monitoring, scanner and IaC signals → JSON + TSV |
| **`scripts/dep-audit.sh`** | `composer audit` / `npm audit` per lockfile → normalized JSON with dev / runtime / ships |
| **`references/bundled-libraries.md`** | Signature table for bundled JS and PHP libraries (grow it by adding rows) and how to check versions |
| **`scripts/bundled-libs.sh`** | Bundled library versions across every component, with optional OSV lookups → JSON + markdown |
| **`scripts/vuln-lookup.sh`** | Advisories at the given versions, free and premium slugs, wp.org signals, PHP end of life → JSON + markdown |
| **`scripts/prod-check.sh`** | Owner-run, read-only production check (including users and access counts); manifest generator |
| **`scripts/live-check.sh`** | Owner-authorized, rate-limited, read-only HTTP checks; prints status codes and header presence only |

All scripts are read-only on the audited project. `inventory.sh`, `dep-audit.sh` and `bundled-libs.sh` take `--root <project>` and refuse an `--out` path inside it; `prod-check.sh` takes `--root` as the production webroot and refuses `--out` inside that. `vuln-lookup.sh` takes no project root: it reads only inventory.json and prior script output, and queries public advisory APIs. `live-check.sh` also takes no project root and requires `--authorized`: it makes read-only HTTP requests against a live site the owner has authorized. Every script writes to the directory passed with `--out` (default: a new temp dir).

---

## Philosophy

**Production as deployed.** The verdict is about what runs: production versions, production sites, production config. A clean local checkout proves little about a server that runs a different version of the same plugin.

**No CVE is not clean.** Premium, committed and custom code often has no advisory record. The bucket decides how deep to read.

**The owner's code gets the code fix; the vendor's code gets update, report or mitigate.** Edits to a vendor's files are overwritten on the next update, and a committed copy is already a fork.

**Verification before claims**, with a verdict and a top-3 list. Same rules as the component audits.

---

## Related skills

- `wp-plugin-code-audit` (required): shared rubric, report rules and checklists; audits each custom plugin.
- `wp-theme-code-audit` (required): audits each custom and child theme.
- `wp-plugin-audit-remediation`: remediation log and behaviour-neutrality checks after the audit.

---

## License

[MIT](../LICENSE)
