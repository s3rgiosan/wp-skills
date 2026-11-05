#!/usr/bin/env node
/**
 * to-pdf.mjs — print a user guide HTML page to an A4 PDF.
 *
 * Opens the local guide page, loads every image (lazy ones included) and the web fonts, switches to print media in
 * the light theme, and prints with backgrounds. Page breaks come from the page's own print stylesheet (see
 * references/outputs.md). Check every page of the result before sending it.
 *
 * Usage:
 *   node to-pdf.mjs guide.html guide.pdf
 *   node to-pdf.mjs --help
 *
 * Requires Playwright, installed beside this script or in the current working directory:
 *   npm i -D playwright && npx playwright install chromium
 */

import { existsSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const USAGE = 'usage: node to-pdf.mjs guide.html guide.pdf';
const IMAGE_TIMEOUT_MS = 30000;
const FONT_TIMEOUT_MS = 15000;

async function loadChromium() {
	try {
		return (await import('playwright')).chromium;
	} catch {
		try {
			return createRequire(`${process.cwd()}/`)('playwright').chromium;
		} catch {
			return null;
		}
	}
}

// Reports the images that are broken (finished loading with a natural width of 0) and those still loading. SVGs are
// exempt from the width test, so a vector image is never reported broken (Chromium reports 150 for an SVG without
// an intrinsic size).
function inspectImages() {
	const broken = [];
	const pending = [];
	for (const img of document.images) {
		if (!img.complete) {
			pending.push(img.src);
			continue;
		}
		const isSvg = img.src.split(/[?#]/)[0].toLowerCase().endsWith('.svg');
		if (img.naturalWidth === 0 && !isSvg) {
			broken.push(img.src);
		}
	}
	return { broken, pending };
}

async function waitForImages(page) {
	const deadline = Date.now() + IMAGE_TIMEOUT_MS;
	for (;;) {
		const { broken, pending } = await page.evaluate(inspectImages);
		if (broken.length > 0) {
			throw new Error(`${broken.length} image(s) failed to load:\n  ${broken.join('\n  ')}`);
		}
		if (pending.length === 0) {
			return;
		}
		if (Date.now() > deadline) {
			throw new Error(`${pending.length} image(s) did not finish loading:\n  ${pending.join('\n  ')}`);
		}
		await page.waitForTimeout(250);
	}
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
	console.log(`${USAGE}\n\nPrints the guide HTML page to an A4 PDF using its print stylesheet.\n\nExit codes: 0 ok, 2 usage error or failure.`);
	process.exit(0);
}

const unknown = args.find((arg) => arg.startsWith('--'));
if (unknown) {
	console.error(`error: unknown option: ${unknown}\n${USAGE}`);
	process.exit(2);
}

const [src, out] = args;
if (!src || !out) {
	console.error(USAGE);
	process.exit(2);
}

if (!existsSync(src) || !statSync(src).isFile()) {
	console.error(`error: source file not found: ${src}`);
	process.exit(2);
}

const chromium = await loadChromium();
if (!chromium) {
	console.error('Playwright is not installed. Install it in the current directory first:\n  npm i -D playwright && npx playwright install chromium');
	process.exit(2);
}

let browser;
try {
	try {
		browser = await chromium.launch();
	} catch (error) {
		throw new Error(`${error.message}\n  Install the browser with: npx playwright install chromium`);
	}
	const page = await (await browser.newContext()).newPage();
	await page.goto(pathToFileURL(resolve(src)).href, { waitUntil: 'load' });
	await page.emulateMedia({ media: 'print', colorScheme: 'light' });
	const fontsStatus = await page.evaluate(
		(timeout) => {
			document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
				img.loading = 'eager';
			});
			return Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, timeout))]).then(
				() => document.fonts.status
			);
		},
		FONT_TIMEOUT_MS
	);
	if (fontsStatus !== 'loaded') {
		console.warn('warning: fonts not loaded; the PDF uses fallback fonts');
	}
	await waitForImages(page);
	const outPath = resolve(out);
	mkdirSync(dirname(outPath), { recursive: true });
	await page.pdf({
		path: outPath,
		format: 'A4',
		printBackground: true,
		margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
	});
	console.log(`ok   ${out}`);
} catch (error) {
	console.error(`error: ${error.message}`);
	process.exitCode = 2;
} finally {
	if (browser) {
		await browser.close();
	}
}
