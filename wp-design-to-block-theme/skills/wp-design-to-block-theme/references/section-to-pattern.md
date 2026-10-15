# Segmenting a design into patterns, parts, and templates

## Map the routes first

A design is often several pages. List every route before segmenting. The source skill says where a design's routes come from (a framework's page files, a canvas's artboards). A route that stands for many items (one article, one product) is a content type with a single template.

Give each route a WordPress home:

| Design route | WordPress home |
|---|---|
| `/` | `templates/front-page.html` |
| A static page (`/about`, `/pricing`) | A Page whose content references the section patterns, rendered by `page.html` (or `page-<slug>.html` when its chrome differs) |
| A list of articles (`/blog`) | The posts page, rendered by `home.html` / `archive.html` with a Query Loop |
| One article (`/blog/[slug]`) | `templates/single.html` |
| Anything else dynamic (`/products/[id]`) | Raise it: it needs a custom post type or a plugin, plus its template |

- Write the route list to a file and pass it to `capture.mjs --routes`. Use the same file later for the WordPress capture, so `compare.mjs` pairs the routes.
- A control that navigates becomes a real link (`core/button` with a URL, or an `<a>`), even when the design renders it as a button. `capture.mjs --behaviors` reports these as `navigatedTo`.

## Segment the page

Walk the captured DOM top to bottom and split at the design's natural section boundaries (usually top-level `<section>`, `<header>`, `<footer>`, or a full-bleed band with its own background). Each becomes one of:

| Design element | WordPress home |
|---|---|
| Site header / nav | `parts/header.html` (template part) |
| Site footer | `parts/footer.html` (template part) |
| A reusable content band (hero, features, CTA, testimonials, pricing, FAQ) | `patterns/<slug>.php` (block pattern) |
| A whole page's composition | `templates/*.html` (template) referencing parts + patterns |

Rule of thumb: **anything that repeats or could be reused → pattern; the two site-wide chrome pieces → parts; the page skeletons → templates.**

Then run the content-model pass (`content-model.md`) on the segmented pages before building any of them.

## Templates to create

Start with what the design has; add the rest as needed:

- `index.html` (fallback, required)
- `front-page.html` (the design's home page)
- `page.html`, `single.html`, `archive.html`, `search.html`, `404.html`

Each template = header part + one or more patterns + footer part.

**Header variants.** A home page often has a transparent `fixed` header over the hero, and a solid header elsewhere. Compare `header.atTop` in the `sections-*.json` of each route. Build one header part plus a modifier class (for example `is-overlay`) set by the front-page template. Use a second part (`parts/header-overlay.html`) only when the markup differs. If the header also changes on scroll, see the scroll recipe in `interactivity-recipes.md`. A sticky or fixed header sits below the admin bar for logged-in visitors (`html-to-core-blocks.md`, Sticky and fixed elements).

**Sticky footer.** Design page roots are often a full-height flex column (`min-height: 100vh; display: flex; flex-direction: column`), which keeps the footer at the bottom of short pages. Once header and footer are template parts, that wrapper is gone. Recreate it once, in the base layout file (`src/frontend/base/layout.css`; `html-to-core-blocks.md`, Theme stylesheets):

```css
.wp-site-blocks,
.is-root-container.wp-site-blocks { min-height: calc(100vh - var(--wp-admin--admin-bar--height, 0px)); display: flex; flex-direction: column; }
.wp-site-blocks > main { flex: 1; }
```

The `main` selector needs the template's content group to use `"tagName":"main"`. The second selector is the editor canvas root, where core sets `display: flow-root` (`editor-parity.md`). The admin bar term keeps short pages from scrolling for logged-in visitors (`html-to-core-blocks.md`, Sticky and fixed elements).

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
- **Copy.** Carry the design's exact text. Never invent or rewrite marketing copy. Placeholder text in a dynamic slot is replaced by the block that renders the field; placeholder copy in static text is asked for, or kept as a translated string and listed in the handover notes (`content-model.md`, Placeholders).
- **Data.** Content that WordPress keeps as data (terms, meta, settings, post fields) is never typed into a pattern unless the user chose that in the content model (`content-model.md`).

## Images and media

Designs use remote stock photos (Unsplash, Pexels), placeholder images, and labelled placeholder boxes. None of these can stay as they are:

- A placeholder image or box is a content slot, never an asset: map it to `core/site-logo`, `core/post-featured-image`, `core/avatar` or `core/image` per `content-model.md`, and ask when its role is unclear. Never generate a placeholder image or upload one to the Media Library.
- Download every real image the design renders into `assets/images/`. Convert photos to WebP. Keep SVGs as SVG.
- Reference them from patterns with `get_theme_file_uri()` (see the example above), never by a remote URL.
- Every image becomes `core/image` with explicit `width` and `height`, so the page does not shift while images load. Core adds `loading="lazy"` automatically; for the hero (LCP) image, core adds `fetchpriority="high"` to the first large image when it can. Check the result in the capture.
- List generic stock photos in the handover notes as "needs a real asset". Do not ship them without saying so.
- Content images (a post's featured image, a team photo that editors will change) belong in the Media Library. Theme assets are for design elements that ship with the theme.
- Check the licence of every stock photo before it ships.

## Content: pages, menus, blog

Templates and patterns do not create content. Set up the site so the routes resolve:

- **Pages.** Create one Page per static route, with `post_content` that references the section patterns (see "Pages reference patterns" below). Set `show_on_front=page` and `page_on_front` to the home page, and `page_for_posts` to the blog page if there is one.
- **Permalinks.** Set a pretty permalink structure (`wp rewrite structure '/%postname%/'`). With plain permalinks, every path renders the front page with status 200, and a route check passes by mistake.
- **Navigation.** Create a navigation menu from the design's links so editors can change it. The header part holds `<!-- wp:navigation /-->` with no `ref` and no links; it renders that menu (see "Block markup rules", No database IDs).
- **Blog.** A design grid of article cards becomes `core/query` + `core/post-template`. Rebuild the card with `core/post-featured-image`, `core/post-title` (`"isLink":true`), `core/post-excerpt`, `core/post-date`, and `core/post-terms`, styled to match. Use the design's articles as sample posts only if the client agrees; otherwise ask for the posts to start with, and list what is missing in the handover notes.
- **Related or "latest" strips** on other pages are also `core/query` blocks. Set the query (count, order, and a category resolved by slug) to what the design shows.
- **Site identity.** The design's page title and description give the site title and tagline. The design's favicon becomes the Site Icon.

Optional headers bind a pattern to a specific slot:

- **Block Types** — binds the pattern to a block or template-part area (e.g. `core/template-part/header`), so it's offered where that block/area is edited.
- **Post Types** — restricts the pattern to specific post types.
- **Template Types** — restricts the pattern to specific templates (e.g. `front-page`, `single`).
- **Inserter: no** — hides a template-bound pattern from the general inserter, since it fills one slot.

Header/footer example, so the pattern surfaces in the Site Editor's header template-part picker:

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

- Patterns are **serialized block markup** (`<!-- wp:... -->` comments).
- Reference tokens for every value: colors as `{"backgroundColor":"primary"}` / `var:preset|color|primary`, spacing via spacing presets, font sizes via `{"fontSize":"large"}`.
- Use `align":"full"` / `"wide"` for full-bleed and wide bands; set `contentSize`/`wideSize` in theme.json so they resolve.
- Prefer layout via block `layout` attributes (`flex`, `grid`, `constrained`) over custom CSS.
- **No database IDs.** Patterns, templates and parts never carry a post, page, term, attachment, menu, user or synced-pattern ID. IDs differ on every install, so a pattern built on the development site points at the wrong content, or at nothing, everywhere else. Per block:
  - `core/navigation`: no `ref` and no inner blocks. The block then renders the most recently published navigation menu, created in step 7. With no published menu, core creates one when the block first renders: from the classic menu (the `primary` location or slug first) or as a Page List. Delete that stray menu if it appeared before step 7. The editor sets the fallback `ref` on the block without marking it changed, so saving the part in the Site Editor writes the `ref` to its database copy; never export that copy back into the theme. A second menu (a footer menu) is assigned in the Site Editor after setup, so its `ref` also lives in the database copy of the part.
  - `core/query`: filter by the current context (`"inherit":true` on archive templates) or by post type, order and count. When a query must show one term, look the term up by slug in the pattern's PHP (`get_term_by()`) and print the resolved ID into the attributes, skipping the filter when the term is missing.
  - Curated lists (Advanced Query Loop `include_posts`, `core/post-*` blocks pinned to a post): ship the pattern with nothing picked; editors choose the posts in the inserted block.
  - `core/image`, `core/cover`, `core/media-text`: theme assets by `get_theme_file_uri()`, with no `id` and no `wp-image-<id>` class. Media Library images are content, chosen by editors.
  - `core/block` (`"ref":<id>`): reference the theme's pattern with `core/pattern` and its `slug`.

## When a section needs a custom block

Only when the section carries behavior or data that core blocks cannot express: an interactive widget with no core equivalent, a form with no form solution in the project, or a dynamic query with custom output (the same rule as in html-to-core-blocks.md). Static/visual sections are always patterns. A list with filters or search is a `core/query` with core or Query Loop Filters blocks, never a custom list block (`content-model.md`, Filters and pagination). Raise the custom-block decision before building it.

### A custom block's editor UI

Build each editor control from the first source that has it:

1. **Core APIs and components** in the project's WordPress version: `@wordpress/block-editor` (`RichText`, `InnerBlocks`, `MediaPlaceholder`, `MediaReplaceFlow`, `InspectorControls`, `BlockControls`), `@wordpress/components` (`ToggleControl`, `SelectControl`, `RangeControl`, `ToolbarButton`, `ComboboxControl`, `FormTokenField`), and `@wordpress/core-data` (`useEntityProp`, `useEntityRecords`). When unsure whether core exports a component in that version, check its documentation.
2. **[10up Block Components](https://github.com/10up/block-components)** (`@10up/block-components`): for example `ContentPicker` (pick posts, terms or users), `Repeater`, `Link`, `IconPicker`, `Image`, `MediaToolbar` and `Optional`. They are editor-only and rely on `@wordpress/dependency-extraction-webpack-plugin`, which `@wordpress/scripts` and 10up-toolkit already run. Picked IDs are content: they live in the inserted block's attributes, never in a pattern.
3. **A custom component**, only after confirming neither source has one. Record which component and why in `CONVERSION-NOTES.md`.

The block's `edit` renders the same markup as its `render.php` while unselected, and shows these controls only when selected. Its editor preview is a JS mirror unless the user chooses `ServerSideRender` for it (`editor-parity.md`).

## Author shared elements once

An element that appears on several pages (a component reused across routes) is authored **once**, as one block or one pattern. Variants are a modifier class, a block style, or block attributes on that one implementation, never a second copy with different markup. Two copies of the same element drift apart in markup and styling. Check for duplicates before handover.

## Bind repeated fields with the Block Bindings API

When a section repeats a structured record backed by post meta (team bios, pricing rows, event details), bind core block attributes to that meta; a custom block is the fallback when no core attribute fits. The Block Bindings API (WP 6.5+) connects an attribute in the saved markup to a data source; the block keeps its normal editor UI, and the source resolves the value on render.

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

## Pages reference patterns

A page built from a theme pattern should store a reference in `post_content`:

```html
<!-- wp:pattern {"slug":"mytheme/about-intro"} /-->
```

A theme fix to the pattern then reaches every page that still holds the reference. Once an editor opens and saves the page, the editor stores the pattern's blocks in the page instead, and the page no longer follows the theme's pattern.
