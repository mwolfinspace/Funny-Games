// backend/ws.js — minimal RFC 6455 WebSocket server, zero dependencies.
//
// Supports text + binary messages, fragmentation, masked client frames,
// ping/pong heartbeats and the close handshake. Used for the Hub's real-time
// push channel (/api/mg/ws): the moment a save lands, the Hub pushes
// {type:"save:updated", game, key, device, revision} to every live socket of
// that account, so other tabs/devices update instantly instead of polling.
// Future fast games can also send commands up the same socket (full duplex).

"use strict";

const crypto = require("crypto");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const OP_CONT = 0x0;
const OP_TEXT = 0x1;
const OP_BINARY = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;
const MAX_MESSAGE = 4 * 1024 * 1024;

class Conn {
  constructor(req, socket, head) {
    this.req = req;
    this.socket = socket;
    this._onMessage = null;
    this._onClose = null;
    this._alive = true;
    this._buffer = head && head.length ? head : Buffer.alloc(0);
    this._frag = [];
    this._fragOp = 0;
    this._fragLen = 0;

    const accept = crypto
      .createHash("sha1")
      .update((req.headers["sec-websocket-key"] || "") + GUID)
      .digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        "Sec-WebSocket-Accept: " + accept + "\r\n\r\n",
    );

    socket.on("error", () => this.terminate());
    socket.on("close", () => this._onClosed());
    socket.on("data", (chunk) => this._onData(chunk));

    this._hb = setInterval(() => {
      if (this._closed) return clearInterval(this._hb);
      if (this._alive === false) return this.close(1001, "no pong");
      this._alive = false;
      this._frame(OP_PING, Buffer.alloc(0));
    }, 30_000);
    this._hb.unref();
  }

  get open() {
    return !!this.socket && !this.socket.destroyed && !this._closed;
  }

  // ── socket plumbing ──────────────────────────────────────────────────────
  _onClosed() {
    if (this._hb) { clearInterval(this._hb); this._hb = null; }
    if (this._onClose) this._onClose();
  }

  terminate() {
    if (this.socket) {
      this.socket.removeAllListeners("data");
      this.socket.removeAllListeners("error");
      this.socket.destroy();
    }
  }

  _frame(opcode, payload) {
    if (!this.open) return false;
    const len = payload.length;
    let head;
    if (len <= 125) head = Buffer.from([0x80 | opcode, len]);
    else if (len <= 0xffff) {
      head = Buffer.alloc(4);
      head[0] = 0x80 | opcode;
      head[1] = 126;
      head.writeUInt16BE(len, 2);
    } else {
      head = Buffer.alloc(10);
      head[0] = 0x80 | opcode;
      head[1] = 127;
      head.writeBigUInt64BE(BigInt(len), 2);
    }
    this.socket.write(head);
    this.socket.write(payload);
    return true;
  }

  // ── frame parsing (client frames are always masked) ──────────────────────
  _onData(chunk) {
    if (!this.open) return;
    this._buffer = this._buffer.length ? Buffer.concat([this._buffer, chunk]) : chunk;
    for (;;) {
      if (this._buffer.length < 2) return;
      const b0 = this._buffer[0];
      const b1 = this._buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this._buffer.length < 4) return;
        len = this._buffer.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this._buffer.length < 10) return;
        const big = this._buffer.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) { this.close(1009, "too big"); return; }
        len = Number(big);
        off = 10;
      }
      const maskOff = off;
      const payOff = off + (masked ? 4 : 0);
      if (payOff + len > this._buffer.length) return;
      let payload = Buffer.from(this._buffer.slice(payOff, payOff + len));
      if (masked) {
        const key = this._buffer.slice(maskOff, maskOff + 4);
        for (let i = 0; i < payload.length; i++) payload[i] ^= key[i & 3];
      }
      this._buffer = this._buffer.slice(payOff + len);

      if (opcode === OP_PING) this._frame(OP_PONG, payload);
      else if (opcode === OP_PONG) this._alive = true;
      else if (opcode === OP_CLOSE) {
        const body = payload.length >= 2 ? payload.slice(0, 2) : Buffer.from([0x03, 0xe8]);
        this._frame(OP_CLOSE, body);
        this.socket.end();
      } else if (opcode === OP_TEXT || opcode === OP_BINARY) {
        if (fin) this._deliver(opcode, payload);
        else { this._frag = [payload]; this._fragOp = opcode; this._fragLen = payload.length; }
      } else if (opcode === OP_CONT) {
        if (!this._fragOp) { this.close(1002, "out of order"); return; }
        this._frag.push(payload);
        this._fragLen += payload.length;
        if (this._fragLen > MAX_MESSAGE) { this.close(1009, "too big"); return; }
        if (fin) {
          const full = Buffer.concat(this._frag);
          const op = this._fragOp;
          this._frag = [];
          this._fragOp = 0;
          this._fragLen = 0;
          this._deliver(op, full);
        }
      } else {
        this.close(1002, "bad opcode");
        return;
      }
    }
  }

  _deliver(opcode, payload) {
    if (payload.length > MAX_MESSAGE) { this.close(1009, "too big"); return; }
    if (this._onMessage) {
      if (opcode === OP_TEXT) this._onMessage(payload.toString("utf8"), false);
      else this._onMessage(payload, true);
    }
  }

  // ── public API ───────────────────────────────────────────────────────────
  set onMessage(fn) { this._onMessage = fn; }
  set onClose(fn) { this._onClose = fn; }

  sendText(str) { return this._frame(OP_TEXT, Buffer.from(String(str), "utf8")); }
  sendBinary(buf) { return this._frame(OP_BINARY, Buffer.from(buf)); }

  close(code = 1000, reason = "") {
    if (!this.open) return this.terminate();
    const body = Buffer.alloc(2);
    body.writeUInt16BE(code, 0);
    const full = reason ? Buffer.concat([body, Buffer.from(String(reason), "utf8")]) : body;
    this._frame(OP_CLOSE, full);
    this.socket.end();
  }
}

// ── tiny pub/sub registry, keyed per account ───────────────────────────────
const clientsByUser = new Map(); // userId -> Set<Conn>

function register(conn, userId) {
  conn.userId = userId;
  let set = clientsByUser.get(userId);
  if (!set) { set = new Set(); clientsByUser.set(userId, set); }
  set.add(conn);
  conn.onClose = () => unregister(conn);
}

function unregister(conn) {
  if (!conn.userId) return;
  const set = clientsByUser.get(conn.userId);
  if (set) { set.delete(conn); if (set.size === 0) clientsByUser.delete(conn.userId); }
  conn.userId = null;
}

// Send a JSON (or pre-encoded text) message to every live socket of a user.
// Returns the number of sockets that received it.
function pushToUser(userId, obj) {
  const set = clientsByUser.get(userId);
  if (!set || set.size === 0) return 0;
  const text = typeof obj === "string" ? obj : JSON.stringify(obj);
  let sent = 0;
  const dead = [];
  for (const c of set) {
    if (c.open && c.sendText(text)) sent++;
    else dead.push(c);
  }
  for (const c of dead) c.terminate();
  return sent;
}

function onlineCount(userId) {
  const set = clientsByUser.get(userId);
  return set ? set.size : 0;
}

// Perform the RFC 6455 handshake on an upgraded socket.
function handleUpgrade(req, socket, head) {
  const key = req.headers["sec-websocket-key"] || "";
  if (!key || req.headers["sec-websocket-version"] !== "13") {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return null;
  }
  return new Conn(req, socket, head);
}

module.exports = { handleUpgrade, register, unregister, pushToUser, onlineCount };