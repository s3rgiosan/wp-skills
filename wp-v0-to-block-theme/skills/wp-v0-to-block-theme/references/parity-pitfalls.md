# Parity pitfalls — measure each section, don't eyeball it

A casual visual comparison passes while real defects slip through. The failure modes below look fine at a glance and show up only when computed CSS is measured against the design. Run the comparison **section by section during the rebuild** (steps 4–7), not only once at step 8.

## How to measure

Capture the design and the local WordPress site with the same route list, then compare them:

```bash
node scripts/capture.mjs --routes routes.txt --base https://my-design.vercel.app --out capture/design --behaviors
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

Each route gets a folder named after its path and query (`/about` and `/about/` → `about`, `/shop?cat=a` → `shop--cat-a`). Capture both sites from the same route file so the folders match. Pair routes whose paths differ with `--map design=local`.

Also check by hand what the script cannot measure: hover and focus states, and anything that appears only after an interaction.

## Gates to run before handover

Each gate reports PASS, FAIL or NOT RUN. **NOT RUN is never a pass.** List it in the handover notes with the reason.

1. **`compare.mjs` passes** for every route at every breakpoint.
2. **Pixel diff is not enough on its own.** A dropped section below the fold can change well under 1% of a tall page's pixels. The structure check exists for this reason. Never raise `--pixel-threshold` to make a failure pass; find the cause.
3. **Visual review.** Open the design and local screenshots side by side for every route, one breakpoint at a time, and read each pair. Look at the `diff-<w>.png` for every page that failed. Whole-page composites are downscaled when an image model reads them, so compare per viewport.
4. **Behaviours.** Every entry in the design's `behaviors-*.json` (menu toggles, accordions, tabs, dialogs, links rendered as buttons) is either rebuilt and exercised on the local site, or listed in the handover notes as not ported.
5. **Editor round-trip.** Open every template, template part and pattern in the Site Editor, and every Page in the post editor. No block may show "This block contains unexpected or invalid content". In the editor's browser console, this lists invalid blocks:

   ```js
   const walk = (blocks) => blocks.flatMap((b) => [b, ...walk(b.innerBlocks)]);
   walk(wp.data.select('core/block-editor').getBlocks()).filter((b) => !b.isValid).map((b) => b.name);
   ```

   Save, reload, and confirm the front end did not change.
6. **Build.** `npm run build` is clean.

## Named failure modes to check for

### Spacing overshoots the design
Sections and gaps render taller/looser than the design at desktop. Cause: a fluid `clamp(min, vw, max)` spacing scale whose `max` exceeds the design's fixed rem, so the clamp hits its too-large max. v0/Tailwind spacing is effectively **fixed per breakpoint** — cap each preset `max` at the design's real desktop value (see `tokens-mapping.md`). Patterns stay on presets (`var:preset|spacing|*`), never inline rem.

### Cover overlay hides the background image
Hero renders as a flat solid color; the photo never shows. Cause: the cover's overlay carries a `has-<color>-background-color` class, and WordPress emits preset color classes as `background-color: … !important`; a gradient set with the `background` shorthand does not clear that `!important` color. Fix: the transparent-background-color + `background-image` recipe in `shadcn-to-core-blocks.md`.

### Grid shows empty tracks
A 3-item row renders as 4 uneven tracks with a gap. Cause: `minimumColumnWidth` uses `auto-fill`, which creates as many tracks as fit. Fix: `columnCount:N` for a fixed even N; reserve `minimumColumnWidth` for genuinely fluid galleries. See `shadcn-to-core-blocks.md`.

### Core block flags "unexpected or invalid content"
An `aria-*`, `data-*`, or `role` attribute was written by hand onto a core block's saved HTML. A core block only serialises the attributes it declares, so re-serialisation cannot reproduce the extra attribute and the editor invalidates the block. Fix: put the attribute on a wrapper element, or promote to a custom block that declares it.

### Dead CSS against markup a block never emits
A selector targets an inner class the block does not output, so the rule silently does nothing. Read the block's `render.php` / save output first and target only classes it emits; add the class server-side with a `render_block` filter if the design needs one.

### Editor flags every color pairing as low contrast
Every block with a text and background color shows the "low contrast" warning in the editor, even for pairings far above 4.5:1. Cause: the palette holds `oklch()` values, which the editor's contrast checker (colord) cannot parse. Fix: hex palette values, which `scripts/tokens.mjs` emits (see `tokens-mapping.md`). Check in the editor: a passing pairing shows no warning, a failing one does.

### Every section sits a little lower than the design
All sections are offset by the same amount, and the offset adds up down the page. Cause: core's default `blockGap` adds a top margin between top-level blocks, which the design does not have. Fix: set `styles.spacing.blockGap` to the design's rhythm, or `0` when sections carry their own padding (see `tokens-mapping.md`).

### Footer floats mid-screen on short pages
The design keeps the footer at the bottom of the viewport; the rebuild leaves empty space under it. Cause: the v0 `min-h-screen flex flex-col` page wrapper did not survive the move to template parts. Fix: the `.wp-site-blocks` flex-column recipe in `section-to-pattern.md`.

### Content missing from the design capture
Sections render blank or half-transparent in the design screenshots. Cause: reveal-on-scroll animations that never fired, or lazy images that never loaded. `capture.mjs` scrolls the page and waits for finite animations before capturing. If content is still missing, the design animates on a trigger other than scrolling (a timer, a hover, a click). Find the trigger in the source, and check every design screenshot before using it as the reference.

### Every route passes the route check but shows the home page
Cause: plain permalinks. Every path returns the front page with status 200. Fix: set a pretty permalink structure before capturing the local site (see `section-to-pattern.md`).
