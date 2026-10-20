# Review doc format

One file per PR: `<out>/<host>-<repo>-pr-<n>-review.md` for GitHub and `<out>/<host>-<repo>-mr-<n>-review.md` for GitLab, where `<host>` is `github` or `gitlab`. When the file exists, SKILL.md Step 6 says whether to update it or write a new one.

The **Summary comment**, **Inline comments**, and **Thread replies** sections are postable as written. **Reviewer notes** never get posted.

`````markdown
# PR #<n> review: <PR title>

<PR URL>

Verdict: **<Passed | Passed with comments | Changes requested>**
Head: `<short sha>` | Base: `<branch>` | Reviewed: <YYYY-MM-DD>

## Summary comment

<Two to four sentences: the reason for the verdict and the top blockers. For Passed, one or two sentences on what was checked. On a later round, open with one sentence on the previous findings: how many are fixed, still open, and outdated.>

## Inline comments

### `<path>` line <n>

```<lang>
<the commented line, verbatim>
```

<Comment text.>

```suggestion
<replacement, only when the Suggestions rule allows one>
```

### `<path>` lines <a>-<b>

...

### `<path>` line <n> (removed)

...

## Thread replies

### `<path>` line <n> (thread `<thread id>`, comment `<first comment id>`)

<Still open: one or two sentences on what still fails at this head. Fixed: "Fixed in `<short sha>`.">

## Reviewer notes (not for posting)

### Previous findings

| Previous comment | Status | Evidence |
|---|---|---|

<On a later round only: one row per previous finding (earlier doc comments and own threads) with Fixed, Still open, or Outdated, and the commit or code that shows it. Then "Reviewed since `<last sha>`: incremental" or "history rewritten since `<last sha>`: full pass". Omit on a first round.>

### Acceptance criteria

| # | Criterion (paraphrased) | Status | Evidence |
|---|---|---|---|

### Task context

<The task summary, implementation plan, and thread decisions, paraphrased.>

### QA

| # | Step | Source | Where | Result | Evidence |
|---|---|---|---|---|---|

Source is the QA section, the acceptance criterion number, or the user. Where is the local site URL, or "not local: <reason>".

<Then the not-local steps with reasons. When QA did not run, write "Skipped by the user" or "Not run: no local site".>

### Extra criteria

<Each caller-provided item, listed and not judged. Omit when none.>

### Evidence

<One line per inline comment, keyed by its heading: severity, the proof (base and head code, commit sha (including the commit that introduced the old code), ticket or doc reference, command output), and the validation checks it passed.>

### Open questions

<Each with what was checked and the command or person that settles it. "None" when empty.>

### Dropped during validation

<One line per dropped candidate with the reason. "None" when empty.>

### Architecture notes

<Entry points, callers, and data lifecycle that matter for this change; related history that explains a change, with its source. Name component maps by slug and file, never by absolute path, and the wp-mnemon mode used (reused, subagent, or fallback).>

### Already raised

<Existing review threads this review agrees with. "None" when empty.>

### Context used

<Ticket, spec, planning docs, project rules, and history read, by reference or repo-relative path.>

### Checks

<CI status; linters and tests run, with command and result.>

### History

- <YYYY-MM-DD>: <reviewed head sha, verdict, posted or not; on a later round also fixed, still open, and outdated counts>
`````

History keeps one line per round and the last line's sha is the next round's starting point, so always record the full head sha. QA screenshots go in `<doc folder>/<pr|mr>-<n>-qa/<short head sha>/`, one folder per round.

For Passed, the Inline comments section reads "None". Thread replies reads "None" on a first round or when no own thread needs one. Order inline comments by severity, then by path. Use repo-relative paths only.
