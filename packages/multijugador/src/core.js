// Núcleo del multijugador de La Malkevnia.
// Lógica pura, sin dependencias de Node ni del navegador: salas, validación,
// límites de ritmo e instantáneas. La usan el servidor real (src/server.js)
// y el simulador de la demo, así ambos se comportan igual.

export const PROTOCOL = 1;

export const DEFAULTS = Object.freeze({
  maxPlayers: 64,        // visitantes simultáneos en toda la nave
  maxPerIp: 4,           // pestañas por IP
  connectsPerMinute: 12, // conexiones nuevas por IP y minuto
  tickHz: 10,            // instantáneas por segundo
  msgRate: 25,           // mensajes por segundo sostenidos por cliente
  msgBurst: 50,          // ráfaga permitida
  maxStrikes: 40,        // mensajes descartados antes de expulsar
  maxMsgBytes: 512,
  bounds: 500,           // |x|,|y|,|z| máximos
  maxRooms: 32,
  idleMs: 120000,        // sin mensajes durante este tiempo -> fuera
  roomsEveryMs: 1000,
});

export const CLOSE = Object.freeze({
  FULL: 4001,
  TOO_MANY_FROM_IP: 4002,
  RATE_LIMIT: 4008,
  BAD_PROTOCOL: 4009,
  IDLE: 4010,
});

const ROOM_RE = /^[a-z0-9][a-z0-9-]{0,23}$/;
export const DEFAULT_ROOM = 'puente';

export function sanitizeName(raw) {
  let s = typeof raw === 'string' ? raw : '';
  s = s.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  s = Array.from(s).slice(0, 20).join('');
  return s || null;
}

export function sanitizeRoom(raw) {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return ROOM_RE.test(s) ? s : null;
}

export function createTokenBucket(rate, burst, now) {
  let tokens = burst;
  let last = now;
  return {
    take(t) {
      tokens = Math.min(burst, tokens + ((t - last) / 1000) * rate);
      last = t;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const clamp = (n, lim) => Math.max(-lim, Math.min(lim, n));
const ANIMS = new Set(['idle', 'walk', 'run', 'sit']);

function randomName(id) {
  return `Viajero-${id.toString(36).toUpperCase().padStart(3, '0')}`;
}

/**
 * Crea el "hub": el estado de todos los visitantes.
 * Cada conexión aporta { send(string), close(code, reason) }.
 */
export function createHub(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const players = new Map(); // id -> player
  const perIp = new Map();   // ip -> conexiones abiertas
  const connectLog = new Map(); // ip -> [timestamps]
  let nextId = 1;
  let lastRoomsSent = -Infinity;
  let lastRoomsKey = '';
  const dirtyRooms = new Set();
  let settleRooms = new Set(); // una instantánea más tras el último movimiento
  const rosterDirty = new Set();

  function roomCounts() {
    const counts = {};
    for (const p of players.values()) {
      if (!p.ready) continue;
      counts[p.room] = (counts[p.room] || 0) + 1;
    }
    return counts;
  }

  function activeRooms() {
    return new Set([...players.values()].filter((p) => p.ready).map((p) => p.room));
  }

  function inRoom(room) {
    const list = [];
    for (const p of players.values()) if (p.ready && p.room === room) list.push(p);
    return list;
  }

  function sendTo(p, msg) {
    try { p.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch { /* conexión rota */ }
  }

  function markRoom(room) {
    dirtyRooms.add(room);
    rosterDirty.add(room);
  }

  function join({ ip = 'local', send, close, now = Date.now() }) {
    // Límite de conexiones nuevas por minuto y por IP
    const log = (connectLog.get(ip) || []).filter((t) => now - t < 60000);
    if (log.length >= o.connectsPerMinute) {
      connectLog.set(ip, log);
      return { error: 'rate', code: CLOSE.RATE_LIMIT };
    }
    log.push(now);
    connectLog.set(ip, log);

    if (players.size >= o.maxPlayers) return { error: 'full', code: CLOSE.FULL };
    if ((perIp.get(ip) || 0) >= o.maxPerIp) return { error: 'ip', code: CLOSE.TOO_MANY_FROM_IP };

    const id = nextId++;
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    players.set(id, {
      id, ip, send, close,
      name: randomName(id),
      room: DEFAULT_ROOM,
      p: [0, 0, 0], r: 0, a: 'idle',
      ready: false,
      bucket: createTokenBucket(o.msgRate, o.msgBurst, now),
      strikes: 0,
      lastSeen: now,
    });
    return { id };
  }

  function leave(id) {
    const p = players.get(id);
    if (!p) return;
    players.delete(id);
    const n = (perIp.get(p.ip) || 1) - 1;
    if (n <= 0) perIp.delete(p.ip); else perIp.set(p.ip, n);
    if (p.ready) markRoom(p.room);
  }

  function kick(p, code, reason) {
    leave(p.id);
    try { p.close(code, reason); } catch { /* ya cerrada */ }
  }

  function strike(p) {
    p.strikes += 1;
    if (p.strikes > o.maxStrikes) kick(p, CLOSE.RATE_LIMIT, 'rate limit');
  }

  function welcome(p) {
    sendTo(p, { t: 'welcome', v: PROTOCOL, id: p.id, name: p.name, room: p.room, tickHz: o.tickHz, rooms: roomCounts() });
  }

  function setRoom(p, room) {
    if (room === p.room) return true;
    if (!activeRooms().has(room) && activeRooms().size >= o.maxRooms) return false;
    if (p.ready) markRoom(p.room);
    p.room = room;
    markRoom(room);
    return true;
  }

  function message(id, raw, now = Date.now()) {
    const p = players.get(id);
    if (!p) return;
    p.lastSeen = now;
    if (!p.bucket.take(now)) return strike(p);
    const text = typeof raw === 'string' ? raw : String(raw);
    if (text.length > o.maxMsgBytes) return strike(p);
    let m;
    try { m = JSON.parse(text); } catch { return strike(p); }
    if (!m || typeof m !== 'object') return strike(p);

    switch (m.t) {
      case 'hello': {
        if (m.v !== undefined && m.v !== PROTOCOL) return kick(p, CLOSE.BAD_PROTOCOL, 'protocol');
        const name = sanitizeName(m.name);
        if (name) p.name = name;
        const room = sanitizeRoom(m.room) || DEFAULT_ROOM;
        if (!setRoom(p, room)) p.room = DEFAULT_ROOM;
        if (!p.ready) { p.ready = true; markRoom(p.room); }
        else markRoom(p.room);
        welcome(p);
        return;
      }
      case 'pose': {
        if (!p.ready) return strike(p);
        const pos = m.p;
        if (!Array.isArray(pos) || pos.length !== 3 || !pos.every(finite) || !finite(m.r)) return strike(p);
        p.p = pos.map((n) => round2(clamp(n, o.bounds)));
        p.r = round2(((m.r % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
        if (typeof m.a === 'string' && ANIMS.has(m.a)) p.a = m.a;
        dirtyRooms.add(p.room);
        return;
      }
      case 'room': {
        if (!p.ready) return strike(p);
        const room = sanitizeRoom(m.room);
        if (!room || !setRoom(p, room)) return sendTo(p, { t: 'error', code: 'room' });
        sendTo(p, { t: 'room', room });
        return;
      }
      case 'ping':
        sendTo(p, { t: 'pong', ts: now, c: finite(m.c) ? m.c : 0 });
        return;
      default:
        return strike(p);
    }
  }

  function tick(now = Date.now()) {
    // Fuera los que llevan demasiado tiempo callados (el cliente manda pose cada pocos segundos)
    for (const p of [...players.values()]) {
      if (now - p.lastSeen > o.idleMs) kick(p, CLOSE.IDLE, 'idle');
    }

    // Lista de nombres por sala, solo cuando cambia
    for (const room of rosterDirty) {
      const list = inRoom(room);
      const msg = JSON.stringify({ t: 'roster', room, players: list.map((q) => ({ i: q.id, n: q.name })) });
      for (const q of list) sendTo(q, msg);
    }
    rosterDirty.clear();

    // Instantánea de posiciones por sala, solo si algo se movió (y una más
    // al pararse, para que los clientes sepan que ya no hay velocidad)
    const nextSettle = new Set(dirtyRooms);
    for (const room of settleRooms) dirtyRooms.add(room);
    settleRooms = nextSettle;
    for (const room of dirtyRooms) {
      const list = inRoom(room);
      if (!list.length) continue;
      const msg = JSON.stringify({
        t: 'snap', ts: now, room,
        players: list.map((q) => [q.id, q.p[0], q.p[1], q.p[2], q.r, q.a]),
      });
      for (const q of list) sendTo(q, msg);
    }
    dirtyRooms.clear();

    // Recuento de presencia por sala, a todos, cuando cambia (máx. 1/s)
    if (now - lastRoomsSent >= o.roomsEveryMs) {
      const counts = roomCounts();
      const key = JSON.stringify(counts);
      if (key !== lastRoomsKey) {
        lastRoomsKey = key;
        lastRoomsSent = now;
        const msg = JSON.stringify({ t: 'rooms', counts });
        for (const q of players.values()) if (q.ready) sendTo(q, msg);
      }
    }

    // Limpieza del registro de conexiones
    if (connectLog.size > 1000) {
      for (const [ip, log] of connectLog) if (!log.some((t) => now - t < 60000)) connectLog.delete(ip);
    }
  }

  function stats() {
    return { players: [...players.values()].filter((p) => p.ready).length, rooms: roomCounts(), max: o.maxPlayers };
  }

  return { join, leave, message, tick, stats, options: o };
}
