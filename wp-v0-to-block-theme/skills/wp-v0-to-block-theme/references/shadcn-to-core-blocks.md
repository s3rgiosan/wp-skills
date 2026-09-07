# shadcn/ui → WordPress core blocks

v0 builds on shadcn/ui primitives. None port directly; approximate each with core blocks styled via theme.json tokens. Reach for a custom block only where the row says so — and raise it before building.

## Cheat sheet

| shadcn / v0 element | WordPress rebuild | Notes |
|---|---|---|
| `Button` | `core/button` (inside `core/buttons`) | Variants (default/outline/ghost) → button block styles or theme.json button `styles`. |
| `Card` | `core/group` (with padding, radius, border) + inner blocks | Card grids → `core/columns` or a Query loop pattern. |
| `Badge` | `core/paragraph` styled, or an inline `core/group` | Small pill; use a block style for the shape. |
| `Input` / `Textarea` / form | `core/group` + a forms plugin, or a custom block | Core has no form field block. Use the project's form solution (or WS Form / Fluent Forms if present); custom block only if none. |
| `Accordion` | `core/details` **or** custom Interactivity block | `core/details` covers simple cases with no JS. Animated/single-open accordions → Interactivity API (see interactivity-recipes.md). Recent Gutenberg ships a native accordion block set (`core/accordion` / `core/accordion-item` / …); check whether it's in the target WP version before building a custom Interactivity block. |
| `Tabs` | Custom Interactivity block | No core tabs block. Rebuild with the Interactivity API. |
| `Carousel` / slider | Custom Interactivity block | No core carousel. Interactivity API, or a vetted slider block if the project already ships one. |
| `Dialog` / `Sheet` / modal | Custom Interactivity block | Interactivity API for open/close + focus trap. |
| `NavigationMenu` | `core/navigation` | Mobile menu behavior is built in; match styling via theme.json. |
| `Avatar` | `core/image` (rounded via block style) | |
| `Separator` | `core/separator` | |
| `Table` | `core/table` | |
| `Alert` / callout | `core/group` styled, or a block style | |
| Hero / feature / CTA section | `core/cover` or `core/group` + heading/paragraph/buttons | Compose; this is a **pattern**, not a block. |
| Icon | Inline SVG in the block markup, or `core/image` | shadcn uses lucide icons; inline the SVG. |

## Principles

- **Section = pattern; widget = block.** A hero, feature grid, testimonial row, footer are **patterns** (compositions of core blocks). Interactive widgets (tabs, carousel, modal) are the only things that justify a **custom block**.
- **Variants → block styles or theme.json**, not new blocks. A button's outline vs solid is a style, not a block.
- **Match spacing/type/color to tokens**, not to the pixel values in the JSX. The capture's computed CSS confirms the real rendered values.
- **Layout primitives:** shadcn flex/grid utility stacks → `core/group` (flex/stack layout), `core/columns`, or `core/group` with `layout: { type: "grid" }`.

## Recipes and traps

### Cover overlay hides the image
A `core/cover` overlay carries a `has-<color>-background-color` class, and WordPress emits preset color classes as `background-color: … !important`. A gradient set with the `background` shorthand does not clear that `!important` color, so a solid layer sits over the photo. Set the overlay explicitly:

```css
.hero .wp-block-cover__background {
  background-color: transparent !important;
  background-image: linear-gradient(...);
}
```

Don't rely on `overlayColor` when a custom gradient overlay is in play.

### Align a capped box to the content column inside an alignfull section
`margin-left: 0` aligns a width-capped box to the full-bleed section's padding edge, not to the centered content column where the rest of the page sits. `contentPosition:"center left"` on a cover compounds it by shrink-wrapping the inner container. Align to the column instead, and define the inset once:

```css
:root { --content-inset: max(0px, calc((100% - var(--wp--style--global--content-size)) / 2)); }
.capped-box { margin-left: var(--content-inset) !important; }
```

Drop `contentPosition:"center left"`. The single-definition rule applies to layout recipes too — consume `--content-inset`, don't re-paste the `calc`.

### Grid column count
Tailwind `grid-cols-N` → core grid `columnCount:N` (a fixed, even N). `minimumColumnWidth` uses `auto-fill`, which creates as many tracks as fit and leaves empty tracks when items < tracks — reserve it for genuinely fluid galleries (`auto-fit`/`auto-fill` intentions), and pick a value that yields the intended N at the content width.

### Form controls
- `select`: `appearance: none` removes the native caret — re-add one with an inline-SVG chevron `background-image`.
- Input / search surface uses the **card** token (e.g. `tertiary`), not the page's `base` token, or the field looks borderless against the page.
- Style the WebKit search UA chrome off (`appearance: none`) so custom and core `core/search` inputs measure the same height.
- The caret is a **base-layer global** (define once in a forms stylesheet); a component overrides only color or position via a modifier, never re-emits the SVG.

### Heading / link affordance
v0 heading links are commonly **no underline + a trailing arrow icon**. Map affordances to the design; don't leave the default underline if the design drops it.

### Icons

- **Inventory the design's lucide icons up front** and generate the theme's icon set once, rather than adding icons piecemeal as sections need them.
- **Decorative** icon → inline SVG in the pattern markup (or `core/image` for a raster). **Linked** icon → a linkable primitive: `core/social-links` / `core/social-link` (its `service` set covers feed, facebook, etc.), a button, or an anchored custom block. A bare inline SVG or a decorative icon emits no anchor, so wrapping a link around one is required — never rely on a decorative icon to carry the link. Inject environment-specific URLs (a feed link) with PHP in the pattern.
- Any inline-icon-plus-text run (breadcrumbs, chips, meta rows, a button with a trailing arrow) needs an explicit flex container — an inline SVG rendered block-level breaks the line otherwise:

```css
.trail { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
.trail svg { display: block; width: 1em; height: 1em; }
```

- Stroke-style (outline) icons render as solid black blobs if the stroke rule misses. If you add icons via a theme helper, the class may land on a wrapper (svg is a child) or directly on the `<svg>` depending on how the helper renders — target both:

```css
.icon svg, svg.icon { fill: none; stroke: currentcolor; }
```

### Read a block's output before styling it
Before writing CSS against a third-party (or core) block's inner markup, read that block's `render.php` / save output and target **only classes it emits**. A selector for markup the block never produces is invisible dead weight. If the design needs a class the block doesn't add (e.g. a depth class for hierarchy indent), add it server-side with a `render_block` filter, then style it.

### Where core-block CSS lives
Styling for a **core block** belongs in a block-selector, theme-global layer (e.g. `.wp-block-query-pagination …`) so every use inherits it — not scoped to one page's component class, or only the first archive gets the treatment. Component stylesheets are for bespoke, named components only.
