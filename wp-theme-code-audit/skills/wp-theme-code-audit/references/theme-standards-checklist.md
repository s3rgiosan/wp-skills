# Theme Standards Checklist

WordPress.org theme review requirements, block theme hygiene, enqueue correctness, deprecated APIs and theme supports. Most findings here are Low / Info unless they block a directory submission, break a feature, or add attack surface.

The authoritative list is the Themes Team handbook: **Theme Review Requirements** at `https://make.wordpress.org/themes/handbook/review/required/`. It is organised in numbered sections (Licensing & Copyright, Privacy, Accessibility, Code, Functionality and features, Plugins, Naming, Language & Internationalization, Files, Classic themes, Block themes, Theme settings and onboarding, Selling/credits/links, Upload restrictions). Cite the section by name when a finding rests on it, and re-read the page before a submission audit: it changes. Automated coverage comes from Theme Check (`tooling.md`); the manual checks below cover what it cannot judge.

**Running the Detect commands.** They are written as `grep -R ... .` / `find .` for readability. Run them over the scoped file list from SKILL.md → Discover (`srcgrep`), or exclude `node_modules`, `vendor`, `dist` and `build`, so build output never produces hits or counts.

For themes that will never be submitted to WordPress.org (custom agency themes, marketplace themes), the directory rules are guidance, not gates. Rate by consequence: a directory-only rule broken in a custom theme is **Info**, unless it also causes a real problem (plugin territory, security, i18n breakage).

---

## 1. `style.css` header

**Detect:**
```bash
sed -n '1,30p' style.css
grep -E "^\s*\*?\s*(Theme Name|Theme URI|Author|Author URI|Description|Version|Requires at least|Tested up to|Requires PHP|License|License URI|Text Domain|Template|Update URI|Tags):" style.css
```

The theme review requirements list these as required: Theme Name, Author, Description, Version, Requires at least, Tested up to, Requires PHP, License, License URI, Text Domain. `Template` is required for child themes (the parent's folder name). `Update URI` is optional but belongs on every non-wp.org theme (see SKILL.md → Discover).

| Missing / wrong | Severity |
|---|---|
| `License` not GPL-compatible | **NO-GO** for wp.org; for a custom theme, a licensing question for the owner |
| `Text Domain` missing or not the theme slug | Medium (translations break) |
| `Requires at least` / `Requires PHP` missing | Low (users can install it on an unsupported stack) |
| `Tested up to` far behind the current WordPress release | Low |
| `Update URI` missing on a non-wp.org theme | Medium (slug hijack exposure, same reasoning as the plugin skill's standards checklist §2 → Folder slug ownership) |
| `Version` not semver, or out of sync with the changelog / readme | Low |

---

## 2. Licensing and bundled assets

Theme code, images, fonts and bundled libraries must be GPL-compatible, and third-party resources need their copyright and license listed (the review requirements put this list in `readme.txt`).

**Detect:**
```bash
find . -iname "LICENSE*" -not -path "*/node_modules/*" -not -path "*/vendor/*"
find . \( -name "*.woff2" -o -name "*.woff" -o -name "*.ttf" \) -not -path "*/node_modules/*"
sed -n '/== Copyright ==/,/==/p;/== Resources ==/,/==/p' readme.txt 2>/dev/null
```

Flag fonts, icon sets and images with no stated license, and libraries whose license is not GPL-compatible. Defer detailed GPL questions to `wp-plugin-directory-guidelines` (the licence rules are shared).

---

## 3. Escaping, sanitization, prefixing

The review requirements expect untrusted data validated and sanitized before it is stored and escaped before output, and a unique prefix (at least four characters) on everything in the global namespace: functions, classes, constants, hooks, global variables, option names, handles. Third-party library names and menu/sidebar IDs are exempt.

Escaping findings are security findings: rate them with `theme-security-checklist.md` and the plugin skill's `false-positive-traps.md`, not here. Prefixing uses the plugin skill's standards checklist §2 (including the sibling-plugin collision grep), with one theme delta: run the collision grep against `wp-content/themes/` as well, and remember that a child and parent theme share a namespace, so an unprefixed function in the child that the parent also declares without `function_exists()` fatals on load.

```bash
grep -RnE "^function [a-z_]+\(" --include="*.php" . | grep -vE "function <prefix>_"
grep -RnE "(wp_enqueue_script|wp_enqueue_style|wp_register_script|wp_register_style)\(\s*['\"][a-z-]+['\"]" --include="*.php" .   # handles
```

---

## 4. Internationalization

**Detect:**
```bash
grep -RnoE "(__|_e|_x|_ex|_n|_nx|esc_html__|esc_html_e|esc_attr__|esc_attr_e|esc_html_x|esc_attr_x)\([^;]*" --include="*.php" . | grep -oE "['\"][a-z0-9-]+['\"]\s*\)$" | sort | uniq -c
grep -RnE "load_theme_textdomain|load_child_theme_textdomain" --include="*.php" .
grep -RnE "wp_set_script_translations" --include="*.php" .
```

| Issue | Severity |
|---|---|
| Text domain differs from the theme slug, or mixed domains | Medium |
| Text domain passed as a variable | Medium (extraction tools cannot read it) |
| User-facing strings in PHP not wrapped in gettext | Low (the requirements exempt text in HTML block templates; use patterns for translatable template text) |
| Classic theme bundling translations in `languages/` without `load_theme_textdomain()` | Medium (bundled translations never load) |
| JS using `@wordpress/i18n` without `wp_set_script_translations()` | Low |

Themes hosted on WordPress.org get translations from translate.wordpress.org loaded automatically; `load_theme_textdomain()` matters for translations shipped inside the theme. Child themes load their own domain with `load_child_theme_textdomain()`.

---

## 5. Plugin territory

The review requirements exclude functionality unrelated to design and presentation: custom post types, custom taxonomies used for content, custom blocks, shortcodes, custom roles, user contact methods, MIME types, and non-design features (SEO fields, analytics, forms, sliders stored as content). The reason matters beyond wp.org: content created through a theme's CPTs, shortcodes or meta disappears or breaks when the site switches theme (content lock-in).

**Detect:**
```bash
grep -RnE "register_post_type|register_taxonomy|add_shortcode|add_role|register_block_type|register_post_meta|register_meta|upload_mimes|user_contactmethods" --include="*.php" .
grep -RnE "register_rest_route|wp_ajax_|wp_schedule_event|\\\$wpdb->" --include="*.php" .
```

| Situation | Rating |
|---|---|
| wp.org submission with any of the above | Blocks approval (**High** for the submission) |
| Custom theme where content depends on theme-registered CPTs / shortcodes / meta | **Medium** `[DECISION]`: move to a site plugin or mu-plugin, or accept the lock-in |
| Presentational blocks and meta (layout toggles, hero styles) in a custom theme | **Info** |

Every item found here is also attack surface: audit it with the plugin skill's security and performance checklists.

---

## 6. Block theme hygiene

**Detect:**
```bash
jq '.version, .["$schema"]' theme.json
jq '.settings.custom | keys?' theme.json
jq '.customTemplates, .templateParts' theme.json
ls templates parts patterns styles 2>/dev/null
grep -LE "^\s*\*\s*(Title|Slug):" patterns/*.php 2>/dev/null        # patterns missing required headers
grep -hE "^\s*\*\s*Slug:" patterns/*.php 2>/dev/null | grep -v "<text-domain>/"
```

| Check | Expectation | Severity if wrong |
|---|---|---|
| `theme.json` `version` | Current schema is **3** (WordPress 6.6+). Version 2 still works and is migrated at runtime; version 1 is legacy. | Low (v2), Medium (v1) |
| `$schema` | Points at `https://schemas.wp.org/wp/<x.y>/theme.json` or `trunk` for editor validation | Info |
| Required files | `style.css`, `theme.json`, `templates/index.html` (and `readme.txt` for wp.org) | High if `templates/index.html` is missing (not a block theme) |
| Block markup | Complete; no missing or incorrect closing block comments (a review requirement) | Medium (editor shows "Attempt recovery"; front end may render broken) |
| `settings.custom` | Design tokens only. Not a store for content, URLs, API keys or feature flags (it prints as CSS custom properties on every page) | Medium if it holds anything sensitive, Low otherwise |
| `customTemplates` / `templateParts` | Every file in `templates/` / `parts/` that should be selectable is registered with a `name`, `title` and (for parts) `area`; every registered name has a file | Low |
| Pattern headers | `Title` and `Slug` required; `Slug` namespaced with the theme slug (`acme-agency/hero`); `Categories`, `Inserter: no` for patterns used only by templates; `Block Types`, `Post Types`, `Template Types`, `Viewport Width` where relevant | Low |
| Style variations | `styles/*.json` valid, with `title`; no free-form CSS copied between variations when a preset would do | Info |
| Hardcoded values in templates / parts | No absolute URLs, attachment IDs or post IDs from a development site (see `theme-security-checklist.md` §10) | Low |

---

## 7. Classic theme requirements

From the review requirements' classic theme section: `wp_head()`, `wp_footer()`, `body_class()`, `wp_body_open()`, `post_class()`, `language_attributes()`, `wp_link_pages()` where content is paginated, `add_theme_support( 'title-tag' )` and `add_theme_support( 'automatic-feed-links' )`, and `get_header()` / `get_footer()` / `get_sidebar()` / `get_search_form()` / `get_template_part()` to load partials.

```bash
for fn in wp_head wp_footer body_class wp_body_open post_class language_attributes; do
  printf "%-22s %s\n" "$fn" "$(grep -RlE "\b$fn\(" --include="*.php" . | wc -l)"
done
grep -RnE "add_theme_support\(\s*['\"](title-tag|automatic-feed-links)['\"]" --include="*.php" .
grep -RnE "<title>" --include="*.php" .   # hardcoded title tag instead of title-tag support
```

A missing `wp_head()` or `wp_footer()` is **High** (plugins and core scripts silently fail to load). The rest are Low for custom themes.

---

## 8. Enqueue correctness

**Detect:**
```bash
grep -RnE "<(script|link)[^>]+(src|href)=" --include="*.php" --include="*.html" .   # hardcoded tags
grep -RnE "wp_(enqueue|register)_(script|style|script_module)\(" --include="*.php" .
grep -RnE "wp_localize_script|wp_add_inline_script|wp_add_inline_style" --include="*.php" .
grep -RnE "add_action\(\s*['\"](wp_enqueue_scripts|enqueue_block_assets|enqueue_block_editor_assets|admin_enqueue_scripts)['\"]" --include="*.php" .
```

| Issue | Severity | Fix |
|---|---|---|
| Hardcoded `<script>` / `<link rel="stylesheet">` in templates or `wp_head` echoes | Low (Medium if it bypasses consent handling) | `wp_enqueue_script()` / `wp_enqueue_style()` |
| Inline `<script>` blocks echoed in templates | Low | `wp_add_inline_script()` (and `wp_json_encode()` for data) |
| Enqueued without a version, or with `time()` as version | Low | `wp_get_theme()->get( 'Version' )` or the `*.asset.php` file from the build |
| `*.asset.php` produced by the build but ignored (dependencies and version hardcoded) | Low | Read `dependencies` and `version` from the asset file |
| Module JS (`import` syntax, Interactivity API stores) enqueued as a classic script | Medium (broken) | `wp_enqueue_script_module()` / `viewScriptModule` in `block.json` |
| `get_template_directory_uri()` used for assets a child theme is meant to override | Low | `get_theme_file_uri()` (resolves child first) |
| jQuery deregistered or replaced with a CDN copy | Medium | Remove; depend on core's `jquery` handle only where needed |
| Styles enqueued on `wp_enqueue_scripts` that the editor also needs | Low | `add_editor_style()` or `enqueue_block_assets` |

Performance aspects of enqueues (global vs per-block, weight) are in `theme-performance-checklist.md`.

---

## 9. Deprecated APIs and theme supports

Use the plugin skill's standards checklist §4 detection for general deprecated functions. Theme-specific additions:

```bash
grep -RnE "get_bloginfo\(\s*['\"](url|wpurl|stylesheet_url|template_url|template_directory)['\"]" --include="*.php" .
grep -RnE "\b(get_theme_data|get_themes|get_current_theme|add_custom_background|add_custom_image_header|screen_icon|wp_get_sites)\(" --include="*.php" .
grep -RnE "add_theme_support\(" --include="*.php" .
```

| `add_theme_support` issue | Note |
|---|---|
| `add_theme_support( 'wp-block-styles' )`, `'align-wide'`, `'editor-styles'`, `'responsive-embeds'` in a block theme | Block themes get these by default (or through `theme.json`); redundant, **Info** |
| `editor-color-palette`, `editor-font-sizes`, `editor-gradient-presets`, `custom-spacing`, `custom-line-height` set in PHP while `theme.json` also defines them | `theme.json` takes precedence; the PHP values are dead or conflicting, **Low** |
| `html5` support missing in a classic theme | Core outputs legacy markup for search form, comments, gallery, script/style tags, **Low** |
| Supports registered outside `after_setup_theme` | Timing bugs, **Low** |
| `post-thumbnails` used in templates but not declared (classic) | Featured images fail silently, **Low** |

---

## 10. Files and packaging

| Issue | Severity |
|---|---|
| Minified JS/CSS without the source shipped (a review requirement) | Info for custom themes; blocks wp.org approval |
| `node_modules/`, tests, build configs, lockfiles, agent notes in the deployed theme | See `theme-security-checklist.md` §18 |
| `screenshot.png` missing or not 4:3 (the requirements cap it at 1200×900) | Info |
| `readme.txt` missing (required for wp.org), or no changelog anywhere | Info |
| Remote resources loaded without consent, other than Google Fonts (a review requirement) | Low for custom themes; also a privacy question for the owner |
| Admin notices that are not dismissible, or theme onboarding redirects on activation | Low (review requirements prohibit both) |
