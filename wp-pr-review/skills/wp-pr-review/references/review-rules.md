# Review rules

Used by the reviewer (Step 5) and the verifier (Step 8).

## Evidence standard

A finding counts only when it has all three:

1. **Location**: `path:line` at the PR head, or at the base for a removed line.
2. **Failure**: concrete inputs or state, and the wrong result.
3. **Proof**: the code, git history, config, or task context that shows the failure is real.

Drop anything that cannot meet the standard. Mark an inferred step as inferred.

## Claim validation

Every claim in a finding is checked before it stays. These checks catch the most common false findings:

| Check | How | When it fails |
|---|---|---|
| **Caused by this PR** | Compare the base worktree (`git -C <base> show HEAD:<path>`) and the target branch. A problem already present at the base is not this PR's defect. | Drop, or note as pre-existing in the reviewer notes |
| **Intent stated** | Read code comments, config headers, the PR body, the ticket, the spec, and planning docs. A behavior they name as the design (for example "builds run only on the staging branch for now") is a choice, not a defect. | Drop; if the design itself breaks something, state that concrete failure only |
| **External fact** | Check version compatibility, platform behavior, tool config keys, and library APIs against vendored code, lock files, version headers, the tool's schema or docs, or the remote (`git ls-remote`, `gh api`). Never assert a compatibility rule from memory. | Drop, or ask as an open question naming what was checked |
| **Runtime state** | Whether a plugin is active, an option's value, or production content cannot be read from the repository. | Open question naming the command that settles it, for example `wp plugin list --status=active` on the target environment |
| **Duplicate** | Two findings share one root cause. | Merge into one comment at the root cause |
| **Already raised** | An unresolved review thread by someone else makes the same point. | Omit; list under reviewer notes |
| **Previous round** | An own thread or an earlier review doc of this PR makes the same point. | Track it under Previous findings; a Still open one with an own thread becomes a thread reply, never a new inline comment |
| **History of the changed lines** | `git log -L <start>,<end>:<path>` or `git blame -L` on the base range; read the commit messages and linked PRs or tickets. | A comment that calls old code a mistake, or treats a removed guard as dead code, is dropped or rewritten when its introducing commit explains it; a PR that reverts a deliberate fix is a finding that cites that commit |
| **Mechanics** | Check how git merges (identical hunks merge cleanly), how CI triggers (a workflow runs only on its listed events and branches), and how a tool parses its config. | Drop or narrow the claim |

**Search before asking.** Before asking whether a change is intentional, search git history on the touched paths (including `git log -L` on the touched lines) and the tracker for decisions about the component. When a source answers it, cite the source in a note. Ask only what the code, history, and tracker leave open.

## Checklist

- **Scope and intent**: each acceptance criterion met, partly met, not met, or cannot tell from code, with the lines that meet it; each step of the intended approach followed, or deviated (an unexplained deviation is a finding); changes outside the task's scope; thread or plan decisions the code ignores.
- **Correctness**: logic, edge cases (empty, missing, zero, large, duplicate, non-ASCII), type juggling and null handling; effects on every caller and consumer (signatures, return shapes, hook arguments, option and meta formats, REST responses); migrations (existing data still reads, idempotent, safe to re-run, rollback path); multisite, object cache, page cache, transients, cron.
- **Security**: capability checks and nonces on every state change; `permission_callback` on every REST route; input sanitized and validated; output escaped late for its context; SQL through `$wpdb->prepare`, with identifiers in `IN (...)`, `ORDER BY`, and table names allowlisted; `wp_safe_redirect`; uploads, file paths, remote requests, `unserialize`, secrets in code.
- **Performance**: queries in loops, unbounded queries (`posts_per_page => -1`, missing `no_found_rows`), meta or tax queries on hot paths, autoloaded options, uncached remote calls on page load, assets enqueued site-wide.
- **Build, deploy, and config**: CI triggers and target branches, deploy branches, ignored paths against tracked files, dependency constraints against lock files, tool config keys against their schema.
- **Conventions**: the project's `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, and lint configs; the component's own conventions from its map; tests added or updated where the project has a suite.

Generated or vendored files (`vendor/`, `build/`, `dist/`, lock files, minified assets): review their presence and consistency, not their content.

## Severity and verdict

| Severity | Meaning |
|---|---|
| Blocker | Breaks behavior, loses or corrupts data, opens a security hole, or fails an acceptance criterion |
| Major | Wrong in a realistic case, a hot-path performance problem, or a missing check the codebase requires |
| Minor | Edge case, maintainability, or convention issue worth fixing before merge |
| Nit | Optional polish; at most five, only when they change readability |

Every acceptance criterion marked "not met" needs a Blocker comment, and every "partly met" needs a Major comment, anchored on the most relevant line (or in the summary comment when no line fits).

Open questions carry no severity and no weight in the verdict.

Verdict, from the comments that survive verification:

| Verdict | When |
|---|---|
| **Changes requested** | Any Blocker or Major stands |
| **Passed with comments** | Only Minor or Nit comments stand |
| **Passed** | No comments stand, and every acceptance criterion is met or cannot be judged from code |

Open questions and pending decisions do not change the verdict: they are listed on their own, after what blocks.

The verdict is the review's outcome. The GitHub or GitLab review event is chosen only when posting (`posting.md`).

## Comment style

- State the defect and its impact in one to three sentences: what is wrong, where, and what breaks.
- No praise padding, no restating the diff, no fix mechanics in prose ("then run `composer update`").
- Write affirmatively. Never name where a design or value came from.
- Refer to acceptance criteria by number and paraphrase.
- No em or en dashes.

## Suggestions

Add a suggestion block only when the fix is a quick, self-contained edit to the commented lines: a typo, a wrong key, a one-line command, a version constraint, comment wording.

````markdown
```suggestion
	$label = __( 'Settings', 'my-plugin' );
```
````

- The block replaces exactly the commented line range and keeps its indentation.
- One suggestion per comment. When the same edit applies on several lines, give each line its own comment so each can be applied in one click.
- Never suggest a refactor, a restructure, or a change of approach. State the problem and leave the approach to the author.

## Anchoring

- Comment on lines inside the diff, on the head side. A multi-line comment names its first and last line.
- A finding about removed code anchors on the base side of the removed line, or on the nearest surviving line with the removed path named.
- A finding with no line in the diff goes in the summary comment.
