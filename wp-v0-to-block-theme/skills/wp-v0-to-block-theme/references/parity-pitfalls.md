# Parity pitfalls — measure each section, don't eyeball it

Casual visual comparison passes while real defects slip through. Every recurring defect below survived a build and was only caught by measuring computed CSS against the deployed design. Run this as a **per-section checklist during the rebuild** (steps 4–6), not only as a final glance at step 7.

## How to measure

For each section, compare the deployed design against the local site on the same properties:

- Deployed values: the `computed-<w>.json` written by `scripts/capture.mjs` (real rendered CSS, per breakpoint).
- Local values: `getComputedStyle` on the activated theme (Playwright, or the browser devtools) at the same breakpoint.

Compare, section by section, at each breakpoint:

- Section vertical padding (top/bottom).
- Content-column left offset **and** width (do inner boxes line up with the centered column?).
- Grid column count (does a row of N render as N tracks, or N+empties?).
- Gaps between items.
- Font sizes (heading scale, body).
- Control surfaces — input / select / search background, border, height.
- Pagination style (present on every archive, not just one).
- Overlay / background-image visibility (is the photo actually showing?).

## Named failure modes to check for

### Spacing overshoots the design
Sections and gaps render taller/looser than the design at desktop. Cause: a fluid `clamp(min, vw, max)` spacing scale whose `max` exceeds the design's fixed rem, so the clamp hits its too-large max. v0/Tailwind spacing is effectively **fixed per breakpoint** — cap each preset `max` at the design's real desktop value (see `tokens-mapping.md`). Patterns stay on presets (`var:preset|spacing|*`), never inline rem.

### Cover overlay hides the background image
Hero renders as a flat solid color; the photo never shows. Cause: the cover's overlay carries a `has-<color>-background-color` class, and WordPress emits preset color classes as `background-color: … !important`; a gradient set with the `background` shorthand does not clear that `!important` color. Fix: the transparent-background-color + `background-image` recipe in `shadcn-to-core-blocks.md`.

### Capped box hugs the viewport edge instead of the content column
A width-capped hero heading or section intro sits at the viewport padding edge (~16–24px) rather than lining up with the centered content column where the rest of the page's blocks sit. Cause: `margin-left: 0` aligns to the full-bleed section's padding edge; `contentPosition:"center left"` on a cover compounds it. Fix: the `--content-inset` alignment recipe in `shadcn-to-core-blocks.md`.

### Grid shows empty tracks
A 3-item row renders as 4 uneven tracks with a gap. Cause: `minimumColumnWidth` uses `auto-fill`, which creates as many tracks as fit. Fix: `columnCount:N` for a fixed even N; reserve `minimumColumnWidth` for genuinely fluid galleries. See `shadcn-to-core-blocks.md`.

### Controls look wrong or invisible
A select has no caret; a search field's background matches the page and looks borderless. Cause: `appearance` reset without re-adding a caret; input background set to the page's base token. Fix: form-control recipes in `shadcn-to-core-blocks.md` (caret via inline SVG, input surface uses the card token, not the page surface).

### Core block flags "unexpected or invalid content"
An `aria-*`, `data-*`, or `role` attribute was written by hand onto a core block's saved HTML. A core block only serialises the attributes it declares, so re-serialisation cannot reproduce the extra attribute and the editor invalidates the block. Fix: put the attribute on a wrapper element, or promote to a custom block that declares it.

### Dead CSS against markup a block never emits
A selector targets an inner class the block does not actually output (a plugin's `render.php` renders the element bare), so the rule silently does nothing. Read the block's `render.php` / save output first and target only classes it emits; add the class server-side with a `render_block` filter if the design needs one.
