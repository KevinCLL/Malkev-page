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
// Los nombres vienen de otros visitantes: píntalos con textContent o en un
// canvas, nunca con innerHTML.
//
// Ver README.md para la API completa.

const PROTOCOL = 1;
const TAU = Math.PI * 2;
const BUFFER = 20;            // muestras por visitante
const KEEPALIVE_MS = 20000;   // señal de vida aunque la pestaña esté en segundo plano
const now = () => (globalThis.performance ? performance.now() : Date.now());
const finite = (n) => typeof n === 'number' && Number.isFinite(n);

function lerpAngle(a, b, t) {
  const d = ((b - a) % TAU + TAU + Math.PI) % TAU - Math.PI;
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
 * @param {string}  [opts.room='puente']     sala inicial
 * @param {string}  [opts.key]               clave de capitán (permite los nombres reservados)
 * @param {number}  [opts.sendHz=15]         envíos de pose por segundo como máximo
 * @param {number}  [opts.interpDelay=150]   ms de retraso de render para interpolar
 * @param {number}  [opts.maxExtrapolate=250] ms que se extrapola si un paquete llega tarde
 * @param {boolean} [opts.reconnect=true]    reconectar con espera creciente
 * @param {Function}[opts.WebSocket]         implementación alternativa (tests, simulador)
 */
export function connect(url, name, opts = {}) {
  const o = {
    room: 'puente',
    key: undefined,
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
    captain: false,
    room: o.room,       // sala en la que queremos estar
    serverRoom: null,   // sala que el servidor nos ha confirmado
    status: 'connecting',
    rooms: {},
    clockOffset: null,  // serverTs - localNow (suavizado)
    lastSnapTs: 0,
  };
  // id -> { id, name, captain, buf: [{ t, x, y, z, yaw, anim }] }
  const others = new Map();

  let ws = null;
  let disposed = false;
  let retry = 0;
  let retryTimer = null;
  let lastSent = -Infinity; // última pose enviada
  let lastAnySent = 0;  // último mensaje de cualquier tipo
  let lastPose = null;
  let pendingPose = null;
  let flushTimer = null;

  function setStatus(s) {
    if (state.status === s) return;
    state.status = s;
    ev.status.emit(s);
  }

  function send(msg) {
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(msg));
    lastAnySent = now();
    return true;
  }

  function rosterList() {
    return [...others.values()].map((p) => ({ id: p.id, name: p.name, captain: p.captain, room: state.room }));
  }

  function clearOthers() {
    const had = others.size > 0;
    others.clear();
    state.lastSnapTs = 0;
    if (had) ev.players.emit([]);
  }

  function push(p, entry) {
    const b = p.buf;
    const last = b[b.length - 1];
    const same = (q) => q && q.x === entry.x && q.y === entry.y && q.z === entry.z && q.yaw === entry.yaw && q.anim === entry.anim;
    if (same(last) && same(b[b.length - 2])) {
      last.t = entry.t; // sigue quieto: estira el último tramo inmóvil
      return;
    }
    b.push(entry);
    if (b.length > BUFFER) b.shift();
  }

  function handle(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'welcome':
        state.id = m.id;
        if (typeof m.name === 'string') state.name = m.name;
        state.captain = !!m.captain;
        state.serverRoom = m.room;
        if (m.room !== state.room) {
          // pedimos otra sala mientras conectábamos: la pedimos de nuevo
          if (state.room) send({ t: 'room', room: state.room }); else state.room = m.room;
        }
        state.rooms = m.rooms && typeof m.rooms === 'object' ? m.rooms : {};
        retry = 0;
        setStatus('online');
        ev.rooms.emit({ ...state.rooms });
        if (lastPose) { send(lastPose); lastSent = now(); }
        break;
      case 'roster': {
        if (m.room !== state.room || !Array.isArray(m.players)) break;
        const seen = new Set();
        for (const e of m.players) {
          if (!e || e.i === state.id) continue;
          seen.add(e.i);
          const p = others.get(e.i);
          const n = String(e.n ?? '');
          if (p) { p.name = n; p.captain = !!e.c; } else others.set(e.i, { id: e.i, name: n, captain: !!e.c, buf: [] });
        }
        for (const id of [...others.keys()]) if (!seen.has(id)) others.delete(id);
        ev.players.emit(rosterList());
        break;
      }
      case 'snap': {
        if (m.room !== state.room || !Array.isArray(m.players) || !finite(m.ts)) break;
        if (m.ts < state.lastSnapTs) break; // fuera de orden
        state.lastSnapTs = m.ts;
        const sample = m.ts - now();
        state.clockOffset = state.clockOffset === null
          ? sample
          : Math.max(sample, state.clockOffset + (sample - state.clockOffset) * 0.05);
        const listed = new Set();
        for (const e of m.players) {
          if (!Array.isArray(e)) continue;
          const [i, x, y, z, yaw, anim] = e;
          if (i === state.id || ![x, y, z, yaw].every(finite)) continue;
          listed.add(i);
          let p = others.get(i);
          if (!p) { p = { id: i, name: '', captain: false, buf: [] }; others.set(i, p); }
          push(p, { t: m.ts, x, y, z, yaw, anim });
        }
        // Instantánea parcial: quien no aparece no se ha movido
        if (!m.full) {
          for (const p of others.values()) {
            const last = p.buf[p.buf.length - 1];
            if (!listed.has(p.id) && last) push(p, { ...last, t: m.ts });
          }
        }
        break;
      }
      case 'rooms':
        if (!m.counts || typeof m.counts !== 'object') break;
        state.rooms = m.counts;
        ev.rooms.emit({ ...state.rooms });
        break;
      case 'room':
        state.serverRoom = m.room;
        break;
      case 'error':
        if (m.code === 'room' && typeof m.room === 'string') {
          // el servidor no nos deja cambiar: volvemos a la sala confirmada
          state.serverRoom = m.room;
          if (state.room !== m.room) { state.room = m.room; clearOthers(); }
        }
        ev.error.emit(m.code);
        break;
      default:
        break;
    }
  }

  function open() {
    if (disposed) return;
    setStatus(retry ? 'reconnecting' : 'connecting');
    let sock;
    try {
      sock = new o.WebSocket(url);
    } catch {
      ev.error.emit('connect');
      scheduleRetry();
      return;
    }
    ws = sock;
    let ended = false;
    const onEnd = (e) => {
      if (ended || ws !== sock) return;
      ended = true;
      ws = null;
      state.id = null;
      state.serverRoom = null;
      state.clockOffset = null;
      clearOthers();
      if (disposed) { setStatus('closed'); return; }
      const code = e && e.code;
      // 4008 abuso y 4009 protocolo: no insistir
      if (code === 4008 || code === 4009) { ev.error.emit(code === 4008 ? 'rate' : 'protocol'); setStatus('closed'); return; }
      if (code === 4001) ev.error.emit('full');
      if (code === 4002) ev.error.emit('ip');
      scheduleRetry();
    };
    sock.onopen = () => {
      const hello = { t: 'hello', v: PROTOCOL, name: state.name, room: state.room };
      if (o.key) hello.key = o.key;
      send(hello);
    };
    sock.onmessage = (e) => {
      let m;
      try { m = JSON.parse(typeof e.data === 'string' ? e.data : String(e.data)); } catch { return; }
      handle(m);
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
    if (disposed || !o.reconnect) { setStatus('closed'); return; }
    setStatus('reconnecting');
    const wait = Math.min(15000, 1000 * 2 ** retry) * (0.75 + Math.random() * 0.5);
    retry = Math.min(retry + 1, 10);
    retryTimer = setTimeout(open, wait);
  }

  function flush() {
    flushTimer = null;
    if (!pendingPose) return;
    lastPose = pendingPose;
    pendingPose = null;
    if (send(lastPose)) lastSent = now();
  }

  const keepalive = setInterval(() => {
    if (now() - lastAnySent > KEEPALIVE_MS - 2000) send({ t: 'ping', c: 0 });
  }, KEEPALIVE_MS);
  keepalive.unref?.();

  open();

  return {
    get id() { return state.id; },
    get name() { return state.name; },
    get captain() { return state.captain; },
    get room() { return state.room; },
    get status() { return state.status; },
    get rooms() { return { ...state.rooms }; },

    /** Visitantes de tu sala (sin ti) cuando entra, sale o cambia alguien. Se llama al suscribirse. */
    onPlayers(cb) { cb(rosterList()); return ev.players.on(cb); },
    /** Recuento por sala de toda la nave: { puente: 3, ... }. Se llama al suscribirse. */
    onRooms(cb) { cb({ ...state.rooms }); return ev.rooms.on(cb); },
    /** 'connecting' | 'online' | 'reconnecting' | 'closed'. Se llama al suscribirse. */
    onStatus(cb) { cb(state.status); return ev.status.on(cb); },
    /** 'full' | 'ip' | 'rate' | 'protocol' | 'room' | 'name' | 'socket' | 'connect' */
    onError(cb) { return ev.error.on(cb); },

    /**
     * Tu pose. Llámalo cada frame sin miedo: se envía como mucho sendHz veces
     * por segundo, solo si cambió, y cada 3 s como señal de vida.
     */
    sendPose({ x = 0, y = 0, z = 0, yaw = 0, anim = 'idle' } = {}) {
      if (![x, y, z, yaw].every(finite)) return; // un NaN haría que el servidor nos expulsara
      const r2 = (n) => Math.round(n * 100) / 100;
      const msg = { t: 'pose', p: [r2(x), r2(y), r2(z)], r: r2(((yaw % TAU) + TAU) % TAU), a: anim };
      const base = pendingPose || lastPose;
      const same = base && base.p[0] === msg.p[0] && base.p[1] === msg.p[1]
        && base.p[2] === msg.p[2] && base.r === msg.r && base.a === msg.a;
      const t = now();
      if (same && (pendingPose || t - lastSent < 3000)) return;
      pendingPose = msg;
      const gap = 1000 / o.sendHz - (t - lastSent);
      if (gap <= 0) flush();
      else if (!flushTimer) flushTimer = setTimeout(flush, gap);
    },

    /** Cambia de sala. Los demás de la sala nueva llegan con la siguiente lista. */
    setRoom(room) {
      if (typeof room !== 'string' || room === state.room) return;
      state.room = room;
      clearOthers();
      send({ t: 'room', room });
    },

    /**
     * Posiciones interpoladas de los demás para pintar este frame.
     * @param {number} [at=performance.now()]
     * @param {{interpolate?: boolean}} [o]
     * @returns {{id:number,name:string,captain:boolean,x:number,y:number,z:number,yaw:number,anim:string}[]}
     */
    sample(at = now(), { interpolate = true } = {}) {
      const out = [];
      if (state.clockOffset === null) return out;
      const rt = at + state.clockOffset - (interpolate ? o.interpDelay : 0);
      for (const p of others.values()) {
        const b = p.buf;
        if (!b.length) continue;
        let s;
        const c = b[b.length - 1];
        if (!interpolate || rt >= c.t) {
          const a = b[b.length - 2];
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
          const n = b[i];
          const k = n.t > a.t ? (rt - a.t) / (n.t - a.t) : 1;
          s = {
            x: a.x + (n.x - a.x) * k,
            y: a.y + (n.y - a.y) * k,
            z: a.z + (n.z - a.z) * k,
            yaw: lerpAngle(a.yaw, n.yaw, k),
            anim: k < 0.5 ? a.anim : n.anim,
          };
          if (i > 1) b.splice(0, i - 1); // descarta lo ya pasado (deja uno de margen)
        }
        out.push({ id: p.id, name: p.name, captain: p.captain, x: s.x, y: s.y, z: s.z, yaw: s.yaw, anim: s.anim });
      }
      return out;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(retryTimer);
      clearTimeout(flushTimer);
      clearInterval(keepalive);
      const sock = ws;
      ws = null;
      if (sock) { try { sock.close(1000, 'bye'); } catch { /* nada */ } }
      others.clear();
      setStatus('closed');
      for (const e of Object.values(ev)) e.clear();
    },
  };
}

export default { connect };
