import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const clientUrl = new URL('../public/multiplayer-client.mjs', import.meta.url);
const workerUrl = new URL('../public/lockstep-worker.mjs', import.meta.url);

test('multiplayer lockstep simulation runs in a module worker with backlog fallback', async () => {
  const [client, worker] = await Promise.all([
    readFile(clientUrl, 'utf8'),
    readFile(workerUrl, 'utf8'),
  ]);

  assert.match(client, /new Worker\('\/public\/lockstep-worker\.mjs', \{ type: 'module' \}\)/);
  assert.match(client, /runLockstepFrame = function workerRunLockstepFrame/);
  assert.match(client, /lockstepWorker\.postMessage\(\{ type: 'frame', serial, frame \}\)/);
  assert.match(client, /lockstepWorkerBacklog > 24/);
  assert.match(client, /q\$\{lockstepWorkerBacklog\}/);
  assert.match(worker, /applyLockstepFrame/);
  assert.match(worker, /projectLockstepSnapshot/);
  assert.match(worker, /restoreLockstepRoom/);
  assert.match(worker, /self\.addEventListener\('message'/);
  assert.match(worker, /type: 'frame-ack'/);
  assert.match(worker, /type: 'desync'/);
});
