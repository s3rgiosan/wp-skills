#!/usr/bin/env bash
# prod-check.sh: owner-run, read-only integrity check of a production WordPress install.
#
# Two modes:
#
#   bash prod-check.sh manifest <trusted-component-dir> <out-file.sha256>
#       Run locally on a trusted copy (the vendor's zip for the deployed version,
#       or the repo at the deployed commit). Writes a SHA-256 manifest.
#
#   bash prod-check.sh check [--root <wp-root>] [--manifests <dir>] [--since <yyyy-mm-dd>]
#                            [--ioc-names <file>] [--ioc-strings <file>]
#                            [--out <dir>] [--no-network] [--no-wp-cli]
#       Run on production from the WordPress root (or pass --root). Changes nothing.
#       --manifests    Directory of manifests named plugin-<slug>.sha256,
#                      theme-<slug>.sha256 or mu-plugins.sha256.
#       --since        Report PHP files modified on or after this date (default: 90 days ago).
#       --ioc-names    File names to look for, one per line (from an advisory).
#       --ioc-strings  Fixed strings to look for, one per line (hosts, markers from an advisory).
#       --out          Also write the output to <dir>/prod-check-<date>.txt (refused inside the webroot).
#       --no-network   Skip the official core checksum download.
#       --no-wp-cli    Skip WP-CLI checks.
#
# The output lists paths, line numbers, counts, constant names and booleans. It never
# prints file contents, configuration values, user names or email addresses, so it can
# be pasted back as-is.

set -uo pipefail

hr() { printf '\n== %s\n' "$1"; }

sha256_cmd() {
  if command -v sha256sum >/dev/null 2>&1; then echo "sha256sum"; else echo "shasum -a 256"; fi
}

md5_of() {
  if command -v md5sum >/dev/null 2>&1; then md5sum "$1" | awk '{print $1}'; else md5 -q "$1"; fi
}

mtime_of() {
  if stat -c '%y' "$1" >/dev/null 2>&1; then
    stat -c '%y' "$1" | cut -d. -f1
  else
    stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' "$1"
  fi
}

if [ "${1:-}" = "manifest" ]; then
  SRC="${2:?trusted component directory}"
  DEST="${3:?output manifest file}"
  [ -d "$SRC" ] || { echo "Not a directory: $SRC" >&2; exit 2; }
  SHA="$(sha256_cmd)"
  ( cd "$SRC" && find . -type f ! -name '.DS_Store' ! -path './.git/*' | LC_ALL=C sort | while IFS= read -r f; do $SHA "$f"; done ) > "$DEST"
  echo "Wrote $(wc -l < "$DEST" | tr -d ' ') entries to $DEST"
  exit 0
fi

[ "${1:-}" = "check" ] && shift

ROOT="$(pwd)"
MANIFESTS=""
SINCE=""
IOC_NAMES=""
IOC_STRINGS=""
OUTDIR=""
NETWORK=1
WPCLI=1

while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="${2:?}"; shift 2 ;;
    --manifests) MANIFESTS="${2:?}"; shift 2 ;;
    --since) SINCE="${2:?}"; shift 2 ;;
    --ioc-names) IOC_NAMES="${2:?}"; shift 2 ;;
    --ioc-strings) IOC_STRINGS="${2:?}"; shift 2 ;;
    --out) OUTDIR="${2:?}"; shift 2 ;;
    --no-network) NETWORK=0; shift ;;
    --no-wp-cli) WPCLI=0; shift ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$ROOT" && pwd -P)" || exit 2
abspath() { ( cd "$(dirname "$1")" && printf '%s/%s' "$(pwd -P)" "$(basename "$1")" ); }
[ -n "$MANIFESTS" ] && MANIFESTS="$(cd "$MANIFESTS" && pwd -P)"
[ -n "$IOC_NAMES" ] && IOC_NAMES="$(abspath "$IOC_NAMES")"
[ -n "$IOC_STRINGS" ] && IOC_STRINGS="$(abspath "$IOC_STRINGS")"
[ -f "$ROOT/wp-includes/version.php" ] || { echo "Not a WordPress root (no wp-includes/version.php): pass --root" >&2; exit 2; }
CONTENT="$ROOT/wp-content"
if [ -z "$SINCE" ]; then
  SINCE="$(date -d '90 days ago' +%Y-%m-%d 2>/dev/null || date -v-90d +%Y-%m-%d)"
fi

if [ -n "$OUTDIR" ]; then
  OUT_PARENT="$(cd "$(dirname "$OUTDIR")" 2>/dev/null && pwd -P)" || { echo "The parent of --out must exist" >&2; exit 2; }
  OUTDIR="$OUT_PARENT/$(basename "$OUTDIR")"
  case "$OUTDIR/" in
    "$ROOT"/*) echo "Refusing to write inside the webroot: choose --out outside $ROOT" >&2; exit 2 ;;
  esac
  mkdir -p "$OUTDIR"
  exec > >(tee "$OUTDIR/prod-check-$(date +%Y-%m-%d-%H%M).txt") 2>&1
fi

CONFIG="$ROOT/wp-config.php"
[ -f "$CONFIG" ] || CONFIG="$(dirname "$ROOT")/wp-config.php"
HAS_WP=0
if [ "$WPCLI" = 1 ] && command -v wp >/dev/null 2>&1; then HAS_WP=1; fi
WP() { wp --path="$ROOT" --skip-plugins --skip-themes --no-color "$@"; }

WP_VERSION="$(sed -n "s/^\$wp_version = '\([^']*\)'.*/\1/p" "$ROOT/wp-includes/version.php")"
WP_LOCALE="$(sed -n "s/^\$wp_local_package = '\([^']*\)'.*/\1/p" "$ROOT/wp-includes/version.php")"
WP_LOCALE="${WP_LOCALE:-en_US}"

hr "1. Environment"
echo "WordPress: ${WP_VERSION:-unknown} (locale ${WP_LOCALE})"
if [ -f "$CONFIG" ] && grep -qE "define\([[:space:]]*['\"]MULTISITE['\"][[:space:]]*,[[:space:]]*(true|1)" "$CONFIG"; then echo "Multisite: yes"; else echo "Multisite: no"; fi
if command -v php >/dev/null 2>&1; then echo "PHP CLI: $(php -r 'echo PHP_VERSION;' 2>/dev/null)"; fi
echo "WP-CLI: $([ "$HAS_WP" = 1 ] && echo available || echo 'not used')"
echo "Modified-since date for this run: $SINCE"

hr "2. Core files against official checksums"
CORE_DONE=0
if [ "$HAS_WP" = 1 ]; then
  WP core verify-checksums 2>&1 | tail -40 && CORE_DONE=1
fi
if [ "$CORE_DONE" = 0 ] && [ "$NETWORK" = 1 ] && command -v curl >/dev/null 2>&1 && [ -n "$WP_VERSION" ]; then
  SUMS="$(mktemp)"
  if curl -fsS "https://api.wordpress.org/core/checksums/1.0/?version=${WP_VERSION}&locale=${WP_LOCALE}" -o "$SUMS.json"; then
    if command -v python3 >/dev/null 2>&1; then
      python3 -c 'import json,sys; d=json.load(open(sys.argv[1])).get("checksums") or {}; d=d.get(sys.argv[2], d) if isinstance(d, dict) and sys.argv[2] in d else d; [print(v, k) for k, v in (d or {}).items()]' "$SUMS.json" "$WP_VERSION" > "$SUMS"
    elif command -v jq >/dev/null 2>&1; then
      jq -r '.checksums | to_entries[] | "\(.value) \(.key)"' "$SUMS.json" > "$SUMS"
    fi
    if [ -s "$SUMS" ]; then
      MISMATCH=0
      MISSING=0
      while read -r sum file; do
        case "$file" in wp-content/*) continue ;; esac
        if [ ! -f "$ROOT/$file" ]; then
          MISSING=$((MISSING + 1))
          [ "$MISSING" -le 20 ] && echo "missing: $file"
        elif [ "$(md5_of "$ROOT/$file")" != "$sum" ]; then
          echo "MODIFIED: $file"; MISMATCH=$((MISMATCH + 1))
        fi
      done < "$SUMS"
      echo "-- files in wp-admin/, wp-includes/ and the webroot top level that are not part of core:"
      ( cd "$ROOT" && { find wp-admin wp-includes -type f; find . -maxdepth 1 -type f -name '*.php' | sed 's|^\./||'; } ) \
        | LC_ALL=C sort | LC_ALL=C comm -23 - <(awk '{print $2}' "$SUMS" | LC_ALL=C sort) \
        | grep -vE '^(wp-config\.php|\.htaccess|\.user\.ini|php\.ini)$' || echo "none"
      echo "Modified core files: $MISMATCH | missing core files: $MISSING (first 20 listed)"
    else
      echo "Could not parse the checksum list (needs python3 or jq); run 'wp core verify-checksums' instead."
    fi
  else
    echo "Checksum download failed for ${WP_VERSION}/${WP_LOCALE}."
  fi
  rm -f "$SUMS" "$SUMS.json"
elif [ "$CORE_DONE" = 0 ]; then
  echo "Skipped (no WP-CLI and network lookup disabled or unavailable)."
fi

hr "3. wp.org plugins against their published checksums"
if [ "$HAS_WP" = 1 ]; then
  echo "(premium, custom and VCS plugins report as unverifiable; that is expected: cover them with manifests)"
  WP plugin verify-checksums --all 2>&1 | grep -vE 'could not be retrieved|not found|Plugin not found' | tail -40
else
  echo "Skipped (WP-CLI not used)."
fi

hr "4. Components against known-good manifests"
if [ -n "$MANIFESTS" ] && [ -d "$MANIFESTS" ]; then
  SHA="$(sha256_cmd)"
  for m in "$MANIFESTS"/*.sha256; do
    [ -f "$m" ] || continue
    base="$(basename "$m" .sha256)"
    case "$base" in
      plugin-*) dir="$CONTENT/plugins/${base#plugin-}" ;;
      theme-*) dir="$CONTENT/themes/${base#theme-}" ;;
      mu-plugins) dir="$CONTENT/mu-plugins" ;;
      *) echo "$base: unknown manifest name (use plugin-<slug>, theme-<slug> or mu-plugins)"; continue ;;
    esac
    echo "-- $base"
    if [ ! -d "$dir" ]; then echo "   directory not present on this server"; continue; fi
    ( cd "$dir" && $SHA -c "$m" 2>/dev/null | grep -v ': OK$' ) | sed 's/^/   /' || true
    echo "   files present here but not in the manifest:"
    ( cd "$dir" && find . -type f ! -name '.DS_Store' | LC_ALL=C sort ) \
      | LC_ALL=C comm -23 - <(awk '{ $1=""; sub(/^ +\*?/, ""); print }' "$m" | LC_ALL=C sort) | sed 's/^/     /'
  done
else
  echo "Skipped (no --manifests directory)."
fi

hr "5. Near-miss core file names (droppers named one letter away from a core file)"
CORE_NAMES="index.php wp-activate.php wp-blog-header.php wp-comments-post.php wp-config.php wp-config-sample.php wp-cron.php wp-links-opml.php wp-load.php wp-login.php wp-mail.php wp-settings.php wp-signup.php wp-trackback.php xmlrpc.php"
find "$ROOT" -type f -name '*.php' ! -path '*/node_modules/*' 2>/dev/null | awk -v names="$CORE_NAMES" -v root="$ROOT/" '
function lev(a, b,   i, j, la, lb, cost, d, x, y, z) {
  la = length(a); lb = length(b)
  for (i = 0; i <= la; i++) d[i, 0] = i
  for (j = 0; j <= lb; j++) d[0, j] = j
  for (i = 1; i <= la; i++) for (j = 1; j <= lb; j++) {
    cost = (substr(a, i, 1) == substr(b, j, 1)) ? 0 : 1
    x = d[i-1, j] + 1; y = d[i, j-1] + 1; z = d[i-1, j-1] + cost
    d[i, j] = (x < y ? (x < z ? x : z) : (y < z ? y : z))
  }
  return d[la, lb]
}
BEGIN { n = split(names, core, " ") }
{
  f = $0; b = f; sub(/.*\//, "", b)
  for (k = 1; k <= n; k++) if (b == core[k]) next
  if (length(b) < 8) next
  for (k = 1; k <= n; k++) if (lev(b, core[k]) == 1) { r = f; if (index(r, root) == 1) r = substr(r, length(root) + 1); print "near-miss of " core[k] ": " r; break }
}' || true
echo "(end of list)"
if [ -n "$IOC_NAMES" ] && [ -f "$IOC_NAMES" ]; then
  echo "-- names from --ioc-names:"
  while IFS= read -r n; do
    [ -n "$n" ] || continue
    find "$ROOT" -type f -name "$n" ! -path '*/node_modules/*' 2>/dev/null | sed "s|^$ROOT/||"
  done < "$IOC_NAMES"
fi

hr "6. Indicator strings"
if [ -n "$IOC_STRINGS" ] && [ -f "$IOC_STRINGS" ]; then
  grep -rlF -f "$IOC_STRINGS" "$CONTENT/plugins" "$CONTENT/themes" "$CONTENT/mu-plugins" "$ROOT"/*.php 2>/dev/null | sed "s|^$ROOT/||" || echo "none"
else
  echo "Skipped (no --ioc-strings file)."
fi

hr "7. wp-config.php structure (names and booleans only)"
if [ -f "$CONFIG" ]; then
  echo "location: $([ "$CONFIG" = "$ROOT/wp-config.php" ] && echo 'webroot' || echo 'one level above the webroot')"
  echo "modified: $(mtime_of "$CONFIG")"
  echo "-- constants:"
  grep -oE "define\([[:space:]]*['\"][A-Za-z0-9_]+['\"][[:space:]]*,[[:space:]]*[^)]*\)" "$CONFIG" | while IFS= read -r d; do
    name="$(printf '%s' "$d" | sed -E "s/define\([[:space:]]*['\"]([A-Za-z0-9_]+)['\"].*/\1/")"
    val="$(printf '%s' "$d" | sed -E "s/^[^,]*,[[:space:]]*//; s/\)$//; s/[[:space:]]+$//" | tr 'A-Z' 'a-z')"
    case "$val" in
      true|false) echo "   $name = $val" ;;
      *) echo "   $name = set (value not shown)" ;;
    esac
  done
  for c in DISALLOW_FILE_EDIT DISALLOW_FILE_MODS FORCE_SSL_ADMIN WP_DEBUG WP_DEBUG_DISPLAY WP_DEBUG_LOG DISALLOW_UNFILTERED_HTML AUTOMATIC_UPDATER_DISABLED WP_ENVIRONMENT_TYPE; do
    grep -qE "define\([[:space:]]*['\"]$c['\"]" "$CONFIG" || echo "   $c: not defined (WordPress default applies)"
  done
  echo "-- lines after the wp-settings.php require (normally none): $(awk 'f && NF {c++} /require_once.*wp-settings\.php/ {f=1} END {print c+0}' "$CONFIG")"
  echo "-- suspicious calls (line: function):"
  grep -noE 'eval\(|base64_decode\(|gzinflate\(|gzuncompress\(|str_rot13\(|assert\(|create_function|file_get_contents\(.https?:|curl_exec|fsockopen\(' "$CONFIG" || echo "   none"
  echo "-- longest line: $(awk '{ if (length($0) > m) m = length($0) } END { print m + 0 }' "$CONFIG") characters"
else
  echo "wp-config.php not found in the webroot or one level above."
fi

hr "8. Suspicious code patterns (path:line: matched call only)"
PATTERN='eval\([[:space:]]*(base64_decode|gzinflate|gzuncompress|str_rot13|\$_(GET|POST|REQUEST|COOKIE))|assert\([[:space:]]*\$_(GET|POST|REQUEST|COOKIE)|preg_replace\([[:space:]]*.\/[^/]*\/e.|(system|shell_exec|passthru|popen|proc_open)\([[:space:]]*\$_(GET|POST|REQUEST|COOKIE)|create_function\('
for d in "$CONTENT/mu-plugins" "$CONTENT/plugins" "$CONTENT/themes" "$CONTENT/uploads"; do
  [ -d "$d" ] || continue
  grep -rnoEI --include='*.php' --include='*.phtml' --include='*.inc' "$PATTERN" "$d" 2>/dev/null | sed "s|^$ROOT/||" | head -60
done
grep -noEI "$PATTERN" "$ROOT"/*.php 2>/dev/null | sed "s|^$ROOT/||"
echo "-- PHP files with a line longer than 5000 characters (packed payloads):"
find "$CONTENT/mu-plugins" "$CONTENT/plugins" "$CONTENT/themes" "$CONTENT/uploads" "$ROOT" -maxdepth 6 -type f -name '*.php' ! -path '*/vendor/*' ! -path '*/node_modules/*' 2>/dev/null \
  | while IFS= read -r f; do awk 'length($0) > 5000 { found = 1; exit } END { exit !found }' "$f" && echo "   ${f#"$ROOT"/}"; done | head -40
echo "(vendor libraries can match; each hit is a candidate to read, not a finding)"

hr "9. Executable files under uploads"
find "$CONTENT/uploads" -type f \( -iname '*.php' -o -iname '*.php[0-9]' -o -iname '*.phtml' -o -iname '*.phar' -o -iname '*.inc' -o -name '.htaccess' -o -name '.user.ini' \) 2>/dev/null | sed "s|^$ROOT/||" | head -60
echo "(end of list)"

hr "10. PHP modified on or after $SINCE"
echo "-- webroot top level, wp-content top level, mu-plugins:"
{ find "$ROOT" -maxdepth 1 -type f -name '*.php' -newermt "$SINCE"; find "$CONTENT" -maxdepth 1 -type f -name '*.php' -newermt "$SINCE"; find "$CONTENT/mu-plugins" -type f -name '*.php' -newermt "$SINCE"; } 2>/dev/null | sed "s|^$ROOT/||"
echo "-- plugin and theme directories with PHP changed (count, directory; compare with your deploy history):"
find "$CONTENT/plugins" "$CONTENT/themes" -type f -name '*.php' -newermt "$SINCE" 2>/dev/null | sed "s|^$ROOT/||" | cut -d/ -f1-3 | sort | uniq -c | sort -rn | head -60

hr "11. Must-use loaders pointing at missing files"
if [ -d "$CONTENT/mu-plugins" ]; then
  for f in "$CONTENT"/mu-plugins/*.php; do
    [ -f "$f" ] || continue
    grep -noE "(require|include)(_once)?[^;]*['\"][^'\"]+\.php['\"]" "$f" 2>/dev/null | while IFS= read -r hit; do
      line="${hit%%:*}"
      target="$(printf '%s' "$hit" | grep -oE "['\"][^'\"]+\.php['\"]" | tail -1 | tr -d "'\"")"
      target="${target#/}"
      if [ ! -e "$CONTENT/mu-plugins/$target" ] && [ ! -e "$CONTENT/$target" ] && [ ! -e "$CONTENT/plugins/${target#*plugins/}" ]; then
        echo "   ${f#"$ROOT"/}:$line loads missing $target"
      fi
    done
  done
fi
echo "(end of list)"

if [ "$HAS_WP" = 1 ]; then
  hr "12. Users, access and scheduled hooks (counts, role names and hook names only)"
  IS_MS=0
  grep -qE "define\([[:space:]]*['\"]MULTISITE['\"][[:space:]]*,[[:space:]]*(true|1)" "$CONFIG" 2>/dev/null && IS_MS=1
  role_counts() {
    WP user list "$@" --fields=roles --format=csv 2>/dev/null | tail -n +2 | tr ',' '\n' | sed 's/^"//; s/"$//; s/^$/(no role)/' | sort | uniq -c | awk '{printf "%s %s, ", $2, $1}' | sed 's/, $//'
  }
  if [ "$IS_MS" = 1 ]; then
    echo "super admins: $(WP super-admin list 2>/dev/null | wc -l | tr -d ' ')"
    echo "network registration setting: $(WP site option get registration 2>/dev/null | grep -xE 'none|user|blog|all' || echo unknown)"
    WP site list --fields=blog_id,url --format=csv 2>/dev/null | tail -n +2 | while IFS=, read -r id url; do
      echo "blog $id: roles: $(role_counts --url="$url")"
    done
  else
    echo "roles: $(role_counts)"
    echo "open registration (users_can_register): $(WP option get users_can_register 2>/dev/null | grep -xE '0|1' | sed 's/1/yes/; s/0/no/' || echo unknown)"
    echo "default role for new users: $(WP option get default_role 2>/dev/null | grep -xE '[a-z_]+' || echo unknown)"
  fi
  PREFIX="$(WP db prefix 2>/dev/null)"
  if [ -n "$PREFIX" ]; then
    echo "users registered on or after $SINCE: $(WP db query "SELECT COUNT(*) FROM ${PREFIX}users WHERE user_registered >= '$SINCE'" --skip-column-names 2>/dev/null)"
    echo "users with application passwords: $(WP db query "SELECT COUNT(DISTINCT user_id) FROM ${PREFIX}usermeta WHERE meta_key='_application_passwords'" --skip-column-names 2>/dev/null)"
  fi
  echo "-- cron hooks (main site; unfamiliar hooks are worth a look):"
  WP cron event list --fields=hook --format=csv 2>/dev/null | tail -n +2 | sort -u | head -80 | sed 's/^/   /'
fi

hr "Done"
