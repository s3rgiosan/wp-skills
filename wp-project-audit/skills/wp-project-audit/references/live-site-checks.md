# Live-Site Checks

Phase 6, optional. Some exposure questions are answered fastest by asking the running site: is `/.env` served, is the uploads directory listable, which security headers are set, is there a WAF in front. These checks send a small number of ordinary, read-only HTTP requests.

**Authorization comes first.** Run them only against a site the owner controls, after the owner has authorized them in writing for this audit (a message is enough; record who and when in Sources). Never against third-party sites, shared hosts you were not asked about, or staging systems the owner does not own. No login attempts, no form submissions, no fuzzing, no brute force, no load.

---

## 1. What is checked

| Check | Request | Reading the result |
|---|---|---|
| **Sensitive paths** | `GET /.env`, `/.git/HEAD`, `/.git/config`, `/wp-config.php`, `/wp-config.php.bak`, `/wp-config.php~`, `/wp-config.old`, `/wp-content/debug.log`, `/composer.lock`, `/package-lock.json` | `200` with a content marker (a `KEY=` line, `ref:`, `DB_NAME`, a PHP notice, `"packages"`) means exposed. `200` with an HTML page is usually a soft 404: check by hand. `/wp-config.php` returning `200` with an empty body is normal (PHP executed it). |
| **Version disclosure** | `GET /readme.html`, `/license.txt`; home page `generator` meta tag; `Server` and `X-Powered-By` headers | Low on its own; it helps an attacker match advisories. |
| **XML-RPC** | `GET /xmlrpc.php` | `405` with "accepts POST requests only" means enabled. Enabled is a finding only when nothing uses it (ask) and login protection does not cover it. |
| **User enumeration** | `GET /wp-json/wp/v2/users`, `GET /?author=1` | A user list or a redirect to an author archive exposes login slugs. The script prints the count, never the slugs. |
| **Directory listing** | `GET /wp-content/uploads/` | An "Index of" page lists every upload, including private exports. |
| **Security headers** | home page | Presence of `Content-Security-Policy`, `X-Frame-Options` or CSP `frame-ancestors`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. |
| **HTTPS** | `http://` version of the home URL; `https` home page body | Redirects to `https`; count of `http://` resources on the page (mixed content). |
| **Login protection** | one `GET /wp-login.php` | CAPTCHA, SSO and two-factor markers on the page. Rate limiting and MFA enforcement cannot be observed without login attempts: ask the owner what is in scope (rate limiting, CAPTCHA, MFA, SSO) and record the answer. |
| **WAF and CDN** | home page response headers | `cf-ray` (Cloudflare), `x-sucuri-id` / `x-sucuri-cache` (Sucuri), Akamai, CloudFront, Fastly and similar headers. Absence of a header does not prove there is no WAF. |

## 2. Running the script

```bash
bash "$SKILL_DIR/scripts/live-check.sh" --url https://example.com --authorized --out "$OUT/live"
```

- `--authorized` is required; the script refuses without it.
- One request per second by default (`--delay`), about 25 requests in total.
- Bodies are saved to a temp directory only long enough to test for markers, then deleted. The output prints status codes, content types, header presence and yes/no markers: never bodies, header values, user slugs or file contents.
- For a multisite with several domains, or a same-origin secondary site under a subdirectory, run it once per site URL the owner authorized.

## 3. OWASP ZAP baseline (optional)

When the owner wants broader passive coverage, the OWASP ZAP baseline scan (`zap-baseline.py` in the ZAP container) spiders the site and reports passive findings (headers, cookies flags, information leaks) without active attacks. Use it only with the same explicit authorization, in its passive baseline mode, never the full active scan. Treat its alerts as candidates that go through Verify, like any tool output.

## 4. Rating

| Result | Typical rating |
|---|---|
| `.env`, `.git/`, a `wp-config.php` backup or a database dump served | **Critical** (credentials or source code) |
| `debug.log` served, or uploads directory listing with personal data or exports | **High** |
| Lockfiles served, user enumeration, uploads listing with media only | **Low** to **Medium** |
| Missing HSTS on an HTTPS site, missing framing protection on login and admin pages | **Medium** |
| Other missing headers, version disclosure, `xmlrpc.php` enabled but covered by login protection | **Low** or **Info** |
| No HTTPS redirect, or mixed content on login or checkout pages | **High**; elsewhere **Medium** |

Each live result becomes a `G-` finding (or joins the component that exposes the file), with the evidence label "observed on the live site (owner-authorized, <date>)". Deploy-exclude gaps found in phase 2 that the live check confirms move from open question to finding, keeping their IDs.
