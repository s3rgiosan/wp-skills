# wp-skills

> Claude Code skills for WordPress developers.

A collection of Claude Code skills that bring reusable, stack-aware expertise
into your development sessions — sizing tickets, triaging plugins, reviewing
diffs, and more — without re-explaining context every time.

> **Scope note:** When these skills mention "React", they mean React **in a WordPress context** — block editor / Gutenberg, Interactivity API, admin UIs, or headless WP (Next.js, Faust, etc.). Generic standalone-React projects are not the target.

Companion to [wp-agents](https://github.com/s3rgiosan/wp-agents) (subagents
with persistent memory). Skills here focus on lightweight, on-demand workflows
that don't require agent memory.

---

## Skills

### [wp-effort-estimation](./wp-effort-estimation)

Structured development-effort estimates for WordPress tasks (and React work inside the WP context — Gutenberg, Interactivity API, headless). Outputs
complexity tier, hours/days midpoint, confidence range, subtask breakdown,
assumptions, and risks — ready for Jira, Linear, or a client proposal.

**Triggers on:** "how long", "estimate", "size this", "story points",
"t-shirt size", "is this a day?", "scope this", "break this down".

**[→ Install wp-effort-estimation](./wp-effort-estimation/README.md)**

### [wp-migration-playbook](./wp-migration-playbook)

Opinionated, production-tested playbook for WordPress content migrations — WP→WP and other-system→WP. Covers inventory + disposition, custom migration plugin architecture (Tier 1–3 + idempotent gating), content type and taxonomy migration, user migration, the hard parts of media migration (ID preservation, intersect-before-delete, REST-based recovery, manifest-based registration), redirects (host-level, Yoast storage shape), operational gotchas, and recovery patterns.

**Triggers on:** "WP migration", "WordPress migration", "content migration", "migrate to WordPress", "Laravel to WordPress", "Drupal to WordPress", "import posts", "migrate attachments", "media migration", "redirect map", "migration runbook".

**[→ Install wp-migration-playbook](./wp-migration-playbook/README.md)**

### [wp-plugin-code-audit](./wp-plugin-code-audit)

Verification-first code audit for WordPress plugins. Five-phase workflow (discover → tool scan → manual read → verify → report) covering security, performance, WordPress coding standards, and WordPress.org Plugin Directory guidelines. Produces a dated `AUDIT-<yyyy-mm-dd>.md` (written to a location you choose, defaulting to a non-public one like `.claude/`) with severity-sorted findings (Critical / High / Medium / Low / Info), fix recommendations, a verified-false appendix, and a final **GO / NO-GO / GO WITH FIXES** verdict. Works against a local plugin directory, a single file, or a remote source (wp.org slug, GitHub URL).

**Triggers on:** "audit this plugin", "review the plugin", "is this plugin secure", "code audit", "security review", "is this plugin safe to install", "check this plugin for vulnerabilities", "performance review of this plugin".

**[→ Install wp-plugin-code-audit](./wp-plugin-code-audit/README.md)**

### [wp-mnemon](./wp-mnemon)

Deep architectural analysis of WordPress plugins — what the plugin does, how it works, what triggers what, and how data flows through the system. 12-phase workflow produces structured documentation (overview, architecture, hooks, data, extending). Works against a local path or a GitHub URL (public or private). Paired with the [wp-mnemon subagent](https://github.com/s3rgiosan/wp-agents/tree/main/wp-mnemon) in `wp-agents` for persistent agent memory; usable standalone for one-shot analysis.

**Triggers on:** "analyze this plugin", "understand how this plugin works", "map the plugin's hooks", "what does this plugin do", "trace the bootstrap flow", "document this plugin".

**[→ Install wp-mnemon](./wp-mnemon/README.md)**

---

## Install via Claude Code plugin marketplace (recommended)

`wp-skills` is a Claude Code plugin marketplace. Add it once, then install plugins individually:

```
/plugin marketplace add s3rgiosan/wp-skills
/plugin install wp-plugin-code-audit@s3rgiosan-wp-skills
/plugin install wp-mnemon@s3rgiosan-wp-skills
```

Or wire it directly via `settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "s3rgiosan-wp-skills": {
      "source": { "source": "github", "repo": "s3rgiosan/wp-skills" }
    }
  },
  "enabledPlugins": {
    "wp-plugin-code-audit@s3rgiosan-wp-skills": true,
    "wp-mnemon@s3rgiosan-wp-skills": true
  }
}
```

Plugins live in the same Claude Code session as your own `.claude/` configs — no conflict with prior `install.sh` installs.

> Heads-up on namespaces. Skills installed via plugins are invoked with the `<plugin>:<skill>` form (e.g. `wp-plugin-code-audit:wp-plugin-code-audit`). Skills installed via `install.sh` keep the bare name (e.g. `wp-plugin-code-audit`). Pick one source per skill to avoid duplicates.

---

## Install via shell script (fallback)

If you can't use the plugin marketplace (older Claude Code build, scripted environment, etc.) each skill ships an `install.sh`. See the individual skill README under each subdir.

```bash
git clone https://github.com/s3rgiosan/wp-skills.git
cd wp-skills/<skill-name>
bash install.sh                                       # → ~/.claude
CLAUDE_CONFIG_DIR=~/.some-other-dir bash install.sh   # → custom dir
```

---

## Requirements

- [Claude Code](https://claude.ai/code) — v2.1.110+ for plugin marketplace support.
- Bash (macOS, Linux, or WSL on Windows) for fallback `install.sh`.

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
├── .claude-plugin/
│   └── plugin.json              ← plugin manifest (marketplace install)
├── skills/
│   └── skill-name/
│       ├── SKILL.md
│       └── references/          ← optional
│       └── scripts/             ← optional
├── install.sh                   ← fallback installer
├── uninstall.sh
└── README.md
```

---

## Contributors

- Sérgio Santos ([@s3rgiosan](https://github.com/s3rgiosan))
- Marco Almeida ([@webdados](https://github.com/webdados))

---

## License

MIT
