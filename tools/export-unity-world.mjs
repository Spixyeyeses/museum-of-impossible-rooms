#!/usr/bin/env node
/** One-way, lossless content bridge. This does not translate campaign behavior. */
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {world} from '../src/campaign.mjs';
import {validateWorld} from './validate-world.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const defaultOutput = resolve(root, 'MuseumUnity/Assets/Museum/Content/world.v1.json');

export function serializeUnityWorld(source = world) {
  const validation = validateWorld(source);
  if (!validation.valid) throw new Error(`Invalid campaign: ${validation.errors.map(e => `${e.path}: ${e.message}`).join('\n')}`);
  // Keep numbers, vectors, condition trees, IDs and optional fields in source form.
  const serialized = JSON.stringify(source);
  const document = {
    schemaVersion: 1,
    source: 'src/campaign.mjs',
    contentSha256: createHash('sha256').update(serialized).digest('hex'),
    coordinates: {units: 'meters', space: 'room-local', unityMapping: 'reflect-z', portalNormal: 'into-room', spawnPosition: 'eye'},
    counts: validation.stats,
    world: JSON.parse(serialized),
  };
  return JSON.stringify(document, null, 2) + '\n';
}

export async function exportUnityWorld({source = world, output = defaultOutput, check = false} = {}) {
  const expected = serializeUnityWorld(source);
  let existing;
  try { existing = await readFile(output, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (check && existing !== expected) throw new Error('Unity content is missing or stale. Run npm run unity:export.');
  if (!check && existing !== expected) {
    await mkdir(dirname(output), {recursive: true});
    await writeFile(output, expected, 'utf8');
  }
  return {changed: existing !== expected, contentSha256: JSON.parse(expected).contentSha256, counts: JSON.parse(expected).counts};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--check')) throw new Error('Usage: node tools/export-unity-world.mjs [--check]');
    console.log(JSON.stringify(await exportUnityWorld({check: args.includes('--check')}), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
