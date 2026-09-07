#!/usr/bin/env node
/**
 * tokens.mjs — map Tailwind design tokens to a theme.json `settings` fragment.
 *
 * Usage:
 *   node tokens.mjs <tailwind.config.{js,cjs,mjs} | globals.css> [--out FILE] [--pretty]
 *
 * Supports:
 *   - Tailwind v4 CSS: an `@theme { ... }` block of --color- / --font- / --text- / --spacing- / --radius- vars.
 *   - Tailwind v3 config: theme / theme.extend objects (colors, fontFamily, fontSize, spacing, borderRadius),
 *     loaded via dynamic import (.js/.cjs/.mjs). TypeScript configs are not imported — point at the compiled
 *     JS or at the v4 CSS instead.
 *
 * Output: JSON with a top-level `settings` key, ready to merge into theme.json.
 * This is a first pass — review against references/tokens-mapping.md (rename slugs, drop unused, add fluid type).
 *
 * No network, no side effects beyond writing --out (or stdout).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { extname, resolve } from 'node:path';

function parseArgs(argv) {
  const args = { input: null, out: null, pretty: true };
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
      case '--pretty':
        args.pretty = true;
        break;
      case '--no-pretty':
        args.pretty = false;
        break;
      default:
        if (!args.input && !a.startsWith('-')) {
          args.input = a;
        }
        break;
    }
  }
  return args;
}

const HELP = `tokens.mjs — Tailwind tokens → theme.json settings

Usage:
  node tokens.mjs <tailwind.config.{js,cjs,mjs} | globals.css> [--out FILE] [--pretty|--no-pretty]

Emits a { "settings": { ... } } fragment to stdout (or --out).
Tailwind v4 @theme CSS and v3 JS config are supported; TS configs are not (use compiled JS or the v4 CSS).`;

const titleCase = (slug) =>
  String(slug)
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/** Flatten a nested Tailwind color object to { slug: value } (DEFAULT keeps the parent slug). */
function flattenColors(obj, prefix = '', out = {}) {
  for (const [key, val] of Object.entries(obj || {})) {
    if (val == null) {
      continue;
    }
    const slug = key === 'DEFAULT' ? prefix : prefix ? `${prefix}-${key}` : key;
    if (typeof val === 'string') {
      out[slug] = val;
    } else if (typeof val === 'object') {
      flattenColors(val, slug, out);
    }
  }
  return out;
}

function toPalette(colorMap) {
  return Object.entries(colorMap)
    .filter(([, color]) => typeof color === 'string' && color.trim() !== '')
    .map(([slug, color]) => ({ slug, color: color.trim(), name: titleCase(slug) }));
}

/** Tailwind fontSize values may be a string or [size, {lineHeight}] tuple. */
function fontSizeValue(val) {
  if (Array.isArray(val)) {
    return typeof val[0] === 'string' ? val[0] : '';
  }
  return typeof val === 'string' ? val : '';
}

/** Token groups that may be function-valued in a v3 config (e.g. `colors: ({ colors }) => ({...})`). */
const FUNCTION_UNSAFE_GROUPS = ['colors', 'fontFamily', 'fontSize', 'spacing', 'borderRadius'];

function warnAboutFunctionValuedGroups(merged) {
  for (const group of FUNCTION_UNSAFE_GROUPS) {
    if (typeof merged[group] === 'function') {
      console.error(
        `Warning: theme.${group} is a function; function-valued Tailwind config can't be statically read. Point at the Tailwind v4 @theme CSS or a resolved config instead.`
      );
    }
  }
}

function settingsFromTailwindTheme(theme) {
  const merged = { ...(theme || {}), ...((theme && theme.extend) || {}) };
  const settings = {};

  warnAboutFunctionValuedGroups(merged);

  const colors = typeof merged.colors === 'function' ? {} : flattenColors(merged.colors);
  const palette = toPalette(colors);
  if (palette.length) {
    settings.color = { palette };
  }

  const typography = {};
  if (merged.fontFamily && typeof merged.fontFamily === 'object') {
    const fontFamilies = Object.entries(merged.fontFamily).map(([slug, val]) => ({
      slug,
      fontFamily: Array.isArray(val) ? val.join(', ') : String(val),
      name: titleCase(slug),
    }));
    if (fontFamilies.length) {
      typography.fontFamilies = fontFamilies;
    }
  }
  if (merged.fontSize && typeof merged.fontSize === 'object') {
    const fontSizes = Object.entries(merged.fontSize)
      .map(([slug, val]) => ({ slug, size: fontSizeValue(val), name: titleCase(slug) }))
      .filter((f) => f.size !== '');
    if (fontSizes.length) {
      typography.fontSizes = fontSizes;
    }
  }
  if (Object.keys(typography).length) {
    settings.typography = typography;
  }

  if (merged.spacing && typeof merged.spacing === 'object') {
    const spacingSizes = Object.entries(merged.spacing)
      .filter(([, v]) => typeof v === 'string')
      .map(([slug, size]) => ({ slug, size, name: titleCase(slug) }));
    if (spacingSizes.length) {
      settings.spacing = { spacingSizes };
    }
  }

  if (merged.borderRadius && typeof merged.borderRadius === 'object') {
    settings.custom = { radius: { ...merged.borderRadius } };
  }

  return settings;
}

/** Parse a Tailwind v4 `@theme { --token: value; }` block into a settings fragment. */
function settingsFromCss(css) {
  const themeRe = /@theme[^{]*\{([\s\S]*?)\}/g;
  const bodies = [];
  let themeMatch;
  while ((themeMatch = themeRe.exec(css)) !== null) {
    bodies.push(themeMatch[1]);
  }
  const body = bodies.length ? bodies.join('\n') : css;

  const vars = {};
  const varRe = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = varRe.exec(body)) !== null) {
    vars[m[1].toLowerCase()] = m[2].trim();
  }

  const settings = {};
  const palette = [];
  const fontFamilies = [];
  const fontSizes = [];
  const spacingSizes = [];
  const radius = {};

  for (const [name, value] of Object.entries(vars)) {
    if (name.startsWith('color-')) {
      const slug = name.slice('color-'.length);
      palette.push({ slug, color: value, name: titleCase(slug) });
    } else if (name.startsWith('font-')) {
      const slug = name.slice('font-'.length);
      fontFamilies.push({ slug, fontFamily: value, name: titleCase(slug) });
    } else if (name.startsWith('text-')) {
      const slug = name.slice('text-'.length);
      fontSizes.push({ slug, size: value, name: titleCase(slug) });
    } else if (name.startsWith('spacing-')) {
      const slug = name.slice('spacing-'.length);
      spacingSizes.push({ slug, size: value, name: titleCase(slug) });
    } else if (name.startsWith('radius-')) {
      radius[name.slice('radius-'.length)] = value;
    }
  }

  if (palette.length) {
    settings.color = { palette };
  }
  const typography = {};
  if (fontFamilies.length) {
    typography.fontFamilies = fontFamilies;
  }
  if (fontSizes.length) {
    typography.fontSizes = fontSizes;
  }
  if (Object.keys(typography).length) {
    settings.typography = typography;
  }
  if (spacingSizes.length) {
    settings.spacing = { spacingSizes };
  }
  if (Object.keys(radius).length) {
    settings.custom = { radius };
  }

  return settings;
}

async function loadTailwindConfig(file) {
  const url = pathToFileURL(resolve(file)).href;
  const mod = await import(url);
  const config = mod.default ?? mod;
  return config.theme ?? config;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (!args.input) {
    console.log(HELP);
    process.exit(1);
  }

  const ext = extname(args.input).toLowerCase();
  let settings;

  if (ext === '.css') {
    settings = settingsFromCss(readFileSync(args.input, 'utf8'));
  } else if (['.js', '.cjs', '.mjs'].includes(ext)) {
    const theme = await loadTailwindConfig(args.input);
    settings = settingsFromTailwindTheme(theme);
  } else if (ext === '.ts') {
    console.error(
      'TypeScript configs are not imported. Point at the compiled JS config or the Tailwind v4 CSS (@theme).'
    );
    process.exit(1);
  } else {
    console.error(`Unrecognized input: ${args.input} (expected .css or .js/.cjs/.mjs)`);
    process.exit(1);
  }

  const output = { settings };
  const json = args.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);

  if (args.out) {
    writeFileSync(args.out, json + '\n');
    console.error(`Wrote ${args.out}`);
  } else {
    process.stdout.write(json + '\n');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
