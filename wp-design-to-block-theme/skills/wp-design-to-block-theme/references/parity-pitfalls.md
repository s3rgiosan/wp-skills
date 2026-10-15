# Parity pitfalls — measure each section, don't eyeball it

A casual visual comparison passes while real defects slip through. The failure modes below look fine at a glance and show up only when computed CSS is measured against the design. Run the comparison **section by section during the rebuild** (steps 5–8), and again at step 9.

## How to measure

Capture the design and the local WordPress site with the same route list, then compare them:

```bash
node scripts/capture.mjs --routes routes.txt --base https://design.example.com --out capture/design --behaviors
node scripts/capture.mjs --routes routes.txt --base http://mysite.test --out capture/local
node scripts/compare.mjs capture/design capture/local
```

`compare.mjs` exits `0` only when every check passes. For each route and breakpoint, it checks:

- **Structure:** the h1–h3 outline (text and order) and the section count.
- **Sections**, paired by heading:
  - vertical padding and height
  - content-column left offset **and** width (do inner boxes line up with the centered column?)
  - row item count, grid track count (N tracks, or N plus empty ones?), gaps
  - heading font size, line height, weight
  - form control height and background, and fields without a `name`
  - background image present or missing (is the photo actually showing?)
- **Pixels:** the full-page diff ratio. Tall pages are compared in slices, so the whole page counts. It writes `diff-<w>.png` into the local capture (or `diff-<w>-<n>.png` per differing slice on tall pages), with differing pixels in red.
- **Network:** failed requests (including lazy-loaded assets, since the capture scrolls the page) and console errors on the local site.

Each route gets a folder named after its path and query (`/about` and `/about/` → `about`, `/shop?cat=a` → `shop--cat-a`). Routes with the same path get the same folder in both captures. Pair routes whose paths differ (design files and WordPress paths) with `--map design=local`.

Also check by hand what the script cannot measure: hover and focus states, and anything that appears only after an interaction.

## Gates to run before handover

Each gate reports PASS, FAIL or NOT RUN. **NOT RUN is never a pass.** List it in the handover notes with the reason.

1. **`compare.mjs` passes** for every route at every breakpoint.
2. **Pixel diff is not enough on its own.** A dropped section below the fold can change well under 1% of a tall page's pixels. The structure check exists for this reason. Never raise `--pixel-threshold` to make a failure pass; find the cause.
3. **Visual review.** Open the design and local screenshots side by side for every route, one breakpoint at a time, and read each pair. Look at the `diff-<w>.png` for every page that failed. Whole-page composites are downscaled when an image model reads them, so compare per viewport. Review once more logged in: sticky and fixed elements sit below the admin bar, at 390px they leave no gap once the bar scrolls away, and short pages do not scroll (`html-to-core-blocks.md`, Sticky and fixed elements).
4. **Behaviours.** Every entry in the design's `behaviors-*.json` (menu toggles, accordions, tabs, dialogs, links rendered as buttons) is either rebuilt and exercised on the local site, or listed in the handover notes as not ported.
5. **Editor parity.** Capture the editor on the same routes and compare it with the front end:

   ```bash
   node scripts/cascade-order.mjs --routes wp-routes.txt --base http://mysite.test
   WP_USER=admin WP_PASSWORD=… node scripts/capture-editor.mjs --routes wp-routes.txt --base http://mysite.test --out capture/editor
   node scripts/compare.mjs capture/local capture/editor --editor
   ```

   It passes when no theme rule depends on stylesheet order, every post type opens with its template shown, and the canvas matches the front end at every breakpoint, with no invalid block, block warning or unaccepted placeholder (`editor-parity.md`). The routes reach every template and Page. Open each pattern that no route shows in the Site Editor's pattern screen; it must show no "This block contains unexpected or invalid content". Then save a Page and a template, reload, and confirm the front end did not change.
6. **Build.** `npm run build` is clean.

## Named failure modes to check for

### Spacing overshoots the design
Sections and gaps render taller/looser than the design at desktop. Cause: a fluid `clamp(min, vw, max)` spacing scale whose `max` exceeds the design's fixed rem, so the clamp hits its too-large max. Design spacing is usually **fixed per breakpoint** — cap each preset `max` at the design's real desktop value (see `theme-json-tokens.md`). Patterns stay on presets (`var:preset|spacing|*`), never inline rem.

### Cover overlay hides the background image
Hero renders as a flat solid color; the photo never shows. Cause: the cover's overlay carries a `has-<color>-background-color` class, and WordPress emits preset color classes as `background-color: … !important`; a gradient set with the `background` shorthand does not clear that `!important` color. Fix: the transparent-background-color + `background-image` recipe in `html-to-core-blocks.md`.

### Grid shows empty tracks
A 3-item row renders as 4 uneven tracks with a gap. Cause: `minimumColumnWidth` uses `auto-fill`, which creates as many tracks as fit. Fix: `columnCount:N` for a fixed even N; reserve `minimumColumnWidth` for genuinely fluid galleries. See `html-to-core-blocks.md`.

### Core block flags "unexpected or invalid content"
An `aria-*`, `data-*`, or `role` attribute was written by hand onto a core block's saved HTML. A core block only serialises the attributes it declares, so re-serialisation cannot reproduce the extra attribute and the editor invalidates the block. Fix: put the attribute on a wrapper element, or promote to a custom block that declares it.

### Dead CSS against markup a block never emits
A selector targets an inner class the block does not output, so the rule silently does nothing. Read the block's `render.php` / save output first and target only classes it emits; add the class server-side with a `render_block` filter if the design needs one.

### Editor flags every color pairing as low contrast
Every block with a text and background color shows the "low contrast" warning in the editor, even for pairings far above 4.5:1. Cause: the palette holds `oklch()` values, which the editor's contrast checker (colord) cannot parse. Fix: hex palette values, which `scripts/css-tokens.mjs` emits (see `theme-json-tokens.md`). Check in the editor: a passing pairing shows no warning, a failing one does.

### Every section sits a little lower than the design
All sections are offset by the same amount, and the offset adds up down the page. Cause: core's default `blockGap` adds a top margin between top-level blocks, which the design does not have. Fix: set `styles.spacing.blockGap` to the design's rhythm, or `0` when sections carry their own padding (see `theme-json-tokens.md`).

### Spacing between blocks collapses in the editor only
Article paragraphs, a row's items or a pagination bar touch in the canvas but are spaced on the front end. Cause: a class rule adds the space (`.article-body > * + *`, `.meta-row { gap }`) and ties with the global layout rule on specificity; the editor loads the theme stylesheet first, so the global rule wins there. Fix: set `blockGap` on the block, or give the rule a second class where the block has no gap setting (`editor-parity.md`, Cascade order). `scripts/cascade-order.mjs` finds every case.

### The article loses its styles in the editor
Posts show unstyled text in the editor: default size, no spacing, no post header. Cause: the post opens in post-only mode, without the template, so the class on `core/post-content` that styles the article is not in the canvas. Fix: declare `default-mode` `template-locked` for the post type (`editor-parity.md`, The post editor shows the template).

### Footer floats mid-screen on short pages
The design keeps the footer at the bottom of the viewport; the rebuild leaves empty space under it. Cause: the design's full-height flex-column page wrapper did not survive the move to template parts. Fix: the `.wp-site-blocks` flex-column recipe in `section-to-pattern.md`. In the editor the footer floats even with the recipe in place: the canvas root is `.is-root-container.wp-site-blocks`, and core sets `display: flow-root` on it. Repeat the rule for that selector (`editor-parity.md`).

### Content missing from the design capture
Sections render blank or half-transparent in the design screenshots. Cause: reveal-on-scroll animations that never fired, or lazy images that never loaded. `capture.mjs` scrolls the page and waits for finite animations before capturing. If content is still missing, the design animates on a trigger other than scrolling (a timer, a hover, a click). Find the trigger in the source, and check every design screenshot before using it as the reference.

### Every route passes the route check but shows the home page
Cause: plain permalinks. Every path returns the front page with status 200. Fix: set a pretty permalink structure before capturing the local site (see `section-to-pattern.md`).

### A preset size or color has no effect
The block carries `has-<slug>-font-size` (or `-color`), but renders at the inherited value. Cause: a slug with a digit next to letters (`title-3xl`); WordPress generates the CSS for the kebab-cased slug (`title-3-xl`), so the class matches nothing. Fix: rename the slug (`theme-json-tokens.md`, After the script).

### Hidden items still show
Items or panels hidden with the `hidden` attribute stay visible. Cause: a theme rule sets `display` on the element (`.panel { display: flex }`), which overrides the browser's `[hidden] { display: none }`. Fix: add `.panel[hidden] { display: none; }` for every class that sets `display` on something the Interactivity API hides.

### A new pattern renders nothing
A template or page references a pattern file added after the site last loaded, and the slot stays empty. Cause: WordPress caches the theme's pattern file list (WP 6.6+). Fix: set `WP_DEVELOPMENT_MODE` to `theme` while building, or clear the cache after adding a pattern file: `wp eval 'wp_get_theme()->delete_pattern_cache();'`.
