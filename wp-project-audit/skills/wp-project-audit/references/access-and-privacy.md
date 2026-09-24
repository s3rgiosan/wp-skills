# Access, Privacy and Hygiene

Phase 2 sweep. Four questions the component audits cannot answer: who can log in and with what power, whether development tools run on production, whether admin actions leave a trail, and where personal data lives. Every answer is recorded as **counts and IDs only**: never user names, emails or record contents.

---

## 1. Users and access

Sources, in order: `inventory.json` (role counts per site from WP-CLI or the read-only database query, `open_registration`, `default_role`, super admins, users with application passwords), `prod-check.sh` §12 on production, or the owner's answers.

| Check | How | Finding when |
|---|---|---|
| **Administrators per site, super admins** | inventory `active_status.sites[].role_counts`, `access.super_admins*` | More administrators than the owner can name a reason for; shared admin accounts. Ask the owner to confirm the expected number; never list who. |
| **Every role's count** | same | The low roles a finding depends on (Contributor, Author) have members: feeds the theme skill's role table and correlation rule 4. |
| **Users with capabilities granted directly** | inventory counts them separately | Capabilities outside any role are easy to forget and hard to review. |
| **Open registration and default role** | `users_can_register`, `default_role` per site; on multisite, the network `registration` site option: inventory `access.network_registration` (WP-CLI) or `access.network_registration_per_network` (database fallback, keyed by network table prefix) | `user`, `blog` or `all` is open registration; `none` is closed. Open with a default role above Subscriber: **High**. Open with Subscriber: note, and every subscriber-exploitable finding applies (plugin skill's subscriber-exploitable rule). |
| **Application passwords** | count of users with `_application_passwords` meta | Present on accounts that have no integration reason: ask. Application passwords bypass interactive login protection and MFA. |
| **Inactive accounts** | only when an activity-log or security plugin exposes last-login data; count accounts with no login in 12 months | Dormant admin or editor accounts: **Medium**. Without such data, say "last login not available" and ask. |

Report role counts per site in General / codebase, as a small table of role and count. User IDs may be cited when a finding is about one account; names and emails never.

## 2. Development and operations tools on production

The inventory flags plugins whose slugs look like development or operations tools (query monitors, debug bars, profilers, file managers, database browsers, code-snippet or PHP-execution plugins, cron and user-switching tools) and lists those active or unverified on any site under `signals.development_tools_active_or_unverified`.

| Tool type | Active on production | Rating |
|---|---|---|
| File managers, database browsers, PHP or code-execution plugins | any site | **High** (one admin session away from code execution or a full data export); **Critical** when reachable by a lower role |
| Query monitors, debug bars, profilers | any site | **Medium** (information disclosure to whoever can see the output; performance) |
| Cron, user-switching, theme or plugin checkers | any site | **Low**, unless the owner uses them deliberately (record the answer) |

The slug match is a signal: confirm what the plugin is before rating. Installed but inactive everywhere: Info, or correlation rule 9 if it has directly requestable files.

## 3. Admin-action logging

Is there an activity or audit log, and is it configured? The inventory lists plugins that look like activity logs (`signals.activity_log_plugins`) with their active status.

- Active and configured (the owner confirms what it records and how long it keeps it): list under "checked and clean".
- Absent, or installed but inactive: **Info**, `G-I<n>`: without a log, an incident cannot be reconstructed. Recommend an activity-log plugin or host-level logging, with a retention period the owner chooses.

## 4. Privacy and data hygiene

Describe where personal data is stored; never read it.

| Where | How to find it |
|---|---|
| Form entries, submissions, bookings, orders | plugins in the inventory that store submissions (form, booking, commerce plugins); their custom tables |
| Custom tables and options written by custom code | `grep -rnE "\\$wpdb->(insert|replace)|CREATE TABLE|dbDelta" wp-content/plugins/acme-* wp-content/themes/acme-* --include='*.php'` |
| User meta beyond core fields | `grep -rnE "(add|update)_user_meta\\(" ... --include='*.php'` in custom code |
| Logs and exports under uploads | `deploy-and-exposure.md` §4 |
| Database dumps and exports that are tracked in git or present on production | `inventory.json` → `project.local_artifact_candidates` (names and sizes only; `inventory.md` §11) |

Checks:

- **Exporters and erasers.** Custom code that stores personal data should register `wp_privacy_personal_data_exporters` and `wp_privacy_personal_data_erasers`. Missing: Low or Info, per the plugin skill's `security-checklist.md` §14; mark `[DECISION]` when the owner must decide retention.
- **Production data where it should not be.** Apply the local artifact rule (`inventory.md` §11): a dump or export is a finding only when it is tracked in git (now or in history), present on production, or copied by a deploy that does not run from a clean checkout. A tracked dump: see `secrets-scan.md` §4. Local development databases and untracked local dumps are out of scope and are not mentioned in the report.
- **Staging with production data.** Only for a staging environment that is a real, remote and reachable system (a hosted staging site, not a developer machine): ask whether its data is scrubbed. Unscrubbed production personal data on a reachable staging site: **Medium**, higher when staging is less protected than production.
- **Retention.** Logs and entries kept forever are an owner decision: `[DECISION]` with the current default.

## 5. Report placement

Users and access, development tools, logging, and privacy are General / codebase findings (`G-`), except where one component stores the data or is the tool (then the component owns it, with a `G-` cross-reference).
