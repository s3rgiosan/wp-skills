# Editor parity — the editor shows what visitors see

Editors work in the block editor, so the editor canvas is a preview of the front end. Every template, template part, pattern and custom block renders in the canvas as it renders on the site. Editing controls appear only where editing happens: on the selected block, in its toolbar, or in the sidebar.

The preview serves editing. A block being edited holds still, and scroll-driven behavior runs on the front end only (Motion in the editor, below).

Build for this from the start (workflow steps 4, 6 and 8), and gate it at step 9 with `scripts/capture-editor.mjs` and `scripts/compare.mjs --editor`.

## Styles and fonts reach the canvas

The canvas is an iframe. Only styles that WordPress loads into that iframe apply there.

- **Theme stylesheet.** Load the front-end bundle with `add_editor_style( 'build/css/frontend.css' )` (`html-to-core-blocks.md`, Theme stylesheets). WordPress scopes it to `.editor-styles-wrapper` and loads it into the iframe.
- **Block styles.** A custom block's `style.css` (`"style": "file:./style-index.css"`) loads on both sides. Use `editorStyle` only for editor-only affordances, such as a placeholder's padding. Never use it to restyle the output.
- **Fonts.** Declare fonts in theme.json `settings.typography.fontFamilies[].fontFace`. WordPress prints the `@font-face` rules into the canvas too. A font enqueued with `wp_enqueue_style()` on `wp_enqueue_scripts` never reaches the editor.
- **Other assets the canvas needs** (a third-party stylesheet a pattern depends on) go through `enqueue_block_assets`, which loads into both the front end and the iframe. Guard with `is_admin()` only when an asset must stay out of one side.
- **View scripts stay out of the editor.** `viewScriptModule` and `viewScript` load on the front end only. The canvas must look right without them (see "Behavior at rest" below).

## The post editor shows the template

Core opens a post in post-only mode: the title and the content, without the template. Anything the template adds around the content is missing from the canvas: the header and footer, the post header pattern, and wrapper classes on `core/post-content` (an `.article-body` class that styles the article). Declare the template view as the default for each post type the theme renders with a template, on `init` after the post types are registered:

```php
add_action(
	'init',
	function () {
		foreach ( [ 'post', 'page', 'acme_project' ] as $post_type ) {
			add_post_type_support( $post_type, 'editor', [ 'default-mode' => 'template-locked' ] );
		}
	},
	20
);
```

Title, content, excerpt and featured image stay editable in the template view. Each editor can still switch it off ("Show template"), and that choice is saved per editor. `compare.mjs --editor` fails for a post type that opens in post-only mode.

## Selectors that behave differently in the canvas

- **The root is `.is-root-container`.** In the Site Editor and in the post editor with the template shown, the template's blocks sit in `.is-root-container.wp-site-blocks`. Core injects `.is-root-container { display: flow-root }` into the canvas, and it beats a single-class `.wp-site-blocks { display: flex }`. Repeat a page-wrapper layout rule with the higher-specificity selector:

  ```css
  .wp-site-blocks,
  .is-root-container.wp-site-blocks {
  	display: flex;
  	flex-direction: column;
  }
  ```

- **`body`, `html` and `:root`.** The iframed canvas loads editor styles as written, so `body`, `html` and `:root` rules apply to the canvas document, whose body carries `.editor-styles-wrapper`. Core adds its own canvas rules on top. For example, `html { height: auto !important }` means a rule on `html` height has no effect in the canvas.
- **Viewport units.** `100vh` in the canvas is the canvas height, which is not the browser height. A full-height hero looks the same only while the canvas is as tall as the window. Use `min-height` with a token, and never a fixed `height` that clips content.
- **Admin-bar offsets.** The canvas has no admin bar. `var(--wp-admin--admin-bar--height, 0px)` resolves to `0` there, which is correct. Never hardcode the bar's `32px`.
- **Cascade order.** On the front end the theme stylesheet loads after the global styles and the block-support styles. In the canvas, editor styles load before them, for every theme. A single-class theme rule ties with global, layout and block-support rules: it wins on the front end and loses in the editor. Common ties:
  - a sibling margin (`.article-body > * + *`) against `:root :where(.is-layout-constrained) > *`, which `styles.spacing.blockGap` sets
  - a flex gap (`.meta-row { gap }`) against `:root :where(.is-layout-flex) { gap }`
  - a link color (`.colophon a`) against a parent block's link color (`.wp-elements-<n> a:where(:not(.wp-element-button))`)

  Set the value through the block (`style.spacing.blockGap`, a preset, an element color on the block itself) so both sides generate it. Where the block has no such setting, give the theme rule a second class. `scripts/cascade-order.mjs` lists every value that depends on the order.

## Custom blocks: unselected mirrors the front end

A custom block's `edit` component renders **the same markup as its `render.php`** while the block is not selected. It reveals its editing controls only when selected (`isSelected`).

- Build the wrapper with `useBlockProps( { className } )`, using the same classes `get_block_wrapper_attributes()` adds on the server, and the same inner elements and classes.
- Render text fields with `RichText` itself (`tagName`, `className`, `value`, `onChange`): it outputs the same tag and is editable in place. Never use `RichText.Content` in `edit`. It renders through `RawHTML`, which wraps the value in an extra `<div>` in the editor (`<p class="x"><div>…</div></p>`), so the markup no longer matches `render.php`.
- Show buttons, pickers, add/remove rows and placeholders only when `isSelected` is true. An empty block that is not selected shows a short placeholder, so it stays selectable.
- Read dynamic data the way the server does, through core data: `useEntityRecords` for lists of posts or terms, `useEntityProp` for the current post's meta, and `useSelect( coreStore )` for settings. The preview then shows real content.
- An edit/preview mode switch is a `ToolbarButton` with `isPressed` in `BlockControls`, like the core Embed block. Block settings go in `InspectorControls`.
- When `render.php` markup changes, `edit.js` changes in the same commit.

Example: a figures block whose server output is `<div class="wp-block-acme-figures figures"><div class="figures__item"><p class="figures__value">…</p><p class="figures__label">…</p></div></div>`.

```jsx
export default function Edit( { attributes, setAttributes, isSelected } ) {
	const { items } = attributes;
	const blockProps = useBlockProps( { className: 'figures' } );
	const update = ( index, field, value ) =>
		setAttributes( {
			items: items.map( ( item, i ) => ( i === index ? { ...item, [ field ]: value } : item ) ),
		} );

	return (
		<div { ...blockProps }>
			{ items.map( ( item, index ) => (
				<div key={ index } className="figures__item">
					<RichText
						tagName="p"
						className="figures__value"
						value={ item.value }
						onChange={ ( value ) => update( index, 'value', value ) }
						placeholder={ __( 'Figure', 'acme' ) }
					/>
					<RichText
						tagName="p"
						className="figures__label"
						value={ item.label }
						onChange={ ( value ) => update( index, 'label', value ) }
						placeholder={ __( 'Label', 'acme' ) }
					/>
					{ isSelected && <RemoveButton index={ index } /> }
				</div>
			) ) }
			{ isSelected && <AddButton /> }
		</div>
	);
}
```

## ServerSideRender is a per-block user decision

The default preview is a JS mirror. Some output depends on logic the editor cannot reproduce from REST data:

- a remote API call
- a heavy or uncached query
- output computed in PHP that no REST field exposes
- markup from another plugin's PHP

For such a block, the preview can come from the server instead: `ServerSideRender` (`@wordpress/server-side-render`) renders `render.php` through the REST block renderer.

Make the choice **per block, at build time**, once the block's `render.php` exists and its logic is known. Stop and ask the user. Give the block name, the logic the mirror would have to reproduce, and a recommendation. For example:

> `acme/rates` renders rows from a remote rates API, cached for an hour. Editor preview: **ServerSideRender** (recommended: a JS mirror would call the API from the editor and duplicate the cache logic), or **JS mirror** reading a REST field we add.

Wait for the answer. Record each block's choice, and the reason, in `CONVERSION-NOTES.md`. With ServerSideRender:

- the preview shows while the block is not selected, and the controls replace or sit beside it while it is selected
- the attributes the preview depends on are passed as `attributes`, and `urlQueryArgs` carries the post context when the output depends on the current post
- `capture-editor.mjs` lists the block under "previewed with ServerSideRender", and the handover checks the list against the recorded decisions

## Server-side filters change the front end only

A `render_block` / `render_block_{name}` filter, a `query_loop_block_query_vars` filter or a `pre_get_posts` hook changes the front-end output. The editor never runs them: it renders blocks in JavaScript and queries through REST. Each such filter is an editor parity gap. Prefer, in order:

1. **Express the change in the block markup**: a block style, a block attribute, a core block setting, or a pattern variation. Both sides then render it.
2. **Mirror it in the editor**, with the tool that matches the change:
   - CSS loaded in both contexts, for a purely visual change.
   - An `editor.BlockListBlock` filter that adds the same class to the block's wrapper (a current nav item), or hides it with `wrapperProps` (a block the front end removes, such as a button with no URL). Read edited values (`getEditedPostAttribute( 'meta' )`), so the preview follows the sidebar live. Keep a hidden block visible while it is selected; it stays selectable from the List View.
   - An `editor.BlockEdit` filter that renders the front end's markup while the block is not selected, and the core edit component while it is (terms printed as text, only the primary term).
   - An `apiFetch.use()` middleware, or a `rest_{post_type}_query` filter, that applies the same query change to the editor's REST request. For example, a plugin that excludes "the current post" from the queried object gets the edited post's ID in its place.
3. **Accept the gap.** Some changes have nothing to mirror: the logged-in visitor, query-string filters, a template that serves many archives. State that depends on the page being viewed often does have something to mirror: in the post editor, the edited post stands in for the viewed one (its current nav item, its section). List each accepted gap in `CONVERSION-NOTES.md`.

Ask the user which applies when a filter carries real logic. Apply the same per-block decision as for ServerSideRender.

## Behavior at rest

The canvas runs no view scripts, so it shows each widget in its initial server-rendered state. That state must be the front end's initial state too (`interactivity-recipes.md`):

- **Accordions and disclosures:** the panels the front end opens on load are open. All others are closed but visible as headers.
- **Tabs:** the first tab and its panel show.
- **Sliders and carousels:** the first slide shows, in place, at its full size.
- **Reveal-on-scroll:** content is visible. The hidden starting state is added by the view script, never by the saved markup or the shared CSS.
- **Marquees and other infinite animations** run while their block is not selected, and stop while it is (Motion in the editor). Their phase differs between captures, so expect a small pixel difference there.
- **Pinned and scroll-driven sections:** unpinned, at their normal height, in their first state (Motion in the editor).

## Motion in the editor

Editors click into a block to change its content, so content that moves under the cursor cannot be edited. Parity covers how a block looks; motion stops where editing starts.

- **Infinite animations stop on selection.** Marquees, tickers, rotating badges and autoplaying slides run while the block is not selected, as on the front end. While the block or any block inside it is selected, the animation stops and the content returns to its start position. The editor adds `is-selected` to the selected block's wrapper and `has-child-selected` to each of its ancestors. Target both in an editor-only stylesheet: the custom block's `editorStyle`, or a theme stylesheet loaded with `add_editor_style()` alone.

  ```css
  .marquee:is(.is-selected, .has-child-selected) .marquee__track {
  	animation: none;
  }
  ```

- **Scroll-driven behavior stays on the front end.** Pinned sections that turn page scroll into horizontal travel (scroll hijacking), scroll-linked transforms and parallax, smooth-scroll libraries and page-level scroll snapping all take over the canvas scroll. In the canvas the section renders at rest: unpinned, at its normal height, in its first state, with its regular controls (previous and next buttons, a track that scrolls on its own) so editors reach every item. The view script turns the behavior on with a class it adds on the front end (for example `is-pinned`). Every rule that pins the section, adds its scroll length, hides its controls or runs a CSS scroll-driven animation (`animation-timeline: scroll()` or `view()`) targets that class. A class saved in the block markup, or set from a block attribute, loads in the canvas too: the section then pins in the editor with no script to move it.

The editor-parity gate captures the editor with no block selected, so animations run there as on the front end. A pinned section is taller on the front end than in the canvas: the gate reports it, and the difference is recorded as accepted in `CONVERSION-NOTES.md`.

## Core editor previews

Some core blocks show sample content in the editor. The gate reports these differences. For each, the user either accepts it in `CONVERSION-NOTES.md` or asks for a mirror. Never hide one with CSS:

- `core/query-pagination-numbers` shows fixed sample pages, Query Total a sample range, and the Previous and Next links always show. To mirror the first page:
  - Rebuild the loop's REST query from the parent `core/query` attributes, the way the Post Template block does. A loop that inherits the page's query previews in the Site Editor with its own settings, minus its taxonomy filters, narrowed by the template slug: `archive-<post type>` sets the post type, `category-<slug>` and `tag-<slug>` the term. Read the slug from the edited template.
  - Read `getEntityRecordsTotalItems()` from core-data. It shares the Post Template's cached request.
  - Subtract what the front end leaves out, such as an offset.
  - Render what `paginate_links()` and `render_block_core_query_total()` print for page 1, and hide Previous, plus the whole pagination on a single page.
- In the Site Editor, an archive template has no term or author in context: `core/query-title` shows "Archive type: Name" and `core/term-description` a sample, so the archive's heading and height differ from any real archive page.
- `core/post-featured-image` shows its empty-state placeholder for a post with no featured image. On the front end the block renders nothing. Give the posts a featured image, or accept it with `capture-editor.mjs --allow-placeholder core/post-featured-image`, which leaves it out of the measurements.
- A Query Loop variation from a plugin can apply a setting on the front end only (for example, excluding the current post). Check the plugin's editor preview before relying on it.
- `core/social-link` renders its anchor as a `<button class="wp-block-social-link-anchor">` in the editor. Target `.wp-block-social-link-anchor`, never `.wp-social-link a`, and set the `display` and `line-height` that core's front-end `.wp-block-social-link a` rule gives the link.
- Core's editor stylesheet gives each `.page-numbers` in `core/query-pagination-numbers` a 2px right margin. A theme that styles page numbers as boxes resets it (`margin: 0`).
- In the rows a Query Loop previews (every post but the active one), an excerpt's empty "read more" field is `<a class="wp-block-post-excerpt__more-link"><br></a>`, without the RichText placeholder of the active row.

`capture-editor.mjs` removes affordances that are never output: block appenders, insertion points, drop zones, empty RichText prompts and an excerpt's empty "read more" line.

## The editor-parity gate

```bash
node scripts/cascade-order.mjs --routes wp-routes.txt --base http://mysite.test
node scripts/capture.mjs --routes wp-routes.txt --base http://mysite.test --out capture/local
WP_USER=admin WP_PASSWORD=… node scripts/capture-editor.mjs --routes wp-routes.txt --base http://mysite.test --out capture/editor
node scripts/compare.mjs capture/local capture/editor --editor
```

`cascade-order.mjs` runs on the front end alone. It moves the theme stylesheet before the global styles, as the canvas orders them, and lists each computed value that changes. Fix each one at its source (Cascade order, above) before capturing the editor.

`capture-editor.mjs` logs in and opens each route's editor. It uses the admin bar's edit link: the post editor with the template shown for a singular route, the Site Editor on the resolved template otherwise. It records the rendering mode each post type opens in by default before showing the template. A routes line `path => editor-url` overrides the link. It pins the canvas to each breakpoint, clears the selection, and captures what `capture.mjs` captures. It also records invalid blocks, block warnings, placeholders and ServerSideRender previews in `editor-<w>.json`. It never changes editor preferences or content.

`compare.mjs --editor` runs the structure, section, pixel and network checks with the front end as the reference. It also fails on invalid blocks, block warnings, placeholders and previews still loading. It lists ServerSideRender blocks for review.

Fix each difference at its source. Never accept one only to make the gate pass: every accepted difference is a line in `CONVERSION-NOTES.md` with its reason.

## Editor parity pass on an existing theme

The gate works on any block theme, without the rest of the workflow:

1. Write a routes file covering each template: the front page, a page, a post, the posts page, an archive and the 404, plus each custom post type's single and archive. The post needs real long-form content (headings, paragraphs, a list, code, an image): a rule for the space between blocks never applies to a post with one paragraph.
2. Run `scripts/cascade-order.mjs` and the three commands above.
3. For each failure, find the cause in this file or in `parity-pitfalls.md`. Then fix it in place, or record it as accepted. Raise every ServerSideRender or server-side-filter decision with the user.
4. Re-run until the gate passes. Then list the accepted differences.
