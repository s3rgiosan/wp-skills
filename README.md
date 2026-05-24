# wp-skills

> Claude Code skills for WordPress developers.

A collection of Claude Code skills that bring reusable, stack-aware expertise
into your development sessions — sizing tickets, triaging plugins, reviewing
diffs, and more — without re-explaining context every time.

> **Scope note:** When these skills mention "React", they mean React **in a WordPress context** — block editor / Gutenberg, Interactivity API, admin UIs, or headless WP (Next.js, Faust, etc.). Generic standalone-React projects are not the target.

Companion to [wp-agents](https://github.com/your-username/wp-agents) (subagents
with persistent memory). Skills here focus on lightweight, on-demand workflows
that don't require agent memory.

---

## Skills

### [effort-estimation](./effort-estimation)

Structured development-effort estimates for WordPress tasks (and React work inside the WP context — Gutenberg, Interactivity API, headless). Outputs
complexity tier, hours/days midpoint, confidence range, subtask breakdown,
assumptions, and risks — ready for Jira, Linear, or a client proposal.

**Triggers on:** "how long", "estimate", "size this", "story points",
"t-shirt size", "is this a day?", "scope this", "break this down".

**[→ Install effort-estimation](./effort-estimation/README.md)**

### [wp-migration-playbook](./wp-migration-playbook)

Opinionated, production-tested playbook for WordPress content migrations — WP→WP and other-system→WP. Covers inventory + disposition, custom migration plugin architecture (Tier 1–3 + idempotent gating), content type and taxonomy migration, user migration, the hard parts of media migration (ID preservation, intersect-before-delete, REST-based recovery, manifest-based registration), redirects (host-level, Yoast storage shape), operational gotchas, and recovery patterns.

**Triggers on:** "WP migration", "WordPress migration", "content migration", "migrate to WordPress", "Laravel to WordPress", "Drupal to WordPress", "import posts", "migrate attachments", "media migration", "redirect map", "migration runbook".

**[→ Install wp-migration-playbook](./wp-migration-playbook/README.md)**

---

## Requirements

- [Claude Code](https://claude.ai/code)
- Bash (macOS, Linux, or WSL on Windows)

---

## Philosophy

WordPress work — including the React side of it (blocks, editor, Interactivity API, headless frontends) — is full of recurring workflows that benefit from
consistent, opinionated guidance: estimating tickets, auditing plugins,
reviewing blocks, planning migrations. These skills encode that guidance so
every session starts from the same baseline.

Each skill installs into Claude Code's user-level config (`~/.claude/skills/`)
and becomes available in every project automatically.

---

## Contributing

New skill ideas are welcome. If you build a Claude Code skill for WordPress
development (including its React-flavored surfaces), open a PR.

Each skill lives in its own directory and follows the same structure:

```
skill-name/
├── install.sh
├── uninstall.sh
├── README.md
└── .claude/
    └── skills/
        └── skill-name/
            ├── SKILL.md
            └── references/        ← optional
            └── scripts/           ← optional
```

---

## License

MIT
