import {
  applyLockstepFrame,
  projectLockstepSnapshot,
  restoreLockstepRoom,
} from '/src/lockstep-sync.mjs';
import { visibleUnitPoolIndexesForClient } from '/src/game-room.mjs';
import { packRenderUnitPoolFrame } from '/src/render-unit-frame.mjs';

let room = null;
let clientId = null;
let localSnapshotSequence = 1;
let checksumChecks = 0;

function postSnapshot(serial = 0) {
  if (!room || !clientId) return;
  const snapshot = projectLockstepSnapshot(
    room,
    clientId,
    localSnapshotSequence++,
    { includeUnits: false },
  );
  if (!snapshot) return;
  const visibleIndexes = visibleUnitPoolIndexesForClient(room, clientId);
  const unitFrame = packRenderUnitPoolFrame(room.unitPool, visibleIndexes);
  self.postMessage({
    type: 'snapshot',
    snapshot,
    unitFrame,
    serial,
    localTick: room.tick,
    checksumChecks,
  }, [unitFrame.buffer]);
}

function reset() {
  room = null;
  clientId = null;
  localSnapshotSequence = 1;
  checksumChecks = 0;
}

self.addEventListener('message', (event) => {
  const message = event.data ?? {};

  if (message.type === 'reset') {
    reset();
    self.postMessage({ type: 'reset-complete' });
    return;
  }

  if (message.type === 'bootstrap') {
    try {
      clientId = message.clientId ?? null;
      room = restoreLockstepRoom(message.bootstrap);
      localSnapshotSequence = 1;
      checksumChecks = 0;
      if (!room.bootstrapChecksumMatches) {
        self.postMessage({
          type: 'desync',
          reason: 'bootstrap-checksum',
          localTick: room.tick,
        });
        return;
      }
      self.postMessage({ type: 'ready', localTick: room.tick });
      postSnapshot(0);
    } catch (error) {
      reset();
      self.postMessage({
        type: 'desync',
        reason: 'bootstrap-error',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (message.type === 'frame') {
    if (!room) {
      self.postMessage({
        type: 'desync',
        reason: 'not-bootstrapped',
        serial: message.serial ?? 0,
      });
      return;
    }

    const result = applyLockstepFrame(room, message.frame);
    if (!result.ok) {
      self.postMessage({
        type: 'desync',
        reason: result.reason ?? 'frame-error',
        serial: message.serial ?? 0,
        localTick: room.tick,
      });
      return;
    }
    if (result.checksumCompared) checksumChecks += 1;
    if (result.duplicate) {
      self.postMessage({
        type: 'frame-ack',
        serial: message.serial ?? 0,
        localTick: room.tick,
        checksumChecks,
        duplicate: true,
      });
      return;
    }
    postSnapshot(message.serial ?? 0);
  }
});
