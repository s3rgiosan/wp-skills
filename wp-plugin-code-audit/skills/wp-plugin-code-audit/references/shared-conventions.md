# Shared audit conventions

Rules that `wp-plugin-code-audit`, `wp-theme-code-audit` and `wp-project-security-audit` all follow: verification, reproduction, report rules, permanent finding IDs, the severity rubric, owner-decision findings and the verdict. The text is written in plugin terms. Theme and project audits apply it unchanged except for the deltas their own `SKILL.md` states.

---

## Verify (mandatory)

For every candidate finding, before adding to the report, run the verification procedure for its category:

| Candidate | Verification |
|---|---|
| **SQL injection** | Trace the input. Is it `$wpdb->prepare()`'d? `esc_sql()`'d? Allowlisted via `post_type_exists` / `in_array` against a static list? If yes → not exploitable. Note as "fragile, not exploitable" only if a refactor would break the guard. |
| **Missing nonce** | Is the endpoint admin-only with a real capability gate (`manage_options`, not `read`)? Is it a REST route with cookie auth + meaningful `permission_callback`? Verify the threat model before flagging. |
| **Missing escape** | Confirm the output context (HTML body / attr / URL / JS / CSS). Confirm the value isn't already escaped upstream. Wrong-escape ≠ missing-escape. |
| **Missing sanitize** | Trace the value to its sink. Sanitization for storage ≠ sanitization for output. Storage sanitization matters when input shape matters or when the sink later doesn't escape. |

If verification fails, **drop the finding**. Note in the report's appendix: "Verified false: <pattern>, <reason>" — this saves the next auditor's time and shows your work.

**Counts are findings too.** Any number that appears in the report — call sites, occurrences, endpoints, LOC, handlers, queries — must come from a command whose output you captured, not from reading. Counting by eye is how `__()` "called 14 times" ships when it's called six (an accidental tally of the prefix, which happened to occur 17 times). A count is the cheapest thing a reader spot-checks: one wrong number and every other number in the report is suspect. If you can't produce the command that yields the figure, don't put the figure in the report — describe it qualitatively instead ("several", "throughout").

This phase exists because subagents and pattern scanners over-flag in WP. Full traps + procedures: `false-positive-traps.md`.

---

## Reproduce (optional, high value)

A code audit is a reading exercise, and often there's no environment — this phase is **optional and never a requirement**. But where you *can* run the code, a finding the reader can trigger themselves stops being a claim. It also surfaces what reading misses: a null cast to `(int) 0` that renders a confident "0 available" (an unconfigured dependency indistinguishable from a genuinely empty one) is obvious in a fixture and easy to read past in source.

Run this **after Verify, not instead of it.** Reproduction confirms a finding is real; only the Verify source trace explains *why*, and that trace still belongs in the report.

- **Build the smallest fixture that exercises the top findings.** Usually two or three records: a product with two variants, a membership with an expiring plan, a form with one conditional field, a booking that crosses a capacity boundary. Capture before/after (add one item → correct; add a second → the bug).
- **Put the fixture recipe in the report** — the exact records and settings — so the owner can reproduce it without you. Reference it from the finding (`**Reproduced.**`).
- **When reproduction isn't possible, say so and say what it costs:** name which findings remain traced-only, and state that they should be reproduced before *and* after any fix. An Info finding recording "audit was static, no environment reached" is appropriate.

---

## Report

### Where to write the report

The report contains vulnerability details. **Never let it leak into a public repo by accident** — the default of writing to the project root is unsafe in a git-tracked codebase.

**Always ask the user where to write the report before writing it.** Don't silently default to the root. Offer concrete options, with the safest first:

1. **`.claude/`** (create it if missing) — the convention for "important project context", and commonly git-excluded. Recommended default.
2. **A custom path** the user gives (e.g. somewhere outside the repo).
3. **The project root (CWD)** — only after confirming it won't be committed.

Before writing to any git-tracked location, check whether the report (or `<PREFIX>-*.md`) is matched by `.gitignore`. If not, warn the user inline and offer to add `<PREFIX>-*.md` to `.gitignore` first. Skip the question only if the user already specified a path in their request.

### Filename — keep history, never overwrite

Name the report `<PREFIX>-<yyyy-mm-dd>.md`. The prefix is `AUDIT` for a plugin (`AUDIT-2026-05-29.md`), `THEME-AUDIT` for a theme and `PROJECT-SECURITY-AUDIT` for a project. Re-audits on a later day produce a new dated file — the history is preserved for reference. If a file with today's date already exists (a second audit the same day), append a time suffix: `<PREFIX>-<yyyy-mm-dd>-<HHMM>.md`. **Never overwrite an existing audit report.**

Inline summary in chat: report path + verdict + counts + top-3-to-fix.

### Plain terms

**Reports describe the method in plain terms.** A report never names the audit skills (`wp-plugin-code-audit`, `wp-theme-code-audit`, `wp-project-security-audit`, `wp-plugin-audit-remediation`) or the skills' own scripts and working files, and carries no process notes (model tiers, how the run was split, "single-model run"). Say what was done instead: "a component inventory", "known-vulnerability lookups at production versions", "core files against the official wordpress.org checksums". External tools and data sources the evidence rests on stay named, because a reader can rerun or check them: PHPCS/WPCS, PHPStan, Plugin Check, Theme Check, `composer audit`, `npm audit`, WPVulnerability, Wordfence, Patchstack, OSV, the wordpress.org APIs, php.net. The audited code's own files (its deploy scripts, its `composer.lock`) are evidence and stay. Tool output is cited by tool name, version and counts, never by an internal file path.

The Summary's findings table lists every finding by its permanent ID, one row each, in severity order; it is an index into the Findings section, not a second numbering. It has no effort column: effort estimation is out of scope for the audit. Category is security, performance, standards or integration.

### TL;DR

**Every report opens with a TL;DR.** It is the first section, directly under the title and above the verdict and counts block, written so the owner can forward it on its own to stakeholders or a customer. About 20 lines at most:

- **Overall:** one sentence stating the verdict in plain words.
- **What needs attention now:** 3 to 5 bullets, the most serious issues in plain language: what is wrong, why it matters, and who could exploit it in plain terms ("anyone on the internet without logging in", "logged-in authors").
- **What is in good shape:** 2 to 3 bullets, verified positives only.
- **Recommended next steps:** 3 to 5 numbered actions, containment first.
- **At a glance:** one line with the counts per severity and where the most serious issues sit.

Writing rules: no finding IDs; no file paths or code identifiers beyond what a non-technical reader needs (a site path such as `/legacy/` is fine); no plugin internals, attack mechanics or payloads; no internal tool, skill or audit-process words. Every claim traces to a verified finding in the report body, and a positive appears only when it was verified. Plain, calm tone, no alarmism. It must stay accurate when forwarded without the rest of the report. The TL;DR is the report's plain-language summary; the Summary section below it does not repeat it.

### Fix guidance by ownership

Report every finding in full, whoever owns the code. The fix line depends on ownership, which Discover already captured as distribution and update channel. For third-party code, never make "edit the plugin's files" the fix: the next update overwrites it.

| Ownership | Fix line says |
|---|---|
| **Own code** (the owner maintains the plugin) | The code change. |
| **Third-party, distributed** (wp.org, vendor updater, marketplace, VCS package) | Update to the fixed version when one exists. When none exists: report to the author (see Recommendation for the disclosure path), and mitigate without touching the plugin's files: turn off the affected feature or module, deactivate or remove the plugin, block the route at the edge or WAF, or neutralize it from a site-owned mu-plugin through the plugin's own hooks. Say explicitly that edits to the plugin's files are overwritten on the next update. |
| **Third-party, committed or already modified** (vendor code checked into the site's repo, or a copy with local changes) | As above, plus: this copy is already outside the vendor's update path. A local patch is possible, but it is a fork that must be re-applied after every vendor update. Recommend returning to a managed source, and record any local patch as a fork. |
| **Third-party, abandoned or closed** (closed on wp.org, author unreachable, vendor compromised) | Replace or remove; mitigate until then. |

A temporary local patch to third-party code is acceptable only as a stopgap for a Critical with no update and no other mitigation. The fix line then says it is temporary, names the files touched, and says it is lost on update.

### Finding IDs are permanent

Findings are numbered within severity: C1, H1, M1, L1, I1. **Allocate an ID once and never reuse or renumber it. IDs are labels, not positions.** The moment anything outside the report references a finding (a generated HTML or PDF, the owner's tracking spreadsheet, an email, a ticket, the remediation log), renumbering makes "M11" ambiguous with no way to tell which finding was meant. Reports do change (a re-audit, a finding dropped after tracing it properly, a section rewritten), and the default behaviour on change is to renumber and let every derived artifact silently disagree.

- **A dropped finding does not free its number.** The number stays retired and is never reused.
- **A finding that changes severity keeps its original ID.** It is not moved into the new severity's numbering: an ID that survives its own severity change is far more useful than one that reads tidily.
- **New findings take the next unused number in their severity, even if that leaves gaps.** Leave gaps silent: never renumber to close them, and never explain them in the report.

**The report states the current state only.** Each finding carries its current severity with its rationale. How the report got there does not appear in it: no severity-change notes ("was High, now Critical", "ID kept"), no withdrawn or superseded entries, no mapping to a previous version's IDs, no reference to a previous report file, no "overridden" or "corrections made during review". That history (withdrawn, superseded and re-rated findings, with dates and reasons) is recorded in the remediation log (`wp-plugin-audit-remediation`) or the auditor's working notes. The report may list the audit runs themselves (date and what each run covered), because that tells the reader what the findings are based on.

Remediation-discovered findings get their own namespace, not the next audit number — see `wp-plugin-audit-remediation`.

---

## Severity Rubric

Each finding in the report gets a traffic-light emoji + severity tag in its heading (e.g. `### 🔴 CRITICAL — C1: …`). The emoji is for fast scanning; the tag is the canonical level.

| Severity | Emoji | Rule of thumb | Examples |
|---|---|---|---|
| **Critical** | 🔴 | Exploitable from the network with low / no privilege; remote code execution; auth bypass; data loss; **OR** destructive / business-critical action reachable by the lowest-privilege authenticated role (Subscriber / Customer — roles auto-granted on registration or checkout on most WP sites); **OR** silently corrupts data the plugin is the system of record for, cumulatively, in a way that cannot be reconstructed from other data the site holds — regardless of the privilege required to trigger it. | Unauthenticated SQLi; arbitrary file upload via REST; `eval()` on user input; auth bypass on admin action; arbitrary file read via path traversal; **subscriber-exploitable AJAX that overwrites product catalog / generates billing documents / exports private data / sends emails on the site's behalf**; SSRF reachable by any authenticated user; **a refund handler that silently decrements true stock on every refund with no way to rebuild the real quantity; a backup routine that silently backs up nothing**. |
| **High** | 🟠 | Exploitable with auth but below the privilege required for the impact; data integrity; CSRF on destructive admin actions; persistent XSS by editor+; sensitive info disclosure; missing activation hook (data loss); plaintext credential storage. | Editor-exploitable destructive action (Editor cap doesn't include `manage_options` but the action requires it); capability check missing on settings save when only admins can reach the form; deserialization on stored editor-writable meta; API keys in plaintext in `wp_options` autoloaded; missing nonce on destructive admin-ajax that already has correct cap check. |
| **Medium** | 🟡 | Reliability / fragility / hardening; functionally exploitable only in narrow scenarios. | Query builder counter desync; SQL builder fragile under refactor; transient with no TTL; option `autoload=yes` for large blob; reflected XSS only in admin-self context; hard `die()` returning plaintext from an AJAX endpoint (info disclosure + breakage). |
| **Low** | 🟢 | Code smell with no realistic exploit path; standards violations that don't change behavior; cosmetic. | Hardcoded table names; non-prefixed names that don't currently collide; missing `wp_set_script_translations` despite shipped `.pot`; integer cast missing on `$_REQUEST['id']` that goes to a function that handles non-int gracefully. |
| **Info** | ⚪ | Observations / suggestions; not bugs. | "No PHPStan config"; "uninstall hook leaves tables — acceptable; document"; "Plugin header missing optional fields". |

### Subscriber-exploitable rule (critical)

If you are tempted to call a finding **High** because it requires authentication, ask: **what role is required?**

- Subscriber / Customer / any auto-granted role → treat as **Critical**. On most WordPress sites with WooCommerce, BuddyPress, bbPress, course / membership plugins, or open registration, getting a Subscriber account is trivially obtained (account creation at checkout, free signup, etc.). Treat Subscriber-reachable destructive actions the same as unauthenticated.
- Editor / Shop Manager / similar elevated-but-not-admin → **High**.
- Admin / `manage_options` → CSRF (missing nonce) is **High**; capability check alone makes destructive actions **not** Critical.

Distribution amplifier: if the plugin has no update channel (private, no `Update URI`), bump anything Critical/High that requires an author fix by half a level in the verdict reasoning — the site owner can't auto-patch.

### Silent-corruption rule (critical)

The privilege axis above asks *who can trigger this?* — the right question for a finding that **exposes** data. It is the wrong question for a finding that **writes wrong data**, where the worst case is the site owner doing their job correctly while the plugin quietly records the wrong value. For those, don't ask who can trigger it. Ask three questions:

1. **Is the wrong state visible?** Does anything surface it — an error, a notice, a log line, an admin warning, an email — or nothing at all?
2. **Does it accumulate?** A one-off bad row, or a little more drift on every operation?
3. **Is it reconstructible?** Can the correct value be rebuilt from other data the site still holds (order history, an upstream source, an audit log)?

**Silent AND cumulative AND unreconstructible → Critical**, regardless of the privilege required to trigger it. All three conditions must hold: any one of them false drops the finding back to the ordinary data-integrity ladder (High for a genuine integrity bug, Medium for reliability / desync). A site can run for weeks accumulating drift before anyone notices, and by then the original values are gone.

This only reaches Critical when the plugin is the **system of record** for the corrupted data (see Discover) — it owns the authoritative copy. A plugin that renders someone else's data wrongly is a display bug, not silent corruption; the authoritative value is still intact upstream. The purest example isn't commerce: a backup plugin that silently doesn't back up has no attack surface at all and can still end a business.

### Owner-decision findings (`[DECISION]`)

Some findings aren't defects. The code is doing something defensible, a *different* defensible thing is also possible, and only whoever holds authority over that trade-off can choose. Engineering cannot close these, and listing them next to real defects implies it can. Marking them turns a report from "here are N problems" into "here are N−k problems and k questions for you" — a more actionable thing to hand someone.

"Owner" is deliberately role-neutral. Depending on the engagement it's the developer auditing their own plugin, the client who commissioned the work, another developer who owns the subsystem, the product owner, the site owner, or a compliance contact. Don't assume an agency-and-client shape — often the owner is the person reading the report.

Common shapes (none domain-specific): **exposure** (should this be visible to end users at all?); **override** (silently overrule an explicit human setting, or refuse and explain?); **degradation** (is this failure mode acceptable under load, or is hardening worth its cost?); **retention** (what happens to the data on uninstall — is any of it personal data?); **fail open or fail closed** (when a dependency is unavailable, block or let through?); **model choice at an integration boundary** (two valid representations, wrong pick expensive to reverse).

Mark and collect:

- **Marker.** Append the text token `[DECISION]` to the finding heading (keep its severity emoji + ID), and put a one-line callout directly under it. Text, not a glyph — it stays greppable without unicode (`grep '\[DECISION\]' *AUDIT-*.md`), reads distinctly from the severity emoji rather than as a sixth level, and survives conversion to HTML / PDF / email where emoji coverage is inconsistent.

  ```markdown
  ### 🟡 MEDIUM — M5: `file.php:line` — short title [DECISION]

  > **[DECISION] Needs a decision from the owner.** <the question, in one sentence> Default if unanswered: <what current behaviour does>.
  ```

- **Collected section.** A `## Decisions needed from the owner` table immediately before `## Recommendation`, plus the pointer line in the summary block at the top of the report.

Rules that keep the class useful rather than a dumping ground:

- **Non-critical by construction.** If the current behaviour is outright *wrong*, it's a defect — give it a real severity, not a decision marker. This class is for genuine forks in the road.
- **Doesn't move the verdict on its own** (see Verdict Rules) — but an unanswered decision can block *other* work. Record which findings each one blocks; call out any that block everything.
- **Every one states its default.** What happens if no answer arrives. "We kept current behaviour" must be an explicit choice, not a silent one.
- **Not a parking lot.** If the answer is knowable from the code, it isn't a decision — it's a finding you haven't finished. Resolve it.

---

## Verdict Rules

| Findings | Verdict |
|---|---|
| Any **Critical** | **NO-GO** |
| ≥3 **High**, OR any High that's network-exploitable with low privilege | **NO-GO** |
| 1–2 **High** + Medium / Low | **GO WITH FIXES** (Highs become top-3-to-fix-first) |
| 0 High, only Medium / Low, total > 5 | **GO WITH FIXES** |
| 0 High, 0 Medium, or total ≤ 5 with no High | **GO** |

State the verdict + two-sentence reasoning. Reader should know why.

`[DECISION]` findings don't enter this table — they're questions, not defects, and can't be closed by engineering. But if an unanswered one blocks other work (e.g. it gates all integration until resolved), say so in the reasoning; the verdict can be GO WITH FIXES while a decision still blocks the fix.

Every audit ends in GO / NO-GO / GO WITH FIXES; "it depends" is not a verdict. The top-3-to-fix-first list has exactly three items.
