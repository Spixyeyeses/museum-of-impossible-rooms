import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {world} from '../src/campaign.mjs';
import {serializeUnityWorld, exportUnityWorld} from '../tools/export-unity-world.mjs';

test('Unity bridge preserves the entire campaign including scale, rotated frames and condition trees', () => {
  const document = JSON.parse(serializeUnityWorld());
  assert.deepEqual(document.world, JSON.parse(JSON.stringify(world)));
  assert.equal(document.world.portals.find(p => p.id === 'quarter-out').height, .9);
  assert.deepEqual(document.world.portals.find(p => p.id === 'wall6-in').up, [-1, 0, 0]);
  assert.deepEqual(document.world.portals.find(p => p.id === 'garden-winter').requires, {not: 'summer'});
  assert.equal(serializeUnityWorld(), serializeUnityWorld());
  const modified = structuredClone(world);
  modified.rooms[0].name += ' revised';
  assert.notEqual(JSON.parse(serializeUnityWorld(modified)).contentSha256, document.contentSha256);
});

test('invalid portal destinations cannot be exported', () => {
  const broken = structuredClone(world);
  broken.portals[0].to = 'missing-destination';
  assert.throws(() => serializeUnityWorld(broken), /Invalid campaign/);
});

test('check detects drift without overwriting, and repeat exports do not rewrite content', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'museum-unity-export-'));
  const output = join(directory, 'world.json');
  try {
    await assert.rejects(exportUnityWorld({output, check: true}), /missing or stale/);
    assert.equal((await exportUnityWorld({output})).changed, true);
    assert.equal((await exportUnityWorld({output})).changed, false);
    await exportUnityWorld({output, check: true});
    await writeFile(output, 'edited');
    await assert.rejects(exportUnityWorld({output, check: true}), /missing or stale/);
    assert.equal(await readFile(output, 'utf8'), 'edited');
  } finally { await rm(directory, {recursive: true, force: true}); }
});
