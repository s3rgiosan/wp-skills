# Integration Checklist

The other four checklists audit what's *inside* the plugin. This one audits what happens when the plugin meets the other software on the site. This class of finding is invisible from the audited plugin's source, its settings screens, and every tool — finding it requires opening a *different* plugin and reading it.

The recurring mechanism: **a companion writes shared data with direct SQL rather than the platform's data layer. Direct writes fire no hooks. So anything hook-driven in the audited plugin is silently bypassed** — its logic is correct, its trigger never fires. The site looks healthy in the primary case and is quietly wrong in every other one.

**Scope guard — this is NOT "audit every plugin on the site."** The trigger is narrow:

- a companion plugin that **writes the same data** the audited plugin reads or reacts to, or
- a platform layer that **duplicates the records** the audited plugin stores IDs for (multilingual, multisite, staging→prod sync, import/export).

That's a short list on most sites, and it's usually already surfaced in **Discover → Capture operating constraints → "Who else writes this data?"** (SKILL.md). Only when that question turns up a companion touching the same data do you read the companion's source — for that path only.

**Ruling a risk out is a finding too.** "The feared feedback loop between these two plugins *cannot* happen, because the companion writes via direct SQL and fires no hook" is worth as much to the reader as a positive finding, and belongs in the report body with its citation — not buried in the verified-false appendix. State the mechanism either way.

---

## 1. Another plugin writes the same data

The core case. If a companion writes data the audited plugin reads or reacts to, **how** it writes decides whether the audited plugin ever hears about it.

**Detect:** once Discover names a companion touching the shared data, read *its* write path.

```bash
# In the companion plugin's directory — does it write through the platform API, or straight to the DB?
grep -RnE "\\\$wpdb->(query|insert|update|delete|get_results)" --include="*.php" .   # direct SQL → fires no hooks
grep -RnE "(update_post_meta|wp_update_post|wp_insert_post|update_option|wp_set_object_terms)\(" --include="*.php" .  # API → fires hooks
```

| Companion writes via | Consequence for a hook-driven audited plugin |
|---|---|
| Platform API (`update_post_meta`, `wp_update_post`, `update_option`, term functions) | Hooks fire (`updated_post_meta`, `save_post`, `updated_option`, …). The audited plugin's listener runs. Usually fine. |
| **Direct SQL (`$wpdb->update` / `->query`)** | **No hook fires.** Any `add_action`/`add_filter` the audited plugin relies on to recalculate, invalidate, or sync is silently skipped for every record the companion touches. Correct logic, dead trigger. |

**Verify:** name the exact companion `file:line` doing the direct write, and the exact audited-plugin hook that therefore never fires. Both citations, or it's not a finding. If the companion writes via the API and the hook *does* fire, say so — that rules out the feedback-loop / double-recalculation fear with a citation.

---

## 2. Stored foreign IDs vs record-duplicating layers

If the plugin stores IDs of *other* records (post IDs in meta, term IDs in options, user IDs in a custom table), any layer that **duplicates records** breaks those references.

**Detect:**

```bash
# IDs of other records stored as meta / options / custom-table columns
grep -RnE "(update_post_meta|add_post_meta)\([^,]+,\s*['\"][^'\"]*(_id|_ids|_post|_ref)['\"]" --include="*.php" .
grep -RnE "\\\$wpdb->(insert|update)\(.*(post_id|term_id|user_id|parent_id)" --include="*.php" .
```

| Layer present (from Discover "what's planned") | What breaks |
|---|---|
| Multilingual (WPML / Polylang) | Translated posts are *separate* IDs. A stored reference points at one language; direct queries won't see the translation the platform applies at read time. |
| Multisite | IDs are per-site; a reference copied across sites resolves to the wrong record or none. |
| Staging → production sync | Auto-increment IDs diverge between environments; references silently repoint. |
| Import/export, duplication | New IDs on import; stored references dangle. |

**Verify:** a reference stored as an ID *and* a record-duplicating layer present (or planned) → finding. Note that the plugin's own direct `$wpdb` reads bypass any read-time ID translation the platform provides (e.g. WPML's `icl_object_id`), so even a translation-aware site returns the wrong row.

---

## 3. Hook ordering with known companions

Two plugins on the **same hook at the same priority** resolve by load order. Load order is not a contract — it changes with activation order, `active_plugins` option edits, and mu-plugins.

**Detect:**

```bash
grep -RnE "add_(action|filter)\(\s*['\"][a-z_]+['\"]\s*,[^,]+,\s*[0-9]+" --include="*.php" .   # note hook + priority
```

Flag where correctness depends on the audited plugin running before/after a named companion on the same hook, with no explicit priority separation. **Fix:** an explicit priority that encodes the required order, or a dependency on the companion's *output hook* rather than racing it on a shared one.

---

## 4. Object cache and page cache staleness

A plugin that writes directly (direct SQL, or bypassing the function whose hook clears caches) can leave a persistent object cache or a full-page cache serving stale data.

**Detect:**

```bash
grep -RnE "wp_cache_(set|get|delete)\(" --include="*.php" .        # does it manage its own cache group?
grep -RnE "\\\$wpdb->(update|query|delete)\(" --include="*.php" .   # direct writes that skip clean_post_cache / wp_cache_delete
```

| Situation | Consequence |
|---|---|
| Direct `$wpdb` write without a matching `clean_post_cache()` / `wp_cache_delete()` | Persistent object cache (Redis/Memcached) serves the old value until TTL. |
| Write with no page-cache purge hook | Full-page cache (Batcache, host CDN) serves stale HTML. |

**Verify:** confirm a persistent object cache is plausible on the target install (Discover) before rating — on a site with no object cache, request-scoped only, this drops to Low.

---

## 5. Compatibility declarations the platform expects

Some platforms require a plugin to *declare* compatibility. A plugin can be fully compatible and declare nothing — in which case the platform lists it as **untested** and may block a migration on it. Undeclared-but-safe is still a finding: it's a one-line fix that unblocks the owner.

### WooCommerce HPOS (High-Performance Order Storage)

Undeclared → WooCommerce lists the plugin as incompatible/untested on the Features screen and **blocks enabling HPOS** while it's active.

**Detect:**

```bash
grep -RnE "declare_compatibility\(\s*['\"]custom_order_tables['\"]" --include="*.php" .   # present?
grep -RnE "wc_get_order|WC_Order|->get_order\(|wc_get_orders" --include="*.php" .          # touches orders at all?
```

Touches orders but no `custom_order_tables` declaration → finding. Declaration (main plugin file):

```php
add_action( 'before_woocommerce_init', function() {
	if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
	}
} );
```

### WooCommerce Cart and Checkout Blocks

**Detect:**

```bash
grep -RnE "declare_compatibility\(\s*['\"]cart_checkout_blocks['\"]" --include="*.php" .
grep -RnE "woocommerce_checkout|WC_Checkout|checkout_fields|woocommerce_cart" --include="*.php" .
```

Interacts with cart/checkout but no `cart_checkout_blocks` declaration → finding. Same shape:

```php
add_action( 'before_woocommerce_init', function() {
	if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', __FILE__, true );
	}
} );
```

Note: WooCommerce only validates Cart/Checkout Blocks compatibility for extensions that carry the `WC tested up to` header in the main plugin file — flag a missing header too if it's absent.

---

## Reporting this class

- **Cite both sides.** A cross-plugin finding needs the companion `file:line` *and* the audited-plugin `file:line`. A claim about code the reader hasn't been pointed to is unverifiable.
- **Positive and negative both go in the body.** "Silently bypassed, here's why" and "cannot happen, here's why" are equally load-bearing.
- **Severity follows impact, not privilege.** A silently-never-fired recalculation on system-of-record data can be High or Critical via the silent-corruption rule (SKILL.md), even though nothing is "exploitable."
