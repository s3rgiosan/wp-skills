#!/usr/bin/env node
/**
 * cascade-order.mjs — find the theme rules that win on the front end only because of stylesheet order.
 *
 * On the front end the theme stylesheet loads after the global styles and block-support styles. In the block
 * editor canvas, editor styles load before them. A theme rule that ties one of those rules on specificity
 * (`.article-body > * + *` against `:root :where(.is-layout-constrained) > *`) therefore wins on the front end and
 * loses in the editor.
 *
 * For each route and breakpoint it records the computed styles of every rendered element in the page, moves
 * the theme stylesheet (and its inline additions) before the global styles, as the editor orders them, and
 * records them again. Each change is a rule that loses in the editor. It reads the pages only.
 *
 * Usage:
 *   node cascade-order.mjs --routes FILE --base URL [--breakpoints 390,768,1280]
 *     [--stylesheet /css/frontend.css] [--json FILE] [--timeout 60000]
 *
 * Exit code: 0 no order-dependent rule, 1 one or more found, 2 usage error.
 *
 * Requires Playwright, installed beside this script or in the current working directory:
 *   npm i -D playwright && npx playwright install chromium
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { loadChromium, PLAYWRIGHT_MISSING, settle } from './lib/browser.mjs';

const DEFAULT_BREAKPOINTS = [390, 768, 1280];
const VIEWPORT_HEIGHT = 900;

const HELP = `cascade-order.mjs — theme rules that win on the front end only because of stylesheet order

Usage:
  node cascade-order.mjs --routes FILE --base URL [--breakpoints 390,768,1280]
    [--stylesheet /css/frontend.css] [--json FILE] [--timeout 60000]

  --routes FILE      one front-end path per line (# comments allowed). A capture-editor.mjs routes file
                     works as it is: the "=> editor-url" part is ignored.
  --base URL         the local site, e.g. http://mysite.test.
  --stylesheet TEXT  part of the theme stylesheet's URL (default /css/frontend.css).
  --json FILE        also write every change as JSON.

Each line of the report is an element, a property, and its value as loaded on the front end → with the
theme stylesheet before the global styles. Set the value through the block (blockGap, a preset, a block
style) so both sides generate it, or raise the rule's specificity.
Requires Playwright in the current directory: npm i -D playwright && npx playwright install chromium`;

const PROPS = [
  'display', 'gap', 'row-gap', 'column-gap',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'width', 'max-width', 'height',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform',
  'text-decoration-line', 'color', 'background-color', 'border-top-width', 'border-bottom-width',
  'border-color', 'border-radius', 'justify-content', 'align-items', 'flex-direction', 'flex-wrap',
];

function parseArgs(argv) {
  const args = {
    routesFile: null,
    base: null,
    breakpoints: DEFAULT_BREAKPOINTS,
    stylesheet: '/css/frontend.css',
    json: null,
    timeout: 60000,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--routes':
        args.routesFile = argv[++i];
        break;
      case '--base':
        args.base = argv[++i];
        break;
      case '--breakpoints':
        args.breakpoints = String(argv[++i])
          .split(',')
          .map(Number)
          .filter((n) => n > 0);
        break;
      case '--stylesheet':
        args.stylesheet = argv[++i];
        break;
      case '--json':
        args.json = argv[++i];
        break;
      case '--timeout':
        args.timeout = Number(argv[++i]) || args.timeout;
        break;
      case '-h':
      case '--help':
        args.help = true;
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        args.help = true;
        args.usageError = true;
    }
  }
  return args;
}

function readRoutes(file, base) {
  return [
    ...new Set(
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line) => line.replace(/#.*/, '').split('=>')[0].trim())
        .filter(Boolean)
        .map((path) => new URL(path, base).href)
    ),
  ];
}

/** Computed styles of every rendered element in the page, in document order. */
function collect(props) {
  const root = document.querySelector('.wp-site-blocks') || document.body;
  const label = (el) => {
    const classes = [...el.classList].filter((c) => !/^(wp-container-|wp-elements-|is-layout-|wp-block-.+-is-layout-)/.test(c));
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30);
    return `${el.tagName.toLowerCase()}${classes.length ? '.' + classes.join('.') : ''}${text ? ` "${text}"` : ''}`;
  };
  return [...root.querySelectorAll('*')]
    .filter((el) => el.getClientRects().length > 0 && !el.closest('svg, script, style, template'))
    .map((el) => {
      const cs = getComputedStyle(el);
      return { label: label(el), values: props.map((p) => cs.getPropertyValue(p)) };
    });
}

/** Put the theme stylesheet before the global styles; false when either is missing from the page. */
function reorder(match) {
  const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.href.includes(match));
  const globals = document.getElementById('global-styles-inline-css');
  if (!link || !globals) {
    return false;
  }
  const inline = link.id ? document.getElementById(link.id.replace(/-css$/, '-inline-css')) : null;
  globals.before(link);
  if (inline) {
    globals.before(inline);
  }
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    process.exit(args.usageError ? 2 : 0);
  }
  if (!args.routesFile || !args.base || !/^https?:/i.test(args.base) || !args.breakpoints.length) {
    console.log(HELP);
    process.exit(2);
  }

  const chromium = await loadChromium();
  if (!chromium) {
    console.error(PLAYWRIGHT_MISSING);
    process.exit(2);
  }

  const routes = readRoutes(args.routesFile, new URL(args.base).origin + '/');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const changes = [];
  let missing = false;

  try {
    for (const width of args.breakpoints) {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      for (const url of routes) {
        await page.goto(url, { waitUntil: 'networkidle', timeout: args.timeout });
        await settle(page);
        const before = await page.evaluate(collect, PROPS);
        const moved = await page.evaluate(reorder, args.stylesheet);
        if (!moved) {
          console.error(`${url}: no stylesheet matching "${args.stylesheet}", or no global styles on the page.`);
          missing = true;
          continue;
        }
        await settle(page);
        const after = await page.evaluate(collect, PROPS);
        before.forEach((el, i) => {
          const other = after[i];
          if (!other || other.label !== el.label) {
            return;
          }
          PROPS.forEach((prop, p) => {
            if (el.values[p] !== other.values[p]) {
              changes.push({ route: url, width, element: el.label, prop, front: el.values[p], editor: other.values[p] });
            }
          });
        });
      }
    }
  } finally {
    await browser.close();
  }

  // One line per element and property, with the routes and breakpoints it shows on.
  const grouped = new Map();
  for (const c of changes) {
    const key = `${c.element} :: ${c.prop}: ${c.front} → ${c.editor}`;
    const where = grouped.get(key) || new Set();
    where.add(`${new URL(c.route).pathname}@${c.width}`);
    grouped.set(key, where);
  }
  for (const [key, where] of grouped) {
    const list = [...where];
    console.log(`${key}\n    ${list.slice(0, 6).join(', ')}${list.length > 6 ? `, +${list.length - 6} more` : ''}`);
  }
  console.log(
    grouped.size
      ? `\nFAIL: ${grouped.size} order-dependent value(s). Each one loses in the editor.`
      : '\nPASS: no theme rule depends on stylesheet order.'
  );
  if (args.json) {
    writeFileSync(args.json, JSON.stringify(changes, null, 2));
  }
  process.exit(grouped.size || missing ? 1 : 0);
}

main();
