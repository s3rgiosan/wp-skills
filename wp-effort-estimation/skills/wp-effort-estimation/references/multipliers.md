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
| Multi-language / i18n | Templates, patterns, navigation, blocks with user-facing strings, emails, content copied per language | Scaffolding, build tooling, data-only work whose queries the multilingual plugin already scopes (for example a block bindings source) |
| Accessibility (WCAG AA) | UI work | Tooling, data plumbing |
| No design provided | The tasks that lack a design | Tasks that have one |

A blanket multiplier across every task overstates setup and data work. The
competing rule still holds per task: each task takes exactly one
codebase-quality factor (×1.0 for tasks that work in no existing code), and the
3× sanity gate is checked per task.

**Desktop-only designs.** When the designs cover desktop only, sections that
stack into one column in normal flow take no multiplier. Components that cannot
stack need their own small-screen layout, for example a header with a menu, a
filter panel, a wide data table or a carousel. If nobody will supply those
layouts, apply "No design provided" to those tasks only. If the layouts may
still arrive, leave the multiplier out of the headline: list it in "Risks &
Unknowns" and carry it into the high end.

**Scaling multi-language by output.** The +20–35% row prices the build work for
each language only: translatable strings, per-language setup, and a check in each
language. Translating the copy is out of scope (see "Baseline Assumptions" in
`SKILL.md`). Scale the row by what the task's code has to do per language:

| Task's language-dependent output | Multiplier |
|----------------------------------|------------|
| Code that handles per-language data itself: content copied per language, IDs mapped across languages, translated slugs in URLs, counts or totals the code computes per language itself | The full row (+20–35%) |
| Templates, patterns, navigation, emails | The full row (+20–35%): each language needs its own copy set up and checked, unless another party does that (see below) |
| Only user-facing strings, including queries the multilingual plugin already scopes to the current language and blocks that read the current post (which inherits its language) | ×1.1 |
| No strings, and any per-language data comes from queries the multilingual plugin already scopes | None |

When another party handles the per-language data (for example an API another
team builds, or a plugin that already returns per-language values), a task that
still outputs user-facing strings takes ×1.1, and a task without strings takes
none. When that split is still undecided, take the lower factor. In "Risks &
Unknowns", list the extra hours the full row would add, priced at the
multi-language factor the estimate uses for its full-row tasks.

When another party sets up each language's copy of the templates, patterns and
navigation in the multilingual plugin and checks each language (for example the
client's content team), those tasks take ×1.1 when they output user-facing
strings. Tasks whose own code handles per-language data keep the full row; when
no task's code does, no task takes it. State who sets up and checks each
language in "What's Included".

The ×1.1 is an assumption: log actuals against it per the Calibration section
in `SKILL.md`, and test it in the agentic-delivery spike when there is one.

When the request includes translating the copy, state it in "What's Included"
and list it as its own line, outside the development hours.

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
