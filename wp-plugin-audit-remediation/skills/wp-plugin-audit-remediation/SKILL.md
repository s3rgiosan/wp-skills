---
name: wp-plugin-audit-remediation
description: >
  Use after a WordPress plugin code audit, when findings are being fixed and
  someone needs to track and verify the remediation. Triggers: "remediation
  log", "track the fixes", "where are we on the audit findings", "after the
  audit", "the audit report is done, now what", "prove this refactor is
  behaviour-neutral", "is this rename safe", "did phpcbf change behaviour",
  "verify this change is formatting-only", "mark this finding fixed", or any
  request to record what changed against audit findings, keep the report's
  citations readable while fixing, or confirm a mechanical change didn't alter
  behaviour. Companion to wp-plugin-code-audit.
---

# WordPress Plugin Audit Remediation

The audit report is not the end of the engagement — it's the start. Findings get fixed, the owner needs to know what changed and how it was verified, and some findings turn out to be blocked on decisions only they can make. This skill covers what happens **after** `wp-plugin-code-audit` produces its report.

> **Scope:** the remediation phase of a plugin audit — maintaining the remediation log, keeping the report's citations readable as code changes, and proving mechanical changes are behaviour-neutral. It does **not** re-run the audit (that's `wp-plugin-code-audit`) and it does **not** invent new findings; it tracks and verifies the fixing of findings already in a report.

> **Prerequisite:** an audit report (`AUDIT-<yyyy-mm-dd>.md`) with severity-tagged findings, ideally including any `[DECISION]` owner-questions. If there's no report yet, run `wp-plugin-code-audit` first.

---

## The two rules that earn their place

Neither is obvious until it bites. Both are cheap. Do them **before** the first fix lands.

### 1. Freeze an immutable copy of the audited version

Every `file.php:line` citation in the report stops resolving the moment fixing starts. Rename a class, add a guard, run a formatter — the report's line numbers point at nothing. If the plugin is renamed wholesale, even the *filename* in every citation is wrong. The report becomes unreadable exactly when people need to read it.

**Before any fix**, copy the audited tree verbatim, next to the report, and never touch it again:

```bash
# From beside the report. <slug>/<version> = exactly what was audited.
cp -R path/to/plugin "AUDITED-<slug>-<version>/"
# Or, if the audited source was a git checkout, record the commit instead of copying:
git -C path/to/plugin rev-parse HEAD > AUDITED-<slug>-<version>.sha
```

Now `AUDITED-foo-1.4.2/includes/Sync.php:118` in the report resolves for the life of the document, no matter what the working tree becomes. Costs one file copy.

Reference every finding's citation against the frozen copy in the remediation log, and note the *current* location separately once it moves.

### 2. Prove behaviour-neutrality — don't claim it

"I only renamed things" / "it's just a formatter run" is exactly the kind of change where the claim is a hope, not a fact. A rename touching folder, class, meta keys, header, form fields and every string is one refactor away from silently changing behaviour. An auto-fixer flipping `==` to `===` is a behaviour change wearing a formatting change's clothes.

Turn the claim into a measurement by comparing PHP **token streams** before and after, with whitespace and comments excluded. See `references/behaviour-neutrality-check.md` for the script and workflow. In short:

- Tokenize both versions, drop `T_WHITESPACE` / `T_COMMENT` / `T_DOC_COMMENT`, diff the arrays.
- A true rename shows only the renamed identifiers changing — every removal/addition explainable in a sentence.
- A `phpcbf` run that only moved comments/whitespace shows an **empty** diff → safe to accept.
- Anything else (an operator changed, a call reordered, a default altered) shows up as a token the rename can't explain → not neutral; treat as a real code change and re-verify against the finding.

Use it to gate: renames, formatter/`phpcbf` runs, and any "mechanical" refactor claimed not to change behaviour.

---

## The remediation log

A companion document to the audit report — usually `REMEDIATION-<yyyy-mm-dd>.md` beside it — that answers "where are we?" without re-reading thirty findings. Write it to the same non-public location as the report (it names vulnerabilities and their fix state; never let it land in a public repo). Keep a dated history the same way the audit report does; never overwrite.

Its job: one row per finding, each carrying status, what changed, how the change was verified, and — for `[DECISION]` findings — what it's waiting on.

Full template: `references/remediation-log-template.md`. Status vocabulary:

| Status | Meaning |
|---|---|
| **Open** | Not started. |
| **In progress** | Being worked; note who / where. |
| **Fixed (verified)** | Changed *and* re-verified against source — cite the new `file:line` and how you confirmed (the same verification discipline the audit used; a behaviour-neutrality diff if the fix was mechanical). |
| **Fixed (unverified)** | Change made but not yet re-checked. A transient state, not a resting one — it must become Fixed (verified) or go back to Open. |
| **Won't fix (accepted)** | Owner accepts the risk. Record who accepted and the stated reason. |
| **Blocked on owner** | A `[DECISION]` finding, or any fix gated on an owner choice. Record the exact question and the default-if-unanswered (carry these straight over from the report's "Decisions needed from the owner" table). |

Rules:

- **Fixed means re-verified, not edited.** A finding is only Fixed (verified) once the change is confirmed against source the way the audit confirmed the finding. If the fix was a rename or a formatter run, "verified" includes a clean behaviour-neutrality diff.
- **Owner-blocked findings stay visible over time.** They don't silently disappear or get marked done — they carry their question and default until the owner answers. When answered, record the decision and the resulting change.
- **Cite both the frozen and current location.** The report's citation points at the frozen copy; the log adds where the code lives now.
- **The log is the source of truth for "where are we?"** Keep it current as fixes land, so nobody has to reconstruct state from the diff.

---

## Handing back

When remediation is done (or paused), the log tells the owner exactly three things at a glance: what's fixed and verified, what they still owe a decision on, and what was accepted as-is. That's the deliverable of this phase — the thing that survives after the fixes are in.

---

## References

- `references/behaviour-neutrality-check.md` — the token-stream diff script + workflow for proving renames / formatter runs / mechanical refactors changed no behaviour.
- `references/remediation-log-template.md` — the `REMEDIATION-<yyyy-mm-dd>.md` companion-document skeleton.

## Related skills

- `wp-plugin-code-audit` — produces the audit report this skill remediates against. Run it first.
