---
name: wp-mnemon
description: >
  Step-by-step instructions for deep analysis of a WordPress plugin — architecture,
  execution flows, hook chains, data lifecycle, and extensibility — from a local path
  or GitHub URL. Writes structured documentation into agent memory.
---

# wp-mnemon — WordPress Plugin Deep Analyzer

You are performing a deep architectural analysis of a WordPress plugin. Your goal is not
just to catalog hooks and data structures, but to understand **what the plugin does, how
it works, what triggers what, and how data flows through the system**.

Follow every phase below in order. Do not skip phases even if the plugin seems simple.

---

## Phase 0: Determine Source

Check what the user provided:

**Local path** (e.g. `/wp-content/plugins/my-plugin` or `~/plugins/my-plugin`):
- Use `Glob` and `Read` tools directly on the filesystem
- Use the bash scripts in `~/.claude/skills/wp-mnemon/scripts/` for fast scanning

**GitHub URL** (e.g. `https://github.com/org/repo`):
- Extract `{owner}` and `{repo}` from the URL
- Set `GITHUB_API=https://api.github.com/repos/{owner}/{repo}`
- If the user provided a token, use `Authorization: Bearer {token}` header on all requests
- Fetch the full file tree: `GET {GITHUB_API}/git/trees/HEAD?recursive=1`
- Read individual files on demand: `GET {GITHUB_API}/contents/{path}`
- GitHub API returns file content as base64 — decode it before reading

---

## Phase 1: Identify the Plugin

Find the main plugin file (contains the plugin header comment):

```
Plugin Name:
Plugin URI:
Description:
Version:
Author:
```

- For local: `Glob` for `*.php` in the root, read each until you find the header
- For GitHub: look at the file tree for root-level `.php` files, fetch and scan them

Extract and record:
- Plugin name, slug, version, author
- Text domain
- Main file path
- Constants defined (`PLUGIN_VERSION`, `PLUGIN_DIR`, `PLUGIN_URL`, etc.)
- Read the plugin's README or readme.txt to understand its stated purpose and features

---

## Phase 2: Map the File Structure

Build a complete map of the plugin. Categorize every directory:

| Directory | Purpose |
|---|---|
| `includes/` or `src/` | Core classes and logic |
| `admin/` | Admin-only code |
| `public/` or `frontend/` | Frontend-facing code |
| `templates/` or `views/` | Template files |
| `assets/` | JS, CSS, images |
| `languages/` | i18n `.pot` files |
| `vendor/` | Third-party dependencies |
| `tests/` | Test suite |

Note the architectural pattern: procedural, OOP singleton, OOP dependency injection,
service container, or mixed.

Count total PHP files and estimate plugin complexity.

---

## Phase 3: Architecture & Class Map

**For local plugins**, run:
```bash
bash ~/.claude/skills/wp-mnemon/scripts/scan_classes.sh /path/to/plugin
```

**For GitHub**, read key PHP files and scan for the same patterns.

Build a class architecture map:

1. **Namespaces** — what namespace structure is used?
2. **Autoloading** — how are classes loaded? (Composer PSR-4, custom autoloader, manual requires)
3. **Core classes** — identify the main plugin class, admin class, frontend class, and any base/abstract classes
4. **Class hierarchy** — map `extends` and `implements` relationships as a tree
5. **Traits** — what shared behavior is mixed in via traits?
6. **Singletons & factories** — how are key objects instantiated and accessed?
7. **Service container** — if there's a DI container, how does it wire things together?

Read the main plugin class and any bootstrap/loader files thoroughly. These reveal
the overall architecture better than any grep.

---

## Phase 4: Bootstrap & Initialization Flow

Trace the complete loading sequence starting from the main plugin file. **Read the actual
code** — don't just grep. Answer:

1. **What happens when WordPress loads this plugin file?**
   - What files are required/included immediately?
   - What classes are instantiated?
   - What hooks are registered at load time?

2. **What happens at each WordPress lifecycle stage?**
   Trace the chain through key hooks in order:
   - `plugins_loaded` — what runs here?
   - `init` — what gets registered? (CPTs, taxonomies, shortcodes, etc.)
   - `wp_loaded` — any late initialization?
   - `admin_init` — admin-specific setup?
   - `admin_menu` — menu/page registration?
   - `wp_enqueue_scripts` / `admin_enqueue_scripts` — asset loading?
   - `rest_api_init` — REST route registration?
   - `widgets_init` — widget registration?

3. **Dependency chain** — what must load before what? Are there conditional loads
   (e.g., admin-only classes, frontend-only classes)?

Document this as a sequential flow with clear arrows/steps.

---

## Phase 5: Scan All Hooks

**For local plugins**, run:
```bash
bash ~/.claude/skills/wp-mnemon/scripts/scan_hooks.sh /path/to/plugin
```

**For GitHub**, scan PHP files for hook patterns.

Look for ALL of these:
- `add_action(`, `add_filter(` — hooks the plugin listens to
- `do_action(`, `apply_filters(` — hooks the plugin exposes
- `do_action_ref_array(`, `apply_filters_ref_array(`
- `remove_action(`, `remove_filter(` — hooks intentionally removed
- `has_action(`, `has_filter(` — conditional hook checks

For each hook, document:
- Hook name, type (action/filter), file, line, priority, accepted args
- Callback function/method
- **What it does** — read the callback to understand purpose, not just its name
- **For filters**: what value is being filtered and what return is expected
- **For exposed hooks**: what parameters are passed and what use cases they enable

Group hooks into:
- **Registered** (`add_action`, `add_filter`) — what WP/plugin hooks it listens to
- **Exposed** (`do_action`, `apply_filters`) — extension points for other plugins
- **Removed** (`remove_action`, `remove_filter`) — intentional overrides and why

---

## Phase 6: Scan Data Structures

**For local plugins**, run:
```bash
bash ~/.claude/skills/wp-mnemon/scripts/scan_data.sh /path/to/plugin
```

**For GitHub**, scan PHP files for data patterns.

For each data structure found, go beyond the grep match — **read surrounding code** to
understand context:

### Custom Post Types & Taxonomies
- Full registration args (supports, capabilities, rewrite, visibility, menu position)
- What admin UI is associated with each CPT?

### Meta Keys (post, user, term, comment)
- What stores each key, what reads it, what deletes it
- Data type and expected format
- Which post type / object type each key belongs to

### Options
- Default values, what settings page controls them
- Whether they're autoloaded

### Custom Database Tables
- Full schema (capture `dbDelta` SQL or `CREATE TABLE` statements)
- Columns, indexes, foreign key relationships to WP core tables
- What CRUD operations exist for each table

### Transients & Cache
- Key patterns, expiry times, what triggers invalidation

---

## Phase 7: Scan Integrations

### REST API
- `register_rest_route(` — namespace, route pattern, methods, permission callback
- Read the endpoint callbacks to understand request/response shapes

### Shortcodes
- `add_shortcode(` — tag, accepted attributes and defaults, what it renders

### Blocks (Gutenberg)
- `register_block_type(` — block name, attributes, supports, render callback
- Check for `block.json` files in the plugin

### WP-CLI Commands
- `WP_CLI::add_command(` — command name, subcommands, what they do

### Enqueued Assets
- Scripts and styles: handle, source, dependencies, version
- Conditions: admin only, frontend only, specific pages/post types

### Cron Jobs
- Hook name, schedule interval, what the callback does

### Third-party Integrations
Look for conditional checks:
- WooCommerce, ACF, WPML, Elementor, Yoast, Gravity Forms, etc.
- Document what each integration adds or modifies

---

## Phase 8: Execution Flow Tracing

This is the most important analytical phase. For each **major feature** of the plugin,
trace the complete execution flow from trigger to outcome.

Identify major features from:
- The plugin's stated purpose (readme/description)
- Admin pages and their functionality
- Frontend-facing shortcodes/blocks
- AJAX/REST endpoints
- Cron jobs

For each major flow, trace:
```
Trigger -> Entry point -> Processing chain -> Data operations -> Output/Side effects
```

Example format:
```
### Form Submission Flow
1. User submits form on frontend (JS event listener in `assets/js/public.js`)
2. AJAX POST to `admin-ajax.php` action `my_plugin_submit`
3. Handler: `Ajax_Handler::process_submission()` (`includes/class-ajax-handler.php:45`)
4. Validates nonce and fields via `Validator::validate()` (`includes/class-validator.php:22`)
5. Calls `apply_filters('my_plugin_pre_save', $data)` — extension point
6. Stores data: `$wpdb->insert()` into `{prefix}my_plugin_entries` table
7. Fires `do_action('my_plugin_after_save', $entry_id, $data)` — extension point
8. Sends email notification via `Notification::send()` if enabled in settings
9. Returns JSON response to frontend
```

Read the actual code for each step. **Do not guess flow from function names alone.**

---

## Phase 9: Admin & Frontend Map

### Admin Interface
- What menu pages / submenu pages exist?
- What does each admin page do? (settings, list tables, editors, dashboards)
- What metaboxes are registered and on which screens?
- What admin notices or pointers are shown?
- What AJAX operations does the admin UI trigger?

### Frontend Interface
- What does the plugin render on the frontend? (shortcode output, block output, template overrides)
- What JavaScript behavior is added? (event handlers, AJAX, DOM manipulation)
- What CSS/styles does it inject?

### User-facing Workflow
Describe the typical user workflow:
- Admin: "To create a new X, go to Menu > Submenu, fill in fields A/B/C, click Save"
- Frontend: "Visitors see X rendered via shortcode `[foo]`, which displays Y"

---

## Phase 10: Extensibility Patterns

Based on everything found, document:

1. **Template overrides** — can templates be copied to the theme? What's the lookup path?
2. **Class extension** — are main classes instantiated in a way that allows replacement?
3. **Filter-based configuration** — which `apply_filters` calls are meant as config points?
4. **Action hooks for developers** — which `do_action` calls are documented extension points?
5. **Common patterns** — what's the idiomatic way to extend this plugin?

Write 3-5 concrete, practical code examples of how a developer would extend this plugin.
Focus on the most common real-world use cases.

---

## Phase 11: Write Memory Files

Create a directory for the plugin and write multiple focused files:

### Directory structure
```
~/.claude/agent-memory/wp-mnemon/plugins/{plugin-slug}/
├── overview.md
├── architecture.md
├── hooks.md
├── data.md
└── extending.md
```

### `overview.md` — What it does & how it works

```markdown
# {Plugin Name} — v{version}

**Slug**: {slug} | **Author**: {author} | **Analyzed**: {date}

## What This Plugin Does
{Clear description of the plugin's purpose, target users, and main features.
Write this for a developer who has never seen the plugin.}

## File Structure
{Directory map with purpose annotations}

## Bootstrap Flow
{Step-by-step initialization sequence from plugin load through WordPress lifecycle.
Show what loads when and what triggers what.}

## Major Execution Flows
{For each key feature, the full trigger -> processing -> output chain.
This is the most valuable section. Be specific with file paths and line references.}

## Admin Workflow
{What admins see and do — pages, settings, editors}

## Frontend Output
{What visitors see — rendered shortcodes, blocks, templates}
```

### `architecture.md` — How it's built internally

```markdown
# {Plugin Name} — Architecture

## Architectural Pattern
{OOP/procedural/mixed, design patterns used, DI approach}

## Class Map
{Class hierarchy with inheritance and interface relationships.
For each key class: responsibility, file path, key methods.}

## Namespace Structure
{Namespace tree if applicable}

## Autoloading
{How classes are loaded}

## Dependency Chain
{What depends on what, conditional loading}
```

### `hooks.md` — All hooks with context

```markdown
# {Plugin Name} — Hooks Reference

## Hooks Registered (listens to WP/others)
{For each: hook name, callback, file:line, priority, what it does}

## Hooks Exposed (extension points)
{For each: hook name, file:line, parameters passed, use case, expected return for filters}

## Hooks Removed
{For each: hook name, why it's removed}
```

### `data.md` — Data structures & integrations

```markdown
# {Plugin Name} — Data & Integrations

## Custom Post Types
{Slug, labels, supports, capabilities, admin UI}

## Taxonomies
{Slug, associated CPTs, hierarchical}

## Meta Keys
{Key, object type, data type, where set/read/deleted}

## Options
{Key, default, autoload, what controls it}

## Custom DB Tables
{Table name, full schema, what CRUD operations exist}

## REST API Routes
{Method, route, permission, request/response shape}

## Shortcodes & Blocks
{Tag/name, attributes, what it renders}

## Assets
{Handle, type, conditions, dependencies}

## Cron Jobs
{Hook, interval, what it does}

## Transients
{Key pattern, expiry, invalidation trigger}

## Third-party Integrations
{Plugin, what the integration does, conditional check used}
```

### `extending.md` — How to extend it

```markdown
# {Plugin Name} — Extensibility Guide

## Extension Patterns
{Template overrides, class replacement, filter-based config, action hooks}

## Key Extension Points
{The most useful hooks for developers, with context on when/why to use each}

## Code Examples
{3-5 practical, real-world examples of extending this plugin}

## Data Lifecycle
{How data is created, updated, read, deleted — and where to hook in}
```

### Update index: `~/.claude/agent-memory/wp-mnemon/MEMORY.md`

Add or update the plugin entry in the table:
```markdown
| {name} | {slug} | {version} | {date} |
```

Add a note under Cross-Plugin Patterns if you observe patterns shared with other
analyzed plugins.

---

## Phase 12: Confirm to User

Tell the user:
- What was analyzed
- Where memory was written (list all files)
- Key stats: hook count, CPTs, DB tables, REST routes, major flows traced
- Any gaps: files that couldn't be read, areas that were unclear
- A brief summary of the plugin's architecture and main flows
