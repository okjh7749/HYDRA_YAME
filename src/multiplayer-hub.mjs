import { randomInt, randomUUID } from 'node:crypto';
import {
  SERVER_TICK_MS,
  createRoom,
  handleRoomCommand,
  joinRoom,
  leaveRoom,
  lobbyView,
  roomNeedsSnapshot,
  setRoomReady,
  snapshotForClient,
  startRoom,
  tickRoom,
} from './game-room.mjs';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function normalizeRoomId(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function generateRoomId(rooms) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let id = '';
    for (let index = 0; index < 4; index += 1) {
      id += ROOM_ALPHABET[randomInt(0, ROOM_ALPHABET.length)];
    }
    if (!rooms.has(id)) return id;
  }
  return randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase();
}

function errorMessage(reason, requestId = null) {
  return { type: 'error', reason, requestId };
}

export function createMultiplayerHub({ tickMs = SERVER_TICK_MS } = {}) {
  const rooms = new Map();
  const sessions = new Map();

  function sessionFor(peer) {
    return sessions.get(peer) ?? null;
  }

  function roomFor(session) {
    return session?.roomId ? rooms.get(session.roomId) ?? null : null;
  }

  function connectedSessionsForRoom(roomId) {
    return [...sessions.values()].filter(
      (session) => session.roomId === roomId && !session.peer.closed,
    );
  }

  function sendLobby(room) {
    for (const session of connectedSessionsForRoom(room.id)) {
      session.peer.sendJson({
        type: 'lobby',
        ...lobbyView(room, session.clientId),
      });
    }
  }

  function sendSnapshots(room) {
    for (const session of connectedSessionsForRoom(room.id)) {
      const snapshot = snapshotForClient(room, session.clientId);
      if (snapshot) session.peer.sendJson(snapshot);
    }
  }

  function detachFromRoom(session) {
    const room = roomFor(session);
    if (!room) {
      session.roomId = null;
      return;
    }
    const previousStatus = room.status;
    leaveRoom(room, session.clientId);
    session.roomId = null;

    const connected = room.players.some((player) => player.connected);
    if (!connected || (room.status === 'lobby' && room.players.length === 0)) {
      rooms.delete(room.id);
      return;
    }
    if (previousStatus === 'running' && room.status === 'finished') {
      room.snapshotSequence += 1;
      sendSnapshots(room);
    }
    sendLobby(room);
  }

  function joinSessionToRoom(session, room, name) {
    if (session.roomId && session.roomId !== room.id) detachFromRoom(session);
    const result = joinRoom(room, { clientId: session.clientId, name });
    if (!result.ok) {
      session.peer.sendJson(errorMessage(result.reason));
      return false;
    }
    session.roomId = room.id;
    sendLobby(room);
    return true;
  }

  function handleMessage(peer, message) {
    const session = sessionFor(peer);
    if (!session) return;
    const requestId = message.requestId ?? null;

    if (message.type === 'create-room') {
      detachFromRoom(session);
      const id = generateRoomId(rooms);
      const room = createRoom({
        id,
        hostId: session.clientId,
        hostName: message.name,
      });
      rooms.set(id, room);
      session.roomId = id;
      sendLobby(room);
      return;
    }

    if (message.type === 'join-room') {
      const id = normalizeRoomId(message.roomId);
      const room = rooms.get(id);
      if (!room) {
        peer.sendJson(errorMessage('room-not-found', requestId));
        return;
      }
      joinSessionToRoom(session, room, message.name);
      return;
    }

    if (message.type === 'leave-room') {
      detachFromRoom(session);
      peer.sendJson({ type: 'left-room', requestId });
      return;
    }

    if (message.type === 'ping') {
      peer.sendJson({ type: 'pong', sentAt: message.sentAt ?? null, serverAt: Date.now() });
      return;
    }

    const room = roomFor(session);
    if (!room) {
      peer.sendJson(errorMessage('not-in-room', requestId));
      return;
    }

    if (message.type === 'ready') {
      const result = setRoomReady(room, session.clientId, message.ready);
      if (!result.ok) peer.sendJson(errorMessage(result.reason, requestId));
      else sendLobby(room);
      return;
    }

    if (message.type === 'start-room') {
      const result = startRoom(room, session.clientId);
      if (!result.ok) {
        peer.sendJson(errorMessage(result.reason, requestId));
        return;
      }
      sendLobby(room);
      sendSnapshots(room);
      return;
    }

    if (message.type === 'command') {
      const result = handleRoomCommand(room, session.clientId, message.command);
      peer.sendJson({
        type: 'command-result',
        requestId,
        result,
      });
      return;
    }

    peer.sendJson(errorMessage('unknown-message', requestId));
  }

  function connect(peer) {
    const session = {
      peer,
      clientId: randomUUID(),
      roomId: null,
    };
    sessions.set(peer, session);
    peer.sendJson({
      type: 'hello',
      clientId: session.clientId,
      protocol: 1,
      tickRateHz: Math.round(1000 / tickMs),
    });

    peer.on('message', (message) => handleMessage(peer, message));
    peer.on('message-error', () => {});
    peer.on('protocol-error', () => {});
    peer.on('error', () => {});
    peer.on('close', () => {
      detachFromRoom(session);
      sessions.delete(peer);
    });
    return session;
  }

  function tick() {
    for (const room of rooms.values()) {
      if (room.status !== 'running') continue;
      const previousStatus = room.status;
      tickRoom(room, tickMs);
      const shouldSnapshot = roomNeedsSnapshot(room);
      if (shouldSnapshot || room.status !== previousStatus) sendSnapshots(room);
      if (room.status !== previousStatus) sendLobby(room);
    }
  }

  const interval = setInterval(tick, tickMs);
  interval.unref?.();

  return {
    rooms,
    sessions,
    connect,
    tick,
    stop() {
      clearInterval(interval);
      for (const session of sessions.values()) session.peer.close(1001, 'Server stopping');
      sessions.clear();
      rooms.clear();
    },
  };
}
