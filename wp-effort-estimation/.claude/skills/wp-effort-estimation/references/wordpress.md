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
| Task | S | M | L | XL |
|------|---|---|---|-----|
| Add ACF field group to existing CPT | 1–2 hrs | — | — | — |
| ACF + flexible content layout | — | 4–8 hrs | — | — |
| ACF Blocks (custom Gutenberg blocks via ACF) | — | 6–12 hrs | 1–2 days | — |

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

## WordPress-Specific Risk Factors

- **Plugin conflicts** — Common in mature WP installs. Add +20–50% if client has 20+ active plugins.
- **PHP version constraints** — Some hosts lock to old PHP. Can break modern tooling.
- **Gutenberg vs Classic editor** — Confirm which editor is in use before estimating block work.
- **ACF version (Free vs Pro)** — Features like ACF Blocks require Pro. Clarify before estimating.
- **WooCommerce version drift** — Extensions are tightly coupled to WC version. Confirm version.
- **Custom DB tables** — Any task touching custom tables should get +1–2 days for schema design, migration script, and safety testing.
- **Multisite** — Add ×1.5 multiplier for all template and plugin work on multisite installs.
- **Page builder debt** (Elementor, Divi, Beaver) — Significantly increases complexity of theming and performance work. Add ×1.5–2.0.

---

## Complexity Tier Mapping (WordPress)

| Tier | Example tasks |
|------|--------------|
| S | CSS tweak, shortcode, CPT registration, ACF field group, minor template override |
| M | New page template, dynamic block, custom REST endpoint, checkout field customization |
| L | Full theme build, WooCommerce integration, CPT with filtering, plugin with admin UI |
| XL | Headless WP, WC subscription logic, full platform migration, complex multisite setup |
