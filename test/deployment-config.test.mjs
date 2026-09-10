import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const renderUrl = new URL('../render.yaml', import.meta.url);
const serverUrl = new URL('../src/dev-server.mjs', import.meta.url);

test('Render blueprint deploys main automatically and starts the WebSocket server', async () => {
  const config = await readFile(renderUrl, 'utf8');

  assert.match(config, /type: web/);
  assert.match(config, /runtime: node/);
  assert.match(config, /plan: free/);
  assert.match(config, /branch: main/);
  assert.match(config, /startCommand: node src\/dev-server\.mjs/);
  assert.match(config, /healthCheckPath: \/healthz/);
  assert.match(config, /autoDeployTrigger: commit/);
  assert.match(config, /key: HOST[\s\S]*value: 0\.0\.0\.0/);
});

test('production host binding and health endpoint preserve local defaults', async () => {
  const server = await readFile(serverUrl, 'utf8');

  assert.match(server, /process\.env\.PORT \?\? '8080'/);
  assert.match(server, /process\.env\.HOST \?\? '127\.0\.0\.1'/);
  assert.match(server, /requestPath === '\/healthz'/);
  assert.match(server, /server\.listen\(port, process\.env\.HOST/);
});
