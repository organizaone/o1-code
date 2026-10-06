// o1-connect-lib 9.2.0 - https://github.com/organizaone/o1-gateway (MIT)

// src/shared/tunnel-protocol.ts
import { createHash } from "node:crypto";
var TUNNEL_PATH = "/tunnel";
var TUNNEL_PINS_PATH = "/tunnel/pins";
var TUNNEL_PROTOCOL = "o1gw-tunnel.v1";
var TUNNEL_SERVERNAME = "o1gw-tunnel";
var CODE_PREFIX = "o1gw1.";
var PIN = /^sha256\/[A-Za-z0-9+/]{43}=$/;
var TOKEN = /^[0-9a-f]{64}$/;
var DEVICE = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
var MAX_PINS = 4;
var MAX_HOSTS = 4;
var ConnectionCodeError = class extends Error {
};
function pinOfSpki(spkiDer) {
  return `sha256/${createHash("sha256").update(spkiDer).digest("base64")}`;
}
function isPin(s) {
  return PIN.test(s);
}
function fingerprint(pin) {
  if (!isPin(pin)) throw new ConnectionCodeError("not a pin");
  const hex = Buffer.from(pin.slice("sha256/".length), "base64").toString("hex").toUpperCase();
  return (hex.match(/.{4}/g) ?? []).join("-");
}
function sniOfPin(pin) {
  if (!isPin(pin)) throw new ConnectionCodeError("not a pin");
  return `k-${Buffer.from(pin.slice("sha256/".length), "base64").toString("hex").slice(0, 20)}.o1gw.invalid`;
}
function isLoopbackHost(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}
function originOf(value, what) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ConnectionCodeError(`the proxy ${what} is not a URL`);
  }
  if (!(url.protocol === "https:" || url.protocol === "http:" && isLoopbackHost(url.hostname))) {
    throw new ConnectionCodeError(`the proxy ${what} must be https`);
  }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new ConnectionCodeError(`the proxy ${what} must be the proxy's base URL`);
  }
  return url.origin;
}
function validateCode(c) {
  if (!c || typeof c !== "object") throw new ConnectionCodeError("the code does not hold a connection");
  const o = c;
  const url = originOf(String(o.url), "URL");
  if (typeof o.device !== "string" || !DEVICE.test(o.device)) throw new ConnectionCodeError("the device name is not valid");
  if (!Array.isArray(o.pins) || o.pins.length === 0 || o.pins.length > MAX_PINS || !o.pins.every((p) => typeof p === "string" && isPin(p))) {
    throw new ConnectionCodeError("the pin list is not valid");
  }
  if (typeof o.token !== "string" || !TOKEN.test(o.token)) throw new ConnectionCodeError("the device token is not valid");
  let urls;
  if (o.urls !== void 0) {
    if (!Array.isArray(o.urls) || o.urls.length === 0 || o.urls.some((u) => typeof u !== "string")) throw new ConnectionCodeError("the failover host list is not valid");
    urls = o.urls.map((u, i) => originOf(u, `failover host ${i + 1}`));
    const all = [url, ...urls];
    if (new Set(all).size !== all.length) throw new ConnectionCodeError("the failover host list repeats a host");
    if (all.length > MAX_HOSTS) throw new ConnectionCodeError(`the code names more than ${MAX_HOSTS} hosts`);
  }
  return { url, ...urls === void 0 ? {} : { urls }, device: o.device, pins: [...o.pins], token: o.token };
}
function decodeConnectionCode(s) {
  const text = s.trim();
  if (!text.startsWith(CODE_PREFIX)) throw new ConnectionCodeError("this is not an o1-connect code (it starts with o1gw1.)");
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(text.slice(CODE_PREFIX.length), "base64url").toString("utf8"));
  } catch {
    throw new ConnectionCodeError("the code is damaged: copy it again from the console");
  }
  return validateCode(parsed);
}

// src/client/inner.ts
import tls3 from "node:tls";

// src/client/peer-cert.ts
var seen = /* @__PURE__ */ new WeakMap();
function peerCertificate(socket) {
  const kept = seen.get(socket);
  if (kept) return kept;
  const cert = socket.getPeerX509Certificate();
  if (cert) seen.set(socket, cert);
  return cert;
}

// src/client/poll-client.ts
import { randomBytes as randomBytes2 } from "node:crypto";
import http3 from "node:http";
import https2 from "node:https";
import { isIP as isIP2 } from "node:net";
import { Duplex as Duplex2 } from "node:stream";
import tls2 from "node:tls";

// src/shared/tunnel-poll.ts
var POLL_PATH = "/tunnel/poll";
var POLL_VERSION = 1;
var SESSION_BYTES = 32;
var MAX_UP = 256 * 1024;
var MAX_DOWN = 1024 * 1024;
var POLL_WAIT_MS = 2e4;
var TUNNEL_BUSY = "tunnel_busy";
var REQUEST_HEAD = 1 + SESSION_BYTES + 8 + 8 + 1;
var RESPONSE_HEAD = 1 + SESSION_BYTES + 8 + 1;
var FLAG_CLOSE = 1;
var FLAG_POLL = 2;
var FLAG_OPEN = 4;
var FLAG_CLOSED = 1;
var PollFormatError = class extends Error {
};
var ZERO_SESSION = Buffer.alloc(SESSION_BYTES);
function sessionOf(id) {
  if (id.length !== SESSION_BYTES) throw new PollFormatError("the session id must be 32 bytes");
  return id;
}
function requestSession(id) {
  if (sessionOf(id).equals(ZERO_SESSION)) throw new PollFormatError("the session id must not be all zero");
  return id;
}
function toU64(n, what) {
  if (!Number.isSafeInteger(n) || n < 0) throw new PollFormatError(`${what} is out of range`);
  return BigInt(n);
}
function fromU64(b, at, what) {
  const v = b.readBigUInt64BE(at);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new PollFormatError(`${what} is out of range`);
  return Number(v);
}
function encodeRequest(r) {
  if (r.data.length > MAX_UP) throw new PollFormatError("the request carries too much data");
  const head = Buffer.alloc(REQUEST_HEAD);
  head[0] = POLL_VERSION;
  requestSession(r.session).copy(head, 1);
  head.writeBigUInt64BE(toU64(r.upOffset, "upOffset"), 33);
  head.writeBigUInt64BE(toU64(r.ack, "ack"), 41);
  head[49] = (r.close ? FLAG_CLOSE : 0) | (r.poll ? FLAG_POLL : 0) | (r.open ? FLAG_OPEN : 0);
  return Buffer.concat([head, r.data]);
}
function decodeResponse(b) {
  if (b.length < RESPONSE_HEAD) throw new PollFormatError("the answer is too short");
  if (b[0] !== POLL_VERSION) throw new PollFormatError("the answer is not a tunnel's");
  if (b.length - RESPONSE_HEAD > MAX_DOWN) throw new PollFormatError("the answer carries too much data");
  return {
    session: Buffer.from(b.subarray(1, 33)),
    downOffset: fromU64(b, 33, "downOffset"),
    closed: (b[41] & FLAG_CLOSED) !== 0,
    data: Buffer.from(b.subarray(RESPONSE_HEAD))
  };
}

// src/client/proxy-route.ts
import http from "node:http";
var LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|::1)$/i;
function bypassed(host, list) {
  return list.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).some((entry) => entry === "*" || entry === host || entry.startsWith(".") && host.endsWith(entry));
}
function proxyFor(target, env = process.env) {
  const host = target.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (LOOPBACK.test(host)) return null;
  const raw = (env.HTTPS_PROXY || env.https_proxy || "").trim();
  if (!raw) return null;
  if (bypassed(host, env.NO_PROXY || env.no_proxy || "")) return null;
  let url;
  try {
    url = new URL(raw.includes("://") ? raw : `http://${raw}`);
  } catch {
    throw new Error("HTTPS_PROXY is not a valid URL");
  }
  if (url.protocol !== "http:") throw new Error("HTTPS_PROXY must be an http:// proxy URL");
  const user = decodeURIComponent(url.username);
  const pass = decodeURIComponent(url.password);
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: Number(url.port || 80),
    ...user || pass ? { authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` } : {}
  };
}
var ProxyRefusedError = class extends Error {
  constructor(status) {
    super(status === 407 ? "the network's proxy needs credentials (HTTP 407): put them in HTTPS_PROXY as http://user:password@host:port" : `the network's proxy refused the connection (HTTP ${status})`);
    this.status = status;
  }
  status;
};
function connectVia(route, host, port) {
  const authority = host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
  const req = http.request({
    host: route.host,
    port: route.port,
    method: "CONNECT",
    path: authority,
    agent: false,
    headers: { Host: authority, ...route.authorization ? { "Proxy-Authorization": route.authorization } : {} }
  });
  const socket = new Promise((resolve, reject) => {
    req.on("connect", (res, sock, head) => {
      if (res.statusCode !== 200) {
        sock.destroy();
        reject(new ProxyRefusedError(res.statusCode ?? 0));
        return;
      }
      if (head.length) sock.unshift(head);
      resolve(sock);
    });
    req.on("response", (res) => {
      res.resume();
      reject(new ProxyRefusedError(res.statusCode ?? 0));
    });
    req.on("error", reject);
  });
  req.end();
  return { socket, abort: () => req.destroy() };
}

// src/client/ws-client.ts
import { createHash as createHash2, randomBytes } from "node:crypto";
import http2 from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { Duplex } from "node:stream";
import tls from "node:tls";

// src/client/ws-frame.ts
var OP = { cont: 0, text: 1, binary: 2, close: 8, ping: 9, pong: 10 };
var WsProtocolError = class extends Error {
};
function encodeFrame(opcode, payload, mask, fin = true) {
  const n = payload.length;
  const b0 = (fin ? 128 : 0) | opcode;
  const m = mask ? 128 : 0;
  let head;
  if (n < 126) head = Buffer.from([b0, m | n]);
  else if (n < 65536) head = Buffer.from([b0, m | 126, n >> 8, n & 255]);
  else {
    head = Buffer.alloc(10);
    head[0] = b0;
    head[1] = m | 127;
    head.writeBigUInt64BE(BigInt(n), 2);
  }
  if (!mask) return Buffer.concat([head, payload]);
  const body = Buffer.from(payload);
  for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3];
  return Buffer.concat([head, mask, body]);
}
var FrameParser = class {
  constructor(maxPayload = 16 * 1024 * 1024) {
    this.maxPayload = maxPayload;
  }
  maxPayload;
  buf = Buffer.alloc(0);
  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const out = [];
    for (; ; ) {
      if (this.buf.length < 2) return out;
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      if (b0 & 112) throw new WsProtocolError("reserved bits set");
      if (b1 & 128) throw new WsProtocolError("a server frame must not be masked");
      const opcode = b0 & 15;
      const fin = (b0 & 128) !== 0;
      let n = b1 & 127;
      let off = 2;
      if (n === 126) {
        if (this.buf.length < 4) return out;
        n = this.buf.readUInt16BE(2);
        off = 4;
      } else if (n === 127) {
        if (this.buf.length < 10) return out;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(this.maxPayload)) throw new WsProtocolError("frame too large");
        n = Number(big);
        off = 10;
      }
      if (n > this.maxPayload) throw new WsProtocolError("frame too large");
      if (opcode >= 8 && (n > 125 || !fin)) throw new WsProtocolError("bad control frame");
      if (this.buf.length < off + n) return out;
      out.push({ fin, opcode, payload: this.buf.subarray(off, off + n) });
      this.buf = this.buf.subarray(off + n);
    }
  }
};

// src/client/ws-client.ts
var TunnelBlockedError = class extends Error {
  constructor(status, detail) {
    super(detail ? `tunnel blocked: ${detail}` : `tunnel blocked (HTTP ${status})`);
    this.status = status;
  }
  status;
};
var GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
function defaultCa() {
  const get = tls.getCACertificates;
  if (!get) return void 0;
  try {
    return [...get("default"), ...get("system")];
  } catch {
    return void 0;
  }
}
function openWebSocket(url, opts) {
  const secure = url.protocol === "https:";
  const key = randomBytes(16).toString("base64");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const port = Number(url.port || (secure ? 443 : 80));
  return new Promise((resolve, reject) => {
    let done = false;
    let req;
    const connecting = {};
    const settle = (err, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      connecting.abort?.();
      req?.destroy();
      settle(new Error("tunnel connect timeout"));
    }, opts.timeoutMs ?? 15e3);
    timer.unref();
    const common = {
      host: hostname,
      port,
      path: url.pathname,
      method: "GET",
      headers: {
        Host: url.host,
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": key,
        "Sec-WebSocket-Protocol": opts.protocol,
        ...opts.userAgent ? { "User-Agent": opts.userAgent } : {}
      }
    };
    const outerTls = { ...isIP(hostname) ? {} : { servername: hostname }, rejectUnauthorized: false, ca: opts.ca ?? defaultCa() };
    const upgrade = (tunnelled) => {
      if (done) {
        tunnelled?.destroy();
        return;
      }
      const r = tunnelled ? http2.request({ ...common, createConnection: () => secure ? tls.connect({ ...outerTls, socket: tunnelled }) : tunnelled }) : secure ? https.request({ ...common, ...outerTls, agent: false }) : http2.request({ ...common, agent: false });
      req = r;
      r.on("response", (res) => {
        res.resume();
        settle(new TunnelBlockedError(res.statusCode ?? 0));
      });
      r.on("error", (err) => settle(err));
      r.on("upgrade", (res, sock, head) => {
        const accept = createHash2("sha1").update(key + GUID).digest("base64");
        if (done || res.headers["sec-websocket-accept"] !== accept || res.headers["sec-websocket-protocol"] !== opts.protocol) {
          sock.destroy();
          settle(new TunnelBlockedError(101));
          return;
        }
        const tlsSock = sock;
        const outer = !secure ? "plain" : tlsSock.authorized ? "verified" : "intercepted";
        const outerError = secure && !tlsSock.authorized && tlsSock.authorizationError ? String(tlsSock.authorizationError) : void 0;
        settle(null, { stream: wrap(sock, head, opts.pingMs ?? 3e4), outer, ...outerError ? { outerError } : {} });
      });
      r.end();
    };
    let route;
    try {
      route = proxyFor(url, opts.env ?? process.env);
    } catch (err) {
      settle(err);
      return;
    }
    if (!route) {
      upgrade();
      return;
    }
    const via = connectVia(route, hostname, port);
    connecting.abort = via.abort;
    via.socket.then(upgrade, (err) => settle(err instanceof ProxyRefusedError ? new TunnelBlockedError(err.status, err.message) : err));
  });
}
function wrap(sock, head, pingMs) {
  const parser = new FrameParser();
  let closeSent = false;
  const send2 = (opcode, payload, cb) => {
    sock.write(encodeFrame(opcode, payload, randomBytes(4)), cb);
  };
  const duplex = new Duplex({
    read() {
      sock.resume();
    },
    write(chunk, _enc, cb) {
      send2(OP.binary, chunk, cb);
    },
    final(cb) {
      if (!closeSent) {
        closeSent = true;
        send2(OP.close, Buffer.from([3, 232]));
      }
      sock.end();
      cb();
    },
    destroy(err, cb) {
      clearInterval(pinger);
      sock.destroy();
      cb(err);
    }
  });
  const failFrame = (err) => {
    setImmediate(() => duplex.destroy(err));
  };
  const onData = (chunk) => {
    let frames;
    try {
      frames = parser.push(chunk);
    } catch (err) {
      failFrame(err instanceof WsProtocolError ? err : new WsProtocolError(String(err)));
      return;
    }
    for (const f of frames) {
      if (f.opcode === OP.binary || f.opcode === OP.cont) {
        if (!duplex.push(Buffer.from(f.payload))) sock.pause();
      } else if (f.opcode === OP.ping) {
        send2(OP.pong, Buffer.from(f.payload));
      } else if (f.opcode === OP.close) {
        if (!closeSent) {
          closeSent = true;
          send2(OP.close, Buffer.from(f.payload.subarray(0, 2)));
        }
        duplex.push(null);
        sock.end();
      } else if (f.opcode === OP.text) {
        failFrame(new WsProtocolError("text frame on a binary tunnel"));
      }
    }
  };
  sock.on("data", onData);
  sock.on("end", () => duplex.push(null));
  sock.on("error", (err) => duplex.destroy(err));
  sock.on("close", () => {
    clearInterval(pinger);
    if (!duplex.destroyed) duplex.destroy();
  });
  const pinger = setInterval(() => send2(OP.ping, Buffer.alloc(0)), pingMs);
  pinger.unref();
  if (head.length) onData(head);
  return duplex;
}

// src/client/poll-client.ts
var SessionGoneError = class extends Error {
  constructor() {
    super("tunnel session gone");
  }
};
var EMPTY = Buffer.alloc(0);
var MAX_ANSWER = RESPONSE_HEAD + MAX_DOWN;
var FATAL_STATUS = /* @__PURE__ */ new Set([400, 403, 429]);
var delay = (ms) => new Promise((r) => setTimeout(r, ms));
function isBusy(r) {
  if (r.status !== 503 || r.body.length > 4096) return false;
  try {
    return JSON.parse(r.body.toString("utf8")).error?.type === TUNNEL_BUSY;
  } catch {
    return false;
  }
}
function settings(o) {
  return { timeoutMs: o.timeoutMs ?? 15e3, waitMs: o.waitMs ?? POLL_WAIT_MS, retryForMs: o.retryForMs ?? 3e4, busyForMs: o.busyForMs ?? 3e5, coalesceMs: o.coalesceMs ?? 5 };
}
function makeExchanger(base, o) {
  const secure = base.protocol === "https:";
  const hostname = base.hostname.replace(/^\[|\]$/g, "");
  const port = Number(base.port || (secure ? 443 : 80));
  const outerTls = { ...isIP2(hostname) ? {} : { servername: hostname }, rejectUnauthorized: false, ca: o.ca ?? defaultCa() };
  const route = proxyFor(base, o.env ?? process.env);
  const connectMs = o.timeoutMs ?? 15e3;
  const agent = secure ? new https2.Agent({ keepAlive: true, maxSockets: 2, ...outerTls }) : new http3.Agent({ keepAlive: true, maxSockets: 2 });
  if (route) {
    agent.createConnection = (_opts, cb) => {
      const via = connectVia(route, hostname, port);
      let settled = false;
      const once = (err, sock) => {
        if (settled) {
          sock?.destroy();
          return;
        }
        settled = true;
        clearTimeout(timer);
        cb(err, sock);
      };
      const timer = setTimeout(() => {
        once(new Error("tunnel connect timeout"));
        via.abort();
      }, connectMs);
      via.socket.then(
        (sock) => once(null, secure ? tls2.connect({ ...outerTls, socket: sock }) : sock),
        (err) => once(err instanceof ProxyRefusedError ? new TunnelBlockedError(err.status, err.message) : err)
      );
      return void 0;
    };
  }
  const post = (body, timeoutMs) => new Promise((resolve, reject) => {
    const req = (secure ? https2 : http3).request({
      host: hostname,
      port,
      path: POLL_PATH,
      method: "POST",
      agent,
      ...secure ? outerTls : {},
      headers: {
        Host: base.host,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(body.length),
        ...o.userAgent ? { "User-Agent": o.userAgent } : {}
      }
    }, (res) => {
      const sock = res.socket;
      const outer = !secure ? "plain" : sock?.authorized ? "verified" : "intercepted";
      const outerError = secure && !sock?.authorized && sock?.authorizationError ? String(sock.authorizationError) : void 0;
      const chunks = [];
      let size = 0;
      res.on("data", (c) => {
        size += c.length;
        if (size > MAX_ANSWER) {
          req.destroy(new Error("tunnel answer too large"));
          return;
        }
        chunks.push(c);
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks), outer, ...outerError ? { outerError } : {} }));
      res.on("error", reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("tunnel exchange timeout")));
    req.on("error", reject);
    req.end(body);
  });
  return { post, destroy: () => agent.destroy() };
}
var PollStream = class {
  constructor(ex, session, opts) {
    this.ex = ex;
    this.session = session;
    this.o = settings(opts);
    this.duplex = new Duplex2({
      read: () => void 0,
      write: (chunk, _enc, cb) => {
        this.pending.push(Buffer.from(chunk));
        this.pendingSize += chunk.length;
        if (this.pendingSize > MAX_UP) this.held.push(() => cb());
        else cb();
        this.kickUp();
      },
      final: (cb) => {
        this.finishing = true;
        this.kickUp();
        cb();
      },
      destroy: (err, cb) => {
        this.shutdown(true);
        cb(err);
      }
    });
    void this.downLoop();
  }
  ex;
  session;
  duplex;
  o;
  /** Upstream bytes the proxy has confirmed. */
  sent = 0;
  /** Downstream bytes received. */
  received = 0;
  pending = [];
  pendingSize = 0;
  held = [];
  upRunning = false;
  finishing = false;
  closed = false;
  kickUp() {
    if (!this.upRunning && !this.closed) void this.upLoop();
  }
  async upLoop() {
    this.upRunning = true;
    try {
      await delay(this.o.coalesceMs);
      while (!this.closed && this.pendingSize > 0) {
        const data = this.takePending();
        await this.exchange({ session: this.session, upOffset: this.sent, ack: this.received, close: false, poll: false, open: false, data }, this.o.timeoutMs);
        this.sent += data.length;
        while (this.held.length > 0 && this.pendingSize <= MAX_UP) this.held.shift()();
      }
      if (this.finishing && !this.closed && this.pendingSize === 0) this.shutdown(true);
    } catch (err) {
      this.fail(err);
    } finally {
      this.upRunning = false;
    }
    if (!this.closed && this.pendingSize > 0) this.kickUp();
  }
  takePending() {
    const all = Buffer.concat(this.pending);
    const data = all.subarray(0, MAX_UP);
    const rest = all.subarray(MAX_UP);
    this.pending = rest.length > 0 ? [rest] : [];
    this.pendingSize = rest.length;
    return data;
  }
  async downLoop() {
    try {
      while (!this.closed) {
        const r = await this.exchange({ session: this.session, upOffset: this.sent, ack: this.received, close: false, poll: true, open: false, data: EMPTY }, this.o.waitMs + this.o.timeoutMs);
        if (this.closed) return;
        if (r.downOffset > this.received) throw new Error("tunnel stream out of order");
        const skip = this.received - r.downOffset;
        if (skip < r.data.length) {
          const fresh = Buffer.from(r.data.subarray(skip));
          this.received += fresh.length;
          this.duplex.push(fresh);
        }
        if (r.closed) {
          this.duplex.push(null);
          this.shutdown(true);
          return;
        }
      }
    } catch (err) {
      this.fail(err);
    }
  }
  async exchange(req, timeoutMs) {
    const body = encodeRequest(req);
    let firstFailure = 0;
    let firstBusy = 0;
    let wait = 250;
    for (; ; ) {
      if (this.closed) throw new Error("tunnel closed");
      let failure;
      let busy = false;
      try {
        const r = await this.ex.post(body, timeoutMs);
        if (r.status === 200) return decodeResponse(r.body);
        if (r.status === 404) throw new SessionGoneError();
        failure = new TunnelBlockedError(r.status);
        if (FATAL_STATUS.has(r.status)) throw failure;
        busy = isBusy(r);
      } catch (err) {
        if (err instanceof SessionGoneError || err instanceof PollFormatError) throw err;
        if (err instanceof TunnelBlockedError && FATAL_STATUS.has(err.status)) throw err;
        failure = err;
      }
      if (busy) {
        const t2 = Date.now();
        if (firstBusy === 0) firstBusy = t2;
        if (t2 - firstBusy >= this.o.busyForMs) throw failure;
        firstFailure = 0;
        await delay(Math.min(wait, 1e3));
        wait = Math.min(wait * 2, 4e3);
        continue;
      }
      const t = Date.now();
      if (firstFailure === 0) firstFailure = t;
      if (t - firstFailure >= this.o.retryForMs) throw failure;
      await delay(wait);
      wait = Math.min(wait * 2, 4e3);
    }
  }
  fail(err) {
    if (this.closed) return;
    this.closed = true;
    this.ex.destroy();
    this.duplex.destroy(err);
  }
  shutdown(sendClose) {
    if (this.closed) return;
    this.closed = true;
    if (sendClose) {
      const bye = encodeRequest({ session: this.session, upOffset: this.sent, ack: this.received, close: true, poll: false, open: false, data: EMPTY });
      this.ex.post(bye, 5e3).catch(() => void 0).finally(() => this.ex.destroy());
    } else {
      this.ex.destroy();
    }
    if (!this.duplex.destroyed) this.duplex.destroy();
  }
};
async function openPollStream(base, opts = {}) {
  const ex = makeExchanger(base, opts);
  const session = randomBytes2(SESSION_BYTES);
  const open2 = encodeRequest({ session, upOffset: 0, ack: 0, close: false, poll: false, open: true, data: EMPTY });
  const o = settings(opts);
  let first;
  let firstFailure = 0;
  let wait = 100;
  while (first === void 0) {
    try {
      first = await ex.post(open2, o.timeoutMs);
    } catch (err) {
      const t = Date.now();
      if (firstFailure === 0) firstFailure = t;
      if (err.code !== "ECONNRESET" || t - firstFailure >= o.retryForMs) {
        ex.destroy();
        throw err;
      }
      await delay(wait);
      wait = Math.min(wait * 2, 4e3);
    }
  }
  if (first.status !== 200) {
    ex.destroy();
    throw new TunnelBlockedError(first.status);
  }
  let answered;
  try {
    answered = decodeResponse(first.body).session;
  } catch {
  }
  if (!answered?.equals(session)) {
    ex.destroy();
    throw new TunnelBlockedError(200, "the answer is not the tunnel's (a filter's page?)");
  }
  const stream = new PollStream(ex, session, opts).duplex;
  return { stream, outer: first.outer, ...first.outerError ? { outerError: first.outerError } : {} };
}

// src/client/inner.ts
var IdentityMismatchError = class extends Error {
  constructor(received) {
    super("tunnel identity mismatch");
    this.received = received;
  }
  received;
};
async function connectInner(base, pins, opts = {}) {
  const outerOpts = { timeoutMs: opts.timeoutMs, ca: opts.ca, userAgent: opts.userAgent, env: opts.env };
  const ws = opts.transport === "post" ? await openPollStream(base, outerOpts) : await openWebSocket(new URL(TUNNEL_PATH, base), { protocol: TUNNEL_PROTOCOL, ...outerOpts });
  opts.onOuter?.({ outer: ws.outer, ...ws.outerError ? { outerError: ws.outerError } : {} });
  const preferred = pins.at(-1);
  const servername = preferred && isPin(preferred) ? sniOfPin(preferred) : TUNNEL_SERVERNAME;
  const socket = tls3.connect({ socket: ws.stream, servername, minVersion: "TLSv1.3", rejectUnauthorized: false, ALPNProtocols: ["http/1.1"] });
  ws.stream.on("close", () => socket.destroy());
  ws.stream.on("end", () => socket.destroy());
  ws.stream.on("error", () => socket.destroy());
  socket.on("close", () => ws.stream.destroy());
  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.off("close", onClose);
        socket.off("secureConnect", onSecure);
        if (err === null) {
          socket.off("error", onError);
          resolve();
          return;
        }
        socket.once("close", () => socket.off("error", onError));
        reject(err);
      };
      const onError = (err) => finish(err);
      const onClose = () => finish(new Error("tunnel closed during handshake"));
      const onSecure = () => finish(null);
      const timer = setTimeout(() => finish(new Error("tunnel handshake timeout")), opts.timeoutMs ?? 15e3);
      timer.unref();
      socket.on("error", onError);
      socket.on("close", onClose);
      socket.on("secureConnect", onSecure);
    });
  } catch (err) {
    socket.destroy();
    throw err;
  }
  socket.on("error", () => socket.destroy());
  const peer = peerCertificate(socket);
  const received = peer ? pinOfSpki(peer.publicKey.export({ type: "spki", format: "der" })) : "none";
  if (!pins.includes(received)) {
    socket.destroy();
    throw new IdentityMismatchError(received);
  }
  return socket;
}

// src/client/local-server.ts
import { createHash as createHash3, randomBytes as randomBytes3, timingSafeEqual } from "node:crypto";
import http5 from "node:http";

// src/client/tunnel-agent.ts
import http4 from "node:http";
var TUNNEL_AGENT_MAX_SOCKETS = 4;
function canSwitch(err) {
  if (err instanceof IdentityMismatchError || err instanceof BackoffError) return false;
  if (err instanceof TunnelBlockedError && (err.status === 429 || err.status === 503)) return false;
  return true;
}
function reasonOf(err) {
  if (err instanceof TunnelBlockedError) return err.status === 101 || err.status === 200 ? err.message : `HTTP ${err.status}`;
  return err instanceof Error ? err.message : String(err);
}
var BackoffError = class extends Error {
  constructor(waitMs) {
    super("tunnel identity mismatch - waiting before retry");
    this.waitMs = waitMs;
  }
  waitMs;
};
var baseAddRequest = http4.Agent.prototype.addRequest;
var TunnelAgent = class extends http4.Agent {
  constructor(target, backoff, events = {}) {
    super({ keepAlive: true, maxSockets: TUNNEL_AGENT_MAX_SOCKETS, maxFreeSockets: TUNNEL_AGENT_MAX_SOCKETS });
    this.target = target;
    this.backoff = backoff;
    this.events = events;
    this.mode = target.transport ?? "auto";
    this.using = this.mode === "post" ? "post" : "ws";
    this.connect = target.connect ?? connectInner;
    this.pins = [...target.pins];
    this.targets = [target.url, ...target.urls ?? []];
    this.on("free", () => this.drain());
  }
  target;
  backoff;
  events;
  /** Tunnels being opened: not yet in `sockets`, where Node would count them. */
  opening = 0;
  /** Requests waiting for a tunnel, in arrival order. */
  waiting = [];
  using;
  mode;
  connect;
  pins;
  /** Every host the code names, first one first; `preferred` indexes it. */
  targets;
  preferred = 0;
  /** Destroyed: no tunnel is opened any more, and one still opening is closed when it arrives. */
  closed = false;
  /**
   * The pins new tunnels are checked against (and the newest one asked for),
   * from now on: what pin-sync learned through a pinned tunnel. Tunnels
   * already open keep going.
   */
  setPins(pins) {
    this.pins = [...pins];
  }
  get transport() {
    return this.using;
  }
  live() {
    let n = this.opening;
    for (const list of Object.values(this.sockets)) n += list?.length ?? 0;
    for (const list of Object.values(this.freeSockets)) n += list?.length ?? 0;
    return n;
  }
  hasFree() {
    return Object.values(this.freeSockets).some((list) => list?.some((s) => !s.destroyed));
  }
  canServe() {
    return this.hasFree() || this.live() < TUNNEL_AGENT_MAX_SOCKETS;
  }
  /** Called by http.ClientRequest for every request; not in @types/node. */
  addRequest(req, options) {
    if (!this.canServe()) {
      this.waiting.push({ req, options });
      req.once("close", () => {
        const i = this.waiting.findIndex((w) => w.req === req);
        if (i >= 0) this.waiting.splice(i, 1);
      });
      return;
    }
    baseAddRequest.call(this, req, options);
  }
  drain() {
    while (this.waiting.length > 0 && this.canServe()) {
      const next = this.waiting.shift();
      if (next.req.destroyed) continue;
      baseAddRequest.call(this, next.req, next.options);
    }
  }
  /** Whether destroy() ran: the agent opens nothing any more. */
  get destroyed() {
    return this.closed;
  }
  destroy() {
    this.closed = true;
    for (const { req } of this.waiting.splice(0)) {
      const err = new Error("tunnel agent closed");
      req.destroy(err);
      process.nextTick(() => req.emit("error", err));
    }
    super.destroy();
  }
  // Node calls this with a callback for asynchronous sockets; returning nothing
  // tells it to wait for the callback.
  createConnection(_options, callback) {
    const done = callback ?? (() => void 0);
    if (this.closed) {
      done(new Error("tunnel agent closed"), void 0);
      return void 0;
    }
    const wait = this.backoff.blockedMs();
    if (wait > 0) {
      done(new BackoffError(wait), void 0);
      return void 0;
    }
    this.opening += 1;
    const dial = (host, transport) => this.connect(this.targets[host], this.pins, { ca: this.target.ca, userAgent: this.target.userAgent, env: this.target.env, transport, onOuter: (i) => this.events.onOuter?.(i) });
    const hosts = this.targets.map((_, i) => (this.preferred + i) % this.targets.length);
    const transports = this.mode === "auto" ? this.using === "ws" ? ["ws", "post"] : ["post"] : [this.using === "post" ? "post" : "ws"];
    const chain = transports.flatMap((transport) => hosts.map((host) => ({ host, transport })));
    let firstErr = null;
    const run = (i) => {
      const at = chain[i];
      return dial(at.host, at.transport).then(
        (socket) => {
          if (this.preferred !== at.host) this.preferred = at.host;
          if (this.mode === "auto" && this.using !== "post" && at.transport === "post") {
            this.using = "post";
            this.events.onTransport?.("post", firstErr === null ? null : `websocket blocked: ${reasonOf(firstErr)}`);
          }
          return socket;
        },
        (err) => {
          if (!(err instanceof Error)) throw err;
          if (firstErr === null) firstErr = err;
          if (i + 1 < chain.length && canSwitch(err)) return run(i + 1);
          throw err instanceof IdentityMismatchError ? err : firstErr;
        }
      );
    };
    run(0).then(
      (socket) => {
        this.opening -= 1;
        if (this.closed) {
          socket.destroy();
          done(new Error("tunnel agent closed"), void 0);
          return;
        }
        this.backoff.success();
        this.events.onConnected?.();
        socket.once("close", () => process.nextTick(() => this.drain()));
        done(null, socket);
      },
      (err) => {
        this.opening -= 1;
        if (err instanceof IdentityMismatchError) {
          this.backoff.failure();
          this.events.onMismatch?.(err.received);
        }
        done(err, void 0);
        this.drain();
      }
    );
    return void 0;
  }
};

// src/client/local-server.ts
function newLocalKey() {
  return `o1gwl_${randomBytes3(32).toString("base64url")}`;
}
function hashLocalKey(key) {
  return createHash3("sha256").update(key, "utf8").digest("hex");
}
var HOP = /* @__PURE__ */ new Set(["connection", "keep-alive", "proxy-authorization", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade", "host", "authorization", "x-api-key"]);
var LOOPBACK2 = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "[::1]"]);
function send(res, status, message) {
  const body = JSON.stringify({ type: "error", error: { type: "tunnel_error", message } });
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) }).end(body);
}
function keyOf(req) {
  const bearer = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization ?? "").trim());
  if (bearer) return bearer[1].trim();
  const k = req.headers["x-api-key"];
  return typeof k === "string" && k.trim() ? k.trim() : void 0;
}
function sameHash(a, b) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
var REPLAY_MAX_BYTES = 10 * 1024 * 1024;
function deadTunnel(err, reusedSocket) {
  if (err instanceof SessionGoneError) return true;
  const code = err?.code;
  return reusedSocket && (code === "ECONNRESET" || code === "EPIPE");
}
function describeError(err) {
  if (err instanceof BackoffError) return `tunnel identity mismatch - waiting before retry (${Math.ceil(err.waitMs / 6e4)} min)`;
  if (err instanceof IdentityMismatchError) return "tunnel identity mismatch";
  if (err instanceof TunnelBlockedError) return err.message;
  return "tunnel unavailable";
}
function startLocalServer(o) {
  const server = http5.createServer((req, res) => {
    const started = Date.now();
    const route = (req.url ?? "/").split("?")[0].slice(0, 200);
    const hostname = String(req.headers.host ?? "").toLowerCase().replace(/:\d+$/, "");
    if (!LOOPBACK2.has(hostname)) return send(res, 403, "this endpoint answers on 127.0.0.1 only");
    if (req.headers.origin !== void 0) return send(res, 403, "browser requests are not accepted");
    const key = keyOf(req);
    if (!key || !sameHash(hashLocalKey(key), o.localKeyHash)) return send(res, 401, "invalid or missing local key");
    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) if (!HOP.has(name) && value !== void 0) headers[name] = value;
    headers.host = o.target.host;
    headers.authorization = `Bearer ${o.deviceToken}`;
    let kept = [];
    let keptBytes = 0;
    req.on("data", (c) => {
      if (!kept) return;
      keptBytes += c.length;
      if (keptBytes > REPLAY_MAX_BYTES) kept = null;
      else kept.push(c);
    });
    let upstream;
    const forward = (replay) => {
      const via = replay ? { createConnection: (opts, cb) => o.agent.createConnection(opts, cb) } : { agent: o.agent };
      const current = http5.request({ ...via, method: req.method, path: req.url, headers, setHost: false }, (up) => {
        const out = {};
        for (const [name, value] of Object.entries(up.headers)) if (!HOP.has(name) && value !== void 0) out[name] = value;
        res.writeHead(up.statusCode ?? 502, out);
        up.pipe(res);
        up.on("error", () => res.destroy());
        up.on("end", () => o.log?.(`${req.method} ${route} status=${up.statusCode} total=${Date.now() - started}ms`));
      });
      upstream = current;
      current.on("error", (err) => {
        if (!replay && !res.headersSent && kept && deadTunnel(err, current.reusedSocket)) {
          o.log?.(`${req.method} ${route} retry: the tunnel was gone`);
          const again = () => {
            if (kept && !res.destroyed) forward(true);
            else if (!res.destroyed) send(res, 502, describeError(err));
          };
          if (req.readableEnded) again();
          else {
            req.once("end", again);
            req.resume();
          }
          return;
        }
        o.log?.(`${req.method} ${route} failed: ${describeError(err)}`);
        if (res.headersSent) res.destroy();
        else if (err instanceof TunnelBlockedError && err.status === 429) send(res, 429, "Too many attempts");
        else send(res, 502, describeError(err));
      });
      if (replay) current.end(Buffer.concat(kept ?? []));
      else req.pipe(current);
    };
    forward(false);
    res.on("close", () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.on("error", () => upstream.destroy());
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(o.port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

// src/client/backoff.ts
var IdentityBackoff = class {
  constructor(now = Date.now, baseMs = 6e4, maxMs = 60 * 6e4) {
    this.now = now;
    this.baseMs = baseMs;
    this.maxMs = maxMs;
  }
  now;
  baseMs;
  maxMs;
  failures = 0;
  until = 0;
  count = 0;
  since = null;
  blockedMs() {
    return Math.max(0, this.until - this.now());
  }
  failure() {
    const t = this.now();
    this.count += 1;
    this.since ??= t;
    this.until = t + Math.min(this.baseMs * 2 ** this.failures, this.maxMs);
    this.failures += 1;
  }
  success() {
    this.failures = 0;
    this.until = 0;
    this.count = 0;
    this.since = null;
  }
  snapshot() {
    return { mismatches: this.count, since: this.since, waitMs: this.blockedMs() };
  }
};

// src/client/pin-sync.ts
import http6 from "node:http";
import tls4 from "node:tls";
function mergePins(own, listed, via) {
  const unchanged = { pins: [...own], added: [], dropped: [] };
  if (via === null || !own.includes(via)) return unchanged;
  if (!Array.isArray(listed) || listed.length === 0 || listed.length > MAX_PINS || !listed.every((p) => typeof p === "string" && isPin(p))) return unchanged;
  const list = [...new Set(listed)];
  const added = list.filter((p) => !own.includes(p));
  if (list.includes(via)) {
    return { pins: list, added, dropped: own.filter((p) => !list.includes(p)) };
  }
  const room = Math.max(0, MAX_PINS - own.length);
  const learned = room > 0 ? added.slice(-room) : [];
  return { pins: [...own, ...learned], added: learned, dropped: [] };
}
function pinOfSocket(socket) {
  if (!(socket instanceof tls4.TLSSocket)) return null;
  const peer = peerCertificate(socket);
  return peer ? pinOfSpki(peer.publicKey.export({ type: "spki", format: "der" })) : null;
}
var MAX_BODY = 16 * 1024;
var short = (pin) => fingerprint(pin).slice(0, 19);
var PinSync = class {
  constructor(o) {
    this.o = o;
    this.current = [...o.pins];
  }
  o;
  current;
  last = Number.NEGATIVE_INFINITY;
  running = null;
  /** The pins in memory are not on disk yet (a save failed). */
  unsaved = false;
  /** config.bin belongs to another configuration now: nothing more is saved by this run. */
  saveStopped = false;
  get pins() {
    return [...this.current];
  }
  /** Asks the proxy now; one request at a time. */
  syncNow() {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }
  /** Asks when the last try is older than the interval; failures are logged, never thrown. */
  maybeSync() {
    const now = (this.o.now ?? Date.now)();
    if (this.running || now - this.last < (this.o.intervalMs ?? 36e5)) return;
    this.last = now;
    this.syncNow().catch((err) => this.o.log?.(`pin check failed: ${err instanceof Error ? err.message : String(err)}`));
  }
  async run() {
    this.last = (this.o.now ?? Date.now)();
    const { listed, via } = await this.fetch();
    const merged = mergePins(this.current, listed, via);
    const changed = merged.pins.length !== this.current.length || merged.pins.some((p, i) => p !== this.current[i]);
    if (changed) {
      this.current = merged.pins;
      this.o.onChange?.(this.pins);
      this.o.log?.(`proxy keys updated through the pinned tunnel: ${merged.added.map((p) => `+${short(p)}`).concat(merged.dropped.map((p) => `-${short(p)}`)).join(" ")}`);
    }
    if ((changed || this.unsaved) && !this.saveStopped) {
      try {
        if (await this.o.save(this.pins) === false) {
          this.saveStopped = true;
          this.o.log?.(this.o.stoppedLine ?? "config.bin now holds another configuration (setup ran since): the proxy keys learned by this run are no longer saved");
        }
        this.unsaved = false;
      } catch (err) {
        this.unsaved = true;
        this.o.log?.(`could not save the proxy keys (tried again at the next check): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { ...merged, via };
  }
  fetch() {
    const { target } = this.o;
    return new Promise((resolve, reject) => {
      const req = http6.request({
        host: target.hostname,
        port: target.port,
        method: "GET",
        path: TUNNEL_PINS_PATH,
        agent: this.o.agent,
        setHost: false,
        headers: { host: target.host, authorization: `Bearer ${this.o.deviceToken}`, accept: "application/json" }
      }, (res) => {
        const via = pinOfSocket(res.socket);
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size > MAX_BODY) req.destroy(new Error("pin list too large"));
          else chunks.push(c);
        });
        res.on("error", reject);
        res.on("end", () => {
          if (res.statusCode !== 200) return reject(new Error(`the proxy answered ${res.statusCode ?? 0} for its pins`));
          try {
            resolve({ listed: JSON.parse(Buffer.concat(chunks).toString("utf8")).pins, via });
          } catch {
            reject(new Error("the proxy's pin list is not JSON"));
          }
        });
      });
      req.setTimeout(this.o.timeoutMs ?? 3e4, () => req.destroy(new Error("pin check timeout")));
      req.on("error", reject);
      req.end();
    });
  }
};

// src/client/session.ts
async function startTunnelSession(o) {
  const target = new URL(o.url);
  const failover = (o.urls ?? []).map((u) => new URL(u));
  const backoff = o.backoff ?? new IdentityBackoff();
  const agent = new TunnelAgent({ url: target, urls: failover, pins: o.pins, userAgent: o.userAgent, transport: o.transport }, backoff, {
    onOuter: o.onOuter,
    onConnected: () => {
      setImmediate(() => {
        if (!agent.destroyed) pinSync.maybeSync();
      });
      o.onConnected?.();
    },
    onMismatch: o.onMismatch,
    onTransport: o.onTransport
  });
  const pinSync = new PinSync({
    agent,
    target,
    deviceToken: o.deviceToken,
    pins: o.pins,
    log: o.log,
    onChange: (pins) => agent.setPins(pins),
    save: o.savePins,
    stoppedLine: o.savePinsStoppedLine
  });
  let server;
  try {
    server = await startLocalServer({ port: o.port, localKeyHash: o.localKeyHash, deviceToken: o.deviceToken, target, agent, log: o.log });
  } catch (err) {
    agent.destroy();
    throw err;
  }
  let closing = null;
  const close = () => {
    closing ??= new Promise((resolve) => {
      agent.destroy();
      server.close(() => resolve());
      server.closeIdleConnections();
      setImmediate(() => server.closeAllConnections());
    });
    return closing;
  };
  return { agent, pinSync, server, target, port: server.address().port, close };
}

// src/client/version.ts
var VERSION = true ? "9.2.0" : "dev";

// src/client/lib.ts
var version = VERSION;
var O1ConnectError = class extends Error {
  code;
  constructor(code, message, options) {
    super(message, options);
    this.name = "O1ConnectError";
    this.code = code;
  }
};
var DEFAULT_NAME = "aipp-connect";
var TRANSPORTS = ["auto", "websocket", "post"];
function entryName(name) {
  if (name === void 0) return DEFAULT_NAME;
  if (typeof name !== "string" || name.trim() === "") throw new TypeError("name must be a non-empty string");
  return name;
}
function checkStore(store) {
  const s = store;
  if (!s || typeof s.get !== "function" || typeof s.set !== "function" || typeof s.delete !== "function") {
    throw new TypeError("store must implement get, set and delete");
  }
  return s;
}
var entryLocks = /* @__PURE__ */ new WeakMap();
function withEntry(store, name, fn) {
  let byName = entryLocks.get(store);
  if (!byName) {
    byName = /* @__PURE__ */ new Map();
    entryLocks.set(store, byName);
  }
  const map = byName;
  const run = (map.get(name) ?? Promise.resolve()).then(fn);
  const tail = run.then(() => void 0, () => void 0);
  map.set(name, tail);
  void tail.then(() => {
    if (map.get(name) === tail) map.delete(name);
  });
  return run;
}
async function viaStore(what, call) {
  try {
    return await call();
  } catch (err) {
    throw new O1ConnectError("store_failed", `the secret store failed to ${what}`, { cause: err });
  }
}
function parseSaved(raw) {
  let o;
  try {
    o = JSON.parse(String(raw));
  } catch {
    throw new O1ConnectError("invalid_config", "the saved configuration is not JSON: run setup again");
  }
  if (!o || typeof o !== "object" || o.v !== 1) throw new O1ConnectError("invalid_config", "the saved configuration is not one this library knows: run setup again");
  let code;
  try {
    code = validateCode(o);
  } catch (err) {
    throw new O1ConnectError("invalid_config", `the saved configuration is not valid (${err instanceof Error ? err.message : String(err)}): run setup again`);
  }
  const transport = o.transport ?? "auto";
  if (!TRANSPORTS.includes(transport)) throw new O1ConnectError("invalid_config", "the saved transport is not auto, websocket or post: run setup again");
  return { v: 1, ...code, transport };
}
async function setup(code, opts) {
  const store = checkStore(opts?.store);
  if (typeof opts.onFingerprint !== "function") throw new TypeError("onFingerprint is required: every key's fingerprint must be confirmed by the user");
  const name = entryName(opts.name);
  const transport = opts.transport ?? "auto";
  if (!TRANSPORTS.includes(transport)) throw new TypeError("transport must be auto, websocket or post");
  let decoded;
  try {
    decoded = decodeConnectionCode(String(code ?? ""));
  } catch (err) {
    throw new O1ConnectError("invalid_code", err instanceof ConnectionCodeError ? err.message : "the connection code is not valid");
  }
  const fingerprints = decoded.pins.map((p) => fingerprint(p));
  const info = { device: decoded.device, url: decoded.url, ...decoded.urls ? { urls: [...decoded.urls] } : {} };
  if (await opts.onFingerprint([...fingerprints], { ...info }) !== true) {
    throw new O1ConnectError("fingerprint_rejected", "the proxy keys were not confirmed: nothing was saved");
  }
  const saved = { v: 1, ...decoded, transport };
  await withEntry(store, name, () => viaStore("save the configuration", () => store.set(name, JSON.stringify(saved))));
  return { ...info, fingerprints };
}
async function open(opts) {
  const store = checkStore(opts?.store);
  const name = entryName(opts.name);
  const port = opts.port ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError("port must be an integer from 0 to 65535");
  const raw = await viaStore("read the configuration", () => store.get(name));
  if (raw === null || raw === void 0) throw new O1ConnectError("not_set_up", "no o1-connect configuration in the store: run setup with a connection code");
  const cfg = parseSaved(raw);
  const log = opts.log ? (line) => {
    try {
      opts.log(line);
    } catch {
    }
  } : void 0;
  const apiKey = newLocalKey();
  let session;
  try {
    session = await startTunnelSession({
      url: cfg.url,
      urls: cfg.urls,
      pins: cfg.pins,
      deviceToken: cfg.token,
      transport: cfg.transport,
      port,
      localKeyHash: hashLocalKey(apiKey),
      userAgent: `o1-connect-lib/${VERSION}`,
      log,
      onMismatch: (received) => {
        log?.(`TUNNEL IDENTITY MISMATCH: received ${received}; possible interception`);
        try {
          opts.onMismatch?.(received);
        } catch {
        }
      },
      onTransport: (t, reason) => log?.(`${reason ?? "transport"}, using ${t}`),
      // Pins learned during a key rotation: saved only while the store still holds this
      // configuration (same proxy, device and token), under the entry's lock; false (never
      // tried again by this connection) once setup replaced it or forget deleted it.
      savePinsStoppedLine: "the store now holds another configuration, or none (setup or forget ran since): the proxy keys learned by this connection are no longer saved",
      savePins: (pins) => withEntry(store, name, async () => {
        const raw2 = await viaStore("read the configuration", () => store.get(name));
        if (raw2 === null || raw2 === void 0) return false;
        let current;
        try {
          current = parseSaved(raw2);
        } catch {
          return false;
        }
        if (current.url !== cfg.url || current.device !== cfg.device || current.token !== cfg.token) return false;
        await viaStore("save the configuration", () => store.set(name, JSON.stringify({ ...current, pins })));
        return true;
      })
    });
  } catch (err) {
    const code = err.code;
    if (code === "EADDRINUSE") throw new O1ConnectError("port_in_use", `port ${port} is in use`);
    if (code === "EACCES" || code === "EADDRNOTAVAIL") throw new O1ConnectError("port_unavailable", `cannot listen on 127.0.0.1:${port} (${code})`, { cause: err });
    throw err;
  }
  if (opts.check !== false) {
    try {
      await session.pinSync.syncNow();
    } catch (err) {
      await session.close();
      if (err instanceof IdentityMismatchError || err instanceof BackoffError) {
        throw new O1ConnectError("identity_mismatch", "the proxy presented a key that is not pinned: possible interception (nothing was sent)");
      }
      throw new O1ConnectError("tunnel_unavailable", `the tunnel did not answer: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const baseUrl = `http://127.0.0.1:${session.port}`;
  log?.(`o1-connect library ${VERSION} for ${cfg.device} listening on ${baseUrl} (transport ${cfg.transport})`);
  return { baseUrl, openaiBaseUrl: `${baseUrl}/v1`, apiKey, port: session.port, device: cfg.device, close: session.close };
}
async function forget(opts) {
  const store = checkStore(opts?.store);
  const name = entryName(opts.name);
  await withEntry(store, name, () => viaStore("delete the configuration", () => store.delete(name)));
}
var MemorySecretStore = class {
  #values = /* @__PURE__ */ new Map();
  async get(name) {
    return this.#values.get(name) ?? null;
  }
  async set(name, value) {
    this.#values.set(name, String(value));
  }
  async delete(name) {
    this.#values.delete(name);
  }
};
export {
  MemorySecretStore,
  O1ConnectError,
  forget,
  open,
  setup,
  version
};
