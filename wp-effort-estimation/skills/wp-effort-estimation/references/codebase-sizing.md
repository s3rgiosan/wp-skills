# Codebase-Aware Sizing (Optional)

Use this only when the repository being estimated against is actually
accessible in the current session. When it isn't (pre-sales, ticket triage,
scoping before repo access), skip this file entirely — the static task tables
in `wordpress.md` / `react.md` are the default and primary path. This is a
supplement that sharpens table numbers, never a replacement for them.

Keep the scan **light**: a few targeted greps and reading one or two closest
matches. This is not a full audit — if the scan is taking longer than the
estimate itself would, stop and fall back to the tables.

---

## What to Scan For

Four dimensions, in order of impact:

1. **Prior art / reuse.** Search for an existing feature similar to the one
   being estimated (a comparable block, endpoint, admin screen, template).
   Read the closest match. Reuse is usually the largest single reduction —
   separate what's reusable from what's genuinely net-new.

2. **Data-structure impact.** Check whether the work needs new post types,
   taxonomies, meta, options, or custom tables — or can hang off structures
   that already exist. Net-new data structures are usually the largest single
   increase (schema design, registration, migration/backfill for existing
   content).

3. **Project shape and tooling.** Which build chain (`@wordpress/scripts` vs
   custom), which conventions (ACF vs core meta, classic vs block editor),
   existing test setup the new work must extend. This calibrates the General
   Multipliers — e.g. an existing test suite pushes "Tests required" toward
   the low end; a bespoke build chain pushes block work up.

4. **Complexity risks in place.** Third-party integrations already wired in,
   editorial/admin UX complexity, legacy patterns the new work must coexist
   with. Carry these into the "Check for unknowns" step, which runs next.

## How Findings Adjust the Estimate

| Finding | Adjustment |
|---------|-----------|
| Strong prior art (similar feature exists, adaptable) | Base hours **at** the low end of the table range — never below |
| Partial reuse (utilities/components exist, feature is new) | Base hours at midpoint; note reuse in "What's Included" |
| Genuinely net-new, no comparable code | Base hours toward the high end |
| New data structures required | High end + the "Custom DB tables" / data-structure risk factors |
| Clean, conventional codebase confirmed | Codebase multiplier ×1.1 (low end of "clean") |
| Legacy patterns / debt observed | Codebase multiplier ×1.5–2.0, cite what was observed (in plain language) |

Apply adjustments to the table baseline first, then stack multipliers as
normal — do not double-count (e.g. legacy debt observed in the scan replaces,
not adds to, the generic legacy multiplier guess).

### When prior art is overwhelming, reclassify — don't discount

If the work is genuinely duplicate-and-adapt (something existing does nearly the
same job; the task is copy, rename, swap a couple of fields), the task type
itself has changed. It is no longer "register a static block" — it is "adapt an
existing block", which is a different and cheaper row, or a straight S-tier
judgment call.

Pick the cheaper classification rather than pushing an expensive row below its
calibrated low end. The table ranges are a floor: the legitimate way to land
under one is to establish you were reading the wrong row, not to discount the
right one.

## Evidence Stays Internal

File paths, function names, hook names, and class names discovered during the
scan inform the estimate's reasoning but **never appear in the emitted
estimate**. Describe findings in plain language:

- ❌ "Can adapt `src/blocks/testimonial/edit.js` and reuse `get_related_items()`"
- ✅ "An existing similar block was found and can be adapted, reducing the front-end work"

This keeps the output safe to paste into client-facing tools and PM systems
without leaking implementation detail. The self-check step in SKILL.md
enforces this before the estimate is emitted.
