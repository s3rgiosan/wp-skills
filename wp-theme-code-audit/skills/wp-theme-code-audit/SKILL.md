---
name: wp-theme-code-audit
description: >
  Use when auditing a WordPress theme (block, classic, hybrid or child) for
  security, performance, theme review standards, and child-theme override
  safety. Triggers: "audit this theme", "review the theme", "is this theme
  secure", "theme security review", "theme code review", "is this theme safe
  to install", "check this theme for vulnerabilities", "review this block
  theme", "review this child theme", "performance review of this theme", or
  any request to evaluate the quality / safety of a WordPress theme from a
  local checkout, a single file/function, or a remote source (wp.org theme
  slug, GitHub URL). Requires wp-plugin-code-audit.
---

# WordPress Theme Code Audit

Opinionated, verification-first audit workflow for WordPress themes. Produces a markdown report with findings sorted by risk, a fix recommendation per finding, owner-decision (`[DECISION]`) questions only the owner can answer, an optional reproduction step, and a final **GO / NO-GO / GO WITH FIXES** verdict. Covers security, performance, theme review standards, and the template overrides a child theme makes against its parent.

> **Requires `wp-plugin-code-audit`.** This skill is the theme counterpart of `wp-plugin-code-audit` and builds on it: the severity rubric (including the subscriber-exploitable and silent-corruption rules), `[DECISION]` markers, verdict rules, permanent finding IDs, report location and filename rules, and `false-positive-traps.md` all live there and apply here unchanged. Theme PHP that registers REST routes, AJAX handlers, admin pages, meta, cron or DB queries is audited with that skill's `security-checklist.md` and `performance-checklist.md`. Install both, and load `wp-plugin-code-audit` alongside this skill. "The plugin skill" means `wp-plugin-code-audit`; "plugin `references/<file>`" means a file in its `references/` folder. Locate it by layout: after `install.sh`, `../wp-plugin-code-audit/references/` from this skill's folder; in a repo checkout, `../../../wp-plugin-code-audit/skills/wp-plugin-code-audit/references/`; after a marketplace install, find the installed `wp-plugin-code-audit` skill folder (do not guess a cache path).

> **Scope:** one WordPress theme at a time: block, classic, hybrid or child. Local checkout (directory path), targeted file / function, or remote (wp.org theme slug, GitHub URL). For a child theme, the child is audited in full and each parent template it overrides is diffed; the whole parent is out of scope (see `references/child-theme-review.md`). Not plugins (use `wp-plugin-code-audit`). Not whole-site sweeps.

> **Verification discipline:** every finding written to the report must be verified against source. Themes echo far more than plugins do, so escape findings are the most over-flagged category here. Run the plugin skill's `false-positive-traps.md` procedures before reporting any SQLi, nonce, escape or sanitize finding.

---

## When To Use This Skill

- Reviewing a third-party or marketplace theme before installing it on a production site.
- Auditing an agency-built custom theme before launch or handover.
- Reviewing a child theme, including what its overrides changed relative to the parent.
- Checking a theme before a WordPress.org theme directory submission.
- Security sweep after a report of unexpected markup, scripts or redirects on the front end.
- Spot-check on a single template, block render file, pattern or function.

If the goal is "is this theme safe / good enough / mergeable", this is the right reference.

---

## Shared conventions (from `wp-plugin-code-audit`)

Read these in the plugin skill before the first audit. Only the deltas are stated here.

| Convention | Where | Delta for themes |
|---|---|---|
| Severity rubric, subscriber-exploitable rule, silent-corruption rule | plugin `SKILL.md` → Severity Rubric | For themes the role question is usually **Contributor / Author**: the theme renders what low-privilege editors write. See Verify below. A theme is rarely the system of record, so the silent-corruption rule applies only when theme code writes data (generators, save hooks, counters). |
| `[DECISION]` findings | plugin `SKILL.md` → Owner-decision findings | None. |
| Verdict rules | plugin `SKILL.md` → Verdict Rules | None. |
| Permanent finding IDs | plugin `SKILL.md` → Finding IDs are permanent | None: IDs are never reused or renumbered, and the report states only each finding's current severity and rationale (no withdrawn, superseded or re-rated history; that lives in the remediation log). |
| Report location and filename | plugin `SKILL.md` → Report | File is `THEME-AUDIT-<yyyy-mm-dd>.md` (same-day re-audit: `THEME-AUDIT-<yyyy-mm-dd>-<HHMM>.md`). Git-ignore pattern: `THEME-AUDIT-*.md`. Ask where to write, default to `.claude/`, never overwrite. |
| False-positive traps | plugin `references/false-positive-traps.md` | Plus the theme notes in Verify below. |
| Remote fetch | plugin `references/remote-fetch.md` | wp.org theme URLs differ; see Discover. |

---

## Phases (Always In Order)

1. **Discover**: identify theme shape (type, parent, templates, blocks, build, bundled libraries, data-supplying plugins).
2. **Tool scan**: run PHPCS+WPCS, PHPStan, Theme Check, Composer/npm audit if available; collect raw findings.
3. **Manual read**: `functions.php` and includes, kses and capability filters, meta registration, templates, block render files, patterns, front-end JS, enqueues, then child overrides.
4. **Verify**: every candidate finding traced through source, including who can write the data a template renders. No unverified findings in the report.
5. **Reproduce** *(optional, high value)*: where an environment is available, trigger the top findings with the lowest role that reaches them. Skip cleanly when read-only.
6. **Report**: write `THEME-AUDIT-<yyyy-mm-dd>.md` to a non-public location with severity-sorted findings, fix per finding, verdict.

Skipping phase 4 is how false positives ship. Phase 5 confirms a finding; it never replaces the phase-4 trace.

---

## 1. Discover

Scope the theme before reading code. Write the scope at the top of the report, including the Theme shape block (see `references/report-template.md`).

**Ask up front: which plugins supply the data this theme renders?** A theme is mostly a view layer. Its riskiest output is data it did not write: profile fields, ACF values, form embeds, marketing-automation snippets (Marketo, HubSpot and similar), SEO fields. For each, you will need to know who can write the field (Verify). Record the list in Scope.

**Scope the file list first; every count and grep below runs over it.** The block is safe to paste whole; empty results are normal and the block exits 0. Source only: exclude dependencies and build output. In a git repo, `git ls-files` is authoritative (tracked files only, ignoring whatever is built on disk); otherwise fall back to the filesystem. Adjust the exclusion to the theme's actual build directories, and use the same list for every count in the report.

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

Classify and record:

| Question | How to determine |
|---|---|
| **Type:** block / classic / hybrid / child | `templates/index.html` → block. `index.php` without `templates/` → classic. Both, or classic with `theme.json` → hybrid. `Template:` header in `style.css` → child (value is the parent's folder name). |
| **Parent** (child themes) | `Template:` header. Record parent name, version installed, and whether the parent is third-party and unreviewed. |
| **`theme.json` version** | `jq .version theme.json`. Current schema is version 3; version 1 or 2 is a standards note (see `references/theme-standards-checklist.md`). |
| **Build pipeline** | `src/` (or `assets/src/`) vs `dist/` / `build/`. Audit source; note when only built output ships. |
| **Bundled third-party JS/CSS** | Vendored files under `assets/vendor/`, `js/lib/`, minified files with a banner. Record name and version for each. |
| **Data-supplying plugins** | Grep templates for `get_field`, `the_field`, `get_the_author_meta`, plugin function prefixes, form embed shortcodes. Ask the user to confirm the list. |
| **Distribution + update channel** | wp.org (Theme URI on wordpress.org, slug resolves in the theme API) / commercial marketplace (for example ThemeForest; bundled updater, licence key) / custom agency theme (no update channel) / GitHub. |

A custom theme with no update channel has the same amplifier as a private plugin: the site owner cannot auto-patch. **`Update URI` applies to themes too** (WordPress 6.1+ reads it from `style.css` and sends it with the update check): a custom theme in a folder whose slug is unclaimed on wp.org can be offered an unrelated "update". Check with the theme API (below) and recommend `Update URI: false` for non-wp.org themes.

### Capture operating constraints

Ask the same three questions as the plugin skill (plugin `SKILL.md` → Discover → Capture operating constraints), phrased for a theme:

| Question | Why it changes a theme audit |
|---|---|
| **Who writes the content this theme renders?** Which roles exist and are in use (contributors, authors, guest writers), and which plugins write fields the templates output. | Most theme findings are rated by the lowest role that can plant a value the theme renders unescaped. |
| **How do changes reach production?** VCS + CI build, or files uploaded by hand. | Decides whether "fix it in `src/` and rebuild" is reachable, or the fix has to go into the shipped file. |
| **What's planned?** A redesign, a move to a block theme, a headless front end, a new form or marketing integration. | A classic theme due for replacement changes which findings are worth fixing now. |

### Skip ignored paths and dependencies

Same rule as the plugin skill: honour `.gitignore` / `.distignore`, skip `vendor/` and `node_modules/` unless asked, and audit source rather than `dist/` / `build/`. The file list above applies this; list what it excluded in Scope. **Delta: vendored front-end libraries copied into the theme (for example `assets/vendor/`, not installed by a package manager) stay in the list and are in scope for version checks** (`references/theme-security-checklist.md` §15): they ship to every visitor and nothing else updates them.

### Remote themes

Follow the plugin skill's `references/remote-fetch.md`. Theme deltas:

- Metadata: `curl -sSg "https://api.wordpress.org/themes/info/1.2/?action=theme_information&request[slug]=<slug>"` (add `&request[fields][versions]=1` for all versions). An unclaimed slug returns `{"error":"Theme not found"}`, which is also the `Update URI` check for custom themes. `-g` stops curl globbing the brackets.
- Download: `https://downloads.wordpress.org/theme/<slug>.<version>.zip` (without a version, `<slug>.zip` redirects to the current one). SVN: `https://themes.svn.wordpress.org/<slug>/<version>/`.
- Pin the audited version (or commit SHA) in Scope.

---

## 2. Tool scan

Run what's available; don't block on absence. Pure-read fallback works.

| Tool | Command | Catches |
|---|---|---|
| **PHPCS + WPCS** | `phpcs --standard=WordPress,WordPress-VIP-Go path/` | Standards, escaping/sanitizing hints, enqueue misuse |
| **PHPStan** | `phpstan analyse --level=5 path/` | Type bugs, null derefs, undefined vars |
| **Theme Check** | `wp theme-check run <slug> --format=json` (plugin active), or Appearance → Theme Check in wp-admin | The automated checks WordPress.org runs on theme submissions |
| **Composer audit** | `composer audit --locked` | Known CVEs in PHP deps |
| **npm audit** | `npm audit --package-lock-only` | Known CVEs in JS deps, classified runtime / dev / ships-to-frontend |

Plugin Check does not check themes; Theme Check is its theme counterpart. Commands, install steps and interpretation: `references/tooling.md`.

**Classify every dependency CVE by where the code ends up.** Theme `dependencies` bundled into `dist/` JS reach every visitor. `devDependencies` (webpack, sass, linters) do not reach the site, **unless** the build runs `composer install` without `--no-dev`, which ships dev PHP packages into the theme. Record a runtime / dev / ships-to-frontend column in the report.

**Branch reviews: `/security-review` as an extra candidate source (optional).** When the audit target is a feature branch or a set of pending changes, and Claude Code's built-in `/security-review` is available, run it on the branch. It reviews the diff only and has no WordPress-specific knowledge, so treat its output like any other tool: candidates that go through Verify, cited in the report as `[security-review]`. Skip it for whole-theme audits, where the diff is not the audit's scope.

> Tools generate **candidates**, not findings. Verify (phase 4) before reporting.

---

## 3. Manual read

Read in this order:

1. **`functions.php` and everything it includes** (`inc/`, `includes/`, `src/`, the theme's own autoloaded classes), starting with how modules are loaded (an auto-discovered directory or an explicit list), so every later finding can be checked for reachability. Any REST route, AJAX handler, admin page, meta registration, cron job or DB query found here is audited with the plugin skill's `security-checklist.md` and `performance-checklist.md` in full.
2. **kses / allowed-HTML and capability filters**: `wp_kses_allowed_html`, `kses_allowed_protocols`, `map_meta_cap`, `user_has_cap`, `kses_remove_filters`. These change the security model of the whole site, not only the theme.
3. **Meta registration**: every `register_post_meta` / `register_meta` / `register_term_meta`, its `show_in_rest`, `auth_callback` and `sanitize_callback`, then every template that renders that key.
4. **Templates and template parts**: classic `*.php` templates, `template-parts/`, block `templates/*.html` and `parts/*.html` (look for hardcoded IDs and URLs; block markup is otherwise data).
5. **Block render files**: each `block.json` `render` file or `render_callback`; `$attributes`, `$content`, `$block->context`.
6. **Patterns**: `patterns/*.php` headers and any PHP logic inside.
7. **View scripts and front-end JS**: `viewScript` / `viewScriptModule`, Interactivity API stores, theme `src/js`.
8. **Enqueues and third-party scripts**: every `wp_enqueue_*`, inline script, external URL, and vendored library.
9. **Child overrides** (child themes only): each file that exists in both child and parent, diffed per `references/child-theme-review.md`.

Apply the checklists. **Traverse every section of every checklist; don't skim.**

- `references/theme-security-checklist.md`: 20 theme-specific categories (kses widening, REST meta, save hooks, REST/sitemap exposure, routing overrides, render-by-ID, third-party output, shortcode injection, block render and Interactivity API, patterns, Global Styles CSS, dynamic template paths, DOM XSS, third-party scripts, bundled libraries, anonymous writes, redirects, info disclosure, direct access, stored ID pointers).
- Plugin skill `references/security-checklist.md`: for theme PHP that registers routes, handlers, admin pages, meta, cron or queries.
- `references/theme-performance-checklist.md` plus plugin skill `references/performance-checklist.md` for shared server-side items.
- `references/theme-standards-checklist.md`: theme review requirements, block theme hygiene, enqueue correctness.
- `references/child-theme-review.md`: child themes only.
- Plugin skill `references/false-positive-traps.md`: before flagging SQLi / nonce / escape / sanitize.

**Sections audited (traversal rule).** The report's Scope lists **every** theme-security-checklist section, §1 to §20, each with the finding IDs it produced or "checked, none" (add "verified false, see appendix" where a candidate was dropped). A section can be marked checked only after its **Detect** commands ran over the scoped file list and every hit was read; "no hits" is a valid result, "not run" is not. The other checklists get one line each in the same form.

---

## 4. Verify (mandatory)

Use the plugin skill's verification table (plugin `SKILL.md` → Verify) and `references/false-positive-traps.md` for SQLi, nonce, escape and sanitize candidates. The "counts are findings too" rule applies: every number in the report (templates, patterns, call sites, users per role) comes from a captured command over the scoped file list. Role-to-severity reference points are in `references/theme-security-checklist.md` (table at the top); that table is the one to rate against.

Theme-specific verification:

- **Confirm the code is reachable before rating it.** A class that implements the module interface, or a file sitting in `inc/`, may never run. Check four things: the file is loaded (explicit `require`, or an autoloader plus something that instantiates the class); the class is instantiated or registered; any `can_register()`-style guard returns true in the context the finding needs (front end, REST, admin); and the hook is actually added. Find out how the theme loads modules, because the two common shapes behave differently. **Auto-discovery:** some module frameworks scan a directory, instantiate every class that implements their module interface, and call `register()` only when `can_register()` returns true. For example, the open-source [10up WP Framework](https://github.com/10up/wp-framework) does this through `ModuleInitialization::instance()->init_classes( $dir )` for classes implementing the framework's `ModuleInterface`, and in production and staging it reads a `class-loader-cache` folder under that directory, so a stale cache can differ from source. **Explicit list:** a core class iterates an array of `Foo::class` entries; a class missing from the list never loads, whatever it implements. The "How modules load" commands in Discover find both. Unreachable code is **Info**: "dead code, would be <severity> if enabled", plus how it could become reachable (added to the list, moved into the discovered directory, guard flipped).
- **Rate by the capability that actually gates the write path, not the one the comment names.** Trace each sink back to where the value is written and the `current_user_can()`, `auth_callback` or kses filter that guards the write. A comment saying "admins only" next to `current_user_can( 'edit_posts' )` means Contributors. A comment asserting that a check enforces something stronger ("this enforces `unfiltered_html`") is a claim to verify, never evidence: confidently worded wrong comments are how these findings get missed. With an environment, count users per role: `wp user list --role=contributor --format=count` (repeat for `author`, `editor`). Zero today lowers likelihood, not severity.
- **Core-stored fields are often kses-filtered at save; check before rating an unescaped echo.** For users without `unfiltered_html`, `kses_init_filters()` hooks `wp_filter_kses` on `title_save_pre` and `wp_filter_post_kses` on `content_save_pre`, `excerpt_save_pre` and `content_filtered_save_pre`, so post titles, content and excerpts are filtered on save for every post type, including nav menu items (menu item titles are `post_title`). Term names and descriptions (`pre_term_name`, `pre_term_description`) and user bio, display name and name fields (`pre_user_description`, `pre_user_display_name`, `pre_user_first_name`, `pre_user_last_name`, `pre_user_nickname`) get `wp_filter_kses` for every user. The realistic writers of unfiltered values in those fields are users **with** `unfiltered_html` (Editors and Administrators on single site, Super Admins), which usually makes an unescaped echo Low or Info (still escape at output). **The opposite trap:** post, term and user meta, custom options, theme mods and third-party plugin fields are **not** kses-filtered by core; this shortcut applies to core-stored fields only.
- **"Only admins set this" is weaker on multisite.** Per-site Administrators do not have `unfiltered_html` (only Super Admins do). A meta field or option (not kses-filtered, per above) rendered raw "because only admins edit it" is stored XSS from a site admin into visitors and Super Admins. Check `is_multisite()` in Discover.
- **Third-party data needs its write path traced before rating.** An unescaped `get_field( 'bio' )` or profile-plugin field is only as severe as the lowest role that can write it. Open the supplying plugin, find the save path and its capability (profile fields are often user-writable, meaning Subscriber), and state plugin, path and capability in the finding. If it cannot be determined, say so and rate for the lowest plausible role.
- **Chains are one finding.** When two single-pattern findings chain (for example Contributor-writable raw meta plus a generator that publishes with kses off), rate the chain by its end-to-end precondition and impact under the plugin skill's rubric, record it as one finding citing both locations, and do not list the parts separately unless each is independently exploitable. Do not escalate for the number of patterns involved: escalate only when the rubric's clause (for example an auto-granted triggering role) applies, and cite it.
- **Pervasive patterns are one finding.** When a category matches most or all files in scope (missing ABSPATH guards, a missing text domain), report one finding with the count from a captured command and a few representative `file:line` examples.
- **Block markup in `templates/` and `parts/` is not a sink by itself**; findings live in the theme's blocks, render files, patterns and PHP. **`theme.json` CSS written by the theme author is trusted**; the surface is CSS a user can set without `edit_css`.

If verification fails, drop the finding and record it in the verified-false appendix.

---

## 5. Reproduce (optional, high value)

Same rules as the plugin skill (plugin `SKILL.md` → Reproduce). Theme delta: **reproduce with the lowest role the finding claims.** Create a Contributor (or Author) on the test install, plant the payload through the path you traced (the post editor, the REST meta endpoint, the profile screen), and load the front-end page as a logged-out visitor and as an Administrator. Put the user role, the exact request or field, and the rendered result in the report. Never run payloads against a production site.

---

## 6. Report

Follow the plugin skill's report rules (plugin `SKILL.md` → Report): ask where to write, default to `.claude/`, check the git-ignore status, keep a dated history, never overwrite, inline summary in chat (path + verdict + counts + top 3).

Deltas:

- **Filename:** `THEME-AUDIT-<yyyy-mm-dd>.md`; same-day re-audit `THEME-AUDIT-<yyyy-mm-dd>-<HHMM>.md`. Offer to add `THEME-AUDIT-*.md` to `.gitignore`.
- **Title:** `# Theme audit: <Theme Name> <version>`.
- **Scope gains a Theme shape block:** type, parent (and parent version), counts of templates / parts / patterns / blocks / style variations from the Discover commands, `theme.json` version, build pipeline, bundled libraries with versions, data-supplying plugins with the write capability of each field the theme renders.
- **Dependency table** with a runtime / dev / ships-to-frontend column.
- **Child themes:** an "Overrides reviewed" list (child file ↔ parent file ↔ result) and, when the parent is third-party and unreviewed, a recommendation to audit it separately.
- **Sections audited** lists every theme-security section with its finding IDs or "checked, none" (Manual read → traversal rule).
- **Unknowns get a stated reason**, in the same form as the plugin template's "skipped (not available)": for example `Roles in use: not available (no environment reached, owner not asked)`.

**Fix guidance by ownership.** Follow the plugin skill's Report → Fix guidance by ownership table. For themes: a distributed theme (wp.org, marketplace such as ThemeForest, vendor updater) is overwritten on update exactly like a plugin, so its fix line is update, report to the author, or mitigate from a child theme or a site-owned mu-plugin, never "edit the theme's files". A child theme is the supported place to override a parent template or remove a parent hook, so a finding in a third-party parent can often be mitigated there; say so in the fix line and name the override.

**Writing fix recommendations.** For structural fixes (moving logic into a block, replacing a hand-built context attribute, restructuring templates or `theme.json`), consult `wp-block-themes`, `wp-block-development` or `wp-interactivity-api`, if installed. None is required.

Full skeleton and a worked example: `references/report-template.md`.

---

## After the audit

Remediation works exactly as for plugins: hand off to **`wp-plugin-audit-remediation`** for the remediation log, the frozen copy of the audited version, and the behaviour-neutrality diff. Its ID-coverage check reads the same C/H/M/L/I IDs, so it works on `THEME-AUDIT-*.md` unchanged.

---

## Anti-patterns

- **Flagging every `echo` in a template.** Themes echo constantly. Confirm the context, the upstream escaping and who writes the value.
- **Rating code that never runs.** A module absent from the registry list, or outside the discovered directory, is dead code: Info, not its would-be severity.
- **Rating by the comment instead of the capability.** "Admins only" in a docblock means nothing; the `current_user_can()` argument decides.
- **Treating third-party fields as trusted because a plugin wrote them.** The plugin wrote them on behalf of some user. Find out which.
- **Auditing the whole parent under a child theme audit.** Diff the overrides; recommend a separate parent audit when warranted.
- **Reporting on `dist/` when `src/` exists.** Audit source. Audit built output only when it is all that ships, and downgrade confidence.
- **Ignoring vendored libraries because they are "not theme code".** They ship to every visitor and nothing updates them but the theme.
- **Treating plugin-territory code as a standards nit only.** A CPT or meta API in a theme is also attack surface; audit it with the plugin checklists.
- **No verdict, or a top-3 list with seven items.** Same rules as the plugin skill.

---

## References

- `references/theme-security-checklist.md`: theme security categories with detection, verification, severity and fix, plus the role-to-severity table.
- `references/theme-standards-checklist.md`: WordPress.org theme review requirements, block theme hygiene, enqueues, deprecated APIs.
- `references/theme-performance-checklist.md`: asset loading, fonts, images, template queries, `theme.json` weight.
- `references/child-theme-review.md`: parent identification, override enumeration, diff procedure, parent drift.
- `references/tooling.md`: PHPCS/WPCS, PHPStan, Theme Check, Composer and npm audit for themes.
- `references/report-template.md`: `THEME-AUDIT-<yyyy-mm-dd>.md` deltas and a worked example.
- Plugin skill `references/security-checklist.md`, `references/performance-checklist.md`, `references/false-positive-traps.md`, `references/remote-fetch.md`, `references/tooling.md`, `references/report-template.md`: shared material this skill builds on.

---

## Related skills

- `wp-plugin-code-audit` (**required**): shared rubric, verdict rules, report rules, checklists and false-positive traps.
- `wp-plugin-audit-remediation`: the phase after the audit; works on theme reports unchanged.
- `wp-block-themes`: `theme.json`, templates, parts, patterns, style variations (forward-looking patterns this audit checks for).
- `wp-block-development`: `block.json`, render files, `viewScriptModule`.
- `wp-interactivity-api`: stores, directives, server-side state and context.
- `wp-project-audit`: whole-project audits that dispatch each theme to this skill and each plugin to `wp-plugin-code-audit`.
