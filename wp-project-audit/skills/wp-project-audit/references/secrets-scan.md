# Secrets Scan

Phase 2 sweep over tracked files and git history. The component skills cover secrets inside one component's code (plugin `references/security-checklist.md` §9); this sweep covers the whole repository, its history, and the files that are not code at all.

**Masking is not optional.** A secrets finding written out in full is a second leak. Every secret in notes, section files and the report is recorded as: **key or variable name, `file:line`, and the first 4 characters of the value**, followed by `…`. Nothing more, even in scratch files.

---

## 1. What to look for

| Class | Patterns (starting points) | Public or secret? |
|---|---|---|
| Cloud and platform keys | `AKIA[0-9A-Z]{16}`, `ASIA[0-9A-Z]{16}`, `AIza[0-9A-Za-z_-]{35}`, `xox[baprs]-`, `ghp_`, `gho_`, `glpat-`, `sk_live_`, `rk_live_` | secret |
| Private keys | `-----BEGIN (RSA \|EC \|OPENSSH \|DSA )?PRIVATE KEY-----` | secret |
| Database and SMTP credentials | `DB_PASSWORD`, `SMTP_PASS`, `mysql://user:pass@`, `define( 'DB_` in files other than an intentional sample | secret |
| WordPress keys and salts | `AUTH_KEY`, `SECURE_AUTH_KEY`, `LOGGED_IN_KEY`, `NONCE_KEY` and the `*_SALT` set with real values | secret |
| Credentials in URLs | `https?://[^/ :]+:[^@ ]+@` | secret |
| Licence keys | `license_key`, `licence`, `LICENSE_KEY`, vendor-specific constants | secret (licensed to the owner; leaking it lets others download updates) |
| Generic assignments | `(password\|passwd\|secret\|token\|api_key\|apikey)\s*[:=]\s*['"][^'"]{8,}` | review each |
| Public identifiers | Analytics measurement IDs, map API keys restricted by referrer, reCAPTCHA site keys, publishable payment keys (`pk_live_`), form or marketing-automation account IDs | **public by design**: not a finding, unless the key is unrestricted (then Low, with the restriction as fix) |

Distinguish before rating: a publishable key in front-end JS is expected; the matching secret key anywhere in the repo is a finding. When unsure whether a key is restricted, record it as an open question for production, not as a leak.

## 2. Tracked files

```bash
cd /path/to/project
git ls-files -z | xargs -0 grep -nIE \
  "AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-|gh[po]_[0-9A-Za-z]{20,}|glpat-|sk_live_|BEGIN [A-Z ]*PRIVATE KEY|https?://[^/ :]+:[^@ ]+@|(password|passwd|secret|token|api_?key)['\"]?\s*[:=]\s*['\"][^'\"]{8,}" \
  -- 2>/dev/null \
  | grep -v -E '/(vendor|node_modules)/' \
  | sed -E 's/^([^:]+:[0-9]+):.*$/\1/' | sort -u > "$OUT/secrets/candidates.txt"
wc -l < "$OUT/secrets/candidates.txt"
```

The `sed` keeps only `file:line`. Open each candidate line yourself and write the masked form; never pipe matched values into a file.

Also list by name, without opening:

```bash
git ls-files | grep -Ei '(^|/)(\.env(\..+)?|.*\.pem|.*\.key|id_rsa.*|.*\.p12|.*\.pfx|auth\.json|\.npmrc|\.htpasswd|wp-config\.php|.*\.sql(\.gz)?|.*\.dump)$'
```

`auth.json` (Composer credentials) and `.npmrc` with `_authToken` are common and easy to miss.

## 3. Git history

A secret removed from the working tree is still in history, and still valid until rotated.

```bash
# Paths that ever existed and look sensitive (names only)
git log --all --pretty=format: --name-only --diff-filter=A | sort -u \
  | grep -Ei '(\.env|\.pem|\.key|id_rsa|auth\.json|\.npmrc|\.htpasswd|wp-config\.php|\.sql(\.gz)?|\.dump)$' > "$OUT/secrets/history-paths.txt"
# Commits that added a line matching a secret pattern (commit and file only)
git log --all -p -G "AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY|sk_live_|glpat-|gh[po]_[0-9A-Za-z]{20,}" --pretty=format:'commit %h' \
  | grep -E '^(commit |\+\+\+ b/)' | sed 's#^+++ b/#  #' > "$OUT/secrets/history-hits.txt"
```

If `gitleaks` or `trufflehog` is installed, run it with redaction on (`gitleaks detect --redact`, `trufflehog git file://. --no-verification`) and treat the output as candidates. Do not install tools into the project.

## 4. Database dumps and archives

Identify, never read. `inventory.json` → `database_dumps` lists dumps by name, size and tracked status. For each one:

- Record the path, size and whether it is tracked, ignored, or inside the webroot.
- Do not open, grep, `head` or import it. It holds user records, hashed passwords, emails, and often plaintext API keys in options.
- A tracked dump: **High** (everyone with repository access has the user table); **Critical** when the repository is public or the dump is served from the webroot.
- An untracked dump inside the webroot on a local copy: tell the owner and ask whether production has the same file.

Archives (`*.zip`, `*.tar.gz`) of plugins or themes may contain licence keys in their config: list them, and open only when the owner asks.

## 5. Rating

| Situation | Rating |
|---|---|
| Live secret in a public repository, or served from the webroot | Critical |
| Live secret in a private repository or in history | High (everyone with repository access, every clone, every CI runner) |
| Secret for a non-production system, or already rotated (owner confirms) | Low, with the owner's answer as a severity note |
| Public identifier | not a finding; list under "checked and clean" |

**Fix line:** rotate first, then remove. Removing a secret from the working tree does not revoke it; rewriting history does not reach existing clones. Move the value to environment configuration or the host's secret store. For history, recommend rotation over rewriting unless the owner asks for a rewrite.

## 6. Section file rules

The secrets scanner's section file (`subagent-briefs.md`) contains only masked values, key names, `file:line` and commit short hashes. The orchestrator checks this before merging: a section file with an unmasked value is rewritten, not merged.
