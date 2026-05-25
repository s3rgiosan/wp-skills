# Migration Runbook — Ordered Phases

The rest of the skill is organized by topic. A migration is *executed* in order. This is the phase sequence — each phase gates the next. Adapt step counts to the migration shape (§1 of SKILL.md), but never reorder: every destructive phase depends on a measurement phase that runs first.

> **Golden rule:** never run a phase whose inputs the previous phase didn't produce. Redirect export gates DNM-delete; inventory match gates every transform; pre-flight gates everything.

---

## Phase 0 — Provision

- [ ] Staging environment mirrors prod (same host, PHP version, active plugins).
- [ ] Legacy site stays reachable through the recovery window.
- [ ] Migration plugin installed on staging; never on the customer-facing site.

## Phase 1 — Import the dump (clone-and-transform)

- [ ] Pull the legacy DB dump — this is also the rollback artifact.
- [ ] Import a **copy**, never mutate the source:

```bash
wp db cli < /absolute/path/to/legacy-dump.sql   # not `wp db import` (see SKILL.md §8)
```

- [ ] Large dumps: tune before import — see `## Large imports` below.
- [ ] Copy `wp-content/uploads/` (rsync/tarball) if files travel with the DB. On a multisite source, subsite files live under `wp-content/uploads/sites/<n>/` — move them to `wp-content/uploads/` on the standalone target.
- [ ] Multisite subsite → standalone: remap the per-site prefix to bare `wp_` — see `## Multisite subsite → standalone: table remap` below.

## Phase 2 — Pre-flight inspection (measure before you mutate)

- [ ] Run **every** query in `pre-flight-sql.md`; capture output in a discovery doc.
- [ ] Row-count baseline (source of truth for reconciliation in Phase 8).
- [ ] Decide migration shape, redirect strategy, media strategy, user strategy from the output.
- [ ] Flag surprises: external-CDN images, SVG/WebP, shadow CPTs, plugin-stored redirects, private attachments.

## Phase 3 — URL / domain rewrite (WP→WP)

- [ ] Serialized-safe search-replace for domain/path changes — see `search-replace.md`.
- [ ] Always `--dry-run` first; skip the GUID column; `--recurse-objects`.

## Phase 4 — Inventory + match (Tier 1)

- [ ] Import the disposition source (spreadsheet → `<prefix>_migration_inventory`), or encode uniform-cohort dispositions in code.
- [ ] Run `inventory match` — join inventory to legacy `wp_posts.ID` by URL.
- [ ] **Gate:** unmatched-row count must resolve (or be signed off) before any transform.

## Phase 5 — Redirect map (Tier 2, output only)

- [ ] Build the priority-merged redirect map (`redirect-source-priority.md`).
- [ ] Export to the host's format. Log `step='redirects' action='exported' dry_run=0`.
- [ ] **Gate:** this log marker is what unlocks Phase 6 DNM-delete (cross-step gate, SKILL.md §3).

## Phase 6 — Transforms (Tier 3, destructive)

Run each subcommand dry-run first, inspect, then `--apply`. Order within Tier 3:

1. [ ] CPT remap / taxonomy consolidation (non-deleting first).
2. [ ] Media: sideload external CDN images **before** any orphan sweep.
3. [ ] Media: intersect-before-delete on every attachment drop (SKILL.md §6).
4. [ ] DNM delete (gated by Phase 5 redirect marker).
5. [ ] Orphan sweep (after sideload).
- [ ] `wp cache flush` between bulk steps (persistent object cache, SKILL.md §8).

## Phase 7 — Media metadata

- [ ] `wp_generate_attachment_metadata()` for restored/sideloaded attachments, or `wp media regenerate --yes` in bulk.

## Phase 8 — Verify + reconcile

- [ ] Expected-vs-actual report per inventory row (SKILL.md §9).
- [ ] **Row-count reconciliation:** source baseline (Phase 2) vs target `COUNT(*)` per post_type / taxonomy / users. Investigate every delta.
- [ ] Cross-check MISMATCH rows against `get_permalink()` + browser smoke tests (verifier is fallible).
- [ ] Filter MISMATCH / NOT_DELETED / NO_REDIRECT / DELETED for client sign-off.

## Phase 9 — Cutover

- [ ] Final delta sync if content changed on legacy since the migration snapshot.
- [ ] Ship redirects at the edge (host rules engine / nginx / CDN).
- [ ] Lower DNS TTL ahead of time; flip DNS after sign-off.
- [ ] Provision SSL for the new host before flip.
- [ ] Purge: host page cache, object cache (`wp cache flush`), CDN edge cache.
- [ ] Warm critical paths; smoke-test homepage + top templates + a sample of redirected URLs.
- [ ] Keep legacy reachable through the recovery window.

## Phase 10 — Recovery (if a destructive phase misfired)

- [ ] Targeted recovery if one cohort broke (e.g. attachments) — `media-recovery-checklist.md`.
- [ ] Full reset only as last resort (loses post-migration editorial work):

```bash
wp db reset --yes
wp db cli < legacy-dump.sql
# rerun Tier 1–3 with the fix
```

---

## Large imports

Tune before importing a multi-GB dump, or extended INSERTs fail and the import crawls:

- **`max_allowed_packet`** — raise on the server (e.g. `64M`–`512M`); WP extended INSERTs exceed the default `16M` on big tables.
- **`--single-transaction`** at dump time (InnoDB) — consistent snapshot, no table locks.
- **Disable keys during load** for very large tables (`ALTER TABLE ... DISABLE KEYS` / re-enable after), or import with `SET autocommit=0; ... COMMIT;`.
- **`innodb_buffer_pool_size`** matters on the import host; small pools make large imports thrash.
- On managed hosts (WP Engine / Pantheon) you can't tune MySQL — chunk the dump per-table or use the host's import tooling. SSH into the container for Pantheon (SKILL.md §8).

---

## Multisite subsite → standalone: table remap

Direct-DB import of one subsite (`N`) from a network into a standalone install means renaming the per-site tables to the bare `wp_` prefix and reconciling the network-shared user tables. Run this on the imported copy (Phase 1), before pre-flight inspection.

### 1. Which tables are which

| Group | Tables | Action |
|---|---|---|
| **Per-site** (prefix `wp_<n>_`) | `posts`, `postmeta`, `terms`, `term_taxonomy`, `term_relationships`, `termmeta`, `comments`, `commentmeta`, `options`, `links` | Rename `wp_<n>_*` → `wp_*` |
| **Network-shared** (bare `wp_`) | `wp_users`, `wp_usermeta` | Keep — but fix per-site meta keys (step 3) |
| **Network-only** | `wp_blogs`, `wp_blogmeta`, `wp_site`, `wp_sitemeta`, `wp_signups`, `wp_registration_log` | Drop / don't import — meaningless on standalone |

### 2. Rename the per-site tables (example: subsite `5`)

The standalone target's bare `wp_*` core tables come from the network's *primary* site — drop those first (or import the subsite into an empty DB), then rename:

```sql
DROP TABLE IF EXISTS
  wp_posts, wp_postmeta, wp_terms, wp_term_taxonomy, wp_term_relationships,
  wp_termmeta, wp_comments, wp_commentmeta, wp_options, wp_links;

RENAME TABLE
  wp_5_posts              TO wp_posts,
  wp_5_postmeta           TO wp_postmeta,
  wp_5_terms              TO wp_terms,
  wp_5_term_taxonomy      TO wp_term_taxonomy,
  wp_5_term_relationships TO wp_term_relationships,
  wp_5_termmeta           TO wp_termmeta,
  wp_5_comments           TO wp_comments,
  wp_5_commentmeta        TO wp_commentmeta,
  wp_5_options            TO wp_options,
  wp_5_links              TO wp_links;
```

`wp_users` / `wp_usermeta` are already bare-prefixed and shared — leave them in place.

### 3. Reconcile per-site meta + option keys

Capabilities, user level, and the roles option are stored with the subsite prefix baked into the **key**, not just the table. After the rename they must lose the `_<n>_` segment or the standalone site can't read roles:

```sql
UPDATE wp_usermeta SET meta_key = 'wp_capabilities' WHERE meta_key = 'wp_5_capabilities';
UPDATE wp_usermeta SET meta_key = 'wp_user_level'   WHERE meta_key = 'wp_5_user_level';
UPDATE wp_options  SET option_name = 'wp_user_roles' WHERE option_name = 'wp_5_user_roles';
```

### 4. Prune orphaned users (optional)

Network `wp_users` holds every user across all sites. On standalone you usually want only users who had a role on subsite `N`. Either delete users with no `wp_capabilities` row after step 3, or collapse all authorship to a generic editorial user (SKILL.md §5). Resolve email collisions first (`pre-flight-sql.md` §3).

Keep only users who hold a capability on this site (run after step 3, which renamed the key to `wp_capabilities`):

```sql
-- Preview who would be removed
SELECT u.ID, u.user_login, u.user_email
FROM wp_users u
WHERE NOT EXISTS (
  SELECT 1 FROM wp_usermeta m
  WHERE m.user_id = u.ID AND m.meta_key = 'wp_capabilities'
);

-- Delete the orphaned usermeta first (FK-less, so order is manual), then the users
DELETE m FROM wp_usermeta m
LEFT JOIN wp_usermeta cap
  ON cap.user_id = m.user_id AND cap.meta_key = 'wp_capabilities'
WHERE cap.user_id IS NULL;

DELETE u FROM wp_users u
LEFT JOIN wp_usermeta cap
  ON cap.user_id = u.ID AND cap.meta_key = 'wp_capabilities'
WHERE cap.user_id IS NULL;
```

Do not prune if posts are still authored by those users — reassign authorship (or collapse to a generic editorial user) first, or the posts orphan. Check with `pre-flight-sql.md` §3 "posts per author" before deleting.

### 5. Drop multisite from the target config

Remove `MULTISITE`, `SUBDOMAIN_INSTALL`, `DOMAIN_CURRENT_SITE`, `PATH_CURRENT_SITE`, `SITE_ID_CURRENT_SITE`, `BLOG_ID_CURRENT_SITE`, and `WP_ALLOW_MULTISITE` from the standalone `wp-config.php`.

### 6. Then continue

Run URL rewrite (Phase 3) against the now-flat `wp_*` tables, then pre-flight counts, inventory, and transforms as normal.

