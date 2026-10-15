/**
 * In-page collectors, run with page.evaluate() or frame.evaluate(). Each is self-contained: Playwright
 * serializes the function into the page, so none may reference anything outside its own body.
 */

export const DEFAULT_SELECTORS = [
  'body', 'h1', 'h2', 'h3', 'h4', 'p', 'a', 'button',
  'header', 'nav', 'main', 'section', 'footer',
];
export const CAPTURED_PROPS = [
  'color', 'background-color', 'font-family', 'font-size', 'font-weight',
  'line-height', 'letter-spacing', 'text-transform',
  'margin', 'padding', 'gap', 'border-radius', 'border', 'box-shadow',
  'display', 'flex-direction', 'justify-content', 'align-items',
  'max-width', 'width',
];

export function collectComputed({ selectors, props }) {
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
export function collectSections() {
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
export function collectStyleStats() {
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

export function collectHeaderState() {
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
