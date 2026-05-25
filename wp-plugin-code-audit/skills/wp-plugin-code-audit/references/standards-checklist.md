# Standards Checklist

WPCS + WordPress.org Plugin Directory rules + general WP conventions. Most findings here are Low / Info severity unless they affect the plugin's ability to ship (e.g. wp.org rejection criteria).

For the full 18 WordPress.org guidelines, defer to the `wp-plugin-directory-guidelines` skill.

---

## 1. Plugin header

**File:** main plugin file (the one with `Plugin Name:` in the doc-block).

Required fields:

```
Plugin Name:        Foo
Plugin URI:         https://example.com/foo
Description:        ...
Version:            1.2.3
Requires at least:  6.2
Requires PHP:       7.4
Author:             Name
Author URI:         https://...
License:            GPLv2 or later
License URI:        https://www.gnu.org/licenses/gpl-2.0.html
Text Domain:        foo
Domain Path:        /languages
```

| Missing / wrong | Severity |
|---|---|
| `License` not GPL-compatible | **NO-GO** (cannot ship to wp.org) |
| `Text Domain` missing | High (i18n broken) |
| `Requires PHP` / `Requires at least` missing | Low |
| `Version` not semver | Low |
| `Description` empty / vague | Info |

---

## 2. Prefixing

Every function, class, constant, hook, option key, table name, query var, post meta key, REST namespace must be prefixed to avoid collisions.

**Detect:**
```bash
grep -RnE "^function [a-z_]+\(" --include="*.php" .   # unprefixed functions
grep -RnE "^class [A-Z]" --include="*.php" .          # unprefixed classes (no namespace, no prefix)
grep -RnE "(define|const)\(\s*['\"][A-Z_]" --include="*.php" .  # constants
```

| Pattern | Convention |
|---|---|
| Functions | `my_plugin_do_thing()` |
| Classes | namespaced (`MyPlugin\Foo`) or prefixed (`My_Plugin_Foo`) |
| Constants | `MY_PLUGIN_VERSION` |
| Hooks | `my_plugin_after_save`, `my_plugin_filter_thing` |
| Option keys | `my_plugin_settings`, never `settings` |
| Post meta | `_my_plugin_foo` (underscore-prefixed → hidden from custom-fields UI) |
| REST namespace | `my-plugin/v1`, never `wp/v2` |
| Custom DB tables | `$wpdb->prefix . 'my_plugin_things'` |

WordPress core "owns" any unprefixed names. Pretty much any short name (3–10 chars, lowercase) is at collision risk.

---

## 3. i18n

**Detect:**
```bash
grep -RnE "(__|_e|_x|_ex|_n|_nx|esc_html__|esc_html_e|esc_attr__|esc_attr_e)\(" --include="*.php" .
```

For each call, the **last** argument must be the text domain (a literal string matching the plugin's `Text Domain` header).

| Issue | Severity |
|---|---|
| Text domain missing on `__()` etc. | Low (i18n breaks for that string) |
| Text domain is a variable (`__('x', $domain)`) | Medium — translation tools can't extract |
| `load_plugin_textdomain` called after `init` | Medium — translations don't load for the plugin's own strings |
| `wp_set_script_translations` missing for enqueued JS that uses `@wordpress/i18n` | Low |
| Mixed text domains | Medium |

Note (WP 6.5+): `load_plugin_textdomain` is no longer needed for plugins on wp.org with translations hosted on translate.wordpress.org — but is still required for languages packaged inside the plugin. Audit by checking what's actually shipped in `/languages`.

---

## 4. Deprecated APIs

**Detect:**
```bash
grep -RnE "(get_currentuserinfo|wp_get_http|wp_get_http_headers|wp_clean_themes_cache|wpmu_admin_redirect_add_referrer)" --include="*.php" .
grep -RnE "(create_function|each\(|split\(|ereg)" --include="*.php" .       # PHP-deprecated
grep -RnE "mysql_(query|connect|fetch_array)" --include="*.php" .            # PHP ext removed
```

Plus check for:
- `add_option('rewrite_rules')` direct manipulation (use `flush_rewrite_rules()`).
- `wp_filter_kses` (deprecated; use `wp_kses_post` etc.).
- `$wpdb->escape()` (use `esc_sql()` or `prepare()`).
- `like_escape()` (use `$wpdb->esc_like()`).

---

## 5. File structure

| Convention | Why |
|---|---|
| Main file matches plugin slug (`foo/foo.php`) | wp.org auto-detects this |
| `readme.txt` (not `README.md`) for wp.org | Markdown converter expects this format |
| `/languages/` for translation files | Convention; `Domain Path` header points here |
| No code outside main file at root | Aside from main file, root should be docs / config |
| `vendor/` shipped with `composer.json` | Otherwise install fails for end users; `vendor/` must NOT be in `.gitignore` for distributed plugins |
| `node_modules/` NOT shipped | Should be `.gitignore`'d |

---

## 6. Direct file access guard

Every PHP file must guard against direct browser access:

```php
defined( 'ABSPATH' ) || exit;
```

Otherwise: information disclosure (errors / paths / source via direct request).

**Detect (files lacking the guard):**
```bash
# Files containing PHP code but no ABSPATH check
for f in $(find . -name "*.php" -not -path "*/vendor/*" -not -path "*/node_modules/*"); do
  if ! grep -q "ABSPATH" "$f"; then echo "$f"; fi
done
```

Exception: pure class files in PSR-4 autoload aren't reachable directly (no executable top-level code). Still good practice.

---

## 7. WPCS specifics

PHPCS with WordPress standard catches:

- `WordPress.Security.EscapeOutput.OutputNotEscaped` — missing escape on output (verify before flagging).
- `WordPress.Security.NonceVerification.Missing` / `Recommended` — missing `wp_verify_nonce`.
- `WordPress.Security.ValidatedSanitizedInput.InputNotSanitized` — direct `$_GET`/`$_POST` read.
- `WordPress.DB.PreparedSQL.NotPrepared` — `$wpdb->query()` without `prepare()`.
- `WordPress.DB.DirectDatabaseQuery.NoCaching` — direct query without caching layer (often a false positive on admin pages; flag only if user-facing path).
- `WordPress.WP.GlobalVariablesOverride` — `$wpdb = ...` (rare; serious if hit).
- `WordPress.WP.EnqueuedResources` — inline scripts / styles instead of `wp_enqueue_*`.
- `Generic.Files.LineLength` — soft warning; don't list every long-line warning as a finding.

PHPCS warnings are **candidates**, not findings. Verify (see `false-positive-traps.md`) before transcribing.

---

## 8. License & GPL

The plugin's own code must be GPL-compatible (GPLv2 or later). Bundled libraries must be compatible — common compatible licenses: MIT, BSD, Apache-2.0 (with notes), LGPL.

**Detect bundled libs:**
```bash
test -d vendor && ls vendor/
test -d node_modules && ls node_modules/
find . -name "LICENSE*" -not -path "./vendor/*" -not -path "./node_modules/*"
```

For each bundled lib, confirm license is compatible. Apache-2.0 has a patent grant clause that's compatible with GPLv3 only (not GPLv2 alone). PHPUnit (BSD-3) shipped with the plugin? Don't ship — it's dev-only.

Defer detailed GPL questions to `wp-plugin-directory-guidelines`.

---

## 9. wp.org Plugin Directory hard rules

(Subset; full list in `wp-plugin-directory-guidelines` skill.)

| Rule | Verify |
|---|---|
| No "calling home" without explicit user consent | Search for `wp_remote_*` to telemetry endpoints; consent UI? |
| No trialware / paywall for advertised features | Free version must deliver what `readme.txt` says |
| No naming a plugin "WP Foo" or "WordPress Foo" if not officially endorsed | Check plugin name + slug |
| No tracking without opt-in | UA / Google Analytics / Mixpanel etc. |
| No external server dependencies for core functionality without disclosure | Plugin shouldn't break if external API is down without disclosure |
| Code must be human-readable | No obfuscation, no minified PHP, no eval-based loaders |
| Trademarks in plugin name / slug | Common gotchas: "WooCommerce", "Yoast", "Elementor" |

---

## 10. Unit / integration tests

Not a strict standard, but audit-relevant:

- `phpunit.xml(.dist)` present?
- `tests/` directory with at least bootstrap + one test?
- Tests excluded from production install? (`.distignore`, `.gitattributes export-ignore`, or `phpcs.xml` exclude)
- CI config (`.github/workflows/`, `.gitlab-ci.yml`, `bitbucket-pipelines.yml`)?

No tests → Info-level note. Tests shipped to production users → Low.

---

## 11. Build artifacts

| Issue | Why | Action |
|---|---|---|
| `dist/` shipped without source | Can't audit | Note in report; downgrade confidence |
| `node_modules/` shipped | Bloat + license confusion | Flag as Low |
| `.env` / `.env.local` committed | Secrets risk | **High** if real secrets; Low if template |
| `.git/` committed in release zip | Info disclosure | High |
| Build scripts (`webpack.config.js`, `package.json`) shipped to end users | Confuses non-dev users; bloat | Info |

---

## 12. Common smells (Low / Info severity)

- `error_log()` / `var_dump()` / `console.log()` left behind.
- TODO / FIXME / XXX comments with security implications (e.g. "TODO: add nonce").
- Magic numbers without named constants.
- Long functions (>200 lines) without justification.
- Deep nesting (>4 levels).
- God-class doing 5+ unrelated responsibilities.
- Missing `register_uninstall_hook` → orphan options / tables (often acceptable; document).
