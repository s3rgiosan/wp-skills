# Stacking Multipliers

The multiplier table itself lives in `SKILL.md`. This file covers how to apply
those values in sequence and what the arithmetic looks like end to end.

---

## Order of operations

1. **Pick the base** from the task-taxonomy row (see `wordpress.md` / `react.md`),
   positioned within the row's range by scope alone — see "Picking the base from
   a table range" in `SKILL.md`.
2. **Apply the codebase-quality factor**, multiplicatively. Exactly one applies —
   see "Which factors compete" below.
3. **Apply stack-specific risk factors** from the reference files,
   multiplicatively. These are environment and context factors independent of
   codebase quality, so they stack on top of step 2.
4. **Apply the percentage General Multipliers** on top of that result, in any
   order — they commute. Despite being written as `+20–30%`, these **chain
   multiplicatively**: two +25% factors give ×1.25 × ×1.25 = ×1.5625, not +50%.
   Convert each to its decimal form and multiply.
5. **Check the sanity gate** — see "Total multiplier over 3×" below.
6. **Round once, at the very end**, using the rounding ladder in `SKILL.md`.
   Keep one decimal through every intermediate step.

In an estimate with many tasks, run these steps per task (see "Multi-task
estimates" below). For agentic delivery, the agentic factor and the agentic
effort floor from `agentic-delivery.md` apply before the rounding in step 6, and the
agentic factor stays out of the gate in step 5.

Steps 2–4 are all multiplicative, so the order between them doesn't change the
result — it's written this way to make the reasoning legible and to make the
one rule that *does* matter hard to miss: exactly one codebase-quality factor
applies.

## Which factors compete

Only one **codebase-quality** factor may apply. These describe the same
thing — how bad the code you're working in is — so taking more than one counts
it twice:

- "Existing codebase, clean" (×1.1–1.3) and "Legacy / messy" (×1.5–2.0) from the
  General Multipliers
- **Page-builder debt** (×1.5–2.0, `wordpress.md`) — also a codebase-quality
  factor. If legacy already applies, take the worse of the two, don't stack them.

Everything else stacks. **Multisite (×1.5) is not a codebase-quality factor** —
a pristine multisite is still multisite, so it applies on top of whichever
codebase row you picked. Same for plugin conflicts (+20–50%), classic-editor
checks, WP-version locks, and the rest of the stack-specific risk lists.

## Multi-task estimates: apply multipliers per task

When one estimate holds many tasks (a backlog, a full build), run the order of
operations above once per task. Apply each General Multiplier only to the tasks
whose work its condition changes:

| Multiplier | Applies to | Does not apply to |
|------------|-----------|-------------------|
| Multi-language / i18n | Templates, patterns, navigation, blocks with user-facing strings, emails, content copied per language | Scaffolding, build tooling, data-only work (for example a block bindings source) |
| Accessibility (WCAG AA) | UI work | Tooling, data plumbing |
| No design provided | The tasks that lack a design | Tasks that have one |

A blanket multiplier across every task overstates setup and data work. The
competing rule still holds per task: each task takes exactly one
codebase-quality factor (×1.0 for tasks that work in no existing code), and the
3× sanity gate is checked per task.

## Total multiplier over 3×

After stacking, divide the pre-rounding result by the base. **If the compounded
multiplier exceeds 3×, stop — this is an XL in disguise.**

Several compounding risk factors (legacy + multisite + plugin conflicts, say)
mean the *environment* dominates the cost rather than the task, and that is
precisely the case the task tables cannot size reliably.

Do not cap the number — a genuinely awful legacy multisite may really cost 5×.
Instead:

- Re-tier the task as **XL**
- Recommend a spike/discovery ticket, per the Recommendations rules in `SKILL.md`
- State the compounded multiplier explicitly, so the reader sees what drove it

The gate doesn't dispute a large number. It says a number that large deserves a
spike to confirm rather than a commitment to deliver.

## Do not double-count

A condition that has its own multiplier must not also have moved the base within
the table range. Missing design, accessibility, tests, legacy debt, and i18n are
all multipliers — if you already pushed the base to the high end of the row
"because there's no design", remove one of the two.

The same applies to findings from a repo scan: observed legacy debt *replaces*
the generic legacy multiplier guess, it doesn't add to it (see
`codebase-sizing.md`).

## Worked example

Task: a server-rendered dynamic Gutenberg block. Clean existing codebase, no
design provided, WCAG AA required, unit tests required.

```
Base: react.md → "Dynamic block (server-rendered)" = 6–12 hrs
      Task matches the row's typical scope → midpoint = 9.0

9.0  × 1.2  (clean codebase)      = 10.8
10.8 × 1.25 (no design, +25%)     = 13.5
13.5 × 1.20 (a11y WCAG AA, +20%)  = 16.2
16.2 × 1.30 (tests, +30%)         = 21.1

21.1 is ≥ 16, so convert to days: 21.1 / 8 = 2.64
Round to nearest half-day        → ~2.5 days (20 hrs)
```

Note the base stayed at the midpoint even though design was missing — that cost
is carried by the +25% multiplier, not by the base position. Moving the base up
*and* applying the multiplier would have counted it twice.
