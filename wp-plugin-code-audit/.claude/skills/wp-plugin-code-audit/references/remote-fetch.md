# Remote Fetch

Auditing a plugin you don't already have locally. Fetch to a disposable directory, audit, write the report somewhere persistent, clean up.

```bash
WORK=/tmp/audit-fetch-$(date +%s)
mkdir -p $WORK
cd $WORK
```

---

## 1. wp.org plugin (by slug)

The plugin slug is the URL fragment: `https://wordpress.org/plugins/<slug>/`.

### Latest stable version

```bash
SLUG=akismet     # example
curl -sSL "https://downloads.wordpress.org/plugin/$SLUG.latest-stable.zip" -o $SLUG.zip
unzip -q $SLUG.zip
ls $SLUG/
```

### Specific version

```bash
SLUG=akismet
VERSION=5.3.3
curl -sSL "https://downloads.wordpress.org/plugin/$SLUG.$VERSION.zip" -o $SLUG-$VERSION.zip
unzip -q $SLUG-$VERSION.zip
```

### Trunk (development version)

```bash
SLUG=akismet
svn export "https://plugins.svn.wordpress.org/$SLUG/trunk" $SLUG-trunk
```

### Metadata (for the report)

```bash
SLUG=akismet
curl -sSL "https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&slug=$SLUG" \
  | jq '{name, version, author, requires, tested, requires_php, active_installs, last_updated, slug, homepage, support_url}'
```

Capture this in the report's **Scope** section. `active_installs` + `last_updated` are signal for severity weighting — a long-dormant plugin with a security finding is higher risk than an actively maintained one.

---

## 2. GitHub (public)

### Specific tag / release

```bash
USER=author
REPO=plugin-repo
TAG=v1.2.3
curl -sSL "https://github.com/$USER/$REPO/archive/refs/tags/$TAG.tar.gz" -o $REPO-$TAG.tar.gz
tar -xzf $REPO-$TAG.tar.gz
ls $REPO-$TAG-*/
```

### Default branch tip

```bash
git clone --depth 1 "https://github.com/$USER/$REPO.git"
cd $REPO
git log -1 --format="%H %s"   # capture SHA for the report
```

### Specific commit SHA (point-in-time audit)

```bash
git clone "https://github.com/$USER/$REPO.git"
cd $REPO
git checkout <sha>
```

For the audit report, **always pin to a commit SHA** in the Scope section. "Audited the GitHub repo" is not falsifiable; "audited at `a1b2c3d`" is.

---

## 3. GitHub (private — gh CLI)

```bash
gh auth status   # confirm authenticated

# Clone (gh CLI uses the auth):
gh repo clone $USER/$REPO

# Or fetch a release archive:
gh release download $TAG --repo $USER/$REPO --pattern "*.zip"
```

If `gh` isn't available, the user must provide a tarball / zip out-of-band — don't ask for credentials.

---

## 4. Direct URL (user-supplied zip / tar)

```bash
URL=https://example.com/some-plugin.zip
curl -sSL "$URL" -o plugin.zip
unzip -q plugin.zip
```

Be cautious — if the user pastes a URL, confirm the host is one they trust (wp.org, github.com, their own infra). Don't fetch from arbitrary URLs without confirming.

---

## 5. Build artifacts vs source

If the fetched archive contains:

| Present | Audit |
|---|---|
| Only `dist/` / minified output | Source unavailable. Audit the build, document the gap, downgrade confidence. |
| Source PHP + `vendor/` | Audit source. `vendor/` audit is bounded — flag CVEs via `composer audit` against `composer.lock` if present. |
| Source + missing `vendor/` | Run `composer install --no-dev` to materialize, then audit. Note in report. |
| Source + `node_modules/` + `dist/` | Audit source PHP + source JS. Treat `dist/` as derived; don't audit minified output line-by-line. |

For wp.org plugin zips, source is what gets shipped to users. If JS is minified in the zip, the user is running that minified code — audit it for blatant patterns (eval, unescaped DOM writes) even if line-by-line is impractical.

---

## 6. Cleanup

```bash
# After AUDIT.md is written to a persistent location:
rm -rf $WORK
```

Don't leave fetched plugin source littered across `/tmp`. The audit report references file:line within the fetched checkout; once written, the checkout is disposable.

For repeat audits of the same plugin, prefer a stable workspace:

```bash
WORK=$HOME/audits/$SLUG
mkdir -p $WORK
```

---

## 7. Scope note for the report

When auditing remotely-fetched code, the report's Scope section must include:

```markdown
- **Source:** wp.org plugin "akismet" version 5.3.3
- **Fetched:** 2026-05-25 from https://downloads.wordpress.org/plugin/akismet.5.3.3.zip
- **SHA-256 of zip:** ...
- **Authoritative URL:** https://wordpress.org/plugins/akismet/
```

For GitHub fetches:

```markdown
- **Source:** github.com/author/repo at commit a1b2c3d4e5...
- **Fetched:** 2026-05-25
- **Branch / tag:** v1.2.3
```

This makes the audit reproducible. Anyone re-running against the same source should hit the same findings.
