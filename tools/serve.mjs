#!/usr/bin/env node
/** Dependency-free, loopback-only server for the offline museum. */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.wasm': 'application/wasm', '.pdf': 'application/pdf',
};

function inside(root, candidate) {
  return candidate === root || candidate.startsWith(root + sep);
}

function reply(res, code, message, head = false) {
  const body = `${message}\n`;
  res.writeHead(code, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(code === 405 ? { Allow: 'GET, HEAD' } : {}),
  });
  res.end(head ? undefined : body);
}

/** Starts a server without opening a browser. Port 0 is useful in tests. */
export async function startMuseumServer({ root = PROJECT_ROOT, port = 4173, host = '127.0.0.1' } = {}) {
  if (!LOOPBACK_HOSTS.has(host)) throw new Error('The museum server only accepts loopback hosts (127.0.0.1, localhost, ::1).');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535.');
  const resolvedRoot = await realpath(resolve(root));
  if (!(await stat(resolvedRoot)).isDirectory()) throw new Error('The museum root must be a directory.');
  const bindHost = host === 'localhost' ? '127.0.0.1' : host;
  const server = createServer(async (req, res) => {
    const head = req.method === 'HEAD';
    if (req.method !== 'GET' && !head) return reply(res, 405, 'Method not allowed.', head);
    // Reject non-local Host values as well as non-local listening addresses.
    let requestHost;
    try { requestHost = new URL(`http://${req.headers.host || ''}`).hostname; }
    catch { return reply(res, 400, 'Invalid Host header.', head); }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(requestHost)) return reply(res, 403, 'Only local requests are accepted.', head);
    let pathname;
    try {
      // Decode before normalizing: URL normalization would hide ../ attempts.
      const rawPath = (req.url || '/').split('?')[0];
      if (!rawPath.startsWith('/') || rawPath.startsWith('//')) return reply(res, 400, 'Invalid request path.', head);
      pathname = decodeURIComponent(rawPath);
    } catch { return reply(res, 400, 'Invalid URL encoding.', head); }
    if (pathname.includes('\\') || pathname.includes('\0')) return reply(res, 403, 'Forbidden path.', head);
    const parts = pathname.split('/');
    if (parts.some(part => part === '..' || part.startsWith('.'))) return reply(res, 403, 'Forbidden path.', head);
    let candidate = resolve(resolvedRoot, '.' + pathname);
    if (!inside(resolvedRoot, candidate)) return reply(res, 403, 'Forbidden path.', head);
    try {
      // Resolve symlinks too, so a linked directory cannot expose outside files.
      candidate = await realpath(candidate);
      if (!inside(resolvedRoot, candidate)) return reply(res, 403, 'Forbidden path.', head);
      let info = await stat(candidate);
      if (info.isDirectory()) {
        candidate = await realpath(resolve(candidate, 'index.html'));
        if (!inside(resolvedRoot, candidate)) return reply(res, 403, 'Forbidden path.', head);
        info = await stat(candidate);
      }
      if (!info.isFile()) return reply(res, 404, 'Exhibit not found.', head);
      res.writeHead(200, {
        'Content-Type': MIME[extname(candidate).toLowerCase()] || 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      if (head) return res.end();
      const stream = createReadStream(candidate);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return reply(res, 404, 'Exhibit not found.', head);
      if (error.code === 'EACCES' || error.code === 'EPERM') return reply(res, 403, 'File is not accessible.', head);
      reply(res, 500, 'The museum could not read this file.', head);
    }
  });
  await new Promise((yes, no) => {
    server.once('error', no);
    server.listen(port, bindHost, () => { server.removeListener('error', no); yes(); });
  });
  const address = server.address();
  const url = `http://${bindHost === '::1' ? '[::1]' : bindHost}:${address.port}/`;
  return {
    server, url, root: resolvedRoot,
    close: () => new Promise((yes, no) => {
      server.close(error => error ? no(error) : yes());
      server.closeAllConnections();
    }),
  };
}

export function parseArguments(args) {
  const options = { root: PROJECT_ROOT, port: 4173, host: '127.0.0.1', open: true };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--no-open') options.open = false;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (['--port', '--host', '--root'].includes(arg)) {
      const value = args[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
      options[arg.slice(2)] = arg === '--port' ? Number(value) : value;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function openBrowser(url) {
  const [command, args] = process.platform === 'win32'
    ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.once('error', () => process.stdout.write(`Open ${url} in a browser to enter the museum.\n`));
  child.unref();
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Museum of Impossible Rooms\n\nnode tools/serve.mjs [--port 4173] [--no-open] [--root PATH] [--host 127.0.0.1]\n\nThe server accepts local connections only. Press Ctrl+C to close it.\n');
    return;
  }
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20 or newer is required.');
  const museum = await startMuseumServer(options);
  process.stdout.write(`\nTHE MUSEUM OF IMPOSSIBLE ROOMS\n\nEnter: ${museum.url}\nLocal server PID: ${process.pid}\n\nKeep this window open while playing. Press Ctrl+C to close the museum.\n\n`);
  if (options.open) openBrowser(museum.url);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await museum.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    const message = error.code === 'EADDRINUSE'
      ? 'Port 4173 (or the requested port) is already in use. Close the existing museum window, or launch with --port 4174.'
      : error.message;
    process.stderr.write(`Museum could not open: ${message}\n`);
    process.exitCode = 1;
  });
}
