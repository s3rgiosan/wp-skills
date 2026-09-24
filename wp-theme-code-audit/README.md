# wp-theme-code-audit

Part of [wp-skills](../README.md): Claude Code skills for WordPress developers.

A Claude Code skill that runs an opinionated, verification-first audit of a WordPress theme (block, classic, hybrid or child) and produces a markdown report with severity-sorted findings, fix recommendations, a collected list of `[DECISION]` questions only the theme's owner can answer, and a final **GO / NO-GO / GO WITH FIXES** verdict.

Covers theme security (kses widening, REST meta without `auth_callback`, contributor publishing bypass, render-by-ID, block render files, Interactivity API context, patterns, Global Styles CSS, DOM XSS, third-party and bundled scripts), performance, WordPress.org theme review standards, and child-theme overrides diffed against the parent. Works against a local theme directory, a single file / function, or a remote source (wp.org theme slug, GitHub URL).

Theme counterpart of [wp-plugin-code-audit](../wp-plugin-code-audit), and **requires it**: the severity rubric, `[DECISION]` markers, verdict rules, permanent finding IDs, report location rules, false-positive traps, and the security and performance checklists used for theme PHP that registers routes, handlers, meta or queries all live in that skill and are referenced, not copied.

---

## Installation

Install **both** `wp-plugin-code-audit` and `wp-theme-code-audit`.

### Via Claude Code plugin marketplace (recommended)

```
/plugin marketplace add s3rgiosan/wp-skills
/plugin install wp-plugin-code-audit@s3rgiosan-wp-skills
/plugin install wp-theme-code-audit@s3rgiosan-wp-skills
```

The plugin manifest declares `wp-plugin-code-audit` as a dependency. Or wire both `wp-plugin-code-audit@s3rgiosan-wp-skills` and `wp-theme-code-audit@s3rgiosan-wp-skills` into `settings.json` under `enabledPlugins` (see the [root README](../README.md#install-via-claude-code-plugin-marketplace-recommended) for the full snippet).

### Via shell script (fallback)

```bash
git clone https://github.com/s3rgiosan/wp-skills.git
cd wp-skills

# Default → ~/.claude (install the required plugin audit skill too)
bash wp-plugin-code-audit/install.sh
bash wp-theme-code-audit/install.sh

# Custom Claude config dir (override via env var)
CLAUDE_CONFIG_DIR=~/.some-other-dir bash wp-plugin-code-audit/install.sh
CLAUDE_CONFIG_DIR=~/.some-other-dir bash wp-theme-code-audit/install.sh
```

Uninstall:

```bash
bash wp-theme-code-audit/uninstall.sh                                       # → ~/.claude
CLAUDE_CONFIG_DIR=~/.some-other-dir bash wp-theme-code-audit/uninstall.sh   # → custom dir
```

---

## Usage

Open any Claude Code session and ask naturally:

```
"Audit this theme for security issues."
"Is this theme safe to install on production?"
"Code review the theme at ./wp-content/themes/acme-agency, full audit."
"Review this child theme; check what its overrides changed from the parent."
"Review the example-theme theme from wp.org at version 1.4.0."
"Spot check this block's render.php for XSS."
"Performance review of this block theme before launch."
```

The skill runs a six-phase audit (one optional):

1. **Discover**: theme shape (type, parent, templates / parts / patterns / blocks, `theme.json` version, build, bundled libraries, data-supplying plugins).
2. **Tool scan**: PHPCS+WPCS, PHPStan, Theme Check, Composer/npm audit if available.
3. **Manual read**: `functions.php` and includes, kses and capability filters, meta registration, templates, block render files, patterns, front-end JS, enqueues, child overrides.
4. **Verify**: every candidate traced through source, including who can write the data a template renders.
5. **Reproduce** *(optional)*: trigger the top findings with the lowest role that reaches them, on a test install.
6. **Report**: a dated `THEME-AUDIT-<yyyy-mm-dd>.md` with Critical / High / Medium / Low / Info findings + verdict.

Outputs a dated `THEME-AUDIT-<yyyy-mm-dd>.md` (it asks where to write it, defaulting to a non-public location like `.claude/`, and keeps a per-day history) plus a short inline summary in chat (verdict + counts + top 3 to fix).

---

## What the report looks like

````markdown
# Theme audit: Acme Agency 2.1.0

**Verdict:** GO WITH FIXES
**Counts:** 0 critical, 2 high, 3 medium, 2 low, 1 info
**Top 3 to fix first:**
1. `inc/kses.php:18` · Contributors can store `<script>` in post content
2. `single.php:9` · child override dropped `post_password_required()`
3. `blocks/hero/render.php:22` · `heading` attribute echoed unescaped

## Scope
- Theme shape: child of example-parent 3.2.0 · theme.json v3 · 14 templates, 6 parts, 22 patterns, 4 blocks
- Data-supplying plugins: example-profile-box (bio field, written by the user on their own profile)
- Tools run: PHPCS (yes), PHPStan (yes), Theme Check (yes)

## Overrides reviewed
| Child file | Parent file (version) | Result |
|---|---|---|
| `single.php` | `single.php` (3.2.0) | Dropped `post_password_required()`: see H2 |

## High
### 🟠 HIGH — H1: `inc/kses.php:18` — Contributors can store `<script>` in post content
...
````

---

## What's in the skill

| File | Covers |
|---|---|
| **`SKILL.md`** | Phases, shared-convention deltas, theme-specific verification, report deltas |
| **`references/theme-security-checklist.md`** | Role-to-severity table, chain rule, and 21 theme categories: kses widening, REST meta, save hooks, REST/sitemap exposure, routing overrides, render-by-ID, third-party output, shortcode injection, block render + Interactivity API, patterns, Global Styles CSS, dynamic template paths, DOM XSS, third-party scripts, bundled libraries, anonymous writes, redirects, info disclosure, direct access, stored ID pointers, Customizer settings |
| **`references/theme-standards-checklist.md`** | WordPress.org theme review requirements, `style.css` headers, i18n, plugin territory, block theme hygiene, classic requirements, enqueues, deprecated APIs, theme supports |
| **`references/theme-performance-checklist.md`** | Enqueue scope, heavy scripts, fonts, images, template queries, N+1 loops, remote calls, `theme.json` weight |
| **`references/child-theme-review.md`** | Parent identification, override enumeration, diff procedure, unhooked parent callbacks, parent version drift, when to audit the parent |
| **`references/tooling.md`** | PHPCS/WPCS for themes, PHPStan, Theme Check (`wp theme-check run`), Composer and npm audit with a ships-to-frontend classification |
| **`references/report-template.md`** | `THEME-AUDIT` deltas from the plugin template + a worked example |

Shared material used from `wp-plugin-code-audit`: severity rubric, verdict rules, `[DECISION]` findings, permanent finding IDs, report rules, `security-checklist.md`, `performance-checklist.md`, `standards-checklist.md`, `false-positive-traps.md`, `remote-fetch.md`, `tooling.md`, `report-template.md`.

---

## Philosophy

**Rate by the capability, not the comment.** Most theme findings turn on one question: which role can write the value this template renders? The answer comes from the `current_user_can()` or `auth_callback` on the write path, traced through the theme and, for third-party fields, through the plugin that stores them.

**Verification before claims.** Themes echo constantly; a report that lists every PHPCS escaping warning is noise. Every finding carries a trace through source.

**Every audit ends with a verdict**, with a top-3 list. Same rules as `wp-plugin-code-audit`.

---

## Related skills

- `wp-plugin-code-audit` (required): shared rubric, report rules and checklists.
- `wp-plugin-audit-remediation`: remediation log and behaviour-neutrality checks after the audit; works on theme reports.
- `wp-block-themes`, `wp-block-development`, `wp-interactivity-api`: the forward-looking patterns this audit checks for.
- `wp-project-audit`: whole-project audits that dispatch to this skill and to `wp-plugin-code-audit`.

---

## License

[MIT](../LICENSE)
