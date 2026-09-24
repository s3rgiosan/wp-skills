# Child Theme Review

A child theme is audited in full like any other theme. On top of that, every file it uses to **replace** a parent file is diffed against the parent version it replaces, because a child override silently takes over the parent's escaping, checks and hooks. The whole parent is out of scope; recommend a separate audit of it when warranted (§6).

---

## 1. Identify the parent

```bash
CHILD=wp-content/themes/acme-agency
grep -E "^\s*\*?\s*Template:" "$CHILD/style.css"             # parent folder name
PARENT=wp-content/themes/$(grep -E "^\s*\*?\s*Template:" "$CHILD/style.css" | sed -E 's/.*Template:\s*//' | tr -d '\r ')
grep -E "^\s*\*?\s*(Theme Name|Version|Theme URI|Author|Update URI):" "$PARENT/style.css"
# On an environment:
wp theme list --fields=name,status,version,update,update_version
```

Record in Scope: parent name, folder, installed version, available update, distribution (wp.org / marketplace / custom), and whether the parent has been audited. For a remote child theme, fetch the exact parent version the child is deployed against (ask the owner; do not assume the latest).

---

## 2. Enumerate overrides

A child overrides a parent file when the same relative path exists in both. The mechanism differs by file type:

| File type | How the child replaces the parent |
|---|---|
| Classic templates and parts (`*.php` loaded by the template hierarchy, `get_template_part()`, `locate_template()`) | Same relative path in the child wins |
| Block templates and parts (`templates/*.html`, `parts/*.html`) | Same slug in the child wins; user edits saved in the database (`wp_template`, `wp_template_part`) override both |
| Patterns (`patterns/*.php`) | A child pattern with the same `Slug` header replaces the parent's |
| `theme.json` | Merged: child values override parent values key by key |
| `functions.php` | **Not** an override: both load, child first. The child changes parent behaviour through hooks (§4) |
| Assets loaded with `get_theme_file_uri()` / `get_theme_file_path()` | Same relative path in the child wins; `get_template_directory_uri()` always points at the parent |

Write the lists under `$OUT`, the scoped-output directory the Discover script (`references/tooling.md`) already created for this audit:

```bash
cd "$CHILD" && find . -type f \( -name "*.php" -o -name "*.html" \) -not -path "./node_modules/*" -not -path "./vendor/*" | sort > "$OUT/child-files.txt"
cd "$PARENT" && find . -type f \( -name "*.php" -o -name "*.html" \) -not -path "./node_modules/*" -not -path "./vendor/*" | sort > "$OUT/parent-files.txt"
comm -12 "$OUT/child-files.txt" "$OUT/parent-files.txt" | grep -v "^./functions.php$" > "$OUT/overrides.txt"
wc -l < "$OUT/overrides.txt"

# Patterns overridden by slug rather than by path
grep -hE "^\s*\*\s*Slug:" "$CHILD"/patterns/*.php 2>/dev/null | sort > "$OUT/child-slugs.txt"
grep -hE "^\s*\*\s*Slug:" "$PARENT"/patterns/*.php 2>/dev/null | sort > "$OUT/parent-slugs.txt"
comm -12 "$OUT/child-slugs.txt" "$OUT/parent-slugs.txt"
```

The count of overrides in the report comes from `wc -l`, not from reading the list. On an environment, also list database-stored template overrides, which neither theme's files show:

```bash
wp post list --post_type=wp_template,wp_template_part --fields=ID,post_name,post_type,post_modified
```

---

## 3. Diff each override

```bash
while read -r f; do
  echo "=== $f"
  diff -u "$PARENT/$f" "$CHILD/$f"
done < "$OUT/overrides.txt" > "$OUT/override-diffs.txt"

# Lines the child removed that carried security meaning
grep -E "^-[^-]" "$OUT/override-diffs.txt" \
  | grep -E "esc_(html|attr|url|js|textarea)|wp_kses|sanitize_|absint|intval|current_user_can|wp_verify_nonce|check_admin_referer|check_ajax_referer|post_password_required|is_user_logged_in|get_the_password_form|wp_nonce_field|is_post_publicly_viewable"
```

Read every hunk, not only the grep hits: the grep finds removed guards, but a child can also add a new unescaped output that was never in the parent.

What to look for:

| Pattern in the child | Why it matters |
|---|---|
| Escaping dropped or weakened (`esc_html( $x )` → `$x`, `wp_kses_post()` → raw, `esc_url()` removed from an `href`) | The parent's output was safe; the child's is not. Rate with `theme-security-checklist.md` by who writes the value. |
| Capability or nonce checks removed from forms, AJAX or admin-post handlers carried in templates | The override re-opens what the parent closed. |
| `post_password_required()` / `get_the_password_form()` removed from `single.php`, `page.php`, `content-*.php` | Password-protected content renders to everyone. **High** at least. |
| `is_user_logged_in()` / membership checks removed from a gated template | Gated content renders publicly. |
| New queries or output added (a related-posts loop, a meta field printed) | New code, audited with the full checklists. |
| `comments_template()` or `wp_link_pages()` removed | Functional regression; Low. |

For each finding, cite both sides: `parent-file:line` (what was there) and `child-file:line` (what replaced it).

---

## 4. `functions.php`: what the child unhooks or replaces

The child's `functions.php` loads before the parent's, so it changes parent behaviour through hooks and pluggable functions.

```bash
grep -RnE "remove_(action|filter|all_actions|all_filters)\(" --include="*.php" "$CHILD"
grep -RnE "add_filter\(\s*['\"](wp_kses_allowed_html|map_meta_cap|user_has_cap|the_content|the_title|comment_text|get_avatar)['\"]" --include="*.php" "$CHILD"
grep -RnE "if\s*\(\s*!\s*function_exists\(\s*['\"]" --include="*.php" "$PARENT"   # pluggable parent functions the child may redefine
```

| Pattern | Why it matters |
|---|---|
| `remove_action` / `remove_filter` on a parent callback that enforced security (a kses filter, an access check on `template_redirect`, a nonce check, a content restriction) | The protection is gone site-wide. Read the parent callback being removed and state what it did. |
| The child redefines a pluggable parent function (`if ( ! function_exists( 'example_parent_posted_on' ) )`) | The child's version replaces the parent's everywhere. Diff them like a template override. |
| The child widens kses or capabilities | `theme-security-checklist.md` §1. |
| Removal targets a callback name or priority that no longer exists in the current parent | Dead code today; the parent behaviour the child meant to change is back. Low, but it signals drift (§5). |

---

## 5. Parent version drift

A child built against an old parent keeps old copies of parent templates. When the parent later fixes a vulnerability in a template the child overrides, the fix never reaches the site: the child's stale copy still runs.

```bash
# Is each override older than the parent's current copy? (git checkouts)
while read -r f; do
  printf "%s child:%s parent:%s\n" "$f" \
    "$(git -C "$CHILD" log -1 --format=%cs -- "$f" 2>/dev/null)" \
    "$(git -C "$PARENT" log -1 --format=%cs -- "$f" 2>/dev/null)"
done < "$OUT/overrides.txt"

# Commercial parents often mark template versions in the file header
grep -RnE "@version\s+[0-9.]+" "$CHILD" "$PARENT" --include="*.php"
```

What to report:

- The parent version the child was built against (from the child's readme, changelog, commit history or template `@version` tags) versus the installed parent version.
- Each override whose parent copy changed since then, with a note when the parent's changelog lists a security fix for that file. Diff the child against **both** the old and the current parent copy when both are available; changes the parent made in between are what the child is missing.
- An override of an outdated parent template that misses a security fix is rated as the vulnerability itself, not as drift.

---

## 6. When to recommend auditing the parent

Recommend a separate `wp-theme-code-audit` run on the parent (and say so in the Recommendation section) when any of these holds:

- The parent is third-party (marketplace or another agency) and no audit of the installed version is on record.
- The parent has no update channel or has not been updated in a long time.
- The child relies on parent functionality beyond presentation (CPTs, shortcodes, AJAX, REST routes, options pages).
- Drift (§5) shows the parent changed security-relevant templates since the child was built.

A wp.org-hosted parent maintained by an active author, where the child overrides only a few templates, usually does not need a full audit; say so in Scope so the reader knows the boundary was deliberate.
