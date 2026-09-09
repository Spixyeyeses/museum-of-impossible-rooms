#!/usr/bin/env node
/** Portable ZIP writer using only Node.js. No npm install or OS archiver. */
import { readdir, readFile, lstat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join, relative, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_FILES = ['index.html', 'package.json', 'README.md', 'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'Start Museum.cmd', 'Start-Museum.ps1'];
const ROOT_DIRECTORIES = ['src', 'vendor', 'assets', 'docs', 'tools', 'tests', 'evidence'];
const REQUIRED_FILES = ['index.html', 'package.json', 'Start Museum.cmd', 'Start-Museum.ps1', 'tools/serve.mjs'];
const ARCHIVE_PREFIX = 'Museum of Impossible Rooms/';
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  return value >>> 0;
});

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ value) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function sha256(buffer) { return createHash('sha256').update(buffer).digest('hex'); }

export async function collectPackageFiles(root = PROJECT_ROOT) {
  root = resolve(root);
  const files = [];
  async function visit(path) {
    let info;
    try { info = await lstat(path); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (info.isSymbolicLink()) throw new Error(`Packaging refuses symbolic links: ${path}`);
    const name = relative(root, path).split('\\').join('/');
    if (name.split('/').some(part => part.startsWith('.') || part === 'node_modules' || part === '__pycache__')) return;
    if (info.isDirectory()) {
      for (const entry of (await readdir(path)).sort()) await visit(join(path, entry));
    } else if (info.isFile()) {
      // Keep reproducible test reports; large development screenshots stay in the project.
      if (name.startsWith('evidence/') && !['.json', '.md', '.txt', '.csv'].includes(extname(name).toLowerCase())) return;
      if (['.zip', '.log', '.tmp', '.pyc'].includes(extname(name).toLowerCase())) return;
      files.push({ name, data: await readFile(path) });
    }
  }
  for (const entry of [...ROOT_FILES, ...ROOT_DIRECTORIES]) await visit(join(root, entry));
  for (const required of REQUIRED_FILES) {
    if (!files.some(file => file.name === required)) throw new Error(`Required deliverable is missing: ${required}`);
  }
  return files.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/** Build a standard, uncompressed ZIP. Fixed metadata makes equal sources byte-identical. */
export function makeZip(files) {
  if (files.length > 65535) throw new Error('Too many files for this ZIP format.');
  const localParts = [];
  const directoryParts = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(ARCHIVE_PREFIX + file.name, 'utf8');
    const data = file.data;
    if (data.length > 0xffffffff || offset > 0xffffffff || name.length > 65535) throw new Error('The package exceeds the supported ZIP size.');
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6); // UTF-8 filenames.
    header.writeUInt16LE(0, 8); // Stored; no decompressor dependencies.
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0x5c21, 12); // 2026-01-01, independent of build time.
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x5c21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    localParts.push(header, name, data);
    directoryParts.push(central, name);
    offset += header.length + name.length + data.length;
  }
  const directory = Buffer.concat(directoryParts);
  if (offset + directory.length > 0xffffffff) throw new Error('The package exceeds the supported ZIP size.');
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(files.length, 8);
  footer.writeUInt16LE(files.length, 10);
  footer.writeUInt32LE(directory.length, 12);
  footer.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, footer]);
}

export async function createMuseumPackage({ root = PROJECT_ROOT, output = resolve(root, 'release', 'Museum-of-Impossible-Rooms.zip') } = {}) {
  const files = await collectPackageFiles(root);
  const manifest = {
    format: 1,
    title: 'The Museum of Impossible Rooms',
    launch: 'Start Museum.cmd (Windows) or node tools/serve.mjs',
    prerequisite: 'Node.js 20 or newer and a desktop browser with WebGL 2',
    files: files.map(file => ({ path: file.name, bytes: file.data.length, sha256: sha256(file.data) })),
  };
  files.push({ name: 'package-manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') });
  const zip = makeZip(files);
  output = resolve(output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, zip);
  const digest = sha256(zip);
  await writeFile(output + '.sha256', `${digest}  ${output.split(/[\\/]/).at(-1)}\n`);
  return { output, files: files.length, bytes: zip.length, sha256: digest };
}

async function main() {
  const options = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      process.stdout.write('node tools/package.mjs [--root PATH] [--output PATH.zip]\nCreates a portable, offline ZIP and SHA-256 checksum.\n');
      return;
    }
    if (!['--root', '--output'].includes(args[i])) throw new Error(`Unknown option: ${args[i]}`);
    const key = args[i].slice(2);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`--${key} requires a path.`);
    options[key] = resolve(value);
  }
  const result = await createMuseumPackage(options);
  process.stdout.write(`Created ${result.output}\n${result.files} files; ${(result.bytes / 1048576).toFixed(2)} MiB\nSHA-256 ${result.sha256}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { process.stderr.write(`Packaging failed: ${error.message}\n`); process.exitCode = 1; });
}
