# False Positive Traps

The four categories that get over-flagged in WP audits. Every candidate finding in these categories MUST go through the verification procedure below before being written to the report.

> **Real precedent:** A subagent flagged an IN-clause `PostToPost.php:67` as SQLi during a real plugin audit. Verified false — the variable came from `post_type_exists()` validation in the constructor + `esc_sql()`. The finding was dropped; the *fragility* was noted as Low (a future refactor could break the guard) instead of falsely shipping a "Critical SQLi".

Two failure modes the procedures protect against:

1. **Over-claiming** — flagging exploitable bugs that aren't.
2. **Under-claiming** — passing a real bug because "it looks like the FP pattern."

When in doubt, write the finding with the trace inline. The trace makes it falsifiable.

---

## 1. SQL Injection

### Pattern that triggers the alarm

```php
$type = $_GET['type'];
$results = $wpdb->get_results( "SELECT * FROM {$wpdb->posts} WHERE post_type = '{$type}'" );
```

### Verification procedure

Trace `$type` from the source (`$_GET`) to the sink (`get_results`). For each transformation, classify:

| Transformation present | Effect | Verdict on this trace |
|---|---|---|
| `$wpdb->prepare()` wraps the value | Properly escaped | Not SQLi |
| `esc_sql()` applied | Escapes single quotes; sufficient inside a single-quoted string literal | Not SQLi (but flag as fragile if no whitelist alongside) |
| Whitelist check: `if ( ! post_type_exists( $type ) ) return;` | Value can only be a registered post type | Not SQLi |
| Whitelist check: `if ( ! in_array( $type, $allowed, true ) ) ...` | Value can only be in a static list | Not SQLi |
| Cast to int: `$id = (int) $_GET['id'];` or `absint()` | Integer-shaped, safe for numeric column | Not SQLi |
| Used in identifier context (table / column name) with whitelist | OK if the whitelist is exhaustive | Not SQLi |
| **None of the above** | Raw interpolation of `$_GET` into SQL | **Critical SQLi** |

### Fragility note

A finding can be "not exploitable today" but "fragile":

> The query uses `esc_sql()` and the value passes `post_type_exists()` in the constructor. Not exploitable today. **Fragile**: a refactor that calls this code path with an unvalidated post type would re-introduce SQLi. Recommended: switch to `$wpdb->prepare()` with `%s` and document the invariant.

That's a Medium finding, not a Critical.

### Anti-pattern: PHPCS rule cited as the only evidence

`WordPress.DB.PreparedSQL.NotPrepared` fires on `$wpdb->query( $sql )` if `$sql` is a variable. PHPCS can't see what's in the variable. Don't transcribe the PHPCS rule as a finding without tracing the variable's contents.

---

## 2. Missing Nonce (CSRF)

### Pattern that triggers the alarm

```php
add_action( 'admin_init', function () {
    if ( isset( $_POST['save_settings'] ) ) {
        update_option( 'my_settings', $_POST['settings'] );  // no nonce check seen
    }
} );
```

### Verification procedure

| Check | If true, is it still CSRF? |
|---|---|
| Endpoint is REST with cookie auth + `permission_callback` doing a real cap check | No — REST auth uses nonce headers; the framework verifies. |
| Endpoint is admin-only AND has `current_user_can( 'manage_options' )` (or stronger) | **Yes**, CSRF still works: attacker tricks an admin into submitting; cap check passes because the admin is logged in. |
| Endpoint is admin-only AND has `current_user_can( 'read' )` (every logged-in user has this) | Yes, and the access is broader than expected. |
| Action is read-only (no state change) | No — CSRF on a GET endpoint that only reads isn't a vulnerability (info disclosure is a different finding). |
| Action requires admin-ajax with `check_ajax_referer()` | If `check_ajax_referer()` is genuinely called, the nonce IS verified. Read the callback before flagging. |

**Critical insight:** capability checks DO NOT replace nonces. An attacker can CSRF an admin into submitting forms; the cap check passes because the victim has the cap. The nonce binds the request to the user's intent.

### Verification steps

1. Read the entire handler. Look for ANY of: `wp_verify_nonce()`, `check_admin_referer()`, `check_ajax_referer()`, `wp_nonce_field()` (in the form template), `_wpnonce` parameter checked manually.
2. If the handler is a REST callback, check `register_rest_route`'s `permission_callback` for a real check (not `__return_true`).
3. If the handler is a Settings API callback (`register_setting`'s `sanitize_callback`), the Settings API framework handles nonce verification — confirm by checking the form actually uses `settings_fields()`.
4. If still missing → confirmed finding.

### Anti-pattern: flagging GET-only diagnostic endpoints

A `?action=my_debug` endpoint that reads + displays without mutating state isn't CSRF. It might be info disclosure (different category) or unauthenticated info disclosure (Critical/High depending on data).

---

## 3. Missing Escape (XSS)

### Pattern that triggers the alarm

```php
echo $post->post_title;        // PHPCS: WordPress.Security.EscapeOutput.OutputNotEscaped
echo get_option( 'my_option' );
```

### Verification procedure

Step 1: **Identify the output context.** The right escape depends on where the value lands in the HTML:

| Context | Right escape |
|---|---|
| HTML body (`<div>VALUE</div>`) | `esc_html()` |
| HTML attribute (`<div data-foo="VALUE">`) | `esc_attr()` |
| URL in attribute (`<a href="VALUE">`) | `esc_url()` |
| Inline JavaScript (`var x = "VALUE";`) | `wp_json_encode()` (then output without further escape) |
| CSS value (`style="color: VALUE"`) | `esc_attr()` + CSS-specific validation |
| Translated string going to body | `esc_html__()` |
| Trusted-rich HTML | `wp_kses_post()` |

If the wrong escape is applied (`esc_html()` on an `href` URL) → that's a **wrong-escape** finding, not a missing-escape finding. Still a bug, often Medium severity (works in benign cases, breaks on edge cases like apostrophes in titles or `&` in URLs).

Step 2: **Check upstream escaping.** Some values are already escaped:

| Value source | Already escaped? |
|---|---|
| `the_title()` (NOT `get_the_title()`) | Yes — `the_title()` runs `apply_filters('the_title', ...)` which includes `wptexturize` + others, but **does NOT escape**. Common confusion. |
| `the_content()` | No — runs filters, doesn't escape. Trust depends on author cap. |
| `get_the_title()` | No — raw post title. Escape at output. |
| `wp_kses_post()` already applied to stored value | Yes (for HTML body context). |
| `esc_url_raw()` already applied | Safe for storage, NOT for output — re-escape with `esc_url()` at output. |

Step 3: **Confirm the trust model.** A site's own settings page rendering options stored by the same admin is lower risk than user-generated content rendered to other users. Both should be escaped, but severity differs:

- Stored XSS in a public page (any logged-in user can plant payload) → **High**.
- Reflected XSS via `$_GET` → **High** (one-click attack).
- Stored XSS only in admin-self context (admin sees their own option) → **Medium** (still needs fixing).
- Echo of admin-supplied option to admins only via WP-controlled UI (e.g., `the_field` rendering a textarea where admin enters HTML) — depends. Check who edits, who sees.

### Anti-pattern: flagging escaped-but-via-wrapper

```php
the_title();                   // not escaped by default
echo esc_html( get_the_title() );  // explicitly escaped — OK
echo '<h1>' . esc_html( get_the_title() ) . '</h1>';  // OK
the_title( '<h1>', '</h1>' );  // wraps but DOESN'T escape — bug

bloginfo( 'name' );            // escaped via 'display' filter; OK
get_bloginfo( 'name' );        // NOT escaped (default 'display' is for bloginfo() not get_); escape at output
```

Read what the WP function actually does before flagging.

---

## 4. Missing Sanitize

### Pattern that triggers the alarm

```php
$value = $_POST['title'];
update_post_meta( $post_id, 'my_title', $value );
```

### Verification procedure

Step 1: **Where does the value land?**

| Sink | Sanitization needed at input? |
|---|---|
| Stored in DB and ONLY displayed via escaped output (`esc_html`) | Light — `wp_unslash()` is required; type-shape sanitization optional but recommended (`sanitize_text_field` strips newlines/tabs for single-line text). |
| Stored and re-rendered as HTML body via `wp_kses_post()` at output | OK — output escape handles it. Storage sanitization optional for shape. |
| Stored and used in a SQL query later via `$wpdb->prepare()` | OK — `prepare` handles it. |
| Stored and used in a SQL query later via raw interpolation | **Critical** — SQLi via stored input (not a "missing sanitize" finding, escalate to SQLi). |
| Used as a filename / path | Yes — `sanitize_file_name()` + path traversal check. |
| Used as an array key / option key | Yes — `sanitize_key()`. |
| Used as a URL passed to `wp_remote_get()` | Yes — validate scheme + host allowlist. |
| Used as a callable (`call_user_func`) | Critical risk — must be whitelisted, not just sanitized. |

Step 2: **`wp_unslash()` precedes sanitize.**

`$_POST` values are magic-quotes-slashed by WP for compat. `wp_unslash()` removes that. Order: `wp_unslash` → sanitize.

```php
$value = sanitize_text_field( wp_unslash( $_POST['title'] ?? '' ) );
```

Step 3: **Sanitize-for-storage vs sanitize-for-output.**

Sanitize-at-input + escape-at-output is the canonical pattern. A "missing sanitize" finding without a corresponding sink that needs it is often noise.

### Anti-pattern: flagging an `(int)` cast as missing sanitize

```php
$id = (int) $_GET['id'];   // sanitized — int cast is the right shape for an ID
```

`(int)` / `absint()` / `intval()` are perfectly valid sanitization for integer values. PHPCS sometimes complains because it can't see the cast.

### Anti-pattern: re-sanitizing values already sanitized by a callback

```php
register_setting( 'foo', 'foo_option', [
    'sanitize_callback' => 'sanitize_text_field',
] );

// later:
$value = sanitize_text_field( get_option( 'foo_option' ) );  // redundant
```

Sanitize once at the boundary; trust the storage.

---

## 5. Other common over-flags

| Pattern | Why it looks like a bug | Why it isn't (usually) |
|---|---|---|
| `add_filter('the_content', $cb)` modifying content | "Could XSS!" | If `$cb` outputs already-escaped HTML or `wp_kses_post()`-passed HTML, fine. Read the callback. |
| `wp_remote_get` to a hardcoded URL | "SSRF!" | Hardcoded URLs aren't SSRF. SSRF requires user-controlled URL. |
| `do_action('init', ...)` with side effects | "Race condition!" | Hooks run sequentially in PHP. No threading. |
| `header()` after output | "Headers already sent!" | Often guarded by `headers_sent()` check; or the output is conditional and doesn't actually run. Trace it. |
| Direct property access on `WP_Post` (`$post->post_title`) | "Should use accessor!" | `WP_Post` has public properties by design. Not a bug. |
| `serialize()` / `unserialize()` of plugin's own stored data | "Object injection!" | Object injection requires attacker-controlled serialized blob. Plugin reading its own writes is safe absent a separate write-side hole. |
| `eval()` | "RCE!" | True in 99% of cases. Verify the 1% (e.g., evaluating a constant expression compiled from `__halt_compiler()` data). Almost always flag as Critical. |

---

## 6. The verification log

When you drop a finding as a false positive, write it to the report's **Verified false** appendix:

```markdown
## Verified false (appendix)

- `Helpers/Query.php:67` — IN clause with interpolated `$post_type`. Verified false:
  `$post_type` is validated via `post_type_exists()` in the constructor and
  `esc_sql()` is applied. Pattern is fragile but not currently exploitable;
  see Medium finding §M-3 for the recommendation to switch to `prepare()`.

- `Admin/Settings.php:142` — direct `echo get_option( 'foo_label' )`. Verified
  false: option is registered via `register_setting()` with
  `sanitize_callback => 'sanitize_text_field'`, ensuring no HTML at storage.
  Recommended addition of `esc_html()` at output for defense-in-depth (logged
  as Low §L-2).
```

This appendix:
- Saves the next auditor's time.
- Shows your work (reviewers trust the report).
- Makes it easy to revisit if the codebase changes (search for the file:line, see the verification rationale).
