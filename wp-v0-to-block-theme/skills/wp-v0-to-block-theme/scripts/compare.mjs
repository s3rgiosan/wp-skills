#!/usr/bin/env node
/**
 * compare.mjs — parity gate between two capture.mjs runs: the design (v0) and the WordPress rebuild.
 *
 * Per route and breakpoint it checks:
 *   - structure: heading outline (h1–h3 text, in order) and section count — a dropped section fails here
 *     even when the pixel diff is small;
 *   - per-section styles: vertical padding, content column offset/width, row item/track count and gap,
 *     heading font metrics, form control height/background, background image presence;
 *   - pixels: full-page screenshot diff ratio, compared in slices so tall pages are read in full
 *     (writes diff-<w>.png, or diff-<w>-<n>.png per differing slice, next to the local capture);
 *   - network: failed requests and console errors on the local site.
 *
 * Exit code: 0 all checks pass, 1 any check fails, 2 usage error. Checks without data report NOT RUN,
 * which never counts as a pass.
 *
 * Usage:
 *   node compare.mjs <design-capture-dir> <local-capture-dir> [--tolerance 2] [--pixel-threshold 1]
 *     [--map design-route=local-route ...] [--json FILE]
 *
 * Requires Playwright (used to decode and diff the screenshots).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HELP = `compare.mjs — parity gate between a design capture and a WordPress capture

Usage:
  node compare.mjs <design-capture-dir> <local-capture-dir> [--tolerance 2] [--pixel-threshold 1]
    [--map design-route=local-route ...] [--json FILE]

  --tolerance N        px difference allowed for geometry and font metrics (default 2).
  --pixel-threshold N  max % of differing pixels per screenshot (default 1).
  --map a=b            pair route folder a (design) with b (local) when their slugs differ.
  --json FILE          also write the full result as JSON.

Exit 0 = pass, 1 = fail. NOT RUN is never a pass.`;

function parseArgs(argv) {
  const args = { dirs: [], tolerance: 2, pixelThreshold: 1, map: {}, json: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--tolerance':
        args.tolerance = Number(argv[++i]);
        break;
      case '--pixel-threshold':
        args.pixelThreshold = Number(argv[++i]);
        break;
      case '--map': {
        const [from, to] = String(argv[++i]).split('=');
        args.map[from] = to;
        break;
      }
      case '--json':
        args.json = argv[++i];
        break;
      default:
        if (!a.startsWith('-')) {
          args.dirs.push(a);
        }
        break;
    }
  }
  return args;
}

const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
const px = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
};
const trackCount = (template) =>
  !template || template === 'none' ? null : template.trim().split(/\s+(?![^(]*\))/).length;

/* ------------------------------------------------------------------ Checks */

function compareStructure(design, local) {
  const problems = [];
  const missing = design.outline.filter((h) => !local.outline.includes(h));
  const extra = local.outline.filter((h) => !design.outline.includes(h));
  if (missing.length) {
    problems.push(`headings missing locally: ${missing.join(' | ')}`);
  }
  if (extra.length) {
    problems.push(`headings not in the design: ${extra.join(' | ')}`);
  }
  const shared = design.outline.filter((h) => local.outline.includes(h));
  const localOrder = local.outline.filter((h) => shared.includes(h));
  if (!missing.length && !extra.length && shared.join('\n') !== localOrder.join('\n')) {
    problems.push('heading order differs');
  }
  if (design.sections.length !== local.sections.length) {
    problems.push(`section count ${local.sections.length}, design has ${design.sections.length}`);
  }
  return problems;
}

/**
 * Pair sections by label. A section whose label changed falls back to the same position, but only when
 * the local section there matches no design label — so one dropped section doesn't shift every pairing.
 */
function pairSections(designSections, localSections) {
  const used = new Set();
  const designLabels = new Set(designSections.map((d) => d.label));
  return designSections.map((d, i) => {
    let match = localSections.findIndex((l, j) => !used.has(j) && l.label && l.label === d.label);
    const positional = localSections[i];
    if (match === -1 && positional && !used.has(i) && !designLabels.has(positional.label)) {
      match = i;
    }
    if (match === -1) {
      return [d, null];
    }
    used.add(match);
    return [d, localSections[match]];
  });
}

function compareSection(d, l, tol) {
  const problems = [];
  const near = (name, a, b) => {
    const x = px(a);
    const y = px(b);
    if (x !== null && y !== null && Math.abs(x - y) > tol) {
      problems.push(`${name}: ${b} (design ${a})`);
    }
  };

  near('padding-top', d.styles['padding-top'], l.styles['padding-top']);
  near('padding-bottom', d.styles['padding-bottom'], l.styles['padding-bottom']);
  near('height', d.rect.height, l.rect.height);

  const hasImage = (s) => s['background-image'] && s['background-image'] !== 'none';
  if (hasImage(d.styles) !== hasImage(l.styles)) {
    problems.push(`background-image ${hasImage(l.styles) ? 'present' : 'missing'} (design differs)`);
  }

  if (d.column && l.column) {
    near('content column left', d.column.rect.left, l.column.rect.left);
    near('content column width', d.column.rect.width, l.column.rect.width);
  }

  if (d.row && l.row) {
    if (d.row.items !== l.row.items) {
      problems.push(`row items: ${l.row.items} (design ${d.row.items})`);
    }
    const dt = trackCount(d.row['grid-template-columns']);
    const lt = trackCount(l.row['grid-template-columns']);
    if (dt !== null && lt !== null && dt !== lt) {
      problems.push(`grid tracks: ${lt} (design ${dt})`);
    }
    near('row column-gap', d.row['column-gap'], l.row['column-gap']);
    near('row row-gap', d.row['row-gap'], l.row['row-gap']);
  }

  d.headings.forEach((dh, i) => {
    const lh = l.headings.find((h) => h.text === dh.text) || l.headings[i];
    if (!lh) {
      return;
    }
    near(`${dh.tag} "${dh.text.slice(0, 30)}" font-size`, dh['font-size'], lh['font-size']);
    near(`${dh.tag} "${dh.text.slice(0, 30)}" line-height`, dh['line-height'], lh['line-height']);
    if (dh['font-weight'] !== lh['font-weight']) {
      problems.push(`${dh.tag} "${dh.text.slice(0, 30)}" font-weight: ${lh['font-weight']} (design ${dh['font-weight']})`);
    }
  });

  d.controls.forEach((dc, i) => {
    const lc = l.controls[i];
    if (!lc) {
      return;
    }
    near(`${dc.tag} height`, dc.height, lc.height);
    if (dc['background-color'] !== lc['background-color']) {
      problems.push(`${dc.tag} background: ${lc['background-color']} (design ${dc['background-color']})`);
    }
    if (!lc.name) {
      problems.push(`${lc.tag} has no name attribute; its value is not submitted`);
    }
  });

  return problems;
}

/* ------------------------------------------------------------------ Pixel diff */

async function loadPlaywright() {
  try {
    const mod = await import('playwright');
    return mod.chromium;
  } catch {
    return null;
  }
}

// Chromium canvases stop reading pixels past ~65k px in one dimension, so tall pages are compared in slices.
const SLICE_HEIGHT = 8192;

/**
 * Percentage of pixels whose max channel delta exceeds 32; rows past the shorter image count as different.
 * Writes the diff (differing pixels in red) as `<diffBase>.png`, or as `<diffBase>-<n>.png` per differing
 * slice when the page is taller than one slice.
 */
async function pixelDiff(page, designPng, localPng, diffBase) {
  const result = await page.evaluate(
    async ({ a, b, sliceHeight }) => {
      const load = (src) =>
        new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = rej;
          img.src = `data:image/png;base64,${src}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const width = Math.min(ia.width, ib.width);
      const height = Math.max(ia.height, ib.height);
      const slices = [];
      let different = 0;

      for (let top = 0; top < height; top += sliceHeight) {
        const h = Math.min(sliceHeight, height - top);
        const draw = (img) => {
          const c = document.createElement('canvas');
          c.width = width;
          c.height = h;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, top, width, h, 0, 0, width, h);
          return ctx.getImageData(0, 0, width, h).data;
        };
        const da = draw(ia);
        const db = draw(ib);
        const out = document.createElement('canvas');
        out.width = width;
        out.height = h;
        const octx = out.getContext('2d');
        const diff = octx.createImageData(width, h);
        let sliceDifferent = 0;
        for (let i = 0; i < da.length; i += 4) {
          const delta = Math.max(
            Math.abs(da[i] - db[i]),
            Math.abs(da[i + 1] - db[i + 1]),
            Math.abs(da[i + 2] - db[i + 2]),
            Math.abs(da[i + 3] - db[i + 3])
          );
          const off = delta > 32;
          if (off) {
            sliceDifferent++;
          }
          diff.data[i] = off ? 255 : da[i] * 0.3;
          diff.data[i + 1] = off ? 0 : da[i + 1] * 0.3;
          diff.data[i + 2] = off ? 0 : da[i + 2] * 0.3;
          diff.data[i + 3] = 255;
        }
        different += sliceDifferent;
        octx.putImageData(diff, 0, 0);
        slices.push({
          different: sliceDifferent,
          png: sliceDifferent ? out.toDataURL('image/png').split(',')[1] : null,
        });
      }

      return {
        percent: (different / (width * height)) * 100,
        heights: [ia.height, ib.height],
        slices,
      };
    },
    {
      a: readFileSync(designPng).toString('base64'),
      b: readFileSync(localPng).toString('base64'),
      sliceHeight: SLICE_HEIGHT,
    }
  );

  const single = result.slices.length === 1;
  result.slices.forEach((slice, n) => {
    if (slice.png) {
      const file = single ? `${diffBase}.png` : `${diffBase}-${n + 1}.png`;
      writeFileSync(file, Buffer.from(slice.png, 'base64'));
    }
  });
  return { percent: result.percent, heights: result.heights };
}

/* ------------------------------------------------------------------ Main */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (args.dirs.length !== 2) {
    console.log(HELP);
    process.exit(2);
  }
  const [designDir, localDir] = args.dirs;
  const designManifest = readJson(join(designDir, 'capture.json'));
  const localManifest = readJson(join(localDir, 'capture.json'));
  if (!designManifest || !localManifest) {
    console.error('Both directories must be capture.mjs output (capture.json missing).');
    process.exit(2);
  }

  const chromium = await loadPlaywright();
  const browser = chromium ? await chromium.launch() : null;
  const page = browser ? await browser.newPage() : null;
  const localRoutes = new Set(localManifest.routes.map((r) => r.dir));
  const results = [];

  try {
    for (const route of designManifest.routes) {
      const localRoute = args.map[route.dir] || route.dir;
      for (const width of designManifest.breakpoints) {
        const entry = { route: route.dir, width, checks: {} };
        results.push(entry);
        if (!localRoutes.has(localRoute)) {
          entry.checks.route = { status: 'FAIL', problems: [`no local capture for route "${localRoute}"`] };
          continue;
        }
        const dPath = (f) => join(designDir, route.dir, `${f}-${width}`);
        const lPath = (f) => join(localDir, localRoute, `${f}-${width}`);

        const ds = readJson(`${dPath('sections')}.json`);
        const ls = readJson(`${lPath('sections')}.json`);
        if (ds && ls) {
          const structure = compareStructure(ds, ls);
          entry.checks.structure = { status: structure.length ? 'FAIL' : 'PASS', problems: structure };

          const sectionProblems = [];
          for (const [d, l] of pairSections(ds.sections, ls.sections)) {
            const name = `#${d.index} ${d.tag} "${d.label.slice(0, 40)}"`;
            if (!l) {
              sectionProblems.push(`${name}: no matching local section`);
              continue;
            }
            for (const p of compareSection(d, l, args.tolerance)) {
              sectionProblems.push(`${name}: ${p}`);
            }
          }
          entry.checks.sections = { status: sectionProblems.length ? 'FAIL' : 'PASS', problems: sectionProblems };
        } else {
          entry.checks.structure = { status: 'NOT RUN', problems: ['sections JSON missing'] };
          entry.checks.sections = { status: 'NOT RUN', problems: ['sections JSON missing'] };
        }

        const dShot = `${dPath('shot')}.png`;
        const lShot = `${lPath('shot')}.png`;
        if (page && existsSync(dShot) && existsSync(lShot)) {
          const { percent, heights } = await pixelDiff(page, dShot, lShot, lPath('diff'));
          const problems = [`${percent.toFixed(2)}% pixels differ (design ${heights[0]}px tall, local ${heights[1]}px)`];
          entry.checks.pixels = { status: percent > args.pixelThreshold ? 'FAIL' : 'PASS', problems };
        } else {
          entry.checks.pixels = {
            status: 'NOT RUN',
            problems: [page ? 'screenshot missing' : 'Playwright not installed'],
          };
        }

        const net = readJson(`${lPath('network')}.json`);
        if (net) {
          const problems = [
            ...net.failed.map((f) => `request failed: ${f.url} (${f.status || f.error})`),
            ...net.consoleErrors.map((e) => `console error: ${e}`),
          ];
          entry.checks.network = { status: problems.length ? 'FAIL' : 'PASS', problems };
        } else {
          entry.checks.network = { status: 'NOT RUN', problems: ['network JSON missing'] };
        }
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  let failed = false;
  for (const entry of results) {
    console.log(`\n## ${entry.route} @ ${entry.width}px`);
    for (const [name, check] of Object.entries(entry.checks)) {
      if (check.status !== 'PASS') {
        failed = true;
      }
      console.log(`- ${name}: ${check.status}`);
      const shown = check.status === 'PASS' && name !== 'pixels' ? [] : check.problems;
      for (const p of shown) {
        console.log(`  - ${p}`);
      }
    }
  }
  console.log(`\nVerdict: ${failed ? 'FAIL' : 'PASS'}`);

  if (args.json) {
    writeFileSync(args.json, JSON.stringify({ verdict: failed ? 'FAIL' : 'PASS', results }, null, 2));
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(2);
});
