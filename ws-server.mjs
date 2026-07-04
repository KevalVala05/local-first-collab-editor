/**
 * Yjs WebSocket Collaboration Server
 * -----------------------------------
 * Provides real-time document synchronization via the y-websocket protocol.
 * Run with: npm run dev:ws
 *
 * Each document maps to a separate "room" identified by its MongoDB document ID.
 * State is ephemeral (in-memory) – MongoDB (via auto-save) handles persistence.
 */

import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import http from "http";

const PORT = Number(process.env.PORT || 1234);   // Railway injects PORT automatically
const HOST = process.env.HOST || "0.0.0.0";       // bind to all interfaces in production

// ── Message type constants (matches y-websocket client) ─────────────────────

const messageSync = 0;
const messageAwareness = 1;

// ── In-memory room registry ─────────────────────────────────────────────────

/** @type {Map<string, { doc: Y.Doc, awareness: awarenessProtocol.Awareness, conns: Map<WebSocket, Set<number>> }>} */
const rooms = new Map();

function getOrCreateRoom(roomName) {
  if (!rooms.has(roomName)) {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);

    awareness.on("update", ({ added, updated, removed }, conn) => {
      const room = rooms.get(roomName);
      if (!room) return;

      const changedClients = added.concat(updated).concat(removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
      );
      const buf = encoding.toUint8Array(encoder);

      room.conns.forEach((_, c) => {
        if (c.readyState === WebSocket.OPEN) c.send(buf);
      });
    });

    doc.on("update", (update, origin) => {
      const room = rooms.get(roomName);
      if (!room) return;

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const buf = encoding.toUint8Array(encoder);

      room.conns.forEach((_, c) => {
        if (c !== origin && c.readyState === WebSocket.OPEN) c.send(buf);
      });
    });

    rooms.set(roomName, { doc, awareness, conns: new Map() });
    console.log(`[WS] Room created: ${roomName}`);
  }
  return rooms.get(roomName);
}

// ── Connection handler ──────────────────────────────────────────────────────

function setupConnection(conn, roomName) {
  const room = getOrCreateRoom(roomName);
  room.conns.set(conn, new Set());

  // Send sync step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, room.doc);
  conn.send(encoding.toUint8Array(encoder));

  // Send current awareness state
  const awarenessStates = room.awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(
        room.awareness,
        Array.from(awarenessStates.keys())
      )
    );
    conn.send(encoding.toUint8Array(awarenessEncoder));
  }

  conn.on("message", (data) => {
    const buf = new Uint8Array(data);
    const decoder = decoding.createDecoder(buf);
    const encoder = encoding.createEncoder();
    const msgType = decoding.readVarUint(decoder);

    if (msgType === messageSync) {
      encoding.writeVarUint(encoder, messageSync);
      const syncMsgType = syncProtocol.readSyncMessage(
        decoder,
        encoder,
        room.doc,
        conn
      );
      // Reply if we have data to send back (sync step 2 or update)
      if (
        syncMsgType === syncProtocol.messageYjsSyncStep1 ||
        syncMsgType === syncProtocol.messageYjsSyncStep2
      ) {
        if (encoding.length(encoder) > 1) {
          conn.send(encoding.toUint8Array(encoder));
        }
      }
    } else if (msgType === messageAwareness) {
      awarenessProtocol.applyAwarenessUpdate(
        room.awareness,
        decoding.readVarUint8Array(decoder),
        conn
      );
    }
  });

  conn.on("close", () => {
    const room = rooms.get(roomName);
    if (!room) return;

    const clientIDs = room.conns.get(conn);
    room.conns.delete(conn);

    // Remove awareness for disconnected client
    awarenessProtocol.removeAwarenessStates(
      room.awareness,
      clientIDs ? Array.from(clientIDs) : [],
      null
    );

    // Clean up empty rooms
    if (room.conns.size === 0) {
      room.doc.destroy();
      rooms.delete(roomName);
      console.log(`[WS] Room destroyed (empty): ${roomName}`);
    }
  });

  conn.on("error", (err) => {
    console.error(`[WS] Connection error in room ${roomName}:`, err.message);
  });
}

// ── HTTP + WebSocket server ─────────────────────────────────────────────────

const server = http.createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Yjs Collaboration WebSocket Server\n");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (conn, req) => {
  // Room name comes from the URL path: ws://host:port/<roomName>
  const roomName = (req.url || "/").slice(1).split("?")[0];
  if (!roomName) {
    conn.close();
    return;
  }
  console.log(`[WS] Client connected to room: ${roomName}`);
  setupConnection(conn, roomName);
});

server.listen(PORT, HOST, () => {
  console.log(`[WS] Yjs collaboration server running at ws://${HOST}:${PORT}`);
  console.log(`[WS] Rooms will be named after document IDs`);
});
