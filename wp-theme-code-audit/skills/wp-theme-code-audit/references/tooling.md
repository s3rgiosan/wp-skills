# Tooling

PHPCS, PHPStan, Theme Check, Composer audit, npm audit for themes. Install steps, the WPCS rule table, PHPStan setup and pure-read fallback are shared with the plugin skill's `tooling.md`; this file states the theme deltas and the theme review tool. The skill works without any of these tools.

---

## Discover: scoped file list and helpers

Run once, before any other command in this file or in the checklists. It writes to `/tmp/theme-audit-<slug>/`, builds `$OUT/files.txt` (tracked files only; dependencies and build output excluded), and defines two helpers every later grep in this skill relies on: `count()` (a count over the scoped list) and `srcgrep()` (a grep restricted to files matching an extension in the scoped list). Paste it whole; empty results are normal and it exits 0. Source only: exclude dependencies and build output. In a git repo, `git ls-files` is authoritative (tracked files only, ignoring whatever is built on disk); otherwise fall back to the filesystem. Adjust the exclusion to the theme's actual build directories, and use the same list for every count in the report.

```bash
cd path/to/theme
SLUG=$(basename "$PWD"); OUT=/tmp/theme-audit-$SLUG; mkdir -p "$OUT"
EXCL='(^|/)node_modules/|^(vendor|dist|build)/|^assets/(dist|build)/'
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git ls-files -- . | grep -vE "$EXCL" > "$OUT/files.txt"
  git ls-files -- dist build assets/dist assets/build | head -3            # built output committed? note it in Scope
else
  find . -type f | sed 's|^\./||' | grep -vE "$EXCL" > "$OUT/files.txt"
fi
count()   { grep -cE "$1" "$OUT/files.txt" || true; }
srcgrep() { local ext=$1; shift; grep -E "$ext" "$OUT/files.txt" | tr '\n' '\0' | xargs -0 grep -nHE "$@" 2>/dev/null || true; }

# Identity and type
grep -E "^\s*\*?\s*(Theme Name|Template|Version|Requires at least|Tested up to|Requires PHP|License|Text Domain|Update URI):" style.css
if [ -f theme.json ]; then jq '.version' theme.json; fi
if [ -f templates/index.html ]; then echo "block theme"; fi
if [ -f index.php ]; then echo "classic entry"; fi

# Shape (counts for the report)
count '\.php$'; count '^templates/.*\.html$'; count '^parts/.*\.html$'; count '^patterns/.*\.php$'
count '(^|/)block\.json$'; count '^styles/.*\.json$'

# How modules load (reachability, see Verify)
srcgrep '\.php$' "ModuleInitialization|init_classes\(|can_register\(|new \\\$[a-z_]+\(|^\s*[A-Za-z_\\\\]+::class\s*,"

# Content model and exposure (security §4, §5, §20)
srcgrep '\.php$' -A25 "register_(post_type|taxonomy)\(" | grep -E "register_(post_type|taxonomy)|(public|publicly_queryable|show_in_rest|exclude_from_search|rewrite)['\"]?\s*=>" || true
srcgrep '\.php$' "extends [A-Za-z_\\\\]*Abstract(PostType|Taxonomy)"      # inherited registration defaults: security §4
srcgrep '\.php$' -A15 "register_(post_|term_|user_)?meta\(" | grep -E "register_|show_in_rest|auth_callback|sanitize_callback" || true
srcgrep '\.php$' "wp_sitemaps_|wpseo_sitemap_|wpseo_exclude_from_sitemap"
srcgrep '\.php$' "add_(filter|action)\(\s*['\"](request|parse_request|do_parse_request|pre_get_posts|template_redirect|template_include|post_link|post_type_link|page_link|redirect_canonical)['\"]"
srcgrep '\.php$' "get_(post|user|term)_meta\([^)]*(_id|_ids|_ref|image|avatar|attachment)['\"]|get_field\("

# Other PHP surface
srcgrep '\.php$' "register_rest_route|add_action\(\s*['\"]wp_ajax_|add_menu_page|add_(options|submenu|theme)_page|wp_schedule_event"
srcgrep '\.php$' "wp_kses_allowed_html|kses_allowed_protocols|map_meta_cap|user_has_cap|kses_remove_filters|content_save_pre"
srcgrep '\.php$' "customize_register|\\\$wp_customize->add_(setting|control)\("
srcgrep '\.php$' "add_action\(\s*['\"](save_post|wp_insert_post|rest_after_insert_)|wp_(insert|update)_post\("
srcgrep '\.php$' "add_shortcode|do_shortcode|render_callback"; srcgrep 'block\.json$' '"render"'
srcgrep '\.(php|html)$' "wp_interactivity_(state|config|data_wp_context)|data-wp-context"
srcgrep '\.php$' "(get_template_part|locate_template|load_template|include|require)(_once)?\s*\(?[^;]*\\\$"
srcgrep '\.php$' "\\\$_(GET|POST|REQUEST|SERVER|COOKIE)\[|\\\$wpdb->"
srcgrep '\.php$' "wp_(enqueue|register)_(script|style|script_module)\("

# Build and bundled libraries
if [ -f package.json ]; then jq '.scripts, .dependencies, .devDependencies' package.json; fi
if [ -f composer.json ]; then jq '.require, .["require-dev"]' composer.json; fi
grep -E '\.min\.(js|css)$|(^|/)(vendor|lib|libs)/.*\.(js|css)$' "$OUT/files.txt" || true
```

---

## PHPCS + WPCS

Install as in the plugin skill's `tooling.md`. Run against the theme with the same standards, excluding build output and dependencies:

```bash
./vendor/bin/phpcs \
  --standard=WordPress,WordPress-VIP-Go,PHPCompatibilityWP \
  --runtime-set testVersion 7.4- \
  --runtime-set text_domain "$SLUG" \
  --extensions=php \
  --ignore="*/vendor/*,*/node_modules/*,*/dist/*,*/build/*" \
  --report=full \
  ./path/to/theme > "$OUT/phpcs.txt"
```

Quote the `--ignore` value: unquoted, zsh (the macOS default shell) expands the globs and aborts before PHPCS runs. To check exactly the scoped file list from SKILL.md → Discover, pass it instead of a directory: `grep -E '\.php$' "$OUT/files.txt" > "$OUT/php-files.txt"` then run PHPCS from the theme directory with `--file-list="$OUT/php-files.txt"` (the paths are relative to it).

Set `testVersion` from the theme's `Requires PHP` header. `text_domain` makes `WordPress.WP.I18n` flag strings with the wrong domain. The prefix check (`WordPress.NamingConventions.PrefixAllGlobals`) only runs when its `prefixes` property is set, which needs a ruleset file; keep it outside the theme and pass it with `--standard`:

```xml
<?xml version="1.0"?>
<ruleset name="theme-audit">
  <rule ref="WordPress"/>
  <rule ref="WordPress-VIP-Go"/>
  <rule ref="PHPCompatibilityWP"/>
  <rule ref="WordPress.NamingConventions.PrefixAllGlobals">
    <properties>
      <property name="prefixes" type="array">
        <element value="acme_agency"/>
      </property>
    </properties>
  </rule>
</ruleset>
```

```bash
./vendor/bin/phpcs --standard="$OUT/ruleset.xml" --runtime-set text_domain "$SLUG" ... ./path/to/theme
```

Theme deltas when reading the output:

| Rule | Theme note |
|---|---|
| `WordPress.Security.EscapeOutput.OutputNotEscaped` | Fires constantly in templates. Verify each with the plugin skill's `false-positive-traps.md` §3 and trace who writes the value. Template tags such as `the_title()`, `the_content()`, `the_permalink()`, `body_class()` are not findings on their own. |
| `WordPress.WP.EnqueuedResources` | Hardcoded `<script>` / `<link>` tags: `theme-standards-checklist.md` §8. |
| `WordPress.NamingConventions.PrefixAllGlobals` | The theme review requirements ask for a prefix of at least four letters. |
| `WordPress.WP.I18n.*` | Text domain must equal the theme slug. |
| `WordPress.Files.FileName.InvalidClassFileName` | Often noise in themes that use PSR-4; do not list. |

`--extensions=php` skips `templates/*.html` and `parts/*.html` (block markup, not PHP) by design.

The standalone `WPThemeReview` PHPCS standard (`WPTT/WPThemeReview`) was last updated in 2021 and requires WPCS 2.x; it does not install alongside WPCS 3. Use WPCS plus Theme Check instead.

---

## PHPStan

Same setup as the plugin skill's `tooling.md` (`szepeviktor/phpstan-wordpress`, level 5), with theme paths:

```neon
includes:
  - vendor/szepeviktor/phpstan-wordpress/extension.neon
parameters:
  level: 5
  paths:
    - functions.php
    - inc/
    - src/
    - patterns/
  excludePaths:
    - vendor/*
    - node_modules/*
    - dist/*
    - build/*
```

Templates rely on globals set by the template loader (`$post`, `$wp_query`, block render variables `$attributes`, `$content`, `$block`), which PHPStan reports as undefined. Either exclude template directories from `paths`, or add a scan file that declares those variables; do not transcribe "undefined variable `$attributes`" in a `render.php` as a finding. Child themes: add the parent theme to `scanDirectories` so calls into parent functions resolve. For WP-specific setup, defer to the `wp-phpstan` skill.

---

## Theme Check (WordPress.org theme review)

Theme Check (`https://wordpress.org/plugins/theme-check/`, source `https://github.com/WordPress/theme-check`) runs the automated checks WordPress.org uses for theme submissions. Its version number is the date of the review guidelines it implements (for example `20260901`). Plugin Check does not check themes.

It needs a WordPress install with the theme present. Two ways to run it:

```bash
# CLI (the plugin adds a `theme-check` command to WP-CLI)
wp plugin install theme-check --activate
wp theme-check run "$SLUG" > "$OUT/theme-check.txt"
wp theme-check run "$SLUG" --format=json > "$OUT/theme-check.json"
```

- `wp theme-check run [<theme>] [--format=<table|json>]`: the theme argument is the slug (defaults to the active theme); `--format` is `table` (default) or `json`.
- **wp-admin:** Appearance → Theme Check, choose the theme, "Check it!". Results are grouped into required, warning, recommended and info.

Interpretation:

- **REQUIRED** items are what the Themes Team rejects on. For a wp.org submission, each unresolved one is a finding (Medium by default; higher when it is also a security issue). For a custom theme, map each to its real consequence (see `theme-standards-checklist.md`).
- **WARNING / RECOMMENDED / INFO** are candidates. Many are directory policy with no effect on a custom theme (screenshot size, tags, credit links).
- Theme Check's escaping and prefix checks are pattern matches; verify them like PHPCS output.
- Run with `WP_DEBUG` on: the review requirements treat PHP notices and warnings as failures, and they show up in the debug log during the check.

---

## Composer audit

```bash
cd /path/to/theme
composer audit --locked > "$OUT/composer-audit.txt"     # reads composer.lock, works without vendor/
```

Themes seldom ship PHP dependencies; when they do, check how `vendor/` is built. A build step or deploy that runs `composer install` **without** `--no-dev` ships `require-dev` packages (test frameworks, PHPCS, debug tools) into the theme on the server. Detect it:

```bash
test -d vendor && jq -r '.packages[].name' vendor/composer/installed.json 2>/dev/null | sort > "$OUT/vendor-installed.txt"
jq -r '.["packages-dev"][]?.name' composer.lock | sort > "$OUT/composer-dev.txt"
comm -12 "$OUT/vendor-installed.txt" "$OUT/composer-dev.txt"   # dev packages present in the shipped vendor/
grep -RnE "composer install" .github/ .gitlab-ci.yml bin/ scripts/ Makefile package.json 2>/dev/null
```

---

## npm audit

Audit the lockfile without installing, and classify every advisory by where the code ends up:

```bash
cd /path/to/theme
npm audit --package-lock-only --json > "$OUT/npm-audit.json"
npm audit --package-lock-only --omit=dev > "$OUT/npm-audit-runtime.txt"
npm ls --package-lock-only --omit=dev --all > "$OUT/npm-runtime-tree.txt" 2>/dev/null
```

| Where the package ends up | Column value | Rating |
|---|---|---|
| In `dependencies` and imported by theme source that the build bundles into `dist/` / `build/` JS | **ships-to-frontend** | Per the advisory; the code runs in every visitor's browser |
| In `dependencies` but only used by build scripts, or never imported | **runtime (not bundled)** | Low; move it to `devDependencies` |
| In `devDependencies` (webpack, sass, linters, `@wordpress/scripts`) | **dev** | Info; it never reaches the site |

When a flagged package resolves to more than one version or appears under more than one parent (a runtime library and a dev tool can pull different copies), classify each copy separately: `npm ls --package-lock-only --all <package>` prints every resolved version with the parent chain that brings it in.

Confirm "ships-to-frontend" from the source imports (`grep -RnE "from ['\"]<package>" src/`) or from the bundle, not from `package.json` alone. A theme whose built JS is committed but whose lockfile is absent cannot be audited this way; check bundled libraries by version string instead (`theme-security-checklist.md` §15).

---

## Pure-read fallback

Same as the plugin skill: list unavailable tools in Scope and set confidence accordingly.

```markdown
- Tools run:
  - PHPCS: yes
  - PHPStan: skipped (not available)
  - Theme Check: skipped (no WordPress install)
  - Composer audit: n/a (no composer.lock)
  - npm audit: yes (package-lock only)
- **Confidence:** medium. Theme Check not run; directory-requirement coverage is manual.
```
