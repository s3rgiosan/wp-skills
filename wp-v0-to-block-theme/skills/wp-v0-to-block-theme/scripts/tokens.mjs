#!/usr/bin/env node
/**
 * tokens.mjs — map Tailwind design tokens to a theme.json `settings` fragment.
 *
 * Usage:
 *   node tokens.mjs <tailwind.config.{js,cjs,mjs} | globals.css> [--css globals.css] [--out FILE] [--dark-out FILE] [--no-pretty]
 *
 * Supports:
 *   - Tailwind v4 CSS: `@theme { ... }` / `@theme inline { ... }` blocks of --color- / --font- / --text- /
 *     --spacing- / --radius- / --shadow- vars. `var()` references (shadcn's `--color-background: var(--background)`)
 *     are resolved against the file's `:root` block; `.dark` values feed an optional dark style variation.
 *   - Tailwind v3 config: theme / theme.extend objects (colors, fontFamily, fontSize, spacing, borderRadius,
 *     boxShadow), loaded via dynamic import (.js/.cjs/.mjs). Pass `--css globals.css` to resolve shadcn's
 *     `hsl(var(--primary))` values against that file's `:root` / `.dark`. TypeScript configs are not imported —
 *     point at the compiled JS or at the v4 CSS instead.
 *
 * Output: JSON with a top-level `settings` key, ready to merge into theme.json. With --dark-out, also a
 * `styles/dark.json` style variation holding the `.dark` palette.
 * This is a first pass — review against references/tokens-mapping.md (rename slugs, drop unused, add fluid type).
 *
 * No network, no side effects beyond writing --out / --dark-out (or stdout).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { extname, resolve } from 'node:path';

const HELP = `tokens.mjs — Tailwind tokens → theme.json settings

Usage:
  node tokens.mjs <tailwind.config.{js,cjs,mjs} | globals.css> [--css globals.css] [--out FILE] [--dark-out FILE] [--no-pretty]

Emits a { "settings": { ... } } fragment to stdout (or --out).
  --css FILE       v3 only: resolve var() in config values against this CSS file's :root / .dark.
  --dark-out FILE  write the .dark palette as a theme.json style variation (e.g. styles/dark.json).
  --no-pretty      compact JSON.
Tailwind v4 @theme CSS and v3 JS config are supported; TS configs are not (use compiled JS or the v4 CSS).`;

function parseArgs(argv) {
  const args = { input: null, out: null, darkOut: null, css: null, pretty: true };
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
      case '--css':
        args.css = argv[++i];
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

const titleCase = (slug) =>
  String(slug)
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/* ------------------------------------------------------------------ CSS parsing */

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Return the top-level declarations of every block whose selector prelude `classify` marks 'read', at any
 * nesting depth (e.g. `:root` inside `@layer base`). Blocks nested inside a read block (`@keyframes` inside
 * `@theme`, `@media` inside `:root`), and blocks marked 'skip', are left out of `bodies`; the ones that
 * declare custom properties are counted in `skipped`, so callers can warn about them.
 */
function blockBodies(css, classify) {
  const openRe = /([^{};]*)\{/g;
  const bodies = [];
  let skipped = 0;
  let m;
  while ((m = openRe.exec(css)) !== null) {
    const kind = classify(m[1].trim());
    if (kind !== 'read' && kind !== 'skip') {
      continue;
    }
    let depth = 1;
    let body = '';
    let nested = '';
    let i = openRe.lastIndex;
    for (; i < css.length && depth > 0; i++) {
      const ch = css[i];
      if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 1) {
          skipped += /--[a-z0-9_-]+\s*:/i.test(nested) ? 1 : 0;
          nested = '';
        }
      } else if (depth === 1) {
        body += ch;
      } else {
        nested += ch;
      }
    }
    if (kind === 'read') {
      bodies.push(body);
    } else if (/--[a-z0-9_-]+\s*:/i.test(body)) {
      skipped++;
    }
    openRe.lastIndex = i;
  }
  return { bodies, skipped };
}

const selectorList = (prelude) => prelude.split(',').map((part) => part.trim());

function parseVars(body) {
  const vars = {};
  const varRe = /--([a-z0-9_-]+)\s*:\s*([^;]+)/gi;
  let m;
  while ((m = varRe.exec(body)) !== null) {
    vars[m[1].toLowerCase()] = m[2].trim();
  }
  return vars;
}

/**
 * Collect the `@theme`, `:root`, and `.dark` custom properties of a stylesheet. A block counts when its
 * selector list contains `:root` / `.dark` exactly (`:root, :host` and `.dark, [data-theme=dark]` do).
 * Conditional forms (`:root:has(…)`, `.dark .card`) and nested blocks with custom properties are not read;
 * `skipped` counts them.
 */
function cssScopes(rawCss) {
  const css = stripComments(rawCss);
  // `:root:has(…)` is a conditional form of `:root`; `:root-x` or `.dark-mode` are different selectors.
  const isConditional = (sel, name) => sel.startsWith(name) && sel !== name && !/^[\w-]/.test(sel.slice(name.length));
  const scope = (name) =>
    blockBodies(css, (prelude) => {
      const selectors = selectorList(prelude);
      if (selectors.includes(name)) {
        return 'read';
      }
      return selectors.some((sel) => isConditional(sel, name)) ? 'skip' : null;
    });
  const theme = blockBodies(css, (prelude) => (/^@theme\b/.test(prelude) ? 'read' : null));
  const root = scope(':root');
  const dark = scope('.dark');
  const merge = (result) => Object.assign({}, ...result.bodies.map(parseVars));
  return {
    hasTheme: theme.bodies.length > 0,
    theme: merge(theme),
    root: merge(root),
    dark: merge(dark),
    skipped: theme.skipped + root.skipped + dark.skipped,
  };
}

const VAR_RE = /var\(\s*--([a-z0-9_-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/gi;

/**
 * Replace `var(--x)` references using `lookup`, following chains a few levels deep.
 * Returns the resolved string and the names that could not be resolved.
 */
function resolveVars(value, lookup) {
  const unresolved = new Set();
  let current = value;
  for (let depth = 0; depth < 8; depth++) {
    const next = current.replace(VAR_RE, (match, name, fallback) => {
      const found = lookup(name.toLowerCase());
      if (found !== undefined) {
        return found;
      }
      if (fallback !== undefined) {
        return fallback.trim();
      }
      unresolved.add(name);
      return match;
    });
    if (next === current) {
      break;
    }
    current = next;
  }
  return { value: current, unresolved: [...unresolved] };
}

/** Build light and dark resolvers over parsed CSS scopes. */
function makeResolvers(scopes) {
  const light = (name) => scopes.root[name] ?? scopes.theme[name];
  const dark = (name) => scopes.dark[name] ?? light(name);
  return { light, dark };
}

/* ------------------------------------------------------------------ Shared output */

function createCollector() {
  return {
    palette: [],
    darkPalette: [],
    darkOverrides: 0,
    fontFamilies: [],
    fontSizes: [],
    spacingSizes: [],
    shadows: [],
    radius: {},
    warnings: new Set(),
  };
}

function toSettings(c) {
  const settings = {};
  if (c.palette.length) {
    settings.color = { palette: c.palette };
  }
  const typography = {};
  if (c.fontFamilies.length) {
    typography.fontFamilies = c.fontFamilies;
  }
  if (c.fontSizes.length) {
    typography.fontSizes = c.fontSizes;
  }
  if (Object.keys(typography).length) {
    settings.typography = typography;
  }
  if (c.spacingSizes.length) {
    settings.spacing = { spacingSizes: c.spacingSizes };
  }
  if (c.shadows.length) {
    settings.shadow = { presets: c.shadows };
  }
  if (Object.keys(c.radius).length) {
    settings.custom = { radius: c.radius };
  }
  return settings;
}

function warnUnresolved(c, token, unresolved) {
  for (const name of unresolved) {
    if (token.startsWith('font-')) {
      c.warnings.add(
        `--${token}: var(--${name}) is not defined in this file (next/font sets it at runtime). Replace it with the real family stack and bundle the font via fontFace.`
      );
    } else {
      c.warnings.add(`--${token}: var(--${name}) could not be resolved; fill in the value by hand.`);
    }
  }
}

/* ------------------------------------------------------------------ Color conversion */

// OKLab → linear sRGB, via LMS and XYZ D65 (CSS Color 4 reference matrices).
const OKLAB_TO_LMS = [
  [1.0, 0.3963377773761749, 0.2158037573099136],
  [1.0, -0.1055613458156586, -0.0638541728258133],
  [1.0, -0.0894841775298119, -1.2914855480194092],
];
const LMS_TO_XYZ = [
  [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
  [-0.0405757452148008, 1.112286829280103, -0.0717110580655164],
  [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];
const XYZ_TO_LINEAR_SRGB = [
  [12831 / 3959, -329 / 214, -1974 / 3959],
  [-851781 / 878810, 1648619 / 878810, 36519 / 878810],
  [705 / 12673, -2585 / 12673, 705 / 667],
];
const GAMUT_EPSILON = 0.0005;

const multiply = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

function oklabToSrgb(lab) {
  const lms = multiply(OKLAB_TO_LMS, lab).map((x) => x ** 3);
  const linear = multiply(XYZ_TO_LINEAR_SRGB, multiply(LMS_TO_XYZ, lms));
  return linear.map((x) => {
    const abs = Math.abs(x);
    const encoded = abs <= 0.0031308 ? 12.92 * abs : 1.055 * abs ** (1 / 2.4) - 0.055;
    return Math.sign(x) * encoded;
  });
}

const inGamut = (rgb) => rgb.every((x) => x >= -GAMUT_EPSILON && x <= 1 + GAMUT_EPSILON);

/** Parse a CSS number or percentage; `percentScale` is the value that 100% maps to. */
function parseChannel(token, percentScale) {
  if (token === 'none') {
    return 0;
  }
  if (token.endsWith('%')) {
    return (parseFloat(token) / 100) * percentScale;
  }
  return parseFloat(token);
}

/**
 * Parse `oklch()` / `oklab()` into OKLab channels plus alpha. Returns null for any other value, including
 * relative color syntax (`oklch(from …)`) and values that still hold `var()`.
 */
function parseOklab(value) {
  const match = /^(oklch|oklab)\(\s*([^()]+?)\s*\)$/i.exec(value.trim());
  if (!match || /\bfrom\b|var\(/i.test(match[2])) {
    return null;
  }
  const [channels, alphaToken] = match[2].split('/').map((part) => part.trim());
  const parts = channels.split(/\s+/);
  if (parts.length !== 3) {
    return null;
  }
  const alpha = alphaToken ? parseChannel(alphaToken, 1) : 1;
  const lightness = parseChannel(parts[0], 1);
  if (match[1].toLowerCase() === 'oklab') {
    return { lab: [lightness, parseChannel(parts[1], 0.4), parseChannel(parts[2], 0.4)], alpha };
  }
  const chroma = parseChannel(parts[1], 0.4);
  const hue = ((parseFloat(parts[2]) || 0) * Math.PI) / 180;
  return { lab: [lightness, chroma * Math.cos(hue), chroma * Math.sin(hue)], alpha };
}

const toHexByte = (x) =>
  Math.round(Math.min(1, Math.max(0, x)) * 255)
    .toString(16)
    .padStart(2, '0');

/**
 * Convert an `oklch()` / `oklab()` palette value to sRGB hex; other values pass through unchanged. The block
 * editor's contrast checker parses colors with colord, which cannot read OKLCH and flags every OKLCH pairing
 * as low contrast.
 */
function toPaletteColor(c, token, value) {
  const parsed = parseOklab(value);
  if (!parsed) {
    if (/^(oklch|oklab|lab|lch|color)\(/i.test(value.trim())) {
      c.warnings.add(
        `--${token}: ${value} cannot be read by the editor's contrast checker. Replace it with a hex value.`
      );
    }
    return value;
  }
  const rgb = oklabToSrgb(parsed.lab);
  if (!inGamut(rgb)) {
    c.warnings.add(
      `--${token}: ${value} is outside sRGB; each channel was clipped, as browsers render it on sRGB screens. Check it against the design.`
    );
  }
  const alpha = parsed.alpha < 1 ? toHexByte(parsed.alpha) : '';
  return `#${rgb.map(toHexByte).join('')}${alpha}`;
}

/**
 * Add a color to the light palette and to the dark palette. A style variation's palette replaces the base
 * palette as a whole, so the dark palette lists every color, with `.dark` values where they differ.
 * OKLCH / OKLab values are written as hex so the editor's contrast checker can read them.
 */
function addColor(c, slug, raw, resolvers) {
  const token = `color-${slug}`;
  const resolved = resolvers ? resolveVars(raw, resolvers.light) : { value: raw, unresolved: [] };
  warnUnresolved(c, token, resolved.unresolved);
  const light = toPaletteColor(c, token, resolved.value);
  c.palette.push({ slug, color: light, name: titleCase(slug) });
  if (resolvers) {
    const dark = toPaletteColor(c, token, resolveVars(raw, resolvers.dark).value);
    c.darkPalette.push({ slug, color: dark, name: titleCase(slug) });
    if (dark !== light) {
      c.darkOverrides++;
    }
  }
}

/* ------------------------------------------------------------------ Tailwind v4 CSS */

function warnSkipped(c, scopes) {
  if (scopes.skipped) {
    c.warnings.add(
      `${scopes.skipped} conditional or nested block(s) (e.g. :root:has(…), @media inside :root) were not read. Carry any token values they set over by hand.`
    );
  }
}

function collectFromCss(rawCss) {
  const scopes = cssScopes(rawCss);
  const resolvers = makeResolvers(scopes);
  const c = createCollector();
  warnSkipped(c, scopes);
  // Without an @theme block, treat every custom property in the file as a token.
  const tokens = scopes.hasTheme ? scopes.theme : parseVars(stripComments(rawCss));

  for (const [name, raw] of Object.entries(tokens)) {
    // `--text-xl--line-height` and friends are sub-properties of a token, not tokens.
    if (name.includes('--') || raw === 'initial') {
      continue;
    }
    const resolved = () => {
      const r = resolveVars(raw, resolvers.light);
      warnUnresolved(c, name, r.unresolved);
      return r.value;
    };

    if (name === 'spacing') {
      c.warnings.add(
        `--spacing base unit is ${resolved()}: utilities like gap-8 are N × this value and have no var of their own. Derive the steps the design uses by hand.`
      );
    } else if (name.startsWith('color-')) {
      addColor(c, name.slice('color-'.length), raw, resolvers);
    } else if (name.startsWith('font-weight-')) {
      continue;
    } else if (name.startsWith('font-')) {
      const slug = name.slice('font-'.length);
      c.fontFamilies.push({ slug, fontFamily: resolved(), name: titleCase(slug) });
    } else if (name.startsWith('text-')) {
      const slug = name.slice('text-'.length);
      c.fontSizes.push({ slug, size: resolved(), name: titleCase(slug) });
    } else if (name.startsWith('spacing-')) {
      const slug = name.slice('spacing-'.length);
      c.spacingSizes.push({ slug, size: resolved(), name: titleCase(slug) });
    } else if (name.startsWith('radius-')) {
      c.radius[name.slice('radius-'.length)] = resolved();
    } else if (name.startsWith('shadow-')) {
      const slug = name.slice('shadow-'.length);
      c.shadows.push({ slug, shadow: resolved(), name: titleCase(slug) });
    }
  }
  return c;
}

/* ------------------------------------------------------------------ Tailwind v3 config */

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

/** Tailwind fontSize values may be a string or [size, {lineHeight}] tuple. */
function fontSizeValue(val) {
  if (Array.isArray(val)) {
    return typeof val[0] === 'string' ? val[0] : '';
  }
  return typeof val === 'string' ? val : '';
}

/** Token groups that may be function-valued in a v3 config (e.g. `colors: ({ colors }) => ({...})`). */
const FUNCTION_UNSAFE_GROUPS = ['colors', 'fontFamily', 'fontSize', 'spacing', 'borderRadius', 'boxShadow'];

function collectFromTailwindTheme(theme, cssText) {
  const merged = { ...(theme || {}), ...((theme && theme.extend) || {}) };
  const scopes = cssText ? cssScopes(cssText) : null;
  const resolvers = scopes ? makeResolvers(scopes) : null;
  const c = createCollector();
  if (scopes) {
    warnSkipped(c, scopes);
  }
  const resolved = (token, raw) => {
    if (!resolvers) {
      if (/var\(/.test(raw)) {
        c.warnings.add(`${token}: "${raw}" references a CSS var; pass --css globals.css to resolve it.`);
      }
      return raw;
    }
    const r = resolveVars(raw, resolvers.light);
    warnUnresolved(c, token, r.unresolved);
    return r.value;
  };
  const group = (key) => (merged[key] && typeof merged[key] === 'object' ? merged[key] : null);

  for (const key of FUNCTION_UNSAFE_GROUPS) {
    if (typeof merged[key] === 'function') {
      c.warnings.add(
        `theme.${key} is a function; function-valued Tailwind config can't be statically read. Point at the Tailwind v4 @theme CSS or a resolved config instead.`
      );
    }
  }

  for (const [slug, raw] of Object.entries(flattenColors(group('colors')))) {
    if (raw.trim() === '') {
      continue;
    }
    if (!resolvers && /var\(/.test(raw)) {
      c.warnings.add(`color ${slug}: "${raw}" references a CSS var; pass --css globals.css to resolve it.`);
    }
    addColor(c, slug, raw.trim(), resolvers);
  }
  for (const [slug, val] of Object.entries(group('fontFamily') || {})) {
    const stack = Array.isArray(val) ? val.join(', ') : String(val);
    c.fontFamilies.push({ slug, fontFamily: resolved(`font-${slug}`, stack), name: titleCase(slug) });
  }
  for (const [slug, val] of Object.entries(group('fontSize') || {})) {
    const size = fontSizeValue(val);
    if (size !== '') {
      c.fontSizes.push({ slug, size, name: titleCase(slug) });
    }
  }
  for (const [slug, size] of Object.entries(group('spacing') || {})) {
    if (typeof size === 'string') {
      c.spacingSizes.push({ slug, size, name: titleCase(slug) });
    }
  }
  for (const [slug, val] of Object.entries(group('borderRadius') || {})) {
    c.radius[slug] = resolved(`radius-${slug}`, String(val));
  }
  for (const [slug, val] of Object.entries(group('boxShadow') || {})) {
    c.shadows.push({ slug, shadow: resolved(`shadow-${slug}`, String(val)), name: titleCase(slug) });
  }
  return c;
}

async function loadTailwindConfig(file) {
  const url = pathToFileURL(resolve(file)).href;
  const mod = await import(url);
  const config = mod.default ?? mod;
  return config.theme ?? config;
}

/* ------------------------------------------------------------------ Main */

function darkVariation(darkPalette) {
  return {
    $schema: 'https://schemas.wp.org/trunk/theme.json',
    version: 3,
    title: 'Dark',
    settings: { color: { palette: darkPalette } },
  };
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
  let collected;

  switch (ext) {
    case '.css':
      collected = collectFromCss(readFileSync(args.input, 'utf8'));
      break;
    case '.js':
    case '.cjs':
    case '.mjs': {
      const theme = await loadTailwindConfig(args.input);
      const cssText = args.css ? readFileSync(args.css, 'utf8') : null;
      collected = collectFromTailwindTheme(theme, cssText);
      break;
    }
    case '.ts':
      console.error(
        'TypeScript configs are not imported. Point at the compiled JS config or the Tailwind v4 CSS (@theme).'
      );
      process.exit(1);
      break;
    default:
      console.error(`Unrecognized input: ${args.input} (expected .css or .js/.cjs/.mjs)`);
      process.exit(1);
  }

  const stringify = (data) => (args.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)) + '\n';
  const json = stringify({ settings: toSettings(collected) });

  if (args.out) {
    writeFileSync(args.out, json);
    console.error(`Wrote ${args.out}`);
  } else {
    process.stdout.write(json);
  }

  if (args.darkOut && !collected.darkOverrides) {
    const reason = ['.js', '.cjs', '.mjs'].includes(ext) && !args.css
      ? 'a v3 config needs --css globals.css to read the .dark values'
      : 'no .dark value differs from :root';
    console.error(`Note: ${args.darkOut} was not written: ${reason}.`);
  } else if (collected.darkOverrides) {
    if (args.darkOut) {
      writeFileSync(args.darkOut, stringify(darkVariation(collected.darkPalette)));
      console.error(`Wrote ${args.darkOut} (${collected.darkOverrides} colors differ in .dark)`);
    } else {
      console.error(
        `Note: .dark overrides ${collected.darkOverrides} colors. Pass --dark-out styles/dark.json to write the style variation.`
      );
    }
  }

  for (const warning of collected.warnings) {
    console.error(`Warning: ${warning}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
