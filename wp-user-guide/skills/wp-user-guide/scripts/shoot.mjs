#!/usr/bin/env node
/**
 * shoot.mjs — annotated admin screenshots for a WordPress user guide.
 *
 * Logs in to a WordPress site as the role the guide is written for, then works through a shot list. Each shot
 * opens a URL (or stays on the current page), runs its steps, draws numbered callouts around the elements a
 * guide step talks about, and saves a PNG cropped to the area that matters. Writes:
 *   - <out>/<id>.png       one image per shot
 *   - <out>/shots.json     base, viewport and scale, then id, file, width, height (CSS pixels) and callout
 *                          labels per shot, plus any failed shot
 *
 * The script saves no content itself: any step that saves content is one the shot list asks for. Opening a
 * new-item screen creates an auto-draft that WordPress cleans up; the skill's cleanup step deletes them.
 * Opening an existing item's editor sets WordPress's edit lock (the _edit_lock post meta) on that item.
 *
 * The shot-list format, the options and the exit codes are documented in HELP below; `node shoot.mjs --help`
 * prints them.
 *
 * Requires Playwright, installed beside this script or in the current working directory:
 *   npm i -D playwright && npx playwright install chromium
 */

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const USAGE = `shoot.mjs — annotated admin screenshots for a WordPress user guide

Usage:
  node shoot.mjs --shots FILE --base URL [--out DIR] [--user NAME --password PASS]
    [--width 1440] [--height 900] [--scale 2] [--only id1,id2] [--timeout 30000]
  A flag value can also be written --flag=value; a value that starts with "--" is accepted only in that form.

  --shots FILE    JSON shot list (format below)
  --base URL      site root starting with http:// or https://, e.g. https://example.test; a site in a
                  subdirectory (https://example.test/wp) works, and a shot url is joined to it
  --out DIR       output directory (default: ./guide-shots)
  --user, --password
                  login for the role the guide is written for. The environment variables WP_USER and
                  WP_PASSWORD are preferable: --password is visible in the process list.
  --width, --height
                  browser viewport in CSS pixels (default 1440 x 900)
  --scale N       device scale factor (default 2, for sharp text); the PNG has scale x the CSS pixels
  --only ids      comma-separated shot ids to run. A listed shot without a url also runs the shots back to
                  the nearest earlier shot that has a url, so it starts on the right page. The results are
                  merged into an existing <out>/shots.json by id: entries of the re-run shots are replaced,
                  the others are kept, in shot-list order. Without --only, shots.json is written fresh.
  --timeout MS    per-action timeout (default 30000); also the wait for each login step and for the block
                  editor
  -h, --help      print this help; with it present no other option is checked

HTTPS certificate errors are ignored because local sites use self-signed certificates. The session lives in
memory only. The script saves no content itself; opening a new-item screen creates an auto-draft that WordPress
cleans up, and the skill's cleanup step deletes it. Opening an existing item's editor sets WordPress's edit
lock (the _edit_lock post meta) on that item.

Native dialogs: beforeunload and alert dialogs are accepted; confirm and prompt dialogs are dismissed, with
"warning: shot <id>: dismissed <type> dialog: <message>" on stderr.

Exit codes: 0 all shots taken, 1 at least one shot failed, 2 bad usage, an invalid shot list or a fatal error.
`;

const FORMAT = `
Shot list (JSON array, at least one shot). Every field but "id" is optional; an unknown key on a shot, step or
callout is an error:
  {
    "id": "event-details",                        file name: lowercase letters, digits and hyphens
                                                  (/^[a-z0-9][a-z0-9-]*$/), unique in the list
    "url": "/wp-admin/post-new.php?post_type=x",  omitted: stay on the page the previous shot left. A url
                                                  with a query parameter action or action2 whose value
                                                  starts with trash, delete, dodelete, untrash, spam,
                                                  unspam, activate, deactivate, approve, unapprove, logout,
                                                  lock or unlock, a query parameter delete_all or
                                                  delete_all2 (Empty Trash, Empty Spam), or
                                                  wp-login.php?action=logout (also when percent-encoded),
                                                  is rejected.
    "editor": true,                               wait for the block editor, close its welcome guide and open
                                                  the settings sidebar; a starter-pattern modal stays open
                                                  (close it with a step)
    "steps": [                                    run in order before the capture; each step has exactly one
                                                  action key
      { "click": "SELECTOR" }, { "click": "SELECTOR", "force": true }, { "hover": "SELECTOR" },
      { "fill": "SELECTOR", "value": "Text" },
      { "press": "Escape" }, { "wait": "SELECTOR" }, { "waitMs": 500 }, { "scroll": "SELECTOR" },
      { "openPanel": "Panel title" },
      { "eval": "js expression run in the page" }
    ],
    "callouts": [ { "selector": "SELECTOR", "label": "1", "badge": "left" } ],
                                                  numbered rings drawn on the image; "badge" places the
                                                  number: "top-left" (default), "top-right", or "left" /
                                                  "right" of the element, for items stacked in a list. Every
                                                  ringed element must lie at least partly inside the
                                                  viewport, else the shot fails (use a taller --height or
                                                  split the shot).
    "clip": "SELECTOR" | "viewport" | "callouts",  crop: the element plus every callout and badge, the whole
                                                  viewport, or the box around all callouts (default
                                                  "callouts", or "viewport" if none). "callouts" needs at
                                                  least one callout.
    "padding": 24                                 number >= 0: space kept around a selector or callouts crop
  }

SELECTOR is any Playwright selector (CSS, text=, role=, :has-text()). Prefix it with "canvas:" to look
inside the block editor's canvas iframe, e.g. "canvas:.wp-block-post-title". The first visible match wins.

openPanel opens the block editor settings-sidebar panel whose title text equals the string. An open panel
stays open; a missing panel fails the shot with: panel "<title>" not found. One panel per step. A fresh user
sees most sidebar panels collapsed and the editor remembers the panels a user opened across runs, so a shot
that needs a panel's contents opens it with openPanel and never assumes its state.

shots.json: top-level "base", "viewport" ({ width, height } in CSS pixels), "scale" (the device scale factor),
"shots" and "failed". Each shot's "width" and "height" are CSS pixels; the PNG is scale times larger.

Warnings (best-effort, not a guarantee): at the start of a run, a step that looks like it saves, deletes or
submits content prints "warning: shot <id>: step may save or delete content: <step>" to stderr. It checks click
selectors and eval code for English and Portuguese words such as publish/publicar, save/guardar,
update/atualizar, submit, trash, delete/eliminar/apagar, remove/remover, schedule/agendar, activate/ativar and
install; press steps for Enter and Control+S / Meta+S; and eval code for .submit(, requestSubmit, fetch(,
method: POST, apiFetch, savePost and editPost. The step still runs, and a step the check misses runs silently.

A shot fails (printed as FAIL, listed under "failed" in shots.json) on:
  - an HTTP status of 400 or more, a redirect to wp-login.php, or a wp_die screen after its url opens
  - for a url under /wp-admin/, a redirect to another screen ("redirected to <path>"); front-end urls may
    redirect freely
  - a block editor that does not load within --timeout ("editor": true)
  - any step error, such as a selector not found within --timeout
  - a callout that is not found or lies outside the viewport
  - a clip that has no box or is empty
  - a url-less shot after any failed shot: "depends on failed shot <id>", until the next shot with a url
A login that fails (wrong password, no navigation within --timeout, or an end outside /wp-admin/ with the url
it reached in the message) is a fatal error.
`;

const HELP = `${USAGE}${FORMAT}`;

const VALUE_FLAGS = ['shots', 'base', 'out', 'user', 'password', 'width', 'height', 'scale', 'only', 'timeout'];
const NUMBER_FLAGS = ['width', 'height', 'scale', 'timeout'];
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const STEP_KEYS = {
	click: ['click', 'force'],
	hover: ['hover'],
	fill: ['fill', 'value'],
	press: ['press'],
	wait: ['wait'],
	waitMs: ['waitMs'],
	scroll: ['scroll'],
	openPanel: ['openPanel'],
	eval: ['eval'],
};
const ACTIONS = Object.keys(STEP_KEYS);
const SHOT_KEYS = ['id', 'url', 'editor', 'steps', 'callouts', 'clip', 'padding'];
const CALLOUT_KEYS = ['selector', 'label', 'badge'];
const BADGES = ['top-left', 'top-right', 'left', 'right'];
// "submit" also covers #submit, [type=submit] and type="submit".
const RISKY_WORDS =
	/publish|publicar|save|guardar|update|atualizar|actualizar|submit|trash|lixo|\bbin\b|delete|eliminar|apagar|remove|remover|schedule|agendar|activate|ativar|install/i;
const RISKY_KEY = /(?:^|\+)(?:enter|numpadenter)$|^(?:control|meta|controlormeta)\+s$/i;
const RISKY_CODE = /\.submit\(|requestSubmit|fetch\(|method\s*:\s*['"]?POST|apiFetch|savePost|editPost/i;
const CANVAS = 'iframe[name="editor-canvas"]';
const OVERLAY_ID = 'wp-user-guide-callouts';

const UNSAFE_URL =
	/[?&]action2?=(?:trash|delete|dodelete|untrash|spam|unspam|activate|deactivate|approve|unapprove|logout|lock|unlock)|[?&]delete_all2?=|wp-login\.php\?action=logout/i;

/** Print a usage error with the help and exit 2. */
function usage(message) {
	console.error(`error: ${message}\n\n${HELP}`);
	process.exit(2);
}

/** Print a one-line error and exit 2. */
function die(message) {
	console.error(`error: ${message}`);
	process.exit(2);
}

function oneLine(error) {
	return String(error?.message ?? error).split('\n')[0];
}

function clean(value) {
	return (value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Parse ARGV into an options object, DEFAULTS filling the flags left out. A flag takes its value as the next
 * argument or after "=" (--width=1200); only the "=" form accepts a value that starts with "--".
 * With --help or -h anywhere, returns { help: true } before any other check.
 */
function parseArgs(argv, defaults) {
	if (argv.includes('--help') || argv.includes('-h')) return { help: true };

	const args = { ...defaults };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const equals = arg.startsWith('--') ? arg.indexOf('=') : -1;
		const flag = equals === -1 ? arg : arg.slice(0, equals);
		const name = flag.startsWith('--') ? flag.slice(2) : '';
		if (!VALUE_FLAGS.includes(name)) usage(`unknown option ${flag}`);

		let value;
		if (equals === -1) {
			value = argv[i + 1];
			i++;
		} else {
			value = arg.slice(equals + 1);
		}
		const missing = value === undefined || value === '' || (equals === -1 && value.startsWith('--'));
		if (missing) usage(`option ${flag} needs a value`);
		args[name] = value;
	}
	for (const name of NUMBER_FLAGS) {
		args[name] = Number(args[name]);
		if (!Number.isFinite(args[name]) || args[name] <= 0) usage(`--${name} must be a positive number`);
	}
	args.user = args.user ?? process.env.WP_USER;
	args.password = args.password ?? process.env.WP_PASSWORD;
	return args;
}

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

/** Whether a path or url would trash, delete, empty the trash or spam, restore, spam, activate, approve, lock or log out. */
function isUnsafeUrl(url) {
	let decoded = url;
	try {
		decoded = decodeURIComponent(url);
	} catch {
		// Keep the raw text when it is not valid percent-encoding.
	}
	return UNSAFE_URL.test(url) || UNSAFE_URL.test(decoded);
}

/** The full url for PATH on BASE, keeping any base subdirectory; an absolute http(s) url is kept as given. */
function buildUrl(base, path) {
	if (/^https?:\/\//i.test(path)) return path;
	return base.replace(/\/+$/, '') + (path.startsWith('/') ? path : `/${path}`);
}

/** A pathname without a trailing slash or index.php, so /wp-admin/ and /wp-admin/index.php are the same screen. */
function screenPath(url) {
	return new URL(url).pathname.replace(/\/index\.php$/, '/').replace(/\/+$/, '');
}

/**
 * Throw when the page just opened is an error: HTTP status 400 or more, the login screen, a wp_die screen, or,
 * for a requested path under /wp-admin/, a redirect to another screen. Front-end urls may redirect freely.
 */
async function assertLoaded(page, response, requestedUrl) {
	const status = response ? response.status() : 0;
	const dieBox = page.locator('#error-page');
	const dieText = (await dieBox.count()) ? clean(await dieBox.first().textContent()).slice(0, 160) : '';
	if (status >= 400) throw new Error(`HTTP ${status}${dieText ? `: ${dieText}` : ''}`);
	if (page.url().includes('wp-login.php')) throw new Error('redirected to wp-login.php (no session or no access)');
	const finalUrl = new URL(page.url());
	const isAdminScreen = /\/wp-admin(\/|$)/.test(new URL(requestedUrl).pathname);
	if (isAdminScreen && screenPath(finalUrl.href) !== screenPath(requestedUrl)) {
		throw new Error(`redirected to ${finalUrl.pathname}${finalUrl.search}`);
	}
	if (await dieBox.count()) throw new Error(`wp_die screen: ${dieText}`);
}

/**
 * Log in, retrying a submit that never navigates; a wrong password fails as soon as the login error shows.
 * Every wait lasts up to TIMEOUT ms. A login that ends outside /wp-admin/ fails naming the url it reached.
 */
async function login(page, base, user, password, timeout) {
	const profileUrl = buildUrl(base, '/wp-admin/profile.php');
	for (let attempt = 1; ; attempt++) {
		await page.goto(`${base}/wp-login.php?redirect_to=${encodeURIComponent(profileUrl)}`, {
			waitUntil: 'domcontentloaded',
		});
		await page.fill('#user_login', user);
		await page.fill('#user_pass', password);
		// Logged in once the page leaves wp-login.php; the admin screen's scripts are not needed. Each wait
		// resolves to a label so the loser of the race cannot reject unhandled.
		const loggedIn = page.waitForURL((url) => !url.pathname.endsWith('/wp-login.php'), { waitUntil: 'commit', timeout }).then(
			() => 'ok',
			() => 'timeout'
		);
		const failed = page
			.locator('#login_error')
			.waitFor({ state: 'visible', timeout })
			.then(
				() => 'error',
				() => 'timeout'
			);
		await page.click('#wp-submit');
		const outcome = await Promise.race([loggedIn, failed]);
		switch (outcome) {
			case 'ok': {
				const landed = new URL(page.url());
				if (!landed.pathname.includes('/wp-admin/')) throw new Error(`login landed outside /wp-admin/: ${landed.href}`);
				return;
			}
			case 'error':
				throw new Error(`login failed: ${clean(await page.locator('#login_error').innerText())}`);
			default:
				if (attempt === 3) throw new Error('login timed out: the submit never navigated');
		}
	}
}

function isText(value) {
	return typeof value === 'string' && value !== '';
}

function isCount(value) {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** The keys of OBJECT that are not in ALLOWED, quoted for a message. */
function unknownKeys(object, allowed) {
	return Object.keys(object)
		.filter((key) => !allowed.includes(key))
		.map((key) => `"${key}"`);
}

/** Every problem in one step, as a phrase that continues "<shot> step #n"; an empty array means the step is valid. */
function stepProblems(step) {
	if (!step || typeof step !== 'object' || Array.isArray(step)) return ['is not an object'];
	const keys = ACTIONS.filter((key) => key in step);
	if (keys.length !== 1) {
		const found = keys.length ? `has ${keys.join(' + ')}` : 'has none';
		return [`needs exactly one action key (${ACTIONS.join(', ')}) but ${found}`];
	}
	const action = keys[0];
	const problems = [];
	const unknown = unknownKeys(step, STEP_KEYS[action]);
	if (unknown.length) problems.push(`has unknown key ${unknown.join(', ')} (allowed: ${STEP_KEYS[action].join(', ')})`);
	switch (action) {
		case 'waitMs':
			if (!isCount(step.waitMs)) problems.push('has a "waitMs" that is not a number >= 0');
			break;
		case 'click':
			if (!isText(step.click)) problems.push('has a "click" that is not a non-empty string');
			if (step.force !== undefined && typeof step.force !== 'boolean') problems.push('has a "force" that is not true or false');
			break;
		case 'fill':
			if (!isText(step.fill)) problems.push('has a "fill" that is not a non-empty string');
			if (step.value !== undefined && typeof step.value !== 'string') problems.push('has a "value" that is not a string');
			break;
		default:
			if (!isText(step[action])) problems.push(`has a "${action}" that is not a non-empty string`);
	}
	return problems;
}

/** Every problem in the shot list, as one line each; an empty array means the list is valid. */
function validateShots(shots) {
	if (!Array.isArray(shots) || !shots.length) return ['the shot list must be a non-empty JSON array'];
	const problems = [];
	const seen = new Map();
	shots.forEach((shot, index) => {
		const name = `shot #${index + 1}`;
		if (!shot || typeof shot !== 'object' || Array.isArray(shot)) {
			problems.push(`${name} is not an object`);
			return;
		}
		if (typeof shot.id !== 'string' || !ID_PATTERN.test(shot.id)) {
			problems.push(`${name} has an invalid id ${JSON.stringify(shot.id)} (use ${ID_PATTERN}: lowercase letters, digits, hyphens)`);
		} else if (seen.has(shot.id)) {
			problems.push(`${name} repeats the id "${shot.id}" of shot #${seen.get(shot.id)}`);
		} else {
			seen.set(shot.id, index + 1);
		}
		const label = typeof shot.id === 'string' ? `${name} "${shot.id}"` : name;
		const unknownShotKeys = unknownKeys(shot, SHOT_KEYS);
		if (unknownShotKeys.length) problems.push(`${label} has unknown key ${unknownShotKeys.join(', ')} (allowed: ${SHOT_KEYS.join(', ')})`);
		if (shot.url !== undefined && !isText(shot.url)) {
			problems.push(`${label} has a url that is not a non-empty string`);
		} else if (shot.url && isUnsafeUrl(shot.url)) {
			problems.push(`${label} has a url that trashes, deletes or restores content: ${shot.url}`);
		}
		if (shot.editor !== undefined && typeof shot.editor !== 'boolean') problems.push(`${label} has "editor" that is not true or false`);
		if (shot.padding !== undefined && !isCount(shot.padding)) problems.push(`${label} has "padding" that is not a number >= 0`);
		if (shot.clip !== undefined && !isText(shot.clip)) problems.push(`${label} has "clip" that is not a non-empty string`);
		if (shot.steps !== undefined && !Array.isArray(shot.steps)) problems.push(`${label} has "steps" that is not an array`);
		(Array.isArray(shot.steps) ? shot.steps : []).forEach((step, stepIndex) => {
			for (const problem of stepProblems(step)) problems.push(`${label} step #${stepIndex + 1} ${problem}`);
		});
		if (shot.callouts !== undefined && !Array.isArray(shot.callouts)) problems.push(`${label} has "callouts" that is not an array`);
		const callouts = Array.isArray(shot.callouts) ? shot.callouts : [];
		if (shot.clip === 'callouts' && !callouts.length) problems.push(`${label}: clip "callouts" needs at least one callout`);
		callouts.forEach((callout, calloutIndex) => {
			const where = `${label} callout #${calloutIndex + 1}`;
			if (!callout || typeof callout !== 'object' || Array.isArray(callout)) {
				problems.push(`${where} is not an object`);
				return;
			}
			const unknownCalloutKeys = unknownKeys(callout, CALLOUT_KEYS);
			if (unknownCalloutKeys.length) problems.push(`${where} has unknown key ${unknownCalloutKeys.join(', ')} (allowed: ${CALLOUT_KEYS.join(', ')})`);
			if (!isText(callout.selector)) problems.push(`${where} has no selector`);
			if (callout.label !== undefined && typeof callout.label !== 'string' && typeof callout.label !== 'number') {
				problems.push(`${where} has a label that is not a string or number`);
			}
			if (callout.badge !== undefined && !BADGES.includes(callout.badge)) {
				problems.push(`${where} has an invalid badge ${JSON.stringify(callout.badge)} (use ${BADGES.join(', ')})`);
			}
		});
	});
	return problems;
}

/** Read and validate the shot list; exits 2 on a problem. */
function readShots(file, only) {
	let shots;
	try {
		shots = JSON.parse(readFileSync(resolve(file), 'utf8'));
	} catch (error) {
		return die(`cannot read the shot list ${file}: ${oneLine(error)}`);
	}
	const problems = validateShots(shots);
	if (only) {
		const ids = new Set(Array.isArray(shots) ? shots.map((s) => s?.id) : []);
		for (const id of only) if (!ids.has(id)) problems.push(`--only names "${id}", which is not in the shot list`);
	}
	if (problems.length) die(`invalid shot list ${file}:\n  ${problems.join('\n  ')}`);
	return shots;
}

/**
 * Flags per shot whether it runs. A wanted shot is captured; a shot without a url that is wanted also pulls in
 * the shots back to the nearest earlier one with a url, which run without a capture.
 */
function planRun(shots, only) {
	const wanted = shots.map((shot) => !only || only.has(shot.id));
	const run = shots.map(() => false);
	let lastUrl = 0;
	let filled = 0;
	shots.forEach((shot, index) => {
		if (shot.url) lastUrl = index;
		if (!wanted[index]) return;
		for (let j = Math.max(lastUrl, filled); j <= index; j++) run[j] = true;
		filled = index + 1;
	});
	return { wanted, run };
}

/** A locator for SELECTOR, resolved inside the editor canvas when it starts with "canvas:". */
function locate(page, selector) {
	if (selector.startsWith('canvas:')) {
		return page.frameLocator(CANVAS).locator(selector.slice('canvas:'.length)).locator('visible=true').first();
	}
	return page.locator(selector).locator('visible=true').first();
}

/**
 * Wait for the block editor, then close the welcome guide. A starter-pattern modal is part of what an editor
 * sees on a new item, so it stays open for the shot list to capture or close.
 */
async function readyEditor(page, timeout) {
	await page.waitForFunction(() => window.wp?.data?.select('core/editor')?.getCurrentPostType?.(), null, { timeout });
	await page.evaluate(() => {
		window.wp.data.dispatch('core/preferences').set('core/edit-post', 'welcomeGuide', false);
		window.wp.data.dispatch('core/edit-post')?.openGeneralSidebar?.('edit-post/document');
	});
	// An editor without an iframe canvas has nothing to wait for here.
	await page
		.frameLocator(CANVAS)
		.locator('body')
		.waitFor({ state: 'attached', timeout: Math.min(timeout, 5000) })
		.catch(() => {});
}

/** Wait for the page's load event and web fonts so the capture shows final text; timeouts are ignored. */
async function settlePage(page, timeout) {
	await page.waitForLoadState('load', { timeout }).catch(() => {});
	await page
		.evaluate((ms) => Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, ms))]), timeout)
		.catch(() => {});
}

/** Whether STEP looks like it saves, deletes or submits content. Best effort: it reads selectors, keys and code. */
function isRiskyStep(step) {
	const action = ACTIONS.find((key) => key in step);
	switch (action) {
		case 'click':
			return RISKY_WORDS.test(step.click);
		case 'press':
			return RISKY_KEY.test(step.press);
		case 'eval':
			return RISKY_WORDS.test(step.eval) || RISKY_CODE.test(step.eval);
		default:
			return false;
	}
}

/** Warn on stderr for each step of SHOT that looks like it saves, deletes or submits content. */
function warnRisky(shot) {
	for (const step of shot.steps ?? []) {
		if (isRiskyStep(step)) {
			console.error(`warning: shot ${shot.id}: step may save or delete content: ${JSON.stringify(step).slice(0, 160)}`);
		}
	}
}

/**
 * Open the settings-sidebar panel titled TITLE when it is closed. React re-renders after each click, so one
 * panel is handled per call.
 */
async function openPanel(page, title) {
	const state = await page.evaluate((wanted) => {
		const panels = document.querySelectorAll('.interface-complementary-area .components-panel__body');
		const panel = [...panels].find((item) => item.querySelector(':scope > h2')?.textContent.trim() === wanted);
		if (!panel) return 'missing';
		if (panel.classList.contains('is-opened')) return 'open';
		panel.querySelector(':scope > h2 button')?.click();
		return 'clicked';
	}, title);
	if (state === 'missing') throw new Error(`panel "${title}" not found`);
	if (state === 'clicked') await page.waitForTimeout(600);
}

async function runStep(page, step, timeout) {
	const action = ACTIONS.find((key) => key in step);
	switch (action) {
		case 'click':
			return locate(page, step.click).click({ timeout, force: !!step.force });
		case 'hover':
			return locate(page, step.hover).hover({ timeout });
		case 'fill':
			return locate(page, step.fill).fill(step.value ?? '', { timeout });
		case 'press':
			return page.keyboard.press(step.press);
		case 'wait':
			return locate(page, step.wait).waitFor({ state: 'visible', timeout });
		case 'waitMs':
			return page.waitForTimeout(step.waitMs);
		case 'scroll':
			return locate(page, step.scroll).scrollIntoViewIfNeeded({ timeout });
		case 'openPanel':
			return openPanel(page, step.openPanel);
		case 'eval':
			return page.evaluate(step.eval);
		default:
			throw new Error(`unknown step ${JSON.stringify(step)}`);
	}
}

const BADGE = 26;
const GAP = 6;

/** Where a callout's badge sits: beside the element for items in a list, on a corner otherwise. */
function badgeRect(box, placement) {
	const middle = box.y + box.height / 2 - BADGE / 2;
	switch (placement) {
		case 'left':
			return { x: box.x - BADGE - GAP, y: middle };
		case 'right':
			return { x: box.x + box.width + GAP, y: middle };
		case 'top-right':
			return { x: box.x + box.width - BADGE / 2, y: box.y - BADGE / 2 };
		default:
			return { x: box.x - BADGE / 2, y: box.y - BADGE / 2 };
	}
}

/** Whether BOX overlaps the viewport at all. */
function touchesViewport(box, viewport) {
	return box.x + box.width > 0 && box.y + box.height > 0 && box.x < viewport.width && box.y < viewport.height;
}

/** Draw a numbered ring around each callout, at viewport coordinates; returns the rings and badges drawn. */
async function drawCallouts(page, callouts, viewport, timeout) {
	// Scroll every target into view first, then measure them all, so no later scroll moves a ring
	// away from its element.
	// Best effort: a block in the editor's template view can fail Playwright's stability wait while still on screen.
	for (const callout of callouts) {
		await locate(page, callout.selector)
			.scrollIntoViewIfNeeded({ timeout: Math.min(timeout, 5000) })
			.catch(() => {});
	}
	await page.waitForTimeout(callouts.length ? 300 : 0);
	const marks = [];
	for (const callout of callouts) {
		const target = locate(page, callout.selector);
		// A target missing from the page is often inside a collapsed panel: the shot needs a step that opens it.
		const box = await target.boundingBox({ timeout }).catch(() => null);
		if (!box) throw new Error(`callout ${callout.selector} not found; add a step that opens its panel, or fix the selector`);
		if (!touchesViewport(box, viewport)) {
			throw new Error(`callout ${callout.selector} lies outside the ${viewport.width}x${viewport.height} viewport; use a taller --height or split the shot`);
		}
		const badge = badgeRect(box, callout.badge);
		marks.push({ ...box, label: String(callout.label ?? marks.length + 1), badge });
	}
	await page.evaluate(
		({ id, marks, size }) => {
			document.getElementById(id)?.remove();
			const layer = document.createElement('div');
			layer.id = id;
			layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
			for (const m of marks) {
				const ring = document.createElement('div');
				ring.style.cssText = `position:absolute;left:${m.x - 2}px;top:${m.y - 2}px;width:${m.width + 4}px;height:${
					m.height + 4
				}px;box-sizing:border-box;border:2px solid #d63638;border-radius:4px`;
				const badge = document.createElement('div');
				badge.textContent = m.label;
				badge.style.cssText = `position:absolute;left:${m.badge.x}px;top:${m.badge.y}px;min-width:${size}px;height:${size}px;padding:0 6px;box-sizing:border-box;border-radius:${
					size / 2
				}px;background:#d63638;color:#fff;font:600 14px/${size}px -apple-system,BlinkMacSystemFont,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff`;
				layer.append(ring, badge);
			}
			document.body.append(layer);
		},
		{ id: OVERLAY_ID, marks, size: BADGE }
	);
	return marks;
}

/** The smallest viewport rectangle holding every box, its badge and PADDING around them. */
function unionBox(boxes, padding, viewport) {
	const rects = boxes.flatMap((b) => (b.badge ? [b, { ...b.badge, width: BADGE, height: BADGE }] : [b]));
	const x1 = Math.max(0, Math.min(...rects.map((r) => r.x)) - padding);
	const y1 = Math.max(0, Math.min(...rects.map((r) => r.y)) - padding);
	const x2 = Math.min(viewport.width, Math.max(...rects.map((r) => r.x + r.width)) + padding);
	const y2 = Math.min(viewport.height, Math.max(...rects.map((r) => r.y + r.height)) + padding);
	return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

async function clipFor(page, shot, boxes, viewport, timeout) {
	const padding = shot.padding ?? 24;
	const clip = shot.clip ?? (boxes.length ? 'callouts' : 'viewport');
	let region;
	switch (clip) {
		case 'viewport':
			return undefined;
		case 'callouts':
			region = unionBox(boxes, padding, viewport);
			break;
		default: {
			const box = await locate(page, clip).boundingBox({ timeout });
			if (!box) throw new Error(`clip ${clip} has no box`);
			region = unionBox([box, ...boxes], padding, viewport);
		}
	}
	if (!(region.width > 0 && region.height > 0)) {
		throw new Error(`clip ${clip} is empty or outside the viewport; use a taller --height or split the shot`);
	}
	return region;
}

/** Run one shot: open its url, run its steps and, for a wanted shot, capture it. Returns the manifest entry. */
async function runShot(page, shot, wanted, args, viewport, out) {
	await page.evaluate((id) => document.getElementById(id)?.remove(), OVERLAY_ID).catch(() => {});
	if (shot.url) {
		const url = buildUrl(args.base, shot.url);
		const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
		await assertLoaded(page, response, url);
	}
	if (shot.editor) await readyEditor(page, args.timeout);
	for (const step of shot.steps ?? []) await runStep(page, step, args.timeout);
	if (!wanted) return null;
	if (!shot.editor) await settlePage(page, args.timeout);
	await page.waitForTimeout(300);
	const boxes = await drawCallouts(page, shot.callouts ?? [], viewport, args.timeout);
	const clip = await clipFor(page, shot, boxes, viewport, args.timeout);
	const file = `${shot.id}.png`;
	await page.screenshot({ path: resolve(out, file), clip });
	const size = clip ?? viewport;
	return {
		id: shot.id,
		file,
		width: Math.round(size.width),
		height: Math.round(size.height),
		callouts: boxes.map((b) => b.label),
	};
}

/**
 * Fold this run's MANIFEST into the shots.json at FILE: entries of the shots this run captured or failed are
 * replaced in both lists, entries of the others are kept, all in shot-list order. Returns MANIFEST alone when FILE
 * is missing, unreadable or not a JSON object.
 */
function mergeManifest(file, manifest, shots, wanted) {
	let previous;
	try {
		previous = JSON.parse(readFileSync(file, 'utf8'));
	} catch {
		return manifest;
	}
	if (!previous || typeof previous !== 'object' || Array.isArray(previous)) return manifest;
	const sameLayout = JSON.stringify([previous.viewport, previous.scale]) === JSON.stringify([manifest.viewport, manifest.scale]);
	if (!sameLayout) {
		console.error(`warning: ${file} was written with another viewport or scale; the kept entries may not match this run's`);
	}
	const order = shots.map((shot) => shot.id);
	const merge = (kept, fresh, replaced) => {
		const entries = (Array.isArray(kept) ? kept : []).filter((entry) => entry && typeof entry.id === 'string' && !replaced.has(entry.id));
		const byId = new Map(entries.map((entry) => [entry.id, entry]));
		for (const entry of fresh) byId.set(entry.id, entry);
		return order.filter((id) => byId.has(id)).map((id) => byId.get(id));
	};
	const captured = shots.filter((shot, index) => wanted[index]).map((shot) => shot.id);
	const failed = manifest.failed.map((entry) => entry.id);
	const replaced = new Set([...captured, ...failed]);
	return {
		...manifest,
		shots: merge(previous.shots, manifest.shots, replaced),
		failed: merge(previous.failed, manifest.failed, replaced),
	};
}

async function main() {
	const args = parseArgs(process.argv.slice(2), { out: 'guide-shots', width: 1440, height: 900, scale: 2, timeout: 30000 });
	if (args.help) {
		process.stdout.write(HELP);
		return 0;
	}
	if (!args.shots || !args.base) usage('--shots and --base are required');
	if (!/^https?:\/\//i.test(args.base)) usage('--base must start with http:// or https://');
	const only = args.only ? new Set(args.only.split(',').map((id) => id.trim())) : null;
	const shots = readShots(args.shots, only);
	const { wanted, run } = planRun(shots, only);
	shots.forEach((shot, index) => {
		if (run[index]) warnRisky(shot);
	});
	if (!args.user || !args.password) {
		die('missing credentials: pass --user/--password or set WP_USER/WP_PASSWORD');
	}
	const chromium = await loadChromium();
	if (!chromium) {
		die('Playwright is not installed. Install it in the current directory first: npm i -D playwright && npx playwright install chromium');
	}

	args.base = args.base.replace(/\/+$/, '');
	const out = resolve(args.out);
	mkdirSync(out, { recursive: true });

	const viewport = { width: args.width, height: args.height };
	const browser = await chromium.launch();
	try {
		const context = await browser.newContext({ viewport, deviceScaleFactor: args.scale, ignoreHTTPSErrors: true });
		const page = await context.newPage();
		page.setDefaultTimeout(args.timeout);
		// "Leave site?" (beforeunload) and alert dialogs are accepted; confirm and prompt dialogs are dismissed and reported.
		let currentId = 'login';
		page.on('dialog', (dialog) => {
			const type = dialog.type();
			switch (type) {
				case 'beforeunload':
				case 'alert':
					dialog.accept().catch(() => {});
					break;
				default:
					console.error(`warning: shot ${currentId}: dismissed ${type} dialog: ${clean(dialog.message())}`);
					dialog.dismiss().catch(() => {});
			}
		});

		await login(page, args.base, args.user, args.password, args.timeout);

		const manifest = { base: args.base, viewport, scale: args.scale, shots: [], failed: [] };
		// The id of the failed shot whose page the following url-less shots would run on.
		let brokenPage = null;
		for (const [index, shot] of shots.entries()) {
			if (!run[index]) continue;
			currentId = shot.id;
			if (shot.url) brokenPage = null;
			if (brokenPage) {
				const error = `depends on failed shot ${brokenPage}`;
				manifest.failed.push({ id: shot.id, error });
				console.log(`FAIL ${shot.id}: ${error}`);
				continue;
			}
			try {
				const entry = await runShot(page, shot, wanted[index], args, viewport, out);
				if (entry) {
					manifest.shots.push(entry);
					console.log(`ok   ${shot.id}`);
				}
			} catch (error) {
				manifest.failed.push({ id: shot.id, error: oneLine(error) });
				console.log(`FAIL ${shot.id}: ${oneLine(error)}`);
				brokenPage = shot.id;
			}
		}

		const file = resolve(out, 'shots.json');
		const result = only ? mergeManifest(file, manifest, shots, wanted) : manifest;
		writeFileSync(file, JSON.stringify(result, null, 2));
		return manifest.failed.length ? 1 : 0;
	} finally {
		await browser.close();
	}
}

main().then(
	(code) => process.exit(code),
	(error) => {
		console.error(`error: ${oneLine(error)}`);
		process.exit(2);
	}
);
