# Tailwind → theme.json token mapping

`scripts/tokens.mjs` emits a first pass. This file is the map for reviewing and refining that output by hand.

## Where v0 keeps tokens

- **Tailwind v4** (common in recent v0 exports): design tokens live in CSS as `@theme { --color-*, --font-*, --text-*, --spacing-*, --radius-* }`, usually in `app/globals.css`.
- **Tailwind v3**: tokens live in `tailwind.config.{js,ts,cjs,mjs}` under `theme` / `theme.extend`.
- shadcn/ui adds semantic CSS variables (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, …) in `:root` / `.dark`, often as HSL channel triples. These are the **semantic** layer; map the ones the design actually uses to named palette entries.

## Mapping table

| Tailwind | theme.json | Notes |
|---|---|---|
| `colors.<name>` / `--color-<name>` | `settings.color.palette[]` → `{ slug, color, name }` | Flatten nested objects: `primary.DEFAULT` → `primary`; `primary.500` → `primary-500`. |
| `fontFamily.<name>` / `--font-<name>` | `settings.typography.fontFamilies[]` → `{ slug, fontFamily, name }` | Keep the full stack string. Bundle self-hosted fonts via `fontFace` if the design ships them. |
| `fontSize.<name>` / `--text-<name>` | `settings.typography.fontSizes[]` → `{ slug, size, name }` | If the Tailwind value is a `[size, { lineHeight }]` tuple, take the size; carry lineHeight into `styles` where it matters. Prefer `fluid` (below) for headings. |
| `spacing.<name>` / `--spacing-*` | `settings.spacing.spacingSizes[]` → `{ slug, size, name }` | Keep the numeric scale. Set `settings.spacing.units` to what the design uses (`rem`, `px`, `%`, `vw`). |
| `borderRadius.<name>` / `--radius-*` | `settings.custom.radius.<name>` | No core radius preset exists; expose as custom, consume as `var(--wp--custom--radius--<name>)`. |
| `boxShadow.<name>` | `settings.shadow.presets[]` | Optional; only if the design leans on shadows. |
| container / max width | `settings.layout.contentSize`, `settings.layout.wideSize` | Read from the design's main content column and full-bleed width. |

## Spacing scale

v0/Tailwind spacing is effectively **fixed per breakpoint** (`py-*`, `gap-*`, `mt-*` resolve to set rem values), not fluid. A generic fluid `clamp(min, vw, max)` scale overshoots at desktop, where the clamp hits its max — sections and gaps render taller and looser than the design.

Derive the preset scale from the design's real spacing:

- Read the actual desktop spacing from the Tailwind classes (`py-6` = 1.5rem, `gap-2` = 0.5rem, …) or the desktop `computed-*.json`.
- Cap each preset's `max` at that desktop value; keep a smaller `min` for a gentle mobile taper. Use the `vw` term only for that taper, not to exceed the design.
- Add an `x-small` step (`0.5rem` / 8px) — designs lean on tight gaps that a coarse scale skips.

Tailwind v4 derives utilities like `gap-8` from an implicit base unit (`--spacing` × N) even when no `--spacing-8` var is declared, so `scripts/tokens.mjs` cannot see or compute that value — derive any such missing step by hand from the base unit.

`settings.spacing.spacingSizes[]` has no `fluid` key (unlike `typography.fontSizes[]`) — a `fluid` object on a spacing entry is silently ignored and the preset never tapers. Express a fluid/tapering spacing preset by putting a `clamp()` directly in `size`; cap the clamp's max at the design's real desktop value and use the `vw` term only for a gentle mobile taper:

```json
{ "slug": "large", "name": "Large",
  "size": "clamp(1rem, 1rem + 1vw, 1.5rem)" }
```

Patterns consume presets (`var:preset|spacing|*`); never inline rem in pattern markup.

## Translucent surfaces

Derive every translucent overlay/surface from a palette preset, so it stays tied to the theme and tracks style variations:

```css
background-color: oklch(from var(--wp--preset--color--base) l c h / 20%);
```

Never a raw `rgb(255 255 255 / 20%)` / `rgba(...)` literal — those drift from the palette and break under a dark or alternate style variation.

The relative color syntax `oklch(from …)` needs a modern browser (Chrome/Safari/Firefox 2024+); there is no fallback for old WebViews, so confirm the project's browser support before relying on it.

## Fluid typography

v0 headings are frequently responsive (clamp, or different `text-*` per breakpoint). Prefer theme.json fluid sizes over fixed:

```json
{ "slug": "xx-large", "name": "XX Large", "size": "3rem",
  "fluid": { "min": "2rem", "max": "3rem" } }
```

Set the min from the mobile capture, the max from the desktop capture (see the per-breakpoint `computed-*.json` from `capture.mjs`).

Per-size `fluid` takes effect only when `settings.typography.fluid: true` is also set (it defaults to `false`) — set it globally, or the plain `size` renders unclamped.

## Semantic color decisions

- Map only the colors the design **uses**, not every Tailwind default. A palette of 8–15 named entries beats dumping the full scale.
- shadcn semantic variables come in two shapes:
  - A bare channel triple (`--primary: 222 47% 11%`), consumed via `hsl(var(--primary))` — compute it to a concrete hex/hsl value for the palette.
  - A full color function value (`oklch(0.205 0 0)`, `hsl(...)`, `rgb(...)`, common in recent shadcn/v4 exports) — already complete; carry it into the palette as-is (or convert to the project's preferred color space), not as channels needing a wrapper.
- Give every palette entry a human `name` — it shows in the editor color picker.
- `scripts/tokens.mjs` only scans `@theme { … }` bodies. shadcn semantic vars declared in a bare `:root { }` (outside `@theme`) — `--background`, `--foreground`, etc. — are not captured; hand-add the ones the design uses to the palette.

## After the script

1. Start every `theme.json` the skill emits with the current schema and version:

   ```json
   {
     "$schema": "https://schemas.wp.org/trunk/theme.json",
     "version": 3
   }
   ```

   `version: 3` is current (WP 6.6+); `$schema` gives editor validation and autocomplete.
2. Rename machine slugs to intent (`gray-900` → `foreground` if that is its role in the design). This applies to spacing too: the script emits bare numeric spacing slugs (`"4"`, `"16"`) whose `name` is also the digit; rename them to a named scale (`x-small`/`small`/`medium`/`large`) matching the Spacing scale section above.
3. Delete unused entries.
4. Add `styles` (base): body font family/size/color, heading scale, link color — these are theme.json `styles`, not `settings`.
5. Set `settings.appearanceTools: true` (or the granular flags the design needs) and `settings.layout` sizes.

## Dark mode → style variation

shadcn ships `:root` (light) and `.dark` as two sets of the same CSS variables. Map `:root` to the base theme.json `styles` and `.dark` to a partial style variation in `/styles/`:

```json
// styles/dark.json
{
  "$schema": "https://schemas.wp.org/trunk/theme.json",
  "version": 3,
  "title": "Dark",
  "settings": {
    "color": {
      "palette": [
        { "slug": "background", "color": "#0a0a0a", "name": "Background" },
        { "slug": "foreground", "color": "#fafafa", "name": "Foreground" }
      ]
    }
  },
  "styles": {
    "color": {
      "background": "var(--wp--preset--color--background)",
      "text": "var(--wp--preset--color--foreground)"
    }
  }
}
```

Pull the dark values from the `.dark` block's CSS variables. Once registered, the variation appears as a selectable option in the Site Editor under Styles → Browse styles — this is the current mechanism for dark mode in a block theme, not a CSS media query in the stylesheet.
