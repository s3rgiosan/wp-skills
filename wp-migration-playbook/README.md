# wp-migration-playbook

Part of [wp-skills](../README.md) — Claude Code skills for WordPress developers.

A Claude Code skill that brings an opinionated, production-tested playbook for WordPress content migrations into your sessions. Covers WP→WP and other-system→WP migrations end-to-end: an ordered execution runbook, pre-flight DB inspection (runnable discovery SQL), serialized-safe URL/domain rewrite, multisite consolidation mechanics, inventory + disposition, custom migration plugin architecture (Tier 1–3 + idempotent gating), content type and taxonomy migration, user migration, the hard parts of media migration (ID preservation, intersect-before-delete, REST-based recovery, manifest-based registration, image-format gotchas), redirects (host-level, Yoast storage shape), operational gotchas, row-count reconciliation, cutover, and recovery patterns.

---

## Installation

### Via Claude Code plugin marketplace (recommended)

```
/plugin marketplace add s3rgiosan/wp-skills
/plugin install wp-migration-playbook@s3rgiosan-wp-skills
```

Or wire `wp-migration-playbook@s3rgiosan-wp-skills` into `settings.json` under `enabledPlugins` (see the [root README](../README.md#install-via-claude-code-plugin-marketplace-recommended) for the full snippet).

### Via shell script (fallback)

```bash
git clone https://github.com/s3rgiosan/wp-skills.git
cd wp-skills/wp-migration-playbook

# Default → ~/.claude
bash install.sh

# Custom Claude config dir (override via env var)
CLAUDE_CONFIG_DIR=~/.some-other-dir bash install.sh
```

Uninstall:

```bash
bash uninstall.sh                              # → ~/.claude
CLAUDE_CONFIG_DIR=~/.some-other-dir bash uninstall.sh # → custom dir
```

---

## Usage

Open any Claude Code session and ask naturally:

```
"What's the order of operations for running this migration?"
"What should I query in the legacy DB before scoping this migration?"
"How do I rewrite all URLs from the old domain without corrupting serialized data?"
"Plan a migration from a Laravel app to WordPress — what's the shape?"
"How do I migrate 100K posts from WP multisite to a standalone install?"
"Migration deleted attachments by mistake — how do I recover without downtime?"
"What's the redirect map source priority for an inventory-driven migration?"
"How should I structure the migration plugin's CLI commands?"
"Why is wp db import failing with SOURCE syntax errors?"
```

The skill triggers on any WP-migration topic and pulls the relevant section into the response. Seven deep-reference files cover the execution runbook, pre-flight discovery SQL, serialized-safe URL rewrite, the media deep-dive, CLI flag conventions, the media-recovery checklist, and redirect source priority.

---

## What's in the playbook

| Section | Covers |
|---|---|
| **1. Pre-flight** | DB inspection (runnable discovery SQL), migration shape decision (small/large/system→WP), clone-and-transform invariant, large-import tuning, serialized-safe URL/domain rewrite, multisite consolidation mechanics, staging environment |
| **2. Inventory + disposition** | Spreadsheet-driven vs uniform-cohort, the three disposition classes |
| **3. Plugin architecture** | Tier 1–3 + cleanup, the four invariants, cross-step gates, CLI flag conventions |
| **4. Content types + taxonomies** | Unify sibling tables, shadow CPT → termmeta, CPT remap, taxonomy consolidation |
| **5. User migration** | Custom-role collapse, generic editorial owner + author taxonomy, email collisions |
| **6. Media migration** | Five sub-problems, ID preservation, intersect-before-delete, REST + manifest recovery, sideload for cross-CDN, image-format gotchas, metadata regeneration, orphan detection |
| **7. Redirects** | Host-level over plugin-level, source priority, Yoast Premium Redirects storage shape |
| **8. Operational gotchas** | `wp db cli` workaround, persistent cache flush discipline, Pantheon SSH, `wp_parse_url` URL-path trap, permalink_structure verifier trap, PSR-4 namespace collision |
| **9. Verification + recovery** | Verify CSV, row-count reconciliation, rollback drill, fallible verifier |
| **10. Anti-patterns** | The ten most common mistakes |

---

## References

The skill ships seven deep-reference files that load on demand:

- `runbook.md` — ordered phase sequence for executing a migration (import → pre-flight → URL rewrite → inventory → redirects → transforms → verify → cutover → recovery), plus large-import tuning.
- `pre-flight-sql.md` — runnable discovery SQL for sizing and scope: volume/cohort, CPTs/taxonomies, users, block + pattern census, shortcodes/oEmbed, plugin-stored redirect hunt, permalink surface, image inventory, external-CDN inventory, pre-delete reference count.
- `search-replace.md` — serialized-safe URL/domain rewrite with `wp search-replace`: flags, replacement order, multisite, escaped-slash block-URL and GUID-column gotchas.
- `media-deep-dive.md` — the seven-source reference scanner, ID-preservation mechanism + collision guard, two-tier recovery, sideload pipeline, image-format gotchas (SVG / WebP / animated GIF / oversized / filename collisions / EXIF), orphan detection.
- `cli-flag-conventions.md` — CLI subcommand contract used across every transform / cleanup command. Counter semantics, skip reasons, failure reasons, example skeleton.
- `media-recovery-checklist.md` — step-by-step recovery when attachments have been wrongly deleted. Includes the dangling-reference scanner.
- `redirect-source-priority.md` — full priority table for redirect-map source merging plus per-host output formats.

---

## Philosophy

These patterns are opinionated and earned. Every recommendation in the playbook either:

1. Comes from a production migration that ran successfully, or
2. Comes from a production incident that taught the team to do it differently.

The single biggest lesson across every migration: **never mutate before you measure.** Almost every incident — destructive or merely expensive — traces back to transforming or deleting content before querying the legacy DB to learn what that operation actually touches. The discipline that prevents it is three-part: pre-flight DB inspection, intersect-before-delete, and dry-run-by-default.

### Lessons the playbook encodes

| Incident | Root cause | Where the skill guards it |
|---|---|---|
| **Attachments deleted with files on disk** | Bulk-deleted DNM attachments without intersecting the live reference set; `wp_delete_post( $id, true )` deletes the file too | §6 intersect-before-delete · `media-deep-dive.md` 7-source scanner · `pre-flight-sql.md` §10 |
| **Homepage deleted by a DNM pass** | `wp_parse_url('/?p=1', PHP_URL_PATH)` returns `/`, so `/?p=N` URLs matched the homepage ID and got deleted | §8 `wp_parse_url` path-vs-query guard |
| **Sideload pipeline discovered mid-migration** | External-CDN images (Fastly / Cloudinary / etc.) are invisible to attachment counters; only `post_content` parsing finds them | §1 pre-flight · `pre-flight-sql.md` §9 external-CDN inventory |
| **New site shipped missing redirects** | Read Yoast's lagging `-export-*` snapshot instead of the authoritative `-base` key | §7 Yoast 3-key shape · `pre-flight-sql.md` §6 redirect hunt |
| **Hundreds of false MISMATCH rows** | Verifier ignored `permalink_structure` and derived URLs from `rewrite.slug` | §8 permalink trap · §9 fallible-verifier cross-check |

All five share the same fix: **measure first.** The playbook makes the measurement step cheap (runnable SQL) and the destructive steps safe (gated, logged, reversible).

---

## License

[MIT](../LICENSE)
