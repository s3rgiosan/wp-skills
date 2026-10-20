# wp-pr-review

Part of [wp-skills](../README.md): Claude Code skills for WordPress developers.

A Claude Code skill that reviews a GitHub pull request or GitLab merge request on a WordPress project the way a senior engineer who knows the project would: against what the change was meant to do, and against how the touched code actually works.

- **Task context:** a ticket from any tool (GitHub, GitLab, Jira, or any tracker reachable through a connected MCP tool or CLI) with its comments, acceptance criteria and QA steps, specs, PRDs and plans, and the project's `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, and lint configs.
- **Codebase context:** every touched plugin and theme is mapped with [wp-mnemon](../wp-mnemon) on the base code (entry points, callers, hooks, data lifecycle), and git history is searched for past decisions on removed or changed components.
- **Validated findings:** each claim is checked (caused by this PR or already at the base, stated as the design, backed by a source, settled by runtime state), then re-checked by an independent verifier that confirms, corrects, or drops it.
- **Local QA:** always asks whether to run it. On yes, follows the QA steps or acceptance criteria you give in the request, else the PR body's QA section, else its Acceptance Criteria section, and asks you for the QA details when none exists. Confirms any site change first; screenshots per step.
- **Review doc:** a summary comment, per-line comments, suggestion blocks only for quick self-contained fixes, and reviewer notes (acceptance criteria coverage, evidence, open questions, dropped candidates). Written to the output folder: the one you name in the request, else `WP_PR_REVIEW_DIR`, else it asks. A relative path resolves against the main checkout root, so the doc survives removing a linked worktree; a folder inside the repository should be git-ignored, otherwise it asks before leaving an untracked file.
- **Later rounds:** reads the previous review doc and its own PR threads, reviews the commits since the last reviewed head first, and marks each earlier finding Fixed, Still open, or Outdated. Still open findings with a posted thread get a thread reply, not a duplicate comment. QA screenshots are kept per reviewed head.
- **Posting:** optional, to GitHub as one review or to GitLab as notes and discussions, only after you approve the exact text and event.
- **Wrappable:** another skill can run it with task context it has already gathered (a fixed set of headings), its own doc path, and extra criteria, then add its own outputs. See "Called by another skill" in `SKILL.md`.

**Requires [wp-mnemon](../wp-mnemon).** The [wp-mnemon subagent](https://github.com/s3rgiosan/wp-agents/tree/main/wp-mnemon) is recommended: its maps persist in agent memory and are reused across reviews until a component's version changes.

---

## Installation

### Via Claude Code plugin marketplace (recommended)

```
/plugin marketplace add s3rgiosan/wp-skills
/plugin install wp-mnemon@s3rgiosan-wp-skills
/plugin install wp-pr-review@s3rgiosan-wp-skills
```

The plugin manifest declares `wp-mnemon` as a dependency. For the subagent, add the [wp-agents](https://github.com/s3rgiosan/wp-agents) marketplace and install `wp-mnemon@s3rgiosan-wp-agents`.

### Via shell script (fallback)

```bash
git clone https://github.com/s3rgiosan/wp-skills.git
cd wp-skills

bash wp-mnemon/install.sh
bash wp-pr-review/install.sh

# Custom Claude config dir (override via env var)
CLAUDE_CONFIG_DIR=~/.some-other-dir bash wp-mnemon/install.sh
CLAUDE_CONFIG_DIR=~/.some-other-dir bash wp-pr-review/install.sh
```

Uninstall:

```bash
bash wp-pr-review/uninstall.sh                                       # → ~/.claude
CLAUDE_CONFIG_DIR=~/.some-other-dir bash wp-pr-review/uninstall.sh   # → custom dir
```

---

## Usage

Open a Claude Code session in the project's checkout and ask:

```
"Review https://github.com/example-org/example-site/pull/12"
"Code review PR #12 against ticket ACME-101"
"Review this merge request and draft the comments: https://gitlab.example.com/acme/acme-site/-/merge_requests/7"
```

Requirements: `gh` (GitHub) or `glab` (GitLab), authenticated. `acli` or an Atlassian MCP connection for Jira tickets; any other tracker through its connected MCP tools, or paste the acceptance criteria when asked.

---

## Files

```
skills/wp-pr-review/
├── SKILL.md                    ← workflow: inputs, context, worktrees, wp-mnemon maps, review, QA, verify, post
└── references/
    ├── review-rules.md         ← evidence standard, claim validation, checklist, severity, comment and suggestion rules
    ├── review-doc.md           ← review doc format
    ├── verifier.md             ← brief for the independent verifier
    ├── qa.md                   ← local QA plan, run, and restore
    └── posting.md              ← GitHub and GitLab posting
```
