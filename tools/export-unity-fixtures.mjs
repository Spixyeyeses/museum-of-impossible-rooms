#!/usr/bin/env node
/** Golden engine examples evaluated by the browser's actual, browser-free simulation.
 * JSON is an interchange format, not a second implementation of portal mathematics.
 * Every vector remains in source room-local metres (Unity reflects Z only for display).
 */
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {world} from '../src/campaign.mjs';
import {createState, portalTransform, step, look, setGravity, crossPortal, pickUp, drop, normalize} from '../src/engine.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const defaultOutput = resolve(root, 'MuseumUnity/Assets/Museum/Content/engine-fixtures.v1.json');
const clone = value => JSON.parse(JSON.stringify(value));

/** Replays the fixture's engine calls only; campaign updates are deliberately separate. */
export function replaySimulation(fixture, source = world) {
  const state = clone(fixture.initialState), returns = [];
  fixture.actions.forEach((action, actionIndex) => {
    switch (action.kind) {
      case 'step':
        if (!Number.isInteger(action.frames) || action.frames < 1 || !Number.isFinite(action.dt) || action.dt <= 0)
          throw new Error(`Invalid step action at ${actionIndex}`);
        for (let frame = 0; frame < action.frames; frame++) step(source, state, action.input, action.dt);
        break;
      case 'look': look(state, action.yaw, action.pitch); break;
      case 'setGravity': returns.push({actionIndex, value: setGravity(source, state, action.up)}); break;
      case 'crossPortal': returns.push({actionIndex, value: crossPortal(source, state, action.portalId)}); break;
      case 'pickUp': returns.push({actionIndex, value: pickUp(source, state, action.objectId)}); break;
      case 'drop': returns.push({actionIndex, value: drop(source, state)}); break;
      default: throw new Error(`Unknown fixture action: ${action.kind}`);
    }
  });
  return {expected: clone(state), returns};
}

function initial(roomId, player = {}, held = null) {
  const room = world.rooms.find(candidate => candidate.id === roomId);
  if (!room) throw new Error(`Unknown fixture room ${roomId}`);
  const state = createState(world);
  state.player = {...state.player, room: room.id, p: clone(room.spawn.p), forward: clone(room.spawn.forward), up: clone(room.spawn.up), ...clone(player)};
  state.checkpoint = room.id;
  if (held) {
    state.held = held;
    state.heldRatio = state.objects[held].size / state.player.scale;
  }
  return state;
}

const walk = (frames, forward = 1, extra = {}) => ({kind: 'step', frames, dt: 1 / 60, input: {forward, strafe: 0, sprint: false, ...extra}});

export function buildUnityFixtures() {
  const transforms = ['c1-east', 'c1-gallery-in', 'quarter-in', 'quarter-out', 'wall6-in', 'wall6-out'].map(sourcePortal => {
    const source = world.portals.find(portal => portal.id === sourcePortal);
    const destination = world.portals.find(portal => portal.id === source.to);
    const transform = portalTransform(source, destination);
    const points = [clone(source.center), [0, 0, 0], [1.125, 2.75, -3.5], [100, -20, .025]];
    const directions = [[1, 0, 0], [0, 1, 0], [0, 0, 1], normalize([.3, -.4, -.5])];
    return {id: sourcePortal, sourcePortal, destinationPortal: destination.id, points, directions,
      expected: {scale: transform.scale, points: points.map(transform.point), directions: directions.map(transform.direction)}};
  });

  const ordinary = initial('c1', {p: [5, 1.6, 1], forward: [1, 0, 0]});
  const quarter = initial('c3', {p: [0, 1.6, -7], forward: [0, 0, -1]}, 'weight3');
  Object.assign(quarter.objects.weight3, {room: 'c3', p: [.37, 1.28, -7.5]});
  const wall = initial('c6', {p: [4.4, 7, -8], forward: [0, 0, -1], up: [-1, 0, 0]});
  wall.flags['gravity:c6'] = [-1, 0, 0];
  const explicit = clone(quarter);
  explicit.player.p = [0, 1.6, -8];
  explicit.player.velocity = [.5, -1.25, -3];
  explicit.objects.weight3.velocity = [.1, -.2, -.3];

  const cases = [
    {id: 'ordinary-continuous-crossing', description: 'Walk through the authored east wall into the other north.', initialState: ordinary, actions: [walk(40)]},
    {id: 'ordinary-continuous-return', description: 'Cross and walk backward through the reciprocal aperture.', initialState: ordinary, actions: [walk(40), walk(40, -1)]},
    {id: 'quarter-continuous-held-crossing', description: 'Walk through the 1:4 arch while a weight crosses ahead of the eye.', initialState: quarter, actions: [walk(40)]},
    {id: 'quarter-explicit-velocity-crossing', description: 'The explicit primitive transforms player and held-object velocity and scale.', initialState: explicit, actions: [{kind: 'crossPortal', portalId: 'quarter-in'}]},
    {id: 'wall-gravity-continuous-crossing', description: 'Walk on the east wall through the authored elevated aperture into an ordinary floor.', initialState: wall, actions: [walk(40)]},
    {id: 'floor-look', description: 'Yaw then pitch with ordinary up.', initialState: initial('c1'), actions: [{kind: 'look', yaw: .3, pitch: -.2}]},
    {id: 'wall-look', description: 'Yaw then pitch relative to east-wall up.', initialState: wall, actions: [{kind: 'look', yaw: .3, pitch: -.2}]},
    {id: 'gravity-change-and-settle', description: 'Rotate the body about its centre, then fall onto the east wall.', initialState: initial('c6', {p: [0, 1.6, 2]}), actions: [{kind: 'setGravity', up: [-1, 0, 0]}, walk(120, 0)]},
    {id: 'solid-blocks-movement', description: 'The continuous glass partition blocks forward movement.', initialState: initial('c1', {p: [0, 1.6, -1.8], forward: [0, 0, -1]}), actions: [walk(90)]},
    {id: 'weight-pickup-drop', description: 'Ray-validated pickup, collision-safe hand placement and drop.', initialState: initial('c3', {p: [2, 1.6, -.85], forward: normalize([0, -1.2, -1.15])}), actions: [{kind: 'pickUp', objectId: 'weight3'}, {kind: 'drop'}, walk(30, 0)]},
  ];
  const simulations = cases.map(fixture => ({...clone(fixture), world: 'campaign', ...replaySimulation(fixture)}));

  return {
    schemaVersion: 1,
    source: 'src/engine.mjs',
    worldFile: 'world.v1.json',
    worldContentSha256: createHash('sha256').update(JSON.stringify(world)).digest('hex'),
    coordinates: 'source-room-local',
    tolerance: {position: .0001, direction: .00001, scalar: .00001},
    contract: {
      transforms: 'Resolve both portal IDs from world.v1.json.world.portals. Apply portalTransform to each supplied point and direction; compare output arrays and scale with expected.',
      simulations: 'Deep-clone initialState, then execute actions in order against the campaign world. A step repeats engine.step(world,state,input,dt) frames times. Do not call updateCampaign. Compare expected state after all actions.',
      actions: 'look uses yaw/pitch radians; setGravity uses source cardinal up; crossPortal uses portalId; pickUp uses objectId; drop has no arguments. returns records the boolean result of these last four operations, with zero-based actionIndex.',
      expected: 'Full source state is supplied, including events and untouched objects. IDs, flags, event kinds and booleans compare exactly; continuous numeric values compare with the documented tolerances. Initial held state is an explicit test setup, not proof of pickup reach.',
      precision: 'Source computation is JavaScript double precision. Native render transforms may use floats; cross-language acceptance is tolerance-based, not byte-for-byte JSON equality.',
    },
    transforms,
    simulations,
  };
}

export const serializeUnityFixtures = () => JSON.stringify(buildUnityFixtures(), null, 2) + '\n';

export async function exportUnityFixtures({output = defaultOutput, check = false} = {}) {
  const expected = serializeUnityFixtures();
  let existing;
  try { existing = await readFile(output, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (check && existing !== expected) throw new Error('Unity engine fixtures are missing or stale. Run node tools/export-unity-fixtures.mjs.');
  if (!check && existing !== expected) {
    await mkdir(dirname(output), {recursive: true});
    await writeFile(output, expected, 'utf8');
  }
  const document = JSON.parse(expected);
  return {changed: existing !== expected, transforms: document.transforms.length, simulations: document.simulations.length, worldContentSha256: document.worldContentSha256};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--check')) throw new Error('Usage: node tools/export-unity-fixtures.mjs [--check]');
    console.log(JSON.stringify(await exportUnityFixtures({check: args.includes('--check')}), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
