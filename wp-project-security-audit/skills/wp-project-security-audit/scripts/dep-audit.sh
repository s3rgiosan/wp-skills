#!/usr/bin/env bash
# dep-audit.sh: dependency advisories for every lockfile in a WordPress project.
#
# Runs `composer audit --locked` for each composer.lock and
# `npm audit --package-lock-only` for each package-lock.json, then classifies
# every advisory as runtime or dev and says whether it ships to production:
# dev packages present in a committed vendor/, or installed by a build that runs
# `composer install` without --no-dev, ship; npm devDependencies are build tooling.
#
# Usage:
#   bash dep-audit.sh --root <project> [--out <dir>] [--inventory <inventory.json>]
#                     [--include-dependency-locks]
#
#   --root                      Project root (same as inventory.sh).
#   --out                       Output directory (default: a new temp dir). Refused if inside --root.
#   --inventory                 inventory.json from inventory.sh (lockfile list and owning component).
#   --include-dependency-locks  Also audit lockfiles found inside vendor/ trees.
#
# Output: <out>/dep-audit.json, <out>/dep-audit.md, raw tool output in <out>/raw/.
# Never installs or updates packages. composer runs with --no-plugins.

set -euo pipefail

ROOT=""
OUT=""
INVENTORY=""
DEPLOCKS=0

while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="${2:?}"; shift 2 ;;
    --out) OUT="${2:?}"; shift 2 ;;
    --inventory) INVENTORY="${2:?}"; shift 2 ;;
    --include-dependency-locks) DEPLOCKS=1; shift ;;
    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$ROOT" ] || { echo "Missing --root" >&2; exit 2; }
[ -d "$ROOT" ] || { echo "Not a directory: $ROOT" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "python3 is required" >&2; exit 2; }
if [ -z "$OUT" ]; then
  OUT="$(mktemp -d "${TMPDIR:-/tmp}/wp-project-audit.XXXXXX")"
fi
OUT_PARENT="$(cd "$(dirname "$OUT")" 2>/dev/null && pwd -P)" || { echo "The parent of --out must exist" >&2; exit 2; }
OUT="$OUT_PARENT/$(basename "$OUT")"
ROOT_REAL="$(cd "$ROOT" && pwd -P)"
case "$OUT/" in
  "$ROOT_REAL"/*) echo "Refusing to write inside the audited project: choose --out outside $ROOT_REAL" >&2; exit 2 ;;
esac
mkdir -p "$OUT/raw"

PY=$(cat <<'PY'
import json, os, re, shutil, subprocess, sys

root, out, inventory, deplocks = sys.argv[1:5]
root = os.path.realpath(root)
out = os.path.realpath(out)
deplocks = deplocks == "1"
if out == root or out.startswith(root + os.sep):
    sys.exit("Refusing to write inside the audited project: choose --out outside " + root)
raw = os.path.join(out, "raw")

def run(cmd, cwd, timeout=180, env=None):
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)
        return p.returncode, p.stdout, p.stderr
    except (OSError, subprocess.TimeoutExpired) as e:
        return 127, "", str(e)

def rel(p):
    return os.path.relpath(p, root)

tracked = None
rc, so, _ = run(["git", "-C", root, "rev-parse", "--show-toplevel"], root)
if rc == 0:
    git_root = so.strip()
    rc, so2, _ = run(["git", "-C", root, "ls-files", "-z", "--full-name"], root)
    if rc == 0:
        tracked = {os.path.realpath(os.path.join(git_root, f)) for f in so2.split("\0") if f}

def is_tracked(path):
    if tracked is None:
        return None
    path = os.path.realpath(path)
    prefix = path + os.sep
    return path in tracked or any(t.startswith(prefix) for t in tracked)

# Lockfiles
locks = []
if inventory:
    inv = json.load(open(inventory))
    for lf in inv.get("lockfiles", []):
        locks.append(lf)
else:
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in ("node_modules", ".git")]
        for f in files:
            if f in ("composer.lock", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml"):
                r = rel(os.path.join(d, f))
                locks.append({"path": r, "type": f, "inside_dependency": "/vendor/" in "/" + r, "component": None})

# Build flags: composer install/update without --no-dev in build, deploy and CI files
build_flags = []
SCAN_NAMES = re.compile(r"(\.sh|\.ya?ml|Makefile|Dockerfile|Jenkinsfile|package\.json|composer\.json|\.bash)$")
for d, dirs, files in os.walk(root):
    dirs[:] = [x for x in dirs if x not in ("node_modules", ".git", "vendor")]
    for f in files:
        p = os.path.join(d, f)
        if not SCAN_NAMES.search(f):
            continue
        try:
            if os.path.getsize(p) > 2_000_000:
                continue
            lines = open(p, encoding="utf-8", errors="replace").read().splitlines()
        except OSError:
            continue
        for i, line in enumerate(lines, 1):
            if re.search(r"\bcomposer(\.phar)?\s+(install|update|i)\b", line) and "--no-dev" not in line and not line.strip().startswith("#"):
                build_flags.append({"file": rel(p), "line": i, "issue": "composer install/update without --no-dev: require-dev packages are installed wherever this runs",
                                    "command": re.sub(r"\s+", " ", line.strip())[:160],
                                    "context": " ".join(lines[max(0, i - 6):i])})

# A build flag applies to a lockfile when it lives in the same directory tree as the
# lockfile, or when its command or the lines just before it name the lockfile's directory.
def flags_for(lock_rel):
    lock_dir = os.path.dirname(lock_rel)
    hits = []
    for b in build_flags:
        flag_dir = os.path.dirname(b["file"])
        same_tree = lock_dir == flag_dir or (lock_dir and (flag_dir + "/").startswith(lock_dir + "/")) or (not lock_dir and not re.match(r"(plugins|themes|mu-plugins)/", b["file"]))
        named = bool(lock_dir) and lock_dir in b["context"]
        if same_tree or named:
            hits.append("%s:%d" % (b["file"], b["line"]))
    return hits

def composer_audit(lock_dir):
    composer = shutil.which("composer")
    if not composer:
        return None, "composer not available"
    if not os.path.isfile(os.path.join(lock_dir, "composer.json")):
        return None, "no composer.json next to the lockfile"
    rc, so, se = run([composer, "audit", "--locked", "--format=json", "--no-interaction", "--no-plugins",
                      "--working-dir=" + lock_dir], lock_dir)
    try:
        return json.loads(so or "{}"), None
    except ValueError:
        return None, "composer audit failed: " + ((se or so).strip().splitlines() or ["no output"])[-1][:200]

def npm_audit(lock_dir):
    npm = shutil.which("npm")
    if not npm:
        return None, "npm not available"
    if not os.path.isfile(os.path.join(lock_dir, "package.json")):
        return None, "no package.json next to the lockfile"
    env = dict(os.environ, npm_config_update_notifier="false", npm_config_fund="false")
    rc, so, se = run([npm, "audit", "--package-lock-only", "--json"], lock_dir, env=env)
    try:
        return json.loads(so or "{}"), None
    except ValueError:
        return None, "npm audit failed: " + ((se or so).strip().splitlines() or ["no output"])[-1][:200]

results = []
for lf in locks:
    path = os.path.join(root, lf["path"])
    lock_dir = os.path.dirname(path)
    entry = {"lockfile": lf["path"], "type": lf["type"], "component": lf.get("component"),
             "tracked": lf.get("tracked", is_tracked(path)), "advisories": [], "abandoned": [], "status": "audited"}
    if lf.get("inside_dependency") and not deplocks:
        entry["status"] = "skipped: inside a vendor/ tree (use --include-dependency-locks)"
        results.append(entry)
        continue
    if lf["type"] == "composer.lock":
        try:
            lock = json.load(open(path))
        except (OSError, ValueError) as e:
            entry["status"] = "unreadable lockfile: %s" % e
            results.append(entry)
            continue
        runtime = {p["name"]: p.get("version") for p in lock.get("packages", [])}
        dev = {p["name"]: p.get("version") for p in lock.get("packages-dev", [])}
        vendor_dir = "vendor"
        try:
            cj = json.load(open(os.path.join(lock_dir, "composer.json")))
            vendor_dir = (cj.get("config") or {}).get("vendor-dir", "vendor")
        except (OSError, ValueError):
            pass
        vpath = os.path.join(lock_dir, vendor_dir)
        vendor_tracked = is_tracked(vpath) if os.path.isdir(vpath) else False
        dev_on_disk = sorted(n for n in dev if os.path.isdir(os.path.join(vpath, n)))
        dev_tracked = sorted(n for n in dev_on_disk if is_tracked(os.path.join(vpath, n)))
        lock_flags = flags_for(lf["path"])
        entry["build_flags"] = lock_flags
        entry["vendor"] = {"dir": rel(vpath), "on_disk": os.path.isdir(vpath), "tracked": vendor_tracked,
                           "dev_packages": len(dev), "dev_packages_on_disk": len(dev_on_disk),
                           "dev_packages_tracked": dev_tracked}
        data, err = composer_audit(lock_dir)
        if err:
            entry["status"] = err
            results.append(entry)
            continue
        json.dump(data, open(os.path.join(raw, "composer-" + lf["path"].replace("/", "__") + ".json"), "w"), indent=1)
        adv = data.get("advisories") or {}
        if isinstance(adv, list):
            adv = {}
        for pkg, items in adv.items():
            items = items.values() if isinstance(items, dict) else items
            for a in items:
                scope = "dev" if pkg in dev else "runtime"
                if scope == "runtime":
                    ships = "yes (runtime dependency)"
                elif pkg in dev_tracked:
                    ships = "yes: dev package committed in vendor/"
                elif lock_flags:
                    ships = "check: build installs require-dev at " + ", ".join(lock_flags[:3])
                elif pkg in dev_on_disk:
                    ships = ("on disk from local development only: no build step installing require-dev found for this lockfile; "
                             "check the deploy copies from a clean build, not a working copy")
                else:
                    ships = "no (dev only)"
                entry["advisories"].append({"package": pkg, "installed": runtime.get(pkg) or dev.get(pkg), "scope": scope,
                                            "ships": ships, "severity": a.get("severity"), "title": a.get("title"),
                                            "cve": a.get("cve"), "affected": a.get("affectedVersions"), "link": a.get("link"),
                                            "advisory_id": a.get("cve") or a.get("advisoryId") or "%s@%s" % (pkg, runtime.get(pkg) or dev.get(pkg))})
        ab = data.get("abandoned") or {}
        if isinstance(ab, dict):
            entry["abandoned"] = [{"package": k, "replacement": v, "scope": "dev" if k in dev else "runtime"} for k, v in ab.items()]
    elif lf["type"] in ("package-lock.json", "npm-shrinkwrap.json"):
        try:
            lock = json.load(open(path))
        except (OSError, ValueError) as e:
            entry["status"] = "unreadable lockfile: %s" % e
            results.append(entry)
            continue
        pk = lock.get("packages") or {}
        entry["lockfile_version"] = lock.get("lockfileVersion")
        data, err = npm_audit(lock_dir)
        if err:
            entry["status"] = err
            results.append(entry)
            continue
        json.dump(data, open(os.path.join(raw, "npm-" + lf["path"].replace("/", "__") + ".json"), "w"), indent=1)
        for name, v in (data.get("vulnerabilities") or {}).items():
            nodes = v.get("nodes") or []
            devs = [bool((pk.get(n) or {}).get("dev")) for n in nodes] if pk else []
            if devs and all(devs):
                scope, ships = "dev", "no (build tooling), unless node_modules deploys"
            elif devs:
                scope, ships = "runtime", "frontend if bundled into built assets"
            else:
                scope, ships = "unknown", "check: lockfile has no per-package dev flag"
            titles = [x.get("title") for x in v.get("via") or [] if isinstance(x, dict)]
            links = [x.get("url") for x in v.get("via") or [] if isinstance(x, dict) and x.get("url")]
            version = (pk.get(nodes[0]) or {}).get("version") if nodes and pk else None
            entry["advisories"].append({"package": name, "installed": version, "scope": scope, "ships": ships,
                                        "severity": v.get("severity"), "title": "; ".join(t for t in titles if t)[:200] or "via " + ", ".join(str(x) for x in v.get("via") or [])[:120],
                                        "direct": v.get("isDirect"), "affected": v.get("range"), "link": links[0] if links else None,
                                        "fix_available": bool(v.get("fixAvailable")),
                                        "advisory_id": (links[0].rstrip("/").rsplit("/", 1)[-1] if links else "%s@%s" % (name, version))})
    else:
        entry["status"] = "not audited: no read-only audit command wired for %s; audit it manually" % lf["type"]
    results.append(entry)

summary = {}
for e in results:
    for a in e["advisories"]:
        key = (a["scope"], str(a["severity"]).lower(), a["ships"].split(":")[0].split(" (")[0])
        summary[key] = summary.get(key, 0) + 1

for b in build_flags:
    b.pop("context", None)
# Authoritative candidate list: advisories whose Ships value is not a plain "no". Dev-only rows stay in dep-audit.json.
cand = [(e, a) for e in results for a in e["advisories"] if not a["ships"].startswith("no")]
with open(os.path.join(out, "candidates.tsv"), "w") as f:
    f.write("advisory_id\tlockfile\tpackage\tinstalled\tseverity\tscope\tships\ttitle\n")
    rank = {"critical": 0, "high": 1, "moderate": 2, "medium": 2, "low": 3}
    for e, a in sorted(cand, key=lambda ea: rank.get(str(ea[1]["severity"]).lower(), 4)):
        f.write("\t".join(str(x if x is not None else "").replace("\t", " ") for x in (a.get("advisory_id"), e["lockfile"], a["package"],
                a["installed"], a["severity"], a["scope"], a["ships"], a.get("cve") or a.get("title"))) + "\n")
print("Candidates (authoritative list, ships or needs a check): %d rows in candidates.tsv" % len(cand))
json.dump({"tool": "wp-project-audit/dep-audit.sh", "build_flags": build_flags, "lockfiles": results},
          open(os.path.join(out, "dep-audit.json"), "w"), indent=2)

def md(s):
    return str(s if s is not None else "").replace("|", "\\|").replace("\n", " ")

with open(os.path.join(out, "dep-audit.md"), "w") as f:
    f.write("# Dependency audit\n\nCandidates, not findings. Rate by the Ships column: a dev-only advisory that never reaches production is Info.\n\n")
    f.write("## Build flags\n\n")
    for b in build_flags:
        f.write("- `%s:%d` %s: `%s`\n" % (b["file"], b["line"], b["issue"], md(b["command"])))
    if not build_flags:
        f.write("None found.\n")
    f.write("\n## Lockfiles\n\n| Lockfile | Component | Status | Advisories | Dev packages committed |\n|---|---|---|---|---|\n")
    for e in results:
        comp = e.get("component") or {}
        v = e.get("vendor") or {}
        f.write("| `%s` | %s | %s | %d | %s |\n" % (e["lockfile"], md(comp.get("slug", "project")), md(e["status"]),
                len(e["advisories"]), len(v.get("dev_packages_tracked", [])) if v else "n/a"))
    f.write("\n## Advisories\n\n| Lockfile | Package | Installed | Severity | Scope | Ships | Advisory |\n|---|---|---|---|---|---|---|\n")
    for e in results:
        for a in sorted(e["advisories"], key=lambda a: (a["scope"] != "runtime", str(a["severity"]))):
            f.write("| `%s` | %s | %s | %s | %s | %s | %s |\n" % (e["lockfile"], md(a["package"]), md(a["installed"]),
                    md(a["severity"]), a["scope"], md(a["ships"]), md(a.get("cve") or a.get("title"))))

print("Lockfiles: %d | audited: %d | skipped or failed: %d | advisories: %d | build flags: %d"
      % (len(results), sum(1 for e in results if e["status"] == "audited"), sum(1 for e in results if e["status"] != "audited"),
         sum(len(e["advisories"]) for e in results), len(build_flags)))
for (scope, sev, ships), n in sorted(summary.items()):
    print("  %-8s %-9s %-40s %d" % (scope, sev, ships, n))
print("Wrote " + os.path.join(out, "dep-audit.json") + " and dep-audit.md")
PY
)

python3 -c "$PY" "$ROOT" "$OUT" "$INVENTORY" "$DEPLOCKS"
