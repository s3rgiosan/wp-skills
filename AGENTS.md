# AGENTS.md

Instructions for AI agents working in this repository. The repo is public: every tracked file ships to anyone who installs a skill.

## Repository layout

Each top-level directory is one Claude Code plugin holding one skill:

```
skill-name/
├── .claude-plugin/plugin.json   ← name, version, description, dependencies
├── skills/skill-name/
│   ├── SKILL.md                 ← frontmatter `name` must equal the directory name
│   ├── references/              ← optional, loaded on demand
│   └── scripts/                 ← optional
├── install.sh / uninstall.sh    ← copy the skill into $CLAUDE_CONFIG_DIR/skills
└── README.md
```

`.claude-plugin/marketplace.json` lists every plugin. The root `README.md` has one section per plugin.

## Example data: fabricate everything

Skills are written from real engagements, but nothing from those engagements may appear in a tracked file. This covers SKILL.md, references, scripts, READMEs, commit messages and PR bodies.

- **Never** copy client, company, site, brand or person names, domains, URLs, IPs, emails, account or site IDs, keys, file paths, or plugin, theme, CPT, table, option and meta slugs from a real project.
- **Never** copy the shape of a real project either: its URL structure, redirect rules, content types, step or action names from its tooling, or error strings from its code. A set of individually generic details can still identify a client.
- **Never** use exact numbers or dates from a real run (counts, IDs, token totals, row counts, audit dates). Use round, obviously invented values.
- Say "for example", never "from a real project" or "real production incident".
- Use these placeholders:
  - Names: Acme Corp, `acme-*` slugs, `example-*`, `my-plugin`, `<slug>`.
  - Domains: `example.com`, `old.example.com` / `new.example.com`, `*.test`, `acme.example`. Never `acme.com` or another registered domain.
  - URL paths: `/old-section/`, `/new-section/`, `/news/archive/`.
  - IDs: `101, 102, 103`. Dates: `2026-05-29`. Commits: `a1b2c3d`.
- Public projects and vendors (WordPress, WooCommerce, Yoast, Wordfence, 10up WP Framework and similar) may be named when they are the subject.
- User-supplied material (audit reports, logs, dumps, screenshots) stays outside the repo or in a git-ignored path such as `.claude/`.

Before committing, scan the diff for anything on the lists above.

## Cross-skill references

When one skill builds on another, it reads the other skill's `references/` files directly. It does not tell the model to load or invoke the other skill, because that pulls the other skill's whole workflow into context.

- Shared audit rules (verification, report rules, finding IDs, severity rubric, `[DECISION]` findings, verdict) live in `wp-plugin-code-audit/skills/wp-plugin-code-audit/references/shared-conventions.md`. Change them there, not in a dependent skill.
- Declare the dependency in the dependent plugin's `plugin.json` `dependencies`.

## Writing style

- Comments, skill text, READMEs and PR bodies are for a human reader. State what is needed and why; no filler, no history, no "matches the X" provenance.
- Write affirmatively: say what the skill does, not what it does instead of something else.
- Use allowlist / denylist.

## Versioning and commits

- Any change to a plugin bumps its `plugin.json` version (semver). A release also bumps `metadata.version` in `marketplace.json`, as a separate `chore: bump marketplace version to x.y.z` commit.
- Git tags and release names use plain semver with no `v` prefix: `1.4.0`.
- Conventional commits, lowercase, scoped to the plugin: `feat(wp-theme-code-audit): …`. One plugin per commit.
- No AI attribution in commits or PRs: no `Co-Authored-By`, session links or "Generated with" footers.

## Checks before a PR

- Every `.sh` passes `bash -n`, and every `.json` parses.
- Each SKILL.md frontmatter `name` matches its directory, and each plugin appears in `marketplace.json` and the root README.
- Scripts that inspect a project are read-only on it and refuse an output path inside it.
