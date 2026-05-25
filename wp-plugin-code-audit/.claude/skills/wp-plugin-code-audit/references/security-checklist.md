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

- Hardcoded API keys / passwords / tokens in PHP / JS / config files.
- Encryption with `mcrypt_*` (removed in PHP 7.2) or hand-rolled AES.
- Token comparison with `==` / `===` instead of `hash_equals()` (timing attack).
- `wp_generate_password()` for passwords (OK); `wp_generate_uuid4()` / `random_bytes()` for security tokens.

```bash
grep -RnE "(api[_-]?key|secret|password|token)\s*=\s*['\"][A-Za-z0-9]{16,}" --include="*.php" --include="*.js" .
```

---

## 10. Cross-Site Scripting (Beyond Section 4)

- `the_title()` is auto-escaped in default contexts but not in attribute context — wrap with `esc_attr()` for `<input value="">`.
- `wp_localize_script()` JSON-encodes values; safe for inline JS.
- Inline `onclick="..."` with PHP interpolation → `esc_js()` + `esc_attr()` double-escape minefield. Prefer event listeners.
- Stored XSS in user-editable fields rendered without `esc_html()` / `wp_kses_post()`.

---

## 11. Misc

- **`error_reporting()` / `ini_set('display_errors', ...)` in production code** — info disclosure.
- **`phpinfo()` / `var_dump()` / `print_r()` left behind** in any execution path.
- **Debug routes / endpoints** registered without conditional gate (`WP_DEBUG`, `defined('SCRIPT_DEBUG')`).
- **Direct file access** to PHP files without `defined( 'ABSPATH' ) || exit;` at the top.
- **`extract()`** on user input → variable injection.
- **`call_user_func()` / `call_user_func_array()`** with user-controlled callable → arbitrary function call.

---

## Verification reminder

Every finding goes through `false-positive-traps.md` before being written to the report. The four worst FP categories — SQLi, missing nonce, missing escape, missing sanitize — have explicit procedures there.
