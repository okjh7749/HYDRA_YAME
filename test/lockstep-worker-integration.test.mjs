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
  assert.match(client, /unpackRenderUnitFrame/);
  assert.match(client, /lockstepRenderUnitCaches/);
  assert.match(client, /lockstepFrameAck = Math\.max\(lockstepFrameAck, message\.serial \?\? 0\)/);
  assert.match(worker, /packRenderUnitPoolFrame/);
  assert.match(worker, /visibleUnitPoolIndexesForClient/);
  assert.match(worker, /createClientProjectionContext/);
  assert.match(worker, /const projection = createClientProjectionContext\(room, clientId\)/);
  assert.match(worker, /\{ includeUnits: false, includeHudMetadata, projection \}/);
  assert.match(worker, /visibleUnitPoolIndexesForClient\(room, clientId, projection\)/);
  assert.match(worker, /includeUnits: false/);
  assert.match(worker, /\[unitFrame\.buffer\]/);
  assert.doesNotMatch(worker, /snapshot\.units = null/);
  assert.match(worker, /HUD_METADATA_INTERVAL_TICKS = 5/);
  assert.match(worker, /includeHudMetadata = serial === 0 \|\| room\.tick % HUD_METADATA_INTERVAL_TICKS === 0/);
  assert.match(worker, /hudMetadataIncluded: includeHudMetadata/);
  assert.match(client, /nextSnapshot\.teams = snapshot\?\.teams \?\? \[\]/);
  assert.match(client, /nextSnapshot\.upgrades = snapshot\?\.upgrades \?\? \{\}/);
  assert.match(client, /hudMetadataChanged: Boolean\(message\.hudMetadataIncluded\)/);
  assert.match(client, /if \(hudMetadataChanged\) \{[\s\S]*renderScoreboard\(\);[\s\S]*renderUpgradeState\(\);/);
});
