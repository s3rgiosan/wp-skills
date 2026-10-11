# shadcn/ui → WordPress core blocks

v0 builds on shadcn/ui primitives. None port directly; approximate each with core blocks styled via theme.json tokens. Reach for a custom block only where the row says so — and raise it before building.

This map adds the shadcn names on top of the core `references/html-to-core-blocks.md`, which holds the principles and the recipes (block style variations, cover overlay, full-bleed alignments, grid column count, form controls, icons, block CSS).

## Cheat sheet

| shadcn / v0 element | WordPress rebuild | Notes |
|---|---|---|
| `Button` | `core/button` (inside `core/buttons`) | Variants (default/outline/ghost) → button block styles or theme.json button `styles`. |
| `Card` | `core/group` (with padding, radius, border) + inner blocks | Card grids → `core/columns` or a Query loop pattern. |
| `Badge` | `core/paragraph` styled, or an inline `core/group` | Small pill; use a block style for the shape. |
| `Input` / `Textarea` / form | `core/group` + a forms plugin, or a custom block | Core has no form field block. Use the project's form solution (or WS Form / Fluent Forms if present); custom block only if none. shadcn fields often have an `id` but no `name`, so they submit nothing (core Form controls recipe). |
| `Accordion` | `core/details` **or** custom Interactivity block | `core/details` covers simple cases with no JS. Animated/single-open accordions → Interactivity API (core `references/interactivity-recipes.md`). Recent Gutenberg ships a native accordion block set (`core/accordion` / `core/accordion-item` / …), stable since WordPress 6.9; check whether it's in the target WP version before building a custom Interactivity block. |
| `Tabs` | `core/tabs` **or** custom Interactivity block | WordPress 7.1 ships a native tabs block set (`core/tabs`, `core/tab-list`, `core/tab-panels`, `core/tab-panel`); use it when the target WP version has it. Otherwise rebuild with the Interactivity API (core `references/interactivity-recipes.md`). |
| `Carousel` / slider | Custom Interactivity block | No core carousel. Interactivity API, or a vetted slider block if the project already ships one. |
| `Dialog` / `Sheet` / modal | Custom Interactivity block | Interactivity API for open/close + focus trap. |
| `NavigationMenu` | `core/navigation` | Mobile menu behavior is built in; match styling via theme.json. |
| `Avatar` | `core/image` (rounded via block style) | |
| `Separator` | `core/separator` | |
| `Table` | `core/table` | |
| `Alert` / callout | `core/group` styled, or a block style | |
| Hero / feature / CTA section | `core/cover` or `core/group` + heading/paragraph/buttons | Compose it from core blocks as a **pattern**. |
| Icon | Inline SVG in the block markup, or `core/image` | shadcn uses lucide icons; inline the SVG. |

## shadcn and Tailwind specifics

- **Accordion type.** Radix/shadcn `Accordion type="single"` (v0's default) closes the open item when another opens; `type="multiple"` does not. Core `scripts/capture.mjs --behaviors` reports which (`disclosurePairs[].closesPrevious`).
- **Select.** shadcn `Select` is a custom Radix popover. Rebuilt as a native `<select>`, add the caret back (core Form controls recipe).
- **lucide icons** are stroke-based SVGs: the core Icons recipe applies (`fill: none; stroke: currentcolor`).
- **Grid classes.** Tailwind `grid-cols-N` → core grid `columnCount:N`; `md:grid-cols-N` (one column on mobile) → `core/columns` with `isStackedOnMobile:true` (core Grid column count recipe).
- **Hero tint.** A v0 hero usually tints its photo with `absolute inset-0 bg-black/40`. Rebuild it as the cover's own overlay (core Cover overlay recipe).
