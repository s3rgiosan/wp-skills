#!/usr/bin/env bash
# bundled-libs.sh: bundled JavaScript and PHP library versions in every component.
#
# Walks every plugin, theme and must-use directory (vendor/ included, node_modules/
# excluded), matches file names against the signature table in
# references/bundled-libraries.md, reads each library's version from the file, and
# lists library, version, component, bucket and path. With --osv, asks the public
# OSV database for advisories affecting that package and version.
#
# Usage:
#   bash bundled-libs.sh --root <project> [--inventory <inventory.json>] [--out <dir>] [--osv]
#
# Output: <out>/bundled-libs.json and <out>/bundled-libs.md. Read-only on the project.

set -euo pipefail

ROOT=""
INVENTORY=""
OUT=""
OSV=0
while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="${2:?}"; shift 2 ;;
    --inventory) INVENTORY="${2:?}"; shift 2 ;;
    --out) OUT="${2:?}"; shift 2 ;;
    --osv) OSV=1; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$ROOT" ] && [ -d "$ROOT" ] || { echo "Pass --root <project directory>" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "python3 is required" >&2; exit 2; }
SIGNATURES="$(cd "$(dirname "$0")/.." && pwd)/references/bundled-libraries.md"
[ -f "$SIGNATURES" ] || { echo "Signature table not found: $SIGNATURES" >&2; exit 2; }
if [ -z "$OUT" ]; then
  OUT="$(mktemp -d "${TMPDIR:-/tmp}/wp-project-security-audit.XXXXXX")"
fi
OUT_PARENT="$(cd "$(dirname "$OUT")" 2>/dev/null && pwd -P)" || { echo "The parent of --out must exist" >&2; exit 2; }
OUT="$OUT_PARENT/$(basename "$OUT")"
ROOT_REAL="$(cd "$ROOT" && pwd -P)"
case "$OUT/" in
  "$ROOT_REAL"/*) echo "Refusing to write inside the audited project: choose --out outside $ROOT_REAL" >&2; exit 2 ;;
esac
mkdir -p "$OUT"

PY_FILE="$(mktemp "${TMPDIR:-/tmp}/wp-bundled-libs.XXXXXX")"
trap 'rm -f "$PY_FILE"' EXIT INT TERM
cat > "$PY_FILE" <<'PY'
import json, os, re, sys, time, urllib.request

root, inventory, out, osv, sig_file = sys.argv[1:6]
root = os.path.realpath(root)
osv = osv == "1"

# Signature table between the markers in references/bundled-libraries.md
text = open(sig_file).read()
block = text.split("<!-- signatures:start -->", 1)[1].split("<!-- signatures:end -->", 1)[0]
sigs = []
for line in block.splitlines():
    line = line.strip()
    if not line.startswith("|") or line.startswith("|---") or line.startswith("| Library"):
        continue
    cells = [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", line.strip("|"))]
    if len(cells) < 4:
        continue
    name, package, fpat, vpat = cells[:4]
    sigs.append({"library": name, "package": package, "file": re.compile(fpat.strip("`"), re.I),
                 "version": re.compile(vpat.strip("`"))})

# Components to scan
components = []
if inventory:
    for c in json.load(open(inventory)).get("components", []):
        if c["type"] in ("plugin", "theme", "mu-plugin"):
            components.append((c["type"], c["slug"], c.get("bucket_guess"), os.path.join(root, c["path"])))
else:
    for kind, sub in (("plugin", "plugins"), ("theme", "themes"), ("mu-plugin", "mu-plugins")):
        for base in (os.path.join(root, sub), os.path.join(root, "wp-content", sub), os.path.join(root, "web", "app", sub)):
            if os.path.isdir(base):
                for entry in sorted(os.listdir(base)):
                    components.append((kind, entry, None, os.path.join(base, entry)))

found = []
for kind, slug, bucket, path in components:
    walker = os.walk(path) if os.path.isdir(path) else [(os.path.dirname(path), [], [os.path.basename(path)])]
    for d, dirs, files in walker:
        dirs[:] = [x for x in dirs if x not in ("node_modules", ".git")]
        for f in files:
            full = os.path.join(d, f)
            relp = os.path.relpath(full, root)
            # Vendors often put the version in the file name (library-1.2.3.js, slider-2.0.0.min.js);
            # match the signature against the name with that segment removed as well.
            bare = os.path.join(os.path.dirname(relp), re.sub(r"[-_.]v?[0-9]+(?:\.[0-9]+)+", "", os.path.basename(relp)))
            for sig in sigs:
                if not (sig["file"].search(relp) or sig["file"].search(bare)):
                    continue
                version = None
                try:
                    with open(full, "rb") as fh:
                        head = fh.read(262144).decode("utf-8", "replace")
                    m = sig["version"].search(head)
                    if m:
                        version = next((g for g in m.groups() if g), None)
                except OSError:
                    pass
                found.append({"library": sig["library"], "package": sig["package"], "version": version or "unknown",
                              "component_type": kind, "component": slug, "bucket": bucket, "path": relp})
                break

cache = {}
if osv:
    for item in found:
        pkg = item["package"]
        if pkg in ("", "-") or item["version"] == "unknown" or ":" not in pkg:
            continue
        eco, name = pkg.split(":", 1)
        key = (eco, name, item["version"])
        if key not in cache:
            body = json.dumps({"package": {"name": name, "ecosystem": {"npm": "npm", "packagist": "Packagist"}.get(eco, eco)},
                               "version": item["version"]}).encode()
            req = urllib.request.Request("https://api.osv.dev/v1/query", data=body,
                                         headers={"Content-Type": "application/json", "User-Agent": "wp-project-security-audit/1.0"})
            try:
                with urllib.request.urlopen(req, timeout=25) as r:
                    vulns = json.load(r).get("vulns") or []
                cache[key] = [{"id": v.get("id"), "aliases": v.get("aliases") or [], "summary": (v.get("summary") or "")[:160]} for v in vulns]
            except Exception as e:
                cache[key] = [{"id": "lookup failed", "aliases": [], "summary": str(e)[:120]}]
            time.sleep(0.3)
        item["osv"] = cache[key]

json.dump({"tool": "wp-project-security-audit/bundled-libs.sh", "libraries": found}, open(os.path.join(out, "bundled-libs.json"), "w"), indent=2)
with open(os.path.join(out, "bundled-libs.md"), "w") as f:
    f.write("# Bundled libraries\n\nCandidates: confirm the version in the file, check the library's own advisories, and confirm the file is loaded before rating.\n\n")
    f.write("| Library | Version | Component | Bucket | Path | OSV advisories |\n|---|---|---|---|---|---|\n")
    for i in sorted(found, key=lambda x: (-len(x.get("osv") or []), x["library"], x["component"])):
        adv = ", ".join((a["aliases"] or [a["id"]])[0] for a in (i.get("osv") or [])[:6]) if osv else "not queried"
        f.write("| %s | %s | %s %s | %s | `%s` | %s |\n" % (i["library"], i["version"], i["component_type"], i["component"],
                i["bucket"] or "", i["path"], adv or "none"))
# Authoritative candidate list: one row per OSV advisory on a bundled copy.
rows = [(a, i) for i in found for a in (i.get("osv") or []) if a["id"] != "lookup failed"]
with open(os.path.join(out, "candidates.tsv"), "w") as f:
    f.write("advisory_id\tcomponent\tlibrary\tversion\tpath\tsummary\n")
    for a, i in rows:
        f.write("\t".join(str(x).replace("\t", " ") for x in ((a["aliases"] or [a["id"]])[0], "%s %s" % (i["component_type"], i["component"]),
                i["library"], i["version"], i["path"], a["summary"])) + "\n")
print("Candidates (authoritative list): %d rows in candidates.tsv" % len(rows))
print("Components scanned: %d | libraries found: %d | version unknown: %d | with OSV advisories: %s"
      % (len(components), len(found), sum(1 for i in found if i["version"] == "unknown"),
         sum(1 for i in found if i.get("osv")) if osv else "not queried"))
print("Wrote " + os.path.join(out, "bundled-libs.json") + " and bundled-libs.md")
PY

python3 "$PY_FILE" "$ROOT" "$INVENTORY" "$OUT" "$OSV" "$SIGNATURES"
