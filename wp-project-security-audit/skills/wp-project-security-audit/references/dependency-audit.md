# Dependency Audit

Phase 2 sweep. Every lockfile in the project gets a read-only audit, and every advisory gets one extra column the tools do not give you: **does this code reach production?** Most critical npm advisories in a WordPress project are build tooling that never leaves the developer's machine. The signal is usually elsewhere: a build that ships `require-dev`, a committed `vendor/`, a bundled runtime dependency.

---

## 1. Find every lockfile

`inventory.json` lists them with the component that owns each one. Types:

| Lockfile | Audit command (read-only) | Notes |
|---|---|---|
| `composer.lock` | `composer audit --locked --format=json --no-plugins` | Needs `composer.json` next to it. Never `composer install` or `update` to make it work. |
| `package-lock.json`, `npm-shrinkwrap.json` | `npm audit --package-lock-only --json` | Needs `package.json` next to it. Reads the lockfile only; does not touch `node_modules`. |
| `yarn.lock`, `pnpm-lock.yaml` | none wired into the script | Audit by hand if the tool is available, or list as "not audited" in the method section. |

Lockfiles inside `vendor/` trees are skipped by default (they belong to a dependency's own build). Lockfiles inside third-party components (a wp.org plugin that ships its `package-lock.json`) are audited, and their findings belong to that component's vendor, not to the project.

```bash
bash scripts/dep-audit.sh --root /path/to/project --inventory "$OUT/inventory/inventory.json" --out "$OUT/deps"
```

Outputs `candidates.tsv` (every advisory whose Ships value is not a plain "no": the authoritative list the section file must account for row by row), `dep-audit.json` (normalized advisories with scope and ships columns, build flags, committed dev packages per lockfile) and `dep-audit.md`.

## 2. Classify: runtime, dev, ships

| Scope | How it is decided | Ships to production when |
|---|---|---|
| Composer runtime (`packages`) | lockfile section | always, if `vendor/` deploys (committed, or installed by the build) |
| Composer dev (`packages-dev`) | lockfile section | the dev package is present in a committed `vendor/`; or a build or deploy step runs `composer install` or `composer update` without `--no-dev` for that directory |
| npm runtime (`dependencies`) | lockfile `packages[...].dev` is false | the package is imported by code that is bundled into built assets: check the entry points before rating |
| npm dev (`devDependencies`) | lockfile `packages[...].dev` is true | `node_modules/` deploys (check the deploy excludes) or a dev server runs in production |

The script fills a **Ships** column with one of: `yes (runtime dependency)`, `yes: dev package committed in vendor/`, `check: build installs require-dev at <file:line>`, `on disk from local development only` (dev package present on disk, no build step installing require-dev found for this lockfile: check that the deploy copies a clean build, not a working copy), `frontend if bundled into built assets`, `no (dev only)`, `no (build tooling), unless node_modules deploys`, `check: lockfile has no per-package dev flag` (an npm advisory whose nodes the lockfile does not mark dev or runtime). Anything starting with `check` needs a human answer before rating.

## 3. Build-flag checks

The most useful dependency finding is often not an advisory at all.

- **`composer install` without `--no-dev`** in a build script, CI job, Dockerfile, or `package.json` / `composer.json` script. The script lists each line with `file:line` and binds it to the lockfiles in the same directory tree, or to the lockfile whose directory the command names. Dev packages (test frameworks, code sniffers, debug bars) then deploy, with their own advisories and sometimes web-reachable entry points.
- **Committed `vendor/` with dev packages.** `dep-audit.json` → `vendor.dev_packages_tracked` lists dev packages present in a tracked `vendor/`. A release that commits `vendor/` should have been built with `composer install --no-dev --optimize-autoloader`.
- **Built assets without source.** A committed `dist/` or `build/` with no lockfile means bundled dependencies cannot be audited from the lockfile; check file banners for library names and versions (`component-vuln-lookup.md` §5).
- **`npm install` in a production build** instead of `npm ci`: not a vulnerability, but the lockfile then does not describe what shipped. Note it under method.

## 4. Rating

Rate advisories under the plugin skill's rubric (plugin `SKILL.md` → Severity Rubric), then adjust by the Ships column:

| Ships | Rating |
|---|---|
| no | **Info**, grouped: one finding per lockfile ("N dev-only advisories, none reach production"), with the count from `dep-audit.json` |
| yes, and the vulnerable code path is reachable from a request | the advisory's own severity, re-rated for WordPress context (who can reach it) |
| yes, but the vulnerable function is not used | **Low**: it ships, the next refactor may reach it |
| check | unresolved: ask, and hold the finding as an open question for production until answered |

A dev-only critical advisory is not a Critical finding. Say so in the finding, with the command that proves it is dev-only.

The build flag itself is a **General** finding (`G-`), usually Medium: it changes what ships, and every future dev advisory inherits it. It escalates when a shipped dev package has a web-reachable entry point.

## 5. Continuous dependency monitoring

A one-time audit ages the day it is written. Check whether the repository gets alerts for new advisories:

- `.github/dependabot.yml`, a Renovate config (`renovate.json`, `.renovaterc`, `.github/renovate.json`), or a Snyk config (`inventory.json` → `project.dependency_monitoring`).
- GitHub security alerts, where the repository is on GitHub and visible to the auditor: `gh api repos/<owner>/<repo>/vulnerability-alerts` returns `204` when alerts are enabled and `404` when they are not (needs admin access to the repository; otherwise ask the owner). GitLab: dependency scanning in the CI config.
- Coverage: does the config cover every ecosystem and directory with a lockfile (each theme's `package-lock.json`, not only the root)?

No monitoring for lockfiles that ship to production: **Low**, `G-L<n>`, with the fix "enable Dependabot or Renovate security updates for every lockfile directory". Monitoring that misses a shipping lockfile: same finding, naming the directory.

## 6. What goes in the report

In **General / codebase → Dependencies**:

| Lockfile | Component | Advisories (runtime / dev) | Ships | Build flags | Findings |
|---|---|---|---|---|---|
| `composer.lock` | project | 1 / 3 | runtime yes; dev no | none | G-M2 |
| `themes/acme-theme/composer.lock` | acme-theme | 0 / 2 | **yes: build installs require-dev** | `bin/build.sh:14` | G-M3 |
| `themes/acme-theme/package-lock.json` | acme-theme | 1 / 41 | runtime: bundled; dev no | n/a | T-acme-theme-L2, G-I1 |

Advisories in lockfiles owned by third-party components are reported under that component (`P-<slug>-` or `T-<slug>-`) with the vendor fix path.
