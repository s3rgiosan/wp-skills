# Outputs

Confirm which outputs the requester wants (one or more) before you write. The HTML page is always the source: the PDF, the Markdown and the WordPress plugin are built from it with the scripts below, so all of them carry the same content and the same screenshots. `<skill-dir>` is the directory that holds SKILL.md.

## HTML artifact (default)

A single page published with the Artifact tool. Write the same page to `<work>/guide/guide.html` before you publish it: the PDF, Markdown and plugin steps below read that local file. Run the Artifact tool's `quickstart` and load the `artifact-design` skill before you write it.

### Markup contract

`<skill-dir>/scripts/to-markdown.py` reads this structure, so keep to it:

- `header.cover` holds only the `h1` (the guide's title) and a `.lede` paragraph that says what the guide covers. The cover carries no site or brand label above the title.
- `nav.toc` holds an `h2` (the index title) and one link per section. A `li.group` item without a link is a group label: it names the entries that follow it, up to the next label (for example **Content**, **Site management**, **Extensions**, **Reference**).
- `main > section[id]` per guide section. Each section opens with an `h2` and holds `h3`, `p`, `ol`/`ul`, `figure`, `div.note`, `div.check`, `div.table-wrap > table` and `dl.gloss` as direct children.
- A callout number in the text is `<span class="n">3</span>`. It matches the badge in the screenshot and becomes ③ in Markdown.
- A checklist is `div.check` with an `h3` and one `label > input[type=checkbox]` per item.

### Layout and behaviour

- A sticky table of contents (a sidebar on desktop, a collapsible list on phones), then the sections, with anchor links between them ("see SEO").
- The table of contents marks the section being read with a vertical line on the left of its entry. Use CSS scroll markers first: `scroll-target-group: auto` on the list of index links and a `:target-current` style on the links. They need no script, which matters because some artifact viewers do not run the page's script. As a fallback where `CSS.supports('scroll-target-group', 'auto')` is false, set `aria-current="location"` from an `IntersectionObserver` (thresholds 0 to 1 in steps of 0.01): the topmost section with at least 60px on screen, or the last section once it is fully shown. Never use a `scroll` listener.
- Screenshots: publish the PNGs as supporting files (`files`: `shots/<id>.png`) and reference them relatively. Each one is a `<figure>` with alt text, an optional caption, `width` and `height` from the shot's entry in `shots.json`, and a link that opens it at full size. Those values are CSS pixels; the PNG has `scale` times as many (`shots.json` has a top-level `scale`, 2 by default). Never upscale a screenshot past its CSS size.
- Checklist ticks are kept in the reader's browser only (`localStorage`, wrapped in try/catch).
- Set `lang` on the outer wrapper element: the publish skeleton owns `<html>`.

### Print stylesheet

`<skill-dir>/scripts/to-pdf.mjs` prints with it, and readers who print the page get the same result:

- A white background, the table of contents hidden, and the cover sharing its page with the first section.
- Every other section starts on a new page. Headings stay with what follows (`break-after: avoid`).
- Figures, list items, notes and checklists do not split across pages. Screenshots are capped at `max-height: 110mm`, so a tall sidebar shot does not push a half-empty page.

## PDF

Build and check the HTML page first, then print it:

```bash
node <skill-dir>/scripts/to-pdf.mjs <work>/guide/guide.html <work>/guide/guide.pdf
```

Run it from the folder where Playwright is installed. `to-pdf.mjs` creates the output folder. It prints in print media with the light colour scheme and forces lazy images to load. It waits up to 15 s for fonts, then prints `warning: fonts not loaded; the PDF uses fallback fonts`. A broken image fails at once with `error: N image(s) failed to load:`, and images still loading after 30 s fail with `error: N image(s) did not finish loading:`. Unknown `--` options and a missing source file or a directory exit 2 (exit 0 is success), and a missing browser points at `npx playwright install chromium`. Look at every page before you send the PDF. `pdftoppm` (poppler, optional) does the page check: `pdftoppm -r 28 -png <work>/guide/guide.pdf p` gives one small image per page, which can go on a single contact sheet. Fix the print stylesheet for a cover alone on its page, a half-empty page before a tall figure, or a heading at the bottom of a page.

## Markdown + images

Build the HTML page first, then convert it and copy the screenshots beside it:

```bash
pip install beautifulsoup4
python3 <skill-dir>/scripts/to-markdown.py <work>/guide/guide.html out/guide.md
cp -R <work>/guide/shots out/shots
```

`to-markdown.py` creates `out/`.

Errors exit 2: `missing header.cover`, `missing header.cover h1`, `missing header.cover .lede`, `missing nav.toc h2`, `missing main > section[id]`, `missing h2 in main > section#<id>` and `duplicate section id: <id>`. Warnings go to stderr: `skipped main > <tag>.<class>`, `nav.toc link #<id> has no matching section`, a rowspan warning (cells below a spanning cell are not aligned), and `skipped <tag>` for a section, nav, video, audio or iframe inside text or any other element it cannot convert. A skip warning means content is missing from the Markdown, so fix the markup and run again.

The result has relative image links, GitHub-style heading anchors for the index, `- [ ]` checklists, nested steps and pipe tables. Use this output when the guide lives in a repository or a wiki. Keep it out of any public repository when the screenshots show client data.

## WordPress plugin

A plugin that shows the guide inside wp-admin, to logged-in users with a capability (default `edit_posts`). Build and check the HTML page first, then write `<work>/sections.json` and run (the plugin goes to `<work>/build/<slug>/`; raise `--version` on every rebuild):

```bash
pip install beautifulsoup4
python3 <skill-dir>/scripts/to-plugin.py <work>/guide/guide.html --slug acme-user-guide --sections <work>/sections.json \
  --author "Acme Studio" --author-uri https://studio.example.com/ --out <work>/build/
```

Flags (`--help` prints them with their defaults):

- `--slug` (required): starts with a lowercase letter, then lowercase letters, digits and single hyphens. A slug whose joined segments are a PHP reserved word exits 2.
- `--out` (required): the folder that receives `<slug>/`.
- `--translations`: a folder of translation files to ship in `languages/` (see Translations).
- `--shots`: the screenshot folder (default: `shots/` beside the guide).
- `--sections`: the `sections.json` map.
- `--name`: the Plugin Name in the Plugins list (default: `User Guide`). Write it in English: the Plugin Name is translatable through the plugin's text domain. The menu, page and widget label is the translatable string `User Guide`, whatever `--name` is.
- `--author` and `--author-uri`: the Author and Author URI lines of the plugin header, for example the agency that built the site. Ask the requester for both before building (SKILL.md, Settle first); without them the header has no Author lines. `--author` is cut to 80 characters. `--author-uri` takes an http(s) URL.
- `--capability`: the default capability (default `edit_posts`).
- `--version`: the plugin version, `x.y.z` (default `1.0.0`). Screenshot URLs carry `&v=<version>`, so bump it on every rebuild to make browsers fetch the new images.
- `--force`: replaces the existing `<out>/<slug>/` folder, which must be one this script built. Every build writes a `.wp-user-guide-build` marker file that holds the slug. Accepted folders: one with a `.wp-user-guide-build`, `.wp-admin-guide-build` or `.wp-editor-guide-build` marker file that holds the slug, and one with no marker whose `<slug>.php` and `includes/class-guide.php` carry the mark `Generated by the wp-user-guide skill` or `Generated by the wp-editor-guide skill`. Any other folder is refused, and an existing build needs `--force`.

The script builds in a temporary folder `.<slug>.build-<hex>` beside the target, runs the checks there, and swaps it in only when they pass. A failed rebuild leaves the previous plugin untouched.

The plugin header's Description is the fixed sentence `Shows the user guide inside the WordPress admin.` The Plugin Name is cut to 80 characters, at a word boundary with an ellipsis. The guide's `pre`, `details` and `summary` elements are kept; control characters are stripped and link schemes are matched case-insensitively.

The plugin adds:

- A top-level admin menu entry (`User Guide`) that prints the guide with its index. Guide ids and internal links carry a `<slug>-` prefix in the plugin view, so `admin.php?page=<slug>#<slug>-<section>` opens a section.
- A dashboard widget with one link per section.
- A link to the matching section where the editor works: a document panel in the block editor, and a Help tab on classic screens (list tables, taxonomy screens, Menus, Media).

The guide text and the screenshots are served only through wp-admin, to users who hold the capability. Every PHP file starts with an `ABSPATH` guard, so a direct request returns an empty page. The screenshots ship as base64 inside guarded PHP files and reach the page through an `admin-post.php` handler that checks the capability and serves only names from the generated list. The CSS and JS files under `assets/` are static files that the web server serves to anyone; they hold no guide content. Checklist ticks are stored in the reader's browser, keyed by user. The inline data is encoded with `JSON_HEX_TAG | JSON_HEX_AMP`. The generated PHP passes PHPCS with WordPress-Extra and WordPress-Docs. The JS globals are `wpUserGuide_<camelSlug>` and `wpUserGuide_<camelSlug>Panel`, and each asset starts with `/* v<version> */`. The plugin has no build step, loads no external fonts or scripts, and sets `Update URI: false`. The script runs `php -l` on every PHP file it writes when PHP is on the `PATH`, and scans the output for stray PHP tags.

`--capability` sets the default. The `<slug_with_underscores>_capability` filter changes it at runtime. The capability gates the menu, the dashboard widget, the Help tab, the editor panel and the screenshot endpoint.

The plugin page uses core admin markup (`wrap`, `notice notice-info inline` for notes, `widefat striped` tables, `card` checklists) and follows the reader's admin colour scheme through `--wp-admin-theme-color`. Callout numbers stay red to match the badges on the screenshots. Index links scroll the page smoothly (instantly with reduced motion); the index stays beside the text.

### Translations

The plugin's own interface is English and translatable. The header carries `Text Domain: <slug>` and `Domain Path: /languages`, and the plugin loads its text domain on `init` with `load_plugin_textdomain()`. Translatable: the Plugin Name and Description, the menu, page and widget label, the Help tab title and sentence, the editor panel title, and the access-denied message of the screenshot endpoint. The block editor script uses `wp.i18n` and is registered with `wp_set_script_translations()`. The guide's own text, section titles and `h1` are content: they stay in the guide's language and are not in the POT.

Translate the plugin's own interface in this order. Keep the files in `<work>/translations/`, outside the build.

1. The first build writes `languages/<slug>.pot` (with `wp i18n make-pot` when `wp` is on the `PATH`; otherwise from the script's own string table, with a warning). The fallback POT has the same strings, the plugin headers included, but no file references. When the project's WP-CLI runs through a wrapper (a container shim), regenerate the POT after the build with that wrapper, using paths it can see: `<wp> i18n make-pot <out>/<slug> <out>/<slug>/languages/<slug>.pot --domain=<slug> --exclude=views/shots`.
2. Create the catalogue for the locale: `msginit --no-translator --locale=<locale> --input=<work>/build/<slug>/languages/<slug>.pot --output-file=<work>/translations/<slug>-<locale>.po`.
3. Translate the strings in the `.po`. For `pt_PT`, use the `wp-translate-pt-pt` skill.
4. Compile it: `msgfmt -o <work>/translations/<slug>-<locale>.mo <work>/translations/<slug>-<locale>.po`, or `wp i18n make-mo <work>/translations` (`wp i18n make-mo <source> [<destination>]`).
5. Write the JSON file for the editor panel: `wp i18n make-json <work>/translations --no-purge`. The `.po` must reference `assets/editor-panel.js`, which the POT already does. `--no-purge` keeps the strings in the `.po`.
6. Rebuild with `--translations <work>/translations --force` and a higher `--version`.

The translation shows when the user's admin language (profile language) or the site language is that locale.

The script copies only `<slug>-<locale>.po`, `<slug>-<locale>.mo` and `<slug>-<locale>-<md5>.json`. It skips `.l10n.php` files with a warning, because WordPress reads the `.mo`. Every build copies the folder into `languages/`, so a rebuild keeps the translations.

### Build errors and warnings

Exit 2:

- `<?` or `?>` in `--name`, `--author`, the guide title or a section `h2`.
- `--translations` that is not a folder, or an `--author-uri` that is not an http(s) URL.
- A screenshot id `index` or an empty id, or two files that reduce to the same id.
- A duplicate section id, or a section id outside `[A-Za-z0-9][A-Za-z0-9_-]*`.
- A failed stray-tag scan or `php -l`. The temporary build folder is removed and the previous plugin stays.
- `--shots` that is not a folder, or a guide that references `shots/…` when no `.png` files are found.
- A screenshot that is not a PNG, is a symlink or other non-regular file, or is over 5 MB.
- A screenshot id with no letter or digit, or one that is a Windows device name.
- A plugin header over 2048 bytes.
- Duplicate element ids in the guide, or a section inside `header.cover` or `nav.toc`.
- `error: cannot write <target>: …`.
- A bad `sections.json`: unknown keys, an id that is not a section, or a key that does not match `[a-z0-9_-]+`.

Warnings on stderr:

- `skipped main > <tag>`: content outside a `section[id]` is lost, so fix the markup.
- `lang '<value>' is not a language tag; using en`.
- `sections no admin screen links to (reachable from the index and the widget): …`, printed on every build with `--sections`, and `no --sections: …` without it.
- `header.cover` or `nav.toc` nested inside a section or inside each other: it prints with its parent only.
- `dropped an image that is not in shots/: <src>`, and a warning for screenshots the guide does not use.
- `--translations: skipped <name> (expected <slug>-<locale>.po, .mo or .json)`, `--translations: skipped <name>: .l10n.php files are not shipped; WordPress reads the .mo`, and `--translations: no <slug>-<locale> files found in <folder>`.
- `wp i18n make-pot failed (<detail>); the POT file is written from the script's own string table`, and `wp is not on PATH: the POT file is written from the script's own string table`.

### sections.json

Maps admin screens to section ids. Write it from the reconcile step: each section already documents one post type, taxonomy or screen. Every id must be a `section[id]` of the page; the script refuses unknown ids.

```json
{
  "post_types": { "post": "posts", "page": "pages", "acme_event": "events" },
  "taxonomies": { "category": "categories", "acme_topic": "categories" },
  "screens": { "nav-menus": "menus", "upload": "media", "media-new": "media", "users": "users", "options-general": "settings" }
}
```

Build `screens` from `survey.json` `screenId` for every screen the guide covers (the dashboard, users, settings screens and plugin screens), not only the content types. Example keys: `nav-menus`, `upload`, `users`, `options-general`, `toplevel_page_<plugin>`. A plugin page registered by its file path keeps the path in its screen id, for example `toplevel_page_<plugin-dir>/<file>`: copy `screenId` from `survey.json` as it is. Map every screen of a plugin to that plugin's section in the Extensions group. On a classic screen the taxonomy wins, then the post type, then the screen id (`WP_Screen::$id`). Sections no screen links to, such as an introduction or a glossary, stay reachable from the index and the widget.

### Rules

- One guide per plugin. The guide text is printed as written; a guide in another language is another build.
- Keep the guide's sources (`guide.html`, `shots/`, the shot lists, `sections.json`, `translations/`) in the project repository, in a folder the deployment excludes, with a short README that holds the rebuild command. The plugin can then be rebuilt later; raise `--version` on each rebuild.
- Regenerate the plugin when the guide changes. Never edit the generated files: the next build replaces them.
- The plugin shows real screenshots of the client's admin. Keep it in the client's repository, never in a public one.
- Check the plugin as the audience role before delivery: the menu entry, the page with every image, a deep link, the editor panel, one Help tab, and that a role without the capability gets a 403.
