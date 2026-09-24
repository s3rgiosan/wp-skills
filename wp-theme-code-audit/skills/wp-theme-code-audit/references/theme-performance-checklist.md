# Theme Performance Checklist

A theme runs on every front-end request, so its performance findings apply site-wide. This file covers what is specific to themes: asset loading, fonts, images, template queries and `theme.json` weight. Server-side work the theme does outside templates (autoloaded options, transients, cron, HTTP calls, cache thrashing, custom tables) uses the plugin skill's `performance-checklist.md`, including its severity heuristic.

Measure where you can. On an environment, a front-end page load with the browser's network panel (or `curl -s https://example.com/ | grep -oE '<(script|link)[^>]+>' | wc -l`) gives real counts for the report; without one, derive them from enqueue code and say they are traced-only.

**Running the Detect commands.** They are written as `grep -R ... .` / `find .` for readability. Run them over the scoped file list from SKILL.md → Discover (`srcgrep`), or exclude `node_modules`, `vendor`, `dist` and `build`, so build output never produces hits or counts.

---

## 1. Enqueue scope: global vs per-block

**Detect:**
```bash
grep -RnE "add_action\(\s*['\"](wp_enqueue_scripts|enqueue_block_assets)['\"]" --include="*.php" . -A15 | grep -E "wp_enqueue_(script|style)|is_(singular|page|front_page|archive)|has_block"
grep -RnE "should_load_separate_core_block_assets|wp_enqueue_block_style" --include="*.php" .
grep -RnE "\"(style|viewStyle|script|viewScript|viewScriptModule|editorScript|editorStyle)\"" --include="block.json" .
```

| Issue | Severity | Fix |
|---|---|---|
| One large theme stylesheet or bundle enqueued on every page, containing styles for blocks and templates that appear on few pages | Low (Medium if > ~150 KB compressed) | Split per block: `wp_enqueue_block_style( 'core/<block>', ... )` for core block overrides; `style` / `viewScript` / `viewScriptModule` in the theme's own `block.json` so core enqueues them only when the block renders |
| Classic or hybrid theme not opting into separate core block assets | Low | `add_filter( 'should_load_separate_core_block_assets', '__return_true' );` (block themes load core block styles on demand already) |
| Block front-end JS registered as `script` (loads in the editor and front end) when only `viewScript` / `viewScriptModule` is needed | Low | Move to `viewScript` / `viewScriptModule` |
| Front-end assets enqueued in `enqueue_block_assets` without an `is_admin()` split, or editor assets loaded on the front end | Low | Use the right hook for each surface |
| Interactivity API store bundled into a global script | Low | `viewScriptModule` per block; core loads modules only for rendered blocks |

---

## 2. Unconditional heavy scripts

Animation libraries (GSAP and its plugins), sliders and carousels, lightboxes, map SDKs, video players and icon loaders enqueued on every page for a component used on a few.

**Detect:**
```bash
grep -RniE "gsap|scrolltrigger|swiper|slick|splide|glide|flickity|lottie|three\.|mapbox|leaflet|youtube|vimeo|fontawesome" --include="*.php" --include="*.js" --include="*.json" . | grep -v node_modules
```

**Verify.** For each, find the enqueue and its condition, then count the templates or blocks that use it. **Severity:** a library over ~50 KB compressed loaded site-wide for one template: **Medium**; smaller or conditionally loaded: **Low**. **Fix:** make it a dependency of the block that needs it (`viewScript` with the library as a registered dependency), or gate the enqueue on `has_block()` / `is_page_template()`; load deferred (`wp_enqueue_script( ..., [ 'strategy' => 'defer', 'in_footer' => true ] )`).

---

## 3. Fonts

**Detect:**
```bash
jq '.settings.typography.fontFamilies[]? | {name, fontFace: [.fontFace[]? | {fontWeight, fontStyle, fontDisplay, src}]}' theme.json
grep -RnE "fonts\.(googleapis|gstatic)\.com|use\.typekit\.net|@import" --include="*.php" --include="*.css" --include="*.scss" --include="*.json" . | grep -v node_modules
find . \( -name "*.woff2" -o -name "*.woff" -o -name "*.ttf" -o -name "*.otf" \) -not -path "*/node_modules/*" | wc -l
```

| Issue | Severity | Fix |
|---|---|---|
| Remote font CSS loaded render-blocking in `<head>` (Google Fonts or Adobe Fonts `<link>` / `@import`) | Medium | Self-host with `theme.json` `fontFace` (core prints the `@font-face` rules), or preconnect + `display=swap` if remote is required |
| `fontFace` entries without `fontDisplay` (core defaults to `fallback`) or `@font-face` in CSS without `font-display` | Low | Set `fontDisplay: "swap"` or `"fallback"` deliberately |
| Every weight and style of a family shipped when two are used | Low | Remove unused faces, or use a variable font with one file |
| TTF / OTF served to browsers | Low | WOFF2 |
| Remote fonts on a site operating under consent rules | `[DECISION]` for the owner (privacy) | Self-host |

---

## 4. Images

**Detect:**
```bash
grep -RnE "<img\s" --include="*.php" . | grep -vE "wp_get_attachment_image|the_post_thumbnail"
grep -RnE "add_image_size\(" --include="*.php" .
grep -RnE "wp_get_attachment_image(_src)?\(|the_post_thumbnail\(|get_the_post_thumbnail\(" --include="*.php" .
grep -RnE "loading=|fetchpriority=|wp_img_tag_add_loading_optimization_attrs|wp_omit_loading_attr_threshold" --include="*.php" .
find assets images -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" \) -size +300k 2>/dev/null
```

| Issue | Severity | Fix |
|---|---|---|
| Hand-built `<img>` tags for attachments (no `srcset`, `sizes`, `width`/`height`, `loading`, `decoding`) | Low (Medium on image-heavy templates) | `wp_get_attachment_image()` with a registered size; core adds `srcset`, dimensions, `loading="lazy"` and `fetchpriority="high"` on the likely LCP image |
| Hero / LCP image forced to `loading="lazy"` | Medium | Let core decide, or pass `'fetchpriority' => 'high', 'loading' => false` for the hero |
| `full` size requested where a smaller registered size fits | Low | Register and request an appropriate size |
| Many `add_image_size()` calls for sizes no template uses | Low (every upload generates every size) | Remove unused sizes |
| Theme-shipped images over ~300 KB, or PNG photos | Low | Compress; WebP/AVIF |
| Missing `width` / `height` on theme images | Low (layout shift) | Set dimensions |

---

## 5. Queries in templates

Templates, template parts, block render files, patterns and shortcodes that run their own queries.

**Detect:**
```bash
grep -RnE "new WP_Query\(|get_posts\(|query_posts\(|get_pages\(|get_terms\(|get_users\(" --include="*.php" .
grep -RnE "['\"](posts_per_page|numberposts)['\"]\s*=>\s*-1|['\"]nopaging['\"]\s*=>\s*true" --include="*.php" .
grep -RnE "['\"]orderby['\"]\s*=>\s*['\"]rand['\"]" --include="*.php" .
grep -RnE "query_posts\(" --include="*.php" .
```

| Issue | Severity | Fix |
|---|---|---|
| `posts_per_page => -1` or `nopaging` on a front-end template | High on content that grows (plugin skill performance severity heuristic) | Explicit limit and pagination |
| `query_posts()` | Medium (replaces the main query, breaks pagination and conditionals, runs a second query) | `pre_get_posts` for the main query, `WP_Query` for secondary loops |
| Secondary query in a part that renders on every page (header mega menu, footer "latest posts") with no caching | Medium | `no_found_rows => true`, `update_post_term_cache` / `update_post_meta_cache` false when unused, and a transient or object cache keyed on content changes |
| `orderby => 'rand'` | Medium | Cache a random set, or sample IDs |
| `meta_query` on unindexed values in a template | Medium | See plugin skill performance §3 and §4 |
| Custom loop not followed by `wp_reset_postdata()` | Low (correctness: later template tags read the wrong post) | Reset after every custom loop |

---

## 6. N+1 lookups in loops

Per-item calls inside a loop that each hit the database or an API: `get_post_meta()` for a post whose meta cache was disabled, `get_field()` on fields that are not cached, `get_the_terms()` with `update_post_term_cache => false`, `get_user_by()` / `get_userdata()` per author, `wp_get_attachment_image()` for attachments not primed, `get_permalink()` on posts of a hierarchical type without primed ancestors.

**Detect:**
```bash
grep -RnE "while\s*\(\s*\\\$[a-z_]+->have_posts|foreach\s*\(\s*\\\$[a-z_]*posts" --include="*.php" . -A20 | grep -E "get_post_meta|get_field|get_the_terms|wp_get_post_terms|get_userdata|get_user_by|wp_get_attachment|get_permalink|wp_remote_"
grep -RnE "update_post_(meta|term)_cache['\"]\s*=>\s*false" --include="*.php" .
```

**Verify.** On an environment, Query Monitor's duplicate-queries panel or `SAVEQUERIES` gives the real count per page. **Severity:** Medium when the loop is on a high-traffic template and the count scales with posts shown; Low otherwise. **Fix:** leave the meta and term caches enabled for loops that read them, prime attachments with `_prime_post_caches()` / `update_post_thumbnail_cache()`, and collect IDs first then fetch in one query.

---

## 7. Uncached remote calls in templates

`wp_remote_get()`, `file_get_contents( 'https://...' )`, SDK calls or oEmbed fetches executed while rendering a template (social feeds, weather, stock tickers, "latest videos"). Each page render waits on a third party.

**Detect:**
```bash
grep -RnE "wp_remote_(get|post|request)\(|wp_safe_remote_|file_get_contents\(\s*['\"]https?:|curl_init\(|wp_oembed_get\(" --include="*.php" .
```

**Severity:** synchronous remote call on every render of a public template: **High** (plugin skill performance heuristic "sync external HTTP call on every request"). **Fix:** fetch in cron or on a transient with a TTL and a stale-while-revalidate fallback, set an explicit short `timeout`, and render nothing (not an error) when the cache is empty.

---

## 8. `theme.json` weight

Everything in `settings` presets and `settings.custom` becomes CSS custom properties printed inline on every page (and in the editor), and every preset generates utility classes.

**Detect:**
```bash
jq '[.settings.color.palette[]?] | length' theme.json
jq '[.settings.color.gradients[]?] | length' theme.json
jq '[.settings.typography.fontSizes[]?] | length' theme.json
jq '[.settings.spacing.spacingSizes[]?] | length' theme.json
jq '[.settings.custom | paths(scalars)] | length' theme.json
jq '.settings.color | {defaultPalette, defaultGradients, defaultDuotone}' theme.json
wc -c theme.json styles/*.json 2>/dev/null
```

| Issue | Severity | Fix |
|---|---|---|
| Large palettes or gradient sets (dozens of entries) or deep `settings.custom` trees | Low (inline CSS grows on every page) | Keep presets to the design system's real tokens |
| Core default palette, gradients and duotones left enabled alongside a full custom set | Low | `"defaultPalette": false`, `"defaultGradients": false`, `"defaultDuotone": false` |
| Style variations duplicating the whole `styles` tree | Info | Override only what differs |
| Large per-block `css` strings in `theme.json` | Low | Move to per-block stylesheets (`wp_enqueue_block_style()`) so they load only with the block |

---

## 9. Front-end JS weight and loading

| Issue | Severity | Fix |
|---|---|---|
| Main theme bundle over ~150 KB compressed, or unminified in production | Medium | Code-split per block/template; ship the production build |
| Scripts in `<head>` without `defer` / `async` strategy | Low | `'strategy' => 'defer'` (WordPress 6.3+) or `in_footer` |
| jQuery loaded only for a few selectors | Low | Vanilla JS; drop the dependency |
| Source maps shipped and served | Low (also `theme-security-checklist.md` §18) | Exclude from deploy |

---

## Severity heuristic

The plugin skill's performance heuristic applies. Theme deltas: anything in `header`, `footer` or a global template part multiplies by every page view, so rate one level higher than the same code in a single-use template; findings on templates that render rarely (404, search) rate one level lower.
