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
  maxStrikes: 40,        // faltas acumuladas antes de expulsar
  strikeDecayPerSec: 1,  // las faltas se olvidan a este ritmo
  maxMsgChars: 512,      // longitud máxima de un mensaje (el socket ya corta a 1 KB)
  bounds: 500,           // |x|,|y|,|z| máximos
  maxRooms: 32,
  idleMs: 120000,        // sin mensajes durante este tiempo -> fuera
  roomsEveryMs: 1000,
  reservedNames: [],     // nombres que solo puede usar quien tenga captainKey
  captainKey: '',        // vacío = nadie puede usar los nombres reservados
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

// Caracteres de control, de formato y de dirección (RLO, LRI…), BOM, guion
// blando y separadores invisibles: fuera de los nombres.
const INVISIBLE_RE = /[\u0000-\u001f\u007f-\u009f­؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/g;

export function sanitizeName(raw) {
  let s = typeof raw === 'string' ? raw : '';
  s = s.normalize('NFC').replace(INVISIBLE_RE, '').replace(/\s+/g, ' ').trim();
  s = Array.from(s).slice(0, 20).join('').trim();
  return s || null;
}

export function sanitizeRoom(raw) {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return ROOM_RE.test(s) ? s : null;
}

// Letras que se parecen a otras (cirílico, griego, dígitos) para que nadie se
// haga pasar por un nombre reservado con trucos tipo "Ma1kev" o "Маlkev".
const LOOKALIKE = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
  і: 'i', ї: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ӏ: 'l', ɩ: 'l',
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', μ: 'm', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x',
  0: 'o', 1: 'l', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '|': 'l', '!': 'i', '@': 'a', $: 's',
};

/** Forma canónica para comparar nombres: sin acentos, sin símbolos, homoglifos unificados. */
export function canonicalName(name) {
  const base = String(name).normalize('NFKD').toLowerCase()
    .replace(/[̀-ͯ]/g, '');
  let out = '';
  for (const ch of base) {
    const m = LOOKALIKE[ch] ?? ch;
    if (/[\p{L}\p{N}]/u.test(m)) out += m;
  }
  // "i" mayúscula y "l" son indistinguibles en muchas fuentes; "rn" parece "m"
  return out.replace(/i/g, 'l').replace(/rn/g, 'm').replace(/vv/g, 'w');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function createTokenBucket(rate, burst, now) {
  let tokens = burst;
  let last = now;
  return {
    take(t) {
      tokens = Math.min(burst, tokens + (Math.max(0, t - last) / 1000) * rate);
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
const TAU = Math.PI * 2;
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
  const reserved = (o.reservedNames || []).map(canonicalName).filter(Boolean);
  const players = new Map();    // id -> player
  const perIp = new Map();      // ip -> conexiones abiertas
  const connectLog = new Map(); // ip -> [timestamps]
  let nextId = 1;
  let lastRoomsSent = -Infinity;
  let lastRoomsKey = '';
  const dirtyRooms = new Set();  // salas con algo que contar este tick
  const fullRooms = new Set();   // salas cuya instantánea debe ir completa
  const rosterDirty = new Set(); // salas cuya lista de nombres cambió

  function roomCounts() {
    const counts = {};
    for (const p of players.values()) {
      if (!p.ready) continue;
      counts[p.room] = (counts[p.room] || 0) + 1;
    }
    return counts;
  }

  function inRoom(room) {
    const list = [];
    for (const p of players.values()) if (p.ready && p.room === room) list.push(p);
    return list;
  }

  function sendTo(p, msg) {
    try { p.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch { /* conexión rota */ }
  }

  // Alguien entró, salió o cambió de nombre: nueva lista y foto completa
  function markRoom(room) {
    dirtyRooms.add(room);
    fullRooms.add(room);
    rosterDirty.add(room);
  }

  function isReserved(name) {
    if (!reserved.length) return false;
    const c = canonicalName(name);
    return reserved.some((r) => c.includes(r));
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
      captain: false,
      room: DEFAULT_ROOM,
      p: [0, 0, 0], r: 0, a: 'idle',
      moved: false,  // cambió desde la última instantánea
      settle: false, // va en la siguiente aunque no se mueva (marca el alto)
      ready: false,
      bucket: createTokenBucket(o.msgRate, o.msgBurst, now),
      strikes: 0,
      strikeAt: now,
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

  function strike(p, now) {
    p.strikes = Math.max(0, p.strikes - ((now - p.strikeAt) / 1000) * o.strikeDecayPerSec) + 1;
    p.strikeAt = now;
    if (p.strikes > o.maxStrikes) kick(p, CLOSE.RATE_LIMIT, 'rate limit');
  }

  function setRoom(p, room) {
    if (room === p.room) return true;
    const active = activeRooms();
    if (!active.has(room) && active.size >= o.maxRooms) return false;
    if (p.ready) markRoom(p.room);
    p.room = room;
    markRoom(room);
    return true;
  }

  function activeRooms() {
    const s = new Set();
    for (const p of players.values()) if (p.ready) s.add(p.room);
    return s;
  }

  function message(id, raw, now = Date.now()) {
    const p = players.get(id);
    if (!p) return;
    p.lastSeen = now;
    if (!p.bucket.take(now)) return strike(p, now);
    const text = typeof raw === 'string' ? raw : String(raw);
    if (text.length > o.maxMsgChars) return strike(p, now);
    let m;
    try { m = JSON.parse(text); } catch { return strike(p, now); }
    if (!m || typeof m !== 'object' || Array.isArray(m)) return strike(p, now);

    switch (m.t) {
      case 'hello': {
        if (p.ready) return strike(p, now); // solo un saludo por conexión
        if (m.v !== undefined && m.v !== PROTOCOL) return kick(p, CLOSE.BAD_PROTOCOL, 'protocol');
        const captain = !!o.captainKey && safeEqual(m.key, o.captainKey);
        const name = sanitizeName(m.name);
        let nameRefused = false;
        if (name && isReserved(name) && !captain) nameRefused = true;
        else if (name) p.name = name;
        p.captain = captain;
        const room = sanitizeRoom(m.room) || DEFAULT_ROOM;
        if (!setRoom(p, room)) p.room = DEFAULT_ROOM;
        p.ready = true;
        markRoom(p.room);
        sendTo(p, {
          t: 'welcome', v: PROTOCOL, id: p.id, name: p.name, captain: p.captain || undefined,
          room: p.room, tickHz: o.tickHz, rooms: roomCounts(),
        });
        if (nameRefused) sendTo(p, { t: 'error', code: 'name' });
        if (m.key !== undefined && !captain) strike(p, now);
        return;
      }
      case 'pose': {
        if (!p.ready) return strike(p, now);
        const pos = m.p;
        if (!Array.isArray(pos) || pos.length !== 3 || !pos.every(finite) || !finite(m.r)) return strike(p, now);
        const np = pos.map((n) => round2(clamp(n, o.bounds)));
        const nr = round2(((m.r % TAU) + TAU) % TAU);
        const na = typeof m.a === 'string' && ANIMS.has(m.a) ? m.a : p.a;
        if (np[0] !== p.p[0] || np[1] !== p.p[1] || np[2] !== p.p[2] || nr !== p.r || na !== p.a) {
          p.p = np; p.r = nr; p.a = na;
          p.moved = true;
          dirtyRooms.add(p.room);
        }
        return;
      }
      case 'room': {
        if (!p.ready) return strike(p, now);
        const room = sanitizeRoom(m.room);
        if (!room || !setRoom(p, room)) {
          sendTo(p, { t: 'error', code: 'room', room: p.room });
          markRoom(p.room); // el cliente vuelve a su sala: reenviar lista y foto
          return;
        }
        sendTo(p, { t: 'room', room });
        return;
      }
      case 'ping':
        sendTo(p, { t: 'pong', ts: now, c: finite(m.c) ? m.c : 0 });
        return;
      default:
        return strike(p, now);
    }
  }

  function tick(now = Date.now()) {
    // Fuera los que llevan demasiado tiempo callados (el cliente manda señal de vida)
    for (const p of [...players.values()]) {
      if (now - p.lastSeen > o.idleMs) kick(p, CLOSE.IDLE, 'idle');
    }

    // Lista de nombres por sala, solo cuando cambia
    for (const room of rosterDirty) {
      const list = inRoom(room);
      const msg = JSON.stringify({
        t: 'roster', room,
        players: list.map((q) => (q.captain ? { i: q.id, n: q.name, c: 1 } : { i: q.id, n: q.name })),
      });
      for (const q of list) sendTo(q, msg);
    }
    rosterDirty.clear();

    // Instantáneas: solo quien se movió (más una vez al pararse); completas
    // cuando cambia quién está en la sala, para que el recién llegado vea a todos.
    const next = new Set();
    for (const room of dirtyRooms) {
      const list = inRoom(room);
      if (!list.length) continue;
      const full = fullRooms.has(room);
      const changed = full ? list : list.filter((q) => q.moved || q.settle);
      for (const q of list) {
        q.settle = q.moved;
        q.moved = false;
        if (q.settle) next.add(room);
      }
      if (!changed.length) continue;
      const snap = { t: 'snap', ts: now, room, players: changed.map((q) => [q.id, q.p[0], q.p[1], q.p[2], q.r, q.a]) };
      if (full) snap.full = 1;
      const msg = JSON.stringify(snap);
      for (const q of list) sendTo(q, msg);
    }
    dirtyRooms.clear();
    fullRooms.clear();
    for (const room of next) dirtyRooms.add(room);

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
    let n = 0;
    for (const p of players.values()) if (p.ready) n++;
    return { players: n, rooms: roomCounts(), max: o.maxPlayers };
  }

  return { join, leave, message, tick, stats, options: o };
}
