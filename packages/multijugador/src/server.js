// Servidor WebSocket del multijugador de La Malkevnia.
// Sin cuentas: cada pestaña es un visitante anónimo con un nombre elegido.
//
//   GET  /health  -> "ok"
//   GET  /stats   -> { players, rooms: { sala: n }, max }   (para "3 viajeros a bordo")
//   WS   /ws      -> protocolo descrito en README.md

import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { createHub, CLOSE } from './core.js';

const env = process.env;
const int = (v, d, min, max) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

const MAX_BUFFERED = 256 * 1024; // un cliente que no lee no puede acumular más

/**
 * Clave de IP para los límites: IPv4 tal cual (también si viene como
 * ::ffff:a.b.c.d) e IPv6 agrupada por su /64, que es lo que suele tener un hogar.
 */
export function ipKey(raw) {
  let ip = String(raw || '').trim().toLowerCase();
  if (!ip) return 'unknown';
  if (ip.startsWith('[')) ip = ip.slice(1, ip.indexOf(']'));
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return mapped[1];
  if (!ip.includes(':')) return ip;
  ip = ip.split('%')[0];
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return `${full.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/**
 * IP del cliente. Detrás de nuestro proxy, la buena es la ÚLTIMA de
 * X-Forwarded-For (la que añade el proxy); las anteriores las puede inventar
 * cualquiera.
 */
export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) {
      const hops = String(fwd).split(',').map((s) => s.trim()).filter(Boolean);
      if (hops.length) return ipKey(hops[hops.length - 1]);
    }
  }
  return ipKey(req.socket.remoteAddress);
}

export function startServer(overrides = {}) {
  const { hub: hubOverrides = {}, ...rest } = overrides;
  const cfg = {
    port: int(env.PORT, 8787, 0, 65535),
    host: env.HOST || '0.0.0.0',
    path: env.WS_PATH || '/ws',
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    trustProxy: env.TRUST_PROXY === '1',
    heartbeatMs: int(env.HEARTBEAT_MS, 15000, 1000, 120000),
    hub: {
      maxPlayers: int(env.MAX_PLAYERS, 64, 1, 1000),
      maxPerIp: int(env.MAX_PER_IP, 4, 1, 100),
      tickHz: int(env.TICK_HZ, 10, 1, 30),
      reservedNames: env.RESERVED_NAMES === undefined ? ['Malkev'] : list(env.RESERVED_NAMES),
      captainKey: env.CAPTAIN_KEY || '',
    },
    quiet: false,
    ...rest,
  };
  cfg.hub = { ...cfg.hub, ...hubOverrides };
  const log = (...a) => { if (!cfg.quiet) console.log(new Date().toISOString(), ...a); };

  if (cfg.hub.captainKey && cfg.hub.captainKey.length < 24) {
    throw new Error('CAPTAIN_KEY debe tener al menos 24 caracteres');
  }

  const hub = createHub(cfg.hub);

  const originAllowed = (origin) => !cfg.allowedOrigins.length || cfg.allowedOrigins.includes(origin);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const origin = req.headers.origin;
    if (origin && originAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    } else if (req.method === 'GET' && url.pathname === '/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(hub.stats()));
    } else {
      res.writeHead(404).end();
    }
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;

  const wss = new WebSocketServer({
    server,
    path: cfg.path,
    maxPayload: 1024,
    perMessageDeflate: false,
    verifyClient: ({ origin }) => originAllowed(origin),
  });

  wss.on('connection', (ws, req) => {
    const joined = hub.join({
      ip: clientIp(req, cfg.trustProxy),
      send: (s) => {
        if (ws.readyState !== ws.OPEN) return;
        if (ws.bufferedAmount > MAX_BUFFERED) { ws.terminate(); return; }
        ws.send(s);
      },
      close: (code, reason) => ws.close(code, reason),
    });
    if (joined.error) {
      ws.close(joined.code, joined.error);
      return;
    }
    const { id } = joined;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data, isBinary) => {
      if (isBinary) { ws.close(CLOSE.BAD_PROTOCOL, 'text only'); return; }
      hub.message(id, data.toString());
    });
    ws.on('close', () => hub.leave(id));
    ws.on('error', () => hub.leave(id));
  });

  const tickTimer = setInterval(() => hub.tick(), 1000 / hub.options.tickHz);
  const beatTimer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, cfg.heartbeatMs);

  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(cfg.port, cfg.host, () => {
      const port = server.address().port;
      log(`multijugador escuchando en ${cfg.host}:${port}${cfg.path}`);
      if (!cfg.allowedOrigins.length) log('aviso: ALLOWED_ORIGINS vacío, se acepta cualquier origen');
      if (!cfg.hub.captainKey && cfg.hub.reservedNames.length) log(`nombres reservados sin CAPTAIN_KEY: ${cfg.hub.reservedNames.join(', ')} (nadie puede usarlos)`);
      resolve(port);
    });
  });

  async function close() {
    clearInterval(tickTimer);
    clearInterval(beatTimer);
    for (const ws of wss.clients) ws.close(1001, 'bye');
    await new Promise((r) => wss.close(() => r()));
    server.closeAllConnections?.();
    await new Promise((r) => server.close(() => r()));
  }

  return { ready, close, hub };
}

// Ejecutado directamente (node src/server.js)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const srv = startServer();
  srv.ready.catch((e) => { console.error(e.message); process.exit(1); });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const force = setTimeout(() => process.exit(0), 5000);
    force.unref();
    srv.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
