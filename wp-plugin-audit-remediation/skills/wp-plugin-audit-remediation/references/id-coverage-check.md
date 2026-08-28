# ID Coverage Check

Once a second document (the remediation log) references audit findings by ID, the set of IDs is an **interface** between the two. If a finding is silently dropped from the log, or an ID is invented that the report never had, the two documents disagree and nobody notices — a large status table looks complete on a scan even when rows are missing. This check turns "I'm sure they match" into a measurement.

Diff the ID sets **both ways** — each direction catches a different failure:

- **In the report, not in the log** → a coverage gap: a finding nobody is remediating.
- **In the log, not in the report** → an invented ID: a renumbered finding, or an `N`-finding (discovered during remediation) that dropped its prefix. This is the exact failure permanent IDs exist to prevent.

Remediation-discovered findings use the `N` prefix (`N1`, `N2`, …) and are expected to be log-only — exclude them from the "invented ID" direction, but they must all *be* `N`-prefixed to qualify.

## The script

```bash
#!/usr/bin/env bash
# id-coverage.sh — diff finding-ID sets between an audit report and its remediation log.
# Usage: bash id-coverage.sh AUDIT-2026-08-28.md REMEDIATION-2026-08-28.md
set -euo pipefail

report="${1:?usage: id-coverage.sh <report.md> <log.md>}"
log="${2:?usage: id-coverage.sh <report.md> <log.md>}"

# Audit IDs: C/H/M/L/I + digits. Remediation-discovered IDs: N + digits.
ids() { grep -oE '\b[CHMLI][0-9]+\b' "$1" | sort -u; }
nids() { grep -oE '\bN[0-9]+\b' "$1" | sort -u; }

echo "== In report, NOT tracked in log (coverage gaps) =="
comm -23 <(ids "$report") <(ids "$log") || true

echo ""
echo "== In log, NOT in report (invented IDs — should be empty) =="
comm -13 <(ids "$report") <(ids "$log") || true

echo ""
echo "== Remediation-discovered (N-prefixed) findings, log-only by design =="
nids "$log" || true
```

## Reading the result

| Section | Expected | If not empty |
|---|---|---|
| **Coverage gaps** (report ∖ log) | empty — every audit finding appears in the log | Add the missing findings to the log. A finding with no row is unremediated and untracked. |
| **Invented IDs** (log ∖ report) | **empty** | A renumbered or fabricated audit ID. Fix it: audit IDs are permanent and come only from the report. If it's a finding found during remediation, it must be `N`-prefixed, not a bare `M`/`L`. |
| **N-findings** | the remediation-discovered set, declared at the top of the log | Confirm each is genuinely new (not an audit finding that lost its ID) and declared once. |

## Notes

- Run it **on every log update**, not only at hand-off — a gap introduced mid-remediation is cheapest to fix when it appears.
- The `\b[CHMLI][0-9]+\b` pattern matches the audit's severity-letter IDs. If a report uses a different scheme, adjust the character class — the both-ways `comm` logic is what matters.
- False matches (e.g. a literal "H2" in prose that isn't a finding ID) are possible; the check is a tripwire, not a proof. A non-empty result means *look*, not *panic*.
