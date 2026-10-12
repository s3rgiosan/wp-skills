# Design markup → WordPress core blocks

Design markup never ports as-is. Rebuild each element with core blocks styled via theme.json tokens, reading the element's role from the rendered DOM (`dom-*.html`) and its values from the capture. Reach for a custom block only where the row says so — and raise it before building. A source skill may add a map for its component library on top of this one.

## Cheat sheet

| Design element | WordPress rebuild | Notes |
|---|---|---|
| `<h1>`–`<h6>` | `core/heading` | Keep the level the design uses; the outline is checked by `compare.mjs`. |
| `<p>`, a text `<span>`/`<div>` | `core/paragraph` | A short styled label (eyebrow, tag, meta line) is a paragraph with a block style. |
| `<a>` styled as a button | `core/button` (inside `core/buttons`) | Variants (solid/outline/ghost/inverse) → button block styles or theme.json button `styles`. |
| Plain inline `<a>` | A link inside `core/paragraph` | Link colors and hover go in `styles.elements.link`. |
| A box with padding, border or background (card, panel) | `core/group` + inner blocks | Card grids → `core/group` grid layout, `core/columns`, or a Query Loop for posts. |
| Flex row / stack | `core/group` with `flex` or `constrained` layout | `gap` → `blockGap` from spacing presets. |
| CSS grid | `core/group` with `layout: { type: "grid" }` | See Grid column count. |
| `<img>` | `core/image`, or the block of the content slot | A site logo, featured image or author avatar uses `core/site-logo`, `core/post-featured-image`, `core/avatar` (`content-model.md`). Explicit width/height; rounded via block style. |
| Full-bleed band with its own background | `core/group` `align:"full"` with a background color | Its content column is a nested constrained group. |
| Photo band with text over it | `core/cover` | See Cover overlay hides the image. |
| `<hr>`, a 1px divider line | `core/separator` or a group border | A border on the group when the line belongs to a box. |
| `<ul>`/`<ol>` of text | `core/list` | A list of cards or links is a group. |
| `<table>` | `core/table` | |
| `<details>`/`<summary>`, accordion | `core/details`, `core/accordion`, or an Interactivity block | See interactivity-recipes.md. |
| Tabs | `core/tabs` (when the WP version has it) or an Interactivity block | See interactivity-recipes.md. |
| Carousel / slider | Custom Interactivity block | No core carousel. Prefer a vetted slider block the project already ships. |
| Dialog / drawer / modal | Custom Interactivity block | Open/close, focus trap, Escape. |
| Site nav | `core/navigation` | Mobile menu behavior is built in; match styling via theme.json. |
| Social / profile links | `core/social-links` | Linked icons; see Icons. |
| Form fields | A forms plugin the project uses, or a custom block | Core has no form field block. See Form controls. |
| Inline SVG icon | Inline SVG in the pattern markup, or `core/image` | See Icons. |
| Infinite marquee (a scrolling strip) | A custom block, or a block that renders terms or a setting | Its items are content: decide their source in the content model. Render the list twice for a seamless loop, mark the copy `aria-hidden`, and stop it under `prefers-reduced-motion`. |
| Row of key figures or counters | A custom block with repeatable items, or bound meta | Figures change; decide their source in the content model. |
| Category, type or tag label on an item | `core/post-terms` | The terms come from a taxonomy (`content-model.md`). |
| Hero / feature / CTA section | `core/cover` or `core/group` + heading/paragraph/buttons | Compose it from core blocks as a **pattern**. |

## Principles

- **Section = pattern; widget = block.** A hero, feature grid, testimonial row, footer are **patterns** (compositions of core blocks). A **custom block** is justified only by behavior or data that core blocks cannot express: an interactive widget with no core equivalent (carousel, modal), a form with no form solution in the project, or a dynamic query with custom output. Raise it before building.
- **Variants → block styles or theme.json.** A button's outline and solid looks are two styles of one block.
- **Match spacing/type/color to tokens**, mapping each source pixel value to its nearest preset. The capture's computed CSS confirms the real rendered values.
- **Labels hold words only.** Arrows and glyphs on links and buttons (`→`, `↗`) are a block style or CSS `::after`, never part of the label text (`content-model.md`, Labels and decoration).
- **Hover and focus states** are part of the design. Read them from the source's `:hover` rules and rebuild them on the same element (`styles.elements.link`, a block style, `styles.blocks.<block>.elements`).

## Recipes and traps

### Block style variations
A variant (outline button, inverse card, pill badge) maps to a **block style variation** of the existing block. Two equivalent mechanisms register the same kind of variation:

- **`register_block_style()` with `style_data`** (WP 6.6+) — register the variation in PHP; its styles live in `style_data` (theme.json-shaped) and stay editable from the Global Styles UI, same as a built-in style.
- **theme.json `styles.blocks.<block>.variations.<slug>`** — style an already-registered variation slug (a core style, or one registered via `register_block_style()`/`block.json`) directly in theme.json. theme.json only supplies styles for a registered variation slug; it doesn't register a new one by itself.

Minimal outline-button example, registered in PHP:

```php
register_block_style(
    'core/button',
    array(
        'name'       => 'outline',
        'label'      => __( 'Outline', 'mytheme' ),
        'style_data' => array(
            'color'  => array(
                'background' => 'transparent',
                'text'       => 'var:preset|color|primary',
            ),
            'border' => array(
                'color' => 'var:preset|color|primary',
                'width' => '1px',
            ),
        ),
    )
);
```

The same styling, expressed in theme.json instead (for a variation slug already registered elsewhere):

```json
"styles": {
  "blocks": {
    "core/button": {
      "variations": {
        "outline": {
          "color": { "background": "transparent" },
          "border": { "color": "var:preset|color|primary", "width": "1px" }
        }
      }
    }
  }
}
```

### Cover overlay hides the image
A `core/cover` overlay carries a `has-<color>-background-color` class, and WordPress emits preset color classes as `background-color: … !important`. A gradient set with the `background` shorthand does not clear that `!important` color, so a solid layer sits over the photo. Set the overlay explicitly:

```css
.hero .wp-block-cover__background {
  background-color: transparent !important;
  background-image: linear-gradient(...);
}
```

Don't rely on `overlayColor` when a custom gradient overlay is in play.

A design often tints its photo with a positioned layer (an absolutely positioned box with a translucent background). Rebuild it as the cover's own overlay (`dimRatio` + overlay color or gradient). A positioned group layered on top covers the image in the editor, so editors cannot click the image to replace it.

### Full-bleed sections: root-padding-aware alignments first
Full-bleed handling comes from theme.json. Turn on root-padding-aware alignments and set the content/wide sizes and root padding there:

```json
"settings": {
  "useRootPaddingAwareAlignments": true,
  "layout": { "contentSize": "40rem", "wideSize": "72rem" }
},
"styles": {
  "spacing": { "padding": { "left": "1rem", "right": "1rem" } }
}
```

With it on, WordPress applies the root padding so `alignfull` bands span edge-to-edge while constrained content keeps the inset — no manual edge handling for the common case.

### Sticky and fixed elements: offset by the admin bar
A logged-in visitor sees the admin bar above the page. While the bar shows, WordPress sets its height on `html` as `--wp-admin--admin-bar--height`: 32px, or 46px at 782px and below. The variable is undefined without the bar, so always give it a `0px` fallback. Every element whose position depends on the top of the viewport adds it:

```css
.site-header {
  position: sticky;
  top: var(--wp-admin--admin-bar--height, 0px);
}

/* At 600px and below the admin bar scrolls with the page. */
@media (max-width: 600px) {
  .site-header {
    top: 0;
  }
}
```

- **Sticky and fixed elements** (headers, nav bars, drawers, progress bars, back-to-top buttons): offset `top` by the variable, and reset it to `0` at 600px and below, where the bar is `position: absolute`.
- **Full-height layouts** (the sticky-footer wrapper): `min-height: calc(100vh - var(--wp-admin--admin-bar--height, 0px))`. The bar pushes the page down by its height, so `100vh` alone scrolls.
- **In-page anchors under a sticky header:** `scroll-padding-top` on `html` is the admin bar plus the header's height. Core sets it to the admin bar height alone.

`capture.mjs` runs logged out, so the parity gate never sees the bar. Check these logged in during the visual review.

### Grid column count
`grid-template-columns: repeat(N, …)` → core grid `columnCount:N` (a fixed, even N). `minimumColumnWidth` uses `auto-fill`, which creates as many tracks as fit and leaves empty tracks when items < tracks — reserve it for genuinely fluid galleries (`auto-fit`/`auto-fill` intentions), and pick a value that yields the intended N at the content width.

`columnCount` is fixed at every breakpoint — the core grid does not auto-stack. For a grid that is one column on mobile and N on desktop, use `core/columns` with `isStackedOnMobile:true` (breakpoint-aware), or add your own media query to the grid. A design that keeps N columns at phone width (drawn at one width only) still needs to stack: decide the breakpoint and record it in `CONVERSION-NOTES.md`.

A grid with `minimumColumnWidth` sets `container-type: inline-size`. Inside a vertical **flex** group, Chrome then sizes its rows as if the items were nearly zero wide, and each row grows hundreds of pixels tall. Put such a grid in a group with the default (flow) layout, which still honors `blockGap`.

### Form controls
- Every field needs a `name`. Component-driven forms read values from state, so design markup often has `<input id="email">` with no `name`, and a plain HTML submission sends nothing. `compare.mjs` flags local fields without a `name`.
- A custom select (a scripted popover) rebuilt as a native `<select>` with `appearance: none` loses its caret; add one back with a `background-image` chevron.

### Icons
- **Inventory the icons up front** and add the whole set to the theme once.
- Outline icons are stroke-based: set `fill: none; stroke: currentcolor;` on them. Without the stroke rule, they render as solid shapes.
- **Decorative** icon → inline SVG in the pattern markup, with `aria-hidden="true"`. **Linked** icon → a linkable primitive (`core/social-link`, a button, or a link wrapping the SVG). A decorative SVG carries no link.
- An icon next to text needs a flex container (`display: flex; align-items: center; gap`) with the SVG sized in `em`. Otherwise the SVG renders as a block and breaks the line.
- A labelled placeholder where an icon belongs (`[ICON]`) is an icon still to choose: use the platform's official mark, or `core/social-link`'s built-in icon, and list the choice in the handover notes.

### Read a block's output before styling it
Target only classes the block actually renders: read its `render.php` or saved markup first. When the design needs a class the block does not output, add it server-side with a `render_block` filter.

### Where core-block CSS lives
Style a core block with a theme-wide block selector (`.wp-block-<name>`) so every instance gets the style. Component stylesheets are for the theme's own named components.
