#!/usr/bin/env node
/**
 * capture-editor.mjs — capture the block editor's canvas for each front-end route of a local WordPress site,
 * so compare.mjs --editor can check that editors see what visitors see.
 *
 * For each route it logs in, follows the admin bar's edit link (the post editor with the template shown for a
 * singular route, the Site Editor on the resolved template otherwise), clears the block selection, and sizes
 * the canvas iframe to each breakpoint. Then, for each route and breakpoint, it writes into <out>/<route>/ the
 * same files capture.mjs writes for the front end, read from the canvas:
 *   - shot-<w>.png        full-page screenshot of a static copy of the canvas, rendered at the breakpoint
 *   - dom-<w>.html        the canvas document
 *   - computed-<w>.json   computed styles for a curated selector set
 *   - sections-<w>.json   per-section geometry and styles, heading outline
 *   - styles-<w>.json     page-wide style tallies
 *   - network-<w>.json    failed canvas and REST requests, and editor console errors
 *   - editor-<w>.json     invalid blocks, block placeholders and warnings, blocks previewed with ServerSideRender,
 *                         and the rendering mode the post type opens in by default
 * plus <out>/capture.json listing the routes, their editor URLs and the breakpoints.
 *
 * Usage:
 *   node capture-editor.mjs --routes FILE --base URL [--out DIR] [--breakpoints 390,768,1280]
 *     [--user NAME --password PASS] [--allow-placeholder core/xyz ...] [--timeout 60000]
 *
 * Credentials come from --user/--password or the WP_USER/WP_PASSWORD environment variables. The session
 * lives in memory only: nothing is written to disk but the capture.
 *
 * Requires Playwright, installed beside this script or in the current working directory:
 *   npm i -D playwright && npx playwright install chromium
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadChromium, PLAYWRIGHT_MISSING, scrollThrough, settle } from './lib/browser.mjs';
import {
  CAPTURED_PROPS,
  DEFAULT_SELECTORS,
  collectComputed,
  collectHeaderState,
  collectSections,
  collectStyleStats,
} from './lib/collectors.mjs';
import { uniqueSlugs } from './lib/routes.mjs';

const DEFAULT_BREAKPOINTS = [390, 768, 1280];
const VIEWPORT_HEIGHT = 900;
// The editor UI stays at desktop width; only the canvas iframe takes the breakpoint width.
const EDITOR_WIDTH = 1440;
const CANVAS = 'iframe[name="editor-canvas"]';
// A cheap page of the site to load the canvas copy into.
const BLANK_PAGE = '/wp-admin/admin-ajax.php';

const HELP = `capture-editor.mjs — capture the block editor canvas for editor ↔ front-end parity

Usage:
  node capture-editor.mjs --routes FILE --base URL [--out DIR] [--breakpoints 390,768,1280]
    [--user NAME --password PASS] [--allow-placeholder core/xyz ...] [--timeout 60000]

  --routes FILE   one front-end path per line (# comments allowed). The admin bar's edit link on that
                  page picks the editor. Override it with "path => editor-url", e.g.
                  "/news/ => /wp-admin/site-editor.php?postType=wp_template&postId=acme//home&canvas=edit".
  --base URL      the local site, e.g. http://mysite.test.
  --user NAME     an administrator login (or env WP_USER).
  --password PASS its password (or env WP_PASSWORD).
  --allow-placeholder BLOCK
                  a block whose empty-state placeholder is accepted (recorded in CONVERSION-NOTES.md),
                  where the front end renders nothing. It is left out of the measurements, and
                  compare.mjs does not fail on it. Repeatable.

Writes <out>/<route>/{shot,dom,computed,sections,styles,network,editor}-<w>.* per breakpoint
(default out ./editor-capture). Route folders match capture.mjs, so compare the two with:
  node compare.mjs <front-end-capture> <editor-capture> --editor
Requires Playwright in the current directory: npm i -D playwright && npx playwright install chromium`;

function parseArgs(argv) {
  const args = {
    routesFile: null,
    base: null,
    out: 'editor-capture',
    breakpoints: DEFAULT_BREAKPOINTS,
    timeout: 60000,
    user: process.env.WP_USER || null,
    password: process.env.WP_PASSWORD || null,
    allowPlaceholder: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--routes':
        args.routesFile = argv[++i];
        break;
      case '--base':
        args.base = argv[++i];
        break;
      case '--out':
        args.out = argv[++i];
        break;
      case '--breakpoints':
        args.breakpoints = argv[++i]
          .split(',')
          .map((n) => parseInt(n.trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0);
        break;
      case '--user':
        args.user = argv[++i];
        break;
      case '--password':
        args.password = argv[++i];
        break;
      case '--allow-placeholder':
        args.allowPlaceholder.push(argv[++i]);
        break;
      case '--timeout': {
        const t = parseInt(argv[++i], 10);
        args.timeout = Number.isFinite(t) && t > 0 ? t : 60000;
        break;
      }
      default:
        break;
    }
  }
  return args;
}

/** Routes file lines: a front-end path, optionally followed by "=> editor-url". */
function readRoutes(file, base) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const [path, editor] = line.split('=>').map((s) => s.trim());
      return {
        url: new URL(path, base).href,
        editor: editor ? new URL(editor, base).href : null,
      };
    });
}

/* ------------------------------------------------------------------ Session */

/** Log in through wp-login.php; the session cookies stay in the browser context. */
async function logIn(context, base, user, password) {
  await context.addCookies([{ name: 'wordpress_test_cookie', value: 'WP Cookie check', url: base }]);
  // Redirecting to the home page skips the dashboard, which can be slow on a local site.
  await context.request.post(new URL('/wp-login.php', base).href, {
    form: { log: user, pwd: password, testcookie: '1', redirect_to: base },
    maxRedirects: 0,
  });
  const cookies = await context.cookies(base);
  return cookies.some((c) => c.name.startsWith('wordpress_logged_in_'));
}

/**
 * The editor for a front-end URL: the admin bar's post edit link, or else its Site Editor link. An archive's
 * edit link opens the term screen, which has no canvas, so only a post.php link counts.
 */
async function resolveEditorUrl(context, url, timeout) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    return await page.evaluate(() => {
      const href = (id) => document.querySelector(`#wp-admin-bar-${id} > a`)?.href || null;
      const edit = href('edit');
      return (edit && new URL(edit).pathname.endsWith('/post.php') ? edit : null) || href('site-editor');
    });
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ Editor */

/** Watch the editor page: failed canvas and REST requests, console errors, and ServerSideRender requests. */
function watchEditor(page) {
  const log = { failed: [], consoleErrors: [], serverSideRender: new Set(), pendingRenders: 0 };
  const renderedBlock = (url) => {
    const match = decodeURIComponent(url).match(/\/wp\/v2\/block-renderer\/([a-z0-9-]+\/[a-z0-9-]+)/);
    return match ? match[1] : null;
  };
  const relevant = (req) => req.frame()?.name() === 'editor-canvas' || /\/wp-json\/|[?&]rest_route=/.test(req.url());
  page.on('request', (req) => {
    const block = renderedBlock(req.url());
    if (block) {
      log.serverSideRender.add(block);
      log.pendingRenders++;
    }
  });
  const settled = (req) => {
    if (renderedBlock(req.url())) {
      log.pendingRenders--;
    }
  };
  page.on('requestfinished', settled);
  page.on('requestfailed', (req) => {
    settled(req);
    if (relevant(req)) {
      log.failed.push({ url: req.url(), error: req.failure()?.errorText || 'failed' });
    }
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && relevant(res.request())) {
      log.failed.push({ url: res.url(), status: res.status() });
    }
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      log.consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => log.consoleErrors.push(String(err.message || err)));
  return log;
}

/**
 * Open the editor and show the page as visitors see it: the template around the content, no block selected,
 * the canvas iframe pinned to the breakpoint width. Nothing here changes saved editor preferences.
 */
async function openEditor(page, editorUrl, width, timeout) {
  await page.goto(editorUrl, { waitUntil: 'load', timeout });
  await page.waitForSelector(CANVAS, { timeout });
  const frame = page.frame({ name: 'editor-canvas' });
  await frame.waitForSelector('.is-root-container', { timeout });

  const state = await page.evaluate(() => {
    const { select, dispatch } = window.wp.data;
    const editor = select('core/editor');
    const postType = editor.getCurrentPostType();
    const isContent = !/^wp_(template|template_part|block|navigation)$/.test(postType);
    // The mode the post type opens in for an editor with no saved preference. Core's default is post-only:
    // the content without its template, so no template wrapper or class applies around it.
    let defaultMode = null;
    if (isContent) {
      const editorSupport = select('core').getPostType(postType)?.supports?.editor;
      const declared = Array.isArray(editorSupport)
        ? editorSupport.find((feature) => feature && 'default-mode' in feature)?.['default-mode']
        : undefined;
      defaultMode = declared || 'post-only';
    }
    // The canvas is captured with the template shown, so the comparison measures the whole page.
    if (isContent && editor.getRenderingMode?.() === 'post-only') {
      dispatch('core/editor').setRenderingMode('template-locked');
    }
    dispatch('core/block-editor').clearSelectedBlock();
    return { postType, mode: editor.getRenderingMode?.() || null, defaultMode };
  });

  // The pinned iframe covers the editor UI, so its viewport is exactly the breakpoint.
  await page.addStyleTag({
    content: `${CANVAS} { position: fixed !important; inset: 0 auto auto 0 !important; width: ${width}px !important;
      max-width: none !important; height: ${VIEWPORT_HEIGHT}px !important; z-index: 2147483647 !important;
      transform: none !important; margin: 0 !important; border: 0 !important; }`,
  });
  // Appenders, insertion points and empty-field prompts are editing affordances, not output.
  await frame.addStyleTag({
    content: `html, body { scroll-behavior: auto !important; }
      .block-list-appender, .block-editor-default-block-appender, .block-editor-block-list__insertion-point,
      .block-editor-button-block-appender { display: none !important; }
      [data-rich-text-placeholder]::after { content: none !important; }`,
  });
  await frame
    .waitForFunction((w) => window.innerWidth === w, width, { timeout: 5000 })
    .catch(() => {
      throw new Error(`the editor canvas did not size to ${width}px`);
    });
  return { frame, ...state };
}

/** Wait for previews to finish: no ServerSideRender request in flight, no spinner in the canvas. */
async function waitForPreviews(page, frame, log, timeout) {
  const deadline = Date.now() + Math.min(timeout, 30000);
  let quietSince = null;
  while (Date.now() < deadline) {
    const spinners = await frame.evaluate(() => document.querySelectorAll('.components-spinner').length);
    const busy = log.pendingRenders > 0 || spinners > 0;
    if (busy) {
      quietSince = null;
    } else if (quietSince === null) {
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= 750) {
      return true;
    }
    await page.waitForTimeout(150);
  }
  return false;
}

/**
 * Remove what core renders only in the editor, so it is not measured as a difference: appenders, insertion
 * points and drop-zone overlays (their text would label a section), the empty "read more" line of a post
 * excerpt, and the prompt inside an empty rich-text field, which keeps it one line tall where the front end
 * renders an empty element. A block whose placeholder is accepted goes too, where it shows that placeholder:
 * the front end renders nothing for it.
 */
function stripEditorAffordances(allowPlaceholder) {
  for (const placeholder of document.querySelectorAll('.components-placeholder')) {
    const block = placeholder.closest('[data-type]');
    if (block && allowPlaceholder.includes(block.dataset.type)) {
      block.remove();
    }
  }
  const blank = (el) => (el.textContent || '').replace(/[\s\uFEFF]/g, '') === '';
  const affordances = [
    '.components-drop-zone',
    '.block-list-appender',
    '.block-editor-default-block-appender',
    '.block-editor-block-list__insertion-point',
    '.block-editor-button-block-appender',
  ];
  for (const el of document.querySelectorAll(affordances.join(', '))) {
    el.remove();
  }
  for (const el of document.querySelectorAll('.rich-text[data-empty="true"]')) {
    el.replaceChildren();
  }
  for (const el of document.querySelectorAll('.wp-block-post-excerpt__more-text')) {
    if (blank(el)) {
      el.remove();
    }
  }
}

/** Invalid blocks, placeholders and warnings in the canvas, each named by its block type. */
async function collectEditorFlags(page, frame) {
  const invalidBlocks = await page.evaluate(() => {
    const walk = (blocks) => blocks.flatMap((b) => [b, ...walk(b.innerBlocks || [])]);
    return walk(window.wp.data.select('core/block-editor').getBlocks())
      .filter((b) => !b.isValid)
      .map((b) => b.name);
  });
  const dom = await frame.evaluate(() => {
    const blockOf = (el) => el.closest('[data-type]')?.dataset.type || null;
    const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    return {
      placeholders: Array.from(document.querySelectorAll('.components-placeholder')).map((el) => ({
        block: blockOf(el),
        text: text(el),
      })),
      warnings: Array.from(document.querySelectorAll('.block-editor-warning')).map((el) => ({
        block: blockOf(el),
        text: text(el),
      })),
      spinners: document.querySelectorAll('.components-spinner').length,
    };
  });
  return { invalidBlocks, ...dom };
}

/**
 * The canvas document, in two forms: its HTML (written to dom-<w>.html), and its parts for rebuilding it in
 * another page. Rules inserted through the CSSOM (component styles) are not in a <style> element's text, so
 * each sheet is written out from its rules first. The body travels as a node tree, since React can build
 * nesting the HTML parser would rewrite (a <div> inside a <p>).
 */
function snapshotCanvas() {
  for (const style of document.querySelectorAll('style')) {
    try {
      const rules = Array.from(style.sheet?.cssRules || [], (r) => r.cssText).join('\n');
      if (rules.length > style.textContent.length) {
        style.textContent = rules;
      }
    } catch {
      // A sheet that cannot be read keeps its text.
    }
  }
  for (const script of document.querySelectorAll('script')) {
    script.remove();
  }
  const attrs = (el) => Array.from(el.attributes, (a) => [a.name, a.value]);
  const tree = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    return {
      ns: node.namespaceURI,
      tag: node.localName,
      attrs: attrs(node),
      children: Array.from(node.childNodes, tree).filter((c) => c !== null),
    };
  };
  return {
    html: `<!DOCTYPE html>\n${document.documentElement.outerHTML}`,
    htmlAttrs: attrs(document.documentElement),
    head: document.head.innerHTML,
    bodyAttrs: attrs(document.body),
    body: Array.from(document.body.childNodes, tree).filter((c) => c !== null),
  };
}

/** Rebuild a snapshotCanvas() body inside the current page. */
function buildBody({ htmlAttrs, bodyAttrs, body }) {
  const build = (node) => {
    if (typeof node === 'string') {
      return document.createTextNode(node);
    }
    const el = document.createElementNS(node.ns, node.tag);
    for (const [name, value] of node.attrs) {
      try {
        el.setAttribute(name, value);
      } catch {
        // An attribute name the DOM rejects is skipped.
      }
    }
    node.children.forEach((child) => el.appendChild(build(child)));
    return el;
  };
  htmlAttrs.forEach(([name, value]) => document.documentElement.setAttribute(name, value));
  bodyAttrs.forEach(([name, value]) => document.body.setAttribute(name, value));
  body.forEach((node) => document.body.appendChild(build(node)));
}

/**
 * Screenshot the canvas at the breakpoint, full height. The copy is built in a page of the site itself, so its
 * stylesheets and fonts load as same-origin requests, and rendered as a page so `vh` units keep the viewport
 * height.
 */
async function screenshotSnapshot(context, base, snapshot, width, path, timeout) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
  try {
    await page.goto(new URL(BLANK_PAGE, base).href, { waitUntil: 'load', timeout });
    await page.setContent(`<!DOCTYPE html><html><head>${snapshot.head}</head><body></body></html>`, {
      waitUntil: 'networkidle',
      timeout,
    });
    await page.evaluate(buildBody, snapshot);
    await scrollThrough(page);
    await page
      .waitForFunction(() => Array.from(document.images).every((img) => img.complete), null, { timeout: 15000 })
      .catch(() => {});
    await settle(page);
    await page.screenshot({ path, fullPage: true });
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ Main */

async function captureRoute(context, route, width, dir, args) {
  const page = await context.newPage();
  await page.setViewportSize({ width: Math.max(EDITOR_WIDTH, width), height: VIEWPORT_HEIGHT });
  const log = watchEditor(page);
  try {
    const { frame, postType, mode, defaultMode } = await openEditor(page, route.editor, width, args.timeout);
    const previewsSettled = await waitForPreviews(page, frame, log, args.timeout);
    await scrollThrough(frame);
    await settle(frame);
    await waitForPreviews(page, frame, log, args.timeout);

    // Flags first: placeholders are read before the editor-only elements are stripped.
    const flags = await collectEditorFlags(page, frame);
    for (const placeholder of flags.placeholders) {
      placeholder.allowed = args.allowPlaceholder.includes(placeholder.block);
    }
    await frame.evaluate(stripEditorAffordances, args.allowPlaceholder);

    const headerAtTop = await frame.evaluate(collectHeaderState);
    await frame.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(400);
    const headerScrolled = await frame.evaluate(collectHeaderState);
    await frame.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    const computed = await frame.evaluate(collectComputed, { selectors: DEFAULT_SELECTORS, props: CAPTURED_PROPS });
    writeFileSync(`${dir}/computed-${width}.json`, JSON.stringify(computed, null, 2));
    const sections = await frame.evaluate(collectSections);
    sections.header = { atTop: headerAtTop, scrolled: headerScrolled };
    writeFileSync(`${dir}/sections-${width}.json`, JSON.stringify(sections, null, 2));
    writeFileSync(`${dir}/styles-${width}.json`, JSON.stringify(await frame.evaluate(collectStyleStats), null, 2));

    const editor = {
      editorUrl: route.editor,
      postType,
      renderingMode: mode,
      defaultRenderingMode: defaultMode,
      previewsSettled,
      ...flags,
      serverSideRender: [...log.serverSideRender].sort(),
    };
    writeFileSync(`${dir}/editor-${width}.json`, JSON.stringify(editor, null, 2));

    const snapshot = await frame.evaluate(snapshotCanvas);
    writeFileSync(`${dir}/dom-${width}.html`, snapshot.html);
    await screenshotSnapshot(context, args.base, snapshot, width, `${dir}/shot-${width}.png`, args.timeout);

    const network = { failed: log.failed, consoleErrors: log.consoleErrors };
    writeFileSync(`${dir}/network-${width}.json`, JSON.stringify(network, null, 2));
    return { editor, network };
  } finally {
    await page.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (!args.routesFile || !args.base || !/^https?:/i.test(args.base)) {
    console.log(HELP);
    process.exit(1);
  }
  if (!args.user || !args.password) {
    console.error('Pass --user and --password, or set WP_USER and WP_PASSWORD.');
    process.exit(1);
  }
  if (!args.breakpoints.length) {
    console.error('No valid breakpoints; expected e.g. --breakpoints 390,768,1280');
    process.exit(1);
  }

  const chromium = await loadChromium();
  if (!chromium) {
    console.error(PLAYWRIGHT_MISSING);
    process.exit(1);
  }
  const base = new URL(args.base).origin + '/';
  const routes = readRoutes(args.routesFile, base);
  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });

  const manifest = {
    kind: 'editor',
    breakpoints: args.breakpoints,
    routes: [],
    capturedAt: new Date().toISOString(),
  };
  const browser = await chromium.launch();
  let problems = 0;
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    if (!(await logIn(context, base, args.user, args.password))) {
      console.error('Login failed: check the user name and password.');
      process.exit(1);
    }

    const slugs = uniqueSlugs(routes.map((r) => r.url));
    for (const [n, route] of routes.entries()) {
      const slug = slugs[n];
      route.editor = route.editor || (await resolveEditorUrl(context, route.url, args.timeout));
      if (!route.editor) {
        console.error(`  ✗ ${slug}: no edit link in the admin bar; add "${new URL(route.url).pathname} => <editor-url>" to the routes file.`);
        problems++;
        continue;
      }
      const dir = `${outDir}/${slug}`;
      mkdirSync(dir, { recursive: true });
      manifest.routes.push({ url: route.url, editor: route.editor, dir: slug });
      for (const width of args.breakpoints) {
        try {
          const { editor, network } = await captureRoute(context, route, width, dir, args);
          const notes = [
            editor.invalidBlocks.length && `${editor.invalidBlocks.length} invalid blocks`,
            editor.placeholders.length && `${editor.placeholders.length} placeholders`,
            editor.warnings.length && `${editor.warnings.length} warnings`,
            editor.serverSideRender.length && `${editor.serverSideRender.length} ServerSideRender`,
            !editor.previewsSettled && 'previews still loading',
            network.failed.length && `${network.failed.length} failed requests`,
            network.consoleErrors.length && `${network.consoleErrors.length} console errors`,
          ].filter(Boolean);
          console.error(`  ✓ ${slug} @ ${width}px${notes.length ? ` (${notes.join(', ')})` : ''}`);
        } catch (err) {
          problems++;
          console.error(`  ✗ ${slug} @ ${width}px: ${String(err.message || err).split('\n')[0]}`);
        }
      }
    }
  } finally {
    await browser.close();
  }

  writeFileSync(`${outDir}/capture.json`, JSON.stringify(manifest, null, 2));
  console.error(`\nDone. Editor capture in ${outDir}`);
  process.exit(problems ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
