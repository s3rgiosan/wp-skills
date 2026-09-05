# shadcn/ui → WordPress core blocks

v0 builds on shadcn/ui primitives. None port directly; approximate each with core blocks styled via theme.json tokens. Reach for a custom block only where the row says so — and raise it before building.

## Cheat sheet

| shadcn / v0 element | WordPress rebuild | Notes |
|---|---|---|
| `Button` | `core/button` (inside `core/buttons`) | Variants (default/outline/ghost) → button block styles or theme.json button `styles`. |
| `Card` | `core/group` (with padding, radius, border) + inner blocks | Card grids → `core/columns` or a Query loop pattern. |
| `Badge` | `core/paragraph` styled, or an inline `core/group` | Small pill; use a block style for the shape. |
| `Input` / `Textarea` / form | `core/group` + a forms plugin, or a custom block | Core has no form field block. Use the project's form solution (or WS Form / Fluent Forms if present); custom block only if none. |
| `Accordion` | `core/details` **or** custom Interactivity block | `core/details` covers simple cases with no JS. Animated/single-open accordions → Interactivity API (see interactivity-recipes.md). |
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
