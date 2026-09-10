import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMultiplayerHub } from './multiplayer-hub.mjs';
import { attachWebSocketServer } from './websocket-server.mjs';

const root = normalize(join(fileURLToPath(new URL('..', import.meta.url))));
const port = Number.parseInt(process.env.PORT ?? '8080', 10);

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
]);

function resolveRequestPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  let requested = decoded;
  if (decoded === '/') requested = '/public/multiplayer.html';
  if (decoded === '/classic') requested = '/public/index-v3.html';
  const relative = normalize(requested).replace(/^[/\\]+/, '');
  const resolved = normalize(join(root, relative));
  if (!resolved.startsWith(root)) return null;
  if (!relative.startsWith('public') && !relative.startsWith('src')) return null;
  return resolved;
}

const server = createServer(async (request, response) => {
  const filePath = resolveRequestPath(request.url ?? '/');
  if (!filePath) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      'content-type': mimeTypes.get(extname(filePath)) ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch (error) {
    const status = error?.code === 'ENOENT' ? 404 : 500;
    response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(status === 404 ? 'Not found' : 'Server error');
  }
});

const multiplayerHub = createMultiplayerHub();
attachWebSocketServer(server, {
  path: '/ws',
  onConnection(peer) {
    multiplayerHub.connect(peer);
  },
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Hydra Territory multiplayer: http://127.0.0.1:${port}`);
  console.log(`Classic local prototype: http://127.0.0.1:${port}/classic`);
});
