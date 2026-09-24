#!/usr/bin/env node
/**
 * capture.mjs — capture a rendered page (deployed v0 preview, a local `next dev`/`next start`, or the
 * WordPress rebuild) for translation to, and comparison with, a block theme.
 *
 * Each page is scrolled top to bottom first, so reveal-on-scroll content and lazy images render, then
 * fonts and finite animations are awaited. For each route and breakpoint it writes, into <out>/<route>/:
 *   - shot-<w>.png        full-page screenshot
 *   - dom-<w>.html        rendered outerHTML (post-hydration)
 *   - computed-<w>.json   computed styles for a curated selector set
 *   - sections-<w>.json   per-section geometry and styles, heading outline, header state before/after scroll
 *   - network-<w>.json    failed requests (4xx/5xx, aborted) and console errors
 *   - behaviors-<w>.json  (--behaviors) state changes caused by clicking each control
 * plus <out>/capture.json listing the routes and breakpoints.
 *
 * Usage:
 *   node capture.mjs <url> [<url> ...] [--routes FILE] [--base URL] [--out DIR]
 *     [--breakpoints 390,768,1280] [--selectors "body,h1,..."] [--timeout 60000] [--behaviors] [--max-triggers 40]
 *
 * Requires Playwright:
 *   npm i -D playwright   (or)   npx playwright install chromium
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_BREAKPOINTS = [390, 768, 1280];
const DEFAULT_SELECTORS = [
  'body', 'h1', 'h2', 'h3', 'h4', 'p', 'a', 'button',
  'header', 'nav', 'main', 'section', 'footer',
];
const CAPTURED_PROPS = [
  'color', 'background-color', 'font-family', 'font-size', 'font-weight',
  'line-height', 'letter-spacing', 'text-transform',
  'margin', 'padding', 'gap', 'border-radius', 'border', 'box-shadow',
  'display', 'flex-direction', 'justify-content', 'align-items',
  'max-width', 'width',
];

const HELP = `capture.mjs — capture pages for block-theme translation and parity checks

Usage:
  node capture.mjs <url> [<url> ...] [--routes FILE] [--base URL] [--out DIR]
    [--breakpoints 390,768,1280] [--selectors "body,h1,..."] [--timeout 60000] [--behaviors] [--max-triggers 40]

  --routes FILE     one path or URL per line (# comments allowed); paths resolve against --base
                    or the first URL's origin.
  --behaviors       click each visible control and record the state changes it causes.
  --max-triggers N  cap on controls clicked per breakpoint (default 40).

Writes <out>/<route>/{shot,dom,computed,sections,network}-<w>.* per breakpoint (default out ./v0-capture).
Capture the design and the WordPress rebuild with the same routes, then diff them with compare.mjs.
Requires Playwright: npx playwright install chromium`;

function parseArgs(argv) {
  const args = {
    urls: [],
    routesFile: null,
    base: null,
    out: 'v0-capture',
    breakpoints: DEFAULT_BREAKPOINTS,
    selectors: DEFAULT_SELECTORS,
    timeout: 60000,
    behaviors: false,
    maxTriggers: 40,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--out':
        args.out = argv[++i];
        break;
      case '--routes':
        args.routesFile = argv[++i];
        break;
      case '--base':
        args.base = argv[++i];
        break;
      case '--breakpoints':
        args.breakpoints = argv[++i]
          .split(',')
          .map((n) => parseInt(n.trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0);
        break;
      case '--selectors':
        args.selectors = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--timeout': {
        const t = parseInt(argv[++i], 10);
        args.timeout = Number.isFinite(t) && t > 0 ? t : 60000;
        break;
      }
      case '--behaviors':
        args.behaviors = true;
        break;
      case '--max-triggers': {
        const n = parseInt(argv[++i], 10);
        args.maxTriggers = Number.isFinite(n) && n > 0 ? n : 40;
        break;
      }
      default:
        if (!a.startsWith('-')) {
          args.urls.push(a);
        }
        break;
    }
  }
  return args;
}

/**
 * Folder name for a route: `/` → home, `/blog/post-1/` → blog__post-1, `/shop?cat=a` → shop--cat-a.
 * The design and the local capture derive the same name from the same path, which is how compare.mjs pairs them.
 */
function routeSlug(url) {
  const { pathname, search } = new URL(url);
  const path = pathname.replace(/^\/+|\/+$/g, '');
  const base = path === '' ? 'home' : path.replace(/\//g, '__').replace(/[^a-z0-9_.-]/gi, '-');
  const query = search.replace(/^\?/, '').replace(/[^a-z0-9_.-]/gi, '-');
  return query === '' ? base : `${base}--${query}`;
}

/** Give each route its own folder: a name already taken gets a numeric suffix, with a warning. */
function uniqueSlugs(routes) {
  const used = new Map();
  return routes.map((url) => {
    const slug = routeSlug(url);
    const count = (used.get(slug) || 0) + 1;
    used.set(slug, count);
    if (count === 1) {
      return slug;
    }
    const renamed = `${slug}-${count}`;
    console.error(`Warning: ${url} maps to folder "${slug}", already used; writing to "${renamed}" instead.`);
    return renamed;
  });
}

function resolveRoutes(args) {
  const urls = [...args.urls];
  if (args.routesFile) {
    const base = args.base || (urls[0] ? new URL(urls[0]).origin : null);
    const lines = readFileSync(args.routesFile, 'utf8')
      .split('\n')
      .map((l) => l.replace(/#.*/, '').trim())
      .filter(Boolean);
    for (const line of lines) {
      if (/^https?:\/\//.test(line)) {
        urls.push(line);
      } else if (base) {
        urls.push(new URL(line, base).href);
      } else {
        console.error(`Route "${line}" is a path; pass --base URL or a full URL first.`);
        process.exit(1);
      }
    }
  }
  return [...new Set(urls)];
}

async function loadPlaywright() {
  try {
    const mod = await import('playwright');
    return mod.chromium;
  } catch {
    console.error(
      'Playwright is not installed. Install it first:\n  npm i -D playwright && npx playwright install chromium'
    );
    process.exit(1);
  }
}

/* ------------------------------------------------------------------ Page settling */

/** Scroll through the page so in-view animations and lazy images fire, then return to the top. */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await pause(150);
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await pause(300);
    window.scrollTo(0, 0);
    await pause(150);
  });
}

/** Wait until fonts are loaded and every finite animation has finished (infinite ones, e.g. marquees, are ignored). */
async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page
    .waitForFunction(
      () =>
        document.getAnimations().every((a) => {
          const end = a.effect ? a.effect.getComputedTiming().endTime : 0;
          return a.playState !== 'running' || end === Infinity;
        }),
      null,
      { timeout: 10000 }
    )
    .catch(() => {});
  await page.waitForTimeout(200);
}

async function openPage(context, url, timeout) {
  const page = await context.newPage();
  const network = { failed: [], consoleErrors: [] };
  page.on('requestfailed', (req) =>
    network.failed.push({ url: req.url(), error: req.failure()?.errorText || 'failed' })
  );
  page.on('response', (res) => {
    if (res.status() >= 400) {
      network.failed.push({ url: res.url(), status: res.status() });
    }
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      network.consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => network.consoleErrors.push(String(err.message || err)));

  await page.goto(url, { waitUntil: 'networkidle', timeout });
  // Smooth scrolling makes scripted scroll positions lag behind; force instant jumps.
  await page.addStyleTag({ content: 'html, body { scroll-behavior: auto !important; }' });
  return { page, network };
}

/* ------------------------------------------------------------------ In-page collectors */

function collectComputed({ selectors, props }) {
  const result = {};
  for (const sel of selectors) {
    try {
      const nodes = Array.from(document.querySelectorAll(sel)).slice(0, 5);
      if (!nodes.length) {
        continue;
      }
      result[sel] = nodes.map((el) => {
        const cs = getComputedStyle(el);
        const entry = {};
        for (const p of props) {
          entry[p] = cs.getPropertyValue(p);
        }
        return entry;
      });
    } catch (err) {
      result._errors = result._errors || {};
      result._errors[sel] = err.message || String(err);
    }
  }
  return result;
}

/**
 * Sections are the top-level header / footer / section / main-children bands. For each: geometry, box styles,
 * the content column (first descendant with a max-width), the first multi-item flex/grid row, and headings.
 */
function collectSections() {
  const pick = (el, props) => {
    const cs = getComputedStyle(el);
    const out = {};
    for (const p of props) {
      out[p] = cs.getPropertyValue(p);
    }
    return out;
  };
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top + window.scrollY),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  };
  const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);

  const candidates = Array.from(
    document.querySelectorAll('body header, body footer, body section, main > *')
  ).filter((el) => el.getBoundingClientRect().height > 0);
  const sections = candidates.filter((el) => !candidates.some((o) => o !== el && o.contains(el)));

  const out = sections.map((el, index) => {
    const heading = el.querySelector('h1, h2, h3');
    const column = Array.from(el.querySelectorAll('*')).find(
      (d) => getComputedStyle(d).maxWidth !== 'none'
    );
    const row = Array.from(el.querySelectorAll('*')).find((d) => {
      const display = getComputedStyle(d).display;
      return /flex|grid/.test(display) && d.children.length >= 2;
    });
    return {
      index,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      label: heading ? text(heading) : text(el).slice(0, 40),
      rect: rect(el),
      styles: pick(el, [
        'padding-top', 'padding-bottom', 'background-color', 'background-image', 'color', 'position',
      ]),
      column: column ? { rect: rect(column), maxWidth: getComputedStyle(column).maxWidth } : null,
      row: row
        ? {
            items: row.children.length,
            ...pick(row, ['display', 'grid-template-columns', 'gap', 'row-gap', 'column-gap', 'flex-wrap']),
          }
        : null,
      headings: Array.from(el.querySelectorAll('h1, h2, h3, h4'))
        .slice(0, 4)
        .map((h) => ({
          tag: h.tagName.toLowerCase(),
          text: text(h),
          ...pick(h, ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing']),
        })),
      controls: Array.from(el.querySelectorAll('input:not([type=hidden]), select, textarea'))
        .slice(0, 4)
        .map((c) => ({
          tag: c.tagName.toLowerCase(),
          name: c.getAttribute('name'),
          height: Math.round(c.getBoundingClientRect().height),
          ...pick(c, ['background-color', 'border', 'border-radius', 'appearance']),
        })),
    };
  });

  const outline = Array.from(document.querySelectorAll('h1, h2, h3')).map(
    (h) => `${h.tagName.toLowerCase()}: ${text(h)}`
  );
  return { sections: out, outline, documentHeight: document.documentElement.scrollHeight };
}

function collectHeaderState() {
  const header = document.querySelector('header');
  if (!header) {
    return null;
  }
  const cs = getComputedStyle(header);
  return {
    className: String(header.className),
    position: cs.position,
    backgroundColor: cs.backgroundColor,
    boxShadow: cs.boxShadow,
    transform: cs.transform,
    height: Math.round(header.getBoundingClientRect().height),
  };
}

/* ------------------------------------------------------------------ Behaviors */

// Controls whose wording suggests a side effect (cart, account, submission) are never clicked.
const UNSAFE_WORDING =
  /add to (cart|bag|basket)|buy|checkout|pay|subscribe|sign ?(up|in|out)|log ?(in|out)|delete|remove|submit|send|order|book now/i;
const TRIGGER_SELECTOR = 'button, [role="button"], [role="tab"], summary';

/** Indices (within TRIGGER_SELECTOR matches) of visible, enabled controls that are safe to click. */
function listTriggers({ selector, unsafe, max }) {
  const unsafeRe = new RegExp(unsafe, 'i');
  const regions = Array.from(document.querySelectorAll('section, header, footer, nav, aside, main, [role="dialog"]'));
  const eligible = [];
  Array.from(document.querySelectorAll(selector)).forEach((el, index) => {
    const r = el.getBoundingClientRect();
    const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
    const type = el.getAttribute('type');
    if (
      r.width === 0 ||
      r.height === 0 ||
      el.disabled ||
      el.closest('form') ||
      type === 'submit' ||
      unsafeRe.test(label)
    ) {
      return;
    }
    // The nearest landmark or section groups controls that belong to the same widget area.
    const region = el.closest('section, header, footer, nav, aside, main, [role="dialog"]');
    eligible.push({
      index,
      label: label.slice(0, 60),
      expanded: el.getAttribute('aria-expanded'),
      region: region ? regions.indexOf(region) : -1,
    });
  });
  return eligible.slice(0, max);
}

/** Snapshot of stateful attributes across the page, keyed by a structural path. */
function snapshotState() {
  const path = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.id) {
        parts.unshift(`#${n.id}`);
        break;
      }
      const same = Array.from(n.parentElement?.children || []).filter((s) => s.tagName === n.tagName);
      parts.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${same.indexOf(n) + 1})`);
    }
    return parts.join(' > ');
  };
  const state = {};
  // Tracked elements are tagged so an element that loses `hidden` (or similar) stays in the next snapshot.
  const nodes = document.querySelectorAll(
    '[aria-expanded],[aria-selected],[aria-hidden],[data-state],[hidden],[open],[role="dialog"],[role="tabpanel"],[role="menu"],[data-capture-track]'
  );
  for (const el of nodes) {
    el.setAttribute('data-capture-track', '');
    const r = el.getBoundingClientRect();
    state[path(el)] = {
      role: el.getAttribute('role'),
      'aria-expanded': el.getAttribute('aria-expanded'),
      'aria-selected': el.getAttribute('aria-selected'),
      'data-state': el.getAttribute('data-state'),
      hidden: el.hasAttribute('hidden'),
      open: el.hasAttribute('open'),
      visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden',
    };
  }
  state['<body>'] = { overflow: getComputedStyle(document.body).overflow, className: document.body.className };
  return state;
}

function diffState(before, after) {
  const changes = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[key] || {};
    const b = after[key] || {};
    for (const attr of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const was = a[attr] ?? null;
      const now = b[attr] ?? null;
      if (JSON.stringify(was) !== JSON.stringify(now)) {
        changes.push({ element: key, attr, before: was, after: now });
      }
    }
  }
  return changes;
}

async function clickAndDiff(page, url, trigger) {
  const locator = page.locator(TRIGGER_SELECTOR).nth(trigger.index);
  const before = await page.evaluate(snapshotState);
  await locator.click({ timeout: 3000 });
  await page.waitForTimeout(400);
  const currentUrl = page.url();
  if (currentUrl !== url) {
    return { navigatedTo: currentUrl, changes: [] };
  }
  return { changes: diffState(before, await page.evaluate(snapshotState)) };
}

/**
 * Click each control on a freshly loaded page and record what changed. Then, for consecutive
 * disclosure pairs in the same region, open A then B and record whether A closed (single-open accordion).
 */
async function captureBehaviors(context, url, args) {
  const fresh = async () => {
    const { page } = await openPage(context, url, args.timeout);
    await settle(page);
    return page;
  };
  let page = await fresh();
  const triggers = await page.evaluate(listTriggers, {
    selector: TRIGGER_SELECTOR,
    unsafe: UNSAFE_WORDING.source,
    max: args.maxTriggers,
  });
  await page.close();

  const results = [];
  for (const trigger of triggers) {
    page = await fresh();
    try {
      results.push({ label: trigger.label, ...(await clickAndDiff(page, url, trigger)) });
    } catch (err) {
      results.push({ label: trigger.label, error: err.message.split('\n')[0] });
    }
    await page.close();
  }

  const disclosures = triggers.filter((t) => t.expanded === 'false');
  const pairs = [];
  for (let i = 0; i + 1 < disclosures.length && pairs.length < 10; i++) {
    const [a, b] = [disclosures[i], disclosures[i + 1]];
    if (a.region !== b.region) {
      continue;
    }
    page = await fresh();
    try {
      const first = page.locator(TRIGGER_SELECTOR).nth(a.index);
      await first.click({ timeout: 3000 });
      await page.locator(TRIGGER_SELECTOR).nth(b.index).click({ timeout: 3000 });
      await page.waitForTimeout(400);
      const aExpanded = await first.getAttribute('aria-expanded');
      pairs.push({ a: a.label, b: b.label, closesPrevious: aExpanded === 'false' });
    } catch (err) {
      pairs.push({ a: a.label, b: b.label, error: err.message.split('\n')[0] });
    }
    await page.close();
  }

  return { triggers: results, disclosurePairs: pairs };
}

/* ------------------------------------------------------------------ Main */

async function captureRoute(browser, url, width, dir, args) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  const { page, network } = await openPage(context, url, args.timeout);

  await scrollThrough(page);
  await settle(page);

  const headerAtTop = await page.evaluate(collectHeaderState);
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(400);
  const headerScrolled = await page.evaluate(collectHeaderState);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  await page.screenshot({ path: `${dir}/shot-${width}.png`, fullPage: true });
  writeFileSync(`${dir}/dom-${width}.html`, await page.content());

  const computed = await page.evaluate(collectComputed, { selectors: args.selectors, props: CAPTURED_PROPS });
  writeFileSync(`${dir}/computed-${width}.json`, JSON.stringify(computed, null, 2));

  const sections = await page.evaluate(collectSections);
  sections.header = { atTop: headerAtTop, scrolled: headerScrolled };
  writeFileSync(`${dir}/sections-${width}.json`, JSON.stringify(sections, null, 2));
  writeFileSync(`${dir}/network-${width}.json`, JSON.stringify(network, null, 2));

  if (args.behaviors) {
    const behaviors = await captureBehaviors(context, url, args);
    writeFileSync(`${dir}/behaviors-${width}.json`, JSON.stringify(behaviors, null, 2));
  }

  await context.close();
  return { failed: network.failed.length, consoleErrors: network.consoleErrors.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  const routes = resolveRoutes(args);
  if (!routes.length) {
    console.log(HELP);
    process.exit(1);
  }
  if (!args.breakpoints.length) {
    console.error('No valid breakpoints; expected e.g. --breakpoints 390,768,1280');
    process.exit(1);
  }

  const chromium = await loadPlaywright();
  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });

  const manifest = { breakpoints: args.breakpoints, routes: [], capturedAt: new Date().toISOString() };
  const browser = await chromium.launch();
  try {
    const slugs = uniqueSlugs(routes);
    for (const [n, url] of routes.entries()) {
      const slug = slugs[n];
      const dir = `${outDir}/${slug}`;
      mkdirSync(dir, { recursive: true });
      manifest.routes.push({ url, dir: slug });
      for (const width of args.breakpoints) {
        const { failed, consoleErrors } = await captureRoute(browser, url, width, dir, args);
        const issues = failed || consoleErrors ? ` (${failed} failed requests, ${consoleErrors} console errors)` : '';
        console.error(`  ✓ ${slug} @ ${width}px${issues}`);
      }
    }
  } finally {
    await browser.close();
  }

  writeFileSync(`${outDir}/capture.json`, JSON.stringify(manifest, null, 2));
  console.error(`\nDone. Capture in ${outDir}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
