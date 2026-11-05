# Content model inventory

The inventory lists everything the audience role might fill in or change. The survey then checks which of it the role can reach. Run the commands on the local site; `<wp>` is the project's WP-CLI wrapper (SKILL.md, Workflow).

## WP-CLI

```bash
<wp> post-type list --fields=name,label,public,show_ui --format=table
<wp> taxonomy list --fields=name,label,object_type,show_ui --format=table
<wp> role list --fields=name,role
<wp> cap list <role>                          # what the audience role can do
<wp> plugin list --status=active --field=name # SEO, multilingual, forms, shop, custom fields
<wp> post list --post_type=<type> --post_status=any --format=count   # empty types are often out of scope
<wp> option get page_on_front; <wp> option get page_for_posts
<wp> menu list                                # classic menus, if any
<wp> post list --post_type=wp_navigation --fields=ID,post_title       # block menus
```

Keep the post types and taxonomies with `show_ui` that the role's capabilities allow. Leave out core internals (`wp_block`, `wp_template`, `wp_global_styles`) unless the role is meant to edit them.

## Code patterns to grep

| What | Grep for | Becomes in the guide |
| --- | --- | --- |
| Post type supports | `'supports'`, `add_post_type_support`, `remove_post_type_support` | Whether title, editor, excerpt, featured image and revisions exist per type |
| Block editor or classic screen | `use_block_editor_for_post_type`, `'show_in_rest' => false` | Which editor the type opens in |
| Editor view | `'default-mode'`, `template-locked` | Whether the template shows around the content by default |
| Block template and lock | `'template'`, `'template_lock'` | Fixed blocks on new items, and what can move |
| Starter patterns | `Block Types: core/post-content`, `Post Types:` in pattern headers | The pattern picker on new items |
| Post meta | `register_post_meta`, `register_meta` | Fields to find on screen |
| Sidebar panels | `registerPlugin`, `PluginDocumentSettingPanel`, `PluginSidebar` | Panels in the settings sidebar and extra sidebars in the top bar |
| Meta boxes | `add_meta_box`, `Fieldmanager_`, `acf_add_local_field_group`, `cmb2` | Boxes below the editor or on classic screens |
| Term fields | `{$taxonomy}_add_form_fields`, `{$taxonomy}_edit_form_fields`, `Fieldmanager_Context_Term` | Extra fields when adding or editing a term |
| Term meta | `register_term_meta`, `register_meta( 'term'`, `get_term_meta` in templates and render code | What each term field accepts and what it changes on the site (see below) |
| Attachment fields | `attachment_fields_to_edit`, media taxonomies | Alt text, credits, media categories |
| Blocks that edit meta | `useEntityProp( 'postType'`, block bindings with `canUserEditValue` | Fields edited on the canvas, often only with the template shown |
| Custom statuses | `register_post_status`, status pickers | States beyond Draft and Published |
| Menus | `register_nav_menus`, `wp:navigation` in parts, `wp_navigation` posts | Which menu surface applies (see below) |
| Where excerpt and image appear | `wp:post-excerpt`, `wp:post-featured-image`, `the_excerpt`, `the_post_thumbnail` in templates and patterns | "This shows on the cards in X" |

## Term meta

Term fields are easy to miss: they sit on a separate screen, and field libraries often point the label at the field name, not the control's `id`. For each taxonomy the role can manage, survey both `edit-tags.php?taxonomy=<slug>` (add form) and `term.php?taxonomy=<slug>&tag_ID=<id>` (edit form). A term screen has custom fields when either form shows anything beyond Name, Slug, Parent and Description: term meta fields, fields added through `{$taxonomy}_add_form_fields` or `{$taxonomy}_edit_form_fields`, a field library (Fieldmanager, ACF, CMB2), or a plugin's term fields such as SEO or language settings. Compare the two forms' `formFields` in `survey.json`: a field listed only for `term.php` is edit-only. Every taxonomy with custom fields gets screenshots (step 5 of SKILL.md).

Then read each term meta key's registration and its readers:

- **Behaviour-changing term fields**: an SEO plugin's per-term fields (canonical URL, robots or indexing, redirect URL) change how the term page behaves. Flag each in a warning box in the guide with how to undo it.
- **Accepted values**: the `sanitize_callback` and the field's options. A select or allowlist becomes the list of choices in the guide.
- **Who can save it**: the `auth_callback`. Save one `[guide]` term as the audience role, read the meta back with `<wp> term meta get`, then delete the term.
- **Required or optional**: the field's description, a `pre_insert_term` filter that returns a `WP_Error`, or an admin notice. Optional fields that change the front end still get a step.
- **What it changes**: grep `get_term_meta( …, '<key>'` in templates, blocks and helpers. Open one page that shows it and say in the guide what the reader sees there.
- **How much existing content uses it**: count the terms that have the meta set. A field almost every term has is one the editor is expected to fill.

## Users and settings

Run these for the audience role. The survey menu decides what the guide documents.

```bash
<wp> cap list <role> | grep -E '^(create_users|list_users|edit_users|promote_users|remove_users|delete_users|manage_options)$'
<wp> role list --fields=name,role
```

- **Users**: a capability missing from the grep output means the role lacks it. `create_users` gates Add User, `list_users` the Users list, `edit_users` editing other users, `promote_users` changing roles, `remove_users` and `delete_users` removal.
- **Assignable roles**: the options of the Role select on the Add User screen, recorded in `survey.json` as `Role [select: …]` in the `formFields` of `user-new.php`. The role table in the guide lists only those roles. Describe each in plain words from `<wp> cap list <role>`: what it can write, publish, upload or manage.
- **Settings screens and plugin pages**: list the screens in the survey menu (General, Writing, Reading, Discussion, Media, Permalinks, Privacy, and plugin pages such as forms, SEO and translation).
- **What each option changes**: for each settings screen, take the fields from the screen's `formFields` in `survey.json` and read the option behind each field (`<wp> option get <name>`) and grep where it is used (`get_option( '<name>'`, `get_bloginfo`, `pre_option_<name>` filters). The guide says what changes on the site, not the option name.
- **Fields added to core settings screens**: plugins and themes add fields to core screens (an extra page picker or a consent option on Reading, for example). Find them in the `formFields` of each core settings screen in `survey.json` that go beyond the core fields listed below, and in the code (`add_settings_field` and `register_setting` calls on the core screen ids, such as `reading`, `general`, `discussion`). Say what each one changes.
- **High-impact settings**: the one list for the whole skill. Flag each with a warning box in the guide, and document it from the screen without saving:
  - Settings › General: site address (`home`) and WordPress address (`siteurl`), the administration email (`admin_email`), membership and the new user default role (`users_can_register`, `default_role`).
  - Settings › Reading: the homepage and posts page (`show_on_front`, `page_on_front`, `page_for_posts`) and search engine visibility (`blog_public`).
  - Settings › Permalinks, Settings › Discussion defaults and the privacy policy page.
  - Any plugin setting that changes site-wide output.
- **Options behind Settings › General** (checked against `wp-admin/options-general.php` and `options.php`): `blogname`, `blogdescription`, `siteurl`, `home`, `admin_email` (the screen field is `new_admin_email`; WordPress applies it after the new address confirms), `users_can_register`, `default_role`, `timezone_string`, `gmt_offset` (set when a UTC offset is chosen), `date_format`, `time_format`, `start_of_week`, `WPLANG`, `site_icon`.
- **Options behind Settings › Reading** (checked against `wp-admin/options-reading.php`): `show_on_front`, `page_on_front`, `page_for_posts`, `posts_per_page`, `posts_per_rss`, `rss_use_excerpt`, `blog_public`.
- **Options behind a plugin settings page**: the `name=` attributes of the form fields (in the page source) or the plugin's `register_setting` calls.


## Admin notices

Check every notice the survey records in `notices`. A notice that reports a site problem (a missing translation, a misconfiguration) is a finding for the tracker, not guide content.

## Menus

Two surfaces exist. A site can use one, the other, or both, and the role may reach neither.

- **Classic menus**: Appearance › Menus (`nav-menus.php`). They need theme menu locations (`register_nav_menus`) or a block that renders a classic menu. The role needs `edit_theme_options`.
- **Block menus**: the Navigation block, edited in the Site Editor › Navigation (`site-editor.php?p=/navigation`) or by selecting the block in a template. These are stored as `wp_navigation` posts. The role needs `edit_theme_options`, and the project must allow that role in the Site Editor.
- **Customizer**: `customize.php`, linked from the classic menu screen. With classic menus it has a Menus panel too, and often site identity and homepage settings. Check whether the role opens it and whether the project's menu code reacts to its saves.

Check which screens the survey menu lists for the role, and put `nav-menus.php`, `site-editor.php` and `customize.php` in the survey list. Document only the surfaces the role reaches. When the project keeps non-admins out of the Site Editor, the guide never sends editors there, even when the role technically opens it. The Site Editor's sections are described in `site-editor.md`.

When site code copies menus into another store, for example per language, read that code before writing the steps: it decides what a save changes.

## Multilingual

With WPML, Polylang or a similar plugin active, survey one item's language box and the translation screen the role reaches. Survey the term translation screen too. Document the flow once and link to it from each type.

Survey `profile.php` and `user-new.php` too: with WPML or a similar plugin they show a language field for the user. When `survey.json` lists one, document it in the Users section.

To clean up a translated `[guide]` item in step 9 of SKILL.md, list its translations from the WPML table `icl_translations` (columns `element_type`, `element_id`, `trid`, `language_code`; the table name carries the database prefix, `<wp> db prefix`). For a post, `element_id` is the post ID and `element_type` is `post_<post_type>`:

```bash
<wp> db query "SELECT element_id, language_code FROM $(<wp> db prefix)icl_translations WHERE trid = (SELECT trid FROM $(<wp> db prefix)icl_translations WHERE element_id = <post-id> AND element_type = 'post_<post_type>')"
```

For a term, `element_id` is the term taxonomy ID and `element_type` is `tax_<taxonomy>`. Get the term taxonomy ID with `<wp> term list <taxonomy> --include=<term-id> --fields=term_id,term_taxonomy_id`, run the same query with that ID, and map each returned ID back to a term ID the same way (`<wp> term list <taxonomy> --fields=term_id,term_taxonomy_id`). Delete each translation by its own ID with `<wp> post delete <id> --force` or `<wp> term delete <taxonomy> <term-id>`.
