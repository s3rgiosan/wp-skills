# Security Checklist

Audit categories with detection patterns + verification. Every category points back to the verification procedure in `false-positive-traps.md` before reporting.

---

## 1. Authentication & Authorization

### 1.1 REST routes missing `permission_callback`

**Detect:**
```bash
grep -RnE "register_rest_route" --include="*.php" .
# For each hit, read 5 lines around to confirm permission_callback exists and isn't __return_true.
```

**Bad:** `'permission_callback' => '__return_true'` on anything that mutates state or reads private data.
**Bad:** Missing `permission_callback` entirely (deprecated, defaults to public in some WP versions, throws notice in current).
**OK:** `'permission_callback' => fn() => current_user_can( 'edit_posts' )` — but verify the cap matches the action's impact.

### 1.2 AJAX handlers missing capability check

**Detect:**
```bash
grep -RnE "add_action\(\s*['\"]wp_ajax_" --include="*.php" .
grep -RnE "add_action\(\s*['\"]wp_ajax_nopriv_" --include="*.php" .  # public AJAX — extra scrutiny
```

For each callback, confirm:
- `check_ajax_referer()` or explicit `wp_verify_nonce()`.
- `current_user_can()` with a cap appropriate to the action.
- For `nopriv` handlers: rate limiting, input validation, no privileged operations.

### 1.3 Wrong capability

`current_user_can( 'read' )` on a settings save = effectively unauthenticated (every logged-in user has `read`). `manage_options` for global settings; `edit_posts` / `edit_post` / `edit_others_posts` for post-scoped actions; custom caps for custom CPTs.

### 1.4 Capability check after side effect

**Bad:** `update_option(...)` then `if ( ! current_user_can(...) ) return;`. Cap check must precede every side effect.

### 1.5 IDOR — record-level authorization

Capability check is necessary but not sufficient. An endpoint with the right cap can still be vulnerable if it acts on a record ID supplied by the caller without checking the caller has access to *that specific record*.

**Detect:**
```bash
# Endpoints reading an ID from request and acting on it
grep -RnE "\\\$_(GET|POST|REQUEST)\[['\"]?(id|post_id|user_id|order_id|customer_id|item_id)['\"]?\]" --include="*.php" .
```

For each callsite, trace the ID to its sink. Examples that need a record-level check:

| Pattern | Risk |
|---|---|
| `wc_get_order( $_POST['id'] )` → mutate / export | Shop Manager can act on any order, including orders not in their scope (multistore / vendor plugins). |
| `get_post( $_POST['id'] )` → update / publish / delete | Editor can act on posts they don't own when policy intends "own posts only". |
| `get_user_meta( $_POST['user_id'] )` → return | Profile data leak across users. |
| `wp_delete_attachment( $_POST['attachment_id'] )` | Attachment deletion across uploaders. |

**Fix patterns:**
- Check ownership explicitly: `if ( $order->get_customer_id() !== get_current_user_id() ) wp_die(403);`.
- Use map-meta-cap with a per-record capability: `current_user_can( 'edit_post', $post_id )` (note the second arg — this is the correct way to call it for record-scoped caps).
- For custom CPTs with per-record permissions, see [[wp-record-level-capability-scoping]] pattern (custom `capability_type` + `map_meta_cap` filter reading post meta).

**Severity:** IDOR with destructive impact is at least **High**; if the record holds sensitive data (PII / financial / private), **Critical** when reachable by Subscriber.

---

## 2. Nonces (CSRF)

### 2.1 Missing nonce on state-changing form / AJAX / link

**Detect:**
```bash
grep -RnE "(wp_nonce_field|wp_create_nonce|check_admin_referer|check_ajax_referer|wp_verify_nonce)" --include="*.php" .
```

Cross-reference with form handlers and AJAX handlers. Every destructive action needs a nonce.

**Verify before flagging:** see `false-positive-traps.md` §2 — REST cookie auth has implicit nonce semantics; admin-area pages with `manage_options` are still CSRF-vulnerable without nonces.

### 2.2 Nonce verified but result ignored

**Bad:**
```php
wp_verify_nonce( $_POST['_wpnonce'], 'foo' ); // result discarded
// ...mutate state...
```
Use `check_admin_referer()` (dies on failure) or check the return value.

### 2.3 Same nonce reused for unrelated actions

Nonce action strings should be scoped: `delete_post_{$id}`, not `my_plugin_action`. A leaked broad nonce = blanket CSRF.

---

## 3. Input Handling: Sanitize

### 3.1 `$_GET` / `$_POST` / `$_REQUEST` / `$_COOKIE` used directly

**Detect:**
```bash
grep -RnE "\\\$_(GET|POST|REQUEST|COOKIE|SERVER)\[" --include="*.php" .
```

Every read must be sanitized at the boundary using the right function for the data shape:

| Data shape | Function |
|---|---|
| Text (single line) | `sanitize_text_field()` |
| Textarea | `sanitize_textarea_field()` |
| Email | `sanitize_email()` |
| URL | `esc_url_raw()` (storage), `esc_url()` (output) |
| Filename | `sanitize_file_name()` |
| HTML class | `sanitize_html_class()` |
| Key (used as array key / option key) | `sanitize_key()` |
| Title | `sanitize_title()` (slug) or `sanitize_text_field()` (display) |
| Hex color | `sanitize_hex_color()` |
| Integer | `(int)`, `absint()`, `intval()` |
| HTML content | `wp_kses_post()` with explicit allowed tags |

`wp_unslash()` before sanitizing (`$_POST` is magic-quotes-slashed historically; WP preserves this for compat).

### 3.2 Sanitize-for-storage vs sanitize-for-output

Sanitization at input + escape at output. Don't conflate. `sanitize_text_field()` strips tags but doesn't escape; output through `esc_html()` / `esc_attr()` regardless.

---

## 4. Output: Escape

### 4.1 Echoed values without escape

**Detect:**
```bash
grep -RnE "echo \\\$" --include="*.php" .
grep -RnE "<\?=" --include="*.php" .
```

| Context | Escape |
|---|---|
| HTML body text | `esc_html()` |
| HTML attribute (incl. `class`, `id`, `data-*`) | `esc_attr()` |
| URL in href / src | `esc_url()` |
| JavaScript variable (inline) | `wp_json_encode()` then output unescaped JSON |
| CSS value | `esc_attr()` or specific CSS escape |
| `<textarea>` content | `esc_textarea()` |
| Translated string for output | `esc_html__()` / `esc_attr__()` / `esc_html_e()` / etc. |

### 4.2 Double-escape / wrong-escape

`esc_html()` on a value already escaped → visible `&amp;amp;`. `esc_html()` on an attribute → broken markup if value contains quotes. Verify context before flagging "missing escape" — wrong-escape is a different finding.

### 4.3 Allowlisted HTML

Trusted-but-rich HTML output (admin-saved post content) → `wp_kses_post()` or `wp_kses( $value, $allowed )`. Never echo untrusted user HTML.

---

## 5. SQL Injection

### 5.1 `$wpdb` direct query without `prepare()`

**Detect:**
```bash
grep -RnE "\\\$wpdb->(query|get_results|get_var|get_row|get_col)\(" --include="*.php" .
```

For each, confirm:
- `$wpdb->prepare()` wraps any interpolation, OR
- Identifiers (table / column names) come from a static whitelist (e.g. `post_type_exists( $type )` then interpolation), OR
- Value is an integer cast via `absint()` / `(int)` (low-risk, but flag as fragile).

**Verify before flagging:** `false-positive-traps.md` §1. Don't flag `esc_sql()`-wrapped interpolations that go through a whitelist.

### 5.2 `prepare()` misuse

**Bad:** `$wpdb->prepare( "SELECT * FROM $table WHERE id = $id" )` — interpolation happens before `prepare()` sees it.
**Bad:** `$wpdb->prepare( "SELECT * FROM %s WHERE id = %d", $table, $id )` — `%s` quotes table name, breaking the query and not actually escaping it as an identifier.

Table / column names: interpolate from a whitelisted constant (`$wpdb->prefix . 'foo'`), never from `prepare()`.

### 5.3 LIKE wildcards

**Bad:** `$wpdb->prepare( "WHERE name LIKE '%$user_input%'", ... )`.
**OK:** `$like = '%' . $wpdb->esc_like( $user_input ) . '%'; $wpdb->prepare( "WHERE name LIKE %s", $like );`

---

## 6. File Operations

### 6.1 Path traversal

**Detect:**
```bash
grep -RnE "(file_get_contents|file_put_contents|fopen|unlink|copy|rename|include|require|readfile)\(" --include="*.php" .
```

User-controlled path components → traversal risk. Mitigate with:
- `realpath()` + prefix check against the allowed base directory.
- `basename()` if only the filename is user-controlled.
- Reject paths containing `..`, NUL, or absolute paths.

### 6.2 Arbitrary file upload

**Detect:**
```bash
grep -RnE "(move_uploaded_file|wp_handle_upload|wp_upload_bits|media_handle_upload)\(" --include="*.php" .
```

Confirm:
- MIME type allowlist (not denylist).
- `wp_check_filetype_and_ext()` for double-extension protection.
- Stored outside webroot OR `.htaccess`-protected / served via PHP with `Content-Disposition: attachment`.
- File size limits.

### 6.3 Arbitrary file read

Endpoints that serve file contents → confirm path is constrained. Never accept full paths or template names without an allowlist.

---

## 7. HTTP Egress (SSRF)

**Detect:**
```bash
grep -RnE "wp_remote_(get|post|head|request)\(" --include="*.php" .
```

If URL is user-controlled:
- Validate host against an allowlist.
- Reject internal IPs (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`).
- Set a timeout (`'timeout' => 10`).
- Don't forward auth headers to attacker-controlled hosts.

---

## 8. Deserialization (Object Injection)

**Detect:**
```bash
grep -RnE "(^|[^a-zA-Z_])unserialize\(" --include="*.php" .
grep -RnE "maybe_unserialize\(" --include="*.php" .
```

`maybe_unserialize()` on `get_post_meta()` / `get_user_meta()` / `get_option()` values is usually safe (stored by the plugin). Dangerous when:
- The meta key is user-writable via REST / AJAX without sanitization.
- Reading meta written by another plugin / theme without knowing its shape.
- Deserializing data fetched from external HTTP.

Prefer `json_decode()` for new code; document any new `unserialize()` callsite.

---

## 9. Cryptography & Secrets

### 9.1 Hardcoded secrets in source

```bash
grep -RnE "(api[_-]?key|secret|password|token)\s*=\s*['\"][A-Za-z0-9]{16,}" --include="*.php" --include="*.js" .
```

- Hardcoded API keys / passwords / tokens in PHP / JS / config files.
- Encryption with `mcrypt_*` (removed in PHP 7.2) or hand-rolled AES.
- Token comparison with `==` / `===` instead of `hash_equals()` (timing attack).
- `wp_generate_password()` for passwords (OK); `wp_generate_uuid4()` / `random_bytes()` for security tokens.

### 9.2 Stored credentials — plaintext / autoloaded / form-visible

Third-party API keys / OAuth secrets / SMTP passwords stored in `wp_options` or post meta. Every one of these checks is a separate finding:

| Issue | Detect | Severity |
|---|---|---|
| Stored in plaintext (no encryption / signed-blob) | `grep -RnE "(update_option|add_option)\(\s*['\"](.*?(api[_-]?key\|secret\|password\|token).*?)['\"]" --include="*.php" .` | **High** (database backup / DB-read access / errant `get_option` exposure) |
| Stored with autoload=yes (default for `update_option`) | `wp option list --autoload=yes --format=csv \| grep -iE "(api[_-]?key\|secret\|token\|password)"` (on a live install) | **Medium** (loaded into memory on every request, broader exposure surface) |
| Form input rendered as `<input type="text">` instead of `type="password"` | Read settings page render code; look for `type="text"` near `api_key` / `secret` field IDs | **Medium** (shoulder-surfing, plain-text in clipboard / dev tools / screen sharing) |
| Logged via `error_log` / `wp_send_json` on error | `grep -RnE "(error_log\|wp_send_json)" --include="*.php" .` then look for adjacent secret variables | **High** if log files are public-readable; **Medium** otherwise |
| Returned in REST/AJAX response payloads (even partial) | Trace response shape — does it echo back the stored option? | **High** |

**Fix patterns:**
- Mark sensitive options `autoload=no`: `add_option( $key, $value, '', 'no' )` (note: changing autoload on an existing option requires `update_option` with explicit autoload param on WP 6.4+, or `wp_set_option_autoload` API on 6.6+).
- For settings forms, use `type="password"` (mask) with a separate "reveal" button if the admin needs to verify the stored value. Better: don't echo the stored secret back to the form at all — show a masked placeholder; only update if the user types a new value.
- Encrypted-at-rest: use a server-side secret (defined as a `wp-config.php` constant, e.g. `MY_PLUGIN_ENCRYPTION_KEY`) + `sodium_crypto_secretbox` for symmetric encryption. Avoid hand-rolled AES.

### 9.3 Secrets in user-facing error messages

```bash
grep -RnE "(echo|print|die|wp_die|wp_send_json_error)\(.*?\\\$.*?(api_key|secret|token|password)" --include="*.php" .
```

Stack traces, debug strings, or "API returned X" messages that include the credential. Even partial leaks ("first 4 chars match") help an attacker.

---

## 10. Cross-Site Scripting (Beyond Section 4)

- `the_title()` is auto-escaped in default contexts but not in attribute context — wrap with `esc_attr()` for `<input value="">`.
- `wp_localize_script()` JSON-encodes values; safe for inline JS.
- Inline `onclick="..."` with PHP interpolation → `esc_js()` + `esc_attr()` double-escape minefield. Prefer event listeners.
- Stored XSS in user-editable fields rendered without `esc_html()` / `wp_kses_post()`.

---

## 11. Error Response & Information Disclosure

How an endpoint fails matters as much as how it succeeds.

### 11.1 Hard `die()` / `exit()` mid-AJAX or mid-REST

```bash
grep -RnE "\b(die|exit)\(" --include="*.php" . | grep -v "wp_die"
```

For each `die()` / `exit()` inside an AJAX or REST callback:

| Pattern | Issue |
|---|---|
| `die("error, no order")` in `wp_ajax_*` callback | Returns `text/html` body instead of JSON. Breaks `wp_send_json_*` contract; downstream JS receives unparseable response. Plaintext content may leak internal state ("no order", "DB connection lost", path fragments). |
| `exit;` after `wp_send_json_*` | Redundant (helpers call `wp_die` internally) and confuses readers. |
| `die( $exception->getMessage() )` | Echoes exception text — may leak file paths, query fragments, DB errors. |

**Fix:** use `wp_send_json_error( [ 'code' => 'no_order', 'message' => __('Order not found', 'plugin') ] )` and let WP handle status code + content-type.

### 11.2 Verbose error responses

| Issue | Detect |
|---|---|
| Exception messages echoed verbatim | `grep -RnE "(echo \|wp_send_json_error\()\\\$e->getMessage" --include="*.php" .` |
| SQL errors surfaced (`$wpdb->last_error` returned to client) | `grep -RnE "\\\$wpdb->last_error" --include="*.php" .` |
| Stack traces in production responses | `grep -RnE "(getTraceAsString\|debug_backtrace)" --include="*.php" .` |
| File paths in error strings | Visual inspection of error messages |

**Fix:** generic user-facing message + detailed log (`error_log` / Monolog) for developers.

### 11.3 Debug / development leftovers

- `error_reporting()` / `ini_set('display_errors', ...)` in production code — info disclosure.
- `phpinfo()` / `var_dump()` / `print_r()` left behind in any execution path.
- Debug routes / endpoints registered without conditional gate (`WP_DEBUG`, `defined('SCRIPT_DEBUG')`).
- `console.log()` of sensitive data in shipped JS.

---

## 12. Direct File Access

Every PHP file must guard against direct browser request. Without the guard, a misconfigured webserver, an exposed `wp-content/plugins/` index, or a directory traversal elsewhere can serve raw PHP for execution outside the WP context — leaking source, throwing fatals that disclose paths, or running code that assumes WP has booted.

```bash
# Files containing PHP code but no ABSPATH check
for f in $(find . -name "*.php" -not -path "*/vendor/*" -not -path "*/node_modules/*"); do
  if ! grep -q "ABSPATH\|WP_INC\|WP_USE_THEMES" "$f"; then
    echo "$f"
  fi
done
```

**Required guard:**
```php
defined( 'ABSPATH' ) || exit;
```

**Severity:**
- Templates (`templates/*.php`) and stand-alone callbacks: **Medium** — defense-in-depth; direct access typically harmless but the discipline matters.
- Files containing destructive logic (queries, file ops) reachable without the guard: **High**.
- Files with credentials / API calls hard-coded: **High** / **Critical** depending on what's exposed.

**Exceptions:** pure class files in PSR-4 autoload aren't reachable directly because they have no executable top-level code — still good practice but lower priority.

---

## 13. Misc

- **`extract()`** on user input → variable injection.
- **`call_user_func()` / `call_user_func_array()`** with user-controlled callable → arbitrary function call.
- **Misspelled filenames that WP relies on** — e.g. `unistall.php` instead of `uninstall.php` → uninstall hook never fires → orphaned options / tables (call out as **Low** if no destructive logic; **Medium** if cleanup code is in there but unreachable; **High** if uninstall is supposed to remove credentials and they remain).
- **Misspelled constants** — e.g. `WP_UNISTALL_PLUGIN` vs `WP_UNINSTALL_PLUGIN` → guard never triggers. Same severity logic.

---

## Verification reminder

Every finding goes through `false-positive-traps.md` before being written to the report. The four worst FP categories — SQLi, missing nonce, missing escape, missing sanitize — have explicit procedures there.
