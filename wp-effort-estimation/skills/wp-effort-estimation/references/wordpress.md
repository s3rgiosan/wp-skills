# WordPress Effort Estimation Reference

## Task Taxonomy & Base Estimates

### Theme Work
| Task | S | M | L | XL |
|------|---|---|---|-----|
| CSS/style tweak (existing theme) | 1–2 hrs | — | — | — |
| New page template (matching existing design) | — | 4–8 hrs | — | — |
| New page template (new design) | — | 8–16 hrs | — | — |
| Full custom theme from Figma | — | — | 3–6 days | 6–12 days |
| Child theme setup + basic overrides | 2–4 hrs | — | — | — |
| Block theme / FSE conversion | — | — | 3–5 days | 5–10 days |

### Gutenberg / Block Editor
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Register a static custom block | — | 4–8 hrs | — | — |
| Dynamic block (server-rendered) | — | 6–12 hrs | — | — |
| Block with complex controls + inner blocks | — | — | 2–4 days | — |
| Custom block pattern library | — | — | 2–3 days | 3–6 days |
| Block Hooks (`block_hooks`, WP 6.4+ — auto-insert blocks) | 2–4 hrs | — | — | — |

### Plugin Development
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Simple shortcode or widget | 1–3 hrs | — | — | — |
| Custom plugin (admin UI + DB) | — | — | 3–6 days | — |
| WooCommerce extension | — | — | 4–8 days | 8–15 days |
| REST API endpoint (custom) | — | 4–8 hrs | — | — |
| Webhook handler | — | 3–6 hrs | — | — |
| WP-CLI script (data backfill / ad-hoc migration) | — | 8–16 hrs | — | — |
| Cron / Action Scheduler job (scheduled task or queue) | — | 4–8 hrs | — | — |
| i18n setup (textdomain + .pot generation) | 1 hr | — | — | — |
| Privacy exporter / eraser callbacks (GDPR-mandated) | — | 8–16 hrs | — | — |

### WooCommerce
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Product page customization (template) | — | 4–8 hrs | — | — |
| Custom checkout field | 1–2 hrs | — | — | — |
| Custom checkout flow (multi-step) | — | — | 3–5 days | — |
| Payment gateway integration | — | — | 3–6 days | — |
| Subscription logic (Woo Subscriptions) | — | — | 4–8 days | 8+ days |
| Custom product type | — | — | 4–7 days | — |

### ACF & Custom Fields

> **Tool order for custom fields.** Pick the first one that fits the surface:
>
> 1. **Core meta / Gutenberg APIs** — `register_post_meta` with `show_in_rest`,
>    surfaced through block attributes, editor sidebar panels, or block
>    bindings. The default for anything on a block-editor post type.
> 2. **Fieldmanager** — for surfaces the block editor doesn't cover: terms,
>    settings screens, and post types with the block editor disabled.
> 3. **ACF** — only on codebases that already use it, and only for custom
>    fields.
>
> **Never build blocks with ACF.** Not on new work, and not as an extension of
> an existing ACF codebase — a new block is a native block
> (`register_block_type` + `block.json`), always. The ACF Block row below exists
> only to size work on blocks that *already* exist in an inherited codebase; it
> is never the row for a block being created.
>
> If a request would introduce ACF to a project not already using it, say so and
> estimate the core or Fieldmanager equivalent instead.

| Task | S | M | L | XL |
|------|---|---|---|-----|
| Add ACF field group to existing CPT | 1–2 hrs | — | — | — |
| ACF + flexible content layout | — | 4–8 hrs | — | — |
| ACF Block — substantial rework of an existing one | — | 6–12 hrs | 1–2 days | — |

> This range is ACF-block *build* cost, and it stays that way — reworking an
> existing ACF block (new render logic, restructured fields) costs about what
> building one costs. It is retained only for inherited codebases. Field-level
> tweaks to an existing ACF block are the "Add ACF field group" row above, not
> this one. A block being **created** never uses this row at any size — see the
> scope note.

### CPT & Taxonomy
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Register CPT + taxonomy | 1–3 hrs | — | — | — |
| CPT with custom archive + single templates | — | 4–8 hrs | — | — |
| Faceted filtering (CPT + AJAX) | — | — | 2–4 days | — |

### Performance & Infrastructure
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Basic caching plugin setup | 1–2 hrs | — | — | — |
| Full performance audit + optimization | — | — | 2–4 days | — |
| Multisite setup | — | 1–2 days | 3–5 days | — |
| Headless WP (REST or GraphQL) | — | — | 4–8 days | 8–15 days |

### Migrations
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Content migration (same theme) | — | 1–2 days | — | — |
| Platform migration (e.g. Squarespace → WP) | — | — | 3–5 days | 5–10 days |
| WP → headless | — | — | — | 10–20 days |

---

## FE/BE Split Hints

Most tasks in these tables are single-discipline — keep a single total for CSS tweaks, CPT registration, WP-CLI scripts, cron jobs, webhook handlers, and pure-PHP plugin work. The optional FE/BE split (see SKILL.md) is only worth stating for tasks that genuinely span both:

- **Dynamic blocks / block editor work** — see `react.md` for split guidance.
- **Faceted filtering (CPT + AJAX)** — BE: query/endpoint work. FE: filter UI and state.
- **Headless WP** — BE: WP-side API exposure. FE: the consuming app (covered in `react.md`).
- **Custom plugin with admin UI** — BE: data layer, hooks, security. FE: admin screens.

---

## WordPress-Specific Risk Factors

- **Plugin conflicts** — Common in mature WP installs. Add +20–50% if client has 20+ active plugins.
- **PHP version constraints** — Some hosts lock to old PHP. Can break modern tooling.
- **Gutenberg vs Classic editor** — Confirm which editor is in use before estimating block work.
- **ACF version (Free vs Pro)** — Features like ACF Blocks require Pro. Clarify before estimating work on an existing ACF codebase. New blocks are never estimated as ACF blocks — see the scope note under "ACF & Custom Fields".
- **WooCommerce version drift** — Extensions are tightly coupled to WC version. Confirm version.
- **Custom DB tables** — Any task touching custom tables should get +1–2 days for schema design, migration script, and safety testing.
- **Multisite** — Add ×1.5 multiplier for all template and plugin work on multisite installs. *Stacks* — this is an environment factor, not a codebase-quality one, so it applies on top of whichever codebase row you picked.
- **Page builder debt** (Elementor, Divi, Beaver) — Significantly increases complexity of theming and performance work. Add ×1.5–2.0. *Codebase-quality factor — competes with the "Legacy / messy codebase" row; take the worse of the two, never both.*

> **Stacking these:** risk factors above are multiplicative on top of the General
> Multipliers unless marked as competing. If the total compounded multiplier
> exceeds 3×, re-tier as XL and recommend a spike — see `multipliers.md`.

---

## Complexity Tier Mapping (WordPress)

| Tier | Example tasks |
|------|--------------|
| S | CSS tweak, shortcode, CPT registration, ACF field group, minor template override |
| M | New page template, dynamic block, custom REST endpoint, checkout field customization |
| L | Full theme build, WooCommerce integration, CPT with filtering, plugin with admin UI |
| XL | Headless WP, WC subscription logic, full platform migration, complex multisite setup |
