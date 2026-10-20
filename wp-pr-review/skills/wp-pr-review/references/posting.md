# Posting

The verdict maps to a review event only here: Changes requested posts as `REQUEST_CHANGES` (or `COMMENT`), Passed with comments as `COMMENT` (or `APPROVE`), Passed as `APPROVE` (or `COMMENT`), as the user chose in Step 9.

Post only after the user approves the exact text, the target PR, and the event in this run. Any change to the text, target, or event after approval needs a new approval. Post from the doc as it is on disk now: its **Summary comment**, **Inline comments**, and **Thread replies** sections, never the Reviewer notes. Post the replies after the review, one call each; never resolve a thread, the user does that.

## GitHub

One review with inline comments. Write the payload with the Write tool, then post it alone in one Bash call:

```bash
gh api repos/<owner>/<repo>/pulls/<n>/reviews --method POST --input "$WT/review.json"
```

`review.json`:

```json
{
  "commit_id": "<headRefOid>",
  "event": "COMMENT | REQUEST_CHANGES | APPROVE",
  "body": "<summary comment>",
  "comments": [
    { "path": "<path>", "line": 12, "side": "RIGHT", "body": "<comment, including any suggestion block>" },
    { "path": "<path>", "start_line": 10, "start_side": "RIGHT", "line": 14, "side": "RIGHT", "body": "<multi-line comment>" },
    { "path": "<path>", "line": 30, "side": "LEFT", "body": "<comment on a removed line>" }
  ]
}
```

A comment whose line is not in the diff moves into `body` under its heading. GitHub rejects Approve and Request changes on the author's own PR.

Thread reply, using the first comment's `databaseId`:

```bash
gh api repos/<owner>/<repo>/pulls/<n>/comments/<comment id>/replies --method POST -f body='<reply>'
```

## GitLab

GitLab has no single review call. Post the summary as a note, each inline comment as a discussion, then approve when chosen. Request changes posts as a note that states it.

```bash
glab api projects/<url-encoded path>/merge_requests/<n>/notes --method POST --input "$WT/note.json"
glab api projects/<url-encoded path>/merge_requests/<n>/discussions --method POST --input "$WT/discussion-<i>.json"
glab api projects/<url-encoded path>/merge_requests/<n>/approve --method POST
```

Each discussion carries `body` and `position`: `position_type: "text"`, `base_sha`, `start_sha`, and `head_sha` from `diff_refs`, `new_path` and `new_line` (or `old_path` and `old_line` for a removed line).

Thread reply:

```bash
glab api projects/<url-encoded path>/merge_requests/<n>/discussions/<discussion id>/notes --method POST -f body='<reply>'
```

## Failures

On a failed post, show the exact error and ask before any retry. Report which comments were posted when a GitLab run fails part way.
