#!/usr/bin/env node
// Local preview: builds the site, serves it at http://localhost:5173,
// and rebuilds whenever you save a question file or app file.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};

let lastOk = buildAll().ok;

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(DIST, url);
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    if (!lastOk && url.endsWith('exams.json')) { res.writeHead(500).end('Build failed. Check the terminal for the problems to fix.'); return; }
    res.writeHead(404).end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`\nPreview running at  http://localhost:${PORT}\nSave any file in exams/ or app/ and refresh the page. Press Ctrl+C to stop.\n`);
});

let timer = null;
const rebuild = (what) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log(`\n— ${what} changed, rebuilding…`);
    try { lastOk = buildAll().ok; } catch (e) { lastOk = false; console.error(e.message); }
  }, 150);
};
for (const dir of ['exams', 'app']) {
  const full = path.join(ROOT, dir);
  if (fs.existsSync(full)) fs.watch(full, { recursive: true }, (_, f) => rebuild(`${dir}/${f || ''}`));
}
