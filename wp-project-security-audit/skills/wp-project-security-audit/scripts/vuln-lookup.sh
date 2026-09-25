#!/usr/bin/env bash
# vuln-lookup.sh: known-vulnerability and wp.org signal lookup per component.
#
# For every plugin, theme and core version, queries the WPVulnerability API for
# advisories that affect the given version, and the wp.org API for the current
# version, last update, closed status and slug ownership. Premium builds are also
# looked up under their likely free slug; those hits are marked "assumed shared code".
# Every hit carries a version-line sanity flag so a range is never matched against
# a different product's numbering without a check.
#
# Usage:
#   bash vuln-lookup.sh (--inventory <inventory.json> | --list <file>) [--out <dir>]
#                       [--prod-versions <file>] [--premium-map <file>]
#                       [--wordfence-feed <file>] [--no-wporg] [--delay <seconds>]
#                       [--php-version <x.y>]
#
#   --inventory      inventory.json from inventory.sh.
#   --list           Plain list, one component per line: "<type> <slug> <version>"
#                    (type: plugin, theme or core; core lines read "core wordpress <version>")
#                    or "<slug>:<version>" for plugins.
#   --prod-versions  Same line format; overrides versions with what runs in production.
#   --premium-map    Lines "<premium-slug> <free-slug>" when the free slug is not the
#                    premium slug minus a -pro / -premium style suffix.
#   --wordfence-feed A locally downloaded Wordfence Intelligence vulnerability feed
#                    (JSON). Used for components WPVulnerability has no data for.
#   --no-wporg       Skip wp.org lookups (staleness, closed status, slug ownership).
#   --delay          Seconds between API requests (default 0.3).
#   --php-version    Production PHP version; checked against php.net's active releases
#                    (https://www.php.net/releases/active.php). Defaults to the inventory's
#                    platform.php_production when present.
#
# Output: <out>/vulns.json, <out>/vulns.md, raw API responses in <out>/raw/.
# Reads only public APIs. Sends slugs and versions, nothing else.

set -euo pipefail

INVENTORY=""
LIST=""
OUT=""
PROD=""
PREMIUM=""
WFFEED=""
WPORG=1
DELAY="0.3"
PHPV=""

while [ $# -gt 0 ]; do
  case "$1" in
    --inventory) INVENTORY="${2:?}"; shift 2 ;;
    --list) LIST="${2:?}"; shift 2 ;;
    --out) OUT="${2:?}"; shift 2 ;;
    --prod-versions) PROD="${2:?}"; shift 2 ;;
    --premium-map) PREMIUM="${2:?}"; shift 2 ;;
    --wordfence-feed) WFFEED="${2:?}"; shift 2 ;;
    --no-wporg) WPORG=0; shift ;;
    --delay) DELAY="${2:?}"; shift 2 ;;
    --php-version) PHPV="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,34p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$INVENTORY$LIST" ] || { echo "Pass --inventory or --list" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "python3 is required" >&2; exit 2; }
if [ -z "$OUT" ]; then
  OUT="$(mktemp -d "${TMPDIR:-/tmp}/wp-project-security-audit.XXXXXX")"
fi
mkdir -p "$OUT/raw"

PY_FILE="$(mktemp "${TMPDIR:-/tmp}/wp-vuln-lookup.XXXXXX")"
trap 'rm -f "$PY_FILE"' EXIT INT TERM
cat > "$PY_FILE" <<'PY'
import datetime, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

inventory, listfile, out, prod, premium, wffeed, use_wporg, delay, php_version = sys.argv[1:10]
use_wporg = use_wporg == "1"
delay = float(delay)
raw_dir = os.path.join(out, "raw")
today = datetime.datetime.now(datetime.timezone.utc)

def parse_lines(path):
    items = []
    for line in open(path):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) >= 3 and parts[0] in ("plugin", "theme", "core"):
            items.append((parts[0], parts[1], parts[2]))
        elif len(parts) == 1 and ":" in parts[0]:
            slug, _, ver = parts[0].partition(":")
            items.append(("plugin", slug, ver))
        elif len(parts) == 2:
            items.append(("plugin", parts[0], parts[1]))
    return items

components = []
if inventory:
    inv = json.load(open(inventory))
    for c in inv.get("components", []):
        components.append({"type": c["type"], "slug": c["slug"], "version": c.get("version"),
                           "bucket": c.get("bucket_guess"), "update_uri": c.get("update_uri"),
                           "author": c.get("author")})
    php_version = php_version or ((inv.get("platform") or {}).get("php_production") or "")
    core_v = (inv.get("core") or {}).get("version")
    if core_v:
        components.append({"type": "core", "slug": "wordpress", "version": core_v, "bucket": "core"})
if listfile:
    for t, s, v in parse_lines(listfile):
        components.append({"type": t, "slug": "wordpress" if t == "core" else s,
                           "version": s if t == "core" and v == "-" else v, "bucket": "listed"})

if prod:
    over = {(t, "wordpress" if t == "core" else s): v for t, s, v in parse_lines(prod)}
    for c in components:
        key = (c["type"], c["slug"])
        if key in over:
            if c.get("version") != over[key]:
                c["local_version"] = c.get("version")
            c["version"] = over[key]
            c["version_source"] = "production"

premium_map = {}
if premium:
    for line in open(premium):
        parts = line.split()
        if len(parts) >= 2 and not parts[0].startswith("#"):
            premium_map[parts[0]] = parts[1:]

SUFFIXES = ("-pro", "-premium", "-plus", "-business", "-agency", "-developer", "-elite", "-unlimited")
def free_slugs(slug):
    if slug in premium_map:
        return premium_map[slug]
    for suf in SUFFIXES:
        if slug.endswith(suf) and len(slug) > len(suf) + 2:
            return [slug[: -len(suf)]]
    return []

def vt(v):
    out = []
    for p in re.split(r"[.\-+_]", str(v)):
        m = re.match(r"\d+", p)
        out.append(int(m.group()) if m else 0)
    return out

def cmp(a, b):
    ta, tb = vt(a), vt(b)
    n = max(len(ta), len(tb))
    ta += [0] * (n - len(ta))
    tb += [0] * (n - len(tb))
    return (ta > tb) - (ta < tb)

def major(v):
    return vt(v)[0] if v else None

def fetch(url, cache_name):
    path = os.path.join(raw_dir, cache_name)
    if os.path.exists(path):
        try:
            return json.load(open(path)), None
        except ValueError:
            pass
    req = urllib.request.Request(url, headers={"User-Agent": "wp-project-security-audit/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            body = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
    except Exception as e:
        return None, str(e)
    finally:
        time.sleep(delay)
    with open(path, "w") as f:
        f.write(body)
    try:
        return json.loads(body), None
    except ValueError:
        return None, "non-JSON response"

def wpvuln(kind, slug, version):
    if kind == "core":
        url = "https://www.wpvulnerability.net/core/%s/" % urllib.parse.quote(version)
        name = "wpvuln-core-%s.json" % version
    else:
        url = "https://www.wpvulnerability.net/%s/%s/" % (kind, urllib.parse.quote(slug))
        name = "wpvuln-%s-%s.json" % (kind, slug)
    data, err = fetch(url, name)
    if err:
        return None, err
    d = (data or {}).get("data") or {}
    return d, None

def affected(version, op):
    if not op or not (op.get("max_version") or op.get("min_version")):
        return None
    ok = True
    if op.get("min_version"):
        c = cmp(version, op["min_version"])
        ok = c > 0 if op.get("min_operator") == "gt" else c >= 0
    if ok and op.get("max_version"):
        c = cmp(version, op["max_version"])
        ok = c <= 0 if op.get("max_operator") == "le" else c < 0
    return ok

def hit_from(v, queried_slug):
    impact = v.get("impact") or {}
    cvss = impact.get("cvss3") or impact.get("cvss") or {}
    ids = [s.get("id", "") for s in v.get("source") or []]
    links = [s.get("link") for s in v.get("source") or [] if s.get("link")]
    op = v.get("operator") or {}
    title = v.get("name")
    if not title or re.fullmatch(r"[\d.]+", str(title)):
        descs = [re.sub(r"^\[\w+\]\s*", "", s.get("description") or "") for s in v.get("source") or []]
        title = next((d for d in descs if d), title)
    return {"title": str(title or "")[:160], "queried_slug": queried_slug,
            "advisory_id": next((i for i in ids if str(i).startswith("CVE-")), None) or (ids[0] if ids else None) or v.get("uuid"),
            "cve": next((i for i in ids if str(i).startswith("CVE-")), None),
            "cvss": cvss.get("score"), "severity": cvss.get("severity"),
            "range": "%s%s .. %s%s" % (op.get("min_operator") or "", op.get("min_version") or "*",
                                       op.get("max_operator") or "", op.get("max_version") or "*"),
            "fixed_in": op.get("max_version") if op.get("max_operator") == "lt" and op.get("unfixed") in (None, "0", 0) else None,
            "unfixed": str(op.get("unfixed")) == "1", "link": links[0] if links else None,
            "description": next((re.sub(r"^\[\w+\]\s*", "", x.get("description") or "") for x in v.get("source") or [] if x.get("description")), "")[:300],
            "cwe": [c.get("cwe") for c in (impact.get("cwe") or []) if isinstance(c, dict)]}

SUPPLY = re.compile(r"\b(backdoor(ed)?|injected|malicious code|compromised|sold|hijack(ed|ing)?|supply[- ]chain|embedded malicious)\b|CWE-506", re.I)
SEV_RANK = {"critical": 4, "c": 4, "high": 3, "h": 3, "medium": 2, "m": 2, "moderate": 2, "low": 1, "l": 1}
def sev_key(h):
    try:
        score = float(h.get("cvss") or 0)
    except ValueError:
        score = 0.0
    rank = SEV_RANK.get(str(h.get("severity") or "").lower(), 0)
    if not rank and score:
        rank = 4 if score >= 9 else 3 if score >= 7 else 2 if score >= 4 else 1
    return (-rank, -score)
supply_signals = []

wf = None
if wffeed:
    try:
        wf = json.load(open(wffeed))
        if isinstance(wf, dict):
            wf = list(wf.values())
    except (OSError, ValueError) as e:
        sys.stderr.write("Could not read the Wordfence feed: %s\n" % e)
        wf = None

def wordfence(kind, slug, version):
    hits = []
    for v in wf or []:
        for sw in v.get("software") or []:
            if sw.get("type") != kind or (kind != "core" and sw.get("slug") != slug):
                continue
            for rng in (sw.get("affected_versions") or {}).values():
                lo, hi = rng.get("from_version", "*"), rng.get("to_version", "*")
                ok = True
                if lo not in ("*", "", None):
                    c = cmp(version, lo)
                    ok = c >= 0 if rng.get("from_inclusive", True) else c > 0
                if ok and hi not in ("*", "", None):
                    c = cmp(version, hi)
                    ok = c <= 0 if rng.get("to_inclusive", True) else c < 0
                if ok:
                    cv = v.get("cvss") or {}
                    hits.append({"title": v.get("title"), "queried_slug": slug, "cve": v.get("cve"),
                                 "advisory_id": v.get("cve") or v.get("id"),
                                 "cvss": cv.get("score"), "severity": cv.get("rating"),
                                 "range": "%s .. %s" % (lo, hi),
                                 "fixed_in": ", ".join(sw.get("patched_versions") or []) or None,
                                 "unfixed": not sw.get("patched"), "link": (v.get("references") or [None])[0],
                                 "feed": "wordfence"})
                    break
    return hits

def wporg(kind, slug):
    if kind == "plugin":
        url = ("https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=%s"
               "&request[fields][sections]=0&request[fields][versions]=0" % urllib.parse.quote(slug))
    else:
        url = ("https://api.wordpress.org/themes/info/1.2/?action=theme_information&request[slug]=%s"
               "&request[fields][sections]=0" % urllib.parse.quote(slug))
    data, err = fetch(url, "wporg-%s-%s.json" % (kind, slug))
    if err or not isinstance(data, dict):
        return {"status": "lookup failed", "error": err}
    error = str(data.get("error") or "")
    if error:
        if "not found" in error.lower():
            return {"status": "unclaimed"}
        if "closed" in error.lower() or data.get("closed"):
            return {"status": "closed", "closed_date": data.get("closed_date"), "reason": data.get("reason") or data.get("reason_text")}
        return {"status": "error", "error": error[:120]}
    last = data.get("last_updated")
    days = None
    if last:
        m = re.match(r"(\d{4}-\d{2}-\d{2})", last)
        if m:
            days = (today - datetime.datetime.strptime(m.group(1), "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc)).days
    author = data.get("author")
    if isinstance(author, dict):
        author = author.get("display_name") or author.get("user_nicename")
    return {"status": "claimed", "latest": data.get("version"), "last_updated": last, "days_since_update": days,
            "tested": data.get("tested"), "requires_php": data.get("requires_php"),
            "author": re.sub(r"<[^>]+>", "", str(author or "")), "author_profile": data.get("author_profile")}

results = []
for c in components:
    kind, slug, version = c["type"], c["slug"], c.get("version")
    r = dict(c, queries=[], hits=[], flags=[], wporg=None, no_data=False)
    if kind in ("mu-plugin", "dropin"):
        r["flags"].append("not queryable: must-use or drop-in code has no public advisory feed; review in depth")
        results.append(r)
        continue
    if not version:
        r["flags"].append("no version header: cannot match advisory ranges")
        results.append(r)
        continue
    if c.get("local_version"):
        r["flags"].append("local %s differs from production %s" % (c["local_version"], version))
    slugs = [(slug, "own slug")] + [(f, "free slug of a premium build") for f in (free_slugs(slug) if kind != "core" else [])]
    any_data = False
    for qslug, why in slugs:
        d, err = wpvuln(kind, qslug, version)
        entry = {"slug": qslug, "why": why, "api": "wpvulnerability"}
        if err:
            entry["result"] = "error: " + err
        elif not d or (kind != "core" and not d.get("name") and not d.get("vulnerability")):
            entry["result"] = "no data"
        else:
            any_data = True
            vulns = d.get("vulnerability") or []
            entry["result"] = "%d advisories on record" % len(vulns)
            if kind != "core" and str(d.get("closed")) == "1":
                r["flags"].append("WPVulnerability marks %s closed: %s" % (qslug, d.get("closed_reason") or "no reason given"))
            for v in vulns:
                probe = hit_from(v, qslug)
                if SUPPLY.search(" ".join([probe["title"], probe["description"]] + [str(c) for c in probe["cwe"]])):
                    affects = True if kind == "core" else affected(version, v.get("operator"))
                    supply_signals.append(dict(probe, component="%s %s" % (kind, slug), version=version,
                                               affects_given_version="yes" if affects else ("unknown" if affects is None else "no (check the vendor, not only the range)")))
                m = True if kind == "core" else affected(version, v.get("operator"))
                if m is None:
                    r.setdefault("unmatched_ranges", 0)
                    r["unmatched_ranges"] += 1
                    continue
                if m:
                    h = hit_from(v, qslug)
                    h["match"] = "assumed shared code (free slug on a premium build)" if why != "own slug" else "version in range"
                    r["hits"].append(h)
        r["queries"].append(entry)
    if not any_data and wf is not None and kind in ("plugin", "theme", "core"):
        wf_hits = wordfence(kind, slug if kind != "core" else "wordpress", version)
        r["queries"].append({"slug": slug, "why": "fallback", "api": "wordfence feed", "result": "%d affecting" % len(wf_hits)})
        r["hits"].extend(wf_hits)
        any_data = any_data or bool(wf_hits)
    r["no_data"] = not any_data

    if use_wporg and kind in ("plugin", "theme"):
        info = {qs: wporg(kind, qs) for qs, _ in slugs}
        r["wporg"] = info
        own = info.get(slug) or {}
        bucket = str(c.get("bucket") or "")
        if own.get("status") == "unclaimed" and not c.get("update_uri"):
            r["flags"].append("slug unclaimed on wp.org and no Update URI: hijack risk (anyone can publish this slug and it is offered as an update)")
        if own.get("status") == "claimed" and not bucket.startswith("managed-wporg") and not c.get("update_uri"):
            r["flags"].append("slug is claimed on wp.org but this copy is not from wp.org: confirm it is the same product, or set Update URI")
        if own.get("status") == "closed":
            r["flags"].append("closed on wp.org (%s): no further updates through wp.org" % (own.get("reason") or "reason not given"))
        if own.get("days_since_update") is not None and own["days_since_update"] > 730:
            r["flags"].append("stale: last wp.org update %d days ago" % own["days_since_update"])
        for qs, why in slugs:
            latest = (info.get(qs) or {}).get("latest")
            if latest and major(latest) != major(version):
                r["flags"].append("version line: installed %s vs %s current %s on wp.org; confirm the same numbering before trusting range matches" % (version, qs, latest))
            elif latest and qs == slug and cmp(version, latest) > 0:
                r["flags"].append("installed %s is ahead of wp.org %s: fork, premium build or namesake" % (version, latest))
    if str(c.get("bucket") or "").startswith("custom") and r["hits"]:
        r["flags"].append("custom component with advisories under its slug: likely a namesake, verify against source")
    results.append(r)

# PHP end of life: a branch listed in php.net's active releases is supported; "security" means security fixes only
php = {"version": php_version or None, "status": "not supplied"}
if php_version:
    branch = ".".join(php_version.split(".")[:2])
    data, err = fetch("https://www.php.net/releases/active.php", "php-active.json")
    if err or not isinstance(data, dict):
        php["status"] = "lookup failed: %s" % err
    else:
        active = {b: v for major in data.values() if isinstance(major, dict) for b, v in major.items()}
        if branch in active:
            tags = [t for t in (active[branch].get("tags") or []) if t]
            php["status"] = "supported (security fixes only)" if "security" in tags else "supported (active)"
        else:
            php["status"] = "end of life (branch %s is not in php.net's active releases)" % branch
        php["active_branches"] = sorted(active)

with open(os.path.join(out, "vulns.json"), "w") as f:
    json.dump({"tool": "wp-project-security-audit/vuln-lookup.sh", "date": today.strftime("%Y-%m-%d"), "php": php,
               "supply_chain_signals": supply_signals, "components": results}, f, indent=2)

def md(s):
    return str(s if s is not None else "").replace("|", "\\|").replace("\n", " ")

with open(os.path.join(out, "vulns.md"), "w") as f:
    f.write("# Known-vulnerability lookup (%s)\n\n" % today.strftime("%Y-%m-%d"))
    f.write("Candidates, not findings: verify each hit against the production version and source before reporting.\n\n")
    f.write("## Supply-chain signals\n\n")
    if supply_signals:
        f.write("Advisories whose title, description or CWE suggests a backdoor, injected or malicious code, a compromised or sold plugin, or a hijacked update channel. Treat each as a vendor-compromise candidate (references/vendor-compromise.md) whether or not the version range matches.\n\n")
        f.write("| Component | Version | Queried slug | Advisory | CVE | CVSS | Affects given version |\n|---|---|---|---|---|---|---|\n")
        for h in sorted(supply_signals, key=sev_key):
            f.write("| %s | %s | %s | %s | %s | %s | %s |\n" % (md(h["component"]), md(h["version"]), md(h["queried_slug"]), md(h["title"]),
                    md(h.get("cve")), md(h.get("cvss")), h["affects_given_version"]))
    else:
        f.write("None found in advisory titles, descriptions or CWE ids. This is a keyword scan: it does not replace vendor-compromise.md.\n")
    f.write("\n## Affecting the given version (by severity, then CVSS)\n\n| Component | Version | Queried slug | Advisory | CVE | CVSS | Fixed in | Match |\n|---|---|---|---|---|---|---|---|\n")
    for r, h in sorted(((r, h) for r in results for h in r["hits"]), key=lambda rh: sev_key(rh[1])):
        if True:
            f.write("| %s %s | %s%s | %s | %s | %s | %s | %s | %s |\n" % (
                r["type"], md(r["slug"]), md(r.get("version")), " (production)" if r.get("version_source") else "",
                md(h["queried_slug"]), md(h["title"]), md(h.get("cve")), md(h.get("cvss")),
                "unfixed" if h.get("unfixed") else md(h.get("fixed_in")), md(h.get("match", h.get("feed", "")))))
    f.write("\n## Flags\n\n")
    for r in results:
        for fl in r["flags"]:
            f.write("- %s `%s` %s: %s\n" % (r["type"], md(r["slug"]), md(r.get("version")), md(fl)))
    f.write("\n## PHP\n\n- %s: %s\n" % (php["version"] or "production PHP version", php["status"]))
    f.write("\n## No advisory data\n\nNo data is not a clean bill: premium, custom and unlisted components need source review.\n\n")
    for r in results:
        if r.get("no_data") and r["type"] in ("plugin", "theme"):
            f.write("- %s `%s` %s (%s)\n" % (r["type"], md(r["slug"]), md(r.get("version")), md(r.get("bucket"))))

total_hits = sum(len(r["hits"]) for r in results)
print("Components: %d | with affecting advisories: %d | affecting hits: %d | assumed shared code: %d"
      % (len(results), sum(1 for r in results if r["hits"]), total_hits,
         sum(1 for r in results for h in r["hits"] if "assumed" in str(h.get("match")))))
print("No advisory data: %d | flagged: %d | unclaimed without Update URI: %d | closed (wp.org or WPVulnerability): %d"
      % (sum(1 for r in results if r.get("no_data")), sum(1 for r in results if r["flags"]),
         sum(1 for r in results for fl in r["flags"] if fl.startswith("slug unclaimed")),
         sum(1 for r in results if any(fl.startswith(("closed on wp.org", "WPVulnerability marks")) for fl in r["flags"]))))
# Authoritative candidate list: every affecting hit and every supply-chain signal, one row each.
# Section files must account for every row (candidate or dismissed with a reason).
rows = []
for r in results:
    for h in r["hits"]:
        rows.append((h, "%s %s" % (r["type"], r["slug"]), r.get("version"), r.get("version_source") or "as listed",
                     h.get("match") or h.get("feed") or ""))
for h in supply_signals:
    rows.append((h, h["component"], h["version"], "as listed", "supply-chain signal (affects given version: %s)" % h["affects_given_version"]))
with open(os.path.join(out, "candidates.tsv"), "w") as f:
    f.write("advisory_id\tcomponent\tversion\tversion_source\tseverity\tcvss\tmatch\tfixed_in\ttitle\n")
    for h, comp, ver, vsrc, match in sorted(rows, key=lambda x: sev_key(x[0])):
        f.write("\t".join(str(x if x is not None else "").replace("\t", " ").replace("\n", " ") for x in (
            h.get("advisory_id") or "no-id:" + str(h.get("title"))[:60], comp, ver, vsrc, h.get("severity"), h.get("cvss"),
            match, "unfixed" if h.get("unfixed") else h.get("fixed_in"), h.get("title"))) + "\n")
print("Candidates (authoritative list): %d rows in candidates.tsv" % len(rows))
print("Supply-chain signals: %d (%d affecting the given version)" % (len(supply_signals), sum(1 for x in supply_signals if x["affects_given_version"] == "yes")))
print("PHP: %s: %s" % (php["version"] or "-", php["status"]))
print("Wrote " + os.path.join(out, "vulns.json") + " and vulns.md")
PY

python3 "$PY_FILE" "$INVENTORY" "$LIST" "$OUT" "$PROD" "$PREMIUM" "$WFFEED" "$WPORG" "$DELAY" "$PHPV"
