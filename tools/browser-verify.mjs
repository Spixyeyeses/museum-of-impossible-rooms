#!/usr/bin/env node
/** Optional developer verification. Playwright is supplied externally, never needed to play. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = {
  url: 'http://127.0.0.1:4173/',
  playwrightDir: process.env.MUSEUM_PLAYWRIGHT_DIR,
  browser: process.env.MUSEUM_BROWSER,
  output: resolve(root, 'evidence/browser-functional.json'),
  screenshots: false,
};
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--help' || arg === '-h') {
    process.stdout.write('Optional browser verification (not required to play):\nnode tools/browser-verify.mjs --playwright-dir PATH/TO/playwright --browser PATH/TO/browser --url http://127.0.0.1:4173/ [--screenshots] [--output report.json]\n\nStart the local server first. Playwright and the browser are external developer prerequisites.\nMUSEUM_PLAYWRIGHT_DIR and MUSEUM_BROWSER can replace their corresponding options.\n');
    process.exit(0);
  }
  if (arg === '--screenshots') { options.screenshots = true; continue; }
  const key = { '--playwright-dir': 'playwrightDir', '--browser': 'browser', '--url': 'url', '--output': 'output' }[arg];
  if (!key || !process.argv[i + 1]) throw new Error(`Unknown or incomplete option: ${arg}`);
  options[key] = process.argv[++i];
}
if (!options.playwrightDir) throw new Error('Supply --playwright-dir or MUSEUM_PLAYWRIGHT_DIR. This optional check does not install dependencies.');
const require = createRequire(import.meta.url);
const { chromium } = require(resolve(options.playwrightDir));
const report = {
  format: 1, startedAt: new Date().toISOString(), url: options.url,
  environment: { platform: process.platform, release: os.release(), architecture: process.arch, node: process.version, browserExecutable: options.browser || 'Playwright default Chromium', viewport: { width: 1280, height: 800 } },
  scope: 'Real keyboard/button/file UI checks in a fresh isolated headless browser. Diagnostic pose setup and unavailable-WebGL injection are explicitly labeled fixtures. This is not a full ten-chamber human playthrough or an audible listening test.',
  checks: [], pageErrors: [], consoleErrors: [], failedRequests: [], externalRequests: [], environmentRequests: [], screenshots: [],
};
await mkdir(dirname(resolve(options.output)), { recursive: true });
const screenshotRoot = resolve(dirname(options.output), 'browser-functional-screenshots');
if (options.screenshots) await mkdir(screenshotRoot, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: options.browser, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
report.environment.browserVersion = browser.version();
const context = await browser.newContext({ viewport: report.environment.viewport, acceptDownloads: true });
const origin = new URL(options.url).origin;
// This host's antivirus injects a script into browser HTTP responses. Record it
// separately; never suppress other external traffic or change system protection.
function isEnvironmentRequest(url) {
  try { return new URL(url).hostname === 'me.kis.v2.scr.kaspersky-labs.com'; }
  catch { return false; }
}
await context.route('**/*', route => {
  const url = route.request().url();
  if (/^https?:/.test(url) && new URL(url).origin !== origin) {
    report.externalRequests.push(url);
    if (isEnvironmentRequest(url)) report.environmentRequests.push({ url, classification: 'Host antivirus-injected Kaspersky script; external request blocked by the offline test context. Not present in shipped game source.' });
    return route.abort();
  }
  return route.continue();
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.on('pageerror', error => report.pageErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ text: message.text(), ...message.location() }); });
page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));

async function persist() {
  report.finishedAt = new Date().toISOString();
  report.passed = report.checks.filter(check => check.status === 'passed').length;
  report.failed = report.checks.filter(check => check.status === 'failed').length;
  await writeFile(resolve(options.output), JSON.stringify(report, null, 2) + '\n');
}
async function screenshot(name) {
  if (!options.screenshots) return;
  const path = resolve(screenshotRoot, name + '.png');
  await page.screenshot({ path });
  report.screenshots.push(path);
}
async function check(name, kind, run) {
  const began = performance.now();
  try {
    const details = await run();
    report.checks.push({ name, kind, status: 'passed', milliseconds: Math.round(performance.now() - began), ...(details ? { details } : {}) });
    process.stdout.write(`PASS ${name}\n`);
    await persist();
    return true;
  } catch (error) {
    report.checks.push({ name, kind, status: 'failed', milliseconds: Math.round(performance.now() - began), error: error.message });
    process.stdout.write(`FAIL ${name}: ${error.message}\n`);
    await screenshot(`failure-${report.checks.length}`).catch(() => {});
    await persist();
    return false;
  }
}
async function visible(selector) { await page.locator(selector).waitFor({ state: 'visible' }); }
async function playing() { await page.waitForFunction(() => window.museum && !window.museum.paused); }
async function pressUntil(key, predicate, argument, timeout = 15000) {
  await page.keyboard.down(key);
  try { await page.waitForFunction(predicate, argument, { timeout }); }
  finally { await page.keyboard.up(key); }
}
async function pose() { return page.evaluate(() => structuredClone(window.museum.state.player)); }
async function closeDialog() { if (await page.locator('#modal-backdrop').isVisible()) await page.locator('#modal-close').click(); await playing(); }
async function notebookSave() {
  if (await page.locator('#modal-backdrop').isVisible()) await closeDialog();
  await page.keyboard.press('j');
  await visible('#modal-backdrop');
  await page.locator('[data-tab="save"]').click();
}
async function fixturePose(player, extra = {}) {
  await page.evaluate(({ player, extra }) => {
    const museum = window.museum;
    const state = JSON.parse(museum.engine.serialize(museum.state));
    Object.assign(state, extra);
    state.player = { ...state.player, ...player, velocity: [0, 0, 0] };
    museum.setState(museum.engine.restore(museum.world, JSON.stringify(state)));
  }, { player, extra });
}

let exportedSave;
try {
  const initialized = await check('Fresh offline page initializes its 3D renderer and title screen', 'real UI / renderer observation', async () => {
    await page.goto(options.url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.museum || document.querySelector('.fatal'));
    assert.equal(await page.locator('.fatal').count(), 0, 'A fatal graphics message is visible');
    await visible('#start-button');
    assert.match(await page.locator('#start-button').innerText(), /Enter the museum/);
    const graphics = await page.evaluate(() => {
      const gl = window.museum.renderer.renderer.getContext();
      return { version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(gl.RENDERER), passes: window.museum.renderer.metrics.passes };
    });
    assert.match(graphics.version, /WebGL 2/);
    assert.ok(graphics.passes >= 1);
    report.environment.graphics = graphics;
    report.environment.browserScriptSources = await page.locator('script[src]').evaluateAll(scripts => scripts.map(script => script.src));
    await screenshot('01-title');
    return graphics;
  });
  if (!initialized) throw new Error('Cannot continue UI verification without an initialized museum.');

  await check('Comfort preferences work from the title screen', 'real UI', async () => {
    await page.locator('#start-settings').click();
    await visible('#quality');
    await page.locator('#quality').selectOption('low');
    await page.locator('#reduced-motion').check();
    await page.locator('#invert-y').check();
    await page.locator('#volume').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.locator('#fov').focus();
    await page.keyboard.press('End');
    const settings = await page.evaluate(() => ({ ...window.museum.settings }));
    assert.equal(settings.quality, 'low');
    assert.equal(settings.reducedMotion, true);
    assert.equal(settings.invertY, true);
    assert.equal(settings.fov, 95);
    assert.equal(settings.volume, .05);
    await page.locator('#settings-done').click();
    await visible('#start-button');
    assert.equal(await page.locator('#modal-backdrop').isVisible(), false);
    return settings;
  });

  await check('Enter starts onboarding; a user gesture starts local audio', 'real UI', async () => {
    await page.locator('#start-button').click();
    await visible('#controls-done');
    assert.match(await page.locator('#modal-title').innerText(), /visitor’s card/);
    assert.match(await page.locator('#modal-body').innerText(), /W A S D/);
    assert.equal(await page.evaluate(() => window.museum.paused), true);
    await page.locator('#controls-done').click();
    await playing();
    assert.equal(await page.evaluate(() => window.museum.state.flags.onboarded), true);
    const audio = await page.evaluate(() => ({ state: window.museum.audio.ctx?.state, oscillators: window.museum.audio.nodes.length }));
    assert.equal(audio.state, 'running');
    assert.equal(audio.oscillators, 4);
    return { ...audio, listening: 'Not performed: audio initialization and controls only.' };
  });

  await check('W A S D move; arrow keys and actual mouse movement change the view', 'real keyboard and mouse controls', async () => {
    const movements = [];
    for (const [key, axis, sign] of [['w', 2, -1], ['s', 2, 1], ['a', 0, -1], ['d', 0, 1]]) {
      const before = await pose();
      await pressUntil(key, ({ axis, sign, start }) => (window.museum.state.player.p[axis] - start) * sign > .2, { axis, sign, start: before.p[axis] });
      const after = await pose();
      movements.push({ key, distance: (after.p[axis] - before.p[axis]) * sign });
    }
    await pressUntil('ArrowRight', () => window.museum.state.player.forward[0] > .2);
    await pressUntil('ArrowLeft', () => window.museum.state.player.forward[0] < .01);
    await pressUntil('ArrowUp', () => window.museum.state.player.forward[1] > .15);
    await pressUntil('ArrowDown', () => window.museum.state.player.forward[1] < .01);
    await page.mouse.move(640, 400);
    const beforeMouse = (await pose()).forward;
    await page.mouse.down();
    await page.mouse.move(706, 432, { steps: 4 });
    await page.mouse.up();
    await page.waitForFunction(before => window.museum.state.player.forward.some((value, index) => Math.abs(value - before[index]) > .025), beforeMouse);
    const mouse = await page.evaluate(() => ({ pointerLockActive: document.pointerLockElement?.id === 'world', forward: [...window.museum.state.player.forward] }));
    await page.keyboard.press('r');
    await page.waitForFunction(() => window.museum.state.player.p[2] > 14.5);
    return { movements, mouse, mouseMethod: mouse.pointerLockActive ? 'Actual mouse move events with canvas pointer lock active' : 'Actual scene mouse-down/move/up drag fallback; pointer lock unavailable', recovery: await pose() };
  });

  await check('Walk from the entrance and read the curator’s note with E', 'real keyboard route and interaction', async () => {
    await pressUntil('w', () => window.museum.state.player.p[2] < 9.2);
    await page.waitForFunction(() => !document.getElementById('prompt').hidden);
    assert.match(await page.locator('#prompt').innerText(), /To the visitor/);
    await page.keyboard.press('e');
    await visible('#read-done');
    assert.equal(await page.locator('#modal-title').innerText(), 'To the visitor');
    assert.match(await page.locator('#modal-body').innerText(), /Iona Vale/);
    assert.equal(await page.evaluate(() => window.museum.state.journal.some(note => note.id === 'welcome')), true);
    await screenshot('02-curator-note');
    await page.locator('#read-done').click();
    await playing();
  });

  await check('Pause freezes motion and traps keyboard focus inside the dialog', 'real UI / keyboard focus', async () => {
    await page.keyboard.press('Escape');
    await visible('#resume');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'modal-close');
    const before = await pose();
    await page.keyboard.down('w');
    await page.waitForTimeout(250);
    await page.keyboard.up('w');
    assert.deepEqual((await pose()).p, before.p);
    await page.locator('#pause-save').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'modal-close');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'pause-save');
    await page.locator('#resume').click();
    await playing();
  });

  await check('Notebook shows ten exhibitions and the collected curator note', 'real UI', async () => {
    await page.keyboard.press('j');
    await visible('[data-tab="map"]');
    assert.equal(await page.locator('.chapter-entry').count(), 10);
    assert.equal(await page.locator('.chapter-entry.locked').count(), 9);
    await page.locator('[data-tab="notes"]').click();
    await page.locator('summary').filter({ hasText: 'To the visitor' }).click();
    assert.match(await page.locator('.notes-list').innerText(), /Iona Vale/);
    await closeDialog();
  });

  await check('Walk across the court and through exhibition 01’s spatial boundary', 'real keyboard route; no pose fixture', async () => {
    await pressUntil('a', () => window.museum.state.player.p[0] < -6);
    await pressUntil('w', () => window.museum.state.player.p[2] < -11.9, undefined, 25000);
    await pressUntil('a', () => window.museum.state.player.room === 'c1', undefined, 25000);
    assert.equal((await pose()).room, 'c1');
    await page.waitForFunction(() => document.getElementById('room-title').textContent.includes('Two Norths'));
    await screenshot('03-exhibition-01');
    return { arrival: await pose() };
  });

  await check('Three graduated hints persist and stop at the explicit solution', 'real UI', async () => {
    await page.keyboard.press('h');
    await visible('#hint-next');
    const hints = [];
    for (let level = 1; level <= 3; level++) {
      assert.match(await page.locator('#modal-title').innerText(), new RegExp(`Hint ${level} of 3`));
      hints.push(await page.locator('.note-copy').innerText());
      if (level < 3) await page.locator('#hint-next').click();
    }
    assert.equal(new Set(hints).size, 3);
    await page.locator('#hint-next').click();
    assert.match(await page.locator('#modal-title').innerText(), /Hint 3 of 3/);
    assert.equal(await page.evaluate(() => window.museum.state.hints[1]), 3);
    await page.locator('#hint-done').click();
    await playing();
    return { hints };
  });

  await check('F3 exposes a read-only spatial inspector and pauses movement', 'real UI', async () => {
    await page.keyboard.press('F3');
    await visible('#developer');
    assert.match(await page.locator('#developer').innerText(), /Connections/);
    assert.match(await page.locator('#developer').innerText(), /Triggers \/ puzzle states/);
    const before = await pose();
    const beforeState = await page.evaluate(() => window.museum.engine.serialize(window.museum.state));
    await page.keyboard.down('w');
    await page.waitForTimeout(200);
    await page.keyboard.up('w');
    assert.deepEqual((await pose()).p, before.p);
    for (const key of ['e', 'q', 'r', 'h', 'j']) await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => window.museum.engine.serialize(window.museum.state)), beforeState, 'Read-only inspector must suppress interaction, drop, recovery, hint and notebook keys');
    assert.equal(await page.locator('#modal-backdrop').isVisible(), false);
    await screenshot('04-spatial-inspector');
    await page.keyboard.press('F3');
    assert.equal(await page.locator('#developer').isVisible(), false);
    return { suppressedActionKeys: ['E', 'Q', 'R', 'H', 'J'] };
  });

  await check('Export produces a valid save; reload restores pose, hints, notes, and preferences', 'real UI / browser storage / download', async () => {
    await notebookSave();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-save').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'Museum-Visit.json');
    exportedSave = await readFile(await download.path(), 'utf8');
    const saved = JSON.parse(exportedSave);
    assert.equal(saved.version, 1);
    assert.equal(saved.player.room, 'c1');
    assert.equal(saved.hints[1], 3);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.museum);
    assert.match(await page.locator('#start-button').innerText(), /Continue the visit/);
    const restored = await page.evaluate(() => ({ player: window.museum.state.player, hints: window.museum.state.hints, journal: window.museum.state.journal, settings: window.museum.settings }));
    assert.deepEqual(restored.player.p, saved.player.p);
    assert.deepEqual(restored.player.forward, saved.player.forward);
    assert.equal(restored.hints[1], 3);
    assert.ok(restored.journal.some(note => note.id === 'welcome'));
    assert.equal(restored.settings.quality, 'low');
    assert.equal(restored.settings.fov, 95);
    await page.locator('#start-button').click();
    await playing();
    assert.equal(await page.locator('#controls-done').count(), 0);
    return { bytes: Buffer.byteLength(exportedSave), pose: restored.player, settings: restored.settings };
  });

  await check('Malformed imports retain the current visit; a valid exported file restores it', 'real file input UI', async () => {
    assert.ok(exportedSave, 'An export is required for this check');
    await notebookSave();
    const before = await page.evaluate(() => window.museum.engine.serialize(window.museum.state));
    for (const content of ['{broken JSON', '{"version":999,"player":{},"objects":{}}']) {
      await page.locator('#import-save').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from(content) });
      await page.waitForFunction(() => document.getElementById('toast').textContent.startsWith('Could not restore'));
      assert.equal(await page.evaluate(() => window.museum.engine.serialize(window.museum.state)), before);
    }
    await page.locator('#import-save').setInputFiles({ name: 'Museum-Visit.json', mimeType: 'application/json', buffer: Buffer.from(exportedSave) });
    await playing();
    await page.waitForFunction(() => document.getElementById('toast').textContent === 'Your visit is restored.');
    assert.equal((await pose()).room, 'c1');
    assert.equal(await page.evaluate(() => window.museum.state.hints[1]), 3);
  });

  await check('Saving and browser reload preserve quarter scale and a carried transformed weight', 'diagnostic pose fixture; real browser reload/autosave', async () => {
    await fixturePose({ room: 'c3-cabinet', p: [0, .4, 3], forward: [0, 0, -1], up: [0, 1, 0], scale: .25 }, { checkpoint: 'c3', held: 'weight3', heldRatio: .8 });
    await page.waitForFunction(() => window.museum.state.objects.weight3.size === .2);
    await page.keyboard.press('Escape');
    await visible('#resume');
    const before = await pose();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.museum);
    const restored = await page.evaluate(() => ({ player: window.museum.state.player, held: window.museum.state.held, object: window.museum.state.objects.weight3 }));
    assert.equal(restored.player.room, 'c3-cabinet');
    assert.equal(restored.player.scale, .25);
    assert.deepEqual(restored.player.p, before.p);
    assert.equal(restored.held, 'weight3');
    assert.equal(restored.object.size, .2);
    assert.equal(restored.object.room, 'c3-cabinet');
    await page.locator('#start-button').click();
    await playing();
    await screenshot('05-quarter-scale');
    await page.keyboard.press('q');
    await page.waitForFunction(() => window.museum.state.held === null);
    return { ...restored, drop: 'Q released the weight after restoration' };
  });

  await check('Saving and browser reload preserve the wall floor; recovery restores orientation', 'diagnostic gravity pose fixture; real browser reload/autosave/recovery UI', async () => {
    await fixturePose({ room: 'c6', p: [4.4, 5, 2], forward: [0, 0, -1], up: [-1, 0, 0], scale: 1 }, { checkpoint: 'c6', held: null });
    await page.keyboard.press('Escape');
    await visible('#resume');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.museum);
    assert.equal((await pose()).room, 'c6');
    assert.deepEqual((await pose()).up, [-1, 0, 0]);
    await page.locator('#start-button').click();
    await playing();
    await screenshot('06-wall-floor');
    await page.keyboard.press('r');
    await page.waitForFunction(() => window.museum.state.player.up[1] === 1);
    assert.equal((await pose()).scale, 1);
    assert.equal(await page.evaluate(() => window.museum.state.journal.some(note => note.id === 'welcome')), true);
    return { recovery: await pose() };
  });

  await check('Starting a new visit requires confirmation and cancel keeps progress', 'real UI', async () => {
    await notebookSave();
    const before = await page.evaluate(() => window.museum.state.journal.length);
    await page.locator('#new-visit').click();
    await visible('#confirm-new');
    assert.match(await page.locator('#modal-body').innerText(), /replaces the saved visit/);
    await page.locator('#cancel-new').click();
    assert.equal(await page.evaluate(() => window.museum.state.journal.length), before);
    await page.locator('#new-visit').click();
    await page.locator('#confirm-new').click();
    await visible('#controls-done');
    assert.equal((await pose()).room, 'hub');
    assert.equal(await page.evaluate(() => window.museum.state.journal.length), 0);
    assert.equal(await page.evaluate(() => window.museum.state.solved.length), 0);
  });

  await check('Missing WebGL 2 displays practical launch and graphics guidance', 'injected unavailable-WebGL fixture, separate page', async () => {
    const noGraphics = await context.newPage();
    try {
      await noGraphics.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };
      });
      await noGraphics.goto(options.url, { waitUntil: 'networkidle' });
      await noGraphics.locator('.fatal').waitFor({ state: 'visible' });
      const text = await noGraphics.locator('.fatal').innerText();
      assert.match(text, /WebGL 2/);
      assert.match(text, /Start Museum.cmd/);
      return { expectedFailureDisplayed: true, text };
    } finally { await noGraphics.close(); }
  });

  await check('Game has no runtime errors, failed assets, or external network dependencies', 'browser instrumentation; host injection recorded separately', async () => {
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.consoleErrors.filter(error => !isEnvironmentRequest(error.url)), []);
    assert.deepEqual(report.externalRequests.filter(url => !isEnvironmentRequest(url)), []);
    assert.deepEqual(report.failedRequests.filter(request => !isEnvironmentRequest(request.url)), []);
    const errors = await page.evaluate(() => window.museum.errors);
    assert.deepEqual(errors, []);
    if (report.environmentRequests.length) assert.doesNotMatch(await readFile(resolve(root, 'index.html'), 'utf8'), /kaspersky-labs/);
    return { pageErrors: 0, gameConsoleErrors: 0, gameExternalRequests: 0, gameFailedRequests: 0, blockedHostInjectedRequests: report.environmentRequests.length, limitation: report.environmentRequests.length ? 'The host injected antivirus scripts. Those failed requests and their console messages are retained in the report and excluded from game-source checks; no system protection was disabled.' : null };
  });
} catch (error) {
  report.aborted = error.message;
  process.stderr.write(`Verification interrupted: ${error.message}\n`);
} finally {
  await persist();
  await context.close();
  await browser.close();
  process.stdout.write(`\n${report.passed} passed; ${report.failed} failed. Report: ${resolve(options.output)}\n`);
  if (report.failed || report.aborted) process.exitCode = 1;
}
