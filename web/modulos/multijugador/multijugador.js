// Cliente del multijugador de La Malkevnia.
// Módulo ES autocontenido, sin dependencias. Funciona en el navegador y en Node ≥ 22.
//
//   import { connect } from './multijugador.js';
//   const mj = connect('wss://malkevnia.com/mj/ws', 'Malkev', { room: 'puente' });
//   mj.onPlayers((list) => ...);          // quién hay en tu sala (sin ti)
//   mj.onRooms((counts) => ...);          // { puente: 3, biblioteca: 1 }
//   // en el bucle de render:
//   mj.sendPose({ x, y, z, yaw, anim }); // se limita solo a sendHz
//   for (const p of mj.sample()) ...      // posiciones interpoladas de los demás
//   mj.dispose();
//
// Ver README.md para la API completa.

const PROTOCOL = 1;
const TAU = Math.PI * 2;
const now = () => (globalThis.performance ? performance.now() : Date.now());

function lerpAngle(a, b, t) {
  let d = ((b - a) % TAU + TAU + Math.PI) % TAU - Math.PI;
  return a + d * t;
}

function emitter() {
  const set = new Set();
  return {
    on(cb) { set.add(cb); return () => set.delete(cb); },
    emit(...a) { for (const cb of [...set]) { try { cb(...a); } catch (e) { console.error(e); } } },
    clear() { set.clear(); },
  };
}

/**
 * @param {string} url   ws:// o wss:// del servidor (p. ej. wss://malkevnia.com/mj/ws)
 * @param {string} name  nombre visible (el servidor lo recorta a 20 caracteres)
 * @param {object} [opts]
 * @param {string}  [opts.room='puente']   sala inicial
 * @param {number}  [opts.sendHz=15]       envíos de pose por segundo como máximo
 * @param {number}  [opts.interpDelay=150] ms de retraso de render para interpolar
 * @param {boolean} [opts.reconnect=true]  reconectar con espera creciente
 * @param {Function}[opts.WebSocket]       implementación alternativa (tests, simulador)
 */
export function connect(url, name, opts = {}) {
  const o = {
    room: 'puente',
    sendHz: 15,
    interpDelay: 150,
    maxExtrapolate: 250,
    reconnect: true,
    WebSocket: globalThis.WebSocket,
    ...opts,
  };
  if (!o.WebSocket) throw new Error('multijugador: no hay WebSocket disponible');

  const ev = { players: emitter(), rooms: emitter(), status: emitter(), error: emitter() };
  const state = {
    id: null,
    name,
    room: o.room,
    status: 'connecting',
    rooms: {},
    clockOffset: null, // serverTs - localNow (suavizado)
    lastSnapTs: 0,
  };
  // id -> { id, name, buf: [{ t, x, y, z, yaw, anim }] }
  const others = new Map();

  let ws = null;
  let disposed = false;
  let retry = 0;
  let retryTimer = null;
  let lastSent = 0;
  let lastPose = null;
  let pendingPose = null;
  let flushTimer = null;

  function setStatus(s) {
    if (state.status === s) return;
    state.status = s;
    ev.status.emit(s);
  }

  function send(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  function rosterList() {
    return [...others.values()].map((p) => ({ id: p.id, name: p.name, room: state.room }));
  }

  function handle(m) {
    switch (m.t) {
      case 'welcome':
        state.id = m.id;
        state.name = m.name;
        state.room = m.room;
        state.rooms = m.rooms || {};
        retry = 0;
        setStatus('online');
        ev.rooms.emit({ ...state.rooms });
        if (lastPose) send(lastPose);
        break;
      case 'roster': {
        if (m.room !== state.room) break;
        const seen = new Set();
        for (const { i, n } of m.players) {
          if (i === state.id) continue;
          seen.add(i);
          const p = others.get(i);
          if (p) p.name = n; else others.set(i, { id: i, name: n, buf: [] });
        }
        for (const id of [...others.keys()]) if (!seen.has(id)) others.delete(id);
        ev.players.emit(rosterList());
        break;
      }
      case 'snap': {
        if (m.room !== state.room || m.ts < state.lastSnapTs) break; // fuera de orden
        state.lastSnapTs = m.ts;
        const sample = m.ts - now();
        state.clockOffset = state.clockOffset === null
          ? sample
          : Math.max(sample, state.clockOffset + (sample - state.clockOffset) * 0.05);
        for (const [i, x, y, z, yaw, anim] of m.players) {
          if (i === state.id) continue;
          let p = others.get(i);
          if (!p) { p = { id: i, name: '…', buf: [] }; others.set(i, p); }
          const b = p.buf;
          const same = (q) => q && q.x === x && q.y === y && q.z === z && q.yaw === yaw && q.anim === anim;
          if (same(b[b.length - 1]) && same(b[b.length - 2])) {
            b[b.length - 1].t = m.ts; // sigue quieto: estira el último tramo inmóvil
            continue;
          }
          p.buf.push({ t: m.ts, x, y, z, yaw, anim });
          if (p.buf.length > 20) p.buf.shift();
        }
        break;
      }
      case 'rooms':
        state.rooms = m.counts || {};
        ev.rooms.emit({ ...state.rooms });
        break;
      case 'room':
        state.room = m.room;
        break;
      case 'error':
        ev.error.emit(m.code);
        break;
      default:
        break;
    }
  }

  function open() {
    if (disposed) return;
    setStatus(retry ? 'reconnecting' : 'connecting');
    try {
      ws = new o.WebSocket(url);
    } catch (e) {
      ev.error.emit('connect');
      return scheduleRetry();
    }
    ws.onopen = () => send({ t: 'hello', v: PROTOCOL, name: state.name, room: state.room });
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(typeof e.data === 'string' ? e.data : String(e.data)); } catch { return; }
      handle(m);
    };
    const sock = ws;
    let ended = false;
    const onEnd = (e) => {
      if (ended || ws !== sock) return;
      ended = true;
      ws = null;
      state.id = null;
      state.clockOffset = null;
      state.lastSnapTs = 0;
      if (others.size) { others.clear(); ev.players.emit([]); }
      if (disposed) return setStatus('closed');
      // 4001 lleno, 4002 demasiadas pestañas, 4008 abuso, 4009 protocolo
      if (e && (e.code === 4008 || e.code === 4009)) { ev.error.emit(e.code === 4008 ? 'rate' : 'protocol'); return setStatus('closed'); }
      if (e && e.code === 4001) ev.error.emit('full');
      if (e && e.code === 4002) ev.error.emit('ip');
      scheduleRetry();
    };
    sock.onclose = onEnd;
    sock.onerror = () => {
      if (ended) return;
      ev.error.emit('socket');
      // Algunas implementaciones (Node/undici) no emiten close si falla el handshake
      if (sock.readyState !== 1) {
        onEnd({ code: 1006 });
        try { sock.close(); } catch { /* nada */ }
      }
    };
  }

  function scheduleRetry() {
    if (disposed || !o.reconnect) return setStatus('closed');
    setStatus('reconnecting');
    const wait = Math.min(15000, 1000 * 2 ** retry) * (0.75 + Math.random() * 0.5);
    retry += 1;
    retryTimer = setTimeout(open, wait);
  }

  function flush() {
    flushTimer = null;
    if (!pendingPose) return;
    lastSent = now();
    lastPose = pendingPose;
    pendingPose = null;
    send(lastPose);
  }

  open();

  return {
    get id() { return state.id; },
    get name() { return state.name; },
    get room() { return state.room; },
    get status() { return state.status; },
    get rooms() { return { ...state.rooms }; },

    /** Lista de visitantes de tu sala (sin ti) cuando entra, sale o cambia alguien. */
    onPlayers(cb) { cb(rosterList()); return ev.players.on(cb); },
    /** Recuento por sala de toda la nave: { puente: 3, ... } */
    onRooms(cb) { cb({ ...state.rooms }); return ev.rooms.on(cb); },
    /** 'connecting' | 'online' | 'reconnecting' | 'closed' */
    onStatus(cb) { cb(state.status); return ev.status.on(cb); },
    /** 'full' | 'ip' | 'rate' | 'protocol' | 'room' | 'socket' | 'connect' */
    onError(cb) { return ev.error.on(cb); },

    /**
     * Tu pose. Llámalo cada frame sin miedo: se envía como mucho sendHz veces
     * por segundo, solo si cambió, y cada 3 s como señal de vida.
     */
    sendPose({ x = 0, y = 0, z = 0, yaw = 0, anim = 'idle' } = {}) {
      const r2 = (n) => Math.round(n * 100) / 100;
      const msg = { t: 'pose', p: [r2(x), r2(y), r2(z)], r: r2(((yaw % TAU) + TAU) % TAU), a: anim };
      const same = lastPose && lastPose.p[0] === msg.p[0] && lastPose.p[1] === msg.p[1]
        && lastPose.p[2] === msg.p[2] && lastPose.r === msg.r && lastPose.a === msg.a;
      const t = now();
      if (same && t - lastSent < 3000) return;
      pendingPose = msg;
      const gap = 1000 / o.sendHz - (t - lastSent);
      if (gap <= 0) flush();
      else if (!flushTimer) flushTimer = setTimeout(flush, gap);
    },

    /** Cambia de sala. Los demás de la sala nueva aparecen con el siguiente roster. */
    setRoom(room) {
      state.room = room;
      others.clear();
      state.lastSnapTs = 0;
      ev.players.emit([]);
      send({ t: 'room', room });
    },

    /**
     * Posiciones interpoladas de los demás para pintar este frame.
     * @returns {{id:number,name:string,x:number,y:number,z:number,yaw:number,anim:string}[]}
     */
    sample(at = now(), { interpolate = true } = {}) {
      const out = [];
      if (state.clockOffset === null) return out;
      const rt = at + state.clockOffset - (interpolate ? o.interpDelay : 0);
      for (const p of others.values()) {
        const b = p.buf;
        if (!b.length) continue;
        let s;
        if (!interpolate || rt >= b[b.length - 1].t) {
          const a = b[b.length - 2];
          const c = b[b.length - 1];
          s = { ...c };
          if (interpolate && a && c.t > a.t) {
            // extrapola un poco si llegan tarde, luego se queda quieto
            const k = Math.min(rt - c.t, o.maxExtrapolate) / (c.t - a.t);
            s.x = c.x + (c.x - a.x) * k;
            s.y = c.y + (c.y - a.y) * k;
            s.z = c.z + (c.z - a.z) * k;
          }
        } else if (rt <= b[0].t) {
          s = { ...b[0] };
        } else {
          let i = b.length - 1;
          while (i > 0 && b[i - 1].t > rt) i--;
          const a = b[i - 1];
          const c = b[i];
          const k = (rt - a.t) / (c.t - a.t);
          s = {
            x: a.x + (c.x - a.x) * k,
            y: a.y + (c.y - a.y) * k,
            z: a.z + (c.z - a.z) * k,
            yaw: lerpAngle(a.yaw, c.yaw, k),
            anim: k < 0.5 ? a.anim : c.anim,
          };
          // descarta lo ya pasado (deja uno de margen)
          if (i > 1) b.splice(0, i - 1);
        }
        out.push({ id: p.id, name: p.name, x: s.x, y: s.y, z: s.z, yaw: s.yaw, anim: s.anim });
      }
      return out;
    },

    dispose() {
      disposed = true;
      clearTimeout(retryTimer);
      clearTimeout(flushTimer);
      if (ws) { try { ws.close(1000, 'bye'); } catch { /* nada */ } }
      ws = null;
      others.clear();
      setStatus('closed');
      for (const e of Object.values(ev)) e.clear();
    },
  };
}

export default { connect };
