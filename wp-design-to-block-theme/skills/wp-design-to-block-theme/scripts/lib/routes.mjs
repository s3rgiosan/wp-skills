/**
 * Route helpers shared by capture.mjs and capture-editor.mjs. Both derive a route's folder name the same
 * way, which is how compare.mjs pairs a front-end capture with a design or an editor capture.
 */

import { readFileSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Folder name for a route: `/` → home, `/blog/post-1/` → blog__post-1, `/shop?cat=a` → shop--cat-a.
 * The design and the local capture derive the same name from the same path, which is how compare.mjs pairs them.
 */
export function routeSlug(url) {
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
export function toUrl(value) {
  return /^(https?|file):/i.test(value) ? value : pathToFileURL(resolve(value)).href;
}

/** A --base that is not a URL is a folder of local HTML files. */
export function baseUrl(base) {
  if (/^(https?|file):/i.test(base)) {
    return base;
  }
  return `${pathToFileURL(resolve(base)).href}/`;
}

/** Give each route its own folder: a name already taken gets the first free numeric suffix, with a warning. */
export function uniqueSlugs(routes) {
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
export function isInside(path, folder) {
  const rel = relative(folder, path);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

export function resolveRoutes(args) {
  const urls = args.urls.map(toUrl);
  if (args.routesFile) {
    let base = null;
    if (args.base) {
      base = baseUrl(args.base);
    } else if (urls[0]) {
      // A file URL has no origin; its route paths resolve against its folder.
      base = urls[0].startsWith('file:') ? new URL('.', urls[0]).href : new URL(urls[0]).origin;
    }
    // A capture-editor.mjs routes file works as it is: the "=> editor-url" part is ignored.
    const lines = readFileSync(args.routesFile, 'utf8')
      .split('\n')
      .map((l) => l.replace(/#.*/, '').split('=>')[0].trim())
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
