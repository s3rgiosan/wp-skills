# wp-user-guide

Part of [wp-skills](../README.md) — Claude Code skills for WordPress developers (including the React surfaces of the WP ecosystem).

A Claude Code skill that writes a step-by-step **user guide** for one audience role of a WordPress site (content editors, shop managers, administrators), for people who have not used WordPress before. The guide has one section per content type (posts, pages, custom post types), plus taxonomies, images and files, menus (classic or block), translation, SEO, users, settings and the plugin screens the role reaches (forms, SEO, translation). Each content section covers every field the reader fills in (title, content, excerpt, featured image, sidebar panels, meta boxes, categories, SEO). The Users section covers adding a user with a role, editing, password resets and removal. Each settings screen gets one subsection that says what every field changes on the site, with a warning on high-impact fields (site address, permalinks, homepage). The guide includes annotated screenshots.

The skill grounds every step in what the audience's own role sees on screen. It inventories the content model from the code and WP-CLI. It then surveys each admin screen as a throwaway user with that role, and reconciles the two. A field that exists in the code but that the role cannot reach is reported to the developer and never written up as a guide step.

---

## Installation

### Via Claude Code plugin marketplace (recommended)

```
/plugin marketplace add s3rgiosan/wp-skills
/plugin install wp-user-guide@s3rgiosan-wp-skills
```

Or wire `wp-user-guide@s3rgiosan-wp-skills` into `settings.json` under `enabledPlugins` (see the [root README](../README.md#install-via-claude-code-plugin-marketplace-recommended) for the full snippet).

### Via shell script (fallback)

```bash
git clone https://github.com/s3rgiosan/wp-skills.git
cd wp-skills/wp-user-guide

# Default → ~/.claude
bash install.sh

# Custom Claude config dir (override via env var)
CLAUDE_CONFIG_DIR=~/.some-other-dir bash install.sh
```

Uninstall:

```bash
bash uninstall.sh                              # → ~/.claude
CLAUDE_CONFIG_DIR=~/.some-other-dir bash uninstall.sh # → custom dir
```

---

## Usage

Open a Claude Code session in the site's project, with the site running locally, and ask naturally:

```
"Write a user guide for this site's content editors, with screenshots."
"Add the recipes section to the user guide."
"Document the Users and Settings screens for the shop managers."
"Document how editors create a course, step by step."
```

The skill settles the audience role, the outputs, the language and the plugin author before the survey, and the admin areas, content types, menus and Site Editor after it. It then runs a nine-step flow: inventory → throwaway user → survey → reconcile → shoot → write → audit → deliver → clean up.

### Outputs

- **HTML artifact** (default): a single page with a table of contents, the screenshots and print styles.
- **PDF**: printed from the HTML page.
- **Markdown + images**: for a repository or a wiki.
- **WordPress plugin**: shows the guide in wp-admin to logged-in users, with a menu entry, a dashboard widget and links from the editing screens. The guide text and screenshots are served only through wp-admin, to users who hold the guide capability.

### Scripts

`survey.mjs` and `shoot.mjs` log in with the credentials you pass, keep the session in memory only, and save no content. A new-item screen creates an auto-draft, and opening an existing item's editor sets WordPress's edit lock (`_edit_lock`); step 9 of the workflow cleans up the drafts. Both scripts refuse URLs that trash, delete (including `delete_all=` for Empty Trash and Spam), activate, approve, lock or log out, and a login failure ends the run with `login failed: <text>`, `login landed outside /wp-admin/: <url>` or `login timed out: the submit never navigated`.

| Script | What it does |
| --- | --- |
| `survey.mjs` | Records what a role sees on each admin screen: the admin menu, each screen's `screenId`, the editor kind, the starter-pattern picker, the sidebar panels and their fields (selects with their options, such as the Add User role list), the meta boxes and the notices. Writes `survey.json`. |
| `shoot.mjs` | Takes annotated screenshots from a JSON shot list. Each shot can run steps (click, fill, hover, wait, run JS), add numbered callouts and crop to its subject. Selectors can reach into the block editor canvas. Writes PNGs and `shots.json`. |
| `to-pdf.mjs` | Prints the guide's HTML page to an A4 PDF with its print stylesheet, after every image and font has loaded. |
| `to-markdown.py` | Converts the guide's HTML page to Markdown with relative image links, an index, checklists and tables. Needs `beautifulsoup4`. |
| `to-plugin.py` | Builds a WordPress plugin from the guide's HTML page, its screenshots and a `sections.json` map: an admin page, a dashboard widget, a block editor panel and Help tabs, with screenshots served only to logged-in users who hold the guide capability. Needs `beautifulsoup4`. |

The `.mjs` scripts need Playwright. Install it in a working folder outside the site (`npm i -D playwright && npx playwright install chromium`) and run the scripts from that folder by full path. Pass credentials with the `WP_USER` and `WP_PASSWORD` environment variables. Defaults:

- `survey.mjs`: `--out ./guide-survey`, `--timeout 60000`.
- `shoot.mjs`: `--out ./guide-shots`, a 1440x900 viewport, `--scale 2`, `--timeout 30000`.
- `--base` may include a subdirectory (`https://site.test/wp`). Any flag also takes `--flag=value`.
- Exit codes: 0 success, 1 a screen or shot failed, 2 bad usage or a fatal error (`to-pdf.mjs`, `to-markdown.py` and `to-plugin.py` exit 2 on any error).

A `shoot.mjs` step is one of `click`, `hover`, `fill`, `press`, `wait`, `waitMs`, `scroll`, `openPanel` (opens a settings-sidebar panel by its title when it is closed) or `eval`. The shot list is validated before the run: an unknown key or a bad type exits 2 with every problem listed. `survey.mjs` reads a classic screen again once the network is idle when the first read finds no fields, and records `"app": true` when the second read finds them (a plugin's JavaScript admin page). It records a screen as a block editor screen only when the page body has the `block-editor-page` class; other screens are recorded as classic at once, and a screen with the class whose editor does not load within `--timeout` gets a `warning`. Run `survey.mjs --help` and `shoot.mjs --help` for the full option lists and the shot-list format.

---

## Requirements

- [Claude Code](https://claude.ai/code).
- A local copy of the site with WP-CLI.
- Node.js 18+ with Playwright, installed in a working folder outside the site. Run the `.mjs` scripts from that folder.
- Python 3 with `pip install beautifulsoup4`, for the Markdown and plugin outputs.
- PHP on the `PATH` (optional), so `to-plugin.py` can syntax-check the plugin it writes.
- poppler's `pdftoppm` (optional), for the PDF page check.

---

## Files

```
skills/wp-user-guide/
├── SKILL.md                    ← workflow: settle, inventory, throwaway user, survey, reconcile, shoot, write, audit, deliver, clean up
├── references/
│   ├── inventory.md            ← WP-CLI commands and code patterns for the content model
│   ├── guide-structure.md      ← guide sections, per-type template, plain-language rules, menus, screenshots
│   ├── outputs.md              ← HTML artifact, PDF, Markdown and WordPress plugin outputs
│   └── site-editor.md          ← Site Editor screens and what each changes
└── scripts/
    ├── survey.mjs              ← what a role sees on each admin screen
    ├── shoot.mjs               ← annotated screenshots from a shot list
    ├── to-pdf.mjs              ← HTML page to A4 PDF
    ├── to-markdown.py          ← HTML page to Markdown
    └── to-plugin.py            ← HTML page to a WordPress plugin for wp-admin
```

---

## License

[MIT](../LICENSE)
