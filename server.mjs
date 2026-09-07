import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const port = Number(process.env.PORT || 4173);
const assets = new Set(['/index.html', '/style.css', '/src/game.js', '/src/engine.js']);
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const asset = pathname === '/' ? '/index.html' : pathname;
    if (!assets.has(asset)) { res.writeHead(404).end('Not found'); return; }
    const target = path.resolve(root, '.' + asset);
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Ashfall is running at http://localhost:${server.address().port}`));
