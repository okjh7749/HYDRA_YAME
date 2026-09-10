import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeWebSocketFrames,
  encodeWebSocketFrame,
  websocketAcceptValue,
} from '../src/websocket-protocol.mjs';

test('computes the RFC 6455 WebSocket accept value', () => {
  assert.equal(
    websocketAcceptValue('dGhlIHNhbXBsZSBub25jZQ=='),
    's3pPLMBiTxaQ9kYGzzhZRbK+xOo=',
  );
});

test('round trips a masked client text frame with a deterministic mask', () => {
  const frame = encodeWebSocketFrame(
    JSON.stringify({ type: 'ping', value: 7 }),
    {
      masked: true,
      maskKey: Buffer.from([0x37, 0xfa, 0x21, 0x3d]),
    },
  );

  const decoded = decodeWebSocketFrames(frame, { requireMasked: true });
  assert.equal(decoded.frames.length, 1);
  assert.equal(decoded.remaining.length, 0);
  assert.equal(decoded.frames[0].opcode, 0x1);
  assert.deepEqual(
    JSON.parse(decoded.frames[0].payload.toString('utf8')),
    { type: 'ping', value: 7 },
  );
});

test('retains an incomplete frame until the remaining bytes arrive', () => {
  const payload = 'x'.repeat(300);
  const frame = encodeWebSocketFrame(payload, {
    masked: true,
    maskKey: Buffer.from([1, 2, 3, 4]),
  });
  const first = frame.subarray(0, 40);
  const firstDecoded = decodeWebSocketFrames(first, { requireMasked: true });

  assert.equal(firstDecoded.frames.length, 0);
  assert.equal(firstDecoded.remaining.length, first.length);

  const decoded = decodeWebSocketFrames(
    Buffer.concat([firstDecoded.remaining, frame.subarray(40)]),
    { requireMasked: true },
  );
  assert.equal(decoded.frames.length, 1);
  assert.equal(decoded.frames[0].payload.toString('utf8'), payload);
});

test('rejects unmasked client frames when masking is required', () => {
  const frame = encodeWebSocketFrame('hello');
  assert.throws(
    () => decodeWebSocketFrames(frame, { requireMasked: true }),
    /must be masked/,
  );
});
