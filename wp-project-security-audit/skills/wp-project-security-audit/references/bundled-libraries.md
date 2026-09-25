# Bundled Libraries

Phase 2 sweep, across **every** component: custom, committed third-party and managed third-party alike. Plugins and themes ship their own copies of JavaScript and PHP libraries, and nothing updates those copies but the component's vendor. A lookup-only component (a premium plugin, a wp.org plugin) can carry an old jQuery or viewer copy with a public advisory that no WordPress vulnerability database lists under the plugin's slug.

```bash
bash "$SKILL_DIR/scripts/bundled-libs.sh" --root /path/to/project --inventory "$OUT/inventory/inventory.json" --out "$OUT/libs" --osv
```

The script walks every plugin, theme and must-use directory (including `vendor/`, excluding `node_modules/`), matches file names against the signature table below, reads the version from the file's contents, and writes `bundled-libs.json` and `bundled-libs.md` (library, version, component, bucket, path), plus `candidates.tsv` with one row per OSV advisory (the authoritative list; every row is accounted for in the section file). With `--osv` it also asks the public OSV database (`https://api.osv.dev/v1/query`, no key) for advisories affecting that package and version; that sends only the package name and version.

---

## 1. Checking a version

The script's OSV result is a starting point, not the answer:

1. Confirm the version from the file itself (banner comment, version constant); a renamed or patched copy can carry a misleading banner.
2. Check the library's own advisories: its GitHub security advisories page, its changelog's security notes, and OSV or the GitHub Advisory Database for the npm (or Packagist) package named in the table.
3. Confirm reachability: is the file enqueued on the front end, in the admin only, or not loaded at all (grep the component for the file name and the handle that enqueues it)? For a PDF viewer, does it render files that users can upload?
4. Rate under the severity rubric (plugin `references/shared-conventions.md`) by who reaches the vulnerable path. A vulnerable viewer that renders visitor-supplied files on the front end can be High or Critical; the same copy loaded only in an admin preview is Medium or Low.

Findings go under the owning component (`P-<slug>-` / `T-<slug>-`). The fix follows the ownership table: for third-party components, update to a vendor release that ships a fixed copy, or report to the vendor and mitigate (dequeue the script from a project-owned must-use plugin, disable the feature). Replacing the vendor's copy by hand is a fork.

## 2. Signatures

The script reads this table. Add a row to cover a new library: `File pattern` and `Version pattern` are Python regular expressions (escape `|` as `\|` inside the table), the version pattern's first group is the version, and `Package` is the name used for the OSV lookup (`npm:<name>` or `packagist:<vendor/name>`; `-` for none).

<!-- signatures:start -->
File patterns are matched against each path twice: as found, and with a version segment removed from the file name (`library-1.2.3.js` is also tried as `library.js`), so patterns do not need to allow for versioned names.

| Library | Package | File pattern | Version pattern |
|---|---|---|---|
| PDF.js | npm:pdfjs-dist | `(^\|/)pdf(\.worker)?(\.min)?\.m?js$` | `pdfjsVersion\W+([0-9][0-9.]+)` |
| jQuery | npm:jquery | `(^\|/)jquery(-[0-9.]+)?(\.min)?\.js$` | `jQuery (?:JavaScript Library )?v([0-9][0-9.]+)` |
| jQuery UI | npm:jquery-ui | `(^\|/)jquery-ui(\.custom)?(\.min)?\.js$` | `jQuery UI - v([0-9][0-9.]+)` |
| jQuery Migrate | npm:jquery-migrate | `(^\|/)jquery-migrate(-[0-9.]+)?(\.min)?\.js$` | `jQuery Migrate v([0-9][0-9.]+)` |
| Swiper | npm:swiper | `(^\|/)swiper(-bundle)?(\.min)?\.m?js$` | `Swiper ([0-9][0-9.]+)` |
| Slick | npm:slick-carousel | `(^\|/)slick(\.min)?\.js$` | `Version: ([0-9][0-9.]+)` |
| Lightbox2 | npm:lightbox2 | `(^\|/)lightbox(-plus-jquery)?(\.min)?\.js$` | `Lightbox v([0-9][0-9.]+)` |
| fancyBox | npm:@fancyapps/fancybox | `(^\|/)(jquery\.)?fancybox(\.pack)?(\.min)?\.js$` | `fancy[Bb]ox v?([0-9][0-9.]+)` |
| Select2 | npm:select2 | `(^\|/)select2(\.full)?(\.min)?\.js$` | `Select2 ([0-9][0-9.]+)` |
| Moment.js | npm:moment | `(^\|/)moment(-with-locales)?(\.min)?\.js$` | `version : ([0-9][0-9.]+)` |
| Lodash | npm:lodash | `(^\|/)lodash(\.core)?(\.min)?\.js$` | `VERSION\s*=\s*.([0-9][0-9.]+)` |
| Underscore | npm:underscore | `(^\|/)underscore(-min)?(\.min)?\.js$` | `Underscore\.js ([0-9][0-9.]+)` |
| Handlebars | npm:handlebars | `(^\|/)handlebars(\.runtime)?(\.min)?\.js$` | `handlebars v([0-9][0-9.]+)` |
| TinyMCE | npm:tinymce | `(^\|/)tinymce(\.min)?\.js$` | `TinyMCE version ([0-9][0-9.]+)` |
| Bootstrap | npm:bootstrap | `(^\|/)bootstrap(\.bundle)?(\.min)?\.js$` | `Bootstrap v([0-9][0-9.]+)` |
| DOMPurify | npm:dompurify | `(^\|/)purify(\.min)?\.js$` | `DOMPurify ([0-9][0-9.]+)` |
| Chart.js | npm:chart.js | `(^\|/)[Cc]hart(\.bundle)?(\.min)?\.js$` | `Chart\.js v?([0-9][0-9.]+)` |
| Magnific Popup | npm:magnific-popup | `(^\|/)(jquery\.)?magnific-popup(\.min)?\.js$` | `Magnific Popup - v([0-9][0-9.]+)` |
| Video.js | npm:video.js | `(^\|/)video(\.min)?\.js$` | `Video\.js ([0-9][0-9.]+)` |
| CKEditor 4 | npm:ckeditor4 | `(^\|/)ckeditor\.js$` | `version:"([0-9][0-9.]+)` |
| PHPMailer | packagist:phpmailer/phpmailer | `(^\|/)(class\.)?phpmailer\.php$` | `VERSION\s*=\s*.([0-9][0-9.]+)\|\$Version\s*=\s*.([0-9][0-9.]+)` |
| TCPDF | packagist:tecnickcom/tcpdf | `(^\|/)tcpdf\.php$` | `tcpdf_version\s*=\s*.([0-9][0-9.]+)` |
| mPDF | packagist:mpdf/mpdf | `(^\|/)[Mm]pdf\.php$` | `const VERSION\s*=\s*.([0-9][0-9.]+)` |
| Guzzle | packagist:guzzlehttp/guzzle | `(^\|/)guzzlehttp/guzzle/src/Client(Interface)?\.php$` | `(?:MAJOR_VERSION\|VERSION)\s*=\s*.?([0-9][0-9.]*)` |
<!-- signatures:end -->

A match with no version found is still listed (`version: unknown`): read the file header by hand.

Libraries installed through a lockfile (`composer.lock`, `package-lock.json`) are also covered by `dependency-audit.md`; this sweep catches the copies that were vendored by hand or shipped pre-built, which no lockfile describes.
