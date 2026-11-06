// Servidor WebSocket del multijugador de La Malkevnia.
// Sin cuentas: cada pestaña es un visitante anónimo con un nombre elegido.
//
//   GET  /health  -> "ok"
//   GET  /stats   -> { players, rooms: { sala: n }, max }   (para "3 viajeros a bordo")
//   WS   /ws      -> protocolo descrito en README.md

import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createHub, CLOSE } from './core.js';

const env = process.env;
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

export function startServer(overrides = {}) {
  const cfg = {
    port: int(env.PORT, 8787),
    host: env.HOST || '0.0.0.0',
    path: env.WS_PATH || '/ws',
    allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: env.TRUST_PROXY === '1',
    heartbeatMs: int(env.HEARTBEAT_MS, 15000),
    hub: {
      maxPlayers: int(env.MAX_PLAYERS, 64),
      maxPerIp: int(env.MAX_PER_IP, 4),
      tickHz: int(env.TICK_HZ, 10),
    },
    quiet: false,
    ...overrides,
  };
  const log = (...a) => { if (!cfg.quiet) console.log(new Date().toISOString(), ...a); };

  const hub = createHub(cfg.hub);

  const originAllowed = (origin) => !cfg.allowedOrigins.length || cfg.allowedOrigins.includes(origin);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const origin = req.headers.origin;
    if (origin && originAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    } else if (req.method === 'GET' && url.pathname === '/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(hub.stats()));
    } else {
      res.writeHead(404).end();
    }
  });

  const wss = new WebSocketServer({
    server,
    path: cfg.path,
    maxPayload: 1024,
    perMessageDeflate: false,
    verifyClient: ({ origin }) => originAllowed(origin),
  });

  const clientIp = (req) => {
    if (cfg.trustProxy) {
      const fwd = req.headers['x-forwarded-for'];
      if (fwd) return String(fwd).split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  };

  wss.on('connection', (ws, req) => {
    const ip = clientIp(req);
    const joined = hub.join({
      ip,
      send: (s) => { if (ws.readyState === ws.OPEN) ws.send(s); },
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
      if (isBinary) return ws.close(CLOSE.BAD_PROTOCOL, 'text only');
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

  const ready = new Promise((resolve) => {
    server.listen(cfg.port, cfg.host, () => {
      log(`multijugador escuchando en ${cfg.host}:${server.address().port}${cfg.path}`);
      resolve(server.address().port);
    });
  });

  async function close() {
    clearInterval(tickTimer);
    clearInterval(beatTimer);
    for (const ws of wss.clients) ws.close(1001, 'bye');
    await new Promise((r) => wss.close(r));
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }

  return { ready, close, hub };
}

// Ejecutado directamente (node src/server.js)
if (import.meta.url === `file://${process.argv[1]}`) {
  const srv = startServer();
  const stop = () => srv.close().then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
