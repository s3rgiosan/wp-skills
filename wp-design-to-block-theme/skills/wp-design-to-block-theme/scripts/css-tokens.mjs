#!/usr/bin/env node
/**
 * css-tokens.mjs — derive a theme.json fragment from what a design renders, read from capture.mjs output.
 *
 * Works for any design whose tokens are not in a config file: hardcoded hex in inline styles, CSS custom
 * properties on :root, dark-mode rules. It reads the styles-<w>.json files capture.mjs writes for every route
 * and breakpoint, and ranks what the pages paint:
 *   - colors: backgrounds by painted area, text by text length, borders by count, plus every custom property
 *     that holds a color (its name becomes the palette slug);
 *   - font families by text length; font sizes by text length, made fluid when the narrowest breakpoint
 *     renders the same elements smaller;
 *   - spacing (padding, margin, gap), radii, shadows, and the max-widths that suggest contentSize/wideSize.
 * Dark-mode custom properties (prefers-color-scheme: dark, [data-theme="dark"], .dark) become a style variation.
 *
 * Output: JSON with `settings` and a draft `styles` block, ready to merge into theme.json. Every value is a
 * first pass: rename slugs to their role and drop what the design does not need (references/theme-json-tokens.md).
 *
 * Usage:
 *   node css-tokens.mjs <capture-dir> [--out FILE] [--dark-out FILE] [--report FILE] [--max-colors 16]
 *
 * No network, no dependencies.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

const HELP = `css-tokens.mjs — rendered styles (capture.mjs output) → theme.json settings

Usage:
  node css-tokens.mjs <capture-dir> [--out FILE] [--dark-out FILE] [--report FILE] [--max-colors 16]

Emits { "settings": { ... }, "styles": { ... } } to stdout (or --out).
  --dark-out FILE   write dark-mode custom properties as a style variation (e.g. styles/dark.json).
  --report FILE     write the ranked tallies behind each choice, per breakpoint, as JSON.
  --max-colors N    palette size cap (default 16); colors past it are listed in the report only.
Run capture.mjs on the design first; it writes the styles-<w>.json files this script reads.`;

const SIZE_NAMES_BELOW = ['small', 'x-small', 'xx-small'];
const SIZE_NAMES_ABOVE = ['large', 'x-large', 'xx-large', 'xxx-large'];
const SPACING_NAMES = ['2X-Small', 'X-Small', 'Small', 'Medium', 'Large', 'X-Large', '2X-Large', '3X-Large', '4X-Large', '5X-Large'];

function parseArgs(argv) {
  const args = { dir: null, out: null, darkOut: null, report: null, maxColors: 16 };
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
      case '--dark-out':
        args.darkOut = argv[++i];
        break;
      case '--report':
        args.report = argv[++i];
        break;
      case '--max-colors': {
        const n = parseInt(argv[++i], 10);
        args.maxColors = Number.isFinite(n) && n > 0 ? n : 16;
        break;
      }
      default:
        if (!a.startsWith('-')) {
          args.dir = a;
        }
        break;
    }
  }
  return args;
}

const warnings = [];
const warn = (message) => warnings.push(message);

/** True when `path` is `folder` or inside it. */
function isInside(path, folder) {
  const rel = relative(folder, path);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
const px = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
};
const round = (n, places = 4) => Number(n.toFixed(places));
const rem = (value) => `${round(px(value) / 16)}rem`;
const kebab = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const titleCase = (slug) => slug.replace(/(^|-)([a-z0-9])/g, (_, sep, ch) => `${sep ? ' ' : ''}${ch.toUpperCase()}`);
const ranked = (tally) => Object.entries(tally).sort((a, b) => b[1] - a[1]);
// Characters of text set in a style. `text` is a 40-character excerpt; `length` is the full count.
const textWeight = (t) => t.length ?? t.text.length;

/** Sum several tallies ({ key: weight }) into one. */
function merge(tallies) {
  const out = {};
  for (const tally of tallies) {
    for (const [key, weight] of Object.entries(tally || {})) {
      out[key] = (out[key] || 0) + weight;
    }
  }
  return out;
}

/** Load styles-<w>.json for every route, grouped by breakpoint. */
function loadCapture(dir) {
  const manifest = readJson(join(dir, 'capture.json'));
  if (!manifest) {
    console.error(`${dir} is not capture.mjs output (capture.json missing).`);
    process.exit(2);
  }
  const byWidth = {};
  for (const width of manifest.breakpoints) {
    byWidth[width] = manifest.routes
      .map((route) => readJson(join(dir, route.dir, `styles-${width}.json`)))
      .filter(Boolean);
  }
  const widths = manifest.breakpoints.filter((w) => byWidth[w].length).sort((a, b) => a - b);
  if (!widths.length) {
    console.error('No styles-<w>.json files found. Re-run capture.mjs (current version) on the design.');
    process.exit(2);
  }
  return { byWidth, widths };
}

/* ------------------------------------------------------------------ Colors */

/** Custom properties that hold a color, keyed by hex. The first name seen for a hex wins. */
function colorVars(stats) {
  const byHex = {};
  for (const s of stats) {
    for (const scope of ['root', 'inline']) {
      for (const [name, { value, hex }] of Object.entries(s.customProperties[scope])) {
        if (hex && /^(#|rgb|hsl|oklch|oklab|lab|lch|color\()/i.test(value) && !byHex[hex]) {
          byHex[hex] = name.replace(/^--/, '');
        }
      }
    }
  }
  return byHex;
}

function buildPalette(stats, maxColors) {
  const background = merge(stats.map((s) => s.colors.background));
  const text = merge(stats.map((s) => s.colors.text));
  const border = merge(stats.map((s) => s.colors.border));
  const named = colorVars(stats);

  // Rank by best position in any one list, so a border gray is not drowned out by a large background.
  const position = {};
  for (const list of [background, text, border]) {
    ranked(list).forEach(([hex], index) => {
      position[hex] = Math.min(position[hex] ?? Infinity, index);
    });
  }
  for (const hex of Object.keys(named)) {
    position[hex] = Math.min(position[hex] ?? Infinity, 0);
  }

  const translucent = Object.keys(position).filter((hex) => hex.length === 9);
  if (translucent.length) {
    warn(
      `Translucent colors left out of the palette: ${translucent.join(', ')}. ` +
        'Express each as a palette color with relative color syntax (references/theme-json-tokens.md, Translucent surfaces).'
    );
  }

  // The ground most routes paint; its ink is the default text color.
  const grounds = ranked(
    merge(stats.map((s) => (s.ground?.background ? { [JSON.stringify([s.ground.background, s.ground.color || null])]: 1 } : {})))
  );
  const [groundHex, inkHex] = grounds.length ? JSON.parse(grounds[0][0]) : [null, null];
  const ground = groundHex || ranked(background)[0]?.[0];
  const ink = inkHex || ranked(text)[0]?.[0];
  // The ground can be painted by <body> alone, which the element tallies do not cover.
  for (const hex of [ground, ink]) {
    if (hex && hex.length === 7) {
      position[hex] = -1;
    }
  }
  const ordered = Object.keys(position)
    .filter((hex) => hex.length === 7)
    .sort((a, b) => position[a] - position[b] || (background[b] || 0) + (text[b] || 0) - ((background[a] || 0) + (text[a] || 0)));

  if (ordered.length > maxColors) {
    warn(`${ordered.length} opaque colors found; the palette keeps the top ${maxColors}. The rest are in --report.`);
  }

  const used = new Set();
  let n = 0;
  const palette = ordered.slice(0, maxColors).map((hex) => {
    let slug;
    if (named[hex]) {
      slug = kebab(named[hex]);
    } else if (hex === ground) {
      slug = 'base';
    } else if (hex === ink) {
      slug = 'contrast';
    } else {
      n += 1;
      slug = `color-${n}`;
    }
    while (used.has(slug)) {
      slug = `${slug}-2`;
    }
    used.add(slug);
    return { slug, color: hex, name: titleCase(slug) };
  });

  return { palette, ground, ink, report: { background: ranked(background), text: ranked(text), border: ranked(border), named } };
}

/**
 * Dark custom properties → a full replacement palette: dark values where a light var maps, light ones elsewhere.
 * A palette color named after a variable takes that variable's dark value. Any other color takes the dark value
 * of the light variables that share its hex, with a warning when they disagree.
 */
function buildDarkPalette(stats, palette, named) {
  const light = {};
  const dark = {};
  for (const s of stats) {
    Object.assign(light, s.customProperties.root);
    Object.assign(dark, s.customProperties.dark);
  }
  const darkByHex = {};
  for (const [name, entry] of Object.entries(dark)) {
    const lightHex = light[name]?.hex;
    if (entry.hex && lightHex) {
      (darkByHex[lightHex] = darkByHex[lightHex] || new Set()).add(entry.hex);
    }
  }
  if (!Object.keys(darkByHex).length) {
    if (Object.keys(dark).length) {
      warn('Dark-mode custom properties found, but none override a :root color; no dark variation written.');
    }
    return null;
  }
  return palette.map((entry) => {
    const own = named[entry.color] ? dark[`--${named[entry.color]}`]?.hex : null;
    if (own) {
      return { ...entry, color: own };
    }
    const candidates = [...(darkByHex[entry.color] || [])];
    if (candidates.length > 1) {
      warn(`Palette color ${entry.slug} (${entry.color}) has several dark values (${candidates.join(', ')}); the first is used.`);
    }
    return { ...entry, color: candidates[0] || entry.color };
  });
}

/* ------------------------------------------------------------------ Typography */

function buildFontFamilies(stats) {
  const families = ranked(merge(stats.map((s) => s.fontFamilies)));
  const used = new Set();
  return families.map(([stack]) => {
    const first = stack.split(',')[0].replace(/["']/g, '').trim();
    let slug = kebab(first) || 'font';
    while (used.has(slug)) {
      slug = `${slug}-2`;
    }
    used.add(slug);
    if (/^var\(/.test(first)) {
      warn(`Font stack "${stack}" starts with a variable; replace it with the real family name.`);
    }
    return { slug, name: first, fontFamily: stack };
  });
}

/**
 * Font sizes ranked by the text set in them at the widest breakpoint. A size is fluid when the same elements
 * (matched by structural path) render smaller at the narrowest breakpoint; the smallest of those is the min.
 */
function buildFontSizes(statsByWidth, widths) {
  const wide = statsByWidth[widths[widths.length - 1]];
  const narrow = widths.length > 1 ? statsByWidth[widths[0]] : null;

  const weightBySize = {};
  const pathsBySize = {};
  const headingSizes = new Set();
  wide.forEach((s, route) => {
    for (const t of s.type) {
      if (/^h[1-6]$/.test(t.tag)) {
        headingSizes.add(t.size);
      }
      weightBySize[t.size] = (weightBySize[t.size] || 0) + textWeight(t);
      (pathsBySize[t.size] = pathsBySize[t.size] || []).push(`${route}|${t.path}`);
    }
  });

  const narrowSize = {};
  if (narrow) {
    narrow.forEach((s, route) => {
      for (const t of s.type) {
        narrowSize[`${route}|${t.path}`] = px(t.size);
      }
    });
  }

  // A size carrying under 1% of the text is a one-off (an icon label, a badge); headings always count.
  const total = Object.values(weightBySize).reduce((sum, w) => sum + w, 0);
  const sizes = Object.keys(weightBySize)
    .filter((size) => weightBySize[size] / total >= 0.01 || headingSizes.has(size))
    .sort((a, b) => px(a) - px(b));
  const dropped = Object.keys(weightBySize).filter((size) => !sizes.includes(size));
  if (dropped.length) {
    warn(`Font sizes used for under 1% of the text left out: ${dropped.sort((a, b) => px(a) - px(b)).join(', ')}.`);
  }
  const body = ranked(weightBySize)[0]?.[0];
  const bodyIndex = sizes.indexOf(body);

  return sizes.map((size, index) => {
    let slug;
    if (index === bodyIndex) {
      slug = 'medium';
    } else if (index < bodyIndex) {
      slug = SIZE_NAMES_BELOW[bodyIndex - index - 1] || `size-${px(size)}`;
    } else {
      const above = index - bodyIndex - 1;
      slug = SIZE_NAMES_ABOVE[above] || `display-${above - SIZE_NAMES_ABOVE.length + 1}`;
    }
    const entry = { slug, name: titleCase(slug), size: rem(size) };
    const mins = pathsBySize[size].map((key) => narrowSize[key]).filter((v) => v !== undefined);
    const min = mins.length ? Math.min(...mins) : null;
    if (min !== null && min < px(size)) {
      entry.fluid = { min: rem(`${min}px`), max: rem(size) };
    }
    return entry;
  });
}

/** Most common family/size/weight/line-height/letter-spacing per tag at the widest breakpoint. */
function elementStyles(wide, fontSizes, fontFamilies) {
  const byTag = {};
  for (const s of wide) {
    for (const t of s.type) {
      const bucket = (byTag[t.tag] = byTag[t.tag] || { family: {}, size: {}, weight: {}, lineHeight: {}, letterSpacing: {} });
      const w = textWeight(t);
      bucket.family[t.family] = (bucket.family[t.family] || 0) + w;
      bucket.size[t.size] = (bucket.size[t.size] || 0) + w;
      bucket.weight[t.weight] = (bucket.weight[t.weight] || 0) + w;
      bucket.lineHeight[t.lineHeight] = (bucket.lineHeight[t.lineHeight] || 0) + w;
      bucket.letterSpacing[t.letterSpacing] = (bucket.letterSpacing[t.letterSpacing] || 0) + w;
    }
  }
  const top = (tally) => ranked(tally)[0]?.[0];
  const sizeSlug = (size) => fontSizes.find((f) => f.size === rem(size))?.slug;
  const familySlug = (family) => fontFamilies.find((f) => f.fontFamily === family)?.slug;
  // A value with no preset (a size left out of the scale) stays a literal for the review pass.
  const describe = (bucket) => {
    const family = top(bucket.family);
    const size = top(bucket.size);
    const lineHeight = top(bucket.lineHeight);
    const letterSpacing = top(bucket.letterSpacing);
    const familyPreset = familySlug(family);
    const sizePreset = sizeSlug(size);
    const typography = {
      fontFamily: familyPreset ? `var:preset|font-family|${familyPreset}` : family,
      fontSize: sizePreset ? `var:preset|font-size|${sizePreset}` : rem(size),
      fontWeight: top(bucket.weight),
    };
    if (lineHeight && lineHeight !== 'normal') {
      typography.lineHeight = String(round(px(lineHeight) / px(size), 3));
    }
    if (letterSpacing && letterSpacing !== 'normal' && px(letterSpacing) !== 0) {
      typography.letterSpacing = `${round(px(letterSpacing) / px(size), 3)}em`;
    }
    return { typography };
  };

  const elements = {};
  for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    if (byTag[tag]) {
      elements[tag] = describe(byTag[tag]);
    }
  }
  const bodyBucket = byTag.p || byTag.div || byTag.span;
  return { body: bodyBucket ? describe(bodyBucket) : null, elements };
}

/* ------------------------------------------------------------------ Spacing, radius, shadow, layout */

function buildSpacing(wide, narrowStats) {
  const tally = merge(wide.flatMap((s) => [s.spacing.padding, s.spacing.margin, s.spacing.gap]));
  // Values used once are usually one-off nudges and are dropped. Values within 15% of a more used one fold
  // into it, so the scale spends its steps on its full range, up to section padding.
  const candidates = ranked(tally).filter(([value, count]) => count >= 2 && /px$/.test(value) && px(value) >= 4);
  const kept = [];
  for (const [value] of candidates) {
    const v = px(value);
    if (!kept.some((k) => Math.abs(k - v) / Math.max(k, v) < 0.15)) {
      kept.push(v);
    }
  }
  // The most used steps, plus the two largest: section padding is used less often but anchors the scale.
  const largest = [...kept].sort((a, b) => b - a).slice(0, 2);
  const common = kept.filter((v) => !largest.includes(v)).slice(0, SPACING_NAMES.length - largest.length);
  const steps = [...common, ...largest].sort((a, b) => a - b);
  if (!steps.length) {
    return [];
  }
  if (narrowStats) {
    warn(
      'Spacing presets are the desktop values. Where sections tighten on mobile, give the larger steps a ' +
        'clamp() taper capped at the desktop value (references/theme-json-tokens.md, Spacing scale); ' +
        'the narrow breakpoint tallies are in --report.'
    );
  }
  // Core numbers spacing slugs from 20 in steps of 10 (20 is 2X-Small).
  return steps.map((value, index) => ({
    slug: String((index + 2) * 10),
    name: SPACING_NAMES[index],
    size: rem(`${value}px`),
  }));
}

function buildRadius(stats) {
  const values = ranked(merge(stats.map((s) => s.radius))).map(([value]) => value);
  const radius = {};
  const plain = values.filter((v) => /px$/.test(v) && px(v) < 500).sort((a, b) => px(a) - px(b));
  const names = plain.length <= 1 ? ['default'] : plain.length === 2 ? ['small', 'large'] : ['small', 'medium', 'large', 'x-large', 'xx-large'];
  plain.slice(0, names.length).forEach((value, index) => {
    radius[names[index]] = value;
  });
  if (values.some((v) => px(v) >= 500)) {
    radius.full = '9999px';
  }
  if (values.includes('50%')) {
    radius.circle = '50%';
  }
  return radius;
}

function buildShadows(stats) {
  return ranked(merge(stats.map((s) => s.shadow)))
    .slice(0, 4)
    .map(([shadow], index) => ({ slug: `shadow-${index + 1}`, name: `Shadow ${index + 1}`, shadow }));
}

function buildLayout(wide) {
  const widths = ranked(merge(wide.map((s) => s.maxWidth)))
    .filter(([, count]) => count >= 2)
    .map(([value]) => px(value));
  if (!widths.length) {
    return null;
  }
  const wideSize = Math.max(...widths);
  const content = widths.filter((w) => w < wideSize);
  warn(
    `Layout: max-width ${wideSize}px is the widest repeated column. If that column has side padding ` +
      '(box-sizing: border-box), subtract it for wideSize and set the padding as root padding.'
  );
  return {
    contentSize: content.length ? `${content[0]}px` : `${wideSize}px`,
    wideSize: `${wideSize}px`,
  };
}

/* ------------------------------------------------------------------ Main */

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (!args.dir) {
    console.log(HELP);
    process.exit(2);
  }

  // The capture stays as captured, so compare.mjs and later runs read the same files.
  for (const file of [args.out, args.darkOut, args.report].filter(Boolean)) {
    if (isInside(resolve(file), resolve(args.dir))) {
      console.error(`${file} is inside the capture folder; write the output elsewhere (the theme, or a separate folder).`);
      process.exit(2);
    }
  }

  const { byWidth, widths } = loadCapture(args.dir);
  const wide = byWidth[widths[widths.length - 1]];
  const narrow = widths.length > 1 ? byWidth[widths[0]] : null;

  const { palette, ground, ink, report: colorReport } = buildPalette(wide, args.maxColors);
  const fontFamilies = buildFontFamilies(wide);
  const fontSizes = buildFontSizes(byWidth, widths);
  const spacingSizes = buildSpacing(wide, narrow);
  const radius = buildRadius(wide);
  const shadows = buildShadows(wide);
  const layout = buildLayout(wide);
  const { body, elements } = elementStyles(wide, fontSizes, fontFamilies);

  const settings = {
    appearanceTools: true,
    useRootPaddingAwareAlignments: true,
    color: { defaultPalette: false, defaultGradients: false, palette },
    typography: {
      defaultFontSizes: false,
      fluid: fontSizes.some((f) => f.fluid) || undefined,
      fontFamilies,
      fontSizes,
    },
    spacing: { defaultSpacingSizes: false, spacingSizes },
  };
  if (layout) {
    settings.layout = layout;
  }
  if (shadows.length) {
    settings.shadow = { defaultPresets: false, presets: shadows };
  }
  if (Object.keys(radius).length) {
    settings.custom = { radius };
  }

  const slugOf = (hex) => palette.find((p) => p.color === hex)?.slug;
  const styles = {
    color: {
      background: slugOf(ground) ? `var:preset|color|${slugOf(ground)}` : undefined,
      text: slugOf(ink) ? `var:preset|color|${slugOf(ink)}` : undefined,
    },
    typography: body?.typography,
    elements,
  };

  const output = JSON.stringify({ settings, styles }, null, 2);
  if (args.out) {
    writeFileSync(args.out, `${output}\n`);
    console.error(`Wrote ${args.out}`);
  } else {
    console.log(output);
  }

  if (args.darkOut) {
    const darkPalette = buildDarkPalette(wide, palette, colorReport.named);
    if (darkPalette) {
      const variation = {
        $schema: 'https://schemas.wp.org/trunk/theme.json',
        version: 3,
        title: 'Dark',
        settings: { color: { palette: darkPalette } },
      };
      writeFileSync(args.darkOut, `${JSON.stringify(variation, null, 2)}\n`);
      console.error(`Wrote ${args.darkOut}`);
    } else {
      warn('No dark-mode color overrides found; --dark-out not written.');
    }
  }

  if (args.report) {
    const report = {
      colors: colorReport,
      fontSizesByBreakpoint: Object.fromEntries(
        widths.map((w) => {
          const tally = {};
          for (const t of byWidth[w].flatMap((s) => s.type)) {
            tally[t.size] = (tally[t.size] || 0) + textWeight(t);
          }
          return [w, ranked(tally)];
        })
      ),
      spacingByBreakpoint: Object.fromEntries(
        widths.map((w) => [w, ranked(merge(byWidth[w].flatMap((s) => [s.spacing.padding, s.spacing.margin, s.spacing.gap])))])
      ),
      maxWidth: ranked(merge(wide.map((s) => s.maxWidth))),
      radius: ranked(merge(wide.map((s) => s.radius))),
      customProperties: wide.map((s) => s.customProperties),
    };
    writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
    console.error(`Wrote ${args.report}`);
  }

  for (const message of warnings) {
    console.error(`Warning: ${message}`);
  }
}

main();
