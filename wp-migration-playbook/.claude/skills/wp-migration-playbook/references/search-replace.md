# Serialized-Safe URL / Domain Rewrite

Every WP→WP migration that changes domain or path needs a database-wide URL rewrite. A naive SQL `UPDATE ... REPLACE()` **corrupts serialized data** — PHP serialized strings encode byte lengths (`s:19:"https://old.example"`), so changing the string without fixing the length prefix breaks every serialized option, widget, and meta value. Use WP-CLI, which walks and re-serializes safely.

> Run during Phase 3 of the runbook, after import, before transforms.

---

## The command

```bash
# ALWAYS dry-run first — reports counts per table, mutates nothing
wp search-replace 'https://old.example.com' 'https://new.example.com' \
  --dry-run --recurse-objects --skip-columns=guid --report-changed-only

# Apply
wp search-replace 'https://old.example.com' 'https://new.example.com' \
  --recurse-objects --skip-columns=guid --all-tables-with-prefix
```

| Flag | Why |
|---|---|
| `--dry-run` | Mandatory first pass. Shows what would change per table. |
| `--recurse-objects` | Walks into serialized arrays/objects and PHP-serialized values. The whole point. |
| `--skip-columns=guid` | **Never rewrite `wp_posts.guid`.** It's a permanent unique identifier for feed readers, not a URL to follow. Rewriting it desyncs subscribers. |
| `--all-tables-with-prefix` | Include custom plugin tables sharing the prefix (default `wp_*` only covers core tables). |
| `--report-changed-only` | Quieter dry-run output. |
| `--precise` | Force PHP-based replace (slower, handles edge cases the faster path misses). Use if the fast path under-reports. |

---

## Order of replacements (do the most specific first)

Rewrite from most-specific to least, so a broad rule doesn't pre-empt a narrow one:

1. Protocol-qualified host: `https://old.example.com` → `https://new.example.com`
2. Protocol-relative: `//old.example.com` → `//new.example.com`
3. Path changes (if any): `/old-base/` → `/new-base/`
4. Bare host only if needed (risky — matches inside unrelated strings): `old.example.com` → `new.example.com`

For HTTP→HTTPS upgrades, also replace `http://new.example.com` → `https://new.example.com` after the host swap.

**Path-based subsite → domain root.** A path-based multisite subsite lived at `old.example.com/sitepath/`; on the standalone install that content moves to the root. Collapse the host **and** path in one pass so the segment is stripped, most-specific first:

1. `https://old.example.com/sitepath/` → `https://new.example.com/`
2. `https://old.example.com` → `https://new.example.com` (catches any remaining bare-host references)

Run them in that order — the path-qualified rule must fire before the bare-host rule, or step 2 rewrites the host and leaves `/sitepath/` behind. (Subdomain-based subsites — `sitepath.example.com` — are a plain host swap, no path segment to strip.)

---

## Multisite

- **Consolidating a subsite into a standalone install:** do the table remap first (`runbook.md` → "Multisite subsite → standalone: table remap") so the tables are flat `wp_*`, then run **plain `wp search-replace` with no `--network`** — the target is no longer multisite. `--network` is for rewriting *within* a live network, not after flattening.
- Rewriting *within* a still-live network: use `--network` to cover all sites, or `--url=<site>` to scope to one.
- Each subsite has its own `siteurl`/`home` in `wp_<n>_options` — search-replace covers them, but verify per site.
- `wp_blogs.domain` / `wp_blogs.path` and `wp_site` / `wp_sitemeta` (`siteurl`) hold network-level URLs — on a still-live network confirm these too; on a flattened standalone target they were dropped in the remap.

---

## Gotchas

- **Don't run it twice with overlapping rules.** A second pass that matches already-rewritten URLs can double-rewrite. Re-import + redo rather than stacking passes.
- **Escaped URLs in JSON/block markup** (`https:\/\/old.example.com`) are a distinct string. Block content stores escaped slashes — add a replacement for the escaped form, or rely on `--recurse-objects` which handles the decoded value inside block attrs but **not** raw escaped slashes in `post_content` HTML. Verify block-stored URLs after.
- **Hard-coded URLs in theme/plugin code or `wp-config.php`** are not in the DB — search-replace won't touch them. Grep the codebase separately.
- **Object cache** holds stale `siteurl`/`home` after the rewrite — `wp cache flush` after (SKILL.md §8).

---

## Verify

```bash
wp option get siteurl
wp option get home
# spot-check serialized data survived intact
wp option get widget_text --format=json
# count any survivors of the old host
wp db query "SELECT COUNT(*) FROM wp_posts WHERE post_content LIKE '%old.example.com%'"
```

Survivors in `post_content` are usually escaped-slash forms or hard-coded absolute URLs — handle per the gotchas above.
