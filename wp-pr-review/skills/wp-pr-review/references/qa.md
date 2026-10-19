# Local QA

Runs the QA steps chosen in Step 7 on a local site. The user has already said yes to local QA.

## Sort the steps

- **Local**: runs on the local site (UI flows, WP-CLI checks, REST calls, imports with fabricated data).
- **Not local**: needs staging, production, client data, third-party accounts, or credentials you do not have. List them with the reason.

Acceptance criteria used as QA steps are turned into tester actions: what to open, what to do, and what to see.

## Find the site

Use the site URL the user gave, else look in the checkout's `CLAUDE.md`, `wp-cli.yml`, or `.wp-env.json`, or a running local site the environment exposes (for example a Local, wp-env, DDEV, or Lando site). No site: ask the user for its URL; when there is none, mark every step "not run: no local site", write "Not run: no local site" in the doc's QA section, and stop.

## Confirm what changes the site

Before running, show with AskUserQuestion how the site gets the PR code (check out the PR branch in the site's checkout, or point the site at the head worktree), any build step (`npm run build`, `composer install`), and every command that writes to the local database. Options: **Run these**, **Let me pick**, **Skip QA**. On Skip QA, write "Skipped by the user" in the doc's QA section. Only "Run these" or a confirmed pick counts. When the plan changes nothing on the site (read-only checks against code the site already runs), run without asking.

Checking out the PR branch in the user's checkout is allowed only after this confirmation and only when the checkout has no uncommitted changes (`git status --porcelain` is empty). When it has uncommitted changes, point the site at the head worktree, or mark the site-dependent steps blocked with the reason "checkout has uncommitted changes".

Record the starting ref first with `git -C <checkout> rev-parse --abbrev-ref HEAD` (or the sha when detached). The PR code is checked out with `git -C <checkout> checkout --detach refs/remotes/origin/pr/<n>`.

## Run

- Drive UI steps with Playwright when available. Take a screenshot per step and save it next to the review doc.
- Check `debug.log` and the browser console after each step.
- Record each step as **pass**, **fail** (with the observed result), or **blocked** (with the reason), and its source (QA section, acceptance criterion number, or user).

## Restore

Restore the recorded starting ref (check out the branch, or the sha when it was detached). Tell the user about any database changes left behind.
