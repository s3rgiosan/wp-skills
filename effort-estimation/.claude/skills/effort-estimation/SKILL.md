---
name: effort-estimation
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
**Hours/Days Range**, and **Confidence Range**.

> **Scope:** "React" in this skill always means React **in a WordPress context**
> (block editor, Interactivity API, admin UIs, headless WP). Generic
> standalone-React projects (no WP involvement) are out of scope — decline and
> redirect.

---

## Before You Estimate: Clarify if Needed

If the task description lacks a clear deliverable or scope, ask up to 2 clarifying questions before estimating. Do not produce a number when the spread would be meaninglessly wide (e.g. ±300%).

Good triggers to pause and ask:
- No clear deliverable ("build a membership system", "improve performance")
- Stack is ambiguous (WordPress + React could mean headless WP, an Interactivity API block, a custom Gutenberg block, or a wp-admin React app)
- Integration mentioned but API/provider unknown

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

### 2. Hours/Days Estimate
Give a specific midpoint estimate, e.g. "~6 hours" or "~3 days".
Use hours for tasks under 2 days; days for anything larger.

### 3. Confidence Range
Give a best-case / worst-case spread, e.g. "4–10 hours" or "2–5 days".
Wider range = more unknowns. Always explain what drives the spread.

> **Ticket field guidance:** Use the **tier** for portfolio/roadmap views (S/M/L/XL is coarser and ages better). Use the **hours/days** for sprint commitment. Don't paste both into the same single-value field — pick one per field and put the other in the description.

---

## Estimation Process

1. **Classify the tech stack** — Is this pure WordPress (PHP/theme/plugin), React-in-WP (block editor, Interactivity API, headless WP), or both? MUST read the relevant reference file(s) before writing the estimate — baseline numbers and risk multipliers live there, not in this file.
   - WordPress (PHP) tasks → read `references/wordpress.md`
   - React-in-WP tasks → read `references/react.md`
   - Both → read both

2. **Identify task type** — What category does this fall into? (See reference files for task taxonomies.)

3. **Check for unknowns** — Flag anything that could expand scope:
   - Third-party APIs or integrations
   - Design not finalized
   - Legacy codebase / tech debt
   - Performance or accessibility requirements
   - Multi-environment (staging, prod, CDN, etc.)
   - Cross-browser or mobile requirements

4. **Apply complexity multipliers** (see General Multipliers section below)

5. **Write the estimate** using the template below

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
**Confidence Range:** [low]–[high] [hours/days]

### Breakdown
*(Required for M, L, XL tasks. Optional for S.)*
| Subtask | Estimate |
|---------|----------|
| [step 1] | X hrs |
| [step 2] | X hrs |
| ... | ... |
| **Total** | **X hrs** |

### What's Included
- [assumption 1]
- [assumption 2]

### Risks & Unknowns
- [risk 1 — impact on range]
- [risk 2 — impact on range]

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

### How to stack multipliers

Apply codebase factor first (multiplicative), then additive factors on top of the result. Keep one decimal of precision in intermediate steps; round only the final number.

**Worked example** — base: 8 hrs for a dynamic Gutenberg block, clean existing codebase, no design, WCAG AA required, unit tests required:

```
8 × 1.2 (clean codebase)     = 9.6
9.6 × 1.25 (no design, +25%) = 12.0
12.0 × 1.20 (a11y, +20%)     = 14.4
14.4 × 1.30 (tests, +30%)    = 18.7
→ round to 19 hrs (~2.5 days)
```

If multiple codebase-factor rows could apply, pick one (the worst-case one) — don't stack ×1.2 × ×1.5.

---

## Effort vs Duration

The estimate is **effort** (focused dev time). **Duration** — wall-clock from ticket open to merge — is typically 1.5–2× longer due to code review, design handoffs, QA, deploy windows, and context switching. State both when the audience is a PM or client, not just engineers.

Example output: `~8 hrs effort / ~2 days duration (assumes 1 review round + staging QA)`

---

## Calibration

Log actual hours when closing the ticket. If actual vs estimated variance is >30%, note what caused the drift — this is the highest-value input for improving future estimates. Common drift sources: underestimated legacy debt, API surprises, scope creep in review, and QA finding edge cases late.

---

## Tone & Communication

- Be direct and specific — give a number, not just "it depends"
- Always explain the confidence spread (what makes it wider or narrower)
- If the task is XL, a spike is the recommendation — not a wide range
- If critical info is missing, state what you'd need to tighten the estimate
- Keep output skimmable — the person likely needs to paste this into Jira, Linear, or a client proposal