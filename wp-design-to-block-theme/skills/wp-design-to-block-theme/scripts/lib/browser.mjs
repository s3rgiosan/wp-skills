/**
 * Browser helpers shared by capture.mjs, capture-editor.mjs and compare.mjs. scrollThrough() and settle()
 * take a Playwright page or frame, so they work on a page and on the block editor's canvas iframe alike.
 */

import { createRequire } from 'node:module';

export const PLAYWRIGHT_MISSING =
  'Playwright is not installed. Install it in the current directory first:\n  npm i -D playwright && npx playwright install chromium';

/** Playwright from beside this script, or else from the current working directory. */
async function importPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return createRequire(`${process.cwd()}/`)('playwright');
  }
}

/** Playwright's chromium, or null when Playwright is not installed. */
export async function loadChromium() {
  try {
    const mod = await importPlaywright();
    return mod.chromium;
  } catch {
    return null;
  }
}

/** Scroll through the page so in-view animations and lazy images fire, then return to the top. */
export async function scrollThrough(page) {
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
export async function settle(page) {
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
