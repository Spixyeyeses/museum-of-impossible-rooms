import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, basename, sep } from 'node:path';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { startMuseumServer, parseArguments } from '../tools/serve.mjs';
import { crc32, makeZip, createMuseumPackage } from '../tools/package.mjs';

async function removeFixture(root) {
  const resolvedRoot = resolve(root);
  assert.ok(resolvedRoot.startsWith(resolve(tmpdir()) + sep));
  assert.match(basename(resolvedRoot), /^museum (server|package) spaces /);
  await rm(resolvedRoot, { recursive: true, force: true });
}

function rawRequest(url, path, { method = 'GET', headers = {} } = {}) {
  return new Promise((yes, no) => {
    const req = request(new URL(url), { path, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => yes({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', no);
    req.end();
  });
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'museum server spaces '));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Museum test</title>');
  await writeFile(join(root, 'assets', 'a space.mjs'), 'export const ok = true;');
  await writeFile(join(root, '.secret'), 'must not be served');
  const museum = await startMuseumServer({ root, port: 0 });
  t.after(async () => { await museum.close(); await removeFixture(root); });
  return { root, ...museum };
}

test('static launch works from a folder with spaces, including module MIME and query strings', async t => {
  const museum = await fixture(t);
  assert.equal(new URL(museum.url).hostname, '127.0.0.1');
  const index = await rawRequest(museum.url, '/');
  assert.equal(index.status, 200);
  assert.match(index.body, /Museum test/);
  assert.equal(index.headers['content-type'], 'text/html; charset=utf-8');
  const module = await rawRequest(museum.url, '/assets/a%20space.mjs?v=1');
  assert.equal(module.status, 200);
  assert.equal(module.headers['content-type'], 'text/javascript; charset=utf-8');
  assert.equal(module.body, 'export const ok = true;');
  assert.equal(module.headers['x-content-type-options'], 'nosniff');
});

test('HEAD, missing assets, directories, malformed encoding, and unsupported methods respond correctly', async t => {
  const museum = await fixture(t);
  const head = await rawRequest(museum.url, '/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.ok(Number(head.headers['content-length']) > 0);
  assert.equal((await rawRequest(museum.url, '/missing.js')).status, 404);
  assert.equal((await rawRequest(museum.url, '/assets/')).status, 404);
  assert.equal((await rawRequest(museum.url, '/bad%ZZ')).status, 400);
  const post = await rawRequest(museum.url, '/', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
});

test('traversal, hidden files, Windows separators, and non-local Host values are rejected', async t => {
  const museum = await fixture(t);
  for (const path of ['/../index.html', '/%2e%2e/index.html', '/assets/%2E%2e/index.html', '/.secret', '/%2esecret', '/assets%5c..%5cindex.html', '/%00']) {
    assert.equal((await rawRequest(museum.url, path)).status, 403, path);
  }
  assert.equal((await rawRequest(museum.url, '/', { headers: { host: 'remote.example' } })).status, 403);
  await assert.rejects(startMuseumServer({ root: museum.root, host: '0.0.0.0' }), /loopback/);
  await assert.rejects(startMuseumServer({ root: museum.root, port: -1 }), /Port/);
});

test('the requested occupied port fails clearly without silently changing the save origin', async t => {
  const museum = await fixture(t);
  const port = Number(new URL(museum.url).port);
  await assert.rejects(startMuseumServer({ root: museum.root, port }), { code: 'EADDRINUSE' });
});

test('linked directories cannot expose files outside the museum root', async t => {
  const museum = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'museum server spaces outside '));
  t.after(() => removeFixture(outside));
  await writeFile(join(outside, 'private.txt'), 'outside data');
  try { await symlink(outside, join(museum.root, 'assets', 'linked'), 'junction'); }
  catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') { t.skip('OS does not permit creating a test symlink.'); return; }
    throw error;
  }
  assert.equal((await rawRequest(museum.url, '/assets/linked/private.txt')).status, 403);
});

test('actual CLI starts from an unrelated working directory with an explicit root', { timeout: 10000 }, async t => {
  const museum = await fixture(t);
  const script = fileURLToPath(new URL('../tools/serve.mjs', import.meta.url));
  const child = spawn(process.execPath, [script, '--root', museum.root, '--port', '0', '--no-open'], {
    cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }
  });
  let output = '';
  const url = await new Promise((yes, no) => {
    child.on('error', no);
    child.on('exit', code => no(new Error(`CLI exited before serving: ${code}; ${output}`)));
    child.stderr.on('data', chunk => { output += chunk; });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (match) yes(match[0]);
    });
  });
  assert.match((await rawRequest(url, '/')).body, /Museum test/);
  assert.match(output, new RegExp(`Local server PID: ${child.pid}(?:\\r?\\n|$)`));
});

test('CLI flags support stable origin and a separate extracted root', () => {
  assert.deepEqual(parseArguments(['--port', '4180', '--root', 'a folder', '--host', 'localhost', '--no-open']), {
    port: 4180, root: 'a folder', host: 'localhost', open: false,
  });
  assert.equal(parseArguments([]).port, 4173);
  assert.throws(() => parseArguments(['--root']), /requires a value/);
  assert.throws(() => parseArguments(['--unknown']), /Unknown option/);
});

test('ZIP CRC and directory metadata are standards-compatible and deterministic', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const files = [{ name: 'a space.txt', data: Buffer.from('hello') }];
  const zip = makeZip(files);
  assert.deepEqual(zip, makeZip(files));
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const footer = zip.subarray(-22);
  assert.equal(footer.readUInt32LE(0), 0x06054b50);
  assert.equal(footer.readUInt16LE(10), 1);
  const directoryOffset = footer.readUInt32LE(16);
  assert.equal(zip.readUInt32LE(directoryOffset), 0x02014b50);
  const nameLength = zip.readUInt16LE(26);
  assert.equal(zip.subarray(30, 30 + nameLength).toString(), 'Museum of Impossible Rooms/a space.txt');
  assert.equal(zip.subarray(30 + nameLength, directoryOffset).toString(), 'hello');
});

test('portable package includes source and manifest while excluding unshipped artifacts', async t => {
  const root = await mkdtemp(join(tmpdir(), 'museum package spaces '));
  t.after(() => removeFixture(root));
  for (const dir of ['tools', 'src', 'evidence', 'release']) await mkdir(join(root, dir));
  for (const name of ['index.html', 'package.json', 'Start Museum.cmd', 'Start-Museum.ps1', 'tools/serve.mjs', 'src/game.mjs', 'evidence/review.md', 'evidence/large.png', 'release/old.zip', '.secret']) {
    await writeFile(join(root, name), `fixture ${name}`);
  }
  const result = await createMuseumPackage({ root });
  assert.equal(result.files, 8);
  assert.ok(result.bytes > 0);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  const second = await createMuseumPackage({ root });
  assert.equal(second.sha256, result.sha256);
});
