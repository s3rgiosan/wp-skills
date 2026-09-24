# Deploy and Exposure

Phase 2 sweep. The deploy pipeline decides the public attack surface: what lands in the webroot, what is served, and what leaks on the way. None of it is visible from a single component.

---

## 1. Map the deploy path

From `inventory.json` (`deploy_files`, `ci_files`, `hosting_hints`) and the owner's answer on the deploy target:

- **How code reaches production:** CI job, deploy script, host's git push, SFTP by hand, a managed-host integration.
- **What is copied:** the whole repo, a build directory, or an rsync with an exclude list.
- **What is built on the way:** `composer install`, `npm run build`, asset compilation. Build flags are in `dependency-audit.md` §3.
- **What production has that the repo does not:** plugins installed from the admin, uploaded premium zips, files edited on the server (`production-check.md`).

## 2. Exclude-list coverage

An exclude list is a denylist: anything not on it is public. Compare what the repo contains with what the list removes.

**Required input: `webroot-exposure.tsv`** from `inventory.sh`. The script finds the exclude sources (rsync `--exclude-from` files and inline `--exclude` patterns in deploy and CI scripts, `.distignore`, `.deployignore`, `.rsyncignore`, CI artifact `exclude:` lists, `.gitattributes export-ignore`), lists every tracked top-level path and every tracked non-runtime file (Markdown, lockfiles, JSON and YAML configs, shell scripts, dotfiles and dotfolders, archives, dumps, agent config such as `CLAUDE.md`), and marks each one `excluded` (with the matching source and pattern) or `reaches webroot if deployed`. Sources the deploy may not use (`export-ignore` with an rsync deploy, an exclude-style file no command references) only earn a softer status. Patterns are matched against paths relative to the repository root, the usual rsync source; confirm the deploy's real source directory and re-read the list if it differs. The exposure finding cites this list; do not write it from memory of the deploy script.

Severity guidance for paths that reach the webroot (before webserver rules):

| What reaches the webroot | Typical rating |
|---|---|
| Scripts, configs or dotfiles holding credentials or tokens | High to Critical |
| Database dumps, archives of licensed code | High to Critical (see the table below) |
| Internal docs (planning, requirements, runbooks) and agent config (`CLAUDE.md`, `AGENTS.md`, `.claude/`, `.cursor/`) | Medium to Low, by what they reveal (hostnames, internal process, security notes) |
| Lockfiles and dependency manifests | Low |
| Build and CI config without secrets | Low |

Group the result into one `G-` finding per category, citing the count from the TSV and a few representative paths, plus separate findings for anything High or above.

```bash
# Tracked top-level entries and dotfiles, against the exclude list
git ls-files | cut -d/ -f1 | sort -u > /tmp/tracked-top.txt
grep -vE '^\s*(#|$)' deploy/excludes.txt | sed 's#^/##; s#/$##' | sort -u > /tmp/excluded.txt
comm -23 /tmp/tracked-top.txt /tmp/excluded.txt
# Files that should never reach a webroot, wherever they are
git ls-files | grep -Ei '(^|/)(\.env|.*\.sql(\.gz)?|.*\.zip|composer\.(json|lock)|package(-lock)?\.json|.*\.md|\.git[^/]*|phpcs\.xml.*|phpunit\.xml.*|docker-compose\.ya?ml|Makefile|.*\.log|.*\.bak|.*~)$' | head -50
```

Check these specifically:

| In the webroot | Why it matters | Typical rating |
|---|---|---|
| Premium plugin or theme zips | Anyone can download the licensed code, and read it for vulnerabilities offline | Medium; High if the zip holds a licence key |
| `.env`, config backups, `*.bak`, editor swap files | Credentials | High to Critical |
| Database dumps | Everything | Critical if served; identify by name only, never open |
| `composer.json` / `composer.lock` / `package-lock.json` | Exact dependency versions for an attacker | Low |
| Internal docs (`*.md`, requirement folders, agent instruction files) | Architecture, hostnames, internal process | Low to Medium by content |
| Test and CI config, `phpunit.xml`, fixtures | Test credentials, internal URLs | Low to Medium |
| `.git/` | Full history, including removed secrets | High |

Confirm reachability without touching production: ask the owner for the webserver rules (nginx or Apache deny rules, host-level protections) or for a listing of the deployed webroot. A file excluded by the webserver is Low (defence in depth), not the same rating as a served one.

## 3. CI log leakage

CI logs are often readable by everyone with repository access, and sometimes public.

- **`set -x` or `bash -x` in deploy scripts** prints every expanded command. A URL with basic-auth credentials (`https://user:pass@host`), a token in a header, or an `rsync -e "sshpass -p ..."` prints in clear.
- **Echoing variables** (`echo "Deploying with $DEPLOY_TOKEN"`), `env` or `printenv` in a job.
- **Masking.** GitLab CI masked variables and GitHub Actions secrets are redacted in logs only when the exact value appears. A value that is transformed (base64, URL-encoded, split) is printed. Ask the owner whether the variables are masked and protected.

```bash
grep -nE 'set -x|bash -x|set -o xtrace|printenv|^\s*env\s*$|echo .*\$\{?[A-Z_]*(TOKEN|PASS|SECRET|KEY)' deploy/*.sh .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null
grep -nE 'https?://[^/ :]+:[^@ ]+@' deploy/*.sh .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null
```

Rating: credentials that do print in logs readable by more than the deploy owners: **High**. The pattern exists but the owner confirms masking: **Info** (record the answer as a severity note on the finding, keep the ID).

## 4. Uploads and web-writable paths

- **PHP under uploads.** Any `.php`, `.phtml`, `.phar` or `.php5` file in `uploads/` is a candidate web shell unless a known plugin writes it (and even then, uploads should not execute PHP). `prod-check.sh` lists them on production.
- **Execution rules.** Ask whether the webserver blocks PHP execution under `uploads/`. Without it, every arbitrary-upload finding elsewhere escalates.
- **Logs, exports and caches in web-readable paths.** Custom code that writes CSV exports, request logs (visitor IPs, form submissions, emails) or debug output under `uploads/` or the webroot, at guessable names. `WP_DEBUG_LOG` set to `true` writes `wp-content/debug.log`, which is web-readable by default.

```bash
grep -rnE "(fopen|file_put_contents|fputcsv|error_log)\s*\(" wp-content/plugins/acme-* wp-content/themes/acme-* wp-content/mu-plugins --include='*.php' \
  | grep -iE "upload|wp_upload_dir|WP_CONTENT_DIR|ABSPATH|\.csv|\.log|\.txt" | head -40
```

Rating: personal data in a guessable public file: **High**; Critical when it is credentials or large volumes of personal data. The finding belongs to the component that writes the file, with a `G-` cross-reference when the webserver config is the other half.

## 5. Must-use loaders and drop-ins

Must-use plugins run on every request on every site, and cannot be deactivated from the admin.

- **Orphaned loaders.** A loader file that requires a plugin no longer installed (`inventory.json` → `orphaned_mu_loaders`, and `prod-check.sh` §11 on production). At best a warning on every request; at worst, anyone who can write that path gets code execution on every request.
- **Loaders for security-relevant plugins** that load code outside the normal activation flow, so deactivating the plugin in the admin does not stop it.
- **Drop-ins** (`advanced-cache.php`, `object-cache.php`, `db.php`, `sunrise.php`): who wrote them, and are they from the plugin that claims them.

## 6. wp-config.php hardening

Read constant **names and booleans only**. Never copy values into notes or the report. `prod-check.sh` §7 prints exactly this shape for production; the local copy often differs.

| Constant | Want | Why |
|---|---|---|
| `DISALLOW_FILE_EDIT` | `true` | With file editing on, any path to an admin session becomes code execution (`correlation.md` rule 7) |
| `DISALLOW_FILE_MODS` | `true` where deploys are the only update path | Blocks admin-side plugin installs and updates; conflicts with admin-driven updates, so ask |
| `WP_DEBUG_DISPLAY` | `false` on production | Errors and paths shown to visitors |
| `WP_DEBUG_LOG` | `false`, or a path outside the webroot | `true` writes a web-readable `debug.log` |
| `FORCE_SSL_ADMIN` | `true` unless TLS is enforced upstream | Admin cookies over plain HTTP |
| `DISALLOW_UNFILTERED_HTML` | `true` when Editors and Administrators should not post script | Narrows the `unfiltered_html` holders the theme skill's role table relies on |
| `AUTOMATIC_UPDATER_DISABLED`, `WP_AUTO_UPDATE_CORE` | not disabling security updates without a replacement process | Core security releases |
| Keys and salts | set, unique | Only "set" or "not set": never the value |

Also record: where `wp-config.php` lives (webroot or one level above), and whether it contains code after the `wp-settings.php` require (normally none; injected payloads often sit there).

## 7. Report placement

All of this is **General / codebase** (`G-`), except where one component writes the exposed file (then the component owns the finding, and a correlation links it to the config half).
