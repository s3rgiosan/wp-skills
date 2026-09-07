#!/usr/bin/env node
/**
 * capture.mjs — capture a deployed v0 (or any) page for translation to a block theme.
 *
 * For each breakpoint it writes, into the output dir:
 *   - shot-<w>.png       full-page screenshot
 *   - dom-<w>.html       rendered outerHTML (post-hydration)
 *   - computed-<w>.json  computed styles for a curated selector set
 *
 * Usage:
 *   node capture.mjs <url> [--out DIR] [--breakpoints 390,768,1280] [--selectors "body,h1,h2,..."] [--timeout 60000]
 *
 * Requires Playwright:
 *   npm i -D playwright   (or)   npx playwright install chromium
 */

import { mkdirSync, writeFileSync } from 'node:fs';
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

const HELP = `capture.mjs — capture a page for block-theme translation

Usage:
  node capture.mjs <url> [--out DIR] [--breakpoints 390,768,1280] [--selectors "body,h1,..."] [--timeout 60000]

Writes shot-<w>.png, dom-<w>.html, computed-<w>.json per breakpoint into --out (default ./v0-capture).
Requires Playwright: npx playwright install chromium`;

function parseArgs(argv) {
  const args = {
    url: null,
    out: 'v0-capture',
    breakpoints: DEFAULT_BREAKPOINTS,
    selectors: DEFAULT_SELECTORS,
    timeout: 60000,
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
      default:
        if (!args.url && !a.startsWith('-')) {
          args.url = a;
        }
        break;
    }
  }
  return args;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (!args.url) {
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

  const browser = await chromium.launch();
  try {
    for (const width of args.breakpoints) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      await page.goto(args.url, { waitUntil: 'networkidle', timeout: args.timeout });
      await page.waitForTimeout(500);

      await page.screenshot({ path: `${outDir}/shot-${width}.png`, fullPage: true });

      const html = await page.content();
      writeFileSync(`${outDir}/dom-${width}.html`, html);

      const computed = await page.evaluate(
        ({ selectors, props }) => {
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
        },
        { selectors: args.selectors, props: CAPTURED_PROPS }
      );
      writeFileSync(`${outDir}/computed-${width}.json`, JSON.stringify(computed, null, 2));

      console.error(`  ✓ ${width}px → shot-${width}.png, dom-${width}.html, computed-${width}.json`);
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.error(`\nDone. Capture in ${outDir}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
