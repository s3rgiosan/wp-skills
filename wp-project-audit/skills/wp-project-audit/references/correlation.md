# Correlation

Phase 5. The component audits each see one component. The sweeps each see one layer. A cross-component finding needs **two or more components, or a component plus configuration**, and it is the one class of finding nobody else in the pipeline can produce.

Every correlated finding:

- lives in **General / codebase** with a `G-` ID;
- cites every part by its own finding ID (`P-acme-forms-H1`, `T-acme-theme-M2`, `G-M4`) and `file:line`;
- is rated by its end-to-end precondition and impact under the plugin skill's rubric, not by the count of parts (the theme skill's chain rule applies unchanged);
- does not remove or renumber the parts: each keeps its own finding and severity, with a line pointing to the correlation.

All examples below are fabricated.

---

## Rule 1. Build flags x dev advisories

**Shape:** a build installs `require-dev` (dependency-audit §3) **and** a dev package has an advisory or a web-reachable entry point.

**Example.** `themes/acme-theme/bin/build.sh:14` runs `composer install` without `--no-dev`. `dep-audit.json` lists a debugging package in `require-dev` with a remote-code advisory, and the package ships a `public/` directory with a PHP entry file. Separately: `G-M3` (build flag, Medium) and an Info for the dev advisory. Together: the entry file is deployed under the theme directory and reachable by URL: **High**, `G-H2`.

**Check:** is the entry point inside the webroot on production, and does the webserver serve PHP from `vendor/`?

## Rule 2. Deploy excludes x files present

**Shape:** the deploy exclude list misses a path (deploy-and-exposure §2) **and** that path holds something sensitive.

**Example.** `deploy/excludes.txt` excludes `.git` and `node_modules` but not `artifacts/`. The repo commits licensed zips there, one with a licence key in its config file. Result: the zips and key are downloadable from `https://example.com/wp-content/artifacts/`: **High**, `G-H1`, citing the exclude file and the zip paths.

## Rule 3. Lockfile vs disk vs production drift

**Shape:** a component's version differs between `composer.lock`, the header on disk, and the owner's production list, **and** an advisory affects one of those versions but not another.

**Example.** `composer.lock` pins `acme-gallery` 4.2.0 (fixed), the committed directory says 4.1.3 (affected by an unauthenticated file-read advisory), and production reports 4.1.3. The lockfile audit is clean; production is not. `P-acme-gallery-H1` is the advisory; `G-M5` records the drift and the deploy path that let the committed copy win.

## Rule 4. Widened kses or capability filters x meta or REST exposure x role counts

**Shape:** one component widens what low roles can store (theme skill security checklist §1, or a `user_has_cap` / `map_meta_cap` filter in a plugin), another exposes or renders that data, **and** the role actually has members.

**Example.** `T-acme-theme-H1`: `wp_kses_allowed_html` gated on `edit_posts` allows `<script>`. `P-acme-events-M2`: a plugin registers event meta with `show_in_rest` and no `auth_callback`, rendered raw by the plugin's single-event template. Role counts from the inventory environment: 4 contributors, 11 authors. Together: every contributor can plant script in both post content and event meta, rendered to editors in previews and to visitors after publish: **High** (Contributor stored XSS reaching admins), `G-H3`.

**Check:** run `wp user list --role=<role> --format=count` (or the owner's answer) for every role the chain depends on. Zero today lowers likelihood, not severity.

## Rule 5. Third-party write path x custom template sink

**Shape:** a third-party plugin stores a field that a lower role can write, **and** a custom theme or plugin renders it without escaping.

**Example.** `example-profile-box` (managed, wp.org) stores a "tagline" user meta field editable by every user on their own profile screen, sanitized with `sanitize_text_field` only on its own settings page, not on the profile save path. `themes/acme-theme/template-parts/author-card.php:22` echoes it raw. The theme report rated it High on the assumption that authors write it; the plugin's write path shows subscribers can. With open registration on the site: **Critical** (auto-granted role, stored XSS on every author page), `G-C1`, citing `T-acme-theme-H4` and the plugin's save hook `file:line`. Fix line: escape at the sink in the custom theme (custom code); nothing in the third-party plugin needs editing.

## Rule 6. Same-origin legacy site x any XSS

**Shape:** a legacy, staging or secondary site is served from the same origin as production (a subdirectory, or a proxied path on the same host) **and** any XSS exists on it.

**Example.** `https://example.com/archive/` runs an old install with a reflected XSS in an unmaintained theme search template (`T-acme-archive-M1`, Medium on its own because the legacy site has no logged-in users). Production at `https://example.com/` shares the origin, so the script runs with production's cookies for any path the cookies cover, and can read production's REST nonces from same-origin pages. Together: a one-click path to production admin actions: **High**, `G-H4`. Fix line: move the legacy site to its own origin, or retire it; fix the template only as a stopgap.

**Check:** cookie `path` and domain on production, and whether the legacy site sets its own cookies under the same names.

## Rule 7. File editing enabled x any path to an admin session

**Shape:** `DISALLOW_FILE_EDIT` is not `true` on production (`prod-check.sh` §7) **and** any finding gives an attacker an administrator session (stored XSS reaching an admin, CSRF on user creation, session fixation, an auth bypass).

**Example.** Production reports `DISALLOW_FILE_EDIT = false`. `T-acme-theme-H1` is Contributor stored XSS that runs in an Administrator's preview. With file editing on, the script can write PHP through the theme or plugin editor: the XSS becomes remote code execution. The XSS keeps its own rating; the correlation is **High** (Critical when the XSS is reachable by an auto-granted role), `G-H5`. Fix line: set `DISALLOW_FILE_EDIT` to `true` (config, cheap) and fix the XSS.

## Rule 8. Unmanaged production components x known advisories

**Shape:** production runs a plugin or theme that the repository does not contain (inventory §4: active but missing on disk, or the owner's production list) **and** it has an advisory at the production version.

**Example.** The owner's production list includes `acme-backup-tools` 1.9.0, which is not in the repository and not in `composer.lock`. The lookup finds an unauthenticated backup-download advisory fixed in 1.9.4. No deploy ever updates it. `P-acme-backup-tools-C1` for the advisory; `G-M6` for the unmanaged install and the missing update path.

## Rule 9. Inactive-but-deployed code with public endpoints

**Shape:** a component is inactive on every production site **but** its files are deployed, **and** it contains a PHP file that runs when requested directly (no `ABSPATH` guard, its own bootstrap such as `require '../../../wp-load.php'`), or a must-use loader loads it anyway.

**Example.** `acme-migrator` (custom, inactive everywhere) ships `tools/export.php`, which bootstraps WordPress itself and streams a CSV of users when called with a `key` parameter compared against a hardcoded string. Deactivation does not stop direct requests. The component audit rated it as dead code (Info) because the plugin is inactive; the correlation with the deployed files makes it **High**, `G-H6`. Fix line: remove the plugin from the deploy, or block the directory at the webserver.

**Check:** `grep -rLE "defined\(\s*'ABSPATH'" --include='*.php'` over the inactive component, and every `wp-load.php` bootstrap in it.

---

## Writing a correlated finding

````markdown
### 🟠 HIGH — G-H5: File editing enabled turns Contributor stored XSS into code execution

**Parts.** `T-acme-theme-H1` (`inc/kses.php:18`, Contributor `<script>` in post content) · production `wp-config.php`: `DISALLOW_FILE_EDIT = false` (prod-check §7, owner-run 2026-01-15).

**Chain.** A Contributor saves a draft with a script. An Administrator opens the preview. The script posts to the theme file editor with the admin's nonce and writes PHP into the active theme.

**Severity rationale.** End-to-end precondition is a Contributor account (4 on production per the owner); impact is code execution. High under the rubric; not Critical because no integration auto-grants Contributor.

**Verified.** Read `inc/kses.php:12-31` (see Annex 2). File editor reachable: `wp-admin/theme-editor.php` is not blocked by any must-use plugin (`grep -rn "theme-editor" wp-content/mu-plugins` returns nothing). Evidence: independently re-checked in source.

**Fix.** Set `define( 'DISALLOW_FILE_EDIT', true );` in production `wp-config.php` (config). Fix `T-acme-theme-H1` (custom code change, see Annex 2).
````
