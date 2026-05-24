# React-in-WordPress Effort Estimation Reference

> **Scope:** React as it appears inside the WordPress ecosystem only.
> Covers: Gutenberg block development, Interactivity API, block themes/FSE,
> wp-admin React UIs, and headless WP frontends (Next.js, Faust.js).

---

## Task Taxonomy & Base Estimates

### Gutenberg — Static Blocks
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Register a static block (no dynamic data) | — | 4–8 hrs | — | — |
| Static block with InnerBlocks support | — | 6–10 hrs | — | — |
| Block with complex controls (custom sidebar, toolbar) | — | 8–16 hrs | — | — |
| Full block pattern library (5–10 patterns) | — | — | 2–3 days | 3–6 days |
| Synced patterns (`wp_block` content) — register + author flow | — | 4–6 hrs | — | — |
| Block variations (`registerBlockVariation`) | — | 3–6 hrs | — | — |
| Block style variations (`registerBlockStyle`) | 1–3 hrs | — | — | — |

### Gutenberg — Dynamic Blocks
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Dynamic block (server-rendered via `render_callback`) | — | 6–12 hrs | — | — |
| Dynamic block pulling CPT / taxonomy data | — | 8–16 hrs | — | — |
| Dynamic block with AJAX / REST API data refresh | — | — | 1–3 days | — |
| ACF Block (dynamic block via ACF Pro) | — | 6–12 hrs | 1–2 days | — |

### Gutenberg — Block Bindings API (WP 6.5+)
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Bind core block attribute to post meta (built-in source) | 1–3 hrs | — | — | — |
| Bind core block attribute to options / site data | 1–3 hrs | — | — | — |
| Register a custom binding source (`register_block_bindings_source`) | — | 4–8 hrs | — | — |
| Editor UI for selecting binding source per block | — | 6–12 hrs | — | — |

### Gutenberg — Block Editor Customisation
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Lock/restrict core blocks (block.json, allowed blocks) | 1 hr | — | — | — |
| Custom block category + icon set | 1 hr | — | — | — |
| SlotFill — add UI into existing editor panels | — | 4–8 hrs | — | — |
| Custom sidebar plugin (PluginSidebar) | — | 6–12 hrs | — | — |
| Custom document panel (PluginDocumentSettingPanel) | — | 4–8 hrs | — | — |
| Block editor style overrides (editor.css) | 1–3 hrs | — | — | — |
| Extend a core block via `addFilter('blocks.registerBlockType', ...)` (add attribute) | — | 4–8 hrs | — | — |
| Extend a core block via `addFilter('editor.BlockEdit', ...)` (custom inspector controls) | — | 6–12 hrs | — | — |
| Extend a core block via `addFilter('blocks.getSaveContent.extraProps', ...)` (custom save markup) | — | 3–6 hrs | — | — |

### Interactivity API
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Add client-side interactivity to existing block (toggle, accordion) | — | 4–8 hrs | — | — |
| Interactive block with shared store state (multiple blocks communicating) | — | — | 1–3 days | — |
| Complex interactive UI (filtered list, cart-like interaction) | — | — | 2–4 days | — |
| Migrate existing jQuery front-end behaviour to Interactivity API | — | — | 2–4 days | 4–8 days |

### Block Themes & Full Site Editing (FSE)
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Add/edit a template or template part | 1–3 hrs | — | — | — |
| Build global styles (theme.json — typography, colours, spacing) | — | 4–8 hrs | — | — |
| New block theme from scratch (matching Figma) | — | — | 4–8 days | 8–15 days |
| Classic theme → block theme conversion | — | — | 5–10 days | 10–20 days |
| Custom block template for CPT | — | 4–8 hrs | — | — |

### wp-admin React UIs
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Simple settings page (React + WP Settings API) | — | 4–8 hrs | — | — |
| Full admin UI (list table, create/edit form, REST-backed) | — | — | 3–6 days | — |
| Dashboard widget with live data (REST/AJAX) | — | 4–8 hrs | — | — |
| Custom metabox React UI | — | 6–12 hrs | — | — |
| Bulk action UI with progress feedback | — | — | 1–3 days | — |
| Custom `wp-data` store (`createReduxStore` + `register`) | — | 6–12 hrs | — | — |
| Selectors + resolvers + actions for a custom store (full CRUD) | — | — | 1–3 days | — |

### WooCommerce Blocks (React)
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Cart/Checkout Blocks customisation (custom block, slot fill, or filter) | — | — | 2–4 days | — |

### Headless WordPress Frontends
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Add a new page/route to existing headless site | 2–4 hrs | — | — | — |
| New content type + template (CPT → Next.js page) | — | 4–8 hrs | — | — |
| WP REST API integration (fetch + display) | — | 4–8 hrs | — | — |
| WPGraphQL integration (schema + queries) | — | — | 2–4 days | — |
| ACF → WPGraphQL exposure (register ACF fields for GraphQL schema, per field group) | TBD | — | — | — |
| Faust.js setup from scratch | — | — | 3–6 days | — |
| Full headless WP build (design → production) | — | — | — | 15–30 days |
| Preview mode (draft post previews in headless) | — | — | 1–3 days | — |
| Auth-gated content (members, subscriptions) | — | — | 3–6 days | 6–12 days |
| ISR / on-demand revalidation setup | — | 4–8 hrs | — | — |

### Performance (React-in-WP Specific)
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Audit + reduce block editor JS bundle size | — | 4–8 hrs | 1–2 days | — |
| Lazy-load a heavy block's front-end script | — | 3–6 hrs | — | — |
| Script dependency audit (enqueue cleanup) | — | 4–6 hrs | — | — |
| Core Web Vitals fix for headless WP frontend | — | — | 2–4 days | — |

### Testing (React-in-WP)
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Unit tests for a block (Jest + @wordpress/jest-preset) | — | 4–8 hrs | — | — |
| E2E tests for block editor interactions (Playwright) | — | — | 1–3 days | — |
| E2E tests for headless frontend (Playwright/Cypress) | — | — | 2–4 days | — |
| Set up @wordpress/scripts test pipeline from scratch | — | 1–2 days | — | — |

---

## React-in-WP Risk Factors

- **`@wordpress/scripts` version drift** — WP core ships its own React version. Mismatches between theme/plugin React and core React cause subtle runtime errors. Confirm version before estimating block work.
- **Vite / custom build vs `@wordpress/scripts`** — Custom build chains (Vite, esbuild, Rspack) need explicit externals config for `@wordpress/*` packages and for React/ReactDOM (must come from core, not bundled). Add 4–8 hrs first time on a project; +20% to any block task on a non-`@wordpress/scripts` setup.
- **theme.json schema version bumps** — `version: 2 → 3` (and future) changes how styles/blocks/elements resolve. Mid-project WP upgrades that cross schema versions require re-validation of every theme.json override. Add 0.5–1 day for a v2→v3 audit.
- **Classic editor still active** — If the site hasn't fully migrated to the block editor, any Gutenberg work needs a "does this even load?" baseline check. Add +2–4 hrs.
- **ACF version (Free vs Pro)** — ACF Blocks require Pro. Clarify before estimating any ACF block work.
- **Interactivity API — WP version lock** — Available from WP 6.5. Sites on older versions need a WP upgrade path before any Interactivity API work can start. Flag and add +0.5–1 day for upgrade validation.
- **FSE / block theme on existing content** — Converting a classic theme with years of content can surface template rendering issues across many post types. Add ×1.5–2.0 for conversion tasks.
- **Headless + WPGraphQL schema changes** — Schema changes in WPGraphQL (especially with custom CPTs or ACF fields) ripple into frontend queries. Add +25–40% if the GraphQL schema is evolving.
- **Headless preview mode** — WP preview links don't work natively in headless. Preview support is consistently underestimated; treat as its own M ticket.
- **wp-admin React UI + nonce/REST auth** — Admin UIs hitting the WP REST API need correct nonce handling, capability checks, and sanitisation. Add +2–4 hrs for security review on any admin UI.
- **Block deprecations** — Updating an existing block's `save()` function requires a `deprecated` entry. Missing this breaks existing post content. Add +1–3 hrs per deprecation cycle.
- **`blocks.getSaveContent.extraProps` deprecation cost** — Modifying saved block markup via this filter forces deprecation entries to keep existing post content valid. Add +1–3 hrs per affected block that uses this filter (one deprecation entry per save-shape change), on top of the block deprecation cost above.
- **Multisite** — Add ×1.5 on all block, theme, and admin UI work for multisite installs.

---

## Complexity Tier Mapping (React-in-WP)

| Tier | Example tasks |
|------|--------------|
| S | Add template part, restrict core blocks, block editor style override, register block style variation, bind core block to post meta, add a route to existing headless site |
| M | Static block with controls, dynamic block, custom sidebar plugin, settings page, REST-backed dashboard widget, custom `wp-data` store, register custom block bindings source, extend core block via `addFilter` |
| L | Dynamic block with AJAX, Interactivity API shared store, full admin CRUD UI, full custom store with selectors/resolvers/actions, new CPT in headless with WPGraphQL |
| XL | Classic → block theme conversion, full headless WP build, auth-gated headless content, Interactivity API migration from jQuery |