# Guide structure

## Reader

The reader has never used WordPress. They know how to use a browser and a word processor. Every step names the exact control to click, as the screen labels it, and where it sits on the screen.

The audience shapes how the guide is written; the guide never states it. Open with what the guide covers, with no line about who it is for or how much they know.

## Sections, in order

1. **Before you start**: how to log in (the URL), the dashboard (what its boxes show, and Screen Options to show or hide them), and how the admin menu is organised. Include a screenshot of the menu with callouts on the items the guide uses.
2. **The editor**: one annotated screenshot of the block editor. Label the title, the canvas, the inserter (+), the settings sidebar and its tabs (item / Block), the top-bar sidebars (SEO and others), Save draft, Preview and Publish. Cover adding and moving blocks, undo, and the View menu (device preview, Show template). For a classic editing screen, add a screenshot with its boxes labelled.
3. **Saving and publishing**: draft, preview, publish, schedule, update, any custom statuses, trash and restore. Show the publish confirmation once.
4. **Images and files**: uploading, alt text, caption, credits, media categories, featured image, recommended sizes when the theme crops images, and PDFs.
5. **One section per content type**, in the order of the admin menu (template below).
6. **List screens**: for each list the reader uses, the search box, the filters, the status views (All, Published, Draft, Trash), bulk actions, Quick Edit, and trash and restore. Quick Edit can expose extra fields that plugins add (a site-search plugin, an SEO plugin) and that change how content appears; name each one and what it does.
7. **Categories and other taxonomies**: adding a term, editing it, any term fields, and parent terms. One section for all taxonomies, with a table of which taxonomy belongs to which type.
8. **Menus**: classic menus or block menus (see below), only when the role reaches them.
9. **Translation**: once, when a multilingual plugin is active.
10. **SEO**: what each field does, with a recommended length and an example. Link to it from each type.
11. **Users**: add a user and choose a role, with a short table of the roles the reader can assign and what each can do (template below). Edit someone's details, including the language field when `survey.json` lists one. Send a password reset. Remove a user (warning box first, see below).
12. **Settings**: one subsection per settings screen the role reaches. For each field, say what it changes across the whole site, and put a warning box on high-impact fields. Include the fields that plugins and themes add to core settings screens (an extra page picker or consent option on Reading, for example).
13. **Extensions**: one section per plugin whose screens the role reaches (forms, SEO, site search, translation, newsletter), grouped under an **Extensions** label in the index (`li.group`, see `outputs.md`). Name each section after the task and the plugin, for example "Forms (Fluent Forms)". Inside it, one `h3` subsection per task the reader does there: the plugin's lists, its settings, and connecting an outside service (see SKILL.md, "External services"). A plugin the reader only consults gets a short section: what it does, that it is configured, and a warning box on the settings that must not change. The parts a plugin adds to the editor (SEO fields, translating one item, search options on an item) stay in their own sections (SEO, Translation, the content types); the plugin's section links to them.
14. **Glossary**: the WordPress terms used in the guide (block, slug, excerpt, featured image, taxonomy, draft…), with a one-line meaning each.

## Warning boxes

Every action that is hard to undo gets a warning box before the step: deleting a user or content, changing the site address or WordPress address, permalinks, the homepage or posts page. The box says what happens and how to undo it, if it can be undone.

## Content type section template

```
## <Plural name as in the menu>

What it is: one sentence, and where it appears on the site (listing page, cards, home).

Before you start: what to have ready (text, images at size X, PDF, dates, cooking time).

1. Open <Menu> › <Add new label>.                                  [screenshot: menu, callout]
2. <If a pattern picker opens>: choose <pattern> for <case>.        [screenshot: picker]
3. Title: what goes there, with an example.
4. Content: which blocks to use and what each section expects.      [screenshot: canvas]
5. <Each sidebar panel, in sidebar order>: each field, what it does, whether it is required, an example.
                                                                     [screenshot: panel, numbered callouts]
6. Excerpt: where it shows, how long, an example. If the type has no excerpt, leave this step out.
7. Featured image: where it shows, size and orientation, alt text.
8. Categories / <taxonomies>: what each one controls on the site.
9. SEO: link to the SEO section, plus anything specific to this type.
10. Preview, then Publish (or Schedule).

Checklist before publishing: one checkbox per required item.
```

A classic edit screen (no block editor) documents every meta box a plugin adds, one subsection each, with each field. Flag fields that hide content (exclude from search, noindex) and fields that swap the template (a template select that offers an error or 404 template) in a warning box that says what happens and how to undo it.

Number the callouts in each screenshot in the order the steps mention them, and refer to them in the text as ①, ②…

## Taxonomy term section template

```
### <Taxonomy label as in the menu>

What it is: one sentence, and where it shows on the site (filters, cards, archive page).

1. Open <Menu> › <Taxonomy label>, then fill the Add form.          [screenshot: add form, a callout per custom field]
2. <Each field, in screen order>: the label exactly as shown, the accepted values
   (free text, a list of choices, a number), where it shows on the site, required or
   optional and what happens when it is empty, an example. A plugin's per-term fields (SEO)
   that change how the term page behaves (canonical URL, robots or indexing, redirect URL)
   get a warning box: what the field does and how to undo it.
3. Parent (hierarchical taxonomies only): what choosing one does.
4. Click <Add new label>.
5. To change a term later, open it from the list. Name the fields that appear only
   when editing (SEO, language, edit-only meta) and what each does.  [screenshot: edit form, callouts; when it differs from the add form]
```

Taxonomies whose term screens show only Name, Slug, Parent and Description share one generic section with a single screenshot.

## Users section template

```
## Users

What it is: one sentence, and what the reader can do here.

Roles: a table of the roles in the Add User screen's Role selector (survey.json),
one row each: the role as the screen shows it, and what it can do in plain words.

1. Open Users › Add New.                                             [screenshot: form, callouts]
2. <Each field, in screen order>: what it needs, required or optional, an example.
3. Role: choose from the table above.
4. Click <Add User>.

Warning box: Removing a user
Deleting a user cannot be undone. Their content must be attributed to another
person: choose <the reader's own account, or the account named in the brief> in the
"Attribute all content to" list. Only a role with the delete users capability sees
the Delete link.
5. To remove a user, open Users, point at the name and click <Delete>.   [screenshot]
```

## Plain-language rules

- Write imperative, short sentences: "Click **Publish**." One action per step.
- Write UI labels in bold, exactly as the screen shows them. When a label is in another language than the guide, add the meaning in brackets the first time: **Meta Description** (the text under the title in Google results).
- Say what happens on the site after each field is filled: "This text shows under the title on the recipe card."
- Give a realistic example for every free-text field. Write placeholder content, never a real person's details.
- Explain a WordPress term the first time it appears and add it to the glossary.
- Mark a required field as required. Mark the rest as optional and say what happens when it is left empty.
- Leave out developer concepts: post types, meta, blocks' internal names, code.

## Menus

### Classic menus (Appearance › Menus)

The screen as observed on WordPress 7.1, top to bottom. Cover each part the reader uses:

1. **Choose the menu.** The menu selector at the top, then its select button. The screen opens on one menu; the reader picks another and confirms.
2. **Add items.** The left column has one panel per content type. Pages has three tabs (recent, all, search) over a checklist, plus an "add to menu" button. Custom links take a URL and the link text. Categories work like Pages. Other post types and taxonomies are hidden until the reader ticks them in Screen Options at the top right; say which ones the site's menus use.
3. **Arrange items.** The menu structure lists the items. Dragging changes the order, and dragging an item to the right under another makes it a submenu item, shown with a "sub item" note. The arrow on an item opens its settings: the URL (custom links only), the text shown in the menu, a parent selector, a position selector, move links, and Remove / Cancel. The parent and position selectors are the keyboard-friendly way to make submenus and reorder; prefer them in the steps.
4. **Menu settings.** Below the structure: auto-add new top-level pages, and the display locations (one checkbox per theme location, with the menu currently assigned to it).
5. **Save.** Nothing changes on the site until the reader clicks the save button. An item added or removed and not saved is lost on leaving the screen.
6. **Manage Locations** (second tab): which menu shows in each location. Mention it only when the reader may reassign menus.

With WPML, the menu screen shows language links above the add-items column and a Translations / Language bar above the structure. Each language has its own menu: the reader edits the menu of the language they are working in. Document how the second language's menu is created only after testing it with the menu save-test procedure in SKILL.md, "Saving content".

The screen also links to the Customizer ("Manage with live preview"). Leave it out of the guide unless the project wants readers there, and check whether the project's menu code reacts to Customizer saves before documenting it.

Before writing that a saved menu changes the site, run the save-test procedure in SKILL.md, "Saving content". Select menu items by their ID (`#menu-item-<id>`), never by text: every item carries the whole menu's titles in its hidden parent selector, so a text match finds every item.

### Block menus (Site Editor › Navigation)

The Navigation section of the Site Editor (see `site-editor.md`): choose the menu, then edit its items in the tree. The + button adds a page link or custom link, items drag to reorder or nest as submenus, and each item's options rename or remove it. Warn that changes apply to every template part that shows that menu.

## Screenshots

- Crop to the region of the step, and keep enough context to show where it sits on the screen (the sidebar edge, the top bar).
- Number the callouts. Keep three to five per image; split into two images when you need more.
- Show realistic values in a filled panel (shoot an existing item without saving), and empty fields only for "this is where you start".
- Give each image alt text that describes the step it shows.
