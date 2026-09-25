# Component Vulnerability Lookup

Phase 2 sweep. Every plugin, theme and the core version is looked up at the **production** version. The lookup produces candidates; phase 4 decides which are findings.

**No CVE does not mean no vulnerability.** Premium, custom and committed code often has no public advisory record at all. A component with "no data" still needs the depth its bucket calls for (a full audit or a hotspot pass). Committed premium code with an empty advisory record can hold unauthenticated Criticals.

---

## 1. Sources

| Source | Endpoint | Notes |
|---|---|---|
| **WPVulnerability** (primary) | `https://www.wpvulnerability.net/plugin/<slug>/`, `/theme/<slug>/`, `/core/<version>/` | Free, no key. Returns every advisory on record for the slug with version operators, CVSS, sources and a `closed` flag. Unknown slugs return `"name": null`. |
| **Wordfence Intelligence feed** (fallback) | `https://www.wordfence.com/api/intelligence/v3/vulnerabilities/production` | Needs a free API key (`Authorization: Bearer <key>`). A large download: fetch it once, outside the project, and pass it with `--wordfence-feed`. The script reads `software[].affected_versions`; if the feed format changes, check the Wordfence Intelligence documentation. |
| **Patchstack** (optional extra) | `https://patchstack.com/database/api/v2/product/plugin/<slug>/<version>` | Needs an API key (requests without one return `401 Unauthorized`); see Patchstack's API documentation for access. Not wired into the script: when the owner has a key, query it for components with no WPVulnerability data and treat hits as candidates. |
| **wp.org plugin API** | `https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=<slug>` | Current version, last update, author, closed status. `Plugin not found.` means the slug is unclaimed. |
| **wp.org theme API** | `https://api.wordpress.org/themes/info/1.2/?action=theme_information&request[slug]=<slug>` | Same for themes; `Theme not found` means unclaimed. |

```bash
bash scripts/vuln-lookup.sh --inventory "$OUT/inventory/inventory.json" \
  --prod-versions "$OUT/prod-versions.txt" --out "$OUT/vulns"
```

`prod-versions.txt` holds the owner's production list, one line per component: `plugin acme-forms 3.2.0`, `theme acme-theme 2.0.0`, `core wordpress 6.8.0`. Raw responses are cached in `<out>/raw/`, so a rerun does not hit the APIs again. `<out>/candidates.tsv` is the authoritative candidate list (every affecting hit and every supply-chain signal, sorted by severity): every row must end up as a finding or under Verified false with a reason (`subagent-briefs.md` → Completeness).

## 2. Matching a version against a range

WPVulnerability operators: `min_operator` `ge` / `gt`, `max_operator` `lt` / `le`, plus `unfixed`. The script compares versions numerically per segment (`2.10` is greater than `2.9`). A record with no operators is counted as `unmatched_ranges` and needs a manual read of the advisory.

**Match against the production version.** A local checkout one minor behind production can match advisories production has already fixed, and the reverse. When the owner has not supplied production versions, say "matched against the local version; production unconfirmed" in every lookup finding.

## 3. Free and premium slugs

A premium build (`acme-forms-pro`) often shares code with its free plugin (`acme-forms`), and advisories are usually filed against the free slug. They apply to the premium build only sometimes.

- The script queries both: the premium slug, and the free slug derived by removing `-pro`, `-premium`, `-plus`, `-business`, `-agency`, `-developer`, `-elite` or `-unlimited`. Pass `--premium-map` for pairs it cannot derive (`acme-forms-suite acme-forms`).
- **First, check the advisory is about this product.** Vulnerability databases sometimes attach an advisory to the wrong slug. Read the advisory's title, description and affected-product name before anything else. Example (fabricated): an advisory listed under `acme-slider` whose description says "the Example Logo Carousel plugin before 2.1 allows stored XSS" describes a different product; record it under verified false as "advisory misattributed to this slug", not as "function not found".
- Hits under the free slug are marked **assumed shared code**. They are candidates until the vulnerable function is found in the premium source (grep for the function or route named in the advisory). Found: the finding stands, cite the file. Not found: record it under verified false with the grep that proved it.
- **Depth for hits below Critical and High:** with premium source available, trace at least one per component and apply the result to hits with the same root cause; the rest stay "assumed shared code, not traced" and go under open questions. Without source, mark every one assumed and list them under open questions. Critical and High hits are always traced (SKILL.md → Verify).
- **Supply-chain signals.** `vulns.md` opens with advisories whose text or CWE suggests a backdoor, injected or malicious code, a compromised or sold plugin, or hijacked updates. Treat each as a `vendor-compromise.md` candidate even when the version range does not match: a compromised vendor's other products and premium lines are suspect too.
- `vulns.md` sorts the affecting table by severity, then CVSS, across the whole project, so the worst hit is near the top whatever component produced the most rows.

## 4. Version-line sanity check

Before trusting a range match, confirm the installed version and the advisory speak the same numbering. A premium product can run `2.x` while its free namesake is on `4.x`; a range `< 3.5` then "matches" `2.0` for no reason.

The script flags:

- **installed major differs from the slug's current wp.org major**: confirm the same product and line;
- **installed ahead of wp.org**: a fork, a premium build, or a namesake;
- **custom component with advisories under its slug**: almost always a namesake on wp.org.

Resolve each flag by reading the advisory (product name, affected file or route) against the installed source, and write the result into the finding.

## 5. Bundled libraries

Plugins and themes ship their own copies of front-end and PHP libraries (PDF viewers, sliders, lightboxes, chart libraries, markdown parsers, older jQuery plugins). These have their own advisories, and nothing updates them but the component's vendor. The scan runs across **every** component, including lookup-only managed components: `scripts/bundled-libs.sh` with the signature table in `references/bundled-libraries.md`. The recipes below are a manual complement for libraries the table does not cover yet (add a row when you find one).

```bash
# Version banners in shipped JS and CSS (outside node_modules)
grep -rEo --include='*.js' --include='*.css' "(@version|v)[ ]?[0-9]+\.[0-9]+(\.[0-9]+)?" wp-content/plugins wp-content/themes \
  | grep -v node_modules | sort | uniq -c | sort -rn | head -50
# Common library files
find wp-content/plugins wp-content/themes -type f \( -name 'pdf.js' -o -name 'pdf.worker*.js' -o -name '*lightbox*.js' -o -name '*slider*.js' -o -name '*carousel*.js' \) \
  -not -path '*/node_modules/*'
```

Look each library and version up in the ecosystem's advisory source (the library's GitHub security advisories, or `npm audit` on a scratch `package.json` outside the project that pins that exact version). Rate by reachability: a vulnerable viewer or lightbox that renders user-uploaded files on the front end is not the same as one used only in an admin preview. The theme skill's `references/theme-security-checklist.md` §15 covers bundled libraries inside themes.

## 6. Staleness, closed plugins, slug ownership

From the wp.org lookups:

| Signal | Meaning | Typical rating |
|---|---|---|
| **Closed** on wp.org or in WPVulnerability (`closed`, `closed_reason`) | No further updates through wp.org; closure is often for a security issue | Medium to High by reason; replace or remove |
| **Stale** (no wp.org update in over two years) | Unmaintained; future advisories will not be fixed | Low to Medium, higher with an open advisory |
| **Unclaimed slug and no `Update URI`** on a non-wp.org plugin or theme | Anyone can publish that slug on wp.org at a higher version, and WordPress offers it as an update | Medium; High when auto-updates are on. See plugin `references/standards-checklist.md` → Folder slug ownership |
| **Claimed slug, local copy not from wp.org, no `Update URI`** | WordPress offers the wp.org plugin's updates to an unrelated local copy | Medium; confirm it is not the same product |

Fix for slug findings: `Update URI: false` (or the vendor's real update URL) in the plugin header or `style.css`. For a third-party component, this is a local edit to vendor files; follow the ownership table (a committed copy is already a fork, so the header line is the least bad patch; recommend the vendor adds it).

## 7. Core

Core is looked up at `/core/<version>/`. Every advisory returned applies to that version. Rate by the fixed-in version and the auto-update status: a site on a patched minor line with auto-updates on is a note; a site pinned to an old line with auto-updates off is a finding (`G-`), with the constant that disables them named from `prod-check.sh` output.

## 8. PHP

Pass the production PHP version (`--php-version`, or the inventory's `platform.php_production`). The script reads `https://www.php.net/releases/active.php`: a branch listed there is supported (tagged `security`: security fixes only), a branch missing from it is end of life. See `inventory.md` §6 for rating.

## 9. Recording results

In the component's subsection, the identity line carries the lookup summary (`lookup: 2 affecting, 1 assumed shared code, verified in source: P-acme-forms-pro-H1`). In the inventory appendix, every component has a lookup result, including "no data".
