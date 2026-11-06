// Servidor simulado en el navegador para la demo: usa el mismo núcleo que el
// servidor real (src/core.js) y expone un WebSocket falso con latencia y jitter.
// Los bots y el jugador local se conectan con la API normal del cliente.

import { createHub } from '../src/core.js';
import { connect } from '../client/multijugador.js';

export function createSimServer({ latency = 60, jitter = 25, tickHz = 10 } = {}) {
  const hub = createHub({ maxPerIp: 999, connectsPerMinute: 9999, maxPlayers: 64, tickHz });
  const net = { latency, jitter };
  let ipSeq = 0;
  const delay = () => Math.max(0, net.latency + (Math.random() * 2 - 1) * net.jitter);
  const timer = setInterval(() => hub.tick(Date.now()), 1000 / tickHz);

  class SimSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.onopen = this.onmessage = this.onclose = this.onerror = null;
      setTimeout(() => {
        const joined = hub.join({
          ip: `sim-${ipSeq++}`,
          send: (s) => setTimeout(() => { if (this.readyState === 1) this.onmessage?.({ data: s }); }, delay()),
          close: (code) => this._end(code),
        });
        if (joined.error) return this._end(joined.code);
        this.id = joined.id;
        this.readyState = 1;
        this.onopen?.({});
      }, delay());
    }
    send(s) {
      if (this.readyState !== 1) return;
      const id = this.id;
      setTimeout(() => hub.message(id, s, Date.now()), delay());
    }
    close(code = 1000) {
      if (this.readyState >= 2) return;
      hub.leave(this.id);
      this._end(code);
    }
    _end(code) {
      if (this.readyState === 3) return;
      this.readyState = 3;
      setTimeout(() => this.onclose?.({ code }), 0);
    }
  }

  return {
    WebSocket: SimSocket,
    hub,
    net,
    dispose() { clearInterval(timer); },
  };
}

const BOT_NAMES = ['Nébula', 'Orión', 'Vega', 'Kira', 'Tycho', 'Lumen', 'Sirio', 'Halley', 'Altair', 'Nova',
  'Iris', 'Dédalo', 'Selene', 'Ícaro', 'Ceres', 'Rigel', 'Lyra', 'Atlas', 'Electra', 'Hiperión'];

/** Un bot que pasea por su sala con la API pública del cliente. */
export function createBot(sim, { name, room, rooms, half = 8 } = {}) {
  const c = connect('sim://malkevnia/ws', name || BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)], {
    room, WebSocket: sim.WebSocket,
  });
  const s = {
    x: (Math.random() * 2 - 1) * half, z: (Math.random() * 2 - 1) * half, yaw: Math.random() * 6.28,
    tx: 0, tz: 0, wait: Math.random() * 2, speed: 1 + Math.random() * 0.8,
  };
  // destinos al azar, lejos de la mesa central
  const pick = () => {
    do { s.tx = (Math.random() * 2 - 1) * half; s.tz = (Math.random() * 2 - 1) * half; } while (Math.hypot(s.tx, s.tz) < 2.4);
  };
  pick();
  let last = performance.now();
  const timer = setInterval(() => {
    const t = performance.now();
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    let anim = 'idle';
    if (s.wait > 0) {
      s.wait -= dt;
    } else {
      const dx = s.tx - s.x; const dz = s.tz - s.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.2) {
        s.wait = 1 + Math.random() * 4;
        pick();
        // de vez en cuando se va a otra sala
        if (rooms && Math.random() < 0.08) c.setRoom(rooms[Math.floor(Math.random() * rooms.length)]);
      } else {
        const want = Math.atan2(dx, dz);
        let dy = ((want - s.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        s.yaw += dy * Math.min(1, dt * 6);
        const step = Math.min(d, s.speed * dt);
        s.x += (dx / d) * step; s.z += (dz / d) * step;
        const r = Math.hypot(s.x, s.z);
        if (r < 1.8) { s.x += (-s.z / (r || 1)) * step * 1.5; s.z += (s.x / (r || 1)) * step * 1.5; const k = 1.8 / Math.hypot(s.x, s.z); s.x *= k; s.z *= k; }
        anim = 'walk';
      }
    }
    c.sendPose({ x: s.x, y: 0, z: s.z, yaw: s.yaw, anim });
  }, 33);
  return {
    client: c,
    dispose() { clearInterval(timer); c.dispose(); },
  };
}
