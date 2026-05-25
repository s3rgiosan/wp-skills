# Media Migration — Deep Dive

Media is the hardest part of a WordPress migration. Run the image-discovery and external-CDN queries in `pre-flight-sql.md` before designing anything here. For recovery after attachments were wrongly deleted, see `media-recovery-checklist.md`.

---

## Five sub-problems

A complete media migration lands all five. Missing any one breaks the site quietly.

| Sub-problem | Pattern |
|---|---|
| **Files on disk** | Cloud sources fetched by URL (`source_url` from REST or `guid` from DB); local sources copied via rsync / tarball / SCP |
| **`wp_posts.ID` preservation** | Direct `$wpdb->insert(['ID' => $legacy_id, ...])` |
| **`_wp_attached_file` postmeta** | Relative path under `uploads/` |
| **`_wp_attachment_metadata` postmeta** | `wp_generate_attachment_metadata()` regenerates the sizes array from the file on disk |
| **Inline references** | `wp-image-N`, `"id":N`, `_thumbnail_id`, ACF gallery rows must continue to resolve |

---

## ID preservation is load-bearing

Surviving content references attachments by ID — `wp-image-N` class, `"id":N` block attr, `_thumbnail_id`, ACF gallery numeric IDs. Rewriting every reference is intractable, so **the migration must put each attachment back at its original ID**.

WP normally lets MySQL autoincrement. Pass `ID` explicitly into the insert array to force it:

```php
$wpdb->insert( $wpdb->posts, [
    'ID'             => $legacy_id,    // explicit, not autoincrement
    'post_type'      => 'attachment',
    'post_status'    => 'inherit',
    'guid'           => $source_url,
    'post_mime_type' => $mime_type,
    // ...
] );
```

Since the IDs were deleted, the slots are free. MySQL's autoincrement counter tracks max-ever-issued, so future uploads stay above the restored range.

**Collision guard:** if a new attachment was uploaded after the migration and grabbed a since-deleted ID, the ID-preserving insert returns `false` (PRIMARY KEY collision). Log + skip — never silent-overwrite. The restorer must check the insert result on every row.

---

## The seven-source reference scanner

Before deleting any attachment, intersect its ID against a union of all reference sources in surviving content. Anything in the union is "in use" and must not be deleted; anything outside it is an orphan candidate.

| Reference pattern | Where it lives | Regex / SQL |
|---|---|---|
| `<img class="wp-image-N">` | `wp_posts.post_content` | `wp-image-(\d+)` |
| `"id":N` block attrs | `wp_posts.post_content` | `"id":\s*(\d+)` |
| `_thumbnail_id` | `wp_postmeta` | `meta_key='_thumbnail_id'` |
| ACF gallery / image fields | `wp_postmeta` | numeric `meta_value` matching attachment IDs |
| `[?&]attachment_id=N` | `wp_posts.post_content` | `[?&]attachment_id=(\d+)` |
| Filename match | `wp_postmeta._wp_attached_file` basename | substring match against `<img src>` basenames |
| Custom image-meta keys | `wp_postmeta` (`hero_image_id`, `og_image_id`, …) | enumerate per project |

Build a single function that returns the union set (the "in use" IDs). Run it against every "delete attachments" decision. The `_thumbnail_id`-only check is **not** sufficient — it misses block attrs, ACF galleries, and inline HTML.

> **The incident this prevents:** a Tier 3 DNM-delete bulk-deleted attachments flagged "do not migrate"; a large fraction were still referenced by surviving content. `wp_delete_post( $id, true )` calls `wp_delete_attachment()`, which deletes the file from disk — irrecoverable without backup. The intersect-before-delete guard is non-negotiable.

---

## Recovery when files are already gone

Two-tier strategy. Full step-by-step in `media-recovery-checklist.md`.

**Tier 1 — REST-based auto restore.** Query the legacy site:

```
GET <legacy-host>/wp-json/wp/v2/media/<id>
```

Returns `source_url`, `mime_type`, `slug`, `title`, `date`. HTTP-fetch the file from `source_url`, save under `wp-content/uploads/<year>/<month>/<basename>`, INSERT the `wp_posts` row at the original ID, set `_wp_attached_file`, regenerate metadata. Works for `post_status=publish` and `post_status=inherit` attachments.

**Tier 2 — manifest-driven registrar.** REST returns 401 for `post_status=private` attachments. The operator copies the files manually (rsync / scp / sftp) and feeds a CSV manifest:

```csv
id,relative_path,post_parent,post_title,post_name,post_mime_type
```

The registrar verifies the file exists, INSERTs at the explicit ID, regenerates metadata.

**Critical observation:** file URLs are public even when the post is private. WP only blocks via REST/frontend, not direct `/wp-content/uploads/...` access. `curl <source_url>` works without auth — only the REST *metadata* lookup needs the manifest fallback.

---

## Sideload for cross-CDN inline content

Inline `<img>` tags pointing at external CDNs (Cloudinary, Fastly, custom image hosts) need sideloading: download the file, insert as a local attachment, rewrite the inline `src`.

1. Discover unique external image hosts from `post_content` (see `pre-flight-sql.md` §9).
2. For each unique URL, `media_sideload_image()` downloads the file, inserts an attachment, returns the new ID.
3. Rewrite the inline `<img src>` to point at the new uploads URL.

**Provider quirks:** decode provider-specific URL encodings before sideload (e.g. Cloudinary base64 IDs — site-scoped `39:000…` or numeric forms). Keep these in per-source handlers.

**Filename collisions:** `media_sideload_image()` appends `-1`, `-2`, … when two sideloads share a basename. The rewriter must look up the *actual* new path from the inserted attachment row — never derive it from the source URL.

**Dependency order:** sideload BEFORE the orphan sweep. Otherwise still-external references look like orphans and get dropped.

---

## Image-format gotchas (the silent breakers)

| Format | Gotcha | Mitigation |
|---|---|---|
| **SVG** | WP core blocks SVG uploads. Surviving SVGs were authored on a stack that allowed them; the new install rejects the files the DB references. | Inventory via `WHERE post_mime_type='image/svg+xml'`. If non-zero, ship `safe-svg` (or equivalent) and confirm the policy with the client. |
| **WebP** | Imagick/GD on the destination host may not support WebP — `wp_generate_attachment_metadata()` silently fails to emit sizes → srcset breaks. | Test on staging: upload a WebP, verify `_wp_attachment_metadata` populates `sizes`. |
| **GIF (animated)** | Metadata regeneration renders the first frame for sized variants — animation lost in any size but the original, and inline `<img>` usually points at a sized variant. | Skip size-regeneration for `image/gif`, or accept first-frame stills in editorial chrome. Confirm with the client. |
| **Oversized originals** | Large files land in `uploads/`, but the host's resize ceiling (`memory_limit`, Imagick `set_resource_limit`) may reject regeneration — silent fail. | Pre-flight `find uploads -size +5M -name '*.jpg' \| head` on the source. Plan for `--scaled` variants or an `image_resize_dimensions` filter. |
| **Filename collisions on sideload** | `media_sideload_image()` suffixes duplicate basenames; rewrites that assume the basename survives break. | Read the actual new path from the inserted attachment row (`wp_unique_filename()` semantics), never from the source URL. |
| **EXIF / metadata stripping** | Some hosts strip EXIF on upload, some don't. Affects featured-image alt-text auto-population. | Decide the policy with the client; configure on the new host before migration if EXIF retention matters. |

---

## Metadata regeneration

After restoring or sideloading, run `wp_generate_attachment_metadata( $id, $absolute_path )` to read actual file dimensions and emit the sizes array WP needs for responsive images. Skip this and `srcset` breaks across the site. Pass the result to `wp_update_attachment_metadata( $id, $meta )`. Idempotent — safe to re-run.

Bulk regeneration for existing attachments where this was missed:

```bash
wp media regenerate --yes
```

---

## Orphan attachment detection

The seven-source reference scanner returns the set of IDs that ARE referenced. Anything NOT in that set is an orphan candidate. Conservative defaults:

- Drop orphans only when the cohort is large enough that manual review is impractical.
- Always dry-run first; eyeball the count + a sample of slugs.
- Log every drop with the file path so disk state can be reconciled.
- **Run the scan AFTER any sideload pass** so freshly-imported external images aren't classified as orphans.
