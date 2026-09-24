# shadcn/ui → WordPress core blocks

v0 builds on shadcn/ui primitives. None port directly; approximate each with core blocks styled via theme.json tokens. Reach for a custom block only where the row says so — and raise it before building.

## Cheat sheet

| shadcn / v0 element | WordPress rebuild | Notes |
|---|---|---|
| `Button` | `core/button` (inside `core/buttons`) | Variants (default/outline/ghost) → button block styles or theme.json button `styles`. |
| `Card` | `core/group` (with padding, radius, border) + inner blocks | Card grids → `core/columns` or a Query loop pattern. |
| `Badge` | `core/paragraph` styled, or an inline `core/group` | Small pill; use a block style for the shape. |
| `Input` / `Textarea` / form | `core/group` + a forms plugin, or a custom block | Core has no form field block. Use the project's form solution (or WS Form / Fluent Forms if present); custom block only if none. shadcn fields often have an `id` but no `name`, so they submit nothing: map every field to a named field in the form solution (see Form controls). |
| `Accordion` | `core/details` **or** custom Interactivity block | `core/details` covers simple cases with no JS. Animated/single-open accordions → Interactivity API (see interactivity-recipes.md). Recent Gutenberg ships a native accordion block set (`core/accordion` / `core/accordion-item` / …), stable since WordPress 6.9; check whether it's in the target WP version before building a custom Interactivity block. |
| `Tabs` | `core/tabs` **or** custom Interactivity block | WordPress 7.1 ships a native tabs block set (`core/tabs`, `core/tab-list`, `core/tab-panels`, `core/tab-panel`); use it when the target WP version has it. Otherwise rebuild with the Interactivity API (see interactivity-recipes.md). |
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

- **Section = pattern; widget = block.** A hero, feature grid, testimonial row, footer are **patterns** (compositions of core blocks). A **custom block** is justified only by behavior or data that core blocks cannot express: an interactive widget with no core equivalent (carousel, modal), a form with no form solution in the project, or a dynamic query with custom output. Raise it before building.
- **Variants → block styles or theme.json**, not new blocks. A button's outline vs solid is a style, not a block.
- **Match spacing/type/color to tokens**, not to the pixel values in the JSX. The capture's computed CSS confirms the real rendered values.
- **Layout primitives:** shadcn flex/grid utility stacks → `core/group` (flex/stack layout), `core/columns`, or `core/group` with `layout: { type: "grid" }`.

## Recipes and traps

### Block style variations
A shadcn button/card/badge variant (outline, ghost, secondary) maps to a **block style variation**, not a new block. Two equivalent mechanisms register the same kind of variation:

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

A v0 hero usually tints its photo with a positioned layer (`absolute inset-0 bg-black/40`). Rebuild it as the cover's own overlay (`dimRatio` + overlay color or gradient), not as an absolutely positioned group. A positioned layer covers the image in the editor, so editors cannot click the image to replace it.

### Full-bleed sections: root-padding-aware alignments first
The baseline mechanism for full-bleed handling is theme.json, not manual CSS. Turn on root-padding-aware alignments and set the content/wide sizes and root padding there:

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

### Grid column count
Tailwind `grid-cols-N` → core grid `columnCount:N` (a fixed, even N). `minimumColumnWidth` uses `auto-fill`, which creates as many tracks as fit and leaves empty tracks when items < tracks — reserve it for genuinely fluid galleries (`auto-fit`/`auto-fill` intentions), and pick a value that yields the intended N at the content width.

`columnCount` is fixed at every breakpoint — the core grid does not auto-stack. For Tailwind's `md:grid-cols-N` (one column on mobile, N on desktop), use `core/columns` with `isStackedOnMobile:true` (breakpoint-aware) rather than a grid `columnCount`, or add your own media query.

### Form controls
- Every field needs a `name`. React forms read values from state, so v0 markup often has `<input id="email">` with no `name`, and a plain HTML submission sends nothing. `compare.mjs` flags local fields without a `name`.
- shadcn `Select` is a custom Radix popover, not a native control. Rebuilt as a native `<select>` with `appearance: none`, it loses its caret; add one back with a `background-image` chevron.

### Icons

v0 uses lucide icons, which are stroke-based SVGs.

- **Inventory the icons up front** and add the whole set to the theme once.
- Set `fill: none; stroke: currentcolor;` on them. Without the stroke rule, outline icons render as solid shapes.
- **Decorative** icon → inline SVG in the pattern markup, with `aria-hidden="true"`. **Linked** icon → a linkable primitive (`core/social-link`, a button, or a link wrapping the SVG). A decorative SVG carries no link.
- An icon next to text needs a flex container (`display: flex; align-items: center; gap`) with the SVG sized in `em`. Otherwise the SVG renders as a block and breaks the line.

### Read a block's output before styling it
Target only classes the block actually renders: read its `render.php` or saved markup first. When the design needs a class the block does not output, add it server-side with a `render_block` filter.

### Where core-block CSS lives
Style a core block with a theme-wide block selector (`.wp-block-<name>`) so every instance gets the style. Component stylesheets are for the theme's own named components.
