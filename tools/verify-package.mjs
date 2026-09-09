#!/usr/bin/env node
/** Optional Windows clean-install check using the exact ZIP and shipped launcher. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = { archive: resolve(root, 'release/Museum-of-Impossible-Rooms.zip'), output: resolve(root, 'release/clean-install-verification.json'), extractTo: resolve(root, 'release', `Clean installation ${Date.now()}`), port: 4183, browserCheck: false, playwrightDir: process.env.MUSEUM_PLAYWRIGHT_DIR, browser: process.env.MUSEUM_BROWSER };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--help' || arg === '-h') {
    process.stdout.write('Windows clean-install verification, after node tools/package.mjs:\nnode tools/verify-package.mjs [--browser-check --playwright-dir PATH --browser EXE] [--archive FILE.zip] [--output REPORT.json] [--extract-to NEW_WORKSPACE_FOLDER] [--port 4183] [--prior-checks REPORT.json]\n\nUses Windows Expand-Archive, verifies every manifest entry, launches the extracted Start Museum.cmd from the system temp directory, and checks local assets. Browser verification is optional and externally supplied. --prior-checks may reuse a previous successful browser check only if every runtime/test/tool digest is identical.\n');
    process.exit(0);
  }
  if (arg === '--browser-check') { options.browserCheck = true; continue; }
  const key = { '--archive': 'archive', '--output': 'output', '--extract-to': 'extractTo', '--port': 'port', '--playwright-dir': 'playwrightDir', '--browser': 'browser', '--prior-checks': 'priorChecks' }[arg];
  if (!key || !process.argv[i + 1]) throw new Error(`Unknown or incomplete option: ${arg}`);
  options[key] = key === 'port' ? Number(process.argv[++i]) : process.argv[++i];
}
if (process.platform !== 'win32') throw new Error('This launcher verification targets Windows. The museum server and packager themselves are portable.');
assert.ok(Number.isInteger(options.port) && options.port > 0 && options.port <= 65535);
options.archive = resolve(options.archive); options.output = resolve(options.output); options.extractTo = resolve(options.extractTo);
assert.ok(options.extractTo.startsWith(root + sep), 'The clean extraction must stay within this workspace');
try { await access(options.extractTo); throw new Error('Choose a new, empty extraction directory.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (options.browserCheck && !options.playwrightDir) throw new Error('--browser-check requires an existing Playwright package path.');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { format: 1, startedAt: new Date().toISOString(), environment: { platform: process.platform, osRelease: os.release(), node: process.version }, archive: options.archive, extractTo: options.extractTo, method: 'Extract the exact stored ZIP with Windows Expand-Archive, verify every manifest file digest, launch its shipped Windows command file from an unrelated working directory, and request local resources. No npm install or project dependencies are used.', checks: [], failures: [] };
await mkdir(dirname(options.output), { recursive: true });
async function persist() { report.updatedAt = new Date().toISOString(); await writeFile(options.output, JSON.stringify(report, null, 2) + '\n'); }
function run(command, args, extra = {}) {
  return new Promise((yes, no) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...extra });
    let stdout = '', stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.once('error', no);
    child.once('close', code => code === 0 ? yes({ stdout, stderr, code }) : no(new Error(`${command} exited ${code}: ${stdout}\n${stderr}`)));
  });
}
let launcher, serverPid;
try {
  const archive = await readFile(options.archive);
  report.archiveBytes = archive.length;
  report.archiveSha256 = sha256(archive);
  const sidecar = (await readFile(options.archive + '.sha256', 'utf8')).trim().split(/\s+/)[0];
  assert.equal(report.archiveSha256, sidecar);
  report.checks.push({ name: 'Archive SHA-256 matches sidecar', passed: true });
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference = "Stop"; Expand-Archive -LiteralPath $env:MUSEUM_CHECK_ARCHIVE -DestinationPath $env:MUSEUM_CHECK_EXTRACT'], { env: { ...process.env, MUSEUM_CHECK_ARCHIVE: options.archive, MUSEUM_CHECK_EXTRACT: options.extractTo } });
  const extractedRoot = join(options.extractTo, 'Museum of Impossible Rooms');
  report.extractedRoot = extractedRoot;
  const manifest = JSON.parse(await readFile(join(extractedRoot, 'package-manifest.json'), 'utf8'));
  assert.equal(manifest.format, 1);
  for (const file of manifest.files) {
    const path = resolve(extractedRoot, file.path);
    assert.ok(path.startsWith(extractedRoot + sep), `Manifest path escaped extraction: ${file.path}`);
    const data = await readFile(path);
    assert.equal(data.length, file.bytes, `File size mismatch: ${file.path}`);
    assert.equal(sha256(data), file.sha256, `File digest mismatch: ${file.path}`);
  }
  report.manifestFilesVerified = manifest.files.length;
  report.runtimeFiles = manifest.files.filter(file => /^(src\/|assets\/|vendor\/|tools\/|tests\/|index\.html$|package\.json$|Start Museum\.cmd$|Start-Museum\.ps1$)/.test(file.path)).map(file => ({ path: file.path, sha256: file.sha256 }));
  report.checks.push({ name: 'Windows extraction and every manifest file digest', passed: true, files: manifest.files.length });
  await persist();

  const url = `http://127.0.0.1:${options.port}/`;
  try { await fetch(url, { signal: AbortSignal.timeout(300) }); throw new Error(`Port ${options.port} was already occupied before clean launch.`); }
  catch (error) { if (!['TypeError', 'TimeoutError'].includes(error.name)) throw error; }
  const commandFile = join(extractedRoot, 'Start Museum.cmd');
  assert.doesNotMatch(commandFile, /["\r\n]/);
  const commandLine = `""${commandFile}" --port ${options.port} --no-open"`;
  launcher = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandLine], { cwd: os.tmpdir(), windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let launcherOutput = '', launcherError;
  launcher.stdout.on('data', chunk => { launcherOutput += chunk; });
  launcher.stderr.on('data', chunk => { launcherOutput += chunk; });
  launcher.on('error', error => { launcherError = error; });
  report.launch = { launcher: commandFile, arguments: ['--port', String(options.port), '--no-open'], workingDirectory: os.tmpdir(), url, hidden: true, pid: launcher.pid };
  const deadline = Date.now() + 15000;
  let ready = false;
  while (Date.now() < deadline) {
    if (launcherError) throw launcherError;
    if (launcher.exitCode !== null) throw new Error(`Shipped launcher exited ${launcher.exitCode}: ${launcherOutput}`);
    try { const response = await fetch(url, { signal: AbortSignal.timeout(500) }); if (response.status === 200) { ready = true; break; } } catch {}
    await new Promise(yes => setTimeout(yes, 100));
  }
  assert.ok(ready, `Shipped launcher did not serve: ${launcherOutput}`);
  report.launch.output = launcherOutput;
  const pidMatch = launcherOutput.match(/Local server PID: (\d+)/);
  assert.ok(pidMatch, 'The launched server must report its own PID for precise cleanup');
  serverPid = Number(pidMatch[1]);
  assert.ok(Number.isInteger(serverPid) && serverPid > 0 && serverPid !== process.pid);
  report.launch.serverPid = serverPid;
  const requested = ['index.html', 'src/main.mjs', 'src/engine.mjs', 'src/campaign.mjs', 'src/render.mjs', 'src/style.css', 'vendor/three.module.js', 'assets/curators-study.png'];
  report.resources = [];
  for (const path of requested) {
    const listed = manifest.files.find(file => file.path === path);
    assert.ok(listed, `Required runtime asset was not found in the manifest: ${path}`);
    const response = await fetch(new URL(path, url));
    assert.equal(response.status, 200, path);
    const data = Buffer.from(await response.arrayBuffer());
    assert.equal(sha256(data), listed.sha256, `HTTP response differs from extracted file: ${path}`);
    report.resources.push({ path, status: response.status, contentType: response.headers.get('content-type'), sha256: sha256(data) });
  }
  report.checks.push({ name: 'Exact shipped Windows launcher starts from unrelated directory and serves local assets', passed: true, resources: report.resources.length });
  await persist();

  if (options.browserCheck) {
    const browserReport = resolve(dirname(options.output), 'clean-install-browser.json');
    const args = [join(extractedRoot, 'tools/browser-verify.mjs'), '--playwright-dir', resolve(options.playwrightDir), '--url', url, '--output', browserReport];
    if (options.browser) args.push('--browser', options.browser);
    const result = await run(process.execPath, args, { cwd: os.tmpdir() });
    const verified = JSON.parse(await readFile(browserReport, 'utf8'));
    assert.equal(verified.failed, 0);
    assert.equal(verified.passed, 17);
    report.browserVerification = { performedOnThisExtraction: true, passed: true, checksPassed: verified.passed, report: browserReport, browserVersion: verified.environment.browserVersion, output: result.stdout, mouse: verified.checks.find(check => check.name.includes('actual mouse movement'))?.details?.mouse };
    report.checks.push({ name: 'Fresh-profile browser checks run from extracted package', passed: true, checks: verified.passed });
  } else if (options.priorChecks) {
    const prior = JSON.parse(await readFile(resolve(options.priorChecks), 'utf8'));
    assert.equal(prior.passed, true);
    assert.equal(prior.browserVerification?.passed, true);
    assert.deepEqual(report.runtimeFiles, prior.runtimeFiles, 'Cannot reuse browser verification after runtime or test-source changes');
    report.browserVerification = { ...prior.browserVerification, performedOnThisExtraction: false, reusedFrom: resolve(options.priorChecks), testedArchiveSha256: prior.archiveSha256, reason: 'Every runtime, asset, bundled dependency, launcher, tool and test digest is identical to the successful candidate extraction. Only non-runtime documents/evidence changed.' };
    report.checks.push({ name: 'Final runtime and test files match the browser-verified candidate', passed: true, runtimeFiles: report.runtimeFiles.length });
  }
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failures.push(error.stack || error.message);
  process.stderr.write(`${error.stack || error.message}\n`);
} finally {
  if (launcher?.pid) {
    try {
      if (serverPid) { try { process.kill(serverPid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
      if (launcher.exitCode === null) launcher.kill();
      launcher.stdout.destroy(); launcher.stderr.destroy(); launcher.unref();
      let remains = false;
      try { await fetch(report.launch.url, { signal: AbortSignal.timeout(700) }); remains = true; } catch {}
      assert.equal(remains, false, 'The clean-install server remained available after precise PID cleanup');
      report.launch.stoppedAfterVerification = true;
      report.launch.cleanupMethod = 'Terminate only the server-reported PID and the directly spawned launcher PID; verify that the local URL stops responding. No process enumeration.';
    } catch (error) { report.failures.push(`Launcher cleanup failed: ${error.message}`); report.passed = false; }
  }
  report.finishedAt = new Date().toISOString();
  await persist();
  process.stdout.write(`${report.passed ? 'PASS' : 'FAIL'} clean installation: ${options.output}\n`);
  if (!report.passed) process.exitCode = 1;
}
