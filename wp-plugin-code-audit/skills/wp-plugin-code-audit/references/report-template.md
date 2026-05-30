# Report Template

Full `AUDIT-<yyyy-mm-dd>.md` skeleton plus a worked example showing the level of detail expected per finding.

---

## Where to write it

**Always ask the user where to write the report** (see SKILL.md → Report → "Where to write the report"). The report contains vulnerability details — never default it into a git-tracked project root where it could be committed to a public repo.

- Name the file `AUDIT-<yyyy-mm-dd>.md` (e.g. `AUDIT-2026-05-29.md`) so each run keeps a dated history instead of overwriting the last. Second audit the same day → append a time suffix: `AUDIT-<yyyy-mm-dd>-<HHMM>.md`.
- Preferred location: `.claude/` (commonly git-excluded), a path outside the repo, or — only if confirmed git-ignored — the CWD.
- Never write inside the plugin directory being audited (don't pollute the artifact).
- Multi-plugin audits: prefix with the slug too: `AUDIT-foo-<yyyy-mm-dd>.md`.
- Before writing to a git-tracked location, confirm `AUDIT-*.md` is in `.gitignore`; offer to add it if not.

---

## Skeleton

````markdown
# Audit: <Plugin Name> <Version>

**Verdict:** GO WITH FIXES
**Counts:** 🔴 0 critical · 🟠 2 high · 🟡 4 medium · 🟢 3 low · ⚪ 2 info
**Top 3 to fix first:**
1. `<file>:<line>` — short title (the most consequential High).
2. `<file>:<line>` — short title.
3. `<file>:<line>` — short title.

---

## Scope

- **Source:** local path / wp.org slug / GitHub URL (commit SHA if available)
- **Plugin version:** X.Y.Z
- **Requires:** WP >= A.B, PHP >= X.Y
- **Distribution:** wp.org / GitHub / private / commercial marketplace
- **Update channel:** wp.org auto-updates / custom updater (`Update URI`) / manual upload only
- **Author / contact:** Name / email / repo URL (for disclosure path on private plugins)
- **Audience:** internal staff only / multi-tenant public / SaaS / e-commerce customers
- **LOC:** N PHP, N JS, N CSS (excluding vendor / node_modules)
- **Surface:**
  - REST endpoints: N (`/my-plugin/v1/...`)
  - AJAX handlers: N (`wp_ajax_*`, `wp_ajax_nopriv_*`)
  - Admin pages: N (`add_menu_page` / `add_options_page`)
  - CLI commands: N (`wp my-plugin ...`)
  - Blocks: N (`block.json` files)
  - Custom tables: N
  - Custom CPTs / taxonomies: N
- **Dependencies (PHP):** key composer packages
- **Dependencies (JS):** key npm packages
- **Tools run:**
  - PHPCS (WPCS standard): yes — N errors, N warnings — `/tmp/audit-<slug>/phpcs.txt`
  - PHPStan (level 5): yes — N errors — `/tmp/audit-<slug>/phpstan.txt`
  - Plugin Check: yes — N issues — `/tmp/audit-<slug>/plugin-check.txt`
  - Composer audit: yes — N vulnerable packages
  - npm audit: skipped (no source for `dist/`)
- **Sections audited:** auth/authz ✓ · nonces ✓ · IDOR ✓ · sanitize/escape ✓ · SQLi ✓ · file-ops ✓ · SSRF ✓ · deserialization ✓ · secrets ✓ · error-disclosure ✓ · ABSPATH ✓ · perf ✓ · standards ✓ · FP-traps ✓

---

## Findings

(Numbering convention: severity letter + index — C1, C2, H1, H2, M1, L1, I1. Reference findings by ID in the Top-3 list and Verdict section.)

<!-- If a section is empty: -->
### 🔴 Critical
None.

---

### 🟠 HIGH — H1: `<file.php>:<line>` — Short title

**Severity rationale.** Why this is High and not Medium / Critical. If reachable by Subscriber and destructive, escalate to Critical per the rubric.

**Description.**
Trace through source. What the attacker / triggering scenario looks like.
What breaks. Why the current code doesn't protect against it.

**Verified.** How you confirmed (which file:line you read; what call chain you followed; what input the verification used).

**Fix.**
Concrete change. Often a code snippet:

```php
// Before
if ( isset( $_POST['save'] ) ) {
    update_option( 'foo_settings', $_POST['settings'] );
}

// After
if ( isset( $_POST['save'] ) ) {
    check_admin_referer( 'foo_save_settings' );
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( __( 'Unauthorized', 'foo' ) );
    }
    $settings = sanitize_text_field( wp_unslash( $_POST['settings'] ?? '' ) );
    update_option( 'foo_settings', $settings );
}
```

---

### 🟡 MEDIUM — M1: `<file>:<line>` — Short title

(Same format, less depth — Medium findings can be one paragraph + a `// suggested change` snippet.)

---

### 🟢 LOW — L1: `<file>:<line>` — Short title

One sentence + one-line fix. Don't pad.

---

### ⚪ INFO — I1: Observation

One sentence. No fix required (these are suggestions / context for the maintainer).

---

## Verified false (appendix)

- `<file>:<line>` — pattern that looked like X but isn't because Y. Listed
  so the next auditor doesn't re-flag it.

---

## Recommendation

Two-sentence verdict reasoning. State the verdict explicitly and which findings drive it.

**If distribution is private / no auto-update channel:** name the author / vendor and the suggested disclosure path. Examples:

- "Private plugin, no `Update URI` set. Report findings C1–C3 to the author (Acme Plugins / security@acme.example) before deploying."
- "Source is private GitHub repo `acme/foo`; open an issue with severity tag or email the maintainer at security@acme.com."
- "Plugin is on wp.org. Critical findings should be reported via wp.org's plugins@wordpress.org with a copy to the author through the plugin's support forum."

If the site owner cannot wait for an upstream fix, list the safest interim mitigations (deactivate the plugin, block the affected endpoint via mu-plugin, restrict capability).

---

## Tooling output

- PHPCS: `/tmp/audit-<slug>/phpcs.txt` — N errors, N warnings
  - Top rules: WordPress.Security.EscapeOutput.OutputNotEscaped (N), ...
- PHPStan: `/tmp/audit-<slug>/phpstan.txt` — level 5, N errors
- Plugin Check: `/tmp/audit-<slug>/plugin-check.txt` — N issues
- Composer audit: `/tmp/audit-<slug>/composer-audit.txt`

---

## Audit metadata

- Auditor: Claude (wp-plugin-code-audit skill)
- Date: YYYY-MM-DD
- Hours spent (approximate): N
- Confidence: high / medium / low (low if source not fully available, or if scope was time-boxed)
````

---

## Worked example — one Critical finding

````markdown
### 🔴 CRITICAL — C1: `includes/rest/Search.php:46` — Unauthenticated search returns private post titles + IDs

**Severity rationale:** Network-exploitable, no auth required. Discloses all
post titles regardless of status (including `draft`, `private`, `pending`),
plus author IDs and editor user IDs. Combined with the user-search endpoint
(see H-2), gives an unauth attacker a full content + user map.

**Description.**
The REST route `/my-plugin/v1/search` registered at `Search.php:42`:

```php
register_rest_route( 'my-plugin/v1', '/search', [
    'methods'             => 'GET',
    'callback'            => [ $this, 'search' ],
    'permission_callback' => '__return_true',
] );
```

`permission_callback => __return_true` means anyone, including unauthenticated
visitors, can hit this. The `search()` method at `Search.php:54` runs a
`WP_Query` with `post_status => 'any'`, then returns `ID`, `post_title`,
`post_author` for every matched post.

A `curl https://target/wp-json/my-plugin/v1/search?q=<term>` returns titles
the author would not expect to be public, plus post IDs that can then be
combined with other endpoints to escalate.

**Verified:** Read `Search.php:42–87`. Confirmed:
- `permission_callback` is `__return_true` (line 45).
- `WP_Query` arg `post_status => 'any'` (line 61).
- Response shape includes `post_title` unconditionally (line 78).
- Issued `curl http://localhost/wp-json/my-plugin/v1/search?q=test` against a
  test install seeded with one draft post titled "DRAFT-CONFIDENTIAL"; the
  draft title appeared in the response.

**Fix.**
Restrict to authenticated users with edit capability, OR scope query to
publicly visible statuses only:

```php
register_rest_route( 'my-plugin/v1', '/search', [
    'methods'             => 'GET',
    'callback'            => [ $this, 'search' ],
    'permission_callback' => function () {
        return current_user_can( 'edit_posts' );
    },
] );

// And/or in the callback:
$query = new WP_Query( [
    'post_status' => current_user_can( 'edit_posts' ) ? 'any' : 'publish',
    // ...
] );
```
````

---

## Worked example — one High finding

````markdown
### 🟠 HIGH — H1: `plugin.php:60` — No activation hook; tables created on `admin_init`

**Severity rationale:** Data-loss risk. On a frontend-only site (e.g.,
headless WP, REST-only consumer), or in a non-admin activation flow,
tables never get created. First write to the relationship table throws
a fatal `Table 'wp_my_plugin_things' doesn't exist`.

**Description.**
`Plugin.php:60` hooks `BaseTable::setup()` to `admin_init`:

```php
add_action( 'admin_init', [ BaseTable::class, 'setup' ] );
```

`BaseTable::setup()` runs `dbDelta()` to create / upgrade tables. Two
gaps:

1. `admin_init` only fires for admin requests. A frontend-only site
   never enters `wp-admin`, so the tables are never created.
2. Multisite: activating across a network doesn't trigger `admin_init`
   per-site; `wpmu_new_blog` (new sites added after activation) is
   uncovered.

**Verified:** Read `Plugin.php:55–72`. Searched for any
`register_activation_hook` — none present. Tested by deleting the
table and hitting a frontend route that writes a relationship; got
fatal.

**Fix.**

```php
register_activation_hook( __FILE__, [ BaseTable::class, 'setup' ] );
add_action( 'wpmu_new_blog', [ BaseTable::class, 'setup_for_new_site' ] );

// Keep admin_init as a safety net for upgrades within an existing install:
add_action( 'admin_init', [ BaseTable::class, 'upgrade' ] );
```
````

---

## Inline summary in chat

After writing the report, also output a short summary in chat (not the whole file):

```markdown
**wp-plugin-code-audit complete.** Wrote `.claude/AUDIT-2026-05-29.md`.

- Verdict: **GO WITH FIXES**
- 🔴 0 critical · 🟠 2 high · 🟡 4 medium · 🟢 3 low · ⚪ 2 info
- Top 3 to fix:
  1. `includes/rest/Search.php:46` — Unauthenticated search returns private titles
  2. `plugin.php:60` — No activation hook; tables never created on frontend-only sites
  3. `includes/Helpers.php:109` — Request-scoped static cache never invalidated

See the report file for full findings + traces + fixes.
```

Keep it under 10 lines. Reader skims the file for the full picture.
