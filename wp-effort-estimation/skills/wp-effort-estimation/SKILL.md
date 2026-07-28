---
name: wp-effort-estimation
description: >
  Use when asked how long WordPress work will take, when sizing or scoping a
  ticket, or when planning a sprint — covering pure WordPress (PHP/theme/plugin)
  and the React surfaces of WordPress (Gutenberg blocks, Interactivity API,
  block themes, headless WP like Next.js / Faust). Triggers: "how long",
  "estimate", "how complex is this", "can we do this in a day", "is this a big
  task", "how should I scope this", "break this down", sprint planning, ticket
  sizing, story points, t-shirt sizing, project planning for WordPress or
  React-in-WP work. Do NOT use for generic standalone-React projects with no
  WordPress involvement.
---

# Effort Estimation Skill

Produce structured effort estimates for WordPress development tasks — including
the React surfaces of WordPress (Gutenberg blocks, Interactivity API, block
themes, headless frontends). Always output three things: **Complexity Tier**,
**Hours/Days Estimate**, and **Confidence Range**.

> **Scope:** "React" in this skill always means React **in a WordPress context**
> (block editor, Interactivity API, admin UIs, headless WP). Generic
> standalone-React projects (no WP involvement) are out of scope — decline and
> redirect.

---

## Before You Estimate: Clarify if Needed

Before asking anything, silently answer this checklist from what's already in the request:

- **Work type** — feature / enhancement / bug fix / refactor / chore
- **Discipline** — front-end / back-end / both
- **Deliverable** — what concrete thing exists when the task is done

Most requests answer all three implicitly — do not re-ask what's already clear, and do not turn this into a mandatory intake. If any item is genuinely unclear, ask up to 2 clarifying questions before estimating. Do not produce a number when the spread would be meaninglessly wide — the threshold is **3× (high ÷ low)**, the same gate applied to the finished Confidence Range.

Good triggers to pause and ask:
- No clear deliverable ("build a membership system", "improve performance")
- Stack is ambiguous (WordPress + React could mean headless WP, an Interactivity API block, a custom Gutenberg block, or a wp-admin React app)
- Integration mentioned but API/provider unknown

**If the request specifies implementation detail** ("add a hook that…", "store it in a meta field") — keep it as background context, but estimate the described behavior and scope, not the supplied implementation. Note once that implementation choices don't change the estimate unless they change scope.

Ask the minimum needed to produce a useful estimate. One focused question is better than a checklist. Once you have enough, proceed.

---

## Output Format

Every estimate must include:

### 1. Complexity Tier
| Tier | What it means |
|------|--------------|
| **S** | Straightforward, well-understood task. Minimal unknowns. |
| **M** | Moderate scope. Some design decisions or integration work. |
| **L** | Significant scope. Multiple components, systems, or edge cases. |
| **XL** | High uncertainty or large surface area. Requires breakdown before dev starts. |

The tier comes from the **task's inherent shape** — the reference files' "Complexity Tier Mapping" — not from the final hours. Multipliers change hours, not the tier: a dynamic block on a clean codebase needing a11y and tests is still an M task that happens to cost more hours. When multipliers have pushed the number well past what the tier suggests, say so in one line, because the tier and the hours land in different ticket fields and a reader seeing "M / 5 days" needs to know why.

**One exception:** if the total compounded multiplier exceeds 3×, re-tier to XL and recommend a spike (see General Multipliers). At that point the environment — not the task — is driving the cost, which is itself an XL condition rather than an M task with a big number attached.

### 2. Hours/Days Estimate
Give a single specific number, e.g. "~6 hours" or "~3 days".

**Picking the base from a table range.** Reference rows give a range (e.g. 8–16 hrs). Default to the **midpoint**, then move within the range based on scope only:

| Position | When |
|----------|------|
| Low end | A narrower instance of the row — fewer controls/fields/states than the row assumes. Or strong prior art (see `references/codebase-sizing.md`). |
| Midpoint | **Default.** The task matches the row's typical scope. |
| High end | The ambitious edge of the row — many controls, many states, or genuinely net-new with nothing comparable to work from. |

Position within the range reflects **scope only**. Anything that has its own multiplier — missing design, a11y, tests, legacy codebase, i18n — must not also move the base, or you count it twice. State which row you used and where in it you landed.

**Rounding.** Round the headline only — precision scales with size, because "18.7 hrs" is false precision but "1 hr → 2 hrs" doubles a real task:

| Computed | Round to |
|----------|----------|
| < 2 hrs | nearest 0.5 hr |
| 2 to < 8 hrs | nearest 1 hr |
| 8 to < 16 hrs | nearest 2 hrs |
| ≥ 16 hrs | convert to days, nearest half-day |

One day = 8 hours throughout this skill, in both directions (table rows quoted in days, and hours converted to days by the row above).

Intermediate steps keep one decimal (see `references/multipliers.md`); Breakdown rows keep their own values and must sum exactly, so the headline can land slightly above **or below** the Breakdown total depending on which way it rounded. Both are correct — the table shows the arithmetic, the headline is the number being committed to. Never adjust rows to match a rounded headline.

**FE/BE split (optional):** when the task clearly spans both disciplines (dynamic blocks, admin UIs, headless features), split the total into front-end and back-end hours with a one-line rationale per side. Keep a single total for single-discipline work — forcing a split on a CSS tweak or a WP-CLI script adds noise, not information. See the reference files for which task types typically warrant a split.

### 3. Confidence Range
Give a best-case / worst-case spread, e.g. "4–10 hours" or "2–5 days".

Derive it from the risks you actually listed, not from a fixed percentage. Both ends move out from the **scope-positioned base** — the number you already picked within the row — not from the row's own edges. Multipliers stay applied in both directions: a clean-codebase or tests-required factor doesn't disappear in the best case.

- **Low end** — the base with none of your listed risks materializing, and scope landing at the lean edge of what you assumed. Slide down toward the row's low end only as far as scope is genuinely still open; when scope is pinned, the low end sits at or just under the base.
- **High end** — the base plus the plausible impact of the risks in "Risks & Unknowns". It may exceed the row's high end when the risks warrant it. If a risk has no effect on the number, it belongs in "What's Included", not "Risks".

Every risk driving the high end must appear in the Risks section, and every risk in that section should be visible in the spread. As a sense-check, the spread from base to each end is typically within about 30% for S/M and wider for L/XL — but derive it from the risks first and use this only to catch an outlier.

**If high ÷ low exceeds 3×, do not ship the estimate.** That is the vagueness gate from "Before You Estimate" firing late — the request was too vague to size and it surfaced here instead. Go back and ask a clarifying question, or recommend a spike. A 1–4 hr range on a 1 hr task is 4×; that's not a confidence range, it's an unasked question.

Some reference rows are themselves 3× wide (e.g. "1–3 days"). Quoting such a row end-to-end as the range trips this gate on its own, before any risk is added — that is the row telling you scope is unresolved, not a reason to relax the gate. Resolve it by pinning the scope: ask a clarifying question, or pick a narrower row if one matches better. Where the row is the only one that fits and the scope question can't be answered, that is an XL in disguise — recommend a spike rather than quoting the full width.

> **Ticket field guidance:** Use the **tier** for portfolio/roadmap views (S/M/L/XL is coarser and ages better). Use the **hours/days** for sprint commitment. Don't paste both into the same single-value field — pick one per field and put the other in the description.

---

## Estimation Process

1. **Classify the tech stack** — Is this pure WordPress (PHP/theme/plugin), React-in-WP (block editor, Interactivity API, headless WP), or both? MUST read the relevant reference file(s) before writing the estimate — baseline numbers and risk multipliers live there, not in this file.
   - WordPress (PHP) tasks → read `references/wordpress.md`
   - React-in-WP tasks → read `references/react.md`
   - Both → read both

2. **Identify task type** — What category does this fall into? (See reference files for task taxonomies.)

3. **Optional — codebase-aware sizing** — If the repo being estimated against is accessible, read `references/codebase-sizing.md` and do a light prior-art scan now, before the unknowns check — its findings feed directly into steps 4 and 5. Findings adjust the table baselines and multipliers; they never replace them. Skip entirely when no repo is available (pre-sales, triage) — the tables are the default path.

4. **Check for unknowns** — Flag anything that could expand scope:
   - New data structures required (post types, taxonomies, meta, options, custom tables) — usually the largest single increase; include migration/backfill implications for existing content
   - Third-party APIs or integrations
   - Design not finalized
   - Legacy codebase / tech debt
   - Performance or accessibility requirements
   - Multi-environment (staging, prod, CDN, etc.)
   - Cross-browser or mobile requirements

5. **Apply complexity multipliers** — table below; MUST read `references/multipliers.md` for stacking order and double-counting rules before applying them

6. **Write the estimate** using the template below

7. **Self-check before emitting** — Silently re-read the draft against this checklist and fix issues without narrating the check:
   - Is the confidence range within 3× (high ÷ low)? If not, stop and ask instead of shipping it.
   - Does every risk driving the high end appear in "Risks & Unknowns", and vice versa?
   - Did anything with its own multiplier also move the base within the table range? (double-count)
   - Is the total compounded multiplier over 3×? If so, this should be XL with a spike, not a committed number.
   - Does the Breakdown table actually add up, and is the headline a correctly-rounded version of its total (never the reverse)?
   - If the hours land well outside what the tier implies, is that explained in one line?
   - Is anything listed under "What's Included" actually a risk, or vice versa?
   - Is the stack classification still accurate given everything written?
   - Any file paths, function names, or hook names leaked into the output? (See `references/codebase-sizing.md` — findings inform reasoning, never appear verbatim.)

---

## Baseline Assumptions

- **Developer seniority:** Senior-level dev highly familiar with the stack. Flag if the task needs a migration-specialized senior dev (platform migration, custom DB schema, multisite, headless cutover, Woo subscriptions) — those warrant a separate spike or higher rate.
- **Scaffold:** Pre-configured project scaffold assumed (build tooling, CI, base theme/plugin shell). Greenfield multiplier stays at ×1.0.

---

## Estimate Template

```
## Effort Estimate

**Task:** [one-line description]
**Stack:** WordPress / React-in-WP / Both

**Complexity Tier:** [S / M / L / XL]
**Estimate:** ~[X hours / X days effort] / ~[Y days duration]
**Split:** [FE X hrs / BE Y hrs — one line on what drives each side]
*(Optional — include only when the task genuinely spans both disciplines.
Omit the line entirely for single-discipline work.)*
**Confidence Range:** [low]–[high] [hours/days]

### Breakdown
*(Required for M, L, XL tasks. Optional for S.)*
| Subtask | Side | Estimate |
|---------|------|----------|
| [step 1] | FE/BE | X hrs |
| [step 2] | FE/BE | X hrs |
| ... | ... | ... |
| **Total** | | **X hrs** |

*(Drop the Side column when not splitting FE/BE.)*

### What's Included
- [assumption 1]
- [assumption 2]

### Risks & Unknowns
- [risk 1 — impact on range]
- [risk 2 — impact on range]

### Acceptance Criteria
*(Optional. M/L/XL only, and only when the estimate will double as a ticket
description — skip for quick sizing questions and S tasks.)*
[2–4 tester-actionable bullets describing behavior, never implementation.
Each phrased as a concrete action + observable result. Cover: the happy path,
one conditional/branching case, one data or display verification.]

### Recommendations
*(Required for XL tasks. Optional for S/M/L.)*
[For XL: always recommend a spike/discovery ticket instead of committing to a full estimate.
For L: flag if the task should be broken into smaller tickets.
For S/M: omit or leave blank if nothing noteworthy.]
```

---

## General Multipliers (apply on top of base estimates)

| Condition | Multiplier |
|-----------|-----------|
| Greenfield (no existing codebase) | ×1.0 |
| Existing codebase, clean | ×1.1–1.3 |
| Legacy / messy codebase | ×1.5–2.0 |
| No design provided | +20–30% |
| Third-party integration (unknown API) | +50–100% |
| Accessibility (WCAG AA) required | +15–25% |
| Tests required (unit/e2e) | +25–40% |
| Multi-language / i18n | +20–35% |

Codebase-quality factor first (exactly one — page-builder debt competes with the legacy row), then stack-specific risk factors from the reference files, then the percentage factors above. The `+%` rows chain multiplicatively (+25% means ×1.25), they don't sum. A condition that has its own multiplier must not also have moved the base within the table range.

**If the total compounded multiplier exceeds 3×, it's an XL** — re-tier, recommend a spike, and state the multiplier. Don't cap the number; a genuinely bad legacy multisite may really cost 5×, but a number that large deserves a spike rather than a commitment.

**Read `references/multipliers.md`** for the full order of operations, which factors compete, the sanity gate, and a worked example.

---

## Effort vs Duration

The estimate is **effort** (focused dev time). **Duration** — wall-clock from ticket open to merge — is typically 1.5–2× longer due to code review, design handoffs, QA, deploy windows, and context switching. State both when the audience is a PM or client, not just engineers.

**Floor: half a day**, regardless of how small the effort is. A one-hour task still needs a review round and a deploy window, so it does not land in production in one hour. Apply the 1.5–2× ratio above the floor, never below it.

Example output: `~8 hrs effort / ~2 days duration (assumes 1 review round + staging QA)`

---

## Calibration

Log actual hours when closing the ticket. If actual vs estimated variance is >30%, note what caused the drift — this is the highest-value input for improving future estimates. Common drift sources: underestimated legacy debt, API surprises, scope creep in review, and QA finding edge cases late.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Estimating from memory instead of opening the reference file | The tables are calibrated against real work; your recall isn't. Read them every time — step 1 says MUST for a reason. |
| Sizing only the happy path | Add the error states, empty states, and the "what if the API is down" branch before committing to a number. |
| Anchoring on the first number spoken | If the requester says "this is a two-day job", size it independently first, then reconcile out loud. |
| Estimating the code but not the delivery | Review rounds, QA, and deploy windows are duration, not effort — state both (see Effort vs Duration). |
| Treating a wide range as a safe answer | A spread over 3× is not an estimate. Either ask a clarifying question or recommend a spike. |
| Counting the same condition twice | If you pushed the base to the high end "because there's no design", don't also apply the +25% design multiplier. Pick one. |
| Sizing a new block as an ACF block because the codebase uses ACF | New blocks are always native (`register_block_type` + `block.json`). The ACF Block row only sizes work on blocks that already exist. For fields: core meta / Gutenberg APIs → Fieldmanager → ACF (only if the client already uses it). |
| Letting prior art imply "almost free" | Reuse lowers cost to the low end of the range, not below it — unless the work is really duplicate-and-adapt, in which case reclassify to a cheaper row rather than discounting this one. See `references/codebase-sizing.md`. |

## Red Flags — stop and re-read the reference file

- "I know roughly what a block costs" — you know the shape, not the calibrated number
- "This is too simple to look up"
- "The tables won't have this exact task" — pick the nearest row and say which you used
- "I'll estimate now and check the table after" — the table is the anchor, not the sanity check

---

## Tone & Communication

- Be direct and specific — give a number, not just "it depends"
- Always explain the confidence spread (what makes it wider or narrower)
- If the task is XL, a spike is the recommendation — not a wide range
- If critical info is missing, state what you'd need to tighten the estimate
- Keep output skimmable — the person likely needs to paste this into Jira, Linear, or a client proposal