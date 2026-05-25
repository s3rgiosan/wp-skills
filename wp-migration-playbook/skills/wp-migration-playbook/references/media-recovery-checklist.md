# Media Recovery Checklist

When a migration accidentally deleted attachment rows + files. No-downtime recovery sequence. For the patterns behind these steps (reference scanner, ID preservation, sideload, image-format gotchas) see `media-deep-dive.md`.

## 1. Triage the damage

```sh
# Count dropped attachments from the audit log
wp db query "SELECT COUNT(*) AS dropped
    FROM <prefix>_migration_log
    WHERE step = 'post_types'
      AND action = 'drop_dnm'
      AND before_value LIKE 'post_type=attachment%'"

# Sample a few of the dropped IDs
wp db query "SELECT legacy_post_id, before_value
    FROM <prefix>_migration_log
    WHERE step = 'post_types'
      AND action = 'drop_dnm'
      AND before_value LIKE 'post_type=attachment%'
    LIMIT 10"
```

## 2. Compute the dangling reference set

Scan surviving content for references to dropped attachment IDs:

```sh
# Run in PHP via wp eval-file
wp eval-file /path/to/find_dangling.php
```

Where `find_dangling.php` collects the set:

```php
<?php
global $wpdb;

$dropped = $wpdb->get_col(
    "SELECT DISTINCT legacy_post_id FROM <prefix>_migration_log
        WHERE step = 'post_types'
          AND action = 'drop_dnm'
          AND before_value LIKE 'post_type=attachment%'"
);
$dropped_set = array_flip( array_map( 'intval', $dropped ) );

$referenced = [];

// Postmeta numeric values.
foreach ( $wpdb->get_col(
    "SELECT DISTINCT meta_value FROM {$wpdb->postmeta}
        WHERE meta_value REGEXP '^[0-9]+$'"
) as $v ) {
    $id = (int) $v;
    if ( isset( $dropped_set[ $id ] ) ) {
        $referenced[ $id ] = true;
    }
}

// post_content references.
foreach ( $wpdb->get_col(
    "SELECT post_content FROM {$wpdb->posts}
        WHERE post_status NOT IN ('auto-draft','trash','revision')
          AND (
            post_content LIKE '%wp-image-%'
            OR post_content LIKE '%attachment_id=%'
            OR post_content LIKE '%\"id\":%'
            OR post_content LIKE '%/wp-content/uploads/%'
          )"
) as $content ) {
    if ( $content === '' ) {
        continue;
    }
    if ( preg_match_all( '/wp-image-(\d+)/', $content, $m ) ) {
        foreach ( $m[1] as $id ) {
            if ( isset( $dropped_set[ (int) $id ] ) ) {
                $referenced[ (int) $id ] = true;
            }
        }
    }
    if ( preg_match_all( '/"id":(\d+)/', $content, $m ) ) {
        foreach ( $m[1] as $id ) {
            if ( isset( $dropped_set[ (int) $id ] ) ) {
                $referenced[ (int) $id ] = true;
            }
        }
    }
    if ( preg_match_all( '/[?&]attachment_id=(\d+)/', $content, $m ) ) {
        foreach ( $m[1] as $id ) {
            if ( isset( $dropped_set[ (int) $id ] ) ) {
                $referenced[ (int) $id ] = true;
            }
        }
    }
}

printf(
    "dropped=%d referenced=%d\n",
    count( $dropped_set ),
    count( $referenced )
);
```

## 3. Restore from legacy via REST (Tier 1 — bulk)

If the legacy site is still reachable and the attachments are `post_status=publish` or `inherit`:

```sh
# Cohort breakdown
wp <migration-plugin> cleanup restore-attachments --analyze

# Dry-run
wp <migration-plugin> cleanup restore-attachments

# Spot-test
wp cache flush
wp <migration-plugin> cleanup restore-attachments --apply --limit=5

# Browser-verify one of the touched pages, then scale up
wp cache flush
wp <migration-plugin> cleanup restore-attachments --apply
```

Each restore:

1. `GET <legacy-host>/wp-json/wp/v2/media/<id>` → metadata
2. HTTP-fetch `source_url` → `wp-content/uploads/<year>/<month>/<basename>`
3. INSERT `wp_posts` row at the original ID
4. Set `_wp_attached_file` postmeta
5. `wp_generate_attachment_metadata()` + `wp_update_attachment_metadata()`
6. `clean_post_cache()`

## 4. Restore private-on-legacy stragglers (Tier 2 — manual)

If some IDs return REST `401 Unauthorized` (legacy `post_status=private`):

### Extract metadata from the legacy DB dump

For each ID, grep the dump for the `wp_posts` row to get `guid`, `post_parent`, `post_title`, `post_name`, `post_mime_type`:

```sh
grep -oE "\(<ID>,[0-9]+,'[^']+','[^']+',[^)]*'attachment'[^)]+\)" legacy-dump.sql
```

### Copy files from legacy

The file URL is **public even when the post is private** — WP only blocks via REST/frontend. Direct `/wp-content/uploads/...` access works. Either:

- `curl -fsSL <source_url> -o <local_path>` per file.
- Or rsync the relevant `uploads/<year>/<month>/` subtree from the legacy server.

Place files on the new server at the same relative path under `uploads/`.

### Build a CSV manifest

```csv
id,relative_path,post_parent,post_title,post_name,post_mime_type
12345,2024/10/example-image.png,1000,"Example title",example-image,image/png
67890,2025/01/another-file.jpg,2000,"Another",another-file,image/jpeg
```

Required columns: `id`, `relative_path` (under `uploads/`). Optional columns default to:

- `post_parent` → 0
- `post_title` → filename without extension
- `post_name` → `sanitize_title(filename-without-extension)`
- `post_mime_type` → `wp_check_filetype()` lookup

### Register the rows

```sh
wp <migration-plugin> cleanup register-attachments /path/to/manifest.csv
wp <migration-plugin> cleanup register-attachments /path/to/manifest.csv --apply
```

## 5. Code-level safeguard (prevent recurrence)

Before merging the migration to other environments, patch the bulk-delete step to intersect with the live reference set:

```php
$referenced = $this->reference_scanner->scan_referenced_ids(
    array_flip( $dropped_ids )
);

foreach ( $rows as $r ) {
    if ( $r->post_type === 'attachment' && isset( $referenced[ $r->ID ] ) ) {
        // Skip + log instead of delete.
        $this->logger->record(
            'post_types',
            'drop_dnm_attachment_referenced',
            $r->ID,
            sprintf( 'post_name=%s', $r->post_name ),
            'PRESERVED — still referenced by surviving content',
            $dry_run
        );
        continue;
    }
    // ... existing delete logic
}
```

## 6. Verify

```sh
wp <migration-plugin> cleanup restore-attachments --analyze
# Expect: to_restore: 0
```

Browser-check the worst-affected pages. Confirm `_wp_attachment_metadata` was regenerated (sizes count > 0) for restored IDs:

```sh
wp eval 'foreach ([47, 176, 274] as $id) {
    $m = get_post_meta($id, "_wp_attachment_metadata", true);
    echo "ID=$id sizes=" . count((array) ($m["sizes"] ?? [])) . "\n";
}'
```
