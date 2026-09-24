# Tailwind → theme.json token mapping

`scripts/tokens.mjs` emits a first pass. This file is the map for reviewing and refining that output by hand.

## Where v0 keeps tokens

- **Tailwind v4** (common in recent v0 exports): design tokens live in CSS as `@theme { --color-*, --font-*, --text-*, --spacing-*, --radius-*, --shadow-* }`, usually in `app/globals.css`.
- **Tailwind v3**: tokens live in `tailwind.config.{js,ts,cjs,mjs}` under `theme` / `theme.extend`.
- shadcn/ui adds semantic CSS variables (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, …) in `:root` / `.dark`. These are the **semantic** layer; map the ones the design actually uses to named palette entries.
- In the current shadcn v4 shape, `@theme inline` only aliases them (`--color-background: var(--background)`) and the real values live in `:root` / `.dark`. `tokens.mjs` resolves those `var()` references against `:root`. For a v3 config (`hsl(var(--primary))`), pass the stylesheet with `--css globals.css` so the same resolution runs.

`tokens.mjs` skips token sub-properties (`--text-xl--line-height`), `--font-weight-*`, and `initial` resets, and prints a warning for every reference it cannot resolve. Handle each warning by hand.

## Mapping table

| Tailwind | theme.json | Notes |
|---|---|---|
| `colors.<name>` / `--color-<name>` | `settings.color.palette[]` → `{ slug, color, name }` | Flatten nested objects: `primary.DEFAULT` → `primary`; `primary.500` → `primary-500`. |
| `fontFamily.<name>` / `--font-<name>` | `settings.typography.fontFamilies[]` → `{ slug, fontFamily, name }` | Keep the full stack string. v0 loads fonts with `next/font`; see Fonts below. |
| `fontSize.<name>` / `--text-<name>` | `settings.typography.fontSizes[]` → `{ slug, size, name }` | If the Tailwind value is a `[size, { lineHeight }]` tuple, take the size; carry lineHeight into `styles` where it matters. Prefer `fluid` (below) for headings. |
| `spacing.<name>` / `--spacing-*` | `settings.spacing.spacingSizes[]` → `{ slug, size, name }` | Keep the numeric scale. Set `settings.spacing.units` to what the design uses (`rem`, `px`, `%`, `vw`). |
| `borderRadius.<name>` / `--radius-*` | `settings.custom.radius.<name>` | No core radius preset exists; expose as custom, consume as `var(--wp--custom--radius--<name>)`. |
| `boxShadow.<name>` / `--shadow-*` | `settings.shadow.presets[]` → `{ slug, shadow, name }` | Keep only the shadows the design uses. |
| container / max width | `settings.layout.contentSize`, `settings.layout.wideSize` | Read from the design's main content column and full-bleed width. |

## Spacing scale

v0/Tailwind spacing is effectively **fixed per breakpoint** (`py-*`, `gap-*`, `mt-*` resolve to set rem values), not fluid. A generic fluid `clamp(min, vw, max)` scale overshoots at desktop, where the clamp hits its max — sections and gaps render taller and looser than the design.

Derive the preset scale from the design's real spacing:

- Read the actual desktop spacing from the Tailwind classes (`py-6` = 1.5rem, `gap-2` = 0.5rem, …) or the desktop `computed-*.json`.
- Cap each preset's `max` at that desktop value; keep a smaller `min` for a gentle mobile taper. Use the `vw` term only for that taper, not to exceed the design.
- Include every step the design uses, down to the small gaps (`gap-1`, `gap-2`). A coarse scale skips them, and the rebuild rounds them up.

Tailwind v4 derives utilities like `gap-8` from an implicit base unit (`--spacing` × N) even when no `--spacing-8` var is declared. `scripts/tokens.mjs` reports the base unit but cannot know which multiples the design uses. Derive those steps by hand from the classes in the markup.

`settings.spacing.spacingSizes[]` has no `fluid` key (unlike `typography.fontSizes[]`) — a `fluid` object on a spacing entry is silently ignored and the preset never tapers. Express a fluid/tapering spacing preset by putting a `clamp()` directly in `size`; cap the clamp's max at the design's real desktop value and use the `vw` term only for a gentle mobile taper:

```json
{ "slug": "large", "name": "Large",
  "size": "clamp(1rem, 1rem + 1vw, 1.5rem)" }
```

Patterns consume presets (`var:preset|spacing|*`); never inline rem in pattern markup.

## Translucent surfaces

Tailwind opacity modifiers (`bg-background/80`, `bg-black/40`) become a translucent version of a palette preset, so the color stays tied to the theme and follows style variations:

```css
background-color: oklch(from var(--wp--preset--color--background) l c h / 80%);
```

Never a raw `rgb(255 255 255 / 20%)` / `rgba(...)` literal — those drift from the palette and break under a dark or alternate style variation.

The relative color syntax `oklch(from …)` needs Safari 16.4+ and Chrome 119+ (2023) or Firefox 128+ (2024); there is no fallback for old WebViews, so confirm the project's browser support before relying on it.

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
- `scripts/tokens.mjs` emits only the colors that `@theme` names (resolving their `:root` values). A `:root` variable that no `@theme` entry aliases, but that components use directly (`bg-[var(--brand)]`), is not emitted. Hand-add it if the design uses it.
- Tailwind v4's default font sizes (`text-sm` … `text-9xl`) are not declared in `globals.css`, so the script cannot see them. Add the sizes the design uses from the markup or `computed-*.json`.

## Fonts

v0 loads fonts with `next/font` (Geist, Inter, …). The CSS only has a variable such as `var(--font-geist-sans)`, which `next/font` sets at runtime, and `tokens.mjs` warns about it. In the theme:

1. Download the woff2 files for the weights the design uses into `assets/fonts/`. Use the font's official source, and check that its licence allows self-hosting.
2. Declare each family with `fontFace` so WordPress loads it:

   ```json
   {
     "slug": "sans",
     "name": "Geist",
     "fontFamily": "Geist, ui-sans-serif, system-ui, sans-serif",
     "fontFace": [
       {
         "fontFamily": "Geist",
         "fontWeight": "100 900",
         "fontStyle": "normal",
         "fontDisplay": "swap",
         "src": [ "file:./assets/fonts/geist-variable.woff2" ]
       }
     ]
   }
   ```

3. Replace the `var(--font-…)` value in the emitted stack with the real family name.

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
6. Hide core's default presets so editors pick only from the design's tokens: `settings.color.defaultPalette: false`, `settings.color.defaultGradients: false`, `settings.typography.defaultFontSizes: false`, `settings.spacing.defaultSpacingSizes: false`.
7. Set `styles.spacing.blockGap` to the design's vertical rhythm, or to `0` if sections carry their own padding. Core's default gap otherwise adds a margin between every top-level block, and all sections sit lower than in the design.

## Dark mode → style variation

shadcn ships `:root` (light) and `.dark` as two sets of the same CSS variables. Map `:root` to the base theme.json palette and `.dark` to a style variation in `/styles/`. `tokens.mjs --dark-out styles/dark.json` writes it.

A variation's palette **replaces** the base palette as a whole; it is not merged by slug. The variation must therefore list every palette entry, including those that are the same in both modes. A variation with only the changed colors removes the others. The script writes the full palette.

Shape (palette shortened):

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

The variation appears in the Site Editor under Styles → Browse styles. It is a **site-wide choice made by an admin**, not a switch for visitors.

If the v0 design has a visitor-facing theme toggle (`next-themes`), a style variation does not reproduce it. The toggle needs:

- an Interactivity store that sets a class on `<html>` and stores the choice;
- the dark values as CSS custom properties under that class, overriding the `--wp--preset--color--*` variables;
- an inline script in `<head>` that applies the stored choice before first paint, so the page does not flash light.

Raise the toggle as a decision before building it.
