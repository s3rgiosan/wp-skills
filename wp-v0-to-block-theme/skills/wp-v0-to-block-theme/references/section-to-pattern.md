# Segmenting a v0 page into patterns, parts, and templates

## Segment the page

Walk the captured DOM top to bottom and split at the design's natural section boundaries (usually top-level `<section>`, `<header>`, `<footer>`, or a full-bleed band with its own background). Each becomes one of:

| Design element | WordPress home |
|---|---|
| Site header / nav | `parts/header.html` (template part) |
| Site footer | `parts/footer.html` (template part) |
| A reusable content band (hero, features, CTA, testimonials, pricing, FAQ) | `patterns/<slug>.php` (block pattern) |
| A whole page's composition | `templates/*.html` (template) referencing parts + patterns |

Rule of thumb: **anything that repeats or could be reused → pattern; the two site-wide chrome pieces → parts; the page skeletons → templates.**

## Templates to create

Start with what the design has; add the rest as needed:

- `index.html` (fallback, required)
- `front-page.html` (the v0 landing page)
- `page.html`, `single.html`, `archive.html`, `search.html`, `404.html`

Each template = header part + one or more patterns + footer part.

## Pattern file format

Register patterns via PHP file headers in `patterns/`. Auto-registered by the theme; no PHP registration call needed.

```php
<?php
/**
 * Title: Hero
 * Slug: mytheme/hero
 * Categories: featured, banner
 * Description: Full-width hero with heading, subheading, and call to action.
 */
?>
<!-- wp:cover {"url":"...","dimRatio":40,"align":"full"} -->
<div class="wp-block-cover alignfull">
  <!-- inner blocks: heading, paragraph, buttons -->
</div>
<!-- /wp:cover -->
```

- **Slug** namespaced to the theme (`mytheme/...`).
- **Categories** from core (`featured`, `call-to-action`, `banner`, `gallery`, `testimonials`, `pricing`, `posts`) or a custom category registered in `functions.php`.
- Keep translatable strings wrapped and escaped where PHP emits dynamic values; static block markup is fine as-is.

## Block markup rules

- Patterns are **serialized block markup** (`<!-- wp:... -->` comments), not JSX and not raw HTML.
- Reference tokens, not literals: colors as `{"backgroundColor":"primary"}` / `var:preset|color|primary`, spacing via spacing presets, font sizes via `{"fontSize":"large"}`.
- Use `align":"full"` / `"wide"` for full-bleed and wide bands; set `contentSize`/`wideSize` in theme.json so they resolve.
- Prefer layout via block `layout` attributes (`flex`, `grid`, `constrained`) over custom CSS.

## When a section needs a custom block

Only when the section carries behavior or data that core blocks cannot express (interactive widget, a dynamic query with custom output). Static/visual sections are always patterns. Raise the custom-block decision before building it.
