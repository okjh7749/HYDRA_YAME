import { createHash, randomBytes } from 'node:crypto';

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function websocketAcceptValue(key) {
  return createHash('sha1').update(`${key}${WEBSOCKET_GUID}`).digest('base64');
}

export function encodeWebSocketFrame(payload, { opcode = 0x1, masked = false, maskKey } = {}) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  const mask = masked ? (maskKey ?? randomBytes(4)) : null;
  const extended = body.length < 126 ? 0 : (body.length <= 0xffff ? 2 : 8);
  const header = Buffer.alloc(2 + extended + (masked ? 4 : 0));
  header[0] = 0x80 | (opcode & 0x0f);

  if (extended === 0) {
    header[1] = body.length | (masked ? 0x80 : 0);
  } else if (extended === 2) {
    header[1] = 126 | (masked ? 0x80 : 0);
    header.writeUInt16BE(body.length, 2);
  } else {
    header[1] = 127 | (masked ? 0x80 : 0);
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }

  if (!masked) return Buffer.concat([header, body]);
  const maskOffset = 2 + extended;
  mask.copy(header, maskOffset);
  const maskedBody = Buffer.alloc(body.length);
  for (let index = 0; index < body.length; index += 1) {
    maskedBody[index] = body[index] ^ mask[index % 4];
  }
  return Buffer.concat([header, maskedBody]);
}

export function decodeWebSocketFrames(input, { requireMasked = false } = {}) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const frames = [];
  let offset = 0;

  while (buffer.length - offset >= 2) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const fin = Boolean(first & 0x80);
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let payloadLength = second & 0x7f;
    let headerLength = 2;

    if (!fin) throw new Error('Fragmented WebSocket frames are not supported');
    if (requireMasked && !masked) throw new Error('Client WebSocket frames must be masked');

    if (payloadLength === 126) {
      if (buffer.length - offset < 4) break;
      payloadLength = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (payloadLength === 127) {
      if (buffer.length - offset < 10) break;
      const bigLength = buffer.readBigUInt64BE(offset + 2);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('WebSocket frame is too large');
      payloadLength = Number(bigLength);
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + payloadLength;
    if (buffer.length - offset < frameLength) break;

    const maskOffset = offset + headerLength;
    const payloadOffset = maskOffset + maskLength;
    const payload = Buffer.from(buffer.subarray(payloadOffset, payloadOffset + payloadLength));
    if (masked) {
      const mask = buffer.subarray(maskOffset, maskOffset + 4);
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }

    frames.push({ fin, opcode, masked, payload });
    offset += frameLength;
  }

  return { frames, remaining: buffer.subarray(offset) };
}

export function encodeJsonMessage(value) {
  return encodeWebSocketFrame(JSON.stringify(value));
}

export function decodeJsonPayload(payload) {
  const text = payload.toString('utf8');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON WebSocket message');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('WebSocket message must be a JSON object');
  }
  return value;
}
