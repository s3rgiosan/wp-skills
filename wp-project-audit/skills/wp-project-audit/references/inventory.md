# Inventory

Phase 1. Every later phase reads the inventory, so a wrong bucket or a wrong active status propagates into every finding. Build it from commands, confirm the guesses with the owner, and record what could not be verified.

---

## 1. Root shape

| Shape | How to recognise it | Content directory | Core |
|---|---|---|---|
| **wp-content repo** | `plugins/` and `themes/` at the repo root, no `wp-includes/` | the repo root | usually one level up, or not in the repo at all |
| **Full site root** | `wp-includes/version.php` and `wp-content/` at the root | `wp-content/` | the root |
| **Bedrock-style** | `web/app/`, `web/wp/`, `config/application.php`, `.env` | `web/app/` | `web/wp/`, installed by Composer |

`scripts/inventory.sh` detects the shape and prints it. Pass `--wp-root` when core lives somewhere it cannot find. Record the shape in the report's method section: it decides what "the webroot" means for exposure checks (`deploy-and-exposure.md`).

## 2. Topology: sites, prefixes, origins

Ask, and confirm from config:

- **Multisite?** `MULTISITE` in `wp-config.php` (the script reads the boolean only). On multisite, "installed" and "active" are different questions per site.
- **Table prefixes.** One database can hold several installs with different prefixes (a current site, a legacy site, abandoned test installs). The database fallback lists every `*options` table and labels each as a network site or a single install.
- **Which sites are production and which are legacy?** Only the owner knows. A legacy site served from the same origin as production (a subdirectory, or a reverse-proxied path) shares cookies with it: see `correlation.md` rule 6.
- **Hosting.** The script reports hints (managed-host mu-plugins, platform config files, container files). Ask the owner to confirm the host and whether the host adds its own must-use plugins, caching or WAF.

## 3. Buckets

Every plugin and theme lands in exactly one bucket. The bucket decides the depth of review and the fix line (plugin skill `SKILL.md` → Report → Fix guidance by ownership).

| Bucket | Signals | Depth | Fix line |
|---|---|---|---|
| **Custom** | owner-confirmed; project slug prefix; project text domain; no public distribution | full audit with `wp-plugin-code-audit` or `wp-theme-code-audit` | the code change |
| **Committed third-party** | git-tracked, not in `composer.lock`, a vendor `Author URI`, a `readme.txt` with `Stable tag`, a matching premium zip | lookups, a hotspot pass, missing-update-path flag | update, report, mitigate; a local patch is a fork |
| **Managed third-party: wp.org** | `wpackagist-plugin/*` or `wpackagist-theme/*` in `composer.lock`, or installed from wp.org on the server | lookups only | update, report, mitigate |
| **Managed third-party: premium artifact** | `composer.lock` dist pointing at a local zip in an `artifact` repository | lookups (free and premium slugs), deployment check | update, report, mitigate |
| **Managed third-party: VCS** | `composer.lock` source of type `git` | lookups; review if the repository is private and unreviewed | update, report, mitigate |
| **Core** | `wp-includes/version.php` | version lookup, checksums | update core |
| **Must-use and drop-ins** | files in `mu-plugins/`, `advanced-cache.php`, `object-cache.php`, `db.php`, `sunrise.php` | always loaded: review custom ones in full, check loaders point at existing files | as for the owning bucket |

The script's `bucket_guess` is a guess. `committed (confirm custom or third-party)` always needs an answer from the owner; ask once, for the whole list, and pass the answer back with `--custom` or `--custom-prefix` on a rerun.

**Composer-managed and committed at once** (the script flags it) means two copies can disagree. Ask which one deploys.

**Untracked on disk** (neither git nor Composer) means a manual install, a gitignored directory, or a premium upload. These are the components most likely to differ from production.

## 4. Active status, per site

Installed is not active, and active on one site is not active on another. Never recall active status from memory or from a previous run: read it, or mark it unverified.

Order of sources:

1. **WP-CLI, read-only.** `wp option get active_plugins --skip-plugins --skip-themes` per site URL, plus `wp site option get active_sitewide_plugins` on multisite. `--skip-plugins` does not skip must-use plugins; they still load.
2. **The project's own notes.** Local environments often run the database on a socket or port the global CLI does not know. Before going further, check the project's documentation (README, CLAUDE.md or other agent instructions, contributor notes, prior audit notes) for a documented way to reach the local database: a socket path, a port, a bundled client.
3. **Database fallback** (`--db-fallback`). The script reads `DB_NAME`, `DB_USER`, `DB_PASSWORD` and `DB_HOST` from `wp-config.php` (or a Bedrock `.env`) by static parsing: it never executes PHP, accepts only literal strings in single or double quotes, and stops with a clear note when a value is a constant, function call or variable. It writes the credentials to a mode-600 option file in a private temp folder under `--out`, passes only `--defaults-extra-file=<that file>` to the client, and deletes the folder when it finishes or is interrupted. A port or socket in `DB_HOST` (`host:3306`, `host:/path/mysqld.sock`) is honoured; `--db-socket` and `--db-port` override it, and `--mysql-bin` sets the client path. It runs `SHOW TABLES` and `SELECT` only, reading `active_plugins`, `stylesheet`, `template`, registration settings and role counts from every options table and `active_sitewide_plugins` from each network's `sitemeta`.
4. **Unverified.** When none of these works, every component is marked `unverified`. Say so in the report and rate as if active, with the unverified status in the finding.

**Local database contents are not findings.** Scratch, leftover or test tables seen through the database fallback in a local database describe the developer's machine, not the site. At most, record an open question asking whether the same tables exist on production.

**Never put database credentials on a command line.** Arguments land in shell history, process listings and agent transcripts. The script's option file exists so nobody has to; if a client must be run by hand, use a mode-600 option file the same way.

**Never start services to get an answer.** If the database is down, ask the owner before starting the local environment; do not start it yourself.

**Active lists can name plugins that are not on disk.** The script lists them (`active_but_missing_on_disk`). They are either leftovers or plugins installed on production outside the repo. Ask; an unmanaged production plugin goes into the inventory with its production version and gets a lookup (`correlation.md` rule 8).

## 5. Production versions and drift

Ask the owner up front, before the sweeps:

1. The production plugin and theme list with versions, per site (`wp plugin list --fields=name,status,version` and `wp theme list` on production, or a screenshot of the admin list), or read-only production access.
2. Which sites are production and which are legacy.
3. The deploy target: which branch, which host, which command.

Record three versions per component where they exist: **lockfile**, **disk**, **production**. Any disagreement is drift and goes into the inventory appendix. Lookups run at the production version (`vuln-lookup.sh --prod-versions`); a local-only version is a note, not the basis of a finding.

## 6. Platform state

Record, for the report's General / codebase section:

- **WordPress core version** (production), from the owner's list or `prod-check.sh` §1; the local `wp-includes/version.php` only as a fallback.
- **PHP version on production.** Ask the owner or the host (the web PHP version, which can differ from the CLI one), and pass it with `--php-version`. The inventory also lists the PHP constraints the project declares (`require.php` and `config.platform.php` in each `composer.json`). `vuln-lookup.sh` checks the branch against php.net's active releases (`https://www.php.net/releases/active.php`): a branch that is not listed there is end of life (a finding, High when the host no longer patches it); a branch tagged `security` receives security fixes only (a note, with the date it ends from php.net's supported-versions page).
- **Who owns core and PHP updates:** the host (managed updates), the team (deploys), or nobody. Ask; "nobody" is a finding.

## 7. Code outside wp-content

WordPress loads more than plugins and themes. The inventory lists, by name only:

- **Unexpected entries in the WordPress root** (`outside_wp_content.wp_root_extra_entries`, each with a `path` relative to the project root, so a same-named file in the project and in the WordPress root stays distinguishable; database dumps found there are also added to `project.database_dumps` with `location: WordPress root`): anything that is not a core file, `wp-config.php`, `wp-admin/`, `wp-includes/` or `wp-content/`. PHP files there run on request. Database dumps, archives and other local artifacts there follow the local artifact rule (§11): outside the repository they are untracked local files and are not assessed unless they are on production.
- **Drop-ins** in `wp-content/`: the files core loads by name (`_get_dropins()`): `advanced-cache.php`, `db.php`, `db-error.php`, `install.php`, `maintenance.php`, `object-cache.php`, `php-error.php`, `fatal-error-handler.php`, and on multisite `sunrise.php`, `blog-deleted.php`, `blog-inactive.php`, `blog-suspended.php`. Each one belongs to a plugin or the host; one that nobody can attribute is reviewed as custom code.

## 8. Other signals the inventory records

| Signal | Field | Used in |
|---|---|---|
| Approved plugin list (optional, from the owner, `--approved <file>`, one slug per line) | components flagged "not on the owner's approved plugin list"; `signals.approved_list` | General / codebase: each unapproved active plugin is a finding (Low to Medium by what it does), or an open question when the list is stale |
| Development and operations tools | `signals.development_tools_active_or_unverified` | `access-and-privacy.md` §2 |
| Activity-log plugins | `signals.activity_log_plugins` | `access-and-privacy.md` §3 |
| Role counts, registration, application passwords | `active_status.sites[]`, `access` | `access-and-privacy.md` §1 |
| Dependency monitoring (Dependabot, Renovate, Snyk config) | `project.dependency_monitoring` | `dependency-audit.md` §5 |
| Existing scanner configs (SonarQube, Snyk, CodeQL and other code scanning, SARIF files) | `project.existing_scanner_configs` | SKILL.md → Automated sweeps → Existing scanner results |
| Infrastructure as code (Terraform, CloudFormation, Pulumi, Kubernetes manifests, Helm charts, Dockerfiles and compose files) | `project.infrastructure_as_code` | listed in Scope as **not covered** by this audit, with IaC scanning as a recommended follow-up |

## 9. Running it

```bash
OUT=/tmp/project-audit-acme; mkdir -p "$OUT"
bash scripts/inventory.sh --root /path/to/project --out "$OUT/inventory"
# With the database fallback (credentials read from wp-config.php), and the owner's answer on custom code:
bash scripts/inventory.sh --root /path/to/project --out "$OUT/inventory" \
  --db-fallback --db-socket /path/to/mysqld.sock --custom-prefix acme- \
  --approved "$OUT/approved-plugins.txt" --php-version 8.2
```

Outputs: `inventory.json` (components, lockfiles, CI and deploy files, hosting hints, local artifacts (dumps, archives, logs, backups, exports, IDE and OS files) with tracked status and the candidates the local artifact rule keeps (§11), orphaned must-use loaders, active status and role counts per site, platform state, code outside `wp-content`, and the signals in §8) and `inventory.tsv` (one row per component). `--out` is refused inside the project.

## 10. Inventory appendix columns

| Column | Source |
|---|---|
| Type, slug, name | headers |
| Version: lockfile / disk / production | `composer.lock`, header, owner's list |
| Bucket | script guess, confirmed by owner |
| Source and update channel | `composer.lock` channel, `Update URI`, wp.org status |
| Ownership | custom / third-party (vendor name) |
| Active per site | WP-CLI / database / unverified |
| Depth | full audit / hotspot / lookup |
| Approved | yes / no / no list supplied |
| Verdict | the annex verdict for fully audited components ("see Annex N"), or "lookup clean", "lookup: see P-<slug>-H1" |

## 11. Local artifact rule

A **local artifact** is a database dump, archive, log, export, backup, IDE or OS file, or any other file found on the local copy of the project. It is a finding **only** when one of these holds:

1. **It is tracked in git**: `git ls-files --error-unmatch <path>` succeeds, or it appears in git history (the secrets-scan rule: history counts as tracked). It then reaches every clone and any deploy built from the repository.
2. **It is present on production**: seen in a production export (`inventory.sh --production-export`) or in the owner's production file check.
3. **A deploy copies it from a location that is not a clean checkout.** Rare. Tell by reading the deploy path: a CI job or host integration that clones or checks out the repository deploys only tracked files; a deploy script run from a developer's working copy (for example `rsync ./ host:/path` with no CI step, or "deploy from my laptop" in the owner's answers) copies untracked files too. Only then do untracked local files matter, and only those the exclude list does not remove.

Everything else, meaning untracked or git-ignored files on the local copy, is **out of scope**: not a finding at any severity, not a verified-false item, not an open question, and not mentioned anywhere in the report, the Method appendix included. Never open such files, and never open a candidate artifact either: identify it by path, size and tracked status only.

`inventory.sh` applies the rule: every dump, archive, log, backup, export and IDE or OS file carries `tracked` (`yes` / `no` / `n/a` outside a git repository), `in_git_history`, `location` (`project`, `WordPress root`, or `production` with `--production-export`) and a `status`. Only entries with a `candidate: ...` status appear in `project.local_artifact_candidates`; untracked ones are recorded internally as `ignored: untracked local file` and never leave the scripts' output.

