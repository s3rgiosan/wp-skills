#!/usr/bin/env node
/**
 * capture.mjs — capture a rendered page (a deployed design preview, a local dev server, a local HTML file,
 * or the WordPress rebuild) for translation to, and comparison with, a block theme.
 *
 * Each page is scrolled top to bottom first, so reveal-on-scroll content and lazy images render, then
 * fonts and finite animations are awaited. For each route and breakpoint it writes, into <out>/<route>/:
 *   - shot-<w>.png        full-page screenshot
 *   - dom-<w>.html        rendered outerHTML (post-hydration)
 *   - computed-<w>.json   computed styles for a curated selector set
 *   - sections-<w>.json   per-section geometry and styles, heading outline, header state before/after scroll
 *   - styles-<w>.json     page-wide style tallies and custom properties, read by css-tokens.mjs
 *   - network-<w>.json    failed requests (4xx/5xx, aborted) and console errors
 *   - behaviors-<w>.json  (--behaviors) state changes caused by clicking each control
 * plus <out>/capture.json listing the routes and breakpoints.
 *
 * Usage:
 *   node capture.mjs <url|file> [<url|file> ...] [--routes FILE] [--base URL|DIR] [--out DIR]
 *     [--breakpoints 390,768,1280] [--selectors "body,h1,..."] [--timeout 60000] [--behaviors] [--max-triggers 40]
 *
 * Requires Playwright, installed beside this script or in the current working directory:
 *   npm i -D playwright && npx playwright install chromium
 */

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  node capture.mjs <url|file> [<url|file> ...] [--routes FILE] [--base URL|DIR] [--out DIR]
    [--breakpoints 390,768,1280] [--selectors "body,h1,..."] [--timeout 60000] [--behaviors] [--max-triggers 40]

  --routes FILE     one path or URL per line (# comments allowed); paths resolve against --base
                    or the first URL's origin.
  --base URL|DIR    origin for route paths, or a folder of local HTML files.
                    A local file's route folder is its name without .html (index.html → home).
  --behaviors       click each visible control and record the state changes it causes.
  --max-triggers N  cap on controls clicked per breakpoint (default 40).

Writes <out>/<route>/{shot,dom,computed,sections,styles,network}-<w>.* per breakpoint (default out ./design-capture).
Capture the design and the WordPress rebuild with the same routes, then diff them with compare.mjs.
Requires Playwright in the current directory: npm i -D playwright && npx playwright install chromium`;

function parseArgs(argv) {
  const args = {
    urls: [],
    routesFile: null,
    base: null,
    out: 'design-capture',
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
  const { protocol, pathname, search } = new URL(url);
  if (protocol === 'file:') {
    const name = basename(decodeURIComponent(pathname)).replace(/\.html?$/i, '');
    return name === 'index' ? 'home' : name.replace(/[^a-z0-9_.-]/gi, '-');
  }
  const path = pathname.replace(/^\/+|\/+$/g, '');
  const base = path === '' ? 'home' : path.replace(/\//g, '__').replace(/[^a-z0-9_.-]/gi, '-');
  const query = search.replace(/^\?/, '').replace(/[^a-z0-9_.-]/gi, '-');
  return query === '' ? base : `${base}--${query}`;
}

/** A URL stays as it is; anything else is a local file path. */
function toUrl(value) {
  return /^(https?|file):/i.test(value) ? value : pathToFileURL(resolve(value)).href;
}

/** A --base that is not a URL is a folder of local HTML files. */
function baseUrl(base) {
  if (/^(https?|file):/i.test(base)) {
    return base;
  }
  return `${pathToFileURL(resolve(base)).href}/`;
}

/** Give each route its own folder: a name already taken gets the first free numeric suffix, with a warning. */
function uniqueSlugs(routes) {
  const used = new Set();
  return routes.map((url) => {
    const slug = routeSlug(url);
    let unique = slug;
    for (let n = 2; used.has(unique); n++) {
      unique = `${slug}-${n}`;
    }
    used.add(unique);
    if (unique !== slug) {
      console.error(`Warning: ${url} maps to folder "${slug}", already used; writing to "${unique}" instead.`);
    }
    return unique;
  });
}

/** True when `path` is `folder` or inside it. */
function isInside(path, folder) {
  const rel = relative(folder, path);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

function resolveRoutes(args) {
  const urls = args.urls.map(toUrl);
  if (args.routesFile) {
    let base = null;
    if (args.base) {
      base = baseUrl(args.base);
    } else if (urls[0]) {
      // A file URL has no origin; its route paths resolve against its folder.
      base = urls[0].startsWith('file:') ? new URL('.', urls[0]).href : new URL(urls[0]).origin;
    }
    const lines = readFileSync(args.routesFile, 'utf8')
      .split('\n')
      .map((l) => l.replace(/#.*/, '').trim())
      .filter(Boolean);
    for (const line of lines) {
      if (/^(https?|file):/i.test(line)) {
        urls.push(line);
      } else if (base) {
        // Under a folder of local files, `/about.html` names a file in that folder.
        const path = base.startsWith('file:') ? line.replace(/^\/+/, '') : line;
        urls.push(new URL(path, base).href);
      } else {
        console.error(`Route "${line}" is a path; pass --base URL or a full URL first.`);
        process.exit(1);
      }
    }
  }
  return [...new Set(urls)];
}

/** Playwright from beside this script, or else from the current working directory. */
async function importPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return createRequire(`${process.cwd()}/`)('playwright');
  }
}

async function loadPlaywright() {
  try {
    const mod = await importPlaywright();
    return mod.chromium;
  } catch {
    console.error(
      'Playwright is not installed. Install it in the current directory first:\n  npm i -D playwright && npx playwright install chromium'
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
  // A heading inside hidden content (a collapsed panel, a paginated-away row) is not part of the page as shown.
  const rendered = (el) => el.getClientRects().length > 0;

  // A child of <main> that wraps bands of its own (a CMS content wrapper) is not a band itself.
  const candidates = Array.from(
    document.querySelectorAll('body header, body footer, body section, main > *')
  ).filter(
    (el) =>
      el.getBoundingClientRect().height > 0 &&
      !(el.parentElement?.tagName === 'MAIN' && el.querySelector('header, footer, section'))
  );
  const sections = candidates.filter((el) => !candidates.some((o) => o !== el && o.contains(el)));

  const out = sections.map((el, index) => {
    const heading = Array.from(el.querySelectorAll('h1, h2, h3')).find(rendered);
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
        .filter(rendered)
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

  const outline = Array.from(document.querySelectorAll('h1, h2, h3')).filter(rendered).map(
    (h) => `${h.tagName.toLowerCase()}: ${text(h)}`
  );
  return { sections: out, outline, documentHeight: document.documentElement.scrollHeight };
}

/**
 * Page-wide style tallies for token extraction (css-tokens.mjs): colors normalised to hex, type per text
 * element (keyed by structural path so breakpoints line up), spacing, radii, shadows, max-widths, and the
 * custom properties declared on :root, in dark-mode rules, and inline on elements.
 */
function collectStyleStats() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const hexCache = new Map();
  // Paint the color and read the pixel back: any CSS color syntax comes out as sRGB hex. The canvas ignores a
  // value that is not a color, so a value that leaves two different starting colors unchanged is not one.
  const toHex = (value) => {
    if (hexCache.has(value)) {
      return hexCache.get(value);
    }
    ctx.fillStyle = '#000';
    ctx.fillStyle = value;
    const fromBlack = ctx.fillStyle;
    ctx.fillStyle = '#fff';
    ctx.fillStyle = value;
    if (fromBlack !== ctx.fillStyle) {
      hexCache.set(value, null);
      return null;
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const hex = (n) => n.toString(16).padStart(2, '0');
    const out = a === 0 ? null : `#${hex(r)}${hex(g)}${hex(b)}${a < 255 ? hex(a) : ''}`;
    hexCache.set(value, out);
    return out;
  };
  const path = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const same = Array.from(n.parentElement?.children || []).filter((s) => s.tagName === n.tagName);
      parts.unshift(`${n.tagName.toLowerCase()}:${same.indexOf(n) + 1}`);
    }
    return parts.join('>');
  };
  const tally = (map, key, weight = 1) => {
    if (key) {
      map[key] = (map[key] || 0) + weight;
    }
  };
  const ownText = (el) =>
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();

  const stats = {
    colors: { text: {}, background: {}, border: {} },
    fontFamilies: {},
    type: [],
    spacing: { padding: {}, margin: {}, gap: {} },
    radius: {},
    shadow: {},
    maxWidth: {},
    customProperties: { root: {}, dark: {}, inline: {} },
  };

  const bodyStyle = getComputedStyle(document.body);
  stats.ground = { background: toHex(bodyStyle.backgroundColor), color: toHex(bodyStyle.color) };
  const bodyRect = document.body.getBoundingClientRect();
  let groundArea = stats.ground.background?.length === 7 ? bodyRect.width * bodyRect.height : 0;

  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || /^(SCRIPT|STYLE|TEMPLATE)$/.test(el.tagName)) {
      continue;
    }
    const text = ownText(el);
    if (text) {
      tally(stats.colors.text, toHex(cs.color), text.length);
      tally(stats.fontFamilies, cs.fontFamily, text.length);
      stats.type.push({
        path: path(el),
        tag: el.tagName.toLowerCase(),
        text: text.slice(0, 40),
        length: text.length,
        family: cs.fontFamily,
        size: cs.fontSize,
        lineHeight: cs.lineHeight,
        weight: cs.fontWeight,
        letterSpacing: cs.letterSpacing,
        textTransform: cs.textTransform,
      });
    }
    // Background colors weigh by painted area, so a page ground outranks a small badge.
    tally(stats.colors.background, toHex(cs.backgroundColor), Math.round((r.width * r.height) / 100));
    for (const side of ['top', 'right', 'bottom', 'left']) {
      if (parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0 && cs.getPropertyValue(`border-${side}-style`) !== 'none') {
        tally(stats.colors.border, toHex(cs.getPropertyValue(`border-${side}-color`)));
      }
    }
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const pad = cs.getPropertyValue(`padding-${side}`);
      if (parseFloat(pad) > 0) {
        tally(stats.spacing.padding, pad);
      }
    }
    // Side margins are mostly auto-centering, which computes to a px value that is not a spacing step.
    for (const side of ['top', 'bottom']) {
      const mar = cs.getPropertyValue(`margin-${side}`);
      if (parseFloat(mar) > 0) {
        tally(stats.spacing.margin, mar);
      }
    }
    // The largest painted surface sets the page ground and its ink. A wrapper as large as <body> wins over it,
    // since the wrapper's text color is the one the page inherits.
    const area = r.width * r.height;
    const bg = toHex(cs.backgroundColor);
    if (bg && bg.length === 7 && area >= groundArea) {
      groundArea = area;
      stats.ground = { background: bg, color: toHex(cs.color) };
    }
    if (/flex|grid/.test(cs.display)) {
      for (const g of [cs.rowGap, cs.columnGap]) {
        if (parseFloat(g) > 0) {
          tally(stats.spacing.gap, g);
        }
      }
    }
    if (parseFloat(cs.borderTopLeftRadius) > 0) {
      tally(stats.radius, cs.borderTopLeftRadius);
    }
    if (cs.boxShadow && cs.boxShadow !== 'none') {
      tally(stats.shadow, cs.boxShadow);
    }
    if (cs.maxWidth !== 'none' && /px$/.test(cs.maxWidth)) {
      tally(stats.maxWidth, cs.maxWidth);
    }
    for (let i = 0; i < el.style.length; i++) {
      const name = el.style[i];
      if (name.startsWith('--')) {
        const value = el.style.getPropertyValue(name).trim();
        stats.customProperties.inline[name] = { value, hex: toHex(value) };
      }
    }
  }

  // :root, html, and the guarded form :root:not([data-theme="light"]) that pages with a theme toggle use.
  const isRootSelector = (sel) => /(^|,)\s*(:root|html)(:not\([^)]*\))?\s*(,|$)/.test(sel);
  // A dark marker inside :not() selects the light state, so it is ignored.
  const isDarkSelector = (sel) =>
    /\[data-theme=["']?dark["']?\]|\.dark(?![\w-])/.test(sel.replace(/:not\([^)]*\)/g, ''));
  const readVars = (rule, target) => {
    for (let i = 0; i < rule.style.length; i++) {
      const name = rule.style[i];
      if (name.startsWith('--')) {
        const value = rule.style.getPropertyValue(name).trim();
        target[name] = { value, hex: toHex(value) };
      }
    }
  };
  const walk = (rules, inDarkMedia) => {
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, inDarkMedia || /prefers-color-scheme:\s*dark/.test(rule.conditionText || rule.media.mediaText));
      } else if (rule.cssRules && !(rule instanceof CSSStyleRule)) {
        walk(rule.cssRules, inDarkMedia);
      } else if (rule instanceof CSSStyleRule) {
        if (isDarkSelector(rule.selectorText) || (inDarkMedia && isRootSelector(rule.selectorText))) {
          readVars(rule, stats.customProperties.dark);
        } else if (isRootSelector(rule.selectorText)) {
          readVars(rule, stats.customProperties.root);
        }
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules, false);
    } catch {
      // A cross-origin stylesheet (a web-font CSS file) cannot be read; it declares no tokens.
    }
  }
  return stats;
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
  /\b(add to (cart|bag|basket)|buy|checkout|pay|subscribe|sign ?(up|in|out)|log ?(in|out)|delete|remove|submit|send|order|book now)/i;
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

/** A URL without its fragment: a click that only changes the hash stays on the page. */
const withoutHash = (value) => value.replace(/#.*$/, '');

async function clickAndDiff(page, trigger) {
  const locator = page.locator(TRIGGER_SELECTOR).nth(trigger.index);
  const loadedUrl = page.url();
  const before = await page.evaluate(snapshotState);
  await locator.click({ timeout: 3000 });
  await page.waitForTimeout(400);
  const currentUrl = page.url();
  if (withoutHash(currentUrl) !== withoutHash(loadedUrl)) {
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
      results.push({ label: trigger.label, ...(await clickAndDiff(page, trigger)) });
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
  writeFileSync(`${dir}/styles-${width}.json`, JSON.stringify(await page.evaluate(collectStyleStats), null, 2));
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

  const outDir = resolve(args.out);
  const baseFolder = args.base ? baseUrl(args.base) : null;
  if (baseFolder?.startsWith('file:') && isInside(outDir, fileURLToPath(baseFolder))) {
    console.error('--out must be outside the --base folder: the capture never writes into the design files.');
    process.exit(2);
  }

  const chromium = await loadPlaywright();
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
