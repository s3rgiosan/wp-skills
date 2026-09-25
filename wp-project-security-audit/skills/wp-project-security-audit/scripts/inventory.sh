#!/usr/bin/env bash
# inventory.sh: read-only component inventory of a WordPress project.
#
# Detects the root shape (wp-content repo, full site root, Bedrock-style web/app),
# reads plugin, theme, must-use and drop-in headers, guesses each component's
# source bucket (git-tracked, composer.lock source, premium artifact), lists every
# lockfile, CI and deploy file, and reads active status per site through WP-CLI or
# a read-only database query. Components it cannot confirm are marked "unverified".
# Also records role counts (numbers only), registration settings, platform state
# (PHP constraints, core version), files outside wp-content, drop-ins, dependency
# monitoring, existing scanner configs, infrastructure-as-code files, development
# tools and activity-log plugins, and plugins missing from an approved list.
#
# Usage:
#   bash inventory.sh --root <project> [--out <dir>] [--wp-root <dir>]
#                     [--db-fallback] [--mysql-bin <path>] [--db-socket <path>] [--db-port <n>] [--no-wp-cli]
#                     [--custom <slug,slug>] [--custom-prefix <prefix>]
#                     [--approved <file>] [--php-version <x.y>]
#
#   --root           Project root: a wp-content repo, a full site root, or a Bedrock root.
#   --out            Output directory (default: a new temp dir). Refused if inside --root.
#   --wp-root        WordPress core directory, when it is not found automatically.
#   --db-fallback    When WP-CLI cannot read active status, query the database directly.
#                    Credentials are read statically from wp-config.php (or a Bedrock .env),
#                    written to a mode-600 option file in a temp folder under --out, passed
#                    to the client as --defaults-extra-file only, and deleted on exit. They
#                    are never printed and never placed on a command line. SELECT and SHOW only.
#   --mysql-bin      Path to the mysql client (default: mysql on PATH).
#   --db-socket      Socket path, when the local server listens somewhere other than DB_HOST says.
#   --db-port        TCP port, same purpose.
#   --no-wp-cli      Skip WP-CLI (it loads wp-config.php and must-use plugins).
#   --custom         Slugs the owner confirmed as custom (project-owned).
#   --custom-prefix  Slug prefix of project-owned components, for example "acme-".
#   --approved       Approved plugin list from the owner, one slug per line.
#   --production-export  The root is a copy of production files (not a developer checkout): every local
#                    artifact found is on production and is a candidate.
#   --php-version    PHP version production runs (from the owner or the host), for example 8.2.
#
# Output: <out>/inventory.json, <out>/inventory.tsv, counts on stdout.
# Changes nothing in the project. Starts no services.

set -euo pipefail

ROOT=""
OUT=""
WP_ROOT=""
DB_FALLBACK=0
MYSQL_BIN=""
DB_SOCKET=""
DB_PORT=""
USE_WPCLI=1
CUSTOM=""
CUSTOM_PREFIX=""
APPROVED=""
PROD_EXPORT=0
PHP_VERSION=""

while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="${2:?}"; shift 2 ;;
    --out) OUT="${2:?}"; shift 2 ;;
    --wp-root) WP_ROOT="${2:?}"; shift 2 ;;
    --db-fallback) DB_FALLBACK=1; shift ;;
    --mysql-bin) MYSQL_BIN="${2:?}"; shift 2 ;;
    --db-socket) DB_SOCKET="${2:?}"; shift 2 ;;
    --db-port) DB_PORT="${2:?}"; shift 2 ;;
    --mysql) echo "--mysql was removed: never put database credentials on a command line. Use --db-fallback." >&2; exit 2 ;;
    --no-wp-cli) USE_WPCLI=0; shift ;;
    --custom) CUSTOM="${2:?}"; shift 2 ;;
    --custom-prefix) CUSTOM_PREFIX="${2:?}"; shift 2 ;;
    --approved) APPROVED="${2:?}"; shift 2 ;;
    --production-export) PROD_EXPORT=1; shift ;;
    --php-version) PHP_VERSION="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,43p' "$0"; exit 0 ;;
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
mkdir -p "$OUT"
# The database option file lives under $OUT/.db-tmp-*; remove it however the script exits.
PY_FILE="$(mktemp "${TMPDIR:-/tmp}/wp-inventory.XXXXXX")"
trap 'rm -rf "$OUT"/.db-tmp-* "$PY_FILE" 2>/dev/null' EXIT INT TERM

cat > "$PY_FILE" <<'PY'
import json, os, re, shlex, shutil, subprocess, sys

root, out, wp_root_arg, db_fallback, use_wpcli, custom, custom_prefix, approved_file, php_version, mysql_bin, db_socket, db_port, prod_export = sys.argv[1:14]
prod_export = prod_export == "1"
db_fallback = db_fallback == "1"
root = os.path.realpath(root)
out = os.path.realpath(out)
use_wpcli = use_wpcli == "1"
custom = {s.strip() for s in custom.split(",") if s.strip()}

if out == root or out.startswith(root + os.sep):
    sys.exit("Refusing to write inside the audited project: choose --out outside " + root)

def rel(p):
    return os.path.relpath(p, root)

def read_head(path, size=8192):
    try:
        with open(path, "rb") as f:
            return f.read(size).decode("utf-8", "replace")
    except OSError:
        return ""

HEADER_KEYS = ["Plugin Name", "Theme Name", "Version", "Author", "Author URI", "Plugin URI",
               "Theme URI", "Update URI", "Text Domain", "Requires at least", "Requires PHP",
               "Template", "Network"]

def headers(text):
    found = {}
    for key in HEADER_KEYS:
        m = re.search(r"^[ \t/*#@]*" + re.escape(key) + r"\s*:\s*(.+)$", text, re.M | re.I)
        if m:
            found[key] = m.group(1).strip().rstrip("*/").strip()
    return found

def run(cmd, cwd=None, timeout=60):
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, p.stdout, p.stderr
    except (OSError, subprocess.TimeoutExpired) as e:
        return 127, "", str(e)

# Root shape
shape, content_dir, wp_root = "unknown", None, None
if os.path.isfile(os.path.join(root, "wp-includes", "version.php")) and os.path.isdir(os.path.join(root, "wp-content")):
    shape, content_dir, wp_root = "site-root", os.path.join(root, "wp-content"), root
elif os.path.isdir(os.path.join(root, "web", "app")):
    shape, content_dir = "bedrock", os.path.join(root, "web", "app")
    if os.path.isfile(os.path.join(root, "web", "wp", "wp-includes", "version.php")):
        wp_root = os.path.join(root, "web", "wp")
elif os.path.isdir(os.path.join(root, "plugins")) or os.path.isdir(os.path.join(root, "themes")):
    shape, content_dir = "wp-content", root
    parent = os.path.dirname(root)
    if os.path.isfile(os.path.join(parent, "wp-includes", "version.php")):
        wp_root = parent
else:
    sys.exit("Could not detect a WordPress layout under " + root)
if wp_root_arg:
    wp_root = os.path.realpath(wp_root_arg)

# Git
git_root, tracked = None, None
rc, so, _ = run(["git", "-C", root, "rev-parse", "--show-toplevel"])
if rc == 0:
    git_root = so.strip()
    rc, so, _ = run(["git", "-C", root, "ls-files", "-z", "--full-name"], timeout=120)
    if rc == 0:
        tracked = set()
        for f in so.split("\0"):
            if f:
                tracked.add(os.path.realpath(os.path.join(git_root, f)))

def is_tracked(path):
    if tracked is None:
        return None
    path = os.path.realpath(path)
    if path in tracked:
        return True
    prefix = path + os.sep
    return any(t.startswith(prefix) for t in tracked)

# Local artifacts (dumps, archives, logs, backups, exports, IDE and OS files). One rule decides whether
# they are candidates: tracked in git (now or in history), or present on production. Untracked local
# files are recorded as ignored and never become candidates. Their contents are never read.
def in_history(path):
    if not git_root:
        return False
    rc, so, _ = run(["git", "-C", git_root, "log", "--all", "-1", "--format=%h", "--", os.path.relpath(os.path.realpath(path), git_root)], timeout=60)
    return rc == 0 and bool(so.strip())

def artifact(path, kind, location="project", check_history=True):
    try:
        size = os.path.getsize(path) if os.path.isfile(path) else None
    except OSError:
        size = None
    trk = is_tracked(path)
    inside_repo = bool(git_root) and os.path.realpath(path).startswith(os.path.realpath(git_root) + os.sep)
    tracked = "n/a" if trk is None else ("yes" if trk and inside_repo else "no")
    hist = "no"
    if tracked == "no" and inside_repo and check_history and in_history(path):
        hist = "yes"
    if prod_export:
        location, status = "production", "candidate: present on production"
    elif tracked == "yes":
        status = "candidate: tracked in git"
    elif hist == "yes":
        status = "candidate: in git history (secrets-scan rule)"
    elif tracked == "n/a":
        status = "ignored: not a git repository and not a production export (untracked local file)"
    else:
        status = "ignored: untracked local file"
    return {"path": os.path.relpath(path, root), "kind": kind, "bytes": size, "tracked": tracked,
            "in_git_history": hist, "location": location, "status": status}

ARTIFACT_KINDS = [("log", re.compile(r"\.log(\.\d+)?$", re.I)),
                  ("backup", re.compile(r"(\.bak|\.old|\.orig|\.save|~|\.swp)$", re.I)),
                  ("archive", re.compile(r"\.(tar|tar\.gz|tgz|7z|rar|gz)$", re.I)),
                  ("export", re.compile(r"(^|/)uploads/.*\.(csv|xlsx?)$", re.I)),
                  ("ide or os file", re.compile(r"(^|/)(\.DS_Store|Thumbs\.db|desktop\.ini)$|(^|/)\.(idea|vscode)/", re.I))]
artifacts, seen_artifact_dirs = [], set()

# Files on disk, skipping dependency trees
SKIP_DIRS = {"node_modules", ".git"}
def walk(base, skip_vendor=False):
    for d, dirs, files in os.walk(base):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS and not (skip_vendor and x == "vendor")]
        for f in files:
            yield os.path.join(d, f)

# Lockfiles, CI, deploy, hosting hints, database dumps
LOCKS = {"composer.lock", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml"}
lockfiles, ci_files, deploy_files, hosting, dumps, zips = [], [], [], [], [], []
monitoring, scanners, iac = [], [], []
MONITORING = re.compile(r"(^|/)(\.github/dependabot\.ya?ml|renovate\.json5?|\.renovaterc(\.json)?|\.github/renovate\.json5?|\.gitlab/renovate\.json5?|\.snyk)$")
SCANNERS = re.compile(r"(^|/)(sonar-project\.properties|\.sonarcloud\.properties|\.snyk|\.github/workflows/[^/]*(codeql|sonar|snyk|semgrep|security)[^/]*\.ya?ml|\.github/codeql/|\.semgrep\.ya?ml|[^/]+\.sarif)$", re.I)
IAC = [("terraform", re.compile(r"\.(tf|tfvars)$")), ("pulumi", re.compile(r"(^|/)Pulumi(\.[^/]+)?\.ya?ml$")),
       ("helm", re.compile(r"(^|/)Chart\.ya?ml$")), ("docker", re.compile(r"(^|/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml)$"))]
HOSTING_HINTS = {
    "wpengine": re.compile(r"(^|/)(\.wpe-|wpengine|mu-plugins/wpengine-common)", re.I),
    "pantheon": re.compile(r"(^|/)(pantheon\.ya?ml|mu-plugins/pantheon)", re.I),
    "wordpress-vip": re.compile(r"(^|/)(vip-config/|client-mu-plugins/)", re.I),
    "platform.sh / upsun": re.compile(r"(^|/)\.platform(\.app)?\.ya?ml$|(^|/)\.upsun/", re.I),
    "kinsta": re.compile(r"(^|/)mu-plugins/kinsta", re.I),
    "docker": re.compile(r"(^|/)(docker-compose\.ya?ml|Dockerfile)$", re.I),
    "lando / ddev": re.compile(r"(^|/)(\.lando\.ya?ml|\.ddev/)", re.I),
}
for path in walk(root):
    r = rel(path)
    name = os.path.basename(path)
    if name in LOCKS:
        lockfiles.append({"path": r, "type": name, "tracked": is_tracked(path),
                          "inside_dependency": "/vendor/" in "/" + r or r.startswith("vendor/")})
    if re.search(r"(^|/)(\.gitlab-ci\.ya?ml|\.github/workflows/[^/]+\.ya?ml|bitbucket-pipelines\.yml|\.circleci/config\.yml|Jenkinsfile|buddy\.ya?ml|\.buildkite/)", r) and "/vendor/" not in "/" + r:
        ci_files.append(r)
    if "/vendor/" not in "/" + r and re.search(r"(^|/)(deploy[^/]*\.(sh|ya?ml|php|js)|[^/]*exclude[^/]*\.txt|\.distignore|\.deployignore|\.rsyncignore|build[^/]*\.sh)$", r, re.I):
        deploy_files.append(r)
    for label, rx in HOSTING_HINTS.items():
        if rx.search(r) and label not in hosting:
            hosting.append(label)
    if re.search(r"\.(sql|sql\.gz|sql\.zip|sql\.bz2|dump)$", name, re.I):
        try:
            size = os.path.getsize(path)
        except OSError:
            size = None
        dumps.append(dict(artifact(path, "database dump"), kind="database dump"))
    elif name.lower().endswith(".zip") and "/vendor/" not in "/" + r:
        zips.append(artifact(path, "archive"))
    elif "/vendor/" not in "/" + r and "/node_modules/" not in "/" + r:
        for kind, rx in ARTIFACT_KINDS:
            if rx.search(r):
                m = re.search(r"(^|.*/)\.(idea|vscode)/", r)
                if m:
                    d = m.group(0).rstrip("/")
                    if d not in seen_artifact_dirs:
                        seen_artifact_dirs.add(d)
                        artifacts.append(artifact(os.path.join(root, d), kind, check_history=False))
                else:
                    artifacts.append(artifact(path, kind, check_history=(kind != "ide or os file")))
                break
    if "/vendor/" in "/" + r:
        continue
    if MONITORING.search(r):
        monitoring.append(r)
    if SCANNERS.search(r):
        scanners.append(r)
    for label, rx in IAC:
        if rx.search(r):
            iac.append({"type": label, "path": r})
            break
    else:
        if re.search(r"\.(ya?ml|json|template)$", name) and not re.search(r"(^|/)(\.github|\.gitlab|node_modules|plugins|themes)/", r):
            try:
                if os.path.getsize(path) < 200000:
                    head = read_head(path, 4096)
                    if "AWSTemplateFormatVersion" in head:
                        iac.append({"type": "cloudformation", "path": r})
                    elif re.search(r"^apiVersion:\s*\S+", head, re.M) and re.search(r"^kind:\s*(Deployment|Service|Ingress|StatefulSet|DaemonSet|ConfigMap|Secret|CronJob|Job|Pod)\b", head, re.M):
                        iac.append({"type": "kubernetes", "path": r})
            except OSError:
                pass

# Composer: map installed packages to their install directories
composer_map = {}
artifact_dirs = []
for lf in lockfiles:
    if lf["type"] != "composer.lock" or lf["inside_dependency"]:
        continue
    lock_dir = os.path.join(root, os.path.dirname(lf["path"]))
    try:
        lock = json.load(open(os.path.join(lock_dir, "composer.lock")))
    except (OSError, ValueError):
        continue
    cj = {}
    try:
        cj = json.load(open(os.path.join(lock_dir, "composer.json")))
    except (OSError, ValueError):
        pass
    for repo in cj.get("repositories", []) if isinstance(cj.get("repositories"), list) else []:
        if isinstance(repo, dict) and repo.get("type") == "artifact" and repo.get("url"):
            artifact_dirs.append(os.path.realpath(os.path.join(lock_dir, repo["url"])))
    paths = (cj.get("extra") or {}).get("installer-paths") or {}
    vendor_dir = (cj.get("config") or {}).get("vendor-dir", "vendor")
    defaults = {"wordpress-plugin": "wp-content/plugins/{$name}/",
                "wordpress-theme": "wp-content/themes/{$name}/",
                "wordpress-muplugin": "wp-content/mu-plugins/{$name}/",
                "wordpress-dropin": "wp-content/"}
    for section in ("packages", "packages-dev"):
        for pkg in lock.get(section, []):
            name = pkg.get("name", "")
            ptype = pkg.get("type", "library")
            vendor, _, short = name.partition("/")
            target = None
            for pattern, matchers in paths.items():
                for m in matchers:
                    if m == name or m == "type:" + ptype or (m.startswith("vendor:") and m[7:] == vendor):
                        target = pattern
                        break
                if target:
                    break
            if not target:
                target = defaults.get(ptype)
            if not target:
                continue
            target = target.replace("{$name}", short).replace("{$vendor}", vendor)
            install = os.path.realpath(os.path.join(lock_dir, target))
            dist = pkg.get("dist") or {}
            source = pkg.get("source") or {}
            dist_url = str(dist.get("url", ""))
            if vendor.startswith("wpackagist-"):
                channel = "wp.org (wpackagist)"
            elif dist_url and not re.match(r"^https?://", dist_url) and dist_url.lower().endswith(".zip"):
                channel = "premium artifact"
            elif source.get("type") in ("git", "hg", "svn"):
                channel = "vcs"
            elif dist_url.startswith("http"):
                channel = "composer (remote dist)"
            else:
                channel = "composer (unknown source)"
            composer_map[install] = {"lock": lf["path"], "package": name, "version": pkg.get("version"),
                                     "channel": channel, "dev": section == "packages-dev",
                                     "vendor_dir": vendor_dir}

artifact_zips = []
for d in artifact_dirs:
    if os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            if f.lower().endswith(".zip"):
                artifact_zips.append(os.path.join(rel(d) if d.startswith(root) else d, f))

def zip_matches(slug):
    s = slug.lower()
    hits = []
    for z in artifact_zips + [z["path"] for z in zips]:
        base = re.sub(r"([._-]v?\d[\w.]*)?\.zip$", "", os.path.basename(z).lower())
        if base == s:
            hits.append(z)
    return sorted(set(hits))

def readme_stable_tag(d):
    for n in ("readme.txt", "README.txt"):
        t = read_head(os.path.join(d, n), 4096)
        m = re.search(r"^Stable tag:\s*(\S+)", t, re.M | re.I)
        if m:
            return m.group(1)
    return None

def guess_bucket(slug, path, kind, hdr):
    signals = []
    comp = composer_map.get(os.path.realpath(path))
    trk = is_tracked(path)
    if trk:
        signals.append("git-tracked")
    zm = zip_matches(slug)
    if zm:
        signals.append("premium zip present: " + ", ".join(zm))
    uri = hdr.get("Update URI")
    if uri:
        signals.append("Update URI: " + uri)
    if slug in custom or (custom_prefix and slug.startswith(custom_prefix)):
        return "custom", signals + ["owner-confirmed or prefix match"], comp, trk
    if comp:
        if trk:
            signals.append("composer-managed and also committed: check which copy deploys")
        return {"wp.org (wpackagist)": "managed-wporg", "premium artifact": "managed-premium-artifact",
                "vcs": "managed-vcs"}.get(comp["channel"], "managed-composer"), signals, comp, trk
    if trk:
        stable = readme_stable_tag(path) if os.path.isdir(path) else None
        if stable:
            signals.append("readme.txt Stable tag " + stable + " (distributed code)")
        for key in ("Author URI", "Plugin URI", "Theme URI"):
            m = re.match(r"https?://([^/]+)", hdr.get(key) or "")
            if m:
                signals.append(key + " host: " + m.group(1))
        if zm:
            return "committed-third-party", signals, comp, trk
        return "committed (confirm custom or third-party)", signals, comp, trk
    if trk is None:
        return "unknown (no git)", signals, comp, trk
    return "untracked (manual install, gitignored or premium upload)", signals, comp, trk

components = []

def add(kind, slug, path, hdr, main_file=None):
    bucket, signals, comp, trk = guess_bucket(slug, path, kind, hdr)
    components.append({
        "type": kind, "slug": slug, "name": hdr.get("Plugin Name") or hdr.get("Theme Name") or slug,
        "version": hdr.get("Version"), "path": rel(path), "main_file": rel(main_file) if main_file else None,
        "author": hdr.get("Author"), "author_uri": hdr.get("Author URI"),
        "component_uri": hdr.get("Plugin URI") or hdr.get("Theme URI"),
        "update_uri": hdr.get("Update URI"), "text_domain": hdr.get("Text Domain"),
        "requires_wp": hdr.get("Requires at least"), "requires_php": hdr.get("Requires PHP"),
        "parent_theme": hdr.get("Template"), "network": hdr.get("Network"),
        "tracked": trk, "composer": comp, "bucket_guess": bucket, "signals": signals,
        "active": {},
    })

plugins_dir = os.path.join(content_dir, "plugins")
if os.path.isdir(plugins_dir):
    for entry in sorted(os.listdir(plugins_dir)):
        p = os.path.join(plugins_dir, entry)
        if os.path.isdir(p):
            main, hdr = None, {}
            for f in sorted(os.listdir(p)):
                if f.endswith(".php"):
                    h = headers(read_head(os.path.join(p, f)))
                    if "Plugin Name" in h:
                        main, hdr = os.path.join(p, f), h
                        break
            if main:
                add("plugin", entry, p, hdr, main)
            else:
                add("plugin", entry, p, {"Plugin Name": entry + " (no plugin header found)"})
        elif entry.endswith(".php") and entry != "index.php":
            h = headers(read_head(p))
            if "Plugin Name" in h:
                add("plugin", entry[:-4], p, h, p)

themes_dir = os.path.join(content_dir, "themes")
if os.path.isdir(themes_dir):
    for entry in sorted(os.listdir(themes_dir)):
        p = os.path.join(themes_dir, entry)
        if os.path.isdir(p):
            hdr = headers(read_head(os.path.join(p, "style.css")))
            if "Theme Name" in hdr:
                add("theme", entry, p, hdr, os.path.join(p, "style.css"))

mu_dir = os.path.join(content_dir, "mu-plugins")
orphaned_loaders = []
if os.path.isdir(mu_dir):
    for entry in sorted(os.listdir(mu_dir)):
        p = os.path.join(mu_dir, entry)
        if os.path.isfile(p) and entry.endswith(".php") and entry != "index.php":
            text = read_head(p, 65536)
            hdr = headers(text)
            hdr.setdefault("Plugin Name", entry)
            add("mu-plugin", entry[:-4], p, hdr, p)
            for m in re.finditer(r"(?:require|include)(?:_once)?\s*\(?\s*([^;]+);", text):
                expr = m.group(1)
                lit = re.findall(r"['\"]([^'\"]+\.php)['\"]", expr)
                if not lit:
                    continue
                target = lit[-1].lstrip("/")
                candidates = [os.path.join(mu_dir, target), os.path.join(content_dir, target),
                              os.path.join(plugins_dir, target), os.path.join(content_dir, "plugins", target.split("plugins/", 1)[-1])]
                if not any(os.path.exists(c) for c in candidates):
                    line = text[:m.start()].count("\n") + 1
                    orphaned_loaders.append({"loader": rel(p), "line": line, "target": target})

DROPINS = ["advanced-cache.php", "object-cache.php", "db.php", "db-error.php", "install.php",
           "maintenance.php", "php-error.php", "fatal-error-handler.php", "sunrise.php",
           "blog-deleted.php", "blog-inactive.php", "blog-suspended.php"]
for d in DROPINS:
    p = os.path.join(content_dir, d)
    if os.path.isfile(p):
        add("dropin", d[:-4], p, headers(read_head(p)) or {"Plugin Name": d}, p)

# Core version and wp-config structure (names and booleans only)
core = {"version": None, "wp_root": rel(wp_root) if wp_root and wp_root.startswith(root) else ("outside project" if wp_root else None)}
config = {"found": False, "table_prefix": None, "multisite": None, "subdomain_install": None}
config_path = None
if wp_root:
    t = read_head(os.path.join(wp_root, "wp-includes", "version.php"), 4096)
    m = re.search(r"\$wp_version\s*=\s*'([^']+)'", t)
    if m:
        core["version"] = m.group(1)
    m = re.search(r"\$wp_local_package\s*=\s*'([^']+)'", t)
    core["locale"] = m.group(1) if m else "en_US"
    for cand in (os.path.join(wp_root, "wp-config.php"), os.path.join(os.path.dirname(wp_root), "wp-config.php")):
        if os.path.isfile(cand):
            ct = read_head(cand, 262144)
            config["found"] = True
            config_path = cand
            m = re.search(r"^\s*\$table_prefix\s*=\s*['\"]([A-Za-z0-9_]+)['\"]", ct, re.M)
            config["table_prefix"] = m.group(1) if m else None
            for const, key in (("MULTISITE", "multisite"), ("SUBDOMAIN_INSTALL", "subdomain_install")):
                m = re.search(r"define\(\s*['\"]" + const + r"['\"]\s*,\s*(true|false|1|0)\s*\)", ct, re.I)
                if m:
                    config[key] = m.group(1).lower() in ("true", "1")
            break
# Files outside wp-content: anything in the WordPress root that is not part of core (names only)
CORE_ROOT = {"index.php", "license.txt", "readme.html", "wp-activate.php", "wp-blog-header.php", "wp-comments-post.php",
             "wp-config-sample.php", "wp-config.php", "wp-cron.php", "wp-links-opml.php", "wp-load.php", "wp-login.php",
             "wp-mail.php", "wp-settings.php", "wp-signup.php", "wp-trackback.php", "xmlrpc.php", "wp-admin", "wp-includes",
             "wp-content", ".htaccess", ".user.ini", "php.ini", "web.config", "robots.txt", "favicon.ico", ".DS_Store"}
root_extra = []
if wp_root and os.path.isdir(wp_root):
    for entry in sorted(os.listdir(wp_root)):
        if entry in CORE_ROOT:
            continue
        p = os.path.join(wp_root, entry)
        kind = "dir" if os.path.isdir(p) else "file"
        is_dump = bool(re.search(r"\.(sql|sql\.gz|sql\.zip|sql\.bz2|dump)$", entry, re.I))
        size = os.path.getsize(p) if kind == "file" else None
        root_extra.append({"name": entry, "path": os.path.relpath(p, root), "kind": kind, "bytes": size,
                           "php": entry.lower().endswith((".php", ".phtml", ".phar")), "database_dump": is_dump})
        if is_dump and not any(d["path"] == os.path.relpath(p, root) for d in dumps):
            dumps.append(artifact(p, "database dump", location="WordPress root"))

# Platform: PHP constraints declared by the project, production PHP from the owner
platform = {"php_production": php_version or None, "php_constraints": [], "core_version": core.get("version"),
            "updates_owner": "ask the owner: host or team, for core and for PHP"}
for d in {root} | {os.path.dirname(os.path.join(root, lf["path"])) for lf in lockfiles if lf["type"] == "composer.lock" and not lf["inside_dependency"]}:
    try:
        cj = json.load(open(os.path.join(d, "composer.json")))
    except (OSError, ValueError):
        continue
    req = (cj.get("require") or {}).get("php")
    plat = ((cj.get("config") or {}).get("platform") or {}).get("php")
    if req or plat:
        platform["php_constraints"].append({"composer_json": rel(os.path.join(d, "composer.json")), "require": req, "config_platform": plat})

if shape == "bedrock" and os.path.isfile(os.path.join(root, "config", "application.php")):
    config["note"] = "Bedrock: constants come from config/application.php and .env; read names only"

# Active status: WP-CLI first, then the database, else unverified
active_source, sites, active_errors = "unverified", [], []
access = {"super_admins": None, "users_with_application_passwords": None}

def plugin_slug(entry):
    entry = entry.strip()
    return entry.split("/", 1)[0] if "/" in entry else re.sub(r"\.php$", "", entry)

def wp(args, url=None):
    cmd = ["wp", "--path=" + wp_root, "--skip-plugins", "--skip-themes", "--no-color"] + args
    if url:
        cmd.append("--url=" + url)
    return run(cmd, timeout=45)

if use_wpcli and wp_root and shutil.which("wp"):
    rc, so, se = wp(["option", "get", "active_plugins", "--format=json"])
    if rc == 0:
        active_source = "wp-cli"
        urls = [None]
        if config.get("multisite"):
            rc2, so2, _ = wp(["site", "list", "--fields=blog_id,url", "--format=json"])
            if rc2 == 0:
                urls = [s["url"] for s in json.loads(so2 or "[]")]
        network = []
        if config.get("multisite"):
            rc3, so3, _ = wp(["site", "option", "get", "active_sitewide_plugins", "--format=json"])
            if rc3 == 0:
                network = [plugin_slug(k) for k in (json.loads(so3 or "{}") or {}).keys()]
        for u in urls:
            rcp, sop, _ = wp(["option", "get", "active_plugins", "--format=json"], u)
            rcs, sos, _ = wp(["option", "get", "stylesheet"], u)
            rct, sot, _ = wp(["option", "get", "template"], u)
            rcu, sou, _ = wp(["user", "list", "--fields=roles", "--format=json"], u)
            roles = {}
            if rcu == 0 and sou.strip():
                for row in json.loads(sou):
                    for role in str(row.get("roles", "")).split(","):
                        role = role.strip() or "(no role)"
                        roles[role] = roles.get(role, 0) + 1
            rcr, sor, _ = wp(["option", "get", "users_can_register"], u)
            rcd, sod, _ = wp(["option", "get", "default_role"], u)
            sites.append({"site": u or "default", "plugins": [plugin_slug(x) for x in (json.loads(sop) if rcp == 0 and sop.strip() else [])],
                          "stylesheet": sos.strip() if rcs == 0 else None, "template": sot.strip() if rct == 0 else None,
                          "network_plugins": network, "role_counts": roles,
                          "open_registration": (sor.strip() == "1") if rcr == 0 else None,
                          "default_role": sod.strip() if rcd == 0 else None})
        if config.get("multisite"):
            rcs2, sos2, _ = wp(["super-admin", "list", "--format=count"])
            access["super_admins"] = int(sos2.strip()) if rcs2 == 0 and sos2.strip().isdigit() else None
            rcr2, sor2, _ = wp(["site", "option", "get", "registration"])
            access["network_registration"] = sor2.strip() if rcr2 == 0 else None
        rcx, sox, _ = wp(["db", "prefix"])
        if rcx == 0 and sox.strip():
            rca, soa, _ = wp(["db", "query", "SELECT COUNT(DISTINCT user_id) FROM %susermeta WHERE meta_key='_application_passwords'" % sox.strip(), "--skip-column-names"])
            access["users_with_application_passwords"] = int(soa.strip()) if rca == 0 and soa.strip().isdigit() else None
    else:
        active_errors.append("wp-cli failed: " + (se.strip().splitlines() or ["no output"])[-1][:200])

def read_db_credentials():
    """Static parse of DB_* from wp-config.php (or a Bedrock .env). Never executes PHP; refuses non-literal values."""
    want = ("DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST")
    creds = {}
    if shape == "bedrock" and os.path.isfile(os.path.join(root, ".env")):
        for line in open(os.path.join(root, ".env"), errors="replace"):
            m = re.match(r"\s*(DB_NAME|DB_USER|DB_PASSWORD|DB_HOST)\s*=\s*(.*)$", line)
            if m:
                v = m.group(2).strip()
                if len(v) >= 2 and v[0] == v[-1] and v[0] in "\x27\"":
                    v = v[1:-1]
                if "${" in v:
                    raise RuntimeError("%s in .env is not a literal value" % m.group(1))
                creds[m.group(1)] = v
    elif config_path:
        text = open(config_path, errors="replace").read()
        for key in want:
            if not re.search(r"define\(\s*['\"]" + key + r"['\"]", text):
                continue
            m = re.search(r"define\(\s*['\"]" + key + r"['\"]\s*,\s*(?:\x27((?:\\.|[^\x27\\])*)\x27|\"((?:\\.|[^\"\\$])*)\")\s*\)", text)
            if not m:
                raise RuntimeError("%s in wp-config.php is not a literal string (constant, function call or variable); cannot read it statically" % key)
            raw = m.group(1) if m.group(1) is not None else m.group(2)
            creds[key] = re.sub(r"\\(.)", r"\1", raw)
    missing = [k for k in ("DB_NAME", "DB_USER", "DB_HOST") if k not in creds]
    if missing:
        raise RuntimeError("could not read %s statically" % ", ".join(missing))
    creds.setdefault("DB_PASSWORD", "")
    return creds

def option_file(creds):
    """Write a mode-600 client option file in a private temp folder under --out; return (folder, path)."""
    import tempfile
    host, port, socket = creds["DB_HOST"], None, None
    if ":" in host:
        host, _, rest = host.partition(":")
        if rest.startswith("/"):
            socket = rest
        elif rest.isdigit():
            port = rest
    if db_socket:
        socket = db_socket
    if db_port:
        port = db_port
    def quote(v):
        return '"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"'
    folder = tempfile.mkdtemp(prefix=".db-tmp-", dir=out)
    os.chmod(folder, 0o700)
    path = os.path.join(folder, "client.cnf")
    lines = ["[client]", "user=" + quote(creds["DB_USER"]), "password=" + quote(creds["DB_PASSWORD"])]
    if socket:
        lines.append("socket=" + quote(socket))
    else:
        lines.append("host=" + quote(host or "localhost"))
        if port:
            lines.append("port=" + port)
    lines += ["[mysql]", "database=" + quote(creds["DB_NAME"])]
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write("\n".join(lines) + "\n")
    return folder, path

db_tmp = None
if active_source == "unverified" and db_fallback:
    client = mysql_bin or shutil.which("mysql") or shutil.which("mariadb")
    base = None
    try:
        if not client:
            raise RuntimeError("no mysql client found (pass --mysql-bin)")
        creds = read_db_credentials()
        db_tmp, cnf = option_file(creds)
        creds = None
        base = [client, "--defaults-extra-file=" + cnf]
    except (RuntimeError, OSError) as e:
        active_errors.append("database fallback not attempted: " + str(e))
    def q(sql):
        rc, so, se = run(base + ["-N", "-B", "-e", sql], timeout=60)
        if rc != 0:
            raise RuntimeError((se.strip().splitlines() or ["query failed"])[-1][:200])
        return [line.split("\t") for line in so.splitlines() if line]
    try:
        if base is None:
            raise RuntimeError("no database connection settings")
        tables = {r[0] for r in q("SHOW TABLES")}
        opt_tables = sorted(t for t in tables if t.endswith("options"))
        networks = sorted({t[:-5] for t in tables if t.endswith("blogs") and (t[:-5] + "options") in tables})
        claimed = set()
        entries = []
        def role_counts(usermeta, site_prefix, options_table):
            if usermeta not in tables:
                return None
            rows = q("SELECT option_value FROM `%s` WHERE option_name='%suser_roles'" % (options_table, site_prefix))
            defined = set(re.findall(r's:\d+:"([^"]+)";a:\d+:\{s:4:"name"', rows[0][0])) if rows else set()
            counts = {}
            for row in q("SELECT meta_value FROM `%s` WHERE meta_key='%scapabilities'" % (usermeta, site_prefix)):
                granted = [k for k, v in re.findall(r's:\d+:"([^"]+)";b:(\d)', row[0]) if v == "1"]
                found = [k for k in granted if not defined or k in defined] or ["(no role)"]
                for role in found:
                    counts[role] = counts.get(role, 0) + 1
                if defined and any(k not in defined for k in granted):
                    counts["(users with capabilities granted directly)"] = counts.get("(users with capabilities granted directly)", 0) + 1
            return counts
        for n in networks:
            meta = n + "sitemeta"
            network = []
            if meta in tables:
                rows = q("SELECT meta_value FROM `%s` WHERE meta_key='site_admins'" % meta)
                access.setdefault("super_admins_per_network", {})[n] = len(re.findall(r's:\d+:"[^"]*"', rows[0][0])) if rows else 0
                rows = q("SELECT meta_value FROM `%s` WHERE meta_key='registration'" % meta)
                access.setdefault("network_registration_per_network", {})[n] = rows[0][0] if rows else None
            if (n + "usermeta") in tables:
                rows = q("SELECT COUNT(DISTINCT user_id) FROM `%susermeta` WHERE meta_key='_application_passwords'" % n)
                access.setdefault("users_with_application_passwords_per_users_table", {})[n + "users"] = int(rows[0][0]) if rows else 0
            if meta in tables:
                rows = q("SELECT meta_value FROM `%s` WHERE meta_key='active_sitewide_plugins'" % meta)
                if rows:
                    network = [plugin_slug(x) for x in re.findall(r's:\d+:"([^"]*)"', rows[0][0])]
            for t in opt_tables:
                m = re.fullmatch(re.escape(n) + r"(\d+_)?options", t)
                if m:
                    claimed.add(t)
                    entries.append((t, n, "blog " + (m.group(1) or "1_").rstrip("_"), network))
        for t in opt_tables:
            if t not in claimed and re.fullmatch(r"[A-Za-z0-9_]+", t):
                entries.append((t, t[:-7], "single site", []))
        for t, prefix, label, network in entries:
            rows = q("SELECT option_name, option_value FROM `%s` WHERE option_name IN ('active_plugins','stylesheet','template','siteurl','users_can_register','default_role')" % t)
            vals = {r[0]: (r[1] if len(r) > 1 else "") for r in rows}
            site_prefix = t[:-7]
            usermeta = (prefix if label != "single site" else site_prefix) + "usermeta"
            if label == "single site" and (site_prefix + "usermeta") in tables:
                rows = q("SELECT COUNT(DISTINCT user_id) FROM `%susermeta` WHERE meta_key='_application_passwords'" % site_prefix)
                access.setdefault("users_with_application_passwords_per_users_table", {})[site_prefix + "users"] = int(rows[0][0]) if rows else 0
            sites.append({"site": vals.get("siteurl") or t, "table_prefix": prefix, "options_table": t, "label": label,
                          "plugins": [plugin_slug(x) for x in re.findall(r's:\d+:"([^"]*)"', vals.get("active_plugins", ""))],
                          "stylesheet": vals.get("stylesheet"), "template": vals.get("template"),
                          "network_plugins": network, "role_counts": role_counts(usermeta, site_prefix, t),
                          "open_registration": vals.get("users_can_register") == "1" if "users_can_register" in vals else None,
                          "default_role": vals.get("default_role")})
        active_source = "database (read-only query)"
    except RuntimeError as e:
        if base is not None:
            active_errors.append("database fallback failed: " + str(e))
    finally:
        if db_tmp:
            shutil.rmtree(db_tmp, ignore_errors=True)

missing_active = []
for s in sites:
    key = s["site"]
    on_disk = {c["slug"] for c in components if c["type"] == "plugin"}
    for slug in sorted(set(s["plugins"]) | set(s["network_plugins"])):
        if slug not in on_disk:
            missing_active.append({"site": key, "slug": slug})
for c in components:
    if c["type"] in ("mu-plugin", "dropin"):
        c["active"] = {"all sites": "loaded (must-use / drop-in)"}
        continue
    if not sites:
        c["active"] = {"all sites": "unverified"}
        continue
    for s in sites:
        key = s["site"]
        if c["type"] == "plugin":
            if c["slug"] in s["network_plugins"]:
                state = "network-active"
            elif c["slug"] in s["plugins"]:
                state = "active"
            else:
                state = "inactive"
        else:
            if c["slug"] == s.get("stylesheet"):
                state = "active theme"
            elif c["slug"] == s.get("template"):
                state = "active parent"
            else:
                state = "inactive"
        c["active"][key] = state

# Signals: development tools, activity logging, approved list
DEV_TOOL = re.compile(r"(query-monitor|debug-bar|debug|profiler|file-manager|filemanager|adminer|phpmyadmin|db-manager|database-browser|sql-executor|wp-console|log-viewer|code-snippets|php-everywhere|insert-php|wp-crontrol|developer|user-switching|fakerpress|theme-check|plugin-check)", re.I)
ACTIVITY_LOG = re.compile(r"(activity-log|audit-log|audit-trail|security-audit|user-activity|history|logger|^stream$)", re.I)
approved = None
if approved_file:
    try:
        approved = {l.strip() for l in open(approved_file) if l.strip() and not l.startswith("#")}
    except OSError as e:
        sys.exit("Could not read --approved: %s" % e)
def is_active_somewhere(c):
    return any(str(v).startswith(("active", "network-active", "loaded")) for v in c["active"].values())
dev_tools_active, logging_plugins = [], []
for c in components:
    if c["type"] not in ("plugin", "mu-plugin"):
        continue
    if DEV_TOOL.search(c["slug"]):
        c["signals"].append("development or operations tool: should not be active on production")
        if is_active_somewhere(c) or "unverified" in c["active"].values():
            dev_tools_active.append({"slug": c["slug"], "active": c["active"]})
    if ACTIVITY_LOG.search(c["slug"]) or re.search(r"(activity|audit) log", str(c["name"]), re.I):
        logging_plugins.append({"slug": c["slug"], "active": c["active"]})
    if approved is not None and c["type"] == "plugin" and c["slug"] not in approved:
        c["signals"].append("not on the owner's approved plugin list")
        c["approved"] = False
    elif approved is not None:
        c["approved"] = True

# Webroot exposure: tracked paths that no deploy exclude list removes
import fnmatch
exclude_sources = []
def add_patterns(src, kind, lines):
    pats = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith(("#", ";", "+ ")):
            continue
        if line.startswith("- "):
            line = line[2:].strip()
        pats.append(line.strip("\x27\""))
    if pats:
        exclude_sources.append({"file": src, "kind": kind, "patterns": pats})

referenced = set()
scan_files = [d for d in deploy_files] + [c for c in ci_files] + [r for r in (rel(x) for x in walk(root)) if r.endswith((".sh", "Makefile", "package.json", "composer.json")) and "/vendor/" not in "/" + r and not r.startswith(("plugins/", "themes/"))]
for r in sorted(set(scan_files)):
    try:
        text = open(os.path.join(root, r), errors="replace").read()
    except OSError:
        continue
    for m in re.finditer(r"--exclude-from[= ]+[\x27\"]?([^\s\x27\";]+)", text):
        target = m.group(1)
        for cand in (os.path.join(root, target), os.path.join(root, os.path.dirname(r), target)):
            cand = os.path.normpath(cand.replace("$(pwd)/", "").replace("./", "", 1) if "$" not in cand else cand)
            if os.path.isfile(cand):
                referenced.add(os.path.realpath(cand))
                break
    inline = re.findall(r"--exclude[= ]+(?:\x27([^\x27]+)\x27|\"([^\"]+)\"|([^\s;\\]+))", text)
    if inline:
        add_patterns(r, "rsync --exclude in " + r, [a or b or c for a, b, c in inline])
    for block in re.finditer(r"^(\s*)exclude:\s*\n((?:\1\s+-\s*.+\n?)+)", text, re.M):
        add_patterns(r, "CI artifact exclude in " + r, [re.sub(r"^\s*-\s*", "", l) for l in block.group(2).splitlines()])
for path in walk(root):
    r = rel(path)
    name = os.path.basename(r)
    if "/vendor/" in "/" + r or r.startswith(("plugins/", "themes/", "mu-plugins/")) and r.count("/") > 1:
        continue
    if name in (".rsyncignore", ".deployignore", ".distignore") or re.search(r"exclude[^/]*(\.txt|\.list)?$", name, re.I) and not name.endswith((".php", ".js", ".json")):
        try:
            add_patterns(r, ("referenced by --exclude-from" if os.path.realpath(path) in referenced else "exclude-style file, not referenced by any deploy command found"), open(path, errors="replace").read().splitlines())
        except OSError:
            pass
    if name == ".gitattributes":
        lines = [l.split()[0] for l in open(path, errors="replace") if "export-ignore" in l and l.strip() and not l.startswith("#")]
        add_patterns(r, "git archive export-ignore", lines)

def excluded_by(relpath, sources=None):
    parts = relpath.split("/")
    for src in (exclude_sources if sources is None else sources):
        for pat in src["patterns"]:
            anchored = pat.startswith("/")
            pt = pat.strip("/")
            if not pt:
                continue
            for i in range(len(parts)):
                prefix = "/".join(parts[: i + 1])
                if "/" in pt or anchored:
                    if fnmatch.fnmatch(prefix, pt) or (not anchored and any(fnmatch.fnmatch("/".join(parts[j: i + 1]), pt) for j in range(i + 1))):
                        return "%s: %s" % (src["file"], pat)
                elif fnmatch.fnmatch(parts[i], pt):
                    return "%s: %s" % (src["file"], pat)
    return None

AGENT = re.compile(r"(^|/)(CLAUDE\.md|AGENTS\.md|GEMINI\.md|\.cursorrules|\.windsurfrules|copilot-instructions\.md|\.claude|\.cursor|\.aider[^/]*|\.continue)(/|$)", re.I)
RUNTIME_JSON = re.compile(r"(^|/)(block|theme)\.json$|(^|/)styles/[^/]+\.json$|(^|/)languages/|\.min\.json$")
RUNTIME_TOP = {"plugins", "themes", "mu-plugins", "languages", "uploads", "index.php", "vendor", "upgrade", "fonts"} | set(DROPINS)
def category(r):
    name = os.path.basename(r)
    low = name.lower()
    if r in RUNTIME_TOP:
        return "runtime (expected in the webroot)"
    if AGENT.search(r):
        return "agent config"
    if low.endswith((".sql", ".sql.gz", ".dump")):
        return "database dump"
    if low.endswith((".zip", ".tar", ".tar.gz", ".tgz")):
        return "archive"
    if low in ("composer.lock", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "npm-shrinkwrap.json"):
        return "lockfile"
    if low.endswith((".sh", ".bash")) or low in ("makefile", "dockerfile", "jenkinsfile"):
        return "build or deploy script"
    if low.endswith((".md", ".markdown")):
        return "internal docs"
    if low.startswith(".env") or low.endswith((".yml", ".yaml", ".neon", ".dist", ".ini")) or re.search(r"(phpcs|phpunit|phpstan)[^/]*\.xml", low) or (low.endswith(".json") and not RUNTIME_JSON.search(r)):
        return "config"
    if any(part.startswith(".") for part in r.split("/")[:-1]) or low.startswith("."):
        return "dotfile or dotfolder"
    return None

exposure = []
tracked_rel = sorted(os.path.relpath(t, root) for t in tracked if t.startswith(root + os.sep)) if tracked else []
for top in sorted({t.split("/")[0] for t in tracked_rel}):
    exposure.append({"path": top, "kind": "top-level", "category": category(top) or "top-level path", "excluded_by": excluded_by(top)})
skipped_dependency = 0
for t in tracked_rel:
    if "/vendor/" in "/" + t or "/node_modules/" in "/" + t:
        skipped_dependency += 1
        continue
    cat = category(t)
    if cat and "/" in t:
        exposure.append({"path": t, "kind": "file", "category": cat, "excluded_by": excluded_by(t)})
# Sources a deploy command actually uses (rsync, CI artifacts, referenced exclude files) decide the status;
# export-ignore and unreferenced exclude-style files only apply if the deploy uses them.
firm = [x for x in exclude_sources if x["kind"].startswith(("rsync", "CI artifact", "referenced by"))]
for e in exposure:
    firm_hit = excluded_by(e["path"], firm)
    if firm_hit:
        e["status"], e["excluded_by"] = "excluded", firm_hit
    elif e["excluded_by"]:
        e["status"] = "reaches webroot if deployed (excluded only by a source the deploy may not use)"
    else:
        e["status"] = "reaches webroot if deployed"
with open(os.path.join(out, "webroot-exposure.tsv"), "w") as f:
    f.write("status\tkind\tcategory\tpath\texcluded_by\n")
    for e in exposure:
        f.write("%s\t%s\t%s\t%s\t%s\n" % (e["status"], e["kind"], e["category"], e["path"], e["excluded_by"] or ""))
exposed = [e for e in exposure if e["status"].startswith("reaches")]
by_cat = {}
for e in exposed:
    by_cat[e["category"]] = by_cat.get(e["category"], 0) + 1
exposure_summary = {"exclude_sources": [{"file": x["file"], "kind": x["kind"], "patterns": len(x["patterns"])} for x in exclude_sources],
                    "assumption": "patterns are matched relative to the repository root as the deploy source; confirm the deploy source directory",
                    "not_excluded_by_category": by_cat, "not_excluded_top_level": [e["path"] for e in exposed if e["kind"] == "top-level" and not e["category"].startswith("runtime")],
                    "tracked_dependency_files_skipped": skipped_dependency, "list": "webroot-exposure.tsv"}
if tracked is None:
    exposure_summary["note"] = "not a git repository: tracked paths unknown"

def owner_component(r):
    best = None
    for c in components:
        if c["type"] in ("plugin", "theme") and (r == c["path"] or r.startswith(c["path"] + "/")):
            best = c
    return {"slug": best["slug"], "type": best["type"], "bucket_guess": best["bucket_guess"]} if best else None

for lf in lockfiles:
    lf["component"] = owner_component(lf["path"])
ci_files = [{"path": c, "component": owner_component(c)} for c in ci_files]

result = {
    "tool": "wp-project-audit/inventory.sh",
    "project": {"shape": shape, "content_dir": rel(content_dir), "git": bool(git_root),
                "ci_files": sorted(ci_files, key=lambda x: x["path"]), "deploy_files": sorted(deploy_files),
                "hosting_hints": hosting, "database_dumps": dumps,
                "zip_files": zips, "local_artifacts": artifacts,
                "local_artifact_candidates": [a for a in dumps + zips + artifacts if a["status"].startswith("candidate")],
                "local_artifact_rule": "candidates only when tracked in git (now or in history) or present on production; untracked local files are ignored and never read", "composer_artifact_dirs": [rel(d) if d.startswith(root) else d for d in artifact_dirs],
                "dependency_monitoring": sorted(set(monitoring)), "existing_scanner_configs": sorted(set(scanners)),
                "infrastructure_as_code": iac},
    "core": core, "config": config, "platform": platform,
    "webroot_exposure": exposure_summary,
    "outside_wp_content": {"wp_root": (os.path.relpath(wp_root, root) if wp_root else None), "wp_root_extra_entries": root_extra, "dropins": [c["path"] for c in components if c["type"] == "dropin"]},
    "access": {"note": "counts only; per-site role counts are under active_status.sites", **access},
    "signals": {"development_tools_active_or_unverified": dev_tools_active, "activity_log_plugins": logging_plugins,
                "approved_list": "not supplied" if approved is None else "%d plugins not on it" % sum(1 for c in components if c.get("approved") is False)},
    "active_status": {"source": active_source, "errors": active_errors,
                      "sites": [dict({k: v for k, v in s.items() if k != "plugins"}, active_plugin_count=len(s["plugins"]), active_plugins=s["plugins"]) for s in sites],
                      "active_but_missing_on_disk": missing_active},
    "orphaned_mu_loaders": orphaned_loaders,
    "lockfiles": lockfiles,
    "components": components,
}
with open(os.path.join(out, "inventory.json"), "w") as f:
    json.dump(result, f, indent=2)
with open(os.path.join(out, "inventory.tsv"), "w") as f:
    f.write("type\tslug\tversion\tbucket_guess\ttracked\tcomposer_channel\tupdate_uri\tactive\tpath\n")
    for c in components:
        act = "; ".join("%s=%s" % (k, v) for k, v in c["active"].items())
        f.write("\t".join(str(x) for x in (c["type"], c["slug"], c["version"] or "", c["bucket_guess"],
                c["tracked"], (c["composer"] or {}).get("channel", ""), c["update_uri"] or "", act, c["path"])) + "\n")

counts = {}
for c in components:
    counts.setdefault(c["type"], {}).setdefault(c["bucket_guess"], 0)
    counts[c["type"]][c["bucket_guess"]] += 1
print("Root shape: %s | core: %s | multisite: %s" % (shape, core.get("version") or "not found", config.get("multisite")))
print("Active status source: %s (%d site(s) read)" % (active_source, len(sites)))
for e in active_errors:
    print("  note: " + e)
for kind, buckets in sorted(counts.items()):
    print("%s: %d" % (kind, sum(buckets.values())))
    for b, n in sorted(buckets.items()):
        print("  %-60s %d" % (b, n))
all_art = dumps + zips + artifacts
print("Lockfiles: %d (%d inside dependencies) | CI files: %d | deploy files: %d"
      % (len(lockfiles), sum(1 for l in lockfiles if l["inside_dependency"]), len(ci_files), len(deploy_files)))
print("Local artifacts (dumps, archives, logs, backups, exports, IDE/OS files): %d candidates (tracked, in history or on production) | %d untracked local, ignored"
      % (sum(1 for a in all_art if a["status"].startswith("candidate")), sum(1 for a in all_art if a["status"].startswith("ignored"))))
print("Active but missing on disk: %d | orphaned must-use loaders: %d" % (len(missing_active), len(orphaned_loaders)))
print("Outside wp-content: %d unexpected WordPress-root entries (%d PHP) | drop-ins: %d"
      % (len(root_extra), sum(1 for e in root_extra if e["php"]), sum(1 for c in components if c["type"] == "dropin")))
print("Webroot exposure: %d exclude source(s) | not excluded: %d top-level paths, %s | list: webroot-exposure.tsv"
      % (len(exclude_sources), len(exposure_summary["not_excluded_top_level"]),
         ", ".join("%s %d" % kv for kv in sorted(by_cat.items()) if not kv[0].startswith(("top-level path", "runtime"))) or "no internal files"))
print("Dependency monitoring configs: %d | existing scanner configs: %d | infrastructure-as-code files: %d"
      % (len(set(monitoring)), len(set(scanners)), len(iac)))
print("Development tools active or unverified: %d | activity-log plugins: %d | approved list: %s"
      % (len(dev_tools_active), len(logging_plugins), result["signals"]["approved_list"]))
for s in sites:
    rc = s.get("role_counts")
    if rc is not None:
        print("  %s: %s | open registration: %s" % (s.get("label", "site"), ", ".join("%s %d" % kv for kv in sorted(rc.items())) or "no users", s.get("open_registration")))
print("PHP (production, as supplied): %s | PHP constraints declared: %d" % (platform["php_production"] or "not supplied", len(platform["php_constraints"])))
print("Wrote " + os.path.join(out, "inventory.json") + " and inventory.tsv")
PY

python3 "$PY_FILE" "$ROOT" "$OUT" "$WP_ROOT" "$DB_FALLBACK" "$USE_WPCLI" "$CUSTOM" "$CUSTOM_PREFIX" "$APPROVED" "$PHP_VERSION" "$MYSQL_BIN" "$DB_SOCKET" "$DB_PORT" "$PROD_EXPORT"
