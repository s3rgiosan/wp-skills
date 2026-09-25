# Production Check

Phase 6, optional and owner-run. Some questions have only a production answer: is the deployed copy the copy in the repo, is core intact, what does the real `wp-config.php` set, is there a dropper nobody committed. The auditor never runs anything on production; the owner runs a read-only script and pastes the output back.

---

## 1. When to offer it

Offer it when any of these hold:

- a vendor-compromise or supply-chain advisory touches an installed component (`vendor-compromise.md`);
- the inventory shows unmanaged production components, or drift between repo and production;
- a finding's rating depends on a production setting (`DISALLOW_FILE_EDIT`, debug logging, PHP under uploads);
- the owner reports something that "feels off".

Otherwise record "production check not run" in the method section and keep the dependent findings as open questions for production.

## 2. Known-good manifests, generated locally

A manifest is a SHA-256 list of every file in a trusted copy of a component at the exact deployed version.

```bash
# Trusted sources, in order of preference:
#   the vendor's original zip for that version (from the owner's account),
#   the premium artifact at a commit that predates any compromise window,
#   the wp.org SVN tag for free plugins, or the repo at the deployed commit for custom code.
mkdir -p /tmp/acme-manifests && cd /tmp/acme-manifests
unzip -q /path/to/vendor-zips/acme-slider-pro-2.4.0.zip -d trusted/
bash /path/to/scripts/prod-check.sh manifest trusted/acme-slider-pro plugin-acme-slider-pro.sha256
bash /path/to/scripts/prod-check.sh manifest /path/to/project/mu-plugins mu-plugins.sha256
```

Name each manifest `plugin-<slug>.sha256`, `theme-<slug>.sha256` or `mu-plugins.sha256`. Send the manifest files to the owner; they contain paths and hashes only.

wp.org plugins do not need manifests: `wp plugin verify-checksums` compares them against wp.org. Core does not need one: the script compares against the official list at `https://api.wordpress.org/core/checksums/1.0/?version=<version>&locale=<locale>`, or runs `wp core verify-checksums`.

## 3. Indicator files

From the advisory or the vendor-compromise sweep, one entry per line:

- `ioc-names.txt`: dropper file names. Many are **near-misses of core file names** (a core file name with one letter added, removed or changed). The script also checks every PHP file under the webroot against the core root file names at edit distance one, without needing the list.
- `ioc-strings.txt`: fixed strings such as injected hosts or marker comments. Never payload code.

## 4. What the owner runs

```bash
# On production, from the WordPress root. Changes nothing.
bash prod-check.sh check --manifests ./manifests --ioc-names ioc-names.txt --ioc-strings ioc-strings.txt \
  --since 2026-05-01 --out ~/prod-check-output
```

Sections of the output:

| § | Checks |
|---|---|
| 1 | WordPress version and locale, multisite, PHP and WP-CLI availability |
| 2 | Core files against official checksums: modified, missing, and extra files in `wp-admin/`, `wp-includes/` and the webroot top level |
| 3 | wp.org plugins against published checksums (`wp plugin verify-checksums --all`) |
| 4 | Each manifest: changed files, and files present on production but not in the trusted copy |
| 5 | Near-miss core file names anywhere under the webroot, plus `--ioc-names` |
| 6 | `--ioc-strings` in plugins, themes, must-use plugins and webroot PHP (paths only) |
| 7 | `wp-config.php` structure: location, modified time, constant names with booleans ("set" for any other value), missing hardening constants, lines after the `wp-settings.php` require, suspicious call names by line, longest line |
| 8 | Suspicious code patterns (`eval` on decoded or request data, request data into shell functions, `/e` regex, `create_function`) as `path:line: matched call`; PHP files with very long lines |
| 9 | Executable files and `.htaccess` / `.user.ini` under uploads |
| 10 | PHP modified on or after `--since` at the top levels and in must-use plugins, and per-directory counts for plugins and themes |
| 11 | Must-use loaders that require missing files |
| 12 | With WP-CLI: administrator and super admin counts, users registered since `--since` (count), cron hook names |

The output contains paths, line numbers, counts, constant names and booleans. It never prints file contents, configuration values, user names or email addresses. `--out` is refused inside the webroot.

## 5. Handling production files

Sometimes the owner sends files instead of, or as well as, script output (a copy of a plugin directory, a `wp-config.php`, a log).

- **Store them outside the webroot and outside any git repository.** A scratch directory under the system temp dir, never the local site's `wp-content/`, never the audited repo. If the owner has already put them inside a webroot or repo, say so immediately and ask them to move them.
- **Never copy credentials into outputs.** Read `wp-config.php` for constant names and booleans only; do not quote lines. Do not paste any part of a production file into section files or the report beyond `path:line` and the matched function name.
- **Delete them afterwards,** and say in the method section that they were deleted and when.
- **Do not execute anything from them,** including `php -l` on suspicious files outside a disposable container.

## 6. Reading the output

| Output | Meaning | Next step |
|---|---|---|
| `MODIFIED:` core file | Core was edited or replaced | Treat as compromise until explained; ask for the file, diff against the official copy |
| Extra PHP in `wp-includes/` or the webroot top level | Dropper candidate | Ask for the file (handling rules above) |
| Manifest `FAILED` or files not in the manifest | Production copy differs from the trusted copy | Ask for those files; compare; a local modification is a fork (record it), an unknown one is an incident |
| Near-miss name | Dropper candidate | Same as extra PHP |
| `DISALLOW_FILE_EDIT = false` or not defined | File editing on | Correlation rule 7 |
| PHP under uploads | Web shell candidate or a plugin's cache | Identify the writer; check execution rules |
| Orphaned loader on production only | Production has must-use code the repo does not | Ask for the file |

Record each result in the report: findings that the output confirms carry the evidence label "owner's production check (<date>)", or "confirmed on production files" when the cited code was compared; questions it answers update the finding's severity and rationale, with the check cited as evidence (current state only, same ID).
