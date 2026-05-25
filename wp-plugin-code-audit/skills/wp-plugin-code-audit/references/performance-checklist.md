# Performance Checklist

Performance findings rarely sink a plugin on their own (severity skews Medium / Low) but they compound. Prioritize what fires on every request.

---

## 1. Autoloaded options

`wp_options.autoload='yes'` loads on every request via `wp_load_alloptions()`. A plugin adding a large blob with autoload=yes silently slows the whole site.

**Detect:**
```bash
grep -RnE "(add_option|update_option)\(" --include="*.php" .
# Check the 3rd arg / autoload param. update_option() defaults to autoload=yes for new options.
```

| Bad | Why | Fix |
|---|---|---|
| `update_option( 'my_cache', $big_array );` (autoload default) | Loaded every request | Set `autoload=no` explicitly OR use a transient. |
| Serialized cache > 100KB in an autoloaded option | wp_options scan dominated by one row | Move to a transient / object cache / custom table. |
| Many small autoloaded options (>50) | Cumulative parse + memory | Group into one structured option. |

**Verify:** on a real install, `wp option list --autoload=yes --format=table --fields=option_name,size_bytes | sort -k2 -nr | head`. Anything from the plugin above ~10KB is suspect.

---

## 2. Queries on every request

**Detect:** hook callbacks on `init`, `wp_loaded`, `template_redirect`, `wp` running DB queries:

```bash
grep -RnE "add_action\(\s*['\"](init|wp_loaded|template_redirect|wp|admin_init)['\"]" --include="*.php" .
```

For each callback, check for `WP_Query`, `get_posts`, `$wpdb->get_results`. Common offenders:

- Settings page registration querying posts on every admin page load (admin_init runs everywhere).
- "Has the plugin run yet?" check that re-queries instead of caching.
- Counter / stats fetched per-request without object cache.

Wrap in `wp_cache_get` / `set` (object cache) or a transient with realistic TTL.

---

## 3. `WP_Query` anti-patterns

| Anti-pattern | Impact | Fix |
|---|---|---|
| `posts_per_page => -1` on user-facing pages | Unbounded fetch as content grows | Pagination + explicit `posts_per_page`. |
| `meta_query` on large tables without an indexed key | Full table scan on `postmeta` | Custom column / table, or `tax_query` if it's really a taxonomy. |
| Default `WP_Query` for archive-style pages with thousands of posts | `SELECT FOUND_ROWS()` doubles the cost | `no_found_rows => true` if pagination count not needed. |
| `orderby => 'rand'` | Filesort, kills cache | Pre-compute or sample IDs first. |
| `nopaging => true` + `fields => 'all'` | Memory blowup | `fields => 'ids'` if only IDs needed. |
| `posts_per_page` very large (>200) without batching | Memory + DB pressure | Batched loop with `wp_reset_postdata()` + GC between batches. |

---

## 4. Direct `$wpdb` queries without index awareness

**Detect:** `JOIN` / `WHERE` on `postmeta`, `usermeta`, `commentmeta`, `termmeta` without an indexed key.

- `meta_key` is indexed; `meta_value` isn't (256-byte prefix only on older schemas).
- `ORDER BY meta_value` triggers filesort on large tables.
- For repeated query patterns, a custom table or an indexed meta column is the fix.

---

## 5. Transients

**Detect:**
```bash
grep -RnE "(set|get|delete)_transient\(" --include="*.php" .
grep -RnE "(set|get|delete)_site_transient\(" --include="*.php" .
```

| Issue | Why | Fix |
|---|---|---|
| `set_transient( $k, $v, 0 )` or no TTL | Lives until manually deleted; pollutes wp_options | Set an explicit TTL. |
| Transient as a write-cache for frequently-changing data | Constant cache invalidation | Object cache or in-process memoization. |
| Long-name transients (>40 chars) | Truncation on persistent caches without proper backend | Short, deterministic keys. |
| Setting transient without checking `wp_cache_supports( 'flush_runtime' )` etc. on critical paths | Transient backend can be missing | Don't assume persistence; transients are best-effort. |

---

## 6. Cron

**Detect:**
```bash
grep -RnE "wp_schedule_event\(" --include="*.php" .
grep -RnE "wp_schedule_single_event\(" --include="*.php" .
```

| Issue | Impact | Fix |
|---|---|---|
| Scheduling on every plugin load (without checking `wp_next_scheduled`) | Duplicate events; doesn't fire | `if ( ! wp_next_scheduled( $hook ) ) wp_schedule_event(...);`. |
| Hook callback registered conditionally → scheduled event has no handler → silent failure | Cron entries pile up | Register hook unconditionally; gate side effect inside. |
| Heavy work in cron callback without batching | One job blocks the queue (WP cron is sequential) | Break into smaller events; use Action Scheduler for >100 items/day. |
| Not unscheduled in deactivation | Phantom events after uninstall | `wp_clear_scheduled_hook` in `register_deactivation_hook`. |

---

## 7. HTTP API calls

**Detect:**
```bash
grep -RnE "wp_remote_(get|post|head|request)\(" --include="*.php" .
```

For each call, check:
- Default timeout is 5s — set explicit timeout for known-slow remotes.
- Response cached? (External API hit on every page = death.)
- In a request-handling code path or async (cron)?
- Failure path? `is_wp_error()` checked, not silently swallowed?
- Bulk operations using `Requests::request_multiple()` or fired off via cron?

A synchronous `wp_remote_get` in `init` against an external API is one of the most common WP performance disasters.

---

## 8. Asset enqueue

**Detect:**
```bash
grep -RnE "(wp_enqueue_script|wp_enqueue_style)\(" --include="*.php" .
```

| Issue | Fix |
|---|---|
| Frontend-only assets enqueued on `admin_enqueue_scripts` (or vice versa) | Use the right hook. |
| Assets enqueued globally; only needed on one page | Gate with `is_singular( 'foo' )` / page-specific checks. |
| Massive bundle (>500KB minified) | Code-split; lazy-load. |
| Unminified JS / CSS in production | Build pipeline; `SCRIPT_DEBUG` switch. |
| Missing `wp_register_script` step (registers + enqueues in one call) when other code might want to enqueue conditionally | Register then enqueue. |
| Inline scripts via `wp_add_inline_script` not used; instead `wp_localize_script` for data | `wp_localize_script` is fine for data; document for JS object name collisions. |
| Loading jQuery when not needed | Remove dep. |
| Loading from external CDN (third-party blocking) | Bundle locally. |

---

## 9. Cache thrashing

Hooks that fire frequently (`save_post`, `updated_post_meta`, `transition_post_status`) calling `wp_cache_flush()` / `delete_transient` against broad keys → cache becomes useless.

Invalidate narrowly. `wp_cache_delete( $post_id, 'my_group' )`, not `wp_cache_flush()`.

---

## 10. Custom tables without indexes

If the plugin creates custom tables (`dbDelta`), confirm:
- Every column used in `WHERE` / `JOIN` / `ORDER BY` is indexed (or covered by a composite index).
- No `TEXT` / `BLOB` columns indexed without a prefix length.
- `ENGINE=InnoDB` and `utf8mb4_unicode_520_ci` (matches WP core).
- Schema upgrades use `dbDelta` correctly (column names case-sensitive; specific format constraints).

---

## 11. Memory leaks in long-running loops

WP-CLI commands or migration loops processing thousands of records:

```php
foreach ( $posts as $post ) {
    // process...
    wp_reset_postdata();
    if ( $i++ % 100 === 0 ) {
        wp_cache_flush();          // or targeted delete
        gc_collect_cycles();
    }
}
```

Without periodic cache flush, the object cache grows unbounded. Plugin-supplied bulk scripts must show this discipline.

---

## 12. Block / Editor performance (Gutenberg)

- `apiFetch` in block edit() called on every render instead of via `useSelect` / `useEntityRecord`.
- Server-side rendered blocks (`render_callback`) running expensive queries on every editor preview.
- Large block libraries enqueued in editor + frontend instead of `enqueue_block_editor_assets` vs `enqueue_block_assets`.

---

## Severity heuristic for perf findings

| Pattern | Default severity |
|---|---|
| Autoloaded option >100KB | High |
| Sync external HTTP call on every request | High |
| `posts_per_page=-1` user-facing | High |
| Autoloaded option >10KB but <100KB | Medium |
| Cron callback unscheduling missing | Medium |
| Transient without TTL | Medium |
| Asset over-enqueue (loaded on all pages) | Low |
| Unindexed custom table column | Medium → High if user-facing query path |

Adjust based on the plugin's traffic / use case.
