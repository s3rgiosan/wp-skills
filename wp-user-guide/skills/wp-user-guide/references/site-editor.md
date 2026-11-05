# Site Editor screens

Labels and sections as of WordPress 7.1; check the running version's screens before writing. Document the Site Editor only for a role that opens it (`site-editor.php` loads for that role in the survey) and only when the project lets that role use it. Many projects keep content editors out of it and give them Appearance › Menus instead.

Everything here changes the whole site, not one item. Each guide section on a Site Editor screen repeats the matching "What the guide warns" cell of the table below.

## Sections

The Site Editor (Appearance › Editor) opens on a sidebar with six sections. Each one is a `p=` route. Name them in the guide by the label the site's admin locale shows.

| Section | Route | What can be changed | What the guide warns |
| --- | --- | --- | --- |
| Identity | `site-editor.php?p=/identity` | Site title, tagline (site description), logo, site icon (square, at least 512 × 512 px) | They show everywhere the Site Title, Tagline and Logo blocks render, and in browser tabs |
| Styles | `p=/styles` | Typography (font families and variants; text, link, heading, caption and button styles; preset font sizes), Colors (palette; link, caption, button and heading colors), Background, Shadows, Layout, and per-block styles under Blocks. The eye icon opens the style book | Applies to every page; a palette change recolors every block that uses that color |
| Pages | `p=/page` | The page list, with views by status (published, scheduled, drafts, pending, private, trash), search, filters, layout options and Add page. Opening a page edits it inside its template | The first open shows an "editing a page" notice; header and footer stay locked while the page content is edited |
| Navigation | `p=/navigation` | Block menus (`wp_navigation`). Opening one shows its items as a tree, with submenus nested under their parent and a + button to add items | A menu shows in every template part that uses it |
| Patterns | `p=/pattern` | Template parts by area (header, footer, general, plus areas that plugins add) and patterns by category, with a sync-status filter and Add pattern | Editing a template part or a synced pattern changes every place it is used |
| Templates | `p=/template` | Templates by source (the theme, plugins), Add template, and the template canvas with its template parts listed in the settings sidebar | A template change applies to every item that uses it |

## Direct editing URLs

- A template: `site-editor.php?p=/wp_template/<theme-slug>//<template-slug>&canvas=edit`
- A page inside its template: `site-editor.php?p=/page/<id>&canvas=edit`

## Shooting the Site Editor

- Wait 5 to 9 seconds after each load. The canvas and the lists render late.
- Items in the Pages, Patterns and Templates lists are not plain text links. Open an item by its URL.
- Capture the "editing a page" notice once, for the step that explains it, then close it.
