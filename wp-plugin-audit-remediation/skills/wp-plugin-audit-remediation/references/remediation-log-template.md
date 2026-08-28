# Remediation Log Template

The `REMEDIATION-<yyyy-mm-dd>.md` companion to an audit report. Write it beside the report, in the same non-public location (it names vulnerabilities and their fix state). Keep a dated history; never overwrite a previous day's log.

---

```markdown
# Remediation: <Plugin Name> — against AUDIT-<yyyy-mm-dd>.md

**Audited version (frozen):** `AUDITED-<slug>-<version>/` (or commit `<sha>`)
**Report:** `AUDIT-<yyyy-mm-dd>.md`
**Last updated:** <yyyy-mm-dd HH:MM>

**Finding IDs:** audit IDs (C/H/M/L/I) are permanent and come only from the report — never renumbered here. Defects found *during* remediation use the **`N` prefix** (`N1`, `N2`, …), declared below; they exist only in this document. ID coverage checked with `references/id-coverage-check.md` on every update.

**N-findings (discovered during remediation, not in the audit):**

- **N1** — <short title> — <what it is / where found>
- **N2** — …

## Status at a glance

- Fixed (verified): N of M findings
- Blocked on owner: N (see below — these gate the rest / are free-standing)
- Won't fix (accepted): N
- Open / in progress: N

## Findings

| ID | Severity | Status | What changed | Verified how | Current location |
|---|---|---|---|---|---|
| C1 | 🔴 Critical | Fixed (verified) | Added `check_admin_referer` + cap gate on the settings save. | Re-read source; confirmed nonce + `manage_options` both present and the old path unreachable. | `includes/Settings.php:212` |
| H1 | 🟠 High | Fixed (verified) | Renamed `Foo` → `Acme_Foo` across the plugin. | Behaviour-neutrality diff: only the renamed identifiers changed (see `references/behaviour-neutrality-check.md`). | `includes/class-acme-foo.php` |
| H2 | 🟠 High | Blocked on owner | — | — | (see Decisions) |
| M3 | 🟡 Medium | Won't fix (accepted) | — | Owner accepts: legacy option kept for a downstream integration. Accepted by <role>, <date>. | `includes/Options.php:44` |
| M5 | 🟡 Medium | Open | — | — | — |
| I3 | ⚪ Info | Superseded | Environment became reachable; Highs reproduced. | Not an error — situation moved. Replaced by the H1–H4 repro captures. | (see report appendix) |
| N1 | 🟢 Low | Fixed (verified) | Defect spotted while fixing H1; guarded the same input on the sibling path. | Re-read source; input now sanitized on both paths. | `includes/Sync.php:88` |

## Decisions still owed by the owner

Carried from the report's "Decisions needed from the owner" table; kept here until answered.

| ID | Question | Default if unanswered | Blocks | Answer / decision |
|---|---|---|---|---|
| H2 | Fail open or fail closed when the upstream API is unreachable? | Fails open — operation proceeds. | Blocks all integration fixes until resolved. | *(pending)* |
| M6 | Drop custom tables on uninstall, or leave them? Personal data? | Tables left in place. | Free-standing. | *(pending)* |

## Notes

- Citations in the report resolve against the frozen copy `AUDITED-<slug>-<version>/`. The "Current location" column tracks where each finding's code lives now.
- Every "Fixed (verified)" row was re-checked against source, not just edited. Mechanical fixes (renames, formatter runs) carry a behaviour-neutrality diff as their verification.
```

---

## Filling it in

- **Start it before the first fix**, with every finding at **Open** and the frozen-copy path recorded — so the log exists the moment code starts moving.
- **One row per finding**, keyed by the report's finding ID (C1, H1, M5, …). Don't renumber; the IDs are the shared vocabulary between the two documents.
- **"Verified how" is mandatory for any Fixed row.** If you can't say how it was confirmed, it's Fixed (unverified) at best — a transient state, not a resting one.
- **Owner-blocked and accepted findings never disappear.** They stay in the table with their reason/question so the history is honest about what was chosen versus fixed.
- **New defects found while fixing are `N`-prefixed and declared at the top**, never given the next audit number — an `L10` in this log invents a finding the reader's frozen report doesn't have.
- **Run the ID-coverage diff on every update** (`references/id-coverage-check.md`). A 34-row table scans as complete when it isn't; the both-ways diff catches the finding silently dropped and the ID that shouldn't exist.
