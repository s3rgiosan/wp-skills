# Tailwind → theme.json token mapping

`scripts/tokens.mjs` emits a first pass from the Tailwind source. This file covers what is specific to Tailwind, shadcn/ui and Next.js. For everything WordPress-side (spacing scale, fluid type, palette rules, fonts, defaults to hide, dark variation shape), read the core `references/theme-json-tokens.md`.

## Where v0 keeps tokens

- **Tailwind v4** (common in recent v0 exports): design tokens live in CSS as `@theme { --color-*, --font-*, --text-*, --spacing-*, --radius-*, --shadow-* }`, usually in `app/globals.css`.
- **Tailwind v3**: tokens live in `tailwind.config.{js,ts,cjs,mjs}` under `theme` / `theme.extend`.
- shadcn/ui adds semantic CSS variables (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, …) in `:root` / `.dark`. These are the **semantic** layer; map the ones the design actually uses to named palette entries.
- In the current shadcn v4 shape, `@theme inline` only aliases them (`--color-background: var(--background)`) and the real values live in `:root` / `.dark`. `tokens.mjs` resolves those `var()` references against `:root`. For a v3 config (`hsl(var(--primary))`), pass the stylesheet with `--css globals.css` so the same resolution runs.

`tokens.mjs` skips token sub-properties (`--text-xl--line-height`), `--font-weight-*`, and `initial` resets, and prints a warning for every reference it cannot resolve. Handle each warning by hand.

Run the core `css-tokens.mjs` on the design capture as well. It ranks what the pages actually paint, which shows which Tailwind tokens the design uses and catches arbitrary values (`bg-[#1a1a1a]`) that no token names.

## Mapping table

| Tailwind | theme.json | Notes |
|---|---|---|
| `colors.<name>` / `--color-<name>` | `settings.color.palette[]` → `{ slug, color, name }` | Flatten nested objects: `primary.DEFAULT` → `primary`; `primary.500` → `primary-500`. |
| `fontFamily.<name>` / `--font-<name>` | `settings.typography.fontFamilies[]` → `{ slug, fontFamily, name }` | Keep the full stack string. v0 loads fonts with `next/font`; see Fonts below. |
| `fontSize.<name>` / `--text-<name>` | `settings.typography.fontSizes[]` → `{ slug, size, name }` | If the Tailwind value is a `[size, { lineHeight }]` tuple, take the size; carry lineHeight into `styles` where it matters. |
| `spacing.<name>` / `--spacing-*` | `settings.spacing.spacingSizes[]` → `{ slug, size, name }` | Keep the numeric scale. |
| `borderRadius.<name>` / `--radius-*` | `settings.custom.radius.<name>` | |
| `boxShadow.<name>` / `--shadow-*` | `settings.shadow.presets[]` → `{ slug, shadow, name }` | |

## Spacing from Tailwind classes

Tailwind spacing is fixed per breakpoint (`py-*`, `gap-*`, `mt-*` resolve to set rem values: `py-6` = 1.5rem, `gap-2` = 0.5rem). Read the desktop steps from the classes, then build the scale per the core Spacing scale section.

Tailwind v4 derives utilities like `gap-8` from an implicit base unit (`--spacing` × N) even when no `--spacing-8` var is declared. `tokens.mjs` reports the base unit but cannot know which multiples the design uses. Derive those steps from the classes in the markup, or from the `css-tokens.mjs` spacing tally.

`tokens.mjs` emits bare numeric spacing slugs (`"4"`, `"16"`) whose `name` is also the digit; rename them to a named scale.

## Opacity modifiers

Tailwind opacity modifiers (`bg-background/80`, `bg-black/40`) become a translucent version of a palette preset; see the core Translucent surfaces section.

## shadcn color values

- shadcn semantic variables come in two shapes:
  - A bare channel triple (`--primary: 222 47% 11%`), consumed via `hsl(var(--primary))` — compute it to a concrete hex/hsl value for the palette.
  - A full color function value (`oklch(0.205 0 0)`, `hsl(...)`, `rgb(...)`, common in recent shadcn/v4 exports) — already complete, with no wrapper needed. Carry `hsl()`/`rgb()` as-is; `tokens.mjs` converts `oklch()`/`oklab()` to sRGB hex (`#rrggbbaa` when translucent), following CSS Color 4, and warns about any value the editor's contrast checker still cannot read.
- `tokens.mjs` emits only the colors that `@theme` names (resolving their `:root` values). A `:root` variable that no `@theme` entry aliases, but that components use directly (`bg-[var(--brand)]`), is not emitted. Hand-add it if the design uses it.
- Tailwind v4's default font sizes (`text-sm` … `text-9xl`) are not declared in `globals.css`, so `tokens.mjs` cannot see them. Take the sizes the design uses from the `css-tokens.mjs` output or `computed-*.json`.

## Fonts

v0 loads fonts with `next/font` (Geist, Inter, …). The CSS only has a variable such as `var(--font-geist-sans)`, which `next/font` sets at runtime, and `tokens.mjs` warns about it. Self-host the files and declare them with `fontFace` per the core Fonts section, then replace the `var(--font-…)` value in the emitted stack with the real family name.

## Dark mode

shadcn ships `:root` (light) and `.dark` as two sets of the same CSS variables. `tokens.mjs --dark-out styles/dark.json` writes the `.dark` set as a style variation with the full palette (the core Dark mode section has the shape and the replace-not-merge rule).

A visitor-facing theme toggle (`next-themes`) is not reproduced by a style variation; see the core section for what it needs, and raise it as a decision before building it.
