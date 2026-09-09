#!/usr/bin/env node
/** Accelerated campaign replay in real WebGL. Optional, externally supplied Playwright. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { Pilot, runFullCampaign } from '../tests/replay.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = { url: 'http://127.0.0.1:4173/', playwrightDir: process.env.MUSEUM_PLAYWRIGHT_DIR, browser: process.env.MUSEUM_BROWSER, output: resolve(root, 'evidence/rendered-replay.json'), screenshots: false };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--help' || arg === '-h') {
    process.stdout.write('Optional rendered campaign verification:\nnode tools/render-replay.mjs --playwright-dir PATH/TO/playwright --browser PATH/TO/browser [--url http://127.0.0.1:4173/] [--screenshots] [--output report.json]\n\nStarts one fresh hub state, then replays ordinary simulated movement and traced interactions. This is accelerated deterministic rendering, not a human playthrough. Start the museum server first.\n');
    process.exit(0);
  }
  if (arg === '--screenshots') { options.screenshots = true; continue; }
  const key = { '--playwright-dir': 'playwrightDir', '--browser': 'browser', '--url': 'url', '--output': 'output' }[arg];
  if (!key || !process.argv[i + 1]) throw new Error(`Unknown or incomplete option: ${arg}`);
  options[key] = process.argv[++i];
}
if (!options.playwrightDir) throw new Error('Supply external Playwright with --playwright-dir or MUSEUM_PLAYWRIGHT_DIR. No dependencies are installed by this script.');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = ['src/engine.mjs', 'src/campaign.mjs', 'src/render.mjs', 'src/main.mjs', 'tests/replay.mjs'];
const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, sha256(await readFile(resolve(root, path)))])));

// Instrument the established deterministic pilot without replacing its movement,
// interactions, puzzle rules, or restoration. Forward vectors encode its aim;
// no position, room, scale, or up vector is assigned by the resulting replay.
const commands = [];
const originals = Object.fromEntries(['tick', 'approach', 'take', 'use', 'saveRoundtrip'].map(key => [key, Pilot.prototype[key]]));
const clone = value => JSON.parse(JSON.stringify(value));
let lastHints = {};
function recordHints(pilot) {
  for (const [chapter, count] of Object.entries(pilot.state.hints || {})) {
    if ((lastHints[chapter] || 0) < count) commands.push({ op: 'hint', chapter: Number(chapter), count });
  }
  lastHints = { ...pilot.state.hints };
}
function expected(pilot) { return { player: clone(pilot.state.player), held: pilot.state.held, solved: [...pilot.state.solved], finished: !!pilot.state.flags.finished }; }
Pilot.prototype.tick = function(input = {}, dt = 1 / 60) {
  recordHints(this);
  const command = { op: 'tick', f: [...this.state.player.forward], input: { ...input }, dt };
  const before = expected(this), eventIndex = this.state.events.length;
  const result = originals.tick.call(this, input, dt);
  const crossings = this.state.events.slice(eventIndex).filter(event => event.type === 'crossing');
  if (crossings.length) { command.before = before; command.crossings = clone(crossings); command.after = expected(this); }
  commands.push(command);
  return result;
};
Pilot.prototype.approach = function(...args) {
  const result = originals.approach.apply(this, args);
  this.__recordedRay = [...this.state.player.forward];
  return result;
};
Pilot.prototype.take = function(id, ...args) {
  const result = originals.take.call(this, id, ...args);
  commands.push({ op: 'take', id, f: [...this.__recordedRay], after: expected(this) });
  return result;
};
Pilot.prototype.use = function(id, ...args) {
  const result = originals.use.call(this, id, ...args);
  commands.push({ op: 'use', id, f: [...this.__recordedRay], result: result.type, after: expected(this) });
  return result;
};
Pilot.prototype.saveRoundtrip = function(...args) {
  const result = originals.saveRoundtrip.apply(this, args);
  commands.push({ op: 'save-restore', after: expected(this) });
  return result;
};
let simulated;
try { simulated = runFullCampaign(); }
finally { for (const [key, value] of Object.entries(originals)) Pilot.prototype[key] = value; }
assert.equal(simulated.pilot.state.flags.finished, true);
const commandDigest = sha256(JSON.stringify(commands));
process.stdout.write(`Recorded ${commands.length} commands, ${simulated.pilot.ticks} simulation ticks, ${simulated.pilot.crossings.length} crossings.\n`);

const require = createRequire(import.meta.url);
const { chromium } = require(resolve(options.playwrightDir));
const report = {
  format: 1, startedAt: new Date().toISOString(), url: options.url,
  method: 'Accelerated deterministic campaign input replay inside the actual browser and WebGL renderer. One createState(world) at the hub; afterward only ordinary step(input,dt), aim vectors, traced pickup/interact, graduated hints, and genuine serialize/restore. No position, room, scale, up-vector, or puzzle-state assignment after initialization. Main UI is paused through its actual pause dialog, then overlays are hidden for diagnostic screenshots. This is not a full human keyboard playthrough.',
  sampling: 'Render immediately before and after every portal crossing, after interactions and save restoration, and at completion. Screenshot every crossing and newly completed chamber, plus the initial hub. Rendering is sampled, not performed for every accelerated simulation tick.',
  timingMethod: 'Sample timings use performance.now around renderer.render(0) and gl.finish, preceded by gl.finish. They include CPU submission plus GPU completion waiting; they are not a normal-play FPS benchmark. A preceding untimed render advances decorative/gravity display interpolation by accumulated simulated time.',
  environment: { platform: process.platform, osRelease: os.release(), architecture: process.arch, node: process.version, browserExecutable: options.browser || 'Playwright default Chromium', viewport: { width: 1280, height: 800 } },
  sourceHashes, commandStream: { commands: commands.length, sha256: commandDigest, ticks: simulated.pilot.ticks, simulationSeconds: simulated.pilot.ticks / 60, expectedCrossings: simulated.pilot.crossings.length },
  samples: [], pageErrors: [], consoleErrors: [], failedRequests: [], externalRequests: [], environmentRequests: [], failures: [],
};
await mkdir(dirname(resolve(options.output)), { recursive: true });
const screenshotRoot = resolve(dirname(options.output), 'rendered-replay');
if (options.screenshots) await mkdir(screenshotRoot, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: options.browser, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
report.environment.browserVersion = browser.version();
const context = await browser.newContext({ viewport: report.environment.viewport });
const origin = new URL(options.url).origin;
function isEnvironmentRequest(url) { try { return new URL(url).hostname === 'me.kis.v2.scr.kaspersky-labs.com'; } catch { return false; } }
await context.route('**/*', route => {
  const url = route.request().url();
  if (/^https?:/.test(url) && new URL(url).origin !== origin) {
    report.externalRequests.push(url);
    if (isEnvironmentRequest(url)) report.environmentRequests.push({ url, reason: 'Host antivirus injection, blocked and retained separately; not part of the museum source.' });
    return route.abort();
  }
  return route.continue();
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', error => report.pageErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ text: message.text(), ...message.location() }); });
page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
async function persist() { report.updatedAt = new Date().toISOString(); await writeFile(resolve(options.output), JSON.stringify(report, null, 2) + '\n'); }

try {
  await page.goto(options.url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.museum);
  await page.locator('#start-button').click();
  await page.locator('#controls-done').click();
  await page.keyboard.press('Escape');
  await page.locator('#resume').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => window.museum.paused), true);
  await page.addStyleTag({ content: 'body > :not(#world):not(script):not(style) { display: none !important; }' });
  report.environment.graphics = await page.evaluate(async () => {
    const museum = window.museum;
    const campaign = await import('./src/campaign.mjs');
    museum.setState(museum.engine.createState(museum.world));
    campaign.initializeCampaign(museum.state);
    campaign.updateCampaign(museum.state, 0);
    const renderer = museum.renderer, gl = renderer.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const originalRender = renderer.render.bind(renderer);
    window.renderReplay = { campaign, accumulatedTime: 0, frames: 0, maxPasses: 0, budgetViolations: [], crossings: [], solved: [], samples: [], simulationSeconds: 0 };
    renderer.render = dt => {
      originalRender(dt);
      const run = window.renderReplay;
      run.frames++;
      run.maxPasses = Math.max(run.maxPasses, renderer.metrics.passes);
      if (renderer.metrics.passes > 13) run.budgetViolations.push({ room: museum.state.player.room, passes: renderer.metrics.passes });
    };
    return { version: gl.getParameter(gl.VERSION), vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), quality: museum.settings.quality, fieldOfView: museum.settings.fov };
  });

  async function sample(label, screenshot = false, expectedState = null) {
    const sample = await page.evaluate(({ label, expectedState }) => {
      const museum = window.museum, run = window.renderReplay, renderer = museum.renderer, gl = renderer.renderer.getContext();
      if (expectedState) {
        const p = museum.state.player, e = expectedState.player;
        if (p.room !== e.room || Math.abs(p.scale - e.scale) > 1e-9 || p.up.some((v, i) => Math.abs(v - e.up[i]) > 1e-9) || p.p.some((v, i) => Math.abs(v - e.p[i]) > 1e-6)) throw Error(`Replay pose differs at ${label}: ${JSON.stringify({ actual: p, expected: e })}`);
        if (JSON.stringify(museum.state.solved) !== JSON.stringify(expectedState.solved)) throw Error(`Solved state differs at ${label}`);
        if (museum.state.held !== expectedState.held) throw Error(`Carried object differs at ${label}`);
      }
      renderer.render(run.accumulatedTime);
      run.accumulatedTime = 0;
      gl.finish();
      const began = performance.now();
      renderer.render(0);
      gl.finish();
      const milliseconds = performance.now() - began;
      const pixel = new Uint8Array(4), colors = new Set();
      const channelMin = [255, 255, 255], channelMax = [0, 0, 0];
      for (let row = 0; row < 7; row++) for (let column = 0; column < 9; column++) {
        const x = Math.floor((column + .5) * gl.drawingBufferWidth / 9), y = Math.floor((row + .5) * gl.drawingBufferHeight / 7);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        colors.add(`${pixel[0]},${pixel[1]},${pixel[2]}`);
        for (let channel = 0; channel < 3; channel++) { channelMin[channel] = Math.min(channelMin[channel], pixel[channel]); channelMax[channel] = Math.max(channelMax[channel], pixel[channel]); }
      }
      const error = gl.getError();
      if (error !== gl.NO_ERROR) throw Error(`WebGL error ${error} at ${label}`);
      const result = { label, room: museum.state.player.room, player: structuredClone(museum.state.player), held: museum.state.held, solved: [...museum.state.solved], simulationSeconds: run.simulationSeconds, milliseconds, metrics: { ...renderer.metrics }, glError: error, framebuffer: { sampledPixels: 63, distinctColors: colors.size, channelMin, channelMax } };
      run.samples.push(result);
      return result;
    }, { label, expectedState });
    if (screenshot && options.screenshots) {
      sample.screenshot = resolve(screenshotRoot, `${String(report.samples.length).padStart(3, '0')}-${label.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 100)}.png`);
      await page.screenshot({ path: sample.screenshot });
    }
    report.samples.push(sample);
  }
  await sample('initial-hub', true);
  let buffered = [];
  async function execute(batch) {
    if (!batch.length) return;
    await page.evaluate(batch => {
      const museum = window.museum, run = window.renderReplay, engine = museum.engine, campaign = run.campaign;
      for (const command of batch) {
        if (command.op === 'tick') {
          museum.state.player.forward = [...command.f];
          const before = museum.state.events.length;
          engine.step(museum.world, museum.state, command.input, command.dt);
          campaign.updateCampaign(museum.state, command.dt);
          run.accumulatedTime += command.dt;
          run.simulationSeconds += command.dt;
          const crossings = museum.state.events.slice(before).filter(event => event.type === 'crossing');
          run.crossings.push(...crossings);
          if (crossings.length !== (command.crossings?.length || 0)) throw Error(`Unexpected crossing count at ${run.simulationSeconds}: ${JSON.stringify(crossings)}`);
          if (command.crossings && crossings.some((event, i) => event.portal !== command.crossings[i].portal)) throw Error('Portal sequence differed from recorded input');
        } else if (command.op === 'take' || command.op === 'use') {
          museum.state.player.forward = [...command.f];
          const hit = engine.trace(museum.world, museum.state);
          if (hit?.id !== command.id) throw Error(`Expected traced target ${command.id}, received ${JSON.stringify(hit)}`);
          if (command.op === 'take') { if (!engine.pickUp(museum.world, museum.state, command.id)) throw Error(`Failed to take ${command.id}`); }
          else { const result = campaign.interactCampaign(museum.state, command.id); if (result?.type !== command.result) throw Error(`Unexpected interaction result for ${command.id}`); }
          campaign.updateCampaign(museum.state, 0);
        } else if (command.op === 'save-restore') {
          const before = museum.state.player;
          const restored = engine.restore(museum.world, engine.serialize(museum.state));
          if (before.room !== restored.player.room || before.scale !== restored.player.scale || before.p.some((v, i) => Math.abs(v - restored.player.p[i]) > 1e-9) || before.up.some((v, i) => v !== restored.player.up[i]) || before.forward.some((v, i) => Math.abs(v - restored.player.forward[i]) > 1e-9)) throw Error('Save restoration changed the player pose');
          museum.setState(restored);
        } else if (command.op === 'hint') {
          if (campaign.currentChapter(museum.state)?.id !== command.chapter) throw Error('Hint requested in the wrong chapter');
          while ((museum.state.hints[command.chapter] || 0) < command.count) campaign.nextHint(museum.state);
        } else throw Error(`Unknown replay command ${command.op}`);
      }
    }, batch);
  }
  let completed = 0, crossingNumber = 0;
  for (let index = 0; index < commands.length; index++) {
    const command = commands[index];
    if (command.crossings?.length) {
      await execute(buffered); buffered = [];
      crossingNumber++;
      await sample(`cross-${crossingNumber}-before-${command.crossings[0].portal}`, true, command.before);
      await execute([command]);
      await sample(`cross-${crossingNumber}-after-${command.crossings[0].portal}`, true, command.after);
    } else if (['use', 'take', 'save-restore'].includes(command.op)) {
      await execute(buffered); buffered = [];
      await execute([command]);
      const newlyCompleted = command.after.solved.length > completed;
      await sample(newlyCompleted ? `chapter-${command.after.solved.at(-1)}-complete` : `${command.op}-${command.id || index}`, newlyCompleted, command.after);
      if (newlyCompleted) {
        completed = command.after.solved.length;
        process.stdout.write(`Rendered chapter ${completed}/10; ${crossingNumber} crossings.\n`);
        await persist();
      }
    } else {
      buffered.push(command);
      if (buffered.length >= 1000) { await execute(buffered); buffered = []; }
    }
  }
  await execute(buffered);
  await sample('finished-courtyard', true, expected(simulated.pilot));
  report.final = await page.evaluate(() => ({ room: window.museum.state.player.room, solved: [...window.museum.state.solved], finished: window.museum.state.flags.finished, visited: [...window.museum.state.visited], hints: window.museum.state.hints, crossings: window.renderReplay.crossings, renderedFrames: window.renderReplay.frames, maxPasses: window.renderReplay.maxPasses, budgetViolations: window.renderReplay.budgetViolations, gameErrors: window.museum.errors, simulationSeconds: window.renderReplay.simulationSeconds }));
  assert.deepEqual(report.final.solved, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(report.final.finished, true);
  assert.equal(report.final.crossings.length, simulated.pilot.crossings.length);
  assert.deepEqual(report.final.budgetViolations, []);
  assert.deepEqual(report.final.gameErrors, []);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.consoleErrors.filter(error => !isEnvironmentRequest(error.url)), []);
  assert.deepEqual(report.externalRequests.filter(url => !isEnvironmentRequest(url)), []);
  assert.deepEqual(report.failedRequests.filter(request => !isEnvironmentRequest(request.url)), []);
  report.flatCrossingFrames = report.samples.filter(sample => sample.label.startsWith('cross-') && sample.framebuffer.distinctColors === 1).map(sample => ({ label: sample.label, room: sample.room, player: sample.player, metrics: sample.metrics }));
  assert.deepEqual(report.flatCrossingFrames, [], 'An ordinary traversal sample rendered a uniform-color framebuffer');
  report.renderedRooms = [...new Set(report.samples.map(sample => sample.room))];
  assert.deepEqual([...report.renderedRooms].sort(), [...report.final.visited].sort());
  const times = report.samples.map(sample => sample.milliseconds).sort((a, b) => a - b);
  report.sampleTiming = { samples: times.length, medianMs: times[Math.floor(times.length * .5)], p95Ms: times[Math.floor(times.length * .95)], maxMs: times.at(-1), meanMs: times.reduce((sum, value) => sum + value, 0) / times.length };
  const afterHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, sha256(await readFile(resolve(root, path)))])));
  report.sourceHashesAfter = afterHashes;
  report.sourceChangedDuringRun = sourcePaths.filter(path => sourceHashes[path] !== afterHashes[path]);
  assert.deepEqual(report.sourceChangedDuringRun.filter(path => ['src/engine.mjs', 'src/campaign.mjs', 'tests/replay.mjs'].includes(path)), [], 'Simulation sources changed during the run');
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failures.push(error.stack || error.message);
  process.stderr.write(`Rendered replay failed: ${error.stack || error.message}\n`);
  if (options.screenshots) await page.screenshot({ path: resolve(screenshotRoot, 'failure.png') }).catch(() => {});
} finally {
  report.finishedAt = new Date().toISOString();
  await persist();
  await context.close();
  await browser.close();
  process.stdout.write(`${report.passed ? 'PASS' : 'FAIL'} rendered campaign. Report: ${resolve(options.output)}\n`);
  if (!report.passed) process.exitCode = 1;
}
