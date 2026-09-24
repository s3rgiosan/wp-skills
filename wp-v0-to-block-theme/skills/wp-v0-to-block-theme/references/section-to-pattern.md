# Segmenting a v0 page into patterns, parts, and templates

## Map the routes first

A v0 export is often several pages. List every route before segmenting:

- In the downloaded code, each `app/**/page.tsx` (App Router) or `pages/**/*.tsx` (Pages Router) is a route. Dynamic segments (`[slug]`) are content types, not single pages.
- Give each route a WordPress home:

| v0 route | WordPress home |
|---|---|
| `/` | `templates/front-page.html` |
| A static page (`/about`, `/pricing`) | A Page whose content references the section patterns, rendered by `page.html` (or `page-<slug>.html` when its chrome differs) |
| A list of articles (`/blog`) | The posts page, rendered by `home.html` / `archive.html` with a Query Loop |
| One article (`/blog/[slug]`) | `templates/single.html` |
| Anything else dynamic (`/products/[id]`) | Raise it: a custom post type or a plugin, not a theme template alone |

- Write the route list to a file and pass it to `capture.mjs --routes`. Use the same file later for the WordPress capture, so `compare.mjs` pairs the routes.
- `<Link href>` becomes a real link. A `<button onClick={() => router.push(…)}>` also becomes a link (`core/button` with a URL, or an `<a>`), not a button. `capture.mjs --behaviors` reports these as `navigatedTo`.

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

**Header variants.** A v0 home page often has a transparent `fixed` header over the hero, and a solid header elsewhere. Compare `header.atTop` in the `sections-*.json` of each route. Build one header part plus a modifier class (for example `is-overlay`) set by the front-page template. Use a second part (`parts/header-overlay.html`) only when the markup differs. If the header also changes on scroll, see the scroll recipe in `interactivity-recipes.md`.

**Sticky footer.** v0 page roots are often `min-h-screen flex flex-col`, which keeps the footer at the bottom of short pages. Once header and footer are template parts, that wrapper is gone. Recreate it once in the theme stylesheet:

```css
.wp-site-blocks { min-height: 100vh; display: flex; flex-direction: column; }
.wp-site-blocks > main { flex: 1; }
```

The `main` selector needs the template's content group to use `"tagName":"main"`.

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
<!-- wp:cover {"url":"<?php echo esc_url( get_theme_file_uri( 'assets/images/hero.webp' ) ); ?>","dimRatio":40,"align":"full"} -->
<div class="wp-block-cover alignfull">
  <!-- wp:heading {"level":1} -->
  <h1 class="wp-block-heading"><?php esc_html_e( 'Build faster', 'mytheme' ); ?></h1>
  <!-- /wp:heading -->
  <!-- more inner blocks: paragraph, buttons -->
</div>
<!-- /wp:cover -->
```

- **Slug** namespaced to the theme (`mytheme/...`).
- **Categories:** use categories core registers (e.g. `banner`, `call-to-action`, `testimonials`), or register the theme's own with `register_block_pattern_category()` in `functions.php`.
- **Translatable text.** Wrap every user-facing string: `esc_html_e()` for text, `esc_attr_e()` for attributes such as `alt`. Use `wp_kses_post()` around `__()` only when the string contains inline markup.
- **Theme URLs.** Build asset URLs with `get_theme_file_uri()`, escaped with `esc_url()`. Never hard-code a domain or `/wp-content/themes/…` path.
- **Copy.** Carry the design's exact text. Never invent or rewrite marketing copy. When the design has placeholder text or no text, keep it and list it in the handover notes.

## Images and media

v0 designs use `next/image`, remote stock photos (Unsplash, Pexels), and `/placeholder.svg`. None of these can stay as they are:

- Download every image the design renders into `assets/images/`. Convert photos to WebP. Keep SVGs as SVG.
- Reference them from patterns with `get_theme_file_uri()` (see the example above), never by a remote URL.
- `next/image` becomes `core/image` with explicit `width` and `height`, so the page does not shift while images load. Core adds `loading="lazy"` automatically; for the hero (LCP) image, core adds `fetchpriority="high"` to the first large image when it can. Check the result in the capture.
- List `/placeholder.svg` and generic stock photos in the handover notes as "needs a real asset". Do not ship them without saying so.
- Content images (a post's featured image, a team photo that editors will change) belong in the Media Library, not the theme. Theme assets are for design elements that ship with the theme.
- Check the licence of every stock photo before it ships.

## Content: pages, menus, blog

Templates and patterns do not create content. Set up the site so the routes resolve:

- **Pages.** Create one Page per static route, with `post_content` that references the section patterns (see "Pages reference patterns" below). Set `show_on_front=page` and `page_on_front` to the home page, and `page_for_posts` to the blog page if there is one.
- **Permalinks.** Set a pretty permalink structure (`wp rewrite structure '/%postname%/'`). With plain permalinks, every path renders the front page with status 200, and a route check passes by mistake.
- **Navigation.** `core/navigation` should reference a navigation menu (`"ref":<id>`), created from the design's links, so editors can change it. Do not hard-code the links in the header part.
- **Blog.** A design grid of article cards becomes `core/query` + `core/post-template`. Rebuild the card with `core/post-featured-image`, `core/post-title` (`"isLink":true`), `core/post-excerpt`, `core/post-date`, and `core/post-terms`, styled to match. Use the design's articles as sample posts only if the client agrees; otherwise, create clearly marked placeholders.
- **Related or "latest" strips** on other pages are also `core/query` blocks. Set the query (category, count, order) to what the design shows, not to the defaults.
- **Site identity.** The Next.js `metadata` export (`title`, `description`) gives the site title and tagline. The design's favicon becomes the Site Icon.

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

Only when the section carries behavior or data that core blocks cannot express: an interactive widget with no core equivalent, a form with no form solution in the project, or a dynamic query with custom output (the same rule as in shadcn-to-core-blocks.md). Static/visual sections are always patterns. Raise the custom-block decision before building it.

## Author shared elements once

An element that appears on several pages (a v0 component reused across routes) is authored **once**, as one block or one pattern. Variants are a modifier class, a block style, or block attributes on that one implementation, never a second copy with different markup. Two copies of the same element drift apart in markup and styling. Check for duplicates before handover.

## Bind repeated fields with the Block Bindings API

When a v0 section repeats a structured record backed by post meta rather than a query (team bios, pricing rows, stats), prefer binding core block attributes to that meta over a bespoke custom block. The Block Bindings API (WP 6.5+) connects an attribute in the saved markup to a data source; the block keeps its normal editor UI, and the source resolves the value on render.

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

A theme fix to the pattern then reaches every page that still holds the reference. Once an editor opens and saves the page, the editor stores the pattern's blocks in the page instead, and the page no longer follows the theme's pattern.
