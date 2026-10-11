#!/usr/bin/env node
/**
 * unbundle.mjs — split a downloaded Claude Design canvas into one standalone HTML page per artboard.
 *
 * A canvas downloaded as HTML is a self-unpacking bundle: a gallery page that shows each artboard in an
 * iframe, with every artboard stored in a `__bundler/manifest` script block (base64, usually gzipped) and
 * ordered by `__bundler/page_order`. Each artboard entry is itself a self-unpacking page that renders on its
 * own from a file:// URL, so capture.mjs can load it at any viewport width.
 *
 * Writes into --out:
 *   - <slug>.html   one page per artboard, slug from the artboard title (Home → home.html)
 *   - routes.txt    the page file names, in canvas order, for `capture.mjs --routes routes.txt --base <out>`
 *   - boards.json   slug, title, file, and the artboard's canvas width/height
 *
 * A file with no bundle blocks is a plain HTML page: capture it directly, no unbundling needed.
 * The input is read as data. Nothing in it is executed, and nothing is written next to it.
 *
 * Usage:
 *   node unbundle.mjs <canvas-export.html> --out DIR
 *
 * No network, no dependencies.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gunzipSync, inflateRawSync } from 'node:zlib';

const HELP = `unbundle.mjs — downloaded Claude Design canvas → one HTML page per artboard

Usage:
  node unbundle.mjs <canvas-export.html> --out DIR

Writes <slug>.html per artboard, routes.txt and boards.json into DIR. Then capture the pages:
  node capture.mjs --routes DIR/routes.txt --base DIR --out capture/design --behaviors`;

function parseArgs(argv) {
  const args = { input: null, out: null };
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
      default:
        if (!a.startsWith('-')) {
          args.input = a;
        }
        break;
    }
  }
  return args;
}

/** Text of `<script type="__bundler/<name>">`, or null. */
function bundlerBlock(html, name) {
  const match = html.match(new RegExp(`<script type="__bundler/${name}">([\\s\\S]*?)</script>`));
  return match ? match[1].trim() : null;
}

function decodeEntry(entry) {
  const bytes = Buffer.from(entry.data, 'base64');
  if (!entry.compressed) {
    return bytes;
  }
  try {
    return gunzipSync(bytes);
  } catch {
    return inflateRawSync(bytes);
  }
}

const decodeAttr = (value) =>
  value
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** Value of one attribute in a tag's attribute string; `title` never matches inside `data-title`. */
function attr(attrs, name) {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)')`));
  return match ? decodeAttr(match[1] ?? match[2]) : null;
}

/** Artboard title, width and height by entry id, read from the gallery template's iframes. */
function boardsFromTemplate(template) {
  const boards = {};
  for (const match of template.matchAll(/<iframe\b([^>]*)>/g)) {
    const attrs = match[1];
    const id = attr(attrs, 'src')?.match(/^about:blank#(.+)$/)?.[1];
    if (!id) {
      continue;
    }
    boards[id] = {
      title: attr(attrs, 'title') || '',
      width: parseInt(attr(attrs, 'width'), 10) || null,
      height: parseInt(attr(attrs, 'height'), 10) || null,
    };
  }
  return boards;
}

/** Parse a bundle block, exiting with a clear message when the export is damaged. */
function parseBlock(text, name) {
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error(`The export's __bundler/${name} block is not valid JSON (${err.message}). Download the canvas again.`);
    process.exit(1);
  }
}

function slugify(title, fallback) {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || fallback;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (!args.input || !args.out) {
    console.log(HELP);
    process.exit(2);
  }
  const input = resolve(args.input);
  const out = resolve(args.out);
  if (!existsSync(input)) {
    console.error(`No such file: ${input}`);
    process.exit(2);
  }
  if (out === dirname(input)) {
    console.error('--out must be a separate folder from the one holding the export.');
    process.exit(2);
  }

  const html = readFileSync(input, 'utf8');
  const manifestText = bundlerBlock(html, 'manifest');
  if (!manifestText) {
    console.error('No bundle found: this is a plain HTML page. Capture it directly with capture.mjs.');
    process.exit(1);
  }

  const manifest = parseBlock(manifestText, 'manifest');
  const orderText = bundlerBlock(html, 'page_order');
  const templateText = bundlerBlock(html, 'template');
  const template = templateText ? parseBlock(templateText, 'template') : '';
  const meta = boardsFromTemplate(typeof template === 'string' ? template : '');
  const order = orderText ? parseBlock(orderText, 'page_order') : [];
  if (!Array.isArray(order)) {
    console.error('The export\'s __bundler/page_order block is not a list. Download the canvas again.');
    process.exit(1);
  }

  // A canvas lists its artboards in page_order. Without one, the export is a single page: keep it whole.
  const pages = order.filter((id) => manifest[id] && /html/.test(manifest[id].mime || ''));
  mkdirSync(out, { recursive: true });

  const boards = [];
  const used = new Set();
  if (!pages.length) {
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] || 'page';
    const slug = slugify(decodeAttr(title), 'page');
    writeFileSync(`${out}/${slug}.html`, html);
    boards.push({ slug, title: decodeAttr(title), file: `${slug}.html`, width: null, height: null });
  } else {
    pages.forEach((id, index) => {
      const info = meta[id] || { title: '', width: null, height: null };
      const base = slugify(info.title, `board-${index + 1}`);
      let slug = base;
      for (let n = 2; used.has(slug); n++) {
        slug = `${base}-${n}`;
      }
      used.add(slug);
      let page;
      try {
        page = decodeEntry(manifest[id]);
      } catch (err) {
        console.error(`Artboard "${info.title || id}" could not be decoded (${err.message}); skipped.`);
        return;
      }
      writeFileSync(`${out}/${slug}.html`, page);
      boards.push({ slug, title: info.title, file: `${slug}.html`, width: info.width, height: info.height });
    });
  }

  writeFileSync(`${out}/routes.txt`, `${boards.map((b) => b.file).join('\n')}\n`);
  writeFileSync(`${out}/boards.json`, `${JSON.stringify(boards, null, 2)}\n`);
  for (const b of boards) {
    console.error(`  ✓ ${b.file}  ${b.title}${b.width ? `  (${b.width}×${b.height})` : ''}`);
  }
  console.error(`\n${boards.length} page(s) in ${out}. Next: capture.mjs --routes ${out}/routes.txt --base ${out}`);
}

main();
