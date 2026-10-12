# Content model: decide where every piece of content lives

A design shows content as it looks on one day. A WordPress site keeps most of it as data: site identity, post fields, terms, meta, settings. Before building any pattern, walk the segmented pages and decide where each piece of content comes from. Hardcoding is one valid answer, but only when the user chooses it.

Run this pass after segmenting the pages (workflow step 1) and before tokens and patterns. Ask the user each open decision, with a recommended default, and record the answers in `CONVERSION-NOTES.md`.

## Inventory

List every item in the design that is one of these:

- an image or image-shaped box (photo, avatar, logo, screenshot, gray placeholder box);
- a repeated item (cards, rows, list entries, logos, chips);
- a label that classifies something (a category, type, status, tag);
- a fact or figure about one item (client, price, rating, duration);
- a site-wide list or figure (a logo strip, opening hours, key figures, social profiles);
- a link or call to action that points somewhere editors will change.

## Where each kind of content lives

| In the design | Usually lives in | Rebuild with |
|---|---|---|
| Site name, logo, tagline | Site identity | `core/site-title`, `core/site-logo`, `core/site-tagline` |
| Brand mark or portrait in the header | Site logo | `core/site-logo`, shaped with a block style |
| Avatar next to a post byline | Author | `core/avatar` (author), `core/post-author-name` |
| Large image on a post, article or detail page | Featured image | `core/post-featured-image` |
| Card or row image in a list of posts | Featured image | `core/post-featured-image` in a Query Loop |
| Title, excerpt, date, author of an item | Post fields | `core/post-title`, `core/post-excerpt`, `core/post-date` |
| Category, type, industry, tag on an item | Taxonomy | `core/post-terms`; a filter is links to the term archives or a Query Loop Filters block |
| A list of items of one kind (case studies, team members, events) | A post type | Query Loop over the post type |
| Facts about one item (client, duration, budget, URL) | Post meta | Block bindings on core blocks (`core/post-meta`), edited in a sidebar panel |
| A site-wide list or set of figures (logo strip, key figures, hours) | A settings page, a taxonomy, or a custom block | Ask (below) |
| Social profile links | Content | `core/social-links` in the footer or header part |
| An image that is part of the design itself (a texture, an illustration) | Theme asset | `core/image` with a theme URL |
| Any other content image | Media Library | `core/image` |

Raise these decisions; never pick one silently:

- **Post types and taxonomies:** name, slug, labels, whether the URL is public, and where they are registered. A theme that registers content types loses that content when the theme changes, so the default is a plugin. A theme registers them only when the user says so (for example, a one-off site whose theme is the whole product).
- **Meta keys:** key names, types, and how editors fill them (a sidebar panel on the post type, registered with `register_post_meta()` and `show_in_rest`).
- **Site-wide lists and figures:** a custom block (editors fill the list in place), a taxonomy (the list is terms that also tag content), a settings page (one list used in several places), or static copy in a pattern.
- **Curated lists:** when a Query Loop shows hand-picked items in a set order (a showcase strip, related posts chosen by an editor), suggest the [Advanced Query Loop](https://wordpress.org/plugins/advanced-query-loop/) plugin. It is a `core/query` variation (`"namespace":"advanced-query-loop"`): editors pick the posts in the block sidebar, stored as `query.include_posts` (`[{"id":101}, …]`) with `"orderBy":"post__in"`. It also excludes the current post (`"exclude_current":true`) for "more posts" lists. The pattern ships with `include_posts` empty; the IDs exist only in the block an editor inserts. Ask before adding the plugin.
- **Filters and pagination over a list:** a filtered list stays a `core/query`. Pick the first option that covers the design:
  1. Core only: Query Loop pagination, `core/search` for search, and links to the term archives for filters (each filter is a URL).
  2. In-place filters by taxonomy, post type or search: suggest the [Query Loop Filters](https://github.com/humanmade/query-filter) plugin (`humanmade/query-filter` on Composer). Its `query-filter/taxonomy` and `query-filter/post-type` blocks sit inside the `core/query` and render as a select, radio buttons or checkboxes. A `core/search` inside the query becomes a live search over its results. Filters are URL parameters matched by term slug, and results update through the Interactivity API router. It requires WordPress 6.6 and PHP 8.2. The post type filter also needs Advanced Query Loop. Install a tagged release or the `release` branch: `main` has no built assets. Ask before adding the plugin.
  3. A custom block with the Interactivity API: only when neither covers the design (for example, a range or date filter, or filters combined with OR). Raise it first.

When a decision is open, ask it as a question with the options and a recommended default, then build to the answer.

## Placeholders

A design marks missing content with labelled boxes and bracketed text (`[PHOTO]`, `[IMAGE]`, `[CLIENT NAME]`). A placeholder names a content slot; it is never shipped as content.

- **Placeholder image:** map the slot to the block that fills it (`core/site-logo`, `core/post-featured-image`, `core/avatar`, `core/image`). When the slot's role is unclear, ask. Never generate a placeholder image file, upload one to the Media Library, or ship one in `assets/`.
- **Placeholder text in a dynamic slot** (`[Excerpt]` on a post row): the block that renders the field (`core/post-excerpt`) replaces it.
- **Placeholder copy in static text** (`[One line on what it does]`): ask for the copy, or leave the block with a translated placeholder string and list it in `CONVERSION-NOTES.md`.
- **Placeholder icon** (a bracketed label in an icon slot): use the platform's mark through `core/social-link`, or ask which icon.

## Labels and decoration

Text in a pattern is content: editors change it and translators translate it. Keep decoration out of it.

- Arrows and glyphs on links and buttons (`→`, `↗`, `←`) are a block style or CSS (`::after { content: "→"; }`), never part of the label. A button style such as `is-style-with-arrow` adds the glyph to every button that needs it.
- Separators between inline items (`|`, `/`) are CSS on the container (`gap` plus a `::before` on each item after the first), unless the user wants them as text.
- Decorative glyphs from CSS stay out of the accessible name: put them in pseudo-elements, or mark the element `aria-hidden`.
