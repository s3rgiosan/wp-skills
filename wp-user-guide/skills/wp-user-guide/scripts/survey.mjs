#!/usr/bin/env node
/**
 * survey.mjs — record what a role sees on each admin screen a WordPress user guide covers.
 *
 * Logs in as the role the guide is written for and opens each screen. The script saves no content. Opening a
 * new-item screen (post-new.php) makes WordPress create an auto-draft that it cleans up later; the skill's
 * cleanup step deletes them. Opening an existing item's editor (post.php) makes WordPress set its edit lock
 * (the _edit_lock post meta) on that item. Writes <out>/survey.json with:
 *   - menu         the admin menu and submenu labels that role sees, with their URLs
 *   - screens[]    per screen: the admin screen id ("screenId", the window.pagenow value, null when absent),
 *                  the page title, the screen kind ("block" for the post editor, "classic", "site-editor",
 *                  "block-widgets"), and any admin notices. A "block" screen adds the starter-pattern
 *                  modal a new item opens with and its patterns, the sidebar panels with their control
 *                  labels, the blocks a new item starts with, the template lock and the meta boxes; a
 *                  "classic" screen adds its heading, form fields and meta boxes with their field labels;
 *                  "site-editor" and "block-widgets" add the heading only. A select lists its options in
 *                  its field label. A classic screen that renders its fields with JavaScript after load
 *                  is read again once the network is idle and carries "app": true. A screen that fails
 *                  to load has an "error" field (and no screenId), and a post editor screen whose
 *                  editor never loads has a "warning" field
 * The survey is the checklist for the guide: every panel and field it lists is a step the guide explains or
 * deliberately leaves out.
 *
 * Run `node survey.mjs --help` for the options, the screens file format and the exit codes.
 *
 * Requires Playwright, installed beside this script or in the current working directory:
 *   npm i -D playwright && npx playwright install chromium
 */

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HELP = `survey.mjs — record what a role sees on each admin screen

Usage:
  node survey.mjs --screens FILE --base URL [--out DIR] [--user NAME --password PASS] [--timeout 60000]
  A flag value can also be written --flag=value; a value that starts with "--" is accepted only in that form.

  --screens FILE  one admin path per line (# comments and blank lines are ignored), e.g.
                    /wp-admin/post-new.php
                    /wp-admin/post-new.php?post_type=page
                    /wp-admin/edit-tags.php?taxonomy=category
                    /wp-admin/upload.php?item=101
                  A path is joined to --base, so a site in a subdirectory (https://example.test/wp) works.
                  A path with a query parameter action or action2 whose value starts with trash, delete,
                  dodelete, untrash, spam, unspam, activate, deactivate, approve, unapprove, logout, lock or
                  unlock (also when percent-encoded), or a query parameter delete_all or delete_all2 (Empty Trash,
                  Empty Spam), or wp-login.php?action=logout, is rejected.
  --base URL      site root starting with http:// or https://, e.g. https://example.test
  --out DIR       output directory (default: ./guide-survey); survey.json is written there
  --user, --password
                  login for the role the guide is written for. The environment variables WP_USER and
                  WP_PASSWORD are preferable: --password is visible in the process list.
  --timeout MS    per-action timeout (default 60000); also the wait for each login step and for the block
                  editor on post.php and post-new.php screens that carry the block-editor-page body class
  -h, --help      print this help; with it present no other option is checked

The script saves no content. Opening a new-item screen creates an auto-draft that WordPress cleans up; the
skill's cleanup step deletes them. Opening an existing item's editor sets WordPress's edit lock (the
_edit_lock post meta) on that item. The session lives in memory only. HTTPS certificate errors are ignored
because local sites use self-signed certificates.

A screen fails (printed as FAIL, recorded with an "error" field) on:
  - an HTTP status of 400 or more ("HTTP 404")
  - a redirect to wp-login.php
  - a wp_die screen ("wp_die screen: <text>")
  - for a path under /wp-admin/, a redirect to another screen ("redirected to <path>"); front-end paths may
    redirect freely
  - any other error opening or reading the screen, such as a navigation timeout
A post.php or post-new.php screen with the block-editor-page body class whose editor does not load within
--timeout is recorded as classic with a "warning" field.

survey.json screens[] "kind" values and fields:
  - "block"         post.php or post-new.php with the block editor
  - "classic"       any screen without the block-editor-page body class, and a post editor that never loads
  - "site-editor"   site-editor.php: recorded at once with its heading, no editor wait, no warning
  - "block-widgets" widgets.php with the block widgets editor: same as "site-editor"
  - "screenId"      window.pagenow (the id sections.json "screens" keys use), null when absent
A select is written "Label [select: Opt A | Opt B]" (option text, empty options skipped), or "Label [select: N
options]" with more than 30 options. A role=combobox is written the same way only when its options are in
the DOM; otherwise it keeps its element kind.
A classic screen whose first field collection finds no fields may be a JavaScript app (a plugin's single-page
admin) that renders its controls after load. The script then waits for the network to go idle (capped at
--timeout, a timeout is ignored) plus 1.5 s and collects again. When the second pass finds fields the first did
not, the screen is recorded with "app": true and the fields of the second pass.
A login that fails (wrong password, no navigation within --timeout, or an end outside /wp-admin/ with the url
it reached in the message) is a fatal error.

Exit codes: 0 all screens surveyed, 1 at least one screen failed, 2 bad usage or a fatal error.
`;

const VALUE_FLAGS = ['screens', 'base', 'out', 'user', 'password', 'timeout'];
const NUMBER_FLAGS = ['timeout'];

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

/**
 * Visible label text of every form control inside ROOT. Runs in the page: Playwright sends the function source
 * over the DevTools protocol, so it must not use anything from this module.
 */
function collectFields(root) {
	const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
	const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
	const fields = [];
	for (const control of root.querySelectorAll('input, select, textarea, button[aria-expanded], [role="combobox"]')) {
		// Submit, reset and image inputs are form actions, not fields.
		const skippedInput = control.tagName === 'INPUT' && ['hidden', 'submit', 'reset', 'image'].includes(control.type);
		if (!visible(control) || skippedInput) continue;
		// A button element (a panel toggle, for example) or a button input (a media picker) is recorded only when a label names it.
		const isButton = control.tagName === 'BUTTON' || (control.tagName === 'INPUT' && control.type === 'button');
		const labelFor = (value) => value && text(root.ownerDocument.querySelector(`label[for="${CSS.escape(value)}"]`));
		const label =
			labelFor(control.id) ||
			// Some field libraries point the label at the field name, not the control's id.
			labelFor(control.name?.replace(/\[.*$/, '')) ||
			control.getAttribute('aria-label') ||
			text(control.closest('label')) ||
			control.getAttribute('placeholder') ||
			text(control.closest('.components-base-control, tr, .form-field, .fm-item, p')?.querySelector('label, th, .components-base-control__label'));
		let kind = control.tagName.toLowerCase() === 'input' ? control.type : control.tagName.toLowerCase();
		// A select, or a combobox whose options are in the DOM, lists its options (a count when there are many).
		let optionNodes = [];
		if (control.tagName === 'SELECT') {
			optionNodes = [...control.options];
		} else if (control.getAttribute('role') === 'combobox') {
			const list = root.ownerDocument.getElementById(control.getAttribute('aria-controls') ?? '');
			optionNodes = list ? [...list.querySelectorAll('[role="option"]')] : [];
		}
		const optionTexts = optionNodes.map(text).filter(Boolean);
		if (optionTexts.length) kind = optionTexts.length > 30 ? `select: ${optionTexts.length} options` : `select: ${optionTexts.join(' | ')}`;
		// An unlabelled control that is not a button is recorded under the nearest legend or heading, or its name.
		const context =
			text(control.closest('fieldset')?.querySelector('legend')) ||
			text(control.closest('.form-field, .postbox, .components-panel__body, section')?.querySelector('h2, h3, h4, legend')) ||
			control.name ||
			'unlabelled';
		if (label) fields.push(`${label} [${kind}]`);
		else if (!isButton) fields.push(`(no label: ${context}) [${kind}]`);
	}
	return [...new Set(fields)];
}

/** Text of the first match of LOCATOR, or an empty string when nothing matches. */
async function textOf(locator) {
	if (!(await locator.count())) return '';
	return clean(await locator.first().textContent());
}

/** Field labels inside the first match of LOCATOR. */
async function fieldsOf(locator) {
	if (!(await locator.count())) return [];
	return locator.first().evaluate(collectFields);
}

async function surveyBlockEditor(page) {
	await page.evaluate(() => {
		window.wp.data.dispatch('core/preferences').set('core/edit-post', 'welcomeGuide', false);
	});
	await page.waitForTimeout(1000);

	// A new item may open the starter-pattern picker a few seconds after the editor is ready.
	if (/\/post-new\.php/.test(page.url())) {
		await page.locator('.components-modal__frame [role="option"]').first().waitFor({ timeout: 8000 }).catch(() => {});
	}

	// A modal on a new item is the starter-pattern picker: record its title and patterns, then close it.
	const startModal = await page.evaluate(() => {
		const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
		const frame = document.querySelector('.components-modal__frame');
		if (!frame) return null;
		const options = [...frame.querySelectorAll('[role="option"], .block-editor-block-patterns-list__item')];
		return {
			title: text(frame.querySelector('.components-modal__header h1, .components-modal__header-heading')),
			patterns: [...new Set(options.map((o) => o.getAttribute('aria-label') || text(o)).filter(Boolean))],
		};
	});
	if (startModal) {
		await page.keyboard.press('Escape');
		await page.waitForTimeout(500);
	}

	// Open the settings sidebar on the item tab and expand every collapsed panel.
	await page.evaluate(() => {
		window.wp.data.dispatch('core/edit-post')?.openGeneralSidebar?.('edit-post/document');
	});
	await page.waitForTimeout(800);
	for (let pass = 0; pass < 3; pass++) {
		const closed = page.locator('.interface-complementary-area .components-panel__body:not(.is-opened) > h2 button');
		const count = await closed.count();
		for (let i = 0; i < count; i++) await closed.nth(0).click({ timeout: 2000 }).catch(() => {});
		await page.waitForTimeout(300);
	}

	// Term lists and other panels load their contents after they open; wait until no spinner is left.
	await page
		.waitForFunction(() => !document.querySelector('.interface-complementary-area .components-spinner'), null, { timeout: 30000 })
		.catch(() => {});

	const sidebar = page.locator('.interface-complementary-area');
	const panelBodies = sidebar.locator('.components-panel__body');
	const panels = [];
	for (let i = 0, count = await panelBodies.count(); i < count; i++) {
		const panel = panelBodies.nth(i);
		panels.push({ title: await textOf(panel.locator(':scope > h2')), fields: await fieldsOf(panel) });
	}

	const rowTexts = await sidebar.locator('.editor-post-panel__row').allTextContents();
	const summary = sidebar.locator('.editor-post-summary, .editor-post-card-panel');

	const metaBoxes = [];
	const boxes = page.locator('.edit-post-meta-boxes-area .postbox:not(.hide-if-js)');
	for (let i = 0, count = await boxes.count(); i < count; i++) {
		const box = boxes.nth(i);
		if (!(await box.isVisible())) continue;
		metaBoxes.push({
			id: (await box.getAttribute('id')) ?? '',
			title: await textOf(box.locator('.hndle, h2')),
			fields: await fieldsOf(box),
		});
	}

	const state = await page.evaluate(() => {
		const select = window.wp.data.select;
		return {
			postType: select('core/editor').getCurrentPostType(),
			templateLock: select('core/block-editor').getSettings().templateLock ?? false,
			blocks: (select('core/block-editor').getBlocks() ?? []).map(function walk(b) {
				return { name: b.name, inner: b.innerBlocks.map(walk) };
			}),
		};
	});

	return {
		kind: 'block',
		startModal,
		postType: state.postType,
		summaryFields: await fieldsOf(summary),
		summaryRows: rowTexts.map(clean),
		panels,
		templateLock: state.templateLock,
		blocks: state.blocks,
		metaBoxes,
	};
}

/** Record for a block-based screen that is not the post editor: its kind and heading, read at once. */
async function surveyOtherEditor(page, kind) {
	return { kind, heading: await textOf(page.locator('.wrap h1, .wp-heading-inline')) };
}

async function surveyClassic(page) {
	const metaBoxes = [];
	const boxes = page.locator('.postbox');
	for (let i = 0, count = await boxes.count(); i < count; i++) {
		const box = boxes.nth(i);
		if (!(await box.isVisible())) continue;
		metaBoxes.push({
			id: (await box.getAttribute('id')) ?? '',
			title: await textOf(box.locator('.hndle, h2')),
			fields: await fieldsOf(box),
		});
	}
	// Term, media, post, profile, Add User and Settings forms; any other screen falls back to every control in .wrap.
	const known = page.locator(
		'#addtag, #edittag, .attachment-details, #post-body-content, form#your-profile, form#createuser, .wrap form[action="options.php"]'
	);
	// Plugin admin apps and some core screens (Privacy) have no .wrap: fall back to the whole admin body.
	const wrap = page.locator('.wrap');
	const form = (await known.count()) ? known : (await wrap.count()) ? wrap : page.locator('#wpbody-content');
	return {
		kind: 'classic',
		heading: await textOf(page.locator('.wrap h1, .wp-heading-inline')),
		formFields: await fieldsOf(form),
		metaBoxes,
	};
}

/** Open one screen and return its survey record. A post editor screen waits up to TIMEOUT for the editor. */
async function surveyScreen(page, base, path, timeout) {
	const url = buildUrl(base, path);
	const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
	await assertLoaded(page, response, url);

	// WordPress adds the block-editor-page body class to every block-based screen it renders: the post editor,
	// the Site Editor and the block widgets screen. Only the post editor is probed and surveyed as a block
	// editor; the others are recorded at once, and a screen without the class is classic.
	const pathname = new URL(page.url()).pathname;
	const hasEditorClass = await page.evaluate(() => document.body.classList.contains('block-editor-page'));
	const isPostEditor = hasEditorClass && /\/(post|post-new)\.php$/.test(pathname);
	const isBlockEditor =
		isPostEditor &&
		(await page
			.waitForFunction(() => window.wp?.data?.select('core/editor')?.getCurrentPostType?.(), null, { timeout })
			.then(() => true)
			.catch(() => false));
	if (isBlockEditor) await page.waitForTimeout(1500);
	let data;
	if (isBlockEditor) {
		data = await surveyBlockEditor(page);
	} else if (hasEditorClass && /\/site-editor\.php$/.test(pathname)) {
		data = await surveyOtherEditor(page, 'site-editor');
	} else if (hasEditorClass && /\/widgets\.php$/.test(pathname)) {
		data = await surveyOtherEditor(page, 'block-widgets');
	} else {
		data = await surveyClassic(page);
		if (!data.formFields.length) {
			// A screen that is a JavaScript app renders its controls after load: wait for the network, then read again.
			await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
			await page.waitForTimeout(1500);
			const second = await surveyClassic(page);
			if (second.formFields.length) {
				data = { ...second, app: true };
			}
		}
	}
	const notices = await page.evaluate(() =>
		[...document.querySelectorAll('.notice, .components-notice')]
			.filter((n) => n.offsetParent)
			.map((n) => n.textContent.replace(/\s+/g, ' ').trim())
			.filter(Boolean)
	);
	const screenId = await page.evaluate(() => window.pagenow ?? null);
	const record = { path, screenId, title: await page.title(), notices, ...data };
	if (isPostEditor && !isBlockEditor) {
		record.warning = `the block editor did not load within ${timeout} ms; recorded as classic`;
	}
	return record;
}

/** Read and validate the screens file; exits 2 on a problem. */
function readScreens(file) {
	let raw;
	try {
		raw = readFileSync(resolve(file), 'utf8');
	} catch (error) {
		return die(`cannot read the screens file: ${oneLine(error)}`);
	}
	const screens = raw
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith('#'));
	if (!screens.length) die(`the screens file ${file} has no screens (only blank lines and # comments)`);
	const unsafe = screens.filter(isUnsafeUrl);
	if (unsafe.length) {
		die(`screens that trash, delete, restore, activate, approve, lock or log out are not allowed:\n  ${unsafe.join('\n  ')}`);
	}
	return screens;
}

async function main() {
	const args = parseArgs(process.argv.slice(2), { out: 'guide-survey', timeout: 60000 });
	if (args.help) {
		process.stdout.write(HELP);
		return 0;
	}
	if (!args.screens || !args.base) usage('--screens and --base are required');
	if (!/^https?:\/\//i.test(args.base)) usage('--base must start with http:// or https://');
	const screens = readScreens(args.screens);
	if (!args.user || !args.password) {
		die('missing credentials: pass --user/--password or set WP_USER/WP_PASSWORD');
	}
	const chromium = await loadChromium();
	if (!chromium) {
		die('Playwright is not installed. Install it in the current directory first: npm i -D playwright && npx playwright install chromium');
	}

	const base = args.base.replace(/\/+$/, '');
	const out = resolve(args.out);
	mkdirSync(out, { recursive: true });

	const browser = await chromium.launch();
	try {
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
		const page = await context.newPage();
		page.setDefaultTimeout(args.timeout);
		page.on('dialog', (dialog) => dialog.accept().catch(() => {}));

		await login(page, base, args.user, args.password, args.timeout);
		// The admin menu is read from a light screen: the dashboard can be slow to load.
		const profileUrl = buildUrl(base, '/wp-admin/profile.php');
		const profile = await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
		await assertLoaded(page, profile, profileUrl);

		const menu = await page.evaluate(() => {
			const text = (el) => (el?.childNodes[0]?.textContent ?? el?.textContent ?? '').replace(/\s+/g, ' ').trim();
			return [...document.querySelectorAll('#adminmenu > li.menu-top')].map((li) => ({
				label: text(li.querySelector('.wp-menu-name')),
				href: li.querySelector('a')?.getAttribute('href'),
				submenu: [...li.querySelectorAll('.wp-submenu a')].map((a) => ({ label: text(a), href: a.getAttribute('href') })),
			}));
		});

		const result = { base, user: args.user, menu, screens: [] };
		let failures = 0;
		for (const path of screens) {
			try {
				const record = await surveyScreen(page, base, path, args.timeout);
				result.screens.push(record);
				console.log(record.warning ? `ok   ${path} (warning: ${record.warning})` : `ok   ${path}`);
			} catch (error) {
				failures++;
				result.screens.push({ path, error: oneLine(error) });
				console.log(`FAIL ${path}: ${oneLine(error)}`);
			}
		}

		writeFileSync(resolve(out, 'survey.json'), JSON.stringify(result, null, 2));
		return failures ? 1 : 0;
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
