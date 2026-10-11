# Design tokens → theme.json

A source skill's token script, or `scripts/css-tokens.mjs` on the design capture, emits a first pass. This file is the map for reviewing and refining that output by hand.

## Where the tokens come from

Use the best source the design has, in this order:

1. **A token file** the design ships (a design system's `tokens.json`, a Tailwind config or `@theme` block). Names and roles are explicit. The source skill says how to read it.
2. **CSS custom properties** on `:root`, or inline on the page root. Their names become palette slugs.
3. **Rendered values** only: hardcoded hex and px in inline styles. `css-tokens.mjs` ranks what the pages paint (backgrounds by area, text by length, borders by count) and drafts the presets from that.

With a token file, still run `css-tokens.mjs` on the capture as a cross-check: a color the pages paint but the file lacks is a hardcoded value to fold into the palette.

## Mapping table

| Design token | theme.json | Notes |
|---|---|---|
| Color | `settings.color.palette[]` → `{ slug, color, name }` | Hex. See Semantic color decisions. |
| Font family | `settings.typography.fontFamilies[]` → `{ slug, fontFamily, name }` | Keep the full stack string; self-host the files (Fonts below). |
| Font size | `settings.typography.fontSizes[]` → `{ slug, size, name }` | Prefer `fluid` (below) for headings. Carry line height into `styles`. |
| Spacing | `settings.spacing.spacingSizes[]` → `{ slug, size, name }` | Set `settings.spacing.units` to what the design uses (`rem`, `px`, `%`, `vw`). |
| Radius | `settings.custom.radius.<name>` | No core radius preset exists; expose as custom, consume as `var(--wp--custom--radius--<name>)`. |
| Shadow | `settings.shadow.presets[]` → `{ slug, shadow, name }` | Keep only the shadows the design uses. |
| Container / max width | `settings.layout.contentSize`, `settings.layout.wideSize` | Read from the design's main content column and full-bleed width. |

## Spacing scale

Design spacing is usually **fixed per breakpoint**: a section's padding is one value at desktop and another below a breakpoint. A generic fluid `clamp(min, vw, max)` scale overshoots at desktop, where the clamp hits its max — sections and gaps render taller and looser than the design.

Derive the preset scale from the design's real spacing:

- Read the actual desktop spacing from the desktop `styles-*.json` / `computed-*.json`, or from the source's spacing tokens.
- Cap each preset's `max` at that desktop value; keep a smaller `min` for a gentle mobile taper. Use the `vw` term only for that taper, so no preset grows past the design.
- Include every step the design uses, down to the small gaps. A coarse scale skips them, and the rebuild rounds them up.

`settings.spacing.spacingSizes[]` has no `fluid` key (unlike `typography.fontSizes[]`) — a `fluid` object on a spacing entry is silently ignored and the preset never tapers. Express a fluid/tapering spacing preset by putting a `clamp()` directly in `size`; cap the clamp's max at the design's real desktop value and use the `vw` term only for a gentle mobile taper:

```json
{ "slug": "60", "name": "Large",
  "size": "clamp(1rem, 1rem + 1vw, 1.5rem)" }
```

Patterns consume presets (`var:preset|spacing|*`); never inline rem in pattern markup.

## Translucent surfaces

A translucent color (a 20% white border, a 40% black overlay) becomes a translucent version of a palette preset, so the color stays tied to the theme and follows style variations:

```css
background-color: oklch(from var(--wp--preset--color--background) l c h / 80%);
```

Never a raw `rgb(255 255 255 / 20%)` / `rgba(...)` literal — those drift from the palette and break under a dark or alternate style variation.

The relative color syntax `oklch(from …)` needs Safari 16.4+ and Chrome 119+ (2023) or Firefox 128+ (2024); there is no fallback for old WebViews, so confirm the project's browser support before relying on it.

## Fluid typography

Design headings are often responsive (clamp, or a different size per breakpoint). Prefer theme.json fluid sizes over fixed:

```json
{ "slug": "xx-large", "name": "XX Large", "size": "3rem",
  "fluid": { "min": "2rem", "max": "3rem" } }
```

Set the min from the mobile capture, the max from the desktop capture (the per-breakpoint `styles-*.json` from `capture.mjs`). `css-tokens.mjs` does this when the same elements render smaller at the narrowest breakpoint.

A design drawn at one width only has no mobile sizes to read: its display headings render at desktop size on a phone. Give those headings a fluid `min` anyway, and record the chosen values in `CONVERSION-NOTES.md`.

Per-size `fluid` takes effect only when `settings.typography.fluid: true` is also set (it defaults to `false`) — set it globally, or the plain `size` renders unclamped.

## Consolidate the scale

A first pass lists every size the pages render. Fold near-duplicates (15px and 16px body text, a 14.4px size from an `em` calculation) into one step, and keep 6–10 font sizes and 6–10 spacing steps. Name font sizes by size (`small` … `xx-large`) and spacing by the core convention: numeric slugs from `20` in steps of 10 (`20` is 2X-Small, `50` Medium), as `css-tokens.mjs` writes them. Record each fold in `CONVERSION-NOTES.md` when it changes a rendered value by more than 1px.

## Semantic color decisions

- Map only the colors the design **uses**. A palette of 8–15 named entries beats dumping a full scale.
- Rename machine slugs to their role: the page ground `base`, the main text `contrast`, the brand color `accent`, and so on. A custom property name from the source (`--primary`) is a good slug when it already names the role.
- Palette values must be hex, `rgb()` or `hsl()`, never `oklch()`, `oklab()`, `lab()`, `lch()` or `color()`. The block editor's contrast checker parses colors with colord, which has no OKLCH support, so an OKLCH palette makes it flag every text/background pairing as low contrast, even 13:1 ones, and editors learn to ignore the warning. `css-tokens.mjs` reads colors as painted, so it always emits sRGB hex. Revisit once core's contrast checker reads OKLCH.
  - A value outside sRGB is clipped per channel, as browsers render it on sRGB screens. Check it against the design capture.
  - OKLCH stays fine in stylesheets: the relative color syntax above works on hex presets.
- Give every palette entry a human `name` — it shows in the editor color picker.
- Hover and active colors are not painted at rest, so a capture does not rank them. Read them from the source (custom properties, `:hover` rules) and add them.

## Fonts

1. Download the woff2 files for the weights the design uses into `assets/fonts/`. Use the font's official source (Google Fonts, the foundry), and check that its licence allows self-hosting. Never leave a Google Fonts `<link>` or a remote `@font-face` in the theme.
2. Declare each family with `fontFace` so WordPress loads it:

   ```json
   {
     "slug": "sans",
     "name": "Inter",
     "fontFamily": "Inter, ui-sans-serif, system-ui, sans-serif",
     "fontFace": [
       {
         "fontFamily": "Inter",
         "fontWeight": "100 900",
         "fontStyle": "normal",
         "fontDisplay": "swap",
         "src": [ "file:./assets/fonts/inter-variable.woff2" ]
       }
     ]
   }
   ```

3. A stack that starts with a variable (`var(--font-sans)`) is set at runtime by the source framework; replace it with the real family name.

## After the script

1. Start every `theme.json` the skill emits with the current schema and version:

   ```json
   {
     "$schema": "https://schemas.wp.org/trunk/theme.json",
     "version": 3
   }
   ```

   `version: 3` is current (WP 6.6+); `$schema` gives editor validation and autocomplete.
2. Rename machine slugs to intent (`color-3` → `border` if that is its role in the design). Keep digits out of the middle of a slug: WordPress kebab-cases preset slugs for the CSS it generates, so `title-3xl` becomes `--wp--preset--font-size--title-3-xl` and `.has-title-3-xl-font-size`, while the block's saved class stays `has-title-3xl-font-size` and matches nothing. Use `title-xxxl`, or a number on its own (`display-2`, spacing `20`).
3. Delete unused entries.
4. Review `styles` (base): body font family/size/color, heading scale, link color — these belong in theme.json `styles`. `css-tokens.mjs` drafts body and heading styles from the most used values per tag.
5. Set `settings.appearanceTools: true` (or the granular flags the design needs) and `settings.layout` sizes. When the content column has side padding, subtract it from `wideSize` and set it as root padding (`styles.spacing.padding`).
6. Hide core's default presets so editors pick only from the design's tokens: `settings.color.defaultPalette: false`, `settings.color.defaultGradients: false`, `settings.typography.defaultFontSizes: false`, `settings.spacing.defaultSpacingSizes: false`.
7. Set `styles.spacing.blockGap` to the design's vertical rhythm, or to `0` if sections carry their own padding. Core's default gap otherwise adds a margin between every top-level block, and all sections sit lower than in the design.

## Dark mode → style variation

A design with light and dark values for the same custom properties (`:root` and `.dark`, `[data-theme="dark"]`, or `@media (prefers-color-scheme: dark)`) maps the light set to the base palette and the dark set to a style variation in `/styles/`. `css-tokens.mjs --dark-out styles/dark.json` writes it when dark rules override `:root` colors.

A variation's palette **replaces** the base palette as a whole; it is not merged by slug. The variation must therefore list every palette entry, including those that are the same in both modes. A variation with only the changed colors removes the others. The scripts write the full palette.

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
        { "slug": "base", "color": "#0a0a0a", "name": "Base" },
        { "slug": "contrast", "color": "#fafafa", "name": "Contrast" }
      ]
    }
  }
}
```

The base `theme.json` styles already point at the slugs (`var:preset|color|base`), so the new values apply everywhere. Add a `styles` block to the variation only for what changes beyond the colors.

The variation appears in the Site Editor under Styles → Browse styles. It is a **site-wide choice made by an admin**; visitors see whichever variation is active.

A design that follows the visitor's system setting (`prefers-color-scheme`) or has a visitor-facing toggle is not reproduced by a style variation. It needs:

- the dark values as CSS custom properties overriding the `--wp--preset--color--*` variables, under the media query or a class on `<html>`;
- for a toggle, an Interactivity store that sets the class and stores the choice, and an inline script in `<head>` that applies the stored choice before first paint, so the page does not flash light.

Raise either as a decision before building it.
