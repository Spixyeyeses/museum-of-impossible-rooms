/** Explicit discovery keeps node --test out of Unity's generated Library folder. Supports Node 20+. */
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const files = readdirSync(new URL('../tests/', import.meta.url)).filter(name => name.endsWith('.test.mjs')).sort();
if (!files.length) throw new Error('No test files found.');
const result = spawnSync(process.execPath, ['--test', ...files.map(name => `tests/${name}`)], {cwd: root, stdio: 'inherit'});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
