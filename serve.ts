// serve.ts — tiny static server for local play-testing (node serve.ts).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

const ROOT = join(import.meta.dirname, 'game');
const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
};
createServer((req, res) => {
  const path = join(ROOT, decodeURIComponent(req.url?.split('?')[0] || '/').replace(/^\/+/, '') || 'index.html');
  const file = path.endsWith('/') ? join(path, 'index.html') : path;
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(8080, () => console.log('WHITEOUT at http://localhost:8080/'));
