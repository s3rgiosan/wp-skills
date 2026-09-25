# Vendor Compromise

Phase 2 sweep. A version lookup asks "is this version affected?". This sweep asks "can this vendor be trusted to ship this code?". A premium plugin can sit outside every advisory range and still come from a vendor whose update channel or free plugins were backdoored.

---

## 1. Who ships each third-party component

For every committed and managed third-party component, record from the inventory and the wp.org lookups:

- **Vendor:** `Author`, `Author URI`, `Plugin URI` / `Theme URI` host, and for wp.org components the `author_profile` from the plugin API.
- **Update channel:** wp.org, the vendor's own updater (`Update URI` set, or an updater class calling a vendor host), Composer (artifact, VCS, private repository), or manual upload.
- **Update endpoint hosts:** where the code phones home for updates and licence checks.

```bash
# Update and licence endpoints inside a component (hosts only)
grep -rhoE "https?://[a-z0-9.-]+\.[a-z]{2,}" wp-content/plugins/acme-slider-pro --include='*.php' \
  | sed -E 's#https?://##' | sort | uniq -c | sort -rn | head -20
grep -rnE "pre_set_site_transient_update_(plugins|themes)|plugins_api|site_transient_update_plugins|Update URI" \
  wp-content/plugins/acme-slider-pro --include='*.php' | head
```

The first trigger is usually the "Supply-chain signals" block at the top of `vulns.md` (`vuln-lookup.sh` flags advisories whose text or CWE mentions a backdoor, injected or malicious code, a compromised or sold plugin, or hijacked updates). Treat every entry there as a candidate for this sweep, even when its version range does not match the installed version.

## 2. Checks per vendor

| Check | How | What it tells you |
|---|---|---|
| **Closed plugins by the same author** | The author's wp.org profile (`https://profiles.wordpress.org/<user>/`) lists current plugins; closed ones show on each plugin page and in WPVulnerability's `closed` / `closed_reason`. Search advisories for the vendor name. | Several plugins closed at once, especially for a security reason, suggests the vendor's account or build pipeline was compromised. Every product from that vendor, free or premium, is suspect until cleared. |
| **Supply-chain advisories** | Search WPVulnerability and the Wordfence feed for the vendor name and product family, not only the installed slug. Read the advisory text for affected distribution channels. | Advisories filed against a free plugin can describe a compromise of the vendor's shared infrastructure (a build server, an update server, an injected analytics call) that also reached premium builds. |
| **Version line** | Compare the premium product's version line with the advisory's ranges (`component-vuln-lookup.md` §4). | A mismatched line means the range cannot answer the question. The answer comes from the code: step 3. |
| **Update endpoint hosts** | The hosts from §1. Compare with the vendor's domain and with hosts named in advisories. | An update or telemetry host that is not the vendor's, or that an advisory names, is an indicator. |
| **Ownership changes** | wp.org plugin page history, changelog, a new `Author` in a recent version, a new update host. | Plugins bought by a new owner and then weaponized are a known pattern. |

## 3. Compare against known-good

When a vendor is suspect, the question becomes "is the copy we run the copy the vendor originally shipped?".

1. **Get a trusted copy** of the exact deployed version: the vendor's original zip from the owner's account (downloaded before the compromise window when possible), the premium artifact committed to the repo at a commit that predates it, or the wp.org SVN tag for free plugins.
2. **Generate a manifest locally** from the trusted copy: `bash scripts/prod-check.sh manifest <trusted-dir> plugin-<slug>.sha256`.
3. **Compare the repo copy** against the manifest (`cd wp-content/plugins/<slug> && sha256sum -c <manifest>`), and search it for indicator strings from the advisory.
4. **Compare production** by asking the owner to run `prod-check.sh check --manifests <dir> --ioc-strings <file> --ioc-names <file>` (`production-check.md`). Production can differ from the repo: extra PHP files, a renamed old add-on, files changed after the last deploy.

Indicators to collect from the advisory before the comparison: dropper file names (often a near-miss of a core file name), injected hosts, option or user names created by the payload, cron hooks it schedules, and the date range. Put them in the `--ioc-*` files; never paste the advisory's payload into the report.

## 4. Rating and fix

| Situation | Rating | Fix line |
|---|---|---|
| Vendor compromise confirmed, deployed copy matches a known-bad build or carries indicators | **Critical** | Incident response first: take the component out of production, rotate credentials the site holds, check for persistence (users, cron, must-use files, `wp-config.php` additions). Then replace or remove. |
| Vendor compromised, deployed copy matches a known-good manifest, no indicators | **High** until the vendor's channel is trusted again; the next update is the risk | Disable automatic updates for the component (`Update URI: false` on a committed copy is a fork, record it), pin the known-good version, plan replacement |
| Vendor closed or abandoned, no compromise | per `component-vuln-lookup.md` §6 | Replace or remove; mitigate until then |
| Update host unexpected, no other signal | **Medium** open question | Ask the vendor; block the host at the edge if it cannot be explained |

These are third-party findings: the fix line follows the Fix guidance by ownership table (plugin `references/shared-conventions.md` → Report), "abandoned or closed" row, and never tells the owner to edit the vendor's files as the remedy.

## 5. Report placement

The finding lives under the component (`P-<slug>-C1`). When the same vendor supplies several components, add one General finding (`G-H1: vendor example-vendor compromised, three components affected`) that lists each component's finding ID, so the owner sees the vendor decision in one place.
