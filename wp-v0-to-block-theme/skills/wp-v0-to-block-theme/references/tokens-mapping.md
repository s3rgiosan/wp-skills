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

## Fluid typography

v0 headings are frequently responsive (clamp, or different `text-*` per breakpoint). Prefer theme.json fluid sizes over fixed:

```json
{ "slug": "xx-large", "name": "XX Large", "size": "3rem",
  "fluid": { "min": "2rem", "max": "3rem" } }
```

Set the min from the mobile capture, the max from the desktop capture (see the per-breakpoint `computed-*.json` from `capture.mjs`).

## Semantic color decisions

- Map only the colors the design **uses**, not every Tailwind default. A palette of 8–15 named entries beats dumping the full scale.
- shadcn HSL channel triples (`--primary: 222 47% 11%`) resolve through `hsl(var(--primary))`. When emitting a theme.json palette, resolve to a concrete color value (compute the `hsl(...)`), not the raw channel triple.
- Give every palette entry a human `name` — it shows in the editor color picker.

## After the script

1. Rename machine slugs to intent (`gray-900` → `foreground` if that is its role in the design).
2. Delete unused entries.
3. Add `styles` (base): body font family/size/color, heading scale, link color — these are theme.json `styles`, not `settings`.
4. Set `settings.appearanceTools: true` (or the granular flags the design needs) and `settings.layout` sizes.
