# Redirect Source Priority

When building a redirect map from multiple sources, conflicts on the source URL must resolve deterministically. The priority table below is the order used in real inventory-driven migrations.

## Priority table

| Priority | Source | When it applies |
|---|---|---|
| 1 | Inventory `migrate:new_url` | A `Migrate` row whose `New URL` differs from `Existing URL` |
| 2 | Inventory `build:new_url` | A `Build` row pointing at a yet-to-be-built URL on the new site |
| 3 | Inventory `dnm:redirect_column` | A `Do not migrate` row with an explicit `Redirect` value in the spreadsheet |
| 4 | Legacy plugin `yoast:regex` (optional) | Yoast Premium regex rules — only if including legacy redirects in the new map |
| 5 | Legacy plugin `yoast:plain` (optional) | Yoast Premium plain rules — same |
| 6 | Inventory `dnm:fallback_rule_<n>` | A `Do not migrate` row with empty `Redirect` — falls back to a per-prefix rule table (closest topical archive → parent → homepage) |

## Conflict resolution

Deduplicate by source URL. Lower priority number wins (1 beats 6). When two sources at the same priority produce the same destination, the duplicate is dropped silently and counted in a `duplicate_sources` log line.

When two sources at the same priority produce **different** destinations, that's a conflict — log it and refuse to export until the operator picks one. Surfacing conflicts is the point of having a priority table in the first place.

## Fallback rule table for DNM rows

Each retired URL prefix on the source site needs a fallback target. Example shape (encode in PHP, not the spreadsheet):

```php
private const FALLBACK_RULES = [
    [ 'rule_id' => 2,  'match' => '#^/industries/healthcare#', 'target' => '/business/industries/healthcare/' ],
    [ 'rule_id' => 8,  'match' => '#^/resource/ebook/#',       'target' => '/ebooks/' ],
    [ 'rule_id' => 26, 'match' => '#^/resource/webinar/#',     'target' => '/webinars/' ],
    // … one rule per legacy URL prefix
];
```

When a DNM row has empty `Redirect`, walk the rule table; first match wins, log which rule fired (`fallback_rule_<n>`).

## Including legacy plugin redirects

Trade-off:

- **Include them** if the legacy site has years of curated redirects representing real link equity (404s avoided, hreflang consistency, etc.).
- **Exclude them** if they include known loops, broken targets, or migration-irrelevant routes.

Including Yoast Premium Redirects often introduces dozens to hundreds of detected loops because both the legacy and the new redirect table can chain. Detect loops at export time:

1. Build a forward-edge graph: `source → destination`.
2. For each source, walk the graph up to N=10 hops.
3. If a node repeats, it's a loop. Log and warn (or refuse to export until resolved).

Loops also include "back-and-forth" pairs: `A → B` and `B → A` from different source tables.

## Output format per host

### WP Engine — Web Rules Engine bulk import

Space-separated `source destination`. Status code applied globally at import time (typically 301):

```
/old-path/ /new-path/
/another-old/ /another-new/
```

`.txt` or `.csv` file, no header row.

### Pantheon — nginx config

```
location = /old-path/ { return 301 /new-path/; }
```

Or with pattern matching:

```
location ~ ^/resource/ebook/(.+)$ { return 301 /ebooks/$1; }
```

### Generic CSV (human review / audit)

```csv
Source URL,Destination URL,Status Code
/old-path/,/new-path/,301
```

Header included. Useful for client sign-off — operators can spot-check before bulk import.
