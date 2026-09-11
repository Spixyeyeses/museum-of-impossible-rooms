import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {world} from '../src/campaign.mjs';
import {portalTransform} from '../src/engine.mjs';
import {serializeUnityWorld} from '../tools/export-unity-world.mjs';
import {buildUnityFixtures, serializeUnityFixtures, exportUnityFixtures, replaySimulation} from '../tools/export-unity-fixtures.mjs';

const near = (actual, expected, tolerance = .0001) => {
  if (Array.isArray(actual)) {
    assert.equal(actual.length, expected.length);
    actual.forEach((value, index) => near(value, expected[index], tolerance));
  } else assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
};

test('fixtures are deterministic, identify their world and retain unreflected source coordinates', () => {
  const before = JSON.stringify(world), fixture = buildUnityFixtures();
  assert.equal(serializeUnityFixtures(), serializeUnityFixtures());
  assert.equal(fixture.worldContentSha256, JSON.parse(serializeUnityWorld()).contentSha256);
  assert.equal(fixture.coordinates, 'source-room-local');
  const wall = fixture.transforms.find(item => item.id === 'wall6-in');
  assert.deepEqual(wall.points[0], [4.2, 7, -9]);
  assert.deepEqual(fixture.simulations.find(item => item.id === 'wall-look').initialState.player.up, [-1, 0, 0]);
  assert.equal(JSON.stringify(world), before, 'generation must not mutate campaign content');
});

test('transforms preserve reciprocal point and direction mappings at ordinary, quarter and wall scales', () => {
  const fixture = buildUnityFixtures();
  for (const entry of fixture.transforms) {
    const source = world.portals.find(portal => portal.id === entry.sourcePortal);
    const destination = world.portals.find(portal => portal.id === entry.destinationPortal);
    const inverse = portalTransform(destination, source);
    near(entry.expected.scale * inverse.scale, 1, fixture.tolerance.scalar);
    entry.expected.points.forEach((point, index) => near(inverse.point(point), entry.points[index], fixture.tolerance.position));
    entry.expected.directions.forEach((direction, index) => near(inverse.direction(direction), entry.directions[index], fixture.tolerance.direction));
  }
});

test('continuous fixtures actually cross their authored apertures and preserve held scale', () => {
  const cases = new Map(buildUnityFixtures().simulations.map(fixture => [fixture.id, fixture]));
  const ordinary = cases.get('ordinary-continuous-crossing').expected;
  assert.equal(ordinary.player.room, 'c1-gallery');
  assert.deepEqual(ordinary.events.filter(event => event.type === 'crossing').map(event => event.portal), ['c1-east']);
  const returned = cases.get('ordinary-continuous-return').expected;
  assert.equal(returned.player.room, 'c1');
  near(returned.player.p, cases.get('ordinary-continuous-return').initialState.player.p);
  assert.deepEqual(returned.events.filter(event => event.type === 'crossing').map(event => event.portal), ['c1-east', 'c1-gallery-in']);
  const quarter = cases.get('quarter-continuous-held-crossing').expected;
  assert.equal(quarter.player.room, 'c3-cabinet');
  assert.equal(quarter.held, 'weight3');
  near(quarter.player.scale, .25);
  near(quarter.objects.weight3.size, .2);
  assert.equal(quarter.objects.weight3.room, 'c3-cabinet');
  const wall = cases.get('wall-gravity-continuous-crossing').expected;
  assert.equal(wall.player.room, 'c6-record');
  assert.deepEqual(wall.player.up, [0, 1, 0]);
  near(wall.player.p[1], 1.6);
});

test('gravity, collision, look and pickup fixtures exercise their advertised behavior', () => {
  const cases = new Map(buildUnityFixtures().simulations.map(fixture => [fixture.id, fixture]));
  const gravity = cases.get('gravity-change-and-settle');
  assert.deepEqual(gravity.returns, [{actionIndex: 0, value: true}]);
  assert.deepEqual(gravity.expected.player.up, [-1, 0, 0]);
  near(gravity.expected.player.p[0], 4.4);
  const blocked = cases.get('solid-blocks-movement').expected.player;
  assert.equal(blocked.room, 'c1');
  near(blocked.p[2], -2.56);
  for (const id of ['floor-look', 'wall-look']) {
    const fixture = cases.get(id), forward = fixture.expected.player.forward;
    near(Math.hypot(...forward), 1);
    assert.notDeepEqual(forward, fixture.initialState.player.forward);
    assert.deepEqual(fixture.expected.player.up, fixture.initialState.player.up);
  }
  const pickup = cases.get('weight-pickup-drop');
  assert.deepEqual(pickup.returns, [{actionIndex: 0, value: true}, {actionIndex: 1, value: true}]);
  assert.equal(pickup.expected.held, null);
  assert.deepEqual(pickup.expected.events.map(event => event.type), ['pickup', 'drop']);
});

test('fixture replay has isolated state and rejects undefined action operations', () => {
  const fixture = buildUnityFixtures().simulations[0], initial = JSON.stringify(fixture.initialState);
  assert.deepEqual(replaySimulation(fixture).expected, fixture.expected);
  assert.equal(JSON.stringify(fixture.initialState), initial);
  assert.throws(() => replaySimulation({...fixture, actions: [{kind: 'teleport'}]}), /Unknown fixture action/);
  assert.throws(() => replaySimulation({...fixture, actions: [{kind: 'step', frames: -1, dt: 1 / 60}]}), /Invalid step action/);
});

test('export check detects changed reference data without overwriting and repeated generation is stable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'museum-unity-fixtures-'));
  const output = join(directory, 'fixtures.json');
  try {
    await assert.rejects(exportUnityFixtures({output, check: true}), /missing or stale/);
    assert.equal((await exportUnityFixtures({output})).changed, true);
    assert.equal((await exportUnityFixtures({output})).changed, false);
    await exportUnityFixtures({output, check: true});
    await writeFile(output, 'drift');
    await assert.rejects(exportUnityFixtures({output, check: true}), /missing or stale/);
    assert.equal(await readFile(output, 'utf8'), 'drift');
  } finally { await rm(directory, {recursive: true, force: true}); }
});
