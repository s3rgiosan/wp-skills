---
name: wp-user-guide
description: Use when asked to write, update or extend a user guide, admin guide, editor guide, site manual, handover or training document that teaches one audience role (editors, shop managers, administrators) to use the WordPress admin: content types, media, taxonomies, menus, users, settings and plugin screens, with screenshots. Triggers: "editor guide", "content editor guide", "guia do editor", "how do editors add X", "client handover docs", "training guide for the client", "document the admin for the client", "admin guide", "site manual", "user manual for the site", "user guide", "guia do utilizador", "add a section to the guide".
---

# WordPress user guide

## Overview

Write a step-by-step guide that teaches a non-technical reader to do everything their role does in one WordPress admin: create content, manage media, taxonomies and menus, manage users, and change settings and plugin screens. The guide includes annotated screenshots. Every step, label and screenshot comes from the admin as the audience role sees it. Code tells you what exists. The screen tells you what the role can reach and what each control is called.

**Core rule: document the screen, not the code.** Inventory the code to know what to look for, then confirm each item in the browser as the audience role. A field or screen that exists in code but cannot be reached on screen is a finding for the developer, never a guide step.

## When to use

- A client or team needs a manual for adding and publishing content, managing users or changing site settings.
- A site gains a content type, a sidebar panel, a field or a plugin screen, and the existing guide needs a new section.
- A handover needs screenshots of the admin with steps.

This skill does not cover developer documentation, screens the audience role cannot open, or end-user help for the public site.

## Settle first

Look up each item in the sources before you ask about it. Ask only what the sources cannot answer, one question at a time, with a recommended option first. The first table is settled before the survey; the second is settled after step 3, once `survey.json` shows what the role reaches.

### Before the survey

| Decision | Look it up in | Ask when, and a sample question |
| --- | --- | --- |
| Audience role | `<wp> role list`, custom role code, the project brief | Several roles work in the admin and nothing says which one the guide is for. "The site has Editor and Shop Manager roles. Write the guide for the Editor? Recommended: Editor." |
| Output | ticket | Always confirm which outputs, one or more. "Which outputs do you want: HTML page, PDF, Markdown with images, or a WordPress plugin? Recommended: the HTML page, plus the plugin if editors should read it inside wp-admin." See `references/outputs.md` |
| Language and admin locale | site locale, ticket, client | The admin locale and the client language differ. "The admin runs in English and the client writes Portuguese. Show the screens in Portuguese? Recommended: yes, so labels and screenshots match the guide." |
| Translation | active multilingual plugin | A multilingual plugin is active. "WPML is active. Cover translation once, per type, or not at all? Recommended: once, linked from each type." |
| Plugin author | `Author` and `Author URI` in the headers of the project's own plugins and theme (`style.css`) | The output includes the WordPress plugin: always ask. "Use Author `Acme Studio` and Author URI `https://acme.example/` (from the theme header) in the plugin header? Recommended: yes." |

### After the survey

| Decision | Look it up in | Ask when, and a sample question |
| --- | --- | --- |
| Admin areas in scope | survey menu (users, settings, forms and other plugin screens the role reaches), the brief | The role reaches screens the brief does not name. "The role also reaches Users, Settings › General and Reading, and the newsletter settings page. Include them? Recommended: yes, as separate sections, with each plugin in its own section under Extensions." |
| Content types in scope | survey menu, post type and taxonomy lists, ticket | A type the role can reach is not named in the request (a shop, forms). "The role also reaches Products. Include it? Recommended: yes." |
| Menus | survey menu: `nav-menus.php` vs `site-editor.php` (and `customize.php`) | The role reaches neither one, both, or a menu change is in progress. "The role reaches Appearance › Menus. Document the classic menu screen? Recommended: yes." |
| Site Editor | survey menu: `site-editor.php` listed for the role | The role reaches it and the brief is silent: the guide sends readers there only after an explicit yes. "The role can open the Site Editor. Document it? Recommended: no." |

## Workflow

Placeholders used below:

- `<wp>` is the project's WP-CLI wrapper, for example `wpc wp <site> --` or the site's own shim. Plain `wp` can target another install.
- `<skill-dir>` is the directory that holds this SKILL.md.
- `<site-url>` is the local site root, for example `https://site.test`.
- `<work>` is a working folder outside the site, with this layout: `screens.txt`, `survey/` (holds `survey.json`), `shots.json` (the shot list), `guide/` (holds `guide.html`, `shots/` and the finished outputs), `sections.json`, `backup/` (option backups), `translations/` (plugin translations) and `created.txt`. `created.txt` lists every item the walk creates, one line each: `<type> <id> <note>`, where type is post, term, attachment, user or option. Step 9 reads it.

Playwright lives in the folder where you ran `npm i -D playwright && npx playwright install chromium`. Run the Node scripts from that folder by full path.

1. **Inventory the content model and admin areas.** Use WP-CLI and the code. Read `references/inventory.md` for the checklist of commands and the code patterns to grep, including users and settings.
2. **Create a throwaway user** named `guide-user` with the audience role on the local site. Pick any throwaway password, not a shared default: `<wp> user create guide-user guide-user@example.test --role=<role> --user_pass=<password> --porcelain` prints the new user ID. Set the admin locale to the guide's language so the screens and screenshots match: core and plugin labels follow the user's language, and a plugin translation update changes labels, so the guide quotes what that user sees. Run `<wp> user meta update <id> locale <locale>` (`user create` has no locale option), for example `pt_PT`. A new user shows the first-run screens (the starter-pattern picker, the welcome guide) that the guide must cover; an administrator or a reused account sees other menus and has hidden those screens already. Record the user in `<work>/created.txt`.
3. **Survey the screens** as that user, with the admin language set to the guide's language (step 2), so `survey.json` holds the labels the guide quotes. Before surveying users, forms and submissions screens, check that the local database holds only test users and demo submissions (see "Saving content", Real data).

   ```bash
   WP_USER=guide-user WP_PASSWORD=<password> node <skill-dir>/scripts/survey.mjs --screens <work>/screens.txt --base <site-url> --out <work>/survey
   ```

   `screens.txt` holds one admin path per line, each starting with `/wp-admin/`. Blank lines and `#` comments are ignored. Example for a site with two custom post types (`acme_recipe`, `acme_course`), one custom taxonomy (`acme_cuisine`), classic menus, and the users, settings and plugin screens the role reaches:

   ```
   /wp-admin/edit.php?post_type=acme_recipe
   /wp-admin/post-new.php?post_type=acme_recipe
   /wp-admin/edit.php?post_type=acme_course
   /wp-admin/post-new.php?post_type=acme_course
   /wp-admin/edit-tags.php?taxonomy=acme_cuisine
   /wp-admin/term.php?taxonomy=acme_cuisine&tag_ID=<term-id>
   /wp-admin/post.php?post=<post-id>&action=edit
   /wp-admin/upload.php?item=<attachment-id>
   /wp-admin/media-new.php
   /wp-admin/nav-menus.php
   /wp-admin/site-editor.php
   /wp-admin/customize.php
   /wp-admin/users.php
   /wp-admin/user-new.php
   /wp-admin/profile.php
   /wp-admin/options-general.php
   /wp-admin/options-reading.php
   /wp-admin/options-permalink.php
   # one line per plugin screen in the survey menu (forms, SEO, translation)
   /wp-admin/admin.php?page=<plugin-page>
   # WPML, verify on screen: add the term translation screen, with the path from the survey menu or the term's language links
   # /wp-admin/<path-of-the-term-translation-screen>
   ```

   The survey records what the role reaches. A screen the role cannot open fails (exit 1) and is left out of the guide: that FAIL is expected, so read `survey.json` and continue. A taxonomy with custom fields gets both term screens, as above.

   Fill the `<id>` placeholders with an existing, fully filled item of each kind:

   ```bash
   <wp> term list <taxonomy> --fields=term_id,name --number=1
   <wp> post list --post_type=<type> --fields=ID,post_title --posts_per_page=1
   <wp> post list --post_type=attachment --fields=ID --posts_per_page=1
   ```

   Add `post-new.php` for `page` and `post` too when the role uses them. Opening an existing item's editor sets its edit lock; step 9 clears it.

   A classic screen whose admin page is a JavaScript app (a plugin's single-page admin) renders its controls after load. When the first read finds no fields, the survey waits for the network to go idle and reads again; it records `"app": true` on the screen when the second read found fields. An `app` screen's `formFields` are the control labels to document.

   The script refuses a path whose `action` or `action2` value is trash, delete, dodelete, untrash, spam, unspam, activate, deactivate, approve, unapprove, logout, lock or unlock (also percent-encoded), a path with `delete_all=` or `delete_all2=` (Empty Trash and Empty Spam), and `wp-login.php?action=logout`.

   `survey.json` holds the role's admin menu and, per screen, the `screenId` (the admin screen id, from `pagenow`), the editor kind (`block`, `classic`, `site-editor` or `block-widgets`; the last two are recorded without the editor wait), the starter-pattern modal, the sidebar panels with their field labels, the meta boxes and the notices. Classic screens list the fields of the term, media, post, profile, Add User and Settings forms; any other screen lists every control in its `.wrap`. A select is written `Label [select: A | B | …]` (up to 30 options) or `Label [select: N options]`, so the Add User screen lists the assignable roles and the profile screen lists the language choices. It does not list buttons that have no label. A control with no label is listed as `(no label: <legend, heading, field name or "unlabelled">)`, tried in that order: find its label on screen before writing the step.

   A screen counts as a block editor screen only when the page body carries the server-rendered `block-editor-page` class; a screen without it is recorded as classic at once, with no wait and no warning. A screen that has the class but whose editor does not load within `--timeout` gets a `warning` and is recorded as classic.

   A screen that fails is recorded with an `error`, printed as FAIL, and makes the script exit 1. The causes are HTTP 400 or above, a redirect to `wp-login.php`, a `wp_die` page, and `redirected to <path>` for a `/wp-admin/` screen that lands on another screen (front-end URLs may redirect). A login failure ends the run with exit 2: `login failed: <text>`, `login landed outside /wp-admin/: <url>` or `login timed out: the submit never navigated`. `node <skill-dir>/scripts/survey.mjs --help` lists the options and exit codes.
4. **Reconcile.** Check each inventory item against the survey: it is a guide step, a deliberate omission (with the reason), or a finding (it is in the code but out of the role's reach). Then open one existing, fully filled item per type, without saving, to see real values and the editor view the template gives it. Keep a draft `<work>/sections.json` (screen to section id, format in `references/outputs.md`) so a plugin build later has it; rebuild it from the final section ids if it drifts.
5. **Shoot.** Write a shot list per section and run

   ```bash
   WP_USER=guide-user WP_PASSWORD=<password> node <skill-dir>/scripts/shoot.mjs --shots <work>/shots.json --base <site-url> --out <work>/guide/shots --height 1500
   ```

   `node <skill-dir>/scripts/shoot.mjs --help` prints the shot-list format. `<work>/guide/` holds the guide HTML, so the image paths in `references/outputs.md` line up. Read every PNG before you use it.

   - A shot with `"editor": true` leaves the starter-pattern picker open. Add a step that closes it (click the modal's close button) unless the shot shows the picker.
   - Every taxonomy whose term screens have custom fields (see `references/inventory.md`, Term meta) gets an add-form shot (`edit-tags.php?taxonomy=<slug>`) with a callout on each custom field. When the edit form (`term.php?taxonomy=<slug>&tag_ID=<id>`) shows fields the add form lacks, or shows them differently, it gets its own shot with callouts on those fields. Shoot the edit form on an existing, filled term without saving, so the fields show real values.
   - Shoot the add form filled but unsaved, and the edit form on an existing, filled term; both are the default. Create a `[guide]` term only when a shot needs a saved term: make it by hand in the browser as the audience user and add it to `<work>/created.txt`. A shot step that saves triggers the risky-step warning (see "Saving content"); that warning is expected there.
   - The script validates the shot list first and exits 2, listing every unknown key and bad type.
   - A shot FAILs, and `shots.json` lists it under `failed`, with `callout <selector> not found; add a step that opens its panel, or fix the selector`, `callout <selector> lies outside the WxH viewport; use a taller --height or split the shot`, or `depends on failed shot <id>`. After any failed shot, the url-less shots that follow fail with `depends on failed shot <id>` until the next shot with a `url`.
   - Re-shoot when a callout misses its target, a badge covers a label, a spinner or a modal hides the subject, or the crop cuts a label off. Pass `--only id1,id2` to re-shoot some shots: a listed shot without a `url` also runs, without capturing, the shots back to the nearest earlier one that has a `url`; results merge into the existing `shots.json` by id; an unknown id exits 2.
   - Shoot filled panels on an existing item. A fresh user sees most sidebar panels collapsed, and the editor remembers the panels a user opened across runs. A shot that needs a panel's contents adds `{"openPanel": "<panel title>"}`, one step per panel; it does nothing when the panel is open and fails the shot with `panel "<title>" not found` when the panel is absent. Never assume a panel's state.
   - Use structural selectors (ids, classes, element structure) for `wait` steps and callouts. Text selectors break when the UI language or a translation changes.
   - On form-table settings screens (label in a `th`, control in a `td`), call out the row (`tr:has(#field-id)`) so the label shows in the crop.
   - Keep generated secrets out of the image. The Add User screen shows a generated password: shoot that form with the password field outside the crop, or blank.
   - A plugin admin page that changes its view with the URL hash (`#settings-<service>`) can ignore the hash when the page loads. Open the view as the reader does: add `click` steps on the plugin's own menu entries, then capture.
   - Find icon-only buttons (duplicate, settings, delete in a table row) by their icon class, never by position: the first button in a row can be "duplicate", which opens an unsaved copy. In the guide, name such a button by its icon and colour, for example "the green cog button".
6. **Write the guide.** Use the structure and plain-language rules in `references/guide-structure.md`. Write it to `<work>/guide/guide.html`.
7. **Audit before delivery.** Pair every step and every label with its source: the `survey.json` entry, a screenshot, or a file:line. Cut whatever has no source. Write each label exactly as the screen shows it, even when a plugin shows it in another language, and give the meaning in the guide's language next to it. Compare every label the guide quotes with the current `survey.json`: labels change when plugins or their translations update, so re-run the survey after any update and fix each quote that differs.
8. **Deliver** in the agreed output (`references/outputs.md`). For the plugin, finish `<work>/sections.json`, which links each post type, taxonomy and screen to its section; the screen keys come from `survey.json` `screenId`.
9. **Clean up.** Read `<work>/created.txt` and run every command with the throwaway user still in place; delete it last.
   1. List what the throwaway user authored, as rows: `<wp> db query "SELECT ID, post_type, post_status, post_title FROM $(<wp> db prefix)posts WHERE post_author=<id>"`. The query ignores WPML's language filter, so translated posts show up too.
   2. Delete the auto-drafts, the `[guide]` titles and the untitled drafts the editor autosaved from a new item (a new-item screen left open for about a minute autosaves into a draft): `<wp> post delete <ids> --force`. Reassigning would hide who created them. Uploads made on media screens are `attachment` rows in the same list: the same command deletes them.
   3. Delete the `[guide]` terms, which also removes their term meta. Find them with `<wp> db query "SELECT t.term_id, tt.taxonomy, t.name FROM $(<wp> db prefix)terms t JOIN $(<wp> db prefix)term_taxonomy tt ON tt.term_id = t.term_id WHERE t.name LIKE '[guide]%'"`, add the terms in `created.txt`, then `<wp> term delete <taxonomy> <term-id>`.
   4. With WPML, delete the translations of every `[guide]` post and term too, each by its ID (`references/inventory.md`, Multilingual, has the lookup).
   5. Clear the edit locks on the items opened in step 4: `<wp> post meta delete <id> _edit_lock`.
   6. Restore what the menu and settings save tests changed (menu items, `wp_navigation` posts, synced content, options) with the restore steps of "Saving content".
   7. Delete the `guide-sample-<n>` users: `<wp> user delete <id> --yes`.
   8. Re-check: re-run the query from item 1, the `[guide]%` term query and every line of `created.txt`. Continue only when no auto-draft, `[guide]` title, untitled draft, `[guide]` term or created item is left: a batch delete can stop part-way, and a user delete then reassigns the rest.
   9. Delete the throwaway user last: `<wp> user delete <id> --reassign=<admin-id> --yes`, so content that site code created during the walk's requests survives.
   10. Log each finding from steps 4 and 5 (unreachable fields or screens, editor errors, untranslated labels) in the project's tracker with its evidence. Keep findings out of the client's guide.

Prefer the `WP_USER` and `WP_PASSWORD` environment variables: `--password` shows in the process list. `to-markdown.py` and `to-plugin.py` need `pip install beautifulsoup4`.

## Saving content

Walk new-item screens without saving whenever a screenshot can show the step. When a step needs a saved item (the publish confirmation, a translation, a term with meta, an upload, a user), create it as a draft titled `[guide] <type>` (a term named `[guide] <name>`, a user as described below). Add every created item to `<work>/created.txt`, and delete it in step 9. Edit and save only items you created. Existing items stay unsaved.

`shoot.mjs` prints `warning: shot <id>: step may save or delete content: <step>` at the start of a run for a step that looks like it saves, deletes or submits. The check is best-effort and does not block: the step still runs, and a step it misses runs silently. Read every step before you run the list. A shot step that saves triggers the warning; that is expected there. `shoot.mjs` accepts alerts and `beforeunload` dialogs and dismisses confirm and prompt dialogs with a warning.

Menus cannot be drafted. When the guide claims that saving one changes the site, prove it once on the local site (this is also the procedure for testing how a second language's menu is created):

1. Back up everything the save rewrites: the menu's items and the content of any store site code copies the menu into, for example per language; note the revision IDs.
2. Add a test item, save, and check the front end.
3. Remove the item by its ID, save, and check again.
4. Diff the result against the backup and restore any difference. Step 9 points here for the restore.

Settings screens save options. To show a result after saving, run these commands, with `<name>` an option name:

1. Back up the option: `<wp> option get <name> --format=json > <work>/backup/<name>.json`.
2. Change it on screen as the audience user, and verify the effect.
3. Restore it: `<wp> option update <name> "$(cat <work>/backup/<name>.json)" --format=json`.
4. Check it matches: `<wp> option get <name> --format=json | diff - <work>/backup/<name>.json`.

Some plugin screens save when the reader clicks a switch, with no save button (a module list, a status column). Treat that click as a save: back up the option first, or set the state with `<wp> option` for the walk and restore it in step 9. Find the switch through its own card or row, for example `.card:has(img[src$="/<service>.png"]) .switch`, never as the first or nth switch on the page: that switch can belong to another module.

Add each backed-up option to `<work>/created.txt` as `option <name> <backup path>`. The options behind Settings › General and Settings › Reading are listed in `references/inventory.md`, Users and settings. For a plugin settings page, take the option names from the form's `name=` attributes (in the page source) or from the plugin's `register_setting` calls. Saving a plugin page can call external services, so document it from the screen without saving unless the brief allows a test save.

Real data: before shooting users, forms and submissions screens, check that the local database holds only test users and demo submissions. Never capture the names, emails or form submissions of real people. When real data is present, leave those screens out of the screenshots and describe them in text.

Never change a high-impact setting (`references/inventory.md`, Users and settings) on a site others use. Document those from the screen without saving.

Users: a screenshot that needs a saved user uses a sample user created on the role's Add User screen, with an `example.test` email, for example `guide-sample-1@example.test`, and a `[guide]` display name. Name the sample users `guide-sample-<n>` and add each to `<work>/created.txt`.

## External services

Some plugin screens connect the site to an outside service (a newsletter, CRM or payment account) and need a key or a login from that service.

- Steps in the service's own account are not on a WordPress screen. Take each step from the service's help pages: open the page, and link it in the guide next to the steps. Quote the menu names as the help page shows them. When the service can show another language than the guide, give both names, for example **Profile** (Perfil). Add no screenshots of the service's account.
- A key or token gives access to the account. Put a warning box before the step: the reader pastes the key into the WordPress field and never sends it by email or chat. Use no real key in the walk or in a screenshot.
- Shoot the WordPress side up to the point where the key is needed: the module switch (see "Saving content" for switches that save on click), the key field, and the message the plugin shows while no key is saved. Readers see that message, so name it in the steps.
- A screen that opens only with a working key (a feed or a field-mapping form) is out of the walk's reach. When the brief gives no test account, write those steps from the plugin's own labels in the admin language. Get each label with `<wp> eval 'switch_to_locale( "<locale>" ); echo __( "<string>", "<domain>" );'` and pair it with its file:line. Ship no screenshot of that screen, and log a finding to shoot it when the account is connected. This is the only exception to "document the screen, not the code": the role can open the screen once the account exists.

## Quick reference

| Guide needs | Get it from |
| --- | --- |
| What the role sees in the menu | `survey.json` → `menu` |
| Sidebar panels and fields per type | `survey.json` → `screens[].panels`, `metaBoxes` |
| Post summary fields (status, visibility, author) | `survey.json` → `screens[].summaryFields`, `summaryRows` |
| Template lock, starting blocks and post type of a block editor screen | `survey.json` → `screens[].templateLock`, `blocks`, `postType` |
| Fields and page heading of a classic screen (list, term, media, menus) | `survey.json` → `screens[].formFields`, `heading` |
| Why a screen failed or loaded as classic | `survey.json` → `screens[].error`, `warning` |
| Whether a new item starts from a pattern | `survey.json` → `screens[].startModal` |
| Whether a plugin screen rendered its controls with JavaScript | `survey.json` → `screens[].app` (`true`: the fields appeared after load) |
| A sidebar panel a shot needs open | the `openPanel` shot step, by panel title |
| Whether the editor shows the template | `supports.editor.default-mode`, the **View › Show template** toggle |
| Where the excerpt and featured image appear on the site | `wp:post-excerpt` / `wp:post-featured-image` in templates and card patterns |
| SEO fields | the SEO plugin's sidebar or meta box, surveyed like any panel |
| Taxonomy term fields | `screens[].formFields` of `edit-tags.php` and `term.php` in the survey; term meta checks in `references/inventory.md`, Term meta |
| Site Editor sections and what each changes | `references/site-editor.md` |
| Roles the reader can assign | `survey.json` → the Add User screen's `Role [select: …]` field, plus `<wp> cap list <role>` per role |
| Settings fields and the options behind them | `survey.json` → `formFields` of the settings screens; `references/inventory.md`, Users and settings |
| High-impact settings | `references/inventory.md`, Users and settings |
| Classic menu screen, part by part | `references/guide-structure.md`, Menus |

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Surveying as an administrator | Use a throwaway user with the audience role |
| Disabling the starter-pattern picker (`enableChoosePatternModal`) in automation | Leave it on: `survey.mjs` records the picker and then closes it, `shoot.mjs` keeps it open until a step closes it, and the guide shows it |
| Reusing a user whose saved preferences hide first-run screens | Create a new user, or delete its `<prefix>persisted_preferences` user meta (`<wp> db prefix` prints the prefix) |
| Skipping a term field because it is optional | Check what reads the meta on the front end; a field that changes a page gets a step |
| Writing steps from `register_post_meta()` or block code | Confirm each field on screen first; an unreachable field is a finding |
| Translating a control label the screen shows in English | Quote the label as shown and explain it in the guide's language |
| Full-screen screenshots without callouts | Crop to the area of the step and number the controls the text refers to |
| Sending readers to screens their role does not open (Site Editor, settings, users) | Check the survey menu; leave out what the role cannot reach |
| Saving a high-impact setting on a shared site | Document the settings in the high-impact list (`references/inventory.md`, Users and settings) from the screen without saving; back up and restore any other option |
| Waits and callouts on text selectors | Use ids, classes and element structure: text changes with the UI language and translation updates |
| Locating a menu item by its text in a script | Use `#menu-item-<id>`: each item's hidden parent selector lists every title, so a text match hits all items |
| Testing a menu save without a backup | Back up the items and synced content first; restore and diff after |
| Documenting a field or block that errors on screen | Leave it out of the guide and log the error as a finding |
| A badge hiding a menu item or field label | Set `"badge": "left"`, `"right"` or `"top-right"` on that callout |
| Panels taller than the viewport, so callouts land off-screen | The shot fails with `lies outside the WxH viewport`: raise `--height` (1500 fits most sidebars) or split the panel into several shots |
| A callout selector that matches nothing, or a panel that is collapsed | The shot fails with `callout <selector> not found`: add an `openPanel` step for the panel, or fix the selector |
| Clicking a module or status switch to see what it does | The click saves at once: back up the option first, and select the switch through its card or row |
| Opening a hash-routed plugin view by URL | Click through the plugin's own menu in the shot steps |
| Screenshots or steps inside a third-party account, or a real API key in the walk | Link the service's help page for those steps; shoot only the WordPress side, with no real key |
| Deleting the throwaway user with all its content | Delete the walk's drafts, terms, uploads and sample users first (everything in `created.txt`), then delete the user with `--reassign` |
