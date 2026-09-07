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

Optional headers bind a pattern to a specific slot instead of leaving it as a general-purpose inserter pattern:

- **Block Types** — binds the pattern to a block or template-part area (e.g. `core/template-part/header`), so it's offered where that block/area is edited.
- **Post Types** — restricts the pattern to specific post types.
- **Template Types** — restricts the pattern to specific templates (e.g. `front-page`, `single`).
- **Inserter: no** — hides a template-bound pattern from the general inserter, since it's meant to fill one slot, not be inserted anywhere.

Header/footer example, so the pattern surfaces in the Site Editor's header template-part picker rather than the general inserter:

```php
<?php
/**
 * Title: Header
 * Slug: mytheme/header
 * Categories: header
 * Block Types: core/template-part/header
 * Inserter: no
 */
```

theme.json declares the matching part areas so the Site Editor knows where each template part belongs:

```json
"templateParts": [
  { "name": "header", "title": "Header", "area": "header" },
  { "name": "footer", "title": "Footer", "area": "footer" }
]
```

## Block markup rules

- Patterns are **serialized block markup** (`<!-- wp:... -->` comments), not JSX and not raw HTML.
- Reference tokens, not literals: colors as `{"backgroundColor":"primary"}` / `var:preset|color|primary`, spacing via spacing presets, font sizes via `{"fontSize":"large"}`.
- Use `align":"full"` / `"wide"` for full-bleed and wide bands; set `contentSize`/`wideSize` in theme.json so they resolve.
- Prefer layout via block `layout` attributes (`flex`, `grid`, `constrained`) over custom CSS.

## When a section needs a custom block

Only when the section carries behavior or data that core blocks cannot express (interactive widget, a dynamic query with custom output). Static/visual sections are always patterns. Raise the custom-block decision before building it.

## Author shared elements once

A cross-page element (breadcrumbs, eyebrows, section headings, cards, search) is authored **once** — one block or one pattern — and varied by a modifier class or block attributes, never re-authored inline for a variant. A light-on-dark breadcrumb over a dark hero is an `is-inverted` modifier on the same block (`get_block_wrapper_attributes()` carries `className`), styled in the same stylesheet — not a second implementation with different markup. Reviewing for duplicate implementations of the same element is a checklist item: divergent markup means divergent styling.

## Facets and counts need a real query

When a section shows counts or facets (filter chips with per-group counts, muted-zero states), plan a **query module** — cached, invalidated on write — rather than assuming a block attribute or `term->count`. `term->count` is wrong whenever items are tagged on descendant taxa; use a descendant-inclusive (`include_children`) count. Keep the facet mechanism server-side (core query + query-filter + a custom block), not a client-side filter.

If a facet count needs to resync after a client-side navigation, see interactivity-recipes.md's Cross-region state section for `getServerState()` / `getServerContext()`.

## Bind repeated fields with the Block Bindings API

When a v0 section repeats a structured record backed by post meta rather than a query (team bios, pricing rows, stats), prefer binding core block attributes to that meta over a bespoke custom block. The Block Bindings API (WP 6.7+) connects an attribute in the saved markup to a data source; the block keeps its normal editor UI, and the source resolves the value on render.

- **Built-in `core/post-meta` source** — bind a paragraph's or heading's content, an image's `url`/`alt`, or a button's `url`/text to a registered meta key via the block's `metadata.bindings` attribute. The meta key must be registered with `show_in_rest => true` (and can't start with an underscore) to be bindable in the editor.
- **`register_block_bindings_source()`** for anything `core/post-meta` doesn't cover (a computed value, a related object's field) — register a named source, with a label and a value callback, from an `init` hook.

Minimal example: a heading bound to a `subtitle` meta field, with static fallback content for when the binding can't resolve:

```html
<!-- wp:heading {
  "metadata":{
    "bindings":{
      "content":{
        "source":"core/post-meta",
        "args":{"key":"subtitle"}
      }
    }
  }
} -->
<h2 class="wp-block-heading">Fallback subtitle</h2>
<!-- /wp:heading -->
```

Custom source registration shape, for reference:

```php
add_action(
    'init',
    function () {
        register_block_bindings_source(
            'mytheme/team-role',
            array(
                'label'              => __( 'Team role', 'mytheme' ),
                'get_value_callback' => function ( array $source_args, $block_instance ) {
                    $post_id = $block_instance->context['postId'];
                    return get_post_meta( $post_id, $source_args['key'], true );
                },
                'uses_context'       => array( 'postId' ),
            )
        );
    }
);
```

A binding replaces one attribute at a time, so a record with several fields (name, role, photo) needs one binding per attribute, each pointing at its own meta key — repeated per record inside the pattern.

## Pages reference patterns, not flattened copies

A page built from a theme pattern should store a reference in `post_content`:

```html
<!-- wp:pattern {"slug":"mytheme/about-intro"} /-->
```

so a later edit to the pattern propagates to every page using it. An importer that **flattens** pattern output into `post_content` freezes a copy — theme pattern fixes never reach it, and the divergence is invisible until you edit the pattern and one page doesn't change. Flattened pages must be re-imported (or edited) to adopt changes. See the **wp-migration-playbook** skill for import-time handling.
