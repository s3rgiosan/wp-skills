# Theme Security Checklist

Theme-specific audit categories with detection patterns, verification, typical severity and fix. This file sits **on top of** the plugin skill's `security-checklist.md`: any REST route, AJAX handler, admin page, meta registration, cron job, file operation or DB query in the theme is also audited against that file in full (auth, nonces, IDOR, sanitize, escape, SQLi, SSRF, deserialization, secrets, error disclosure). Every escape / sanitize / nonce / SQLi candidate goes through the plugin skill's `false-positive-traps.md` before it is written.

**Running the Detect commands.** They are written as `grep -R ... .` for readability. Run them over the scoped file list from SKILL.md → Discover (`srcgrep '\.php$' "<pattern>"`), or add `--exclude-dir={node_modules,vendor,dist,build}`, so build output and dependencies never produce hits or counts. Every section's result goes into the report's "Sections audited" line (SKILL.md → Manual read → traversal rule).

**Reachability first.** A hit only counts if the code runs: the file is loaded, the class is instantiated or registered, any `can_register()`-style guard passes in the relevant context, and the hook is actually added. Code that never runs is **Info** ("dead code, would be <severity> if enabled"). See SKILL.md → Verify for the procedure and the module-registry commands.

Severity follows the plugin skill's rubric. The recurring theme question is **which role can write the value this code renders or trusts**, answered from the capability that gates the write path (see SKILL.md → Verify). This table is the authoritative reference point for every section below; section-level severity notes refine it, they do not replace it:

| Lowest role that reaches the sink | Typical rating for stored XSS / content integrity |
|---|---|
| Unauthenticated, an auto-granted role (Subscriber / Customer), or a gate capability every logged-in user holds (`read`) | **Critical** |
| Contributor / Author | **High** (a payload in a pending post runs in the browser of the Editor or Administrator who previews it: a path to admin account takeover) |
| Editor or per-site Administrator on multisite (neither holds `unfiltered_html` there) | **High** for XSS reaching Super Admins or visitors; **Medium** otherwise |
| Any role holding `unfiltered_html` (Editors and Administrators on single site, Super Admins) | Not a vulnerability (they can already post script); at most a hardening note |

Escalate a Contributor/Author finding to Critical when open registration or an integration assigns that role automatically. Unfiltered HTML in a core-stored field (post title, content, excerpt, term, user profile fields) usually traces back to a writer with `unfiltered_html`, because core kses-filters those fields at save for everyone else; meta, options and plugin fields have no such filter (SKILL.md → Verify).

**Chains.** When a write path in one section feeds a sink in another (for example §2 raw meta consumed by a §3 generator), rate the chain once, by its end-to-end precondition and impact, as one finding citing both locations. List the parts separately only when each is independently exploitable. The number of patterns involved is not a reason to escalate; the rubric clause is.

---

## 1. kses / allowed-HTML widened by a low capability

**What.** Filters that add tags, attributes or protocols to what kses allows, or that grant `unfiltered_html`, change what every user without `unfiltered_html` can store. Typical shape: a theme adds `<script>`, `<iframe>`, `<style>`, `<form>` or `on*` attributes "so editors can paste embeds", gated by `edit_posts`, which Contributors and Authors hold. A comment often claims a stricter gate ("admins only") than the code enforces.

**Detect:**
```bash
grep -RnE "add_filter\(\s*['\"](wp_kses_allowed_html|kses_allowed_protocols|safe_style_css|safecss_filter_attr_allow_css)['\"]" --include="*.php" .
grep -RnE "add_filter\(\s*['\"](map_meta_cap|user_has_cap)['\"]" --include="*.php" .
grep -RnE "unfiltered_html|edit_css" --include="*.php" .
grep -RnE "(script|iframe|style|object|embed|form)['\"]\s*=>" --include="*.php" .   # tags added to an allowed-HTML array
```

**Verify.** Read each callback end to end. Note the `$context` it modifies (`post` is post content for every user without `unfiltered_html`). Identify the capability that decides whether the widened list applies, and map it to roles (`edit_posts` → Contributor and up). For `user_has_cap` / `map_meta_cap`, confirm which primitive caps are granted to whom. Compare with any comment describing the gate and quote both in the finding.

**Severity.** `<script>`, `on*` attributes, `javascript:` in `kses_allowed_protocols`, or `unfiltered_html` granted to Authors or Contributors: **High** (Contributor/Author stored XSS), **Critical** if the gate is `read` or another auto-granted capability. `<iframe>` alone: **Medium** (framing, phishing, clickjacking within the site's origin). `<style>`: **Medium** (UI redress, content spoofing).

**Fix.** Remove the widening. Users who hold `unfiltered_html` (Editors and Administrators on single site, Super Admins on multisite) already bypass kses, so a filter gated on that capability adds nothing. For third-party media, use the Embed block (oEmbed) or register an oEmbed provider; for anything else, a block with a validated URL attribute. Keep `kses_allowed_protocols` to the core list. If a lower role genuinely needs one extra tag, add only that tag with a minimal attribute list, never `<script>`, `<style>` or `on*` attributes.

---

## 2. Meta registered for REST without a meaningful `auth_callback`, rendered raw

**What.** `register_post_meta( '', 'hero_html', [ 'show_in_rest' => true ] )` exposes the key to `POST /wp/v2/<type>/<id>` with `meta`. Core's defaults: a key **without** a leading underscore is writable by anyone who can `edit_post` that post (a Contributor on their own draft); a protected key (leading `_`) is writable only when an `auth_callback` allows it. An `auth_callback` that returns `true`, or checks only `edit_post`, gives the same Contributor reach. Meta values are not kses-filtered on save. When a template or render file then outputs the value raw, or passes it through code that disables kses (`kses_remove_filters()`, `remove_filter( 'content_save_pre', 'wp_filter_post_kses' )`), the Contributor has stored XSS. Watch for docblocks next to the `auth_callback` or `sanitize_callback` that assert a stronger guarantee than the code gives ("requires `unfiltered_html`, enforced by the `edit_post` check"): `edit_post` never implies `unfiltered_html`. Re-derive the capability chain yourself; a confident wrong comment is worse than none.

**Detect:**
```bash
grep -RnE "register_(post|term|user)?_?meta\(" --include="*.php" . -A12 | grep -E "register_|show_in_rest|auth_callback|sanitize_callback|type"
grep -RnE "kses_remove_filters|remove_filter\(\s*['\"](content_save_pre|content_filtered_save_pre|pre_comment_content)['\"]" --include="*.php" .
# Then, for each registered key, find where it is rendered
grep -RnE "get_post_meta\([^)]*['\"]<key>['\"]" --include="*.php" --include="*.html" .
```

**Verify.** For each key: leading underscore or not, `show_in_rest` value, the exact `auth_callback` body, the `sanitize_callback` (or its absence), and every render site with its escaping. The finding needs both ends: the write path (`register_post_meta` line) and the raw sink (template line). Check the key's object subtype: `''` applies to every post type, including ones Contributors can create.

**Severity.** Writable by Contributor/Author and rendered unescaped: **High**. Writable only by Editor: not a vulnerability on single site (Editors hold `unfiltered_html`); **Medium** on multisite, **High** if it reaches Super Admins. Writable but always escaped at output: not XSS; consider a **Low** for a missing `sanitize_callback` if the shape matters.

**Fix.** Escape at output for the value's context. Add an `auth_callback` that checks the capability the field actually needs and a `sanitize_callback` for the shape:

```php
register_post_meta( 'page', 'acme_hero_html', [
	'show_in_rest'      => true,
	'single'            => true,
	'type'              => 'string',
	'sanitize_callback' => 'wp_kses_post',
	'auth_callback'     => fn() => current_user_can( 'unfiltered_html' ),
] );
```

---

## 3. Generators and save hooks that bypass kses or publishing rights

**What.** Theme code on `save_post`, `wp_insert_post_data`, `rest_after_insert_{$post_type}` or a custom generator creates or updates other content. Two failure shapes: (a) it calls `kses_remove_filters()` (or removes `content_save_pre`) before `wp_insert_post()` / `wp_update_post()`, storing unfiltered HTML derived from a lower-privilege user's input; (b) it sets `post_status => 'publish'` on the generated or source post regardless of the source post's status and the saving user's `publish_posts` capability, so a Contributor's pending draft goes live (contributor publishing bypass).

**Detect:**
```bash
grep -RnE "add_action\(\s*['\"](save_post|save_post_[a-z_]+|wp_insert_post|rest_after_insert_[a-z_]+|transition_post_status)['\"]" --include="*.php" .
grep -RnE "add_filter\(\s*['\"]wp_insert_post_data['\"]" --include="*.php" .
grep -RnE "wp_(insert|update)_post\(|['\"]post_status['\"]\s*=>\s*['\"]publish['\"]" --include="*.php" .
grep -RnE "kses_remove_filters|kses_init_filters" --include="*.php" .
```

**Verify.** For each callback: which user's request triggers it (the saving user), whether it checks `current_user_can( 'publish_posts' )` / `current_user_can( 'publish_post', $id )` before publishing, whether it checks the source post's `post_status`, and whether kses is re-enabled on every path (including early returns and exceptions). Reproduce with a Contributor where possible: save a draft, then check the generated post's status.

**Severity.** Contributor can publish (bypass of editorial review): **High**. Contributor input stored with kses disabled and rendered: **High** (stored XSS). Silent status or content rewrites on content the theme generates can meet the silent-corruption rule; apply its three questions. When the same write path shows both shapes, or is fed by §2 meta, it is one chained finding (see Chains at the top of this file), rated High unless the triggering role is auto-granted.

**Fix.** Mirror the source post's status, never escalate it, and gate on the saving user's capability. Leave kses enabled; if trusted HTML is genuinely needed, filter the input with `wp_kses_post()` explicitly.

```php
$status = get_post_status( $source_id );
if ( 'publish' === $status && ! current_user_can( 'publish_post', $source_id ) ) {
	$status = 'pending';
}
```

---

## 4. REST and sitemap exposure of gated content

**What.** Content meant to be reachable only after a form or login is exposed by registration flags: a CPT for thank-you pages or gated assets registered with `public => true` / `show_in_rest => true`; meta holding the gated file URL registered with `show_in_rest`; core sitemaps (`/wp-sitemap.xml`) or SEO plugin sitemaps listing the CPT. `exclude_from_search` does not remove a type from REST or sitemaps. `GET /wp/v2/<type>?_fields=id,link,meta` then enumerates every gated URL without submitting the form.

**Detect:**
```bash
grep -RnE "register_(post_type|taxonomy)\(" --include="*.php" . -A25 | grep -E "register_(post_type|taxonomy)|public|publicly_queryable|show_in_rest|exclude_from_search|rewrite"
grep -RnE "register_(post_|term_)?meta\(" --include="*.php" . -A15 | grep -E "register_|show_in_rest|auth_callback"   # meta holding gated URLs
grep -RnE "wp_sitemaps_(post_types|add_provider|posts_query_args)|wpseo_sitemap_exclude_post_type|wpseo_exclude_from_sitemap" --include="*.php" .
grep -RnE "show_in_rest" --include="*.php" .
```

**Inherited defaults.** The Detect window only sees arguments written next to the call. When the theme registers types through a base class (a framework `AbstractPostType` / `AbstractTaxonomy`, or the theme's own abstract class), the effective `public`, `publicly_queryable` and `show_in_rest` are whatever the parent's options method returns unless the child overrides them. Resolve the arguments through every parent class, including base classes under `vendor/`: the `vendor/` skip applies to auditing vendor code, not to resolving what the theme's own registrations inherit. Framework base classes commonly default both `public` and `show_in_rest` to `true`; for example, the open-source [10up WP Framework](https://github.com/10up/wp-framework)'s `AbstractPostType` and `AbstractTaxonomy` do.

```bash
grep -RnE "class [A-Za-z_]+ extends [A-Za-z_\\\\]*Abstract(PostType|Taxonomy)" --include="*.php" .          # theme types built on a base class
grep -RnE "'(public|publicly_queryable|show_in_rest)'\s*=>" vendor/10up/wp-framework/src/ 2>/dev/null    # the base defaults; set the path to the base class in use
```

On an environment, `wp post-type get <type> --fields=public,publicly_queryable,show_in_rest` and `wp taxonomy get <taxonomy> --fields=public,show_in_rest` give the resolved values directly.

**Verify.** Read every CPT and taxonomy the theme registers and ask of each: is any of it meant to be reachable only after a form, a login or a purchase? For each "yes", check `public`, `publicly_queryable`, `show_in_rest`, the REST exposure of its meta, and the sitemaps. On an environment: `curl -s "https://example.com/wp-json/wp/v2/<type>?_fields=id,link,meta&per_page=100"` and fetch the sitemap index; record whether gated items appear. Without an environment, derive exposure from the registration arguments and state it as traced-only. Confirm with the owner which content is meant to be gated.

**Severity.** Gated marketing assets enumerable without the form: **Medium** (business impact, no data breach). Anything personal or contractual (per-customer documents, private downloads): **High**, unauthenticated. Mark the fix a `[DECISION]` when the owner has not said what is gated.

**Fix.** Register gated types with `public => false`, `publicly_queryable => false`, `show_in_rest => false` (or a REST `permission_callback` via a custom controller), set `show_in_rest => false` on gated-URL meta, and remove the type from sitemaps:

```php
add_filter( 'wp_sitemaps_post_types', function ( $types ) {
	unset( $types['acme_gated_asset'] );
	return $types;
} );
```

---

## 5. Request routing overrides from unprotected values

**What.** Themes that implement custom permalinks or vanity URLs read a path from post meta (for example `acme_custom_path`) and route requests to it via `request`, `parse_request`, `do_parse_request`, `pre_get_posts`, `template_redirect` or a rewrite rule, usually paired with a `post_link` / `post_type_link` filter that prints the custom path and a `redirect_canonical` filter that stops core redirecting away from it. If the meta is writable by Authors (see §2) and the resolver does not check for collisions, an Author can set their post's custom path to `pricing` or `contact` and take over an existing, trusted URL, or point a URL at a draft. The same category covers routing built from other values: rewrite rules generated from term slugs (`add_rewrite_rule()` per `get_terms()` result) or from options. Trace those the same way; the question is always who can write the value the router trusts.

**Detect:**
```bash
# Every routing hook, and the files that register them
grep -RnE "add_(filter|action)\(\s*['\"](request|parse_request|do_parse_request|template_redirect|template_include|pre_get_posts|404_template|post_link|post_type_link|page_link|term_link|redirect_canonical)['\"]" --include="*.php" .
# Meta, option and term lookups inside the files that hook routing (the value the router trusts)
grep -RlE "add_(filter|action)\(\s*['\"](request|parse_request|do_parse_request|pre_get_posts|template_redirect)['\"]" --include="*.php" . \
  | while read -r f; do grep -nHE "get_(post|term|user)_meta\(|get_option\(|get_terms\(|meta_key|meta_query|\\\$wpdb->" "$f"; done
grep -RnE "add_rewrite_rule|add_rewrite_tag|query_vars" --include="*.php" .
grep -RnE "meta_key['\"]\s*=>\s*['\"][^'\"]*(permalink|path|slug|url)" --include="*.php" .
```

**Verify.** For **every** routing callback found (each class or module on its own), answer three questions and write the answers down:

1. **Who can write the value the router trusts?** The meta key's `auth_callback` (and whether it is protected with a leading `_`), the term's or option's editing capability. Unprotected, unregistered meta is writable by anyone who can edit the post.
2. **Does the router check for collisions before claiming a URL?** Against existing posts and pages (`get_page_by_path()`, `url_to_postid()`), terms, other custom paths, and core routes (feeds, `wp-json`, `wp-admin`, `wp-login.php`). No check means the stored value wins.
3. **Does it run before or after core resolution?** A `request` / `parse_request` / `do_parse_request` callback that replaces query vars runs before core resolves the URL, so it overrides existing content; a `template_redirect` fallback on 404 only claims unused URLs. Also check whether it resolves non-published posts.

**Traversal.** The report's §5 entry names each module or class that hooks a routing filter individually, with its result (for example `§5: AcmePathRouter H2 · AcmeTermRewrites checked, none · AcmeLegacyRedirects verified false`), never "permalink modules checked".

**Severity.** Author can claim an existing public URL: **High** (content spoofing on the site's own trusted URLs, phishing). Editor only: **Medium**. Values only administrators write (term slugs of an admin-only taxonomy, options): **Low** or not a finding. Resolver serves non-published posts: add that to the same finding.

**Fix.** Protect the key (leading `_` plus an `auth_callback` requiring `edit_others_posts`), reject paths that resolve to existing content or core routes on save and again at resolution, prefer a `template_redirect` 404 fallback over pre-resolution overrides, and resolve only published posts.

---

## 6. Render-by-ID without status, type or password checks

**What.** A shortcode or block that renders another post by ID (`[acme_embed id="42"]`, a "reusable section" block with a `postId` attribute) calls `get_post( $id )` and outputs `apply_filters( 'the_content', $post->post_content )` without checking post type, `post_status`, `post_password_required()` or `current_user_can( 'read_post', $id )`. A Contributor embeds a private page, a draft, or a password-protected post into their own content, and previews or gets it published.

**Detect:**
```bash
grep -RnE "get_post\(\s*\\\$(atts|attributes|attr|id|post_id)" --include="*.php" .
grep -RnE "apply_filters\(\s*['\"]the_content['\"]\s*,\s*\\\$[a-z_]+->post_content" --include="*.php" .
grep -RnE "do_blocks\(|render_block\(" --include="*.php" .
```

**Verify.** Confirm the ID comes from shortcode or block attributes (author-controlled), and list which of the four checks are missing. Also check recursion (a post embedding itself).

**Severity.** Private or password-protected content disclosed to anyone who can create a post: **High**. Only published content of an unexpected post type: **Low**.

**Fix.**

```php
$post = get_post( $id );
if (
	! $post
	|| ! in_array( $post->post_type, [ 'acme_section' ], true )
	|| 'publish' !== $post->post_status
	|| post_password_required( $post )
	|| ! is_post_publicly_viewable( $post )
) {
	return '';
}
```

---

## 7. Template output of third-party data without escaping

**What.** Templates render values the theme did not write: fields from a profile or author-box plugin, ACF `get_field()` / `get_sub_field()`, `get_the_author_meta()` for custom keys, term names and descriptions, options set by other plugins, form or marketing snippets stored in options. `get_field()` returns the stored value; whether `the_field()` escapes depends on the installed ACF version, so check it rather than assuming.

**Detect:**
```bash
grep -RnE "(echo|print|<\?=)\s*[^;]*(get_field|get_sub_field|get_the_author_meta|get_user_meta|get_term_meta|get_option|term_description|category_description)\(" --include="*.php" .
grep -RnE "\b(the_field|the_sub_field|the_author_meta)\(" --include="*.php" .
grep -RnE "\\\$term->(name|description)|\\\$user->[a-z_]+" --include="*.php" .
```

**Verify.** For every unescaped output, **trace and state the third-party write path and its capability**: open the supplying plugin, find where the field is saved (profile screen, front-end form, REST, import), and name the capability that gates it. Profile fields are often writable by the user themselves (Subscriber). Core fields have their own filters (user `description` and term descriptions are kses-filtered for users without `unfiltered_html`); a custom field usually has none. If the write path cannot be determined, say so and rate for the lowest plausible role.

**Severity.** By the writing role, per the table at the top of this file. A field writable by the user on their own profile and rendered unescaped on public author pages: **Critical** on sites with open registration, **High** otherwise.

**Fix.** Escape at the point of output for its context: `esc_html()`, `esc_attr()`, `esc_url()`, or `wp_kses_post()` for fields meant to hold rich text. Do not rely on the supplying plugin to have sanitized the value.

---

## 8. Superglobals spliced into shortcode strings

**What.** `echo do_shortcode( '[acme_form id="' . sanitize_text_field( $_GET['form'] ) . '"]' );`. `sanitize_text_field()` strips tags and line breaks but keeps quotes and square brackets, so a request value of `1" redirect="https://attacker.example` injects attributes, and `1"][other_shortcode]` injects another shortcode. Every shortcode registered on the site becomes reachable from a URL parameter.

**Detect:**
```bash
grep -RnE "do_shortcode\(\s*['\"][^'\"]*['\"]\s*\.\s*" --include="*.php" .
grep -RnE "do_shortcode\([^)]*\\\$_(GET|POST|REQUEST|COOKIE|SERVER)" --include="*.php" .
```

**Verify.** Trace every concatenated variable back to request data (including via `get_query_var()`). List which shortcodes are registered on the target site (`wp eval 'echo implode( "\n", array_keys( $GLOBALS["shortcode_tags"] ) );'` on an environment) and which attributes they honour.

**Severity.** Reflected, unauthenticated: **Medium** at minimum; **High** or **Critical** when a registered shortcode renders private data, performs actions or outputs attributes unescaped.

**Fix.** Do not build shortcode strings from input. Call the underlying function with a validated array, or validate strictly (`absint()`, an allowlist) before building the string.

```php
$form_id = absint( $_GET['form'] ?? 0 );
echo do_shortcode( sprintf( '[acme_form id="%d"]', $form_id ) );
```

---

## 9. Block render files and Interactivity API

**What.** In a dynamic block (`"render": "file:./render.php"` or `render_callback`), `$attributes` come from the block comment in post content: any user who can edit the post can set any attribute value, whatever the editor UI allows. `$content` is inner-block HTML (kses-filtered at save for users without `unfiltered_html`, unless something disabled kses). `$block->context` carries values from ancestor blocks, often other users' attributes. `get_block_wrapper_attributes( $extra )` escapes values with `esc_attr()` but not the keys, and does not validate CSS in `style`. For the Interactivity API, `wp_interactivity_data_wp_context( $context )` produces a correctly encoded `data-wp-context` attribute; a hand-built `data-wp-context='<?php echo json_encode( $x ); ?>'` breaks out on a single quote. State from `wp_interactivity_state()` is safely serialized, but a directive that binds it to `href` or `src` (`data-wp-bind--href`) needs a URL validated on the server and in the store.

**Detect:**
```bash
grep -RnE "\"render\"\s*:" --include="block.json" .
grep -RnE "render_callback" --include="*.php" .
grep -RnE "\\\$attributes\[|\\\$block->context\[" --include="*.php" .
grep -RnE "get_block_wrapper_attributes\(\s*[^)]" --include="*.php" .
grep -RnE "data-wp-context=|json_encode\(" --include="*.php" .
grep -RnE "wp_interactivity_state\(|data-wp-bind--(href|src|action|formaction)" --include="*.php" --include="*.js" .
```

**Verify.** For each render file, list every `$attributes` / context value that reaches output and its escaping. Check the `block.json` attribute `type` and `enum`: core validates attribute types against the schema when parsing, but a `string` attribute accepts any string. For wrapper attributes, confirm the extra array's keys are literals. For Interactivity state, trace where each value comes from.

**Severity.** Unescaped attribute or context in output: **High** (Contributor stored XSS). Attribute-injected `data-wp-context` breakout: **High**. User-controlled keys in wrapper attributes: **High**. CSS-only injection through `style`: **Low** to **Medium**.

**Fix.** Escape every attribute at output, use `wp_interactivity_data_wp_context()` for context, validate URLs with `esc_url()` server-side, and keep wrapper-attribute keys literal:

```php
<div <?php echo get_block_wrapper_attributes( [ 'class' => 'is-style-' . sanitize_html_class( $attributes['variant'] ?? 'default' ) ] ); ?>
	<?php echo wp_interactivity_data_wp_context( [ 'isOpen' => false, 'label' => (string) ( $attributes['label'] ?? '' ) ] ); ?>>
```

---

## 10. Patterns

**What.** Pattern files in `patterns/` are PHP. Their code runs whenever the pattern content is loaded: in the editor, in the block patterns REST endpoint, and on the front end when a template references the pattern. Risks: reading `$_GET` / `$_POST` / cookies in a pattern (reflected into markup), outputting dynamic values (`get_option()`, `home_url()`, user data) unescaped, and hardcoded absolute URLs or attachment/post IDs from a development environment that break or point at the wrong content in production.

**Detect:**
```bash
grep -RnE "\\\$_(GET|POST|REQUEST|COOKIE|SERVER)" patterns/
grep -RnE "<\?php\s+echo|<\?=" patterns/ | grep -vE "esc_(html|attr|url)(_e|__)?\(|esc_html_e|esc_attr_e"
grep -RnoE "https?://[^\"' )]+" patterns/ | grep -vE "schemas\.wp\.org|w\.org"
grep -RnE "\"(id|ref|postId|mediaId)\"\s*:\s*[0-9]+" patterns/ templates/ parts/
```

**Verify.** For request input: trace whether the output lands in markup unescaped. For hardcoded URLs and IDs: confirm whether they resolve on the target site.

**Severity.** Reflected request input in pattern output: **Medium** (the pattern renders in editor and front-end contexts; **High** if it lands in a front-end template reachable unauthenticated). Hardcoded development URLs or IDs: **Low** (broken content, mixed environments), **Medium** if they leak a staging hostname that is publicly reachable.

**Fix.** Patterns hold markup, not request logic. Escape every dynamic value (`esc_url( get_theme_file_uri( 'assets/images/hero.webp' ) )`), use theme-relative asset URLs, and replace hardcoded IDs with block bindings or query blocks.

---

## 11. `theme.json` and Global Styles CSS

**What.** CSS the theme author writes in `theme.json` (`styles.css`, per-block `css`) and in `styles/*.json` variations is trusted source. The surface is CSS a site user can set: core rejects custom CSS in Global Styles from users without `edit_css`, so the risk is theme code that reintroduces user CSS by another route. Examples: a theme option, Customizer setting, block attribute or meta field printed into `wp_add_inline_style()` or a `<style>` tag without validation (a `</style><script>` breakout is XSS; plain CSS enables UI redress and content spoofing); a `map_meta_cap` filter that grants `edit_css` below Administrator.

**Detect:**
```bash
grep -RnE "wp_add_inline_style\(|<style" --include="*.php" .
grep -RnE "get_theme_mod\(|get_option\(|get_post_meta\(|\\\$attributes\[" --include="*.php" . | grep -iE "css|style|color|font"
grep -RnE "edit_css" --include="*.php" .
jq '.styles.css, (.styles.blocks // {} | map_values(.css))' theme.json 2>/dev/null
```

**Verify.** For each inline CSS sink, trace the value to its writer and the capability that gates the write. Check whether the value is validated for its type (`sanitize_hex_color()`, numeric units against a pattern, an allowlist of font families).

**Severity.** Low-privilege CSS that can close the `<style>` element: **High**. Low-privilege CSS without breakout: **Medium**. Values written only by Administrators: not a finding on single site; on multisite apply the per-site admin note in SKILL.md → Verify.

**Fix.** Validate each value for its type and build the CSS in the theme; never print user CSS verbatim. For colors, `sanitize_hex_color()`; for sizes, a strict pattern; for font families, an allowlist from `theme.json`. Prefer `theme.json` presets and style variations over free-form CSS settings.

---

## 12. Template loading with dynamic paths (local file inclusion)

**What.** `get_template_part()`, `locate_template()`, `load_template()`, `include` / `require` with a path built from request data or unvalidated meta. `locate_template()` concatenates the name onto the theme directory and checks `file_exists()`, so `../` sequences walk out of the theme; an `include` without a forced `.php` suffix can include any readable file (logs, uploads), which becomes code execution if an attacker can write a file.

**Detect:**
```bash
grep -RnE "(get_template_part|locate_template|load_template)\(\s*[^)]*\\\$" --include="*.php" .
grep -RnE "\b(include|require)(_once)?\s*\(?\s*[^;]*\\\$" --include="*.php" . | grep -vE "__DIR__\s*\.\s*['\"]|get_(template|stylesheet)_directory\(\)\s*\.\s*['\"][^'\"]+['\"]\s*;"
```

**Verify.** Trace the variable to its source (`$_GET`, `get_query_var()`, meta, block attributes). Check for an allowlist, `validate_file()`, `sanitize_file_name()` / `sanitize_key()`, or `basename()`. Note whether a suffix is forced.

**Severity.** Unauthenticated include of arbitrary files: **Critical**. Traversal constrained to `.php` files: **High** (including an unexpected PHP file out of context). Source is Editor-only meta with a slug sanitizer: **Low** (fragile).

**Fix.** Map input to a fixed allowlist:

```php
$views = [ 'grid' => 'grid', 'list' => 'list' ];
$view  = sanitize_key( $_GET['view'] ?? 'grid' );
get_template_part( 'template-parts/archive/' . ( $views[ $view ] ?? 'grid' ) );
```

---

## 13. Front-end JS: DOM XSS and message handling

**What.** Theme JavaScript that writes strings into the DOM as HTML: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, jQuery `.html()`, `.append()` / `.prepend()` / `.after()` with a string, `$( '<div>' + value + '</div>' )`. Sources to trace: URL parameters and `location.hash`, `wp_localize_script` data from settings, REST or AJAX responses containing user content, `postMessage` data. `window.addEventListener( 'message', ... )` without checking `event.origin` accepts messages from any frame. `location.href = params.get( 'next' )` is an open redirect and, with `javascript:` URLs, XSS. A common low-severity case: a form's success message comes from a theme setting (passed with `wp_localize_script`) and is inserted with `$( '.acme-form' ).append( '<p>' + acmeForm.successMessage + '</p>' )`, so whoever edits the setting injects HTML into every visitor's page.

**Detect:**
```bash
SRC="src assets/src assets/js js"
grep -RnE "\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\(|document\.write\(" $SRC 2>/dev/null
grep -RnE "\.(html|append|prepend|after|before|replaceWith)\(\s*[^)'\"]" $SRC 2>/dev/null
grep -RnE "addEventListener\(\s*['\"]message['\"]" $SRC 2>/dev/null
grep -RnE "location(\.href)?\s*=|location\.(assign|replace)\(|window\.open\(" $SRC 2>/dev/null
grep -RnE "URLSearchParams|location\.(search|hash)" $SRC 2>/dev/null
```

**Verify.** Trace each sink's value to its source. Values from `wp_localize_script` set by Administrators are low risk (**Low** on single site, where Administrators hold `unfiltered_html` anyway; **Medium** on multisite, where a per-site Administrator reaches visitors and Super Admins); values from URL parameters, other users' content or third-party responses are not. For message handlers, confirm an exact `event.origin` comparison against an allowlist.

**Severity.** URL-parameter DOM XSS: **High** (reflected, unauthenticated, one click). Stored content from Contributor/Author: **High**. Missing origin check with a dangerous handler: **Medium** to **High** depending on the handler. Open redirect: **Medium** (see §17).

**Fix.** Use `textContent`, `setAttribute` with validated values, or DOM construction. For URLs, parse with `new URL()` and allow only `http:` / `https:` on expected hosts. Compare `event.origin` against a fixed list.

---

## 14. Third-party scripts and inline script data

**What.** Scripts loaded from external hosts run with full access to the site's origin. Risks: no Subresource Integrity (`integrity` + `crossorigin`) on a pinned file; unpinned CDN URLs (`/latest/`, no version) that change underneath the site; protocol-relative `//cdn.example.com/...` URLs; hardcoded `<script src>` tags in templates instead of `wp_enqueue_script()`; inline scripts that interpolate PHP values with string concatenation instead of `wp_json_encode()` (or `esc_js()` inside a quoted JS string).

**Detect:**
```bash
grep -RnoE "(src|href)=['\"](https?:)?//[^'\"]+" --include="*.php" --include="*.html" .
grep -RnE "wp_(enqueue|register)_(script|style)\(\s*[^,]+,\s*['\"](https?:)?//" --include="*.php" .
grep -RnE "wp_add_inline_script\(|<script" --include="*.php" .
grep -RnE "script_loader_tag|wp_script_attributes|wp_inline_script_attributes" --include="*.php" .   # where SRI would be added
```

**Verify.** For each external script: host, whether the version is pinned, whether SRI is set (enqueued scripts get it via `script_loader_tag` / `wp_script_attributes`), and whether it loads on every page. For inline scripts, confirm every PHP value passes through `wp_json_encode()`.

**Severity.** Inline script interpolating user-controlled values without encoding: **High**. Unpinned third-party script from a CDN: **Medium** (supply-chain exposure). Pinned without SRI: **Low**. Protocol-relative URL: **Low**. Third-party tracking loaded without consent where the owner operates under consent rules: **Medium** `[DECISION]`.

**Fix.** Self-host where possible. Otherwise pin the version, add SRI through `wp_script_attributes` / `script_loader_tag`, use `https://`, enqueue rather than hardcode, and pass data with `wp_add_inline_script( $handle, 'const acmeData = ' . wp_json_encode( $data ) . ';', 'before' )`.

---

## 15. Bundled third-party libraries

**What.** Vendored JS/CSS copied into the theme (sliders, lightboxes, PDF viewers, jQuery plugins, icon fonts with loaders) carry their own CVEs and never update unless the theme ships a new copy. Example class: an old bundled PDF.js (`pdfjs-dist` before 4.2.67) is affected by CVE-2024-4367, arbitrary JavaScript execution when a crafted PDF is opened in the viewer.

**Detect:**
```bash
find . \( -path ./node_modules -o -path ./vendor \) -prune -o -type f \( -name "*.js" -o -name "*.css" \) -print \
  | grep -iE "vendor|lib|plugins|third-party|\.min\."
grep -RnoE "(v|version[ :=]+)[0-9]+\.[0-9]+\.[0-9]+" --include="*.min.js" . | grep -v node_modules | head -50
grep -RnE "pdfjsVersion|pdfjsLib\.version|const pdfjsVersion" --include="*.js" . | grep -v node_modules
```

**Verify.** For each library: name, exact version (from the banner, a `version` constant or `package.json` in the vendored folder), whether it is loaded on the front end, and whether the vulnerable feature is used (for PDF.js: whether untrusted PDFs are rendered, and whether `isEvalSupported: false` is set). Check advisories (GitHub Security Advisories, the library's changelog, OSV) and cite the advisory.

**Severity.** Follow the advisory's impact against how the theme uses the library. Script execution reachable by a visitor or by an uploader below Administrator: **High**. Present but the vulnerable path is unused: **Low**, with the upgrade recommended.

**Fix.** Upgrade to a fixed version, or move the dependency into `package.json` so `npm audit` tracks it and the build bundles a current copy. Remove libraries the theme no longer uses.

---

## 16. Public writes from anonymous requests

**What.** Front-end code that writes on every view: view counters in post meta or options, "last viewed" timestamps, request logs or debug logs written under `uploads/` or the theme directory. Anonymous visitors can inflate the values, each view invalidates object and page caches, and logs under `uploads/` are served over HTTP.

**Detect:**
```bash
# Per file that writes: its hook registrations, function declarations and write calls, in line order,
# so each write can be mapped to the function it sits in and the hook that calls it.
grep -RlE "(update|add)_(post_meta|option|term_meta|user_meta)\(|set_transient\(" --include="*.php" . | while read -r f; do
  echo "== $f"
  grep -nE "add_(action|filter)\(|function [A-Za-z_]+\(|(update|add)_(post_meta|option|term_meta|user_meta)\(|set_transient\(" "$f"
done
grep -RnE "add_action\(\s*['\"](wp|template_redirect|wp_head|the_post|get_header)['\"]" --include="*.php" .
grep -RnE "(file_put_contents|fwrite|error_log)\([^)]*(upload|wp_upload_dir|get_template_directory)" --include="*.php" .
```

Every write needs its trigger read; the listing only orders the reading. A write reached from `save_post`, an admin screen or a REST callback with a permission check is not a public write.

**Verify.** Confirm the write happens for logged-out requests (no `is_user_logged_in()` / capability gate) and whether page caching would hide or amplify it. For logs, check the path is inside the web root and what fields are written (IP addresses, emails, query strings).

**Severity.** Publicly readable log with personal data: **High**. Anonymous meta/option writes on every view: **Medium** (write amplification, cache invalidation, trivially skewed numbers). Autoloaded option rewritten on every request: **Medium**, see the plugin skill's performance checklist §1.

**Fix.** Move counters to an analytics service or a batched, rate-limited endpoint; write logs outside the web root or not at all; never write autoloaded options from front-end requests.

When theme code stores personal data (form submissions, IP addresses, emails, visitor logs), also apply the plugin skill's `security-checklist.md` §14 (personal data without exporters or erasers).

---

## 17. Open redirects and host header trust

**What.** `wp_redirect()` with a target from request data or meta sends visitors anywhere; `wp_safe_redirect()` restricts targets to allowed hosts. `$_SERVER['HTTP_HOST']` (or `SERVER_NAME`) used to build canonical URLs, `og:url`, links or redirects lets a request with a forged Host header change the output, which a page cache can store and serve to everyone.

**Detect:**
```bash
grep -RnE "wp_redirect\(" --include="*.php" .
grep -RnE "header\(\s*['\"]Location" --include="*.php" .
grep -RnE "\\\$_SERVER\[\s*['\"](HTTP_HOST|SERVER_NAME|HTTP_X_FORWARDED_HOST|REQUEST_URI)['\"]" --include="*.php" .
```

**Verify.** Trace each redirect target. Confirm whether a page cache or CDN sits in front (ask in Discover) before rating host-header issues.

**Severity.** Open redirect from a URL parameter: **Medium**. Host header reflected into cached output: **Medium**, **High** if it feeds links used for authentication or password flows. Redirect target from Editor-only meta: **Low**.

**Fix.** Use `wp_safe_redirect()` followed by `exit`, extend `allowed_redirect_hosts` only for known hosts, and build URLs from `home_url()` / `site_url()`.

---

## 18. Information disclosure from the theme directory

**What.** Everything in the theme folder is web-served unless the server blocks it. Files that disclose versions, dependencies or internals: `composer.json`, `composer.lock`, `package.json`, `package-lock.json`, `yarn.lock`, `README.md`, `CLAUDE.md` and other agent or tooling notes, `.env`, `.git/`, source maps, `phpinfo()` or test scripts. Theme code that toggles `WP_DEBUG`, calls `ini_set( 'display_errors', 1 )` / `error_reporting( E_ALL )`, or prints `var_dump()` / `print_r()` output.

**Detect:**
```bash
find . -maxdepth 3 \( -name "composer.*" -o -name "package*.json" -o -name "yarn.lock" -o -name "*.md" -o -name ".env*" -o -name "*.map" -o -name ".git" -o -name "phpinfo.php" \) -not -path "*/node_modules/*"
grep -RnE "(ini_set\(\s*['\"]display_errors|error_reporting\(|define\(\s*['\"]WP_DEBUG|var_dump\(|print_r\(|phpinfo\()" --include="*.php" .
```

**Verify.** On an environment: `curl -sI https://example.com/wp-content/themes/acme-agency/composer.lock` (and each file found) and record the status code. Check whether the build or deploy excludes these files (`.distignore`, deploy script, `export-ignore`).

**Severity.** `.env` with secrets or `.git/` served: **High** (**Critical** if credentials are live). Lockfiles, `package.json`, readmes, agent notes, source maps: **Low** (version disclosure aids targeting; notes can reveal internals). Debug display enabled by theme code in production: **Medium**.

**Fix.** Exclude development files from the deployed theme (`.distignore`, build artifact, deploy rules), block dotfiles and lockfiles at the web server, and remove debug toggles from theme code; `WP_DEBUG` belongs in `wp-config.php`.

---

## 19. Direct file access guards

**What.** PHP files that execute code at load (include files that register hooks, run queries or define behaviour, standalone endpoints) can be requested directly by URL. Without `defined( 'ABSPATH' ) || exit;`, direct access fatals with a path disclosure where `display_errors` is on, or runs code outside WordPress. Template files that only contain markup and template tags fail harmlessly on an undefined function; the theme review guidelines do not require the guard in templates.

**Detect.** List PHP files without an actual guard statement (a mention of `ABSPATH` in a comment does not count), then sort hits into "executes code at load" and "template markup only":

```bash
grep -E '\.php$' "$OUT/files.txt" | while read -r f; do
  grep -qE "^\s*(if\s*\(\s*!\s*defined\(\s*['\"]ABSPATH['\"]\s*\)|defined\(\s*['\"]ABSPATH['\"]\s*\)\s*(\|\||or)\s*(exit|die))" "$f" || echo "$f"
done
```

This replaces the plugin skill's `security-checklist.md` §12 loop for themes, which matches the bare string `ABSPATH` anywhere in the file.

**Verify.** Open each hit and classify it. Look for files that do anything beyond defining functions or classes and printing template markup. When most or all files lack the guard, report one finding with the captured count per class ("executes code at load: N, template markup: N") and a few representative paths; do not enumerate every file.

**Severity.** Include files with side effects at load: **Medium**. Standalone endpoints reachable directly that perform actions: **High** (and audit them with the plugin security checklist as endpoints). Pure templates: **Info** at most.

**Fix.** Add the guard as the first statement in every PHP file that executes code at load. Replace standalone endpoints with REST routes or `admin-post.php` handlers.

---

## 20. Stored ID pointers without a record-level check (IDOR via meta)

**What.** Meta or profile fields that store the ID of **another** post or attachment, writable by one user and consumed when rendering content that user does not control. Two shapes: (a) a relationship pointer (`acme_linked_post`, `acme_form_post`) on post A, editable by A's author, that post B's template or a shared block reads to decide which form, download or embed to render, so an Author repoints B's form or embed at their own content; (b) an attachment ID chosen by the user (profile avatar, author image, card image) with no check that the user may read that attachment, so a user can select an attachment that belongs to a private or draft post and have it rendered publicly. This is §6 (render-by-ID) with the ID coming from stored meta instead of a shortcode attribute.

**Detect:**
```bash
grep -RnE "(get|update)_(post|user|term)_meta\([^)]*['\"][a-z_]*(_id|_ids|_ref|_post|_page|image|avatar|attachment)['\"]" --include="*.php" .
grep -RnE "register_(post_|term_|user_)?meta\([^)]*(_id|_ids|_ref|image|avatar|attachment)" --include="*.php" . -A10 | grep -E "register_|type|auth_callback|sanitize_callback"
grep -RnE "wp_get_attachment_(image|url|image_src|image_url)\(\s*\\\$|get_post\(\s*(get_(post|user)_meta|\\\$[a-z_]*_id)" --include="*.php" .
```

**Verify.** For each pointer: who can write it (the `auth_callback`, the profile screen, a front-end form), whether writing it checks that the writer may use the target (`current_user_can( 'edit_post', $target_id )` for relationships, `current_user_can( 'read_post', $attachment_id )` for attachments), which page consumes it, and whether the consumer checks the target's type and status. Cite the write location and the consuming location.

**Severity.** Author can repoint content on posts they do not own (a form or download swapped for their own): **Low** to **Medium** (content integrity; **Medium** when the swapped target collects data, such as a form). Attachment of a private or draft post rendered publicly: **Low**, **Medium** when the private media is sensitive. Reachable by Subscriber through a profile field: rate one level higher.

**Fix.** Validate on write and on read: `sanitize_callback` that casts to `absint()` and rejects IDs of the wrong type; an `auth_callback` (or save handler) that checks `current_user_can( 'edit_post', $target_id )` / `current_user_can( 'read_post', $attachment_id )`; at render time, check post type and `is_post_publicly_viewable()` (for attachments, the parent post's visibility) before output.

---

## 21. Customizer settings and controls

**What.** `customize_register` registers Customizer settings and controls. `$wp_customize->add_setting( 'acme_hero_html', [ ... ] )` takes a `capability` (default `edit_theme_options`, held by Administrators only in a default install) and a `sanitize_callback`; without one, the raw submitted value is stored as a theme mod or option, unfiltered by kses. `add_control()`, or a custom `WP_Customize_Control` subclass, only controls the admin UI; it has no bearing on what a template later does with the stored value, and a subclass's own `render_content()` needs the same escaping discipline as any other admin-rendered markup. The realistic sink is the front end: every `get_theme_mod()` / `get_option()` call that outputs the value a setting stores.

**Detect:**
```bash
grep -RnE "add_action\(\s*['\"]customize_register['\"]" --include="*.php" .
grep -RnE "\\\$wp_customize->add_setting\(" --include="*.php" . -A8 | grep -E "add_setting|capability|sanitize_callback|transport"
grep -RnE "\\\$wp_customize->add_control\(|extends WP_Customize_Control" --include="*.php" .
grep -RnE "function render_content\(\)" --include="*.php" .
grep -RnE "get_theme_mod\(|get_option\(" --include="*.php" --include="*.html" .
```

**Verify.** For each setting: the `capability` argument (default `edit_theme_options`, Administrator only unless a role plugin grants it; a value such as `edit_posts` extends the write to Contributors and Authors), whether a `sanitize_callback` is set, and whether it matches the control type: `absint()` / `intval()` for a `range` or number control, `esc_url_raw()` for a `url` control, `sanitize_hex_color()` for a `color` control, `wp_kses_post()` for a control meant to hold rich text, and validation against the registered choices for `select`, `radio` or `checkbox`. Then trace every `get_theme_mod()` / `get_option()` call that reads the setting and check the escaping at output: `esc_html()`, `esc_attr()`, `esc_url()`, or `wp_kses_post()` for HTML. A `WP_Customize_Control::render_content()` that fails to escape only prints in the Customizer pane, but a setting it fails to sanitize on save still reaches the front end through the same value.

**Severity.** Missing `sanitize_callback` on a setting only Administrators can write, escaped at output: **Low** (hardening; the control's own JS could still submit an unexpected value). Missing or mismatched `sanitize_callback` (a `url` control without `esc_url_raw`, a `color` control without `sanitize_hex_color`) whose value reaches output unescaped: **Medium** on single site (Administrators hold `unfiltered_html`); **Medium to High** on multisite, where a per-site Administrator does not. A setting with no `sanitize_callback`, or one that allows HTML (`wp_kses_post()`), storing raw markup rendered unescaped: **High**. `capability` lowered to `edit_posts` or another Contributor/Author-held capability, combined with either of the above: rate by the table at the top of this file for that role, at least **High**.

**Fix.** Set a `sanitize_callback` that matches the control's type and keep `capability` at `edit_theme_options` or higher unless a lower role is a deliberate product decision, in which case escape at output regardless:

```php
$wp_customize->add_setting( 'acme_accent_color', [
	'default'           => '#0073aa',
	'capability'        => 'edit_theme_options',
	'sanitize_callback' => 'sanitize_hex_color',
] );

$wp_customize->add_control( 'acme_accent_color', [
	'type'    => 'color',
	'section' => 'colors',
	'label'   => __( 'Accent color', 'acme-agency' ),
] );
```

```php
printf( '<style>:root{--acme-accent:%s}</style>', esc_attr( get_theme_mod( 'acme_accent_color', '#0073aa' ) ) );
```

---

## Verification reminder

Every candidate here goes through the plugin skill's `false-positive-traps.md` before it is written, and every rating names the role that reaches the sink and the capability that proves it.
