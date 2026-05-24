# Pre-Flight DB Inspection — Discovery SQL

You cannot scope or de-risk a WordPress migration without first putting the legacy DB on a table and asking it questions. Run **all** of these before writing a single migration script. Capture the output in a discovery doc — it drives sizing, plugin scope, redirect strategy, and recovery planning.

Import the dump first (never query the source live):

```bash
wp db cli < /absolute/path/to/legacy-dump.sql
```

> Examples use the `wp_` prefix. Substitute the install's real prefix; on multisite use the per-site prefix `wp_<n>_`.

---

## 1. Volume + cohort sizing

```sql
-- Posts by type + status (drives transform vs sideload decisions)
SELECT post_type, post_status, COUNT(*) AS n
FROM wp_posts
GROUP BY post_type, post_status
ORDER BY post_type, post_status;

-- Attachments by MIME type (drives sideload scope + SVG / WebP plugin needs)
SELECT post_mime_type, COUNT(*) AS n
FROM wp_posts
WHERE post_type = 'attachment'
GROUP BY post_mime_type
ORDER BY n DESC;

-- Year-over-year content distribution (drives pre-pattern-era cohort detection)
SELECT YEAR(post_date) AS yr, post_type, COUNT(*) AS n
FROM wp_posts
WHERE post_status NOT IN ('auto-draft','trash')
GROUP BY yr, post_type
ORDER BY yr, post_type;
```

**Why year-over-year matters:** editorial conventions drift. A synced pattern or block convention introduced in a given year only appears on posts from that year onward; a naive "100% coverage expected" check flags older posts as failures. Detect the cohort boundary here so verification accounts for it.

**Keep this output as the reconciliation baseline.** Post-migration, re-run the by-type/by-status counts on the target and reconcile against these numbers (SKILL.md §9). Expected target = source − intentional drops + intentional adds; any unexplained delta is a bug.

---

## 2. Custom post types + taxonomies

```sql
-- Distinct post types (find shadow CPTs early)
SELECT post_type, COUNT(*) AS n
FROM wp_posts
GROUP BY post_type;

-- Taxonomies in use + term counts
SELECT tt.taxonomy,
       COUNT(DISTINCT tt.term_taxonomy_id) AS terms,
       COUNT(tr.object_id) AS relationships
FROM wp_term_taxonomy tt
LEFT JOIN wp_term_relationships tr ON tt.term_taxonomy_id = tr.term_taxonomy_id
GROUP BY tt.taxonomy
ORDER BY relationships DESC;

-- Termmeta coverage (matters if collapsing shadow CPTs into termmeta)
SELECT t.taxonomy, COUNT(DISTINCT tm.meta_key) AS distinct_keys, COUNT(*) AS rows
FROM wp_termmeta tm
JOIN wp_term_taxonomy t ON tm.term_id = t.term_id
GROUP BY t.taxonomy;
```

Look for: shadow CPTs (a `*-post` CPT mirroring a same-named taxonomy), taxonomies with 0 relationships (drop candidates), and termmeta keys that suggest a taxonomy is doing duty as a content store.

---

## 3. Users + authorship

```sql
-- Email collisions (wp_users.user_email is uniquely indexed)
SELECT user_email, COUNT(*) AS n
FROM wp_users
GROUP BY user_email
HAVING n > 1;

-- Roles in use (capability-based)
SELECT meta_value, COUNT(*) AS n
FROM wp_usermeta
WHERE meta_key = 'wp_capabilities'
GROUP BY meta_value;

-- Posts per author (find authorship-as-categorization patterns)
SELECT post_author, COUNT(*) AS n
FROM wp_posts
WHERE post_status = 'publish'
GROUP BY post_author
ORDER BY n DESC
LIMIT 20;
```

Decide BEFORE any transform: keep `wp_users` 1:1, or move authorship into a taxonomy (assign all posts to one editorial user, read the byline from an `author` taxonomy). If authors only categorize content and never log in, migrate them as a taxonomy — not as users.

---

## 4. Block + pattern inventory

```sql
-- First-block census (fast, approximate)
SELECT
  SUBSTRING_INDEX(SUBSTRING_INDEX(post_content, '<!-- wp:', -1), ' ', 1) AS first_block,
  COUNT(*) AS n
FROM wp_posts
WHERE post_status = 'publish' AND post_content LIKE '<!-- wp:%'
GROUP BY first_block
ORDER BY n DESC
LIMIT 30;

-- Full block-namespace census (accurate, slower)
SELECT DISTINCT
  REGEXP_SUBSTR(post_content, 'wp:[a-z0-9\\-]+/[a-z0-9\\-]+') AS block
FROM wp_posts
WHERE post_status = 'publish' AND post_content LIKE '%<!-- wp:%/%';

-- Synced patterns (wp_block CPT)
SELECT post_title, post_name, ID
FROM wp_posts
WHERE post_type = 'wp_block' AND post_status = 'publish';

-- Synced-pattern usage embedded in attrs.metadata.name
SELECT
  REGEXP_SUBSTR(post_content, '"metadata":\\{"name":"[^"]+"') AS pattern_name,
  COUNT(*) AS n
FROM wp_posts
WHERE post_status = 'publish' AND post_content LIKE '%"metadata":{"name":%'
GROUP BY pattern_name
ORDER BY n DESC;
```

Every custom block namespace (`old-vendor/*`) referenced in content must map to a counterpart on the new site (`new-vendor/*`) with attrs preserved. This census drives the block-rewrite scope and the post-launch cleanup commands.

---

## 5. Inline references + shortcodes

```sql
-- Shortcodes in use
SELECT
  REGEXP_SUBSTR(post_content, '\\[([a-z0-9_\\-]+)') AS shortcode,
  COUNT(*) AS n
FROM wp_posts
WHERE post_status = 'publish' AND post_content REGEXP '\\[[a-z0-9_\\-]+'
GROUP BY shortcode
ORDER BY n DESC
LIMIT 30;

-- oEmbed providers (each needs a plan: keep / migrate / strip)
SELECT meta_key, COUNT(*) AS n
FROM wp_postmeta
WHERE meta_key LIKE '_oembed_%'
GROUP BY meta_key
ORDER BY n DESC;
```

Each shortcode and oEmbed provider needs an explicit disposition. Some providers (Facebook/Instagram) require an app access token on the new site to keep resolving — inventory them now, not after cut-over.

---

## 6. Plugin-storage redirects (find them all)

Existing redirects hidden in plugin storage must be extracted **before** content transforms run, or the new site ships missing equity-bearing redirects.

```sql
-- Yoast Premium Redirects (3-key shape — read -base, it's authoritative)
SELECT option_name, LENGTH(option_value) AS bytes
FROM wp_options
WHERE option_name IN (
  'wpseo-premium-redirects-base',
  'wpseo-premium-redirects-export-plain',
  'wpseo-premium-redirects-export-regex'
);

-- Rank Math / Redirection / SEOPress plugin tables
SHOW TABLES LIKE 'wp_%redirect%';
SHOW TABLES LIKE 'wp_%seo%';

-- Generic option-key scan for plugin-managed redirects
SELECT option_name FROM wp_options
WHERE option_name REGEXP 'redirect|^safe_|^srm_|^rank_math.*redirect';
```

The Yoast `-base` key is authoritative; the `-export-*` keys are lagging snapshots. Extract from `-base`. See `redirect-source-priority.md` for merge precedence.

---

## 7. Permalink + URL surface

```sql
-- Permalink structure + key SEO options
SELECT option_name, option_value
FROM wp_options
WHERE option_name IN (
  'permalink_structure','siteurl','home',
  'page_on_front','page_for_posts','show_on_front',
  'category_base','tag_base'
);
```

Also capture indexed-URL volume from Search Console / the Yoast indexable table, plus the hreflang surface if multilingual. That number drives redirect-map coverage as a sign-off blocker.

Compare CPT permalink slugs (from registration) against `permalink_structure` to avoid the `/post/` verifier-bug class — a verifier that hardcodes `rewrite.slug` and ignores `permalink_structure` emits false-positive MISMATCH rows.

---

## 8. Image discovery (run before designing media migration)

The output decides whether you can REST-import, must rsync, need a sideload pipeline, or need an SVG-handling plugin.

```sql
-- Attachment surface by MIME type
SELECT post_mime_type, COUNT(*) AS n
FROM wp_posts
WHERE post_type = 'attachment'
GROUP BY post_mime_type;
-- SVG count > 0  → need safe-svg or equivalent in the plugin stack.
-- WebP count > 0 → imagick/GD version on the new host matters.
-- GIF count > 0  → decide whether animated frames survive resizing.

-- Attachment status breakdown (private items can't be REST-fetched)
SELECT post_status, COUNT(*) AS n
FROM wp_posts
WHERE post_type = 'attachment'
GROUP BY post_status;
-- post_status=private → /wp/v2/media/<id> returns 401, needs manifest fallback.
-- File URLs themselves are public — WP only blocks REST/frontend, not /uploads/.

-- _wp_attached_file + _wp_attachment_metadata presence
SELECT
  SUM(meta_key = '_wp_attached_file') AS has_path,
  SUM(meta_key = '_wp_attachment_metadata') AS has_meta,
  COUNT(DISTINCT post_id) AS attachments
FROM wp_postmeta
WHERE post_id IN (SELECT ID FROM wp_posts WHERE post_type = 'attachment');
-- Missing _wp_attachment_metadata → srcset breaks after restore. Regenerate.

-- Attachment ID range (informs autoincrement-collision risk at preserved IDs)
SELECT MIN(ID), MAX(ID), COUNT(*)
FROM wp_posts WHERE post_type = 'attachment';

-- Orphan candidates (no parent + no _thumbnail_id reference) — CANDIDATES ONLY
SELECT COUNT(*) FROM wp_posts p
WHERE post_type = 'attachment'
  AND post_parent = 0
  AND NOT EXISTS (
    SELECT 1 FROM wp_postmeta
    WHERE meta_key = '_thumbnail_id' AND meta_value = p.ID
  );
-- Many "orphans" are referenced via wp-image-N in post_content. ALWAYS
-- intersect with the full reference scanner (media-deep-dive.md) before dropping.
```

---

## 9. External CDN inventory (critical — easy to miss)

Images served from CDNs other than the local `uploads/` directory are invisible to standard attachment counters; they appear only by parsing `post_content`. Missing this surfaces a whole sideload pipeline mid-project, after transforms have started.

```sql
-- Distinct external image hosts referenced from post_content
SELECT DISTINCT REGEXP_SUBSTR(post_content, 'https?://[^/"\\)]+') AS host
FROM wp_posts
WHERE post_status = 'publish'
  AND post_content REGEXP '<img[^>]+src="https?://[^"]+'
LIMIT 50;

-- Per-host volume (drives effort estimate)
SELECT
  REGEXP_SUBSTR(post_content, 'src="https?://[^/]+') AS host,
  COUNT(*) AS posts
FROM wp_posts
WHERE post_status = 'publish'
  AND post_content REGEXP '<img[^>]+src="https?://'
GROUP BY host
ORDER BY posts DESC;

-- Cloudinary base64-ID pattern detection (needs decoding before sideload)
SELECT COUNT(*) FROM wp_posts
WHERE post_content REGEXP 'cloudinary\\.com/[^/]+/image/[^/]+/[A-Za-z0-9+/=]+';
```

For every distinct host: decide **keep external** (accept the CDN dependency) vs **sideload to uploads** (`media_sideload_image()` + rewrite `<img src>`). Provider-specific URL encodings (e.g. Cloudinary base64 IDs) must be decoded before sideload. See `media-deep-dive.md`.

---

## 10. Pre-delete reference-count check

Before any "delete attachments" decision, count references in surviving content for each candidate ID. Non-zero in **any** column = still referenced → skip + log, do not delete.

```sql
SELECT a.ID, a.post_title,
  (SELECT COUNT(*) FROM wp_posts
     WHERE post_status='publish'
       AND post_content REGEXP CONCAT('wp-image-', a.ID, '[^0-9]')) AS html_refs,
  (SELECT COUNT(*) FROM wp_posts
     WHERE post_status='publish'
       AND post_content REGEXP CONCAT('"id":', a.ID, '[^0-9]')) AS block_refs,
  (SELECT COUNT(*) FROM wp_postmeta
     WHERE meta_key='_thumbnail_id' AND meta_value=a.ID) AS thumb_refs
FROM wp_posts a
WHERE a.post_type='attachment' AND a.ID IN ( /* ids marked DNM */ );
```

This is the cheap pre-flight version. The runtime guard uses the full seven-source scanner in `media-deep-dive.md`, which also covers `attachment_id=N`, ACF galleries, filename matches, and custom image-meta keys.
