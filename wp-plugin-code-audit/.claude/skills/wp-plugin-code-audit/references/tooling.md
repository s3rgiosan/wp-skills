# Tooling

PHPCS, PHPStan, Plugin Check, Composer audit, npm audit. Commands + interpretation. The skill works without any of these (pure-read fallback); they make the candidate-set richer.

Store all tool output under `/tmp/audit-<slug>/` so it's referable from `AUDIT.md` and disposable.

```bash
SLUG=my-plugin              # plugin folder name
OUT=/tmp/audit-$SLUG
mkdir -p $OUT
```

---

## PHPCS + WPCS

### Install (one-time, isolated)

```bash
# Inside a working dir (not the plugin)
composer require --dev \
  squizlabs/php_codesniffer \
  wp-coding-standards/wpcs \
  phpcompatibility/phpcompatibility-wp \
  dealerdirect/phpcodesniffer-composer-installer

./vendor/bin/phpcs -i   # confirm WordPress, WordPress-Core etc. installed
```

### Run

```bash
./vendor/bin/phpcs \
  --standard=WordPress,WordPress-VIP-Go,PHPCompatibilityWP \
  --runtime-set testVersion 7.4- \
  --extensions=php \
  --ignore=*/vendor/*,*/node_modules/*,*/dist/*,*/build/* \
  --report=full \
  ./path/to/plugin > $OUT/phpcs.txt

# Summary mode for executive review:
./vendor/bin/phpcs ... --report=summary > $OUT/phpcs-summary.txt
```

### Interpretation

PHPCS output format: `FILE:LINE | TYPE | RULE | MESSAGE`.

| WPCS rule | What it means | Verification required? |
|---|---|---|
| `WordPress.Security.NonceVerification.Missing` | Form / AJAX without nonce check | Yes — see `false-positive-traps.md` §2 |
| `WordPress.Security.NonceVerification.Recommended` | Read of `$_POST` without preceding nonce check | Yes |
| `WordPress.Security.EscapeOutput.OutputNotEscaped` | Echo without escape | Yes — see §3 |
| `WordPress.Security.ValidatedSanitizedInput.InputNotSanitized` | Direct super-global read | Yes — see §4 |
| `WordPress.Security.ValidatedSanitizedInput.MissingUnslash` | Sanitize without `wp_unslash` | Yes — usually true, but check |
| `WordPress.DB.PreparedSQL.NotPrepared` | `$wpdb->query( $var )` | Yes — see §1 |
| `WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare` | `prepare()` not interpolated | Usually real |
| `WordPress.DB.DirectDatabaseQuery.NoCaching` | Direct query without cache layer | Often noise; flag only if user-facing hot path |
| `WordPress.WP.GlobalVariablesOverride` | `$wpdb = ...` etc. | Always real, serious |
| `Generic.Files.LineLength.MaxExceeded` | Line > 120 chars | Cosmetic; don't list individually |
| `Squiz.Commenting.*` | Missing/malformed doc-blocks | Cosmetic |
| `Generic.WhiteSpace.*` | Whitespace | Cosmetic |

Filter aggressively. PHPCS on a typical plugin produces 100–10,000 warnings. The audit report should have **single-digit** PHPCS-derived findings after verification + filtering.

Quick triage:

```bash
# Top 10 rules by frequency
grep -oE "WordPress\.\S+|Generic\.\S+|Squiz\.\S+|PEAR\.\S+|PSR\S+|PHPCompatibility\S+" $OUT/phpcs.txt \
  | sort | uniq -c | sort -nr | head
```

---

## PHPStan

### Install

```bash
composer require --dev \
  phpstan/phpstan \
  szepeviktor/phpstan-wordpress

# phpstan.neon at plugin root:
cat > phpstan.neon <<'EOF'
includes:
  - vendor/szepeviktor/phpstan-wordpress/extension.neon

parameters:
  level: 5
  paths:
    - ./
  excludePaths:
    - vendor/*
    - node_modules/*
    - dist/*
    - tests/*
  bootstrapFiles:
    - vendor/php-stubs/wordpress-stubs/wordpress-stubs.php
EOF
```

For WP-specific setup details, defer to the `wp-phpstan` skill.

### Run

```bash
./vendor/bin/phpstan analyse --memory-limit=1G --no-progress > $OUT/phpstan.txt
```

### Interpretation

PHPStan catches:
- Null dereferences (`$post->ID` where `$post` could be null).
- Undefined variables, undefined methods.
- Incompatible types (`strlen(null)`).
- Dead code (unreachable branches).
- Missing return types / incorrect return types.

Level 5 is a reasonable bar for plugin audits. Higher levels (6–9) generate more strict-typing findings that are often Info-level for older codebases.

Findings to flag in the report:
- Type errors that translate to runtime fatals (null deref, undefined method) → **Medium** or **High** depending on path.
- Dead code in security-relevant paths → **Medium**.
- Type errors in non-critical paths → **Low** / **Info**.

PHPStan rarely false-positives at level 5. Trust it more than PHPCS.

---

## Plugin Check (WordPress.org official)

### Install

```bash
# As a plugin on a local WP install:
wp plugin install plugin-check --activate

# Or via CLI command (newer versions):
wp plugin install plugin-check --activate
wp plugin check <plugin-slug> > $OUT/plugin-check.txt
```

### Run

```bash
cd /path/to/wp-install
wp plugin check <plugin-slug> > $OUT/plugin-check.txt 2>&1

# Specific check categories:
wp plugin check <plugin-slug> --categories=plugin_repo,security
```

### Interpretation

Plugin Check is the closest tool to "what wp.org reviewers actually flag". Categories include:

- `plugin_repo` — directory hosting requirements.
- `security` — `wp.org`'s manual review heuristics.
- `general` — readme.txt, headers, file structure.

Plugin Check findings are usually higher signal than PHPCS — most are wp.org-specific rules that don't fire elsewhere. Treat findings here as **Medium** by default; escalate to **High** for anything matching wp.org's rejection-critical rules (no `phpinfo()`, no eval, no calling home).

---

## Composer audit

```bash
cd /path/to/plugin
composer audit > $OUT/composer-audit.txt
```

Output lists known CVEs in declared dependencies (PHP). Each entry:

```
Package: vendor/lib
Severity: HIGH
CVE: CVE-2024-XXXXX
Title: ...
Affected versions: <1.2.3
Reported at: ...
Link: ...
```

For each entry:
- **Critical/High CVE in production dependency** → audit finding, severity matches the CVE.
- **Medium/Low CVE in dev dependency** (`require-dev`) → Info unless dev tools ship to production.

`composer audit` only sees declared deps. If `vendor/` is committed but `composer.json` doesn't match the locked versions, run `composer audit --locked` against `composer.lock`.

---

## npm audit (for plugins with bundled JS)

```bash
cd /path/to/plugin
npm audit --omit=dev --json > $OUT/npm-audit.json
npm audit --omit=dev > $OUT/npm-audit.txt
```

Most npm vulns are in build-time dependencies (`devDependencies`); use `--omit=dev` to focus on runtime.

Runtime npm vulns in a plugin are unusual unless the plugin ships a heavy frontend bundle. Treat per CVE severity.

For block plugins with `@wordpress/*` deps: usually safe; `@wordpress/scripts` is the standard build chain.

---

## Pure-read fallback

If none of the above is installable, the audit still works. The checklists in `security-checklist.md`, `performance-checklist.md`, and `standards-checklist.md` are all `grep`-driven and self-contained.

In the report's Scope section, document tools that were unavailable:

```markdown
- Tools run:
  - PHPCS: skipped (not available in environment)
  - PHPStan: skipped (not available)
  - Plugin Check: skipped (no WP install)
  - Composer audit: yes
  - npm audit: skipped (no source for dist/)
- **Confidence:** medium — manual review only; static analysis would surface additional findings.
```

Downgrading confidence is honest. The reader can decide whether to re-run with full tooling.
