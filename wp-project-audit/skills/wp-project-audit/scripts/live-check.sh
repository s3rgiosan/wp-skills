#!/usr/bin/env bash
# live-check.sh: owner-authorized, read-only HTTP checks against a live WordPress site.
#
# Sends a small, rate-limited set of GET and HEAD requests (about 25) and reports
# status codes, header presence and yes/no markers. It never prints response bodies,
# header values beyond a detected label, user names or file contents, and it never
# submits forms, logs in, or retries a login.
#
# Run it only against a site the owner controls and has authorized in writing for
# this audit. Pass --authorized to confirm.
#
# Usage:
#   bash live-check.sh --url https://example.com --authorized [--delay <seconds>] [--out <dir>]
#
#   --url         Site home URL (scheme and host, optional subdirectory path).
#   --authorized  Required: confirms the owner authorized these requests.
#   --delay       Seconds between requests (default 1).
#   --out         Also write the output to <dir>/live-check-<date>.txt.

set -uo pipefail

URL=""
AUTH=0
DELAY=1
OUTDIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2:?}"; shift 2 ;;
    --authorized) AUTH=1; shift ;;
    --delay) DELAY="${2:?}"; shift 2 ;;
    --out) OUTDIR="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$URL" ] || { echo "Missing --url" >&2; exit 2; }
[ "$AUTH" = 1 ] || { echo "Refusing to run without --authorized (owner authorization for this site is required)" >&2; exit 2; }
command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 2; }
case "$URL" in http://*|https://*) ;; *) echo "--url must start with http:// or https://" >&2; exit 2 ;; esac
URL="${URL%/}"

if [ -n "$OUTDIR" ]; then
  mkdir -p "$OUTDIR"
  exec > >(tee "$OUTDIR/live-check-$(date +%Y-%m-%d-%H%M).txt") 2>&1
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/live-check.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
UA="wp-project-audit live-check (owner-authorized)"

# fetch <method> <url> : sets CODE, CTYPE, SIZE; body in $WORK/body, headers in $WORK/headers
fetch() {
  sleep "$DELAY"
  local method="$1" target="$2"
  : > "$WORK/body"; : > "$WORK/headers"
  if [ "$method" = HEAD ]; then
    CODE="$(curl -s -I -A "$UA" --max-time 15 -D "$WORK/headers" -o /dev/null -w '%{http_code}' "$target" 2>/dev/null)"
  else
    CODE="$(curl -s -A "$UA" --max-time 15 --max-filesize 5000000 -D "$WORK/headers" -o "$WORK/body" -w '%{http_code}' "$target" 2>/dev/null)"
  fi
  CTYPE="$(grep -i '^content-type:' "$WORK/headers" | tail -1 | cut -d: -f2- | tr -d ' \r' | cut -d';' -f1)"
  SIZE="$(wc -c < "$WORK/body" | tr -d ' ')"
}
has_header() { grep -qi "^$1:" "$WORK/headers"; }
yn() { if "$@"; then echo yes; else echo no; fi; }
hr() { printf '\n== %s\n' "$1"; }
location() { grep -i '^location:' "$WORK/headers" | tail -1 | cut -d: -f2- | tr -d ' \r'; }
starts_https() { case "$1" in https://*) return 0 ;; *) return 1 ;; esac; }
is_author_archive() { case "$1" in */author/*) return 0 ;; *) return 1 ;; esac; }

echo "Target: $URL"
echo "Requests are rate-limited to one per ${DELAY}s. Bodies are inspected in a temp dir and deleted."

hr "1. HTTPS"
HOST_PATH="${URL#*://}"
fetch HEAD "http://$HOST_PATH/"
LOC="$(location)"
echo "http:// request: status $CODE, redirects to https: $(yn starts_https "$LOC")"

hr "2. Security headers on the home page"
fetch GET "$URL/"
HOME_CODE="$CODE"
cp "$WORK/headers" "$WORK/home-headers"; cp "$WORK/body" "$WORK/home-body"
echo "home page status: $HOME_CODE"
for h in Content-Security-Policy X-Frame-Options Strict-Transport-Security X-Content-Type-Options Referrer-Policy Permissions-Policy; do
  printf '%-28s %s\n' "$h:" "$(yn has_header "$h")"
done
printf '%-28s %s\n' "CSP frame-ancestors:" "$(yn grep -qi '^content-security-policy:.*frame-ancestors' "$WORK/headers")"
printf '%-28s %s\n' "X-Powered-By present:" "$(yn has_header X-Powered-By)"
printf '%-28s %s\n' "Server version disclosed:" "$(yn grep -qiE '^server:.*[0-9]+\.[0-9]+' "$WORK/headers")"
printf '%-28s %s\n' "generator meta tag:" "$(yn grep -qiE '<meta[^>]+name=.generator' "$WORK/body")"

hr "3. Mixed content (https pages only)"
case "$URL" in
  https://*) echo "http:// resources referenced by the home page: $(grep -oiE '<(script|link|img|iframe|source|video|audio)[^>]+(src|href)=["'"'"']http://' "$WORK/home-body" | wc -l | tr -d ' ')" ;;
  *) echo "Skipped: the site URL is not https." ;;
esac

hr "4. WAF and CDN hints (from response headers)"
H="$WORK/home-headers"
WAF=""
grep -qi '^cf-ray:' "$H" && WAF="$WAF cloudflare"
grep -qiE '^x-sucuri-(id|cache):|^server:.*sucuri' "$H" && WAF="$WAF sucuri"
grep -qiE '^x-akamai|^server:.*akamai' "$H" && WAF="$WAF akamai"
grep -qiE '^x-amz-cf-id:' "$H" && WAF="$WAF cloudfront"
grep -qiE '^x-served-by:.*cache|^x-fastly' "$H" && WAF="$WAF fastly"
grep -qiE '^x-iinfo:|^x-cdn:.*incapsula' "$H" && WAF="$WAF imperva"
grep -qiE '^x-wpe-|^x-powered-by:.*wp ?engine' "$H" && WAF="$WAF wpengine-edge"
echo "detected:${WAF:- none (absence of headers does not prove there is no WAF)}"

hr "5. Sensitive paths (status, content type, marker; bodies never printed)"
check_path() {
  local path="$1" marker="$2" label="${3:-EXPOSED (content marker matched)}"
  fetch GET "$URL$path"
  local note=""
  if [ "$CODE" = 200 ]; then
    case "$CTYPE" in text/html*) note="HTML page (often a soft 404: check by hand)" ;; esac
    if [ -n "$marker" ] && grep -qE "$marker" "$WORK/body"; then note="$label"; fi
  fi
  printf '%-28s %s %s %s\n' "$path" "$CODE" "${CTYPE:--}" "$note"
}
check_path "/.env" '^[A-Z_]+='
check_path "/.git/HEAD" '^ref: '
check_path "/.git/config" '^\[core\]'
check_path "/wp-config.php" '(DB_NAME|DB_PASSWORD|AUTH_KEY)'
check_path "/wp-config.php.bak" '(DB_NAME|DB_PASSWORD)'
check_path "/wp-config.php~" '(DB_NAME|DB_PASSWORD)'
check_path "/wp-config.old" '(DB_NAME|DB_PASSWORD)'
check_path "/wp-content/debug.log" 'PHP (Notice|Warning|Fatal|Deprecated)'
check_path "/readme.html" '[Vv]ersion [0-9]' "served (discloses the version)"
check_path "/license.txt" 'WordPress' "served (confirms WordPress)"
check_path "/composer.lock" '"packages"' "EXPOSED (dependency versions)"
check_path "/package-lock.json" '"lockfileVersion"' "EXPOSED (dependency versions)"

fetch GET "$URL/xmlrpc.php"
printf '%-28s %s %s\n' "/xmlrpc.php" "$CODE" "$( [ "$CODE" = 405 ] && grep -q 'POST requests only' "$WORK/body" && echo 'enabled (accepts POST)' )"

fetch GET "$URL/wp-json/wp/v2/users"
USERS=""
if [ "$CODE" = 200 ] && command -v python3 >/dev/null 2>&1; then
  USERS="$(python3 -c 'import json,sys
try:
    d=json.load(open(sys.argv[1])); print("returns %d user records (not printed)" % len(d) if isinstance(d, list) else "")
except Exception:
    print("")' "$WORK/body")"
fi
printf '%-28s %s %s\n' "/wp-json/wp/v2/users" "$CODE" "$USERS"

fetch GET "$URL/?author=1"
LOC="$(location)"
AUTHOR_NOTE=""
is_author_archive "$LOC" && AUTHOR_NOTE="redirects to an author archive (user slug enumerable)"
printf '%-28s %s %s\n' "/?author=1" "$CODE" "$AUTHOR_NOTE"

fetch GET "$URL/wp-content/uploads/"
printf '%-28s %s %s\n' "/wp-content/uploads/" "$CODE" "$(grep -qiE '<title>Index of|Directory listing for' "$WORK/body" && echo 'directory listing ON')"

hr "6. Login page (observed once; no login attempts)"
fetch GET "$URL/wp-login.php"
echo "status: $CODE"
printf '%-28s %s\n' "CAPTCHA markers:" "$(yn grep -qiE 'g-recaptcha|h-captcha|cf-turnstile|grecaptcha|captcha' "$WORK/body")"
printf '%-28s %s\n' "SSO markers:" "$(yn grep -qiE 'saml|openid|oauth|sign in with|single sign' "$WORK/body")"
printf '%-28s %s\n' "2FA / MFA markers:" "$(yn grep -qiE 'two[- ]factor|2fa|authenticator|one-time code' "$WORK/body")"
echo "Rate limiting and MFA enforcement cannot be observed without login attempts: ask the owner."

hr "Done"
