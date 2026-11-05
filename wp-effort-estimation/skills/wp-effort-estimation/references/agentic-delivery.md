# Agentic Delivery

Use this file when coding agents (for example Claude Code) write the code and a
lead engineer specifies, reviews and verifies it, and the estimate counts only
the lead engineer's hours.

The agents' own time is not counted. Agent cost (subscription, tokens) is a
separate line in the proposal and stays out of the hours.

---

## Formula

```
lead-engineer hours = hand-coded base × agentic factor × multipliers that apply to this task
```

- **Hand-coded base** — the normal table row from `wordpress.md` / `react.md`,
  positioned by scope exactly as "Picking the base from a table range" in
  `SKILL.md` describes.
- **Agentic factor** — default **×0.5**. It is an assumption: calibrate it with a
  spike (see below), log actuals against it, and adjust it when variance exceeds
  30%, per the Calibration section in `SKILL.md`.
- **Multipliers** — only the ones whose condition changes this task's work (see
  "Multi-task estimates" in `multipliers.md`).
- **Agentic effort floor** — the final figure, after multipliers, is at least
  **1.5 h** per task, because any task needs a brief, a review and a check.
  When the task's hand-coded figure (base × multipliers) is below 1.5 h, use
  the hand-coded figure: the lead engineer codes that task by hand.

The agentic effort floor is separate from the half-day duration floor in
`SKILL.md`, which applies to wall-clock time.

Round once, at the end, with the rounding ladder in `SKILL.md`. The tier
comes from the task's shape and its hand-coded row.

The agentic factor describes how the work is delivered, so it stays out of the
3× sanity gate: compute the compounded multiplier from the multipliers alone.

## What the factor covers

| Share of the factor | Work |
|---------------------|------|
| About 1/3 | Review and steering of the agent's pull requests, over about two rounds |
| About 1/5 | Verification: comparison with the design or prototype, editor parity |
| The rest (about half) | Writing the spec or brief and the acceptance criteria |

The low end of the Confidence Range uses this split. When S and M tasks pass
review in one round, half the review share drops: take **a sixth** off their
hours. L tasks keep both rounds. The agentic effort floor still applies to the
low end. A task coded by hand because its hand-coded figure is below the floor
has no agent review to halve: it keeps its hours at the low end.

## Start from the task's row

A flat allowance per tier ignores the row's range. Take, for example, a flat M
allowance of 5 h and multipliers of ×1.5:

| Row | Flat allowance | From the row |
|-----|----------------|--------------|
| Cheap M row, 4–8 hrs (hand-coded midpoint 6.0) | 5 × 1.5 = 7.5, above the hand-coded midpoint | 6.0 × 0.5 × 1.5 = 4.5 |
| Dear M row, 8–16 hrs (hand-coded midpoint 12.0) | 5 × 1.5 = 7.5, understated | 12.0 × 0.5 × 1.5 = 9.0 |

Start from the task's own row and position, and apply the factor to that.

## Small tasks save little

On S rows, writing the brief and reviewing the result cost about as much as doing
the work by hand, and the agentic effort floor reflects that. An S task that
comes out close to its hand-coded figure is expected.

## Untiered own work

Some tasks are the lead engineer's own work. Size them in hand-coded hours, with
no agentic factor, and list them outside the tiered tasks. Untiered own work
keeps its hours at the low end: it has no agent review to halve.

| Task | Sizing guide |
|------|--------------|
| Environment setup: local sites, staging, deploy pipeline | Hand-coded hours for the steps the project needs. A local site from an existing database dump: about 1 hr. |
| Agent-workflow setup: repository instructions for agents, brief and acceptance-criteria templates, capture or parity scripts against the design | About 1–1.5 days on a large build when the capture or parity scripts are written for this build. When they already exist (a design-to-theme skill or an earlier project ships them), size only what is left in hand-coded hours: the repository instructions, the brief and acceptance-criteria templates, and pointing the scripts at the design's pages. Usually 2–3 hrs. |
| Launch: cutover, redirects check, post-launch fixes | Hand-coded hours for the steps the project needs. |

Apply a multiplier here only when its condition changes this work, which is rare:
multi-language and accessibility rarely touch tooling.

Existing tooling removes the work it covers, so the task moves to a smaller
size: hand-coded hours for what is left. The logic is the same as "When prior
art is overwhelming, reclassify — don't discount" in `codebase-sizing.md`.

## Risks specific to agentic delivery

List these in "Risks & Unknowns" when they apply, and carry their cost into the
high end of the range:

- **Extra review rounds on interactive tasks** — the review share covers two
  rounds, so two extra rounds cost the task's whole review share (about a third
  of its agentic hours), and one extra round costs half of it.
- **Parallel pull requests touching shared files** (`theme.json`, the header, a
  shared card component) — integration work, sized as a small fixed amount per
  task, for example 0.25 h × the number of tasks.
- **A component that cannot be shared between two rendering paths** (for example
  server-rendered markup and a client-rendered list) — built twice; add about
  half of the component's agentic hours (after multipliers) a second time. The
  second build reuses the brief and acceptance criteria, so only review and
  verification repeat.

## The spike

Before committing, recommend a short spike (a few days) that builds the riskiest
tasks with agents and logs the lead engineer's hours against their estimates.
Recalibrate the agentic factor from the result, then commit the full estimate.

When the request already contains the specs, briefs and acceptance criteria
(for example a PRD with per-sprint briefs and a test catalogue), most of the
brief-writing share is spent. Keep ×0.5 in the headline, say so in
Recommendations, and let the spike measure the lower factor.

## Worked example

Acme Corp, a greenfield block-theme build (codebase factor ×1.0). The site ships
in two languages and requires WCAG AA. Agentic delivery, default factor ×0.5.

```
Task 1 — event listing block (M)
Row:   react.md → "Dynamic block pulling CPT / taxonomy data" = 8–16 hrs
       Typical scope → midpoint = 12.0
12.0 × 0.5  (agentic)                = 6.0
6.0  × 1.20 (a11y, +20%)             = 7.2
7.2  × 1.30 (multi-language, +30%)   = 9.4  → ~10 hrs
Full multi-language row: the block shows an upcoming-events count that its
own code computes per language.
Low end, one review round: 9.4 × 5/6 = 7.8

Task 2 — custom block bindings source (M, data only)
Row:   react.md → "Register a custom binding source" = 4–8 hrs, midpoint = 6.0
6.0  × 0.5  (agentic)                = 3.0  → ~3 hrs
No a11y: the task renders no UI. No multi-language: it outputs no strings,
and the multilingual plugin already scopes its query.

Task 3 — block style variation (S, floor case)
Row:   react.md → "Block style variations" = 1–3 hrs, midpoint = 2.0
2.0  × 0.5  (agentic)                = 1.0
1.0  × 1.20 (a11y, +20%)             = 1.2
Below the floor                      → 1.5 hrs (low end also 1.5)
```

An L task in the same build (for example "Interactive block with shared store
state") follows the same arithmetic but keeps both review rounds at the low end.
