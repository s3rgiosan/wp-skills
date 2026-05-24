---
name: wp-migration-playbook
description: >
  Use when planning, sizing, or running a WordPress content migration — WP→WP
  (multisite consolidation, hosting move, theme replatform) or other-system→WP
  (Laravel, Drupal, static, proprietary CMS). Triggers: "WP migration",
  "WordPress migration", "content migration", "migrate to WordPress", "WP to WP
  migration", "Laravel to WordPress", "Drupal to WordPress", "import posts",
  "migrate attachments", "media migration", "migration runbook", "migration
  plugin", and any bulk wp_posts / wp_postmeta / wp_term_* transform.
---

# WordPress Migration Playbook

Cross-project playbook synthesized from real WordPress migrations. Opinionated — these patterns survived production. Other approaches exist; these are the ones that didn't bite.

> **Scope:** Content migrations onto WordPress — WP→WP (multisite consolidation, hosting move, theme replatform) and other-system→WP (Laravel / Drupal / static / proprietary CMS). Not generic data-warehouse migrations.

> **Note on SQL:** Examples use the `wp_` table prefix. Substitute the install's real prefix (and per-site prefix `wp_<n>_` on multisite).

---

## When To Use This Skill

Reach for this skill whenever planning, sizing, or running a WordPress migration:

- Inspecting the legacy database to scope and de-risk the work (start here — see §1).
- Designing the migration plugin architecture before any code is written.
- Sizing the work for a proposal or sprint plan.
- Debugging a destructive transform that broke production.
- Choosing between programmatic WP API import vs direct DB import.
- Building the attachment-handling pipeline (the hardest part).
- Resolving the redirect map.
- Recovering from a damaged migration run.

If a task touches `wp_posts` / `wp_postmeta` / `wp_term_*` in bulk, this is the right reference.

> **Executing a migration?** This skill is organized by topic. For the ordered phase sequence (import → pre-flight → URL rewrite → inventory → redirects → transforms → verify → cutover → recovery), follow `references/runbook.md` and pull the topic sections below as each phase needs them.

---

## 1. Pre-Flight

### Inspect the legacy DB before writing anything

**You cannot scope or de-risk a WordPress migration without first putting the legacy DB on a table and asking it questions.** Most production-grade migration incidents trace back to something nobody measured upfront. Run the discovery queries **before** writing a single migration script; capture the output in a discovery doc that drives sizing, plugin scope, redirect strategy, and recovery planning.

The full discovery checklist — runnable SQL for volume/cohort sizing, CPTs and taxonomies, users and authorship, block and pattern census, inline references and shortcodes, plugin-stored redirects, the permalink/URL surface, and image inventory — lives in `references/pre-flight-sql.md`. Import the dump first (`wp db cli < dump.sql`, see §8) and work against the copy.

### Decide migration shape

| Shape | Approach | Use when |
|---|---|---|
| **WP → WP, small (< 10K records)** | Custom migration plugin, WP-CLI driven, single dump import + Tier 1–3 transforms | Inventory-driven per-record decisions, mixed dispositions |
| **WP → WP, large (> 50K records)** | Direct DB import (`wp_<site>_*` → `wp_*`) + SQL pipeline + WP-CLI commands for non-trivial transforms | Uniform cohort, multisite consolidation, theme replatform |
| **System → WP** | Schema discovery → entity grouping → unified CPT modelling → import via WP-CLI | Source schema is not WP-shaped |

Volume drives the choice. ID-preserving direct-DB import scales; programmatic `wp_insert_post()` per record does not (hooks, revisions, sanitization compound).

### Clone-and-transform, never in-place

The legacy DB dump is also the rollback artifact. Never mutate the source DB; always import a copy and transform it. Re-import = full reset. This invariant lets you iterate aggressively on transforms without fear.

Large dumps (multi-GB) need import tuning — raise `max_allowed_packet`, dump with `--single-transaction`, mind `innodb_buffer_pool_size`. See `references/runbook.md` (Large imports). On managed hosts you can't tune MySQL; chunk per-table or use host tooling.

### URL / domain rewrite is serialized-sensitive

Any WP→WP move that changes domain or path needs a database-wide URL rewrite. **Never** use SQL `REPLACE()` — it corrupts serialized data (PHP encodes byte lengths). Use `wp search-replace --recurse-objects --skip-columns=guid`, dry-run first. Full procedure, multisite handling, and gotchas (escaped-slash block URLs, GUID column) in `references/search-replace.md`.

### Multisite consolidation specifics

Consolidating one site out of a multisite network (or merging several) has mechanics a single-site move doesn't:

- **Per-site table prefix** is `wp_<n>_` (e.g. `wp_5_posts`); the network's primary site uses bare `wp_`. Direct-DB import renames `wp_<n>_*` → `wp_*` and reconciles the prefixed capability/role keys — full remap pipeline (table renames, `wp_<n>_capabilities` → `wp_capabilities`, network-table drop, config cleanup) in `references/runbook.md`.
- **Users + usermeta are network-shared** (`wp_users`, `wp_usermeta` with `wp_<n>_capabilities` keys). Capabilities are per-site meta keys; collapse them to standard roles on the target (see §5).
- **Network-level URLs** live in `wp_blogs.domain`/`path` and `wp_site`/`wp_sitemeta`, not only per-site options — `wp search-replace` covers options but verify these too.
- **`--network` / `--url=<site>`** scope WP-CLI to the network or a single subsite.
- Inventory + transforms run against the imported per-site tables once mapped to `wp_*`.

### Staging environment mirrors prod

- Same host (WP Engine / Pantheon / other), same PHP version, same plugins active.
- Migration runs against a preprod-style environment, never directly on the customer-facing site.
- DNS cut-over happens after sign-off; keep the legacy site reachable for the recovery window.

---

## 2. Inventory + Disposition

Every record needs an explicit **disposition** before any transform runs. Three classes:

- **Migrate** — record carries over (possibly with URL / CPT / slug change).
- **Build** — net-new content authored on the new site; nothing to migrate but the URL is reserved.
- **Do not migrate** — record gets dropped from the new site. Must carry a 301 destination (see §7).

### When per-record decisions are needed

Use a spreadsheet (or any structured external source) keyed by legacy URL. Required columns at minimum:

| Column | Purpose |
|---|---|
| `Existing URL` | Source of truth for the legacy record |
| `Migration Status` | Migrate / Build / Do not migrate |
| `New URL` | Target URL when migrating |
| `Redirect` | Explicit 301 target for DNM rows |
| CPT / template / SEO overrides | Per-record customization the transformer applies |

Import the spreadsheet into a custom DB table (`<plugin_prefix>_migration_inventory`). Run a separate `inventory match` step before any transform that joins inventory to legacy `wp_posts.ID` by URL. Emit unmatched-row counts as a sign-off blocker — every disposition must resolve to a real legacy record. Once matched, every downstream transform is "for each row in inventory, do X."

### When the cohort is uniform

Skip the spreadsheet. Encode dispositions in code (e.g. "all videos discarded", "shadow CPT X collapsed to taxonomy Y"). Trade-off: less auditable, fewer per-record edge cases to handle.

---

## 3. Migration Plugin Architecture

Distilled pattern for inventory-driven migrations. Transfers to any one-shot migration plugin.

### Three tiers + post-launch cleanup

| Tier | Scope | Risk |
|---|---|---|
| **Tier 1** | Inventory import + match to legacy DB + read-only audits | None |
| **Tier 2** | Redirect map build + bulk-import export | None — output only |
| **Tier 3** | Destructive `wp_posts` / `wp_postmeta` / `wp_term_*` transforms | High — requires dump backup |
| **Cleanup** | Post-launch chrome stripping, residual option clearing, recovery | Medium — gated, idempotent |

### The four invariants

1. **Dry-run by default.** Every command runs in dry-run mode unless invoked with `--apply`. Both modes write to the same audit log so audits filter by intent.
2. **Append-only log table** (`<plugin_prefix>_migration_log`) with `(step, action, legacy_post_id, before_value, after_value, dry_run, notes, logged_at)`. One row per touched record + one summary row per pass.
3. **Run-once gates** via marker queries. Before an `--apply` pass runs, the subcommand queries the log for its own `step + action='<task>_completed' + dry_run=0` marker. Present → refuse with a clear error. `--force` bypasses.
4. **Idempotent on the data.** Re-running over already-transformed content is a no-op — the matcher must recognize cleaned state.

### Cross-step gates (encode invariants in code, not checklists)

A destructive DNM-delete step refuses to run unless the redirect map has been exported and logged. The redirect-invariant becomes a SQL gate, not a process checklist:

```php
$redirects_exported = (int) $wpdb->get_var(
    "SELECT COUNT(*) FROM {$log}
        WHERE step = 'redirects'
          AND action = 'exported'
          AND dry_run = 0"
);

if ( ! $dry_run && $redirects_exported === 0 ) {
    return [ 'blocked' => true, ... ];
}
```

Checklists fail; code gates don't.

### CLI flag conventions

Use the same flags across every subcommand so muscle memory transfers:

| Flag | Meaning |
|---|---|
| `--apply` | Mutate. Default = dry-run. |
| `--force` | Bypass the run-once completion gate. |
| `--limit=<n>` | Cap on **genuine work**, not skips. Skipped (already-done) records do not consume the budget. |
| `--show-skipped` | Render per-row skip detail with reason. |
| `--analyze` | Cohort breakdown without mutating (for recovery commands). |

**Counter semantics gotcha:** if `--limit` counts idempotent skips against the cap, batched re-runs burn the entire budget re-checking already-restored records. Increment the work counter only after the cheap-skip check. Full contract in `references/cli-flag-conventions.md`.

---

## 4. Content Types + Taxonomies

### Unify when sibling tables share ~80% of columns

If the legacy schema has several "resource-like" types with mostly-overlapping fields (Blog / Customer Story / eBook / Webinar / Event style, or marketplace catalogs with several similar listings), collapse into a single CPT plus a taxonomy of types. Reasons:

- One editor list view, not N.
- Unified URL pattern.
- Cross-type search/filter is trivial.
- Future field additions live on one schema.

Keep separate CPTs only when schemas genuinely diverge (different field groups, different workflow, different permissions).

### Drop shadow CPTs into termmeta

WP multisite installs often have "shadow" CPTs that mirror taxonomies (e.g. an `author-post` CPT mirroring an `author` taxonomy, used to attach bio/photo/social fields). Migration target: collapse these by moving the metadata fields onto `wp_termmeta` for the equivalent term. The CPT itself goes away.

### CPT remap via post_type column rewrite

Direct `UPDATE wp_posts SET post_type='blog' WHERE post_type='resource' AND ID IN (…)` is the fastest path for tens of thousands of records. ID-preserving means block-attribute references survive. Log per-row to the audit table for traceability.

### Term-taxonomy consolidation pattern

When collapsing multiple legacy taxonomies into a smaller set on the new site:

1. Insert target terms into target taxonomies (idempotent — check existence first).
2. For each legacy `term_relationships` row, insert a new row pointing at the target term.
3. After all rewrites apply, drop the retired taxonomies from `wp_term_taxonomy`.

---

## 5. User Migration

### Common collapse patterns

- **Custom roles → standard roles.** Multisite consolidations often need a stack of custom roles collapsed to plain Author + Editor + Administrator.
- **Generic owner user for posts** when authorship lives in a separate taxonomy. Assign all posts to a single editorial user; frontend byline reads from an `author` taxonomy via plugin filters (Parse.ly, Yoast, AuthorSEO JSON-LD, etc.).

### When NOT to migrate users 1:1

If the legacy site uses authors only as a categorization device — no actual login — don't migrate them as `wp_users`. Migrate them as a taxonomy. WP's user table has password hashes, capabilities, session tokens, application passwords that a content migration doesn't care about.

### Email collisions

`wp_users.user_email` has a unique index. Multisite imports + repeated migrations create duplicate emails. Resolve in a pre-flight SQL pass before any `wp_insert_user` (query in `references/pre-flight-sql.md`).

Strategy: keep the earliest registered, suffix-mangle the rest (`user+legacy@example.com`), or merge to a generic editorial user per the disposition above.

---

## 6. Media Migration — The Hard One

Media is where migrations bleed. Every production incident and every multi-day delay tends to trace back to something nobody measured about images upfront. Read this section twice, and run the image-discovery queries in `references/pre-flight-sql.md` before designing anything.

### Five sub-problems

| Sub-problem | Pattern |
|---|---|
| **Files on disk** | Cloud sources fetched by URL; local sources copied via rsync / tarball / SCP |
| **`wp_posts.ID` preservation** | Direct `$wpdb->insert(['ID' => $legacy_id, ...])` |
| **`_wp_attached_file` postmeta** | Relative path under `uploads/` |
| **`_wp_attachment_metadata` postmeta** | `wp_generate_attachment_metadata()` regenerates sizes from the file on disk |
| **Inline references** | `wp-image-N`, `"id":N`, `_thumbnail_id`, ACF gallery rows must continue to resolve |

### ID preservation is load-bearing

Surviving content references attachments by ID (`wp-image-N` class, `"id":N` block attr, `_thumbnail_id`, ACF gallery numeric IDs). Rewriting all references is intractable; **the migration must put each attachment back at its original ID**. Mechanism: pass `ID` explicitly into `$wpdb->insert( $wpdb->posts, [...] )` instead of letting MySQL autoincrement. Since the slots were freed, MySQL's autoincrement counter (max-ever-issued) keeps future uploads above the restored range.

### Do not drop attachments without an intersect

**The single biggest mistake of this playbook** (real production incident): bulk-deleting attachments flagged "do not migrate" without checking whether they're still referenced by surviving content. `wp_delete_post( $id, true )` for attachments calls `wp_delete_attachment()` internally, which also deletes the file from disk. Irrecoverable without backup.

**Guardrail:** before deleting any attachment row, intersect its ID with the live reference set computed by scanning surviving `post_content` and `wp_postmeta` (postmeta numeric values, `wp-image-N`, `"id":N`, `attachment_id=N`, filename match, custom image-meta keys). Skip + log instead of delete when the intersection is non-empty.

The full seven-source reference scanner, the ID-preservation mechanism with collision guard, the two-tier recovery, the sideload pipeline, image-format gotchas (SVG / WebP / animated GIF / oversized originals / filename collisions / EXIF), and orphan detection all live in `references/media-deep-dive.md`. Step-by-step recovery when files are already gone lives in `references/media-recovery-checklist.md`.

---

## 7. Redirects

### The non-negotiable invariant

**Every dropped record must have a 301 destination resolved before the transform runs.** Deletion without redirect loses link equity, breaks hreflang, breaks external references, breaks indexed URLs in search results. The redirect map is a delivery artifact, not a cleanup pass.

### Ship at the edge, not via plugin

Plugin-based redirect tables (Yoast Redirects, Rank Math, Redirection) become an operational footgun at scale:

- Every request takes a PHP roundtrip.
- The redirect set ships with the database.
- Plugin upgrades can break the rule semantics.
- Plugin tables can desync from the host's redirect cache.

Ship via host:

- **WP Engine** — Web Rules Engine bulk-import. Space-separated `source destination`, status applied globally at import.
- **Pantheon** — nginx/Apache config layer.
- **Cloudflare / other CDN** — Page Rules / Rulesets at the edge.

If existing redirects live in plugin storage (Yoast, Rank Math), extract them as part of the migration — hunt them with the queries in `references/pre-flight-sql.md`. See §8 and the Yoast note below.

### Sources of redirect entries (priority-merged + deduplicated)

For inventory-driven migrations, the redirect map is built from multiple sources, priority-merged with later sources losing on source-URL conflicts. Full priority table + conflict resolution in `references/redirect-source-priority.md`:

| Priority | Source |
|---|---|
| 1 | Inventory `Migrate` row with `New URL` ≠ `Existing URL` |
| 2 | Inventory `Build` row pointing at yet-to-be-built URL |
| 3 | Inventory `Do not migrate` row with explicit `Redirect` column |
| 4 | Legacy redirect plugin's regex rules |
| 5 | Legacy redirect plugin's plain rules |
| 6 | DNM row with empty `Redirect` → fallback rule table (closest topical archive → parent → homepage) |

### Yoast Premium Redirects storage shape

Yoast stores redirects in **three** option keys, not one:

| Option key | Role |
|---|---|
| `wpseo-premium-redirects-base` | **Authoritative.** Read+written by the Yoast UI. Per-entry shape: `{origin, url, type, format}` where `format` is `plain` or `regex`. |
| `wpseo-premium-redirects-export-plain` | Denormalized snapshot for the export feature. Can lag the base (incomplete admin drafts filtered). |
| `wpseo-premium-redirects-export-regex` | Same role, regex rules. Same lag caveat. |

Implication: read `-base` to get every redirect; the export options are incomplete. Delete `-base` to make the UI show zero. Clean teardown deletes all three. General lesson: anywhere a plugin offers an "export" feature, suspect a primary store underneath and treat export keys as denormalized projections — read the primary.

---

## 8. Operational Gotchas

### `wp db import` is broken — pipe via STDIN

`wp db import file.sql` fails with `ERROR 1064 near 'SOURCE …'` because it issues `SOURCE` via `mysql -e` (non-interactive). `SOURCE` is a mysql shell builtin, valid only in interactive mode. Newer mysql clients reject it.

Workaround:

```bash
wp db cli < /absolute/path/to/file.sql
```

`wp db cli` opens an interactive-equivalent mysql session and reads SQL from STDIN. Works for the entire dump including extended INSERT statements.

### Persistent object cache + direct `$wpdb` mutations

Bulk migrations bypass WP's high-level APIs and write directly via `$wpdb` for performance — `update_option()`, `update_post_meta()`, `wp_update_post()` run filters / fire actions / create revisions / let plugins rewrite values, which is too slow at migration scale.

On hosts with a persistent object cache (WP Engine's memcached drop-in, Pantheon's Redis), the cache holds stale values after direct `$wpdb` writes. A subsequent `get_option()` / `get_post_meta()` returns the pre-mutation value.

Discipline: `wp cache flush` between bulk-transform steps. Alternatively, surgical `wp_cache_delete( $key, $group )` for the specific keys mutated. On stock WP without a drop-in the object cache is per-request and dies between CLI invocations — the bug rarely surfaces. Production hosts always run a persistent cache → assume it's persistent.

### Pantheon SSH for SQL pipelines

`terminus wp <site>.<env> -- db query` cannot pipe local files. SSH into the app container first:

```bash
terminus ssh <site>.<env>
# inside the container:
wp db query < /code/plugins/<plugin>/scripts/migration/01-import-tables.sql
```

The "This environment is in read-only Git mode" warning is harmless for DB operations.

### `wp_parse_url` URL-path-vs-query trap

`wp_parse_url('https://example.com/?p=1', PHP_URL_PATH)` returns `/`, not `''`. Naive homepage matchers (e.g. "if path is `/`, treat as homepage and return `page_on_front`") swallow `/?p=N` URLs as homepage matches.

Real production bug: every `/?p=N` query-string URL flagged "do not migrate" was matched to the homepage's `wp_posts.ID`, then the DNM-delete step deleted the homepage along with the actual DNM URLs.

Guard: when treating a URL as the homepage, also check the QUERY component is empty:

```php
$path  = (string) wp_parse_url( $url, PHP_URL_PATH );
$query = (string) wp_parse_url( $url, PHP_URL_QUERY );
if ( $query !== '' ) {
    return 0;  // not the homepage — defer to query-string matcher
}
// homepage match logic
```

### Plain `post` permalink vs `permalink_structure`

WP's default `post` post type has no `rewrite['slug']` registered. Verifiers that derive the post URL from `rewrite.slug` will emit `/post/<slug>/` regardless of what `permalink_structure` actually says. If the site uses `/blog/%postname%/`, the verifier will false-positive every blog post as a mismatch.

Fix: if `get_option('permalink_structure')` is non-empty, defer to `get_permalink( $post_id )`. Fall back to derive-from-parts only for plain-permalink test environments.

### PSR-4 vendor namespace collision

Short, single-segment vendor namespaces in a migration plugin collide with framework and autoloader conventions. Pick a two-segment namespace (`Vendor\\MigrationPlugin`) for the plugin's own classes to avoid clashing with WP, host MU-plugins, or shared Composer dependencies.

---

## 9. Verification + Recovery

### Verification report

After Tier 3 runs, generate an **expected vs actual** report per inventory row. Inventory says "this row should land at URL X with post_type Y and SEO title Z" — verifier reads the actual `wp_posts` + `wp_postmeta` + permalink and compares.

| Status | Meaning |
|---|---|
| `PASS` | All expected fields match. |
| `PASS_BUILD` | Net-new row; verify by hand once authored. |
| `MISMATCH` | Migrate row drifted from expected. Investigate. |
| `DELETED` | Migrate row's post is missing. **Should not happen** — investigate. |
| `NO_MATCH` | Inventory never resolved a `legacy_post_id`. |
| `NOT_DELETED` | DNM row's post still exists. |
| `NO_REDIRECT` | DNM row has no redirect rule. |

Filter `MISMATCH` / `NOT_DELETED` / `NO_REDIRECT` / `DELETED` subsets for client sign-off.

### Row-count reconciliation

The per-row report catches drift on matched rows; it does not catch silent bulk loss. Reconcile aggregate counts against the pre-flight baseline (captured before any transform — see `references/pre-flight-sql.md`):

```sql
SELECT post_type, post_status, COUNT(*) FROM wp_posts GROUP BY post_type, post_status;
SELECT taxonomy, COUNT(*) FROM wp_term_taxonomy GROUP BY taxonomy;
SELECT COUNT(*) FROM wp_users;
```

Expected target counts = source counts − intentional drops (DNM deletes, orphan sweeps, discarded cohorts) + intentional adds. Any unexplained delta is a bug — investigate before sign-off.

### Recovery when Tier 3 destroys data

The dump is your rollback artifact. Drill:

```bash
wp db reset --yes
wp db cli < legacy-dump.sql
# rerun Tier 1–3 with the fix in place
```

If the bug only damaged a specific cohort (e.g. attachments) and the rest completed correctly, prefer targeted recovery (REST-based restore + manifest-driven registrar, see `references/media-recovery-checklist.md`) over a full re-import. Full re-import loses any editorial work done since the migration ran.

### The verifier itself is fallible

Verifier output is a heuristic comparison, not authoritative truth. Real bugs found in real verifiers:

- Ignoring `permalink_structure` and using `rewrite.slug` directly → many false MISMATCH rows.
- Tag-case mismatches treated as failures when the taxonomy is case-insensitive.
- "(deleted)" sentinel literals mistakenly compared as data.

Cross-check verifier MISMATCH counts against actual site behavior (`get_permalink()`, browser smoke tests) before chasing them as data issues.

---

## 10. Anti-Patterns

- **Migrate first, decide redirects later.** Deletes happen mid-transform; if a redirect destination isn't decided, the URL is permanently gone. Resolve all 301 targets before any transform runs.
- **Skip the pre-flight DB inspection.** You can't scope what you didn't measure — external-CDN images, shadow CPTs, plugin-stored redirects, and SVG/WebP surprises all hide until you query for them.
- **Programmatic `wp_insert_post()` for tens of thousands of records.** Triggers hooks, revisions, sanitization. Use direct DB INSERT (ID-preserving) + post-transform `wp_cache_flush()`.
- **Trust `_thumbnail_id` cleanup to detect orphan attachments.** Misses `<img wp-image-N>`, `"id":N` block attrs, ACF galleries, `_wp_attachment_metadata` inside other postmeta. Multi-source reference scan is mandatory.
- **Plugin redirects at scale.** PHP roundtrip per redirect; breaks on plugin upgrades. Ship at the edge.
- **Skip the dry-run.** Tier 3 transforms must be dry-run-able by default. The first apply of a new transform should follow a clean dry-run that the operator inspected.
- **Single-pass migration command.** Bundling Tier 1+2+3 in one CLI invocation means a failure mid-Tier-2 leaves you in an undefined state. Separate subcommands per step + a documented runbook is the auditable shape.
- **Delete attachments by ID without intersecting with references.** The single most damaging mistake. Always compute the live reference set first.
- **Sideload after the orphan sweep.** Run sideload BEFORE orphan detection, or freshly-imported external images get classified as orphans and dropped.
- **Treat verifier output as authoritative.** Cross-check with actual `get_permalink()` and browser smoke tests before chasing MISMATCHes as data issues.

---

## See Also

- `references/runbook.md` — ordered phase sequence for executing a migration, plus large-import tuning.
- `references/search-replace.md` — serialized-safe URL / domain rewrite (`wp search-replace`), multisite and block-URL gotchas.
- `references/pre-flight-sql.md` — runnable discovery SQL for sizing, scope, and recovery planning.
- `references/media-deep-dive.md` — reference scanner, ID preservation, recovery, sideload, image-format gotchas.
- `references/cli-flag-conventions.md` — CLI subcommand contract used across every transform/cleanup command.
- `references/media-recovery-checklist.md` — step-by-step recovery when attachments have been wrongly deleted.
- `references/redirect-source-priority.md` — full priority table for redirect-map source merging.
