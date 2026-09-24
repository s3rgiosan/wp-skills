# Report Template

The theme report is the plugin skill's `report-template.md` with the deltas below. Everything not listed here (summary block, Summary section with its findings table, Sources section, finding format, `[DECISION]` callouts and table, verified-false appendix (false positives only), Recommendation reachability rule, Tooling output, Audit metadata, inline chat summary) is used exactly as that template describes.

---

## Where to write it

Plugin skill rules apply (ask first, default `.claude/`, never inside the theme directory, never overwrite). Deltas:

- Filename `THEME-AUDIT-<yyyy-mm-dd>.md`; same-day re-audit `THEME-AUDIT-<yyyy-mm-dd>-<HHMM>.md`.
- Several themes audited in one engagement: `THEME-AUDIT-<slug>-<yyyy-mm-dd>.md`.
- Git-ignore pattern to check and offer: `THEME-AUDIT-*.md`.

---

## Skeleton deltas

Title and summary block:

````markdown
# Theme audit: <Theme Name> <Version>

## TL;DR

**Overall:** ...
**What needs attention now** (3 to 5 bullets) · **What is in good shape** (2 to 3, verified only) ·
**Recommended next steps** (3 to 5, containment first) · **At a glance:** counts per severity, where the worst sit

**Verdict:** GO / NO-GO / GO WITH FIXES
**Counts:** 🔴 <C> critical · 🟠 <H> high · 🟡 <M> medium · 🟢 <L> low · ⚪ <I> info
**Top 3 to fix first:**
1. `<file>:<line>` · short title
2. ...
3. ...
**Decisions needed from the owner:** <D> (omit this line when D = 0)
````

**`[DECISION]` findings in `Counts:`.** They are counted in their severity in the `Counts:` line (a `[DECISION]` Medium is one of the mediums), so `Counts:` always equals the number of finding headings in each severity. They are excluded only from the Verdict Rules table. The plugin skill does not state this; the theme report applies it explicitly. **Unreachable (dead) code** found during Verify is reported as Info and counted as Info.

Finding headings use exactly the plugin template's format, for example ``### 🟠 HIGH — H1: `parts/header.php:14` — short title`` (append ` [DECISION]` for owner-decision findings). IDs use the same C/H/M/L/I scheme, so `wp-plugin-audit-remediation`'s ID-coverage check works unchanged.

The **Summary** section (findings table, optional glossary; the plain-language summary is the TL;DR) follows the plugin template unchanged. For themes, the table's Area column uses theme areas: `functions.php` / templates / block render / patterns / front-end JS / enqueues / child overrides. The **Sources** section also follows the plugin template, including one line per audit run when there was more than one; for child themes, name the parent version the overrides were diffed against. The report states current severities only: no withdrawn, superseded or re-rated history (plugin `SKILL.md` → Finding IDs are permanent). Method, Sources and Tooling output describe the method in plain terms and name only external tools (Theme Check, PHPCS/WPCS, PHPStan, `composer audit`, `npm audit`) with versions and counts: never the audit skills, their files or internal paths (plugin `SKILL.md` → Report, rule "Reports describe the method in plain terms").

Scope is restructured for themes: it drops **Audience** and **LOC** (not meaningful for a theme), replaces **Surface** with a **Theme shape** block (type, parent, `theme.json` version, template/part/pattern/block counts, build pipeline, bundled libraries), replaces **System of record** with **Data-supplying plugins** (which plugins write the data the theme renders, and who can write it) and **Roles in use**, and merges the plugin template's separate PHP and JS **Dependencies** lines into one table with a ships-to-frontend / runtime / dev rating column. Everything else in Scope (Source, version, Requires, Distribution, Update channel, Author/contact, Operating constraints, Tools run) follows the plugin template unchanged:

````markdown
## Scope

- **Source:** local path / wp.org theme slug + version / GitHub URL at commit SHA
- **Theme version:** X.Y.Z · **Requires:** WP >= A.B, PHP >= X.Y · **Tested up to:** A.B
- **Distribution:** wp.org / commercial marketplace / custom (agency) / GitHub · **Update channel:** wp.org / bundled updater / none · `Update URI`: set / missing
- **Author / contact:** ...
- **Theme shape** (counts from the Discover commands):
  - Type: block / classic / hybrid / child
  - Parent: <name> <installed version> (<distribution>; audited: yes / no), or "n/a"
  - `theme.json`: version N · style variations: N
  - Templates: N · Parts: N · Patterns: N · Theme blocks (`block.json`): N
  - PHP files: N (from the scoped file list: `git ls-files` when in git, excluding vendor / node_modules / dist / build)
  - Build: `src/` → `dist/` via <tool> · audited: source / built output only
  - Bundled libraries: <name> <version> (front end / admin), ...
- **Data-supplying plugins:** <plugin>: fields rendered <list> · written by <role / capability> via <screen / REST / form>, ...
- **Roles in use:** (from `wp user list --role=<role> --format=count` when available) contributor N, author N, editor N · multisite: yes / no. Without an environment or an answer from the owner: `Roles in use: not available (<reason>)`, and rate by the capability alone.
- **Operating constraints:** who writes the rendered content · how changes reach production · what's planned
- **Dependencies:**

  | Package | Version | Advisory | Ends up | Rating |
  |---|---|---|---|---|
  | ... | ... | ... | ships-to-frontend / runtime (not bundled) / dev | ... |

- **Tools run:** PHPCS (yes/no) · PHPStan (yes/no) · Theme Check (yes/no) · Composer audit (yes/no/n/a) · npm audit (yes/no/n/a)
- **File list:** `git ls-files` / filesystem fallback · excluded: `vendor/`, `node_modules/`, `dist/`, `build/` (plus gitignore/distignore paths) · vendored front-end libraries kept and version-checked · built output committed: yes / no
- **Sections audited:** every theme-security section with its finding IDs or "checked, none" (a section is checked only once its Detect commands ran):
  - §1 H1 · §2 H2 (chained with §3) · §3 H2 · §4 checked, none · §5 AcmePathRouter M2, AcmeTermRewrites checked, none (one entry per routing module) · §6 checked, none · §7 checked, none; 1 verified false · … · §20 L3
  - Plugin security checklist (theme PHP surfaces): … · theme performance: … · plugin performance (shared items): … · theme standards: … · child overrides: … (or n/a) · FP-traps ✓
````

Child themes add a section after Scope:

````markdown
## Overrides reviewed

| Child file | Parent file (version) | Result |
|---|---|---|
| `single.php` | `single.php` (2.3.0) | Dropped `post_password_required()`: see H2 |
| `template-parts/card.php` | `template-parts/card.php` (2.3.0) | Escaping unchanged; new `get_field()` output: see M1 |
| `parts/footer.html` | `parts/footer.html` (2.3.0) | Markup only; no finding |

Parent audit: recommended (third-party, unreviewed) / not needed (<reason>).
````

The Recommendation section names a separate parent audit when `child-theme-review.md` §6 applies.

---

The **TL;DR** follows the plugin skill's contract (plugin `SKILL.md` → Report, "Every report opens with a TL;DR"): first section, shareable on its own, no IDs, paths or process words. Fabricated example:

````markdown
## TL;DR

**Overall:** The theme can stay live, but one issue should be fixed this week.

**What needs attention now**
- Logged-in contributors and authors can add hidden scripts to posts. If an editor previews such a post, the script runs with the editor's access.
- Password-protected pages show their content without asking for the password on one page layout.

**What is in good shape**
- The theme's own blocks clean every value before showing it.
- No outside scripts are loaded from untrusted sources.

**Recommended next steps**
1. Remove the setting that lets contributors add scripts, and check existing posts for any.
2. Restore the password check on the affected page layout.
3. Review contributor and author accounts that are no longer needed.

**At a glance:** 0 critical · 2 high · 3 medium · 2 low · 1 info; the serious issues are in post content handling and one page layout.
````

## Worked example: one High finding

The theme (`acme-agency`), install and counts below are fabricated.

````markdown
### 🟠 HIGH — H1: `inc/kses.php:18` — Contributors can store `<script>` in post content

**Severity rationale.** The widened allowed-HTML list applies to every user with
`edit_posts`, which includes Contributors (3 accounts on the reviewed install).
A script in a pending post runs in the browser of the Editor or Administrator who
previews it, which is a path to admin account takeover. Not Critical: the site
has no open registration and no integration assigns the Contributor role.

**Description.**
`inc/kses.php:12-31` filters `wp_kses_allowed_html` for the `post` context:

```php
// Only administrators can embed scripts.
add_filter( 'wp_kses_allowed_html', function ( $tags, $context ) {
	if ( 'post' === $context && current_user_can( 'edit_posts' ) ) {
		$tags['script'] = [ 'src' => true, 'type' => true, 'async' => true ];
		$tags['iframe'] = [ 'src' => true, 'width' => true, 'height' => true, 'allow' => true ];
	}
	return $tags;
}, 10, 2 );
```

The comment says administrators; the code checks `edit_posts`. Administrators and
Editors already hold `unfiltered_html` on single site, so the filter's only
effect is to extend `<script>` and `<iframe>` to Authors and Contributors.

**Verified.** Read `inc/kses.php:12-31` and confirmed it is loaded unconditionally
from `functions.php:22`. `wp user list --role=contributor --format=count` returned 3;
`--role=author` returned 5. No other filter narrows the list (`grep -RnE
"wp_kses_allowed_html" .` returns this file only).

**Reproduced.** Local install, Contributor account `test-contributor`: saved a draft
containing `<script>document.title='kses-test'</script>`; the tag survived in
`post_content` and the title changed when an Administrator opened the preview.

**Fix.** Remove the filter. Users with `unfiltered_html` can already store any
HTML, so no allowance is needed for them; Authors and Contributors embed
third-party media through the Embed block (oEmbed), which needs no widened tags.

After the change, check existing content for stored scripts:
`wp db query "SELECT ID, post_author FROM $(wp db prefix)posts WHERE post_content LIKE '%<script%'"`.
````
