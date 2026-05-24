# CLI Flag Conventions

Standard contract for WP-CLI subcommands inside a migration plugin. Use the same flags across every subcommand so muscle memory transfers between Tier 3 transforms and post-launch cleanup.

## Mandatory flags

| Flag | Meaning | Default |
|---|---|---|
| `--apply` | Mutate. Without this flag, runs dry-run. | dry-run (no mutation) |
| `--force` | Bypass the run-once completion gate. | false |
| `--limit=<n>` | Cap on **genuine work**, not skips. | unlimited |

## Optional but recommended

| Flag | Meaning |
|---|---|
| `--show-skipped` | Render per-row skip detail with reason. Useful for triaging outliers in dry-run. |
| `--analyze` | Cohort breakdown without mutating (recovery commands). |
| `--verbose` | Per-row log output to STDOUT in addition to the audit table. |

## Counter semantics

Three counters, all returned from the command and printed in the summary:

| Counter | Meaning |
|---|---|
| `attempted` | Records the command intended to process (excludes idempotent skips). |
| `applied` / `restored` / `changed` | Records that mutated successfully. |
| `skipped` | Idempotent no-ops (already cleaned / already restored). **Free — never consume `--limit`.** |
| `failed` | Records that errored. Each failure is recorded individually with a reason string. |

**Gotcha:** if `--limit` counts idempotent skips against the cap, batched re-runs burn the entire budget re-checking already-restored records. Increment `attempted` only **after** the cheap-skip check.

## Skip reasons

Surface skip reasons as a short kebab-case string. Examples from real plugins:

- `already-exists` (idempotent skip — record already in target state)
- `empty-content` (post_content is empty / nothing to do)
- `no-leading-group` (matcher didn't find the expected structure)
- `header-marker-missing` (required block-attribute marker absent)
- `non-allowlist-inner-block` (block tree contains something outside the safe set)
- `no-pattern-found` (pattern-name matcher returned nothing)

Reasons drive `--show-skipped` output and feed the audit log.

## Failure reasons (recovery commands)

| Reason | Cause |
|---|---|
| `rest-http-401` | Legacy REST API requires auth (private post status) |
| `rest-http-404` | Resource gone from legacy too |
| `rest-http-429` | Rate-limited; wait + re-run |
| `download-http-403` | File behind CDN auth |
| `download-empty` | 0-byte response |
| `download-http-<code>` | Other HTTP failure during file download |
| `mkdir-failed` | Permission issue creating uploads subdirectory |
| `file-not-found` | Manifest-driven restore can't find the file on disk |
| `wp_posts-insert-failed` | ID collision or DB constraint violation |
| `mime-type-unknown` | `wp_check_filetype()` returned no type |

## Example subcommand skeleton

```php
public function some_task( array $args, array $assoc_args ): void {
    $dry_run = ! isset( $assoc_args['apply'] );
    $force   = isset( $assoc_args['force'] );
    $limit   = isset( $assoc_args['limit'] ) ? (int) $assoc_args['limit'] : null;

    if ( ! $dry_run && ! $force && $this->already_completed() ) {
        WP_CLI::error(
            'BLOCKED: <task> already completed. Pass --force to re-run.'
        );
    }

    WP_CLI::log( sprintf( 'Mode: %s', $dry_run ? 'DRY-RUN' : 'APPLY' ) );

    $result = $this->run( $dry_run, $limit, $force );

    WP_CLI::log(
        sprintf(
            '  attempted=%d applied=%d skipped=%d failed=%d',
            $result['attempted'],
            $result['applied'],
            $result['skipped'],
            $result['failed']
        )
    );

    if ( ! $dry_run ) {
        $this->logger->record(
            'cleanup',
            '<task>_completed',
            null,
            $before_summary,
            $after_summary,
            false
        );
    }

    WP_CLI::success( $dry_run ? 'Dry-run complete.' : 'Task applied.' );
}
```

## Already-completed gate

```php
private function already_completed(): bool {
    global $wpdb;
    $log = $wpdb->prefix . 'migration_log';
    $prepared = $wpdb->prepare(
        'SELECT COUNT(*) FROM %i
            WHERE step = %s AND action = %s AND dry_run = 0',
        $log,
        self::STEP,
        self::ACTION_COMPLETED
    );
    return (int) $wpdb->get_var( $prepared ) > 0;
}
```
