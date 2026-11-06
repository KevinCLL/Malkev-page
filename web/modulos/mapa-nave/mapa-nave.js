/*
 * mapa-nave.js · Plano de la nave en tiempo real para La Malkevnia
 * Módulo ES autocontenido, sin dependencias. Dibuja en SVG un minimapa con la
 * posición del jugador y abre un plano ampliado donde se toca una estancia
 * para teletransportarse.
 *
 * Coordenadas: las del mundo 3D, en el plano XZ, en metros. X crece hacia la
 * proa (derecha del plano) y Z hacia abajo. El yaw es el de una cámara de
 * three.js con rotation.order 'YXZ': yaw 0 mira a -Z, yaw -PI/2 mira a +X y
 * el vector "adelante" es (-sin(yaw), -cos(yaw)).
 *
 *   const mapa = init(container, layout, opciones)
 *   mapa.setPlayer(x, z, yaw)    cada frame (si no cambia, no toca el DOM)
 *   mapa.onTeleport(cb)          cb({ roomId, room, x, z, yaw, from, via }) → función de baja
 *   mapa.dispose()               quita DOM, listeners, observadores y estilos
 *
 * API completa y guía de integración en README.md.
 */

const NS = 'http://www.w3.org/2000/svg';
const STYLE_ID = 'mapa-nave-css';
const VERSION = '2.0.0';
let styleRefs = 0;
let uid = 0;

const CSS = `
.mn{--mn-bg:rgba(14,9,32,.84);--mn-line:rgba(176,150,255,.3);--mn-fg:#ece6ff;--mn-muted:#a99ccf;
  --mn-accent:#b9a2ff;--mn-glow:#7fd6ff;--mn-player:#ffffff;--mn-hull:rgba(120,96,220,.10);--mn-blur:6px;
  --mn-font:"Exo 2",system-ui,sans-serif;--mn-display:"Orbitron","Exo 2",system-ui,sans-serif;
  --mn-mono:"JetBrains Mono",ui-monospace,monospace;
  color:var(--mn-fg);font-family:var(--mn-font);box-sizing:border-box;width:100%;user-select:none;-webkit-user-select:none;
  pointer-events:auto;-webkit-tap-highlight-color:transparent}
.mn *{box-sizing:border-box}
.mn-frame{background:var(--mn-bg);border:1px solid var(--mn-line);border-radius:12px;backdrop-filter:blur(var(--mn-blur));-webkit-backdrop-filter:blur(var(--mn-blur));overflow:hidden}
.mn--compact .mn-frame{cursor:pointer;padding:6px 8px 8px;touch-action:manipulation}
.mn--compact.mn--bare .mn-frame{background:none;border:0;border-radius:0;backdrop-filter:none;-webkit-backdrop-filter:none;padding:0}
@media (hover:hover){.mn--compact .mn-frame:hover{border-color:var(--mn-accent)}}
.mn-frame:focus-visible{outline:2px solid var(--mn-accent);outline-offset:2px}
.mn-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 2px 6px}
.mn-bar b{color:var(--mn-fg);font:600 11px/1.2 var(--mn-mono);letter-spacing:.06em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.mn-key{border:1px solid var(--mn-line);border-radius:4px;padding:1px 5px;font:600 9px/1.3 var(--mn-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--mn-muted);flex:none}
.mn-svg{display:block;width:100%;height:auto;overflow:visible}
.mn-head,.mn-legend{display:none}
.mn--expanded .mn-bar{display:none}
.mn--expanded .mn-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:10px 20px;padding:18px 20px 6px}
.mn-headr{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.mn-eyebrow{font:600 11px var(--mn-mono);letter-spacing:.28em;text-transform:uppercase;color:var(--mn-accent)}
.mn-title{font:700 clamp(20px,3vw,28px)/1.1 var(--mn-display);letter-spacing:.03em;margin:6px 0 0;text-wrap:balance}
.mn-hint{font:400 14px/1.4 var(--mn-font);color:var(--mn-muted);margin:0}
.mn-close{font:600 12px var(--mn-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--mn-fg);background:transparent;border:1px solid var(--mn-line);border-radius:999px;padding:9px 16px;cursor:pointer;min-height:40px}
.mn-close:hover,.mn-close:focus-visible{border-color:var(--mn-accent);outline:none;background:rgba(185,162,255,.12)}
.mn--expanded .mn-frame{border-radius:18px;width:min(1100px,100%);max-height:100%;display:flex;flex-direction:column}
.mn--expanded .mn-svgwrap{padding:6px 20px 4px;min-height:0;flex:1;display:flex;align-items:center;justify-content:center}
.mn--expanded .mn-svg{max-height:calc(100vh - 210px);max-height:calc(100dvh - 210px)}
.mn--expanded .mn-legend{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;padding:4px 20px 16px;font:400 12px var(--mn-mono);color:var(--mn-muted)}
.mn-legend span{display:inline-flex;align-items:center;gap:7px}
.mn-legend i{display:inline-block;flex:none}
.mn-lg-you{width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:10px solid var(--mn-player)}
.mn-lg-door{width:14px;height:4px;border-radius:2px;background:var(--mn-accent);opacity:.7}
.mn-lg-win{width:14px;height:4px;border-radius:2px;background:var(--mn-glow);box-shadow:0 0 6px var(--mn-glow)}
.mn-lg-oth{width:9px;height:9px;border-radius:50%;background:#ff9ad5}
.mn-lg-keys{margin-left:auto}
.mn-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
  padding:calc(16px + env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) calc(16px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));
  background:radial-gradient(ellipse at 50% 40%,rgba(40,24,90,.55),rgba(4,2,12,.86));animation:mn-in .22s ease-out;overscroll-behavior:contain}
.mn-overlay .mn{max-height:100%;display:flex;justify-content:center}
@keyframes mn-in{from{opacity:0}to{opacity:1}}

.mn-hullshape{fill:var(--mn-hull);stroke:var(--mn-accent);stroke-opacity:.75;stroke-width:var(--mn-sw)}
.mn-hullin{fill:none;stroke:var(--mn-accent);stroke-opacity:.22;stroke-dasharray:calc(var(--mn-sw)*6) calc(var(--mn-sw)*5);stroke-width:var(--mn-sw)}
.mn-engine{fill:rgba(120,96,220,.16);stroke:var(--mn-accent);stroke-opacity:.5;stroke-width:var(--mn-sw)}
.mn-flame{fill:var(--mn-glow);opacity:.35;animation:mn-flame 2.4s ease-in-out infinite}
.mn-flame:nth-child(3n+2){animation-delay:-.8s}.mn-flame:nth-child(3n+3){animation-delay:-1.6s}
@keyframes mn-flame{50%{opacity:.12}}
.mn-gridline{stroke:var(--mn-accent);stroke-opacity:.06;stroke-width:calc(var(--mn-sw)*.6)}
.mn-win{fill:var(--mn-glow);fill-opacity:.75}
.mn-room rect{fill:var(--c);fill-opacity:.11;stroke:var(--c);stroke-opacity:.5;stroke-width:var(--mn-sw);transition:fill-opacity .2s,stroke-opacity .2s}
.mn-room--corridor rect{fill:#0b0720;fill-opacity:.7;stroke:var(--mn-accent);stroke-opacity:.25}
.mn--expanded .mn-room[role=button]{cursor:pointer;outline:none}
@media (hover:hover){.mn--expanded .mn-room[role=button]:hover rect{fill-opacity:.26;stroke-opacity:1}}
.mn--expanded .mn-room:focus-visible rect{fill-opacity:.26;stroke-opacity:1;stroke-width:calc(var(--mn-sw)*2.6)}
.mn-room--here rect{fill-opacity:.3;stroke-opacity:1;stroke-width:calc(var(--mn-sw)*1.8)}
.mn-room--corridor.mn-room--here rect{fill:var(--mn-accent);fill-opacity:.12}
.mn-door{fill:var(--mn-accent);fill-opacity:.55}
.mn-name{fill:var(--mn-fg);font-family:var(--mn-display);font-weight:700;letter-spacing:.02em;pointer-events:none}
.mn-room--corridor .mn-name{fill:var(--mn-muted);font-family:var(--mn-mono);font-weight:600;letter-spacing:.35em;text-transform:uppercase}
.mn-sub,.mn-here{font-family:var(--mn-mono);fill:var(--mn-muted);pointer-events:none;letter-spacing:.04em}
.mn-here{fill:var(--mn-glow);display:none}
.mn-room--here .mn-here{display:inline}
.mn-room--here .mn-sub{display:none}
.mn-badge{display:none;pointer-events:none}
.mn-badge rect{fill:#ff9ad5;fill-opacity:.16;stroke:#ff9ad5;stroke-opacity:.6;stroke-width:var(--mn-sw)}
.mn-badge text{fill:#ffd2ec;font-family:var(--mn-mono);font-weight:600}
.mn--expanded .mn-badge--on{display:inline}
.mn--compact .mn-sub,.mn--compact .mn-here,.mn--compact .mn-name-long,.mn--compact .mn-room--corridor .mn-name,.mn--compact .mn-oname,.mn--compact .mn-hullin{display:none}
.mn--expanded .mn-name-short{display:none}
.mn--compact .mn-name{fill:var(--c)}
.mn-trail circle{fill:var(--mn-player)}
.mn-other circle{stroke:#140c2c;stroke-width:calc(var(--mn-sw)*1)}
.mn-other line{stroke-width:calc(var(--mn-sw)*1.6);stroke-linecap:round}
.mn-oname{font-family:var(--mn-mono);font-weight:600;paint-order:stroke;stroke:#0b0720;stroke-width:calc(var(--mn-sw)*2.5);stroke-linejoin:round}
.mn-dot{fill:var(--mn-player);stroke:#1a1038;stroke-width:calc(var(--mn-sw)*1.2)}
.mn-halo{fill:none;stroke:var(--mn-player);stroke-opacity:.5;stroke-width:var(--mn-sw);transform-box:fill-box;transform-origin:center;animation:mn-halo 2.2s ease-out infinite}
@keyframes mn-halo{from{transform:scale(1);opacity:.9}to{transform:scale(2.6);opacity:0}}
.mn-pulse{fill:none;stroke:var(--mn-glow);stroke-width:calc(var(--mn-sw)*2);transform-box:fill-box;transform-origin:center;animation:mn-pulse .9s ease-out forwards}
@keyframes mn-pulse{from{transform:scale(.2);opacity:1}to{transform:scale(3);opacity:0}}
.mn-beam{fill:none;stroke:var(--mn-glow);stroke-width:calc(var(--mn-sw)*1.4);stroke-linecap:round;animation:mn-beam .9s ease-out forwards}
@keyframes mn-beam{from{stroke-dashoffset:var(--len);opacity:1}to{stroke-dashoffset:0;opacity:0}}
@media (prefers-reduced-motion:reduce){.mn-halo,.mn-flame,.mn-overlay,.mn-beam{animation:none}.mn-beam{opacity:0}.mn-pulse{animation-duration:.01s}.mn-room rect{transition:none}}
`;

/* ---------- utilidades ---------- */
function svg(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function html(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}
const PALETTE = ['#b9a2ff', '#ff8ad8', '#ffc27a', '#7fd6ff', '#9b7bff', '#ffb36b', '#6affc8', '#d1a6ff'];
const hex = c => typeof c === 'number' ? '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6) : String(c);
const r2 = v => Math.round(v * 1000) / 1000;
const num = v => typeof v === 'number' && Number.isFinite(v);
const inRect = (r, x, z, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && z >= r.z - pad && z <= r.z + r.d + pad;
const touches = (a, b, eps = 0.01) => a.x <= b.x + b.w + eps && b.x <= a.x + a.w + eps && a.z <= b.z + b.d + eps && b.z <= a.z + a.d + eps;
const TAU = Math.PI * 2;
const normYaw = y => ((y % TAU) + TAU + Math.PI) % TAU - Math.PI;

/** Convierte una dirección (dx, dz) en yaw con la convención de three.js. */
export function yawFromDir(dx, dz) { return Math.atan2(-dx, -dz); }

/** Color estable a partir de un id (para visitantes sin color propio). */
export function colorFromId(id) {
  let h = 2166136261;
  for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return `hsl(${(h >>> 0) % 360} 85% 74%)`;
}

/**
 * Convierte el formato de rejilla antiguo de nave-3d (ROOMS con x0..x1 / z0..z1
 * en casillas, inclusivos, y DOORS con lista de casillas) a un layout en metros.
 */
export function fromGrid({ rooms, doors = [], tile = 1, name, deck } = {}) {
  return {
    name, deck,
    rooms: rooms.map(r => ({
      id: r.id, name: r.name, sub: r.sub, short: r.short, color: r.color, spawn: r.spawn, kind: r.kind,
      x: r.x0 * tile, z: r.z0 * tile, w: (r.x1 - r.x0 + 1) * tile, d: (r.z1 - r.z0 + 1) * tile,
    })),
    doors: doors.map((d, i) => {
      const xs = d.tiles.map(t => t[0]), zs = d.tiles.map(t => t[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      return { id: d.id || 'puerta-' + i, a: d.a, b: d.b, x: x0 * tile, z: z0 * tile, w: (x1 - x0 + 1) * tile, d: (z1 - z0 + 1) * tile };
    }),
  };
}

/**
 * Ventanales: acepta [{ x, z, w|width, d|depth }] o el texto de layout.json,
 * p. ej. "proa x=55.5..57 z=1.5..22.5; laterales z=0..1.5 y z=22.5..24 x=45..54".
 * En el texto, cada tramo separado por ';' combina todos sus rangos x con todos sus rangos z.
 */
export function parseWindows(w) {
  if (Array.isArray(w)) {
    return w.map(o => ({ x: +o.x, z: +o.z, w: +(o.w ?? o.width), d: +(o.d ?? o.depth) }))
      .filter(o => [o.x, o.z, o.w, o.d].every(Number.isFinite) && o.w > 0 && o.d > 0);
  }
  if (typeof w !== 'string') return [];
  const n = '(-?\\d+(?:[.,]\\d+)?)';
  const re = new RegExp(`\\b([xz])\\s*=\\s*${n}\\s*(?:\\.\\.|–|—)\\s*${n}`, 'gi');
  const out = [];
  for (const seg of w.split(';')) {
    const xs = [], zs = [];
    for (const m of seg.matchAll(re)) {
      const a = parseFloat(m[2].replace(',', '.')), b = parseFloat(m[3].replace(',', '.'));
      (m[1].toLowerCase() === 'x' ? xs : zs).push([Math.min(a, b), Math.max(a, b)]);
    }
    for (const [x0, x1] of xs) for (const [z0, z1] of zs) if (x1 > x0 && z1 > z0) out.push({ x: x0, z: z0, w: x1 - x0, d: z1 - z0 });
  }
  return out;
}

function shortName(n = '') {
  return n.replace(/^Sala de (las? |los? )?/i, '').replace(/^Puente de mando$/i, 'Puente').replace(/^Ordenador de a bordo$/i, 'Ordenador');
}

function normalize(layout) {
  if (!layout || !Array.isArray(layout.rooms) || !layout.rooms.length) throw new Error('mapa-nave: el layout necesita rooms[]');
  const seen = new Set();
  // acepta w/d o width/depth (layout.json de nave-3d) y between:[a,b] en las puertas
  const rooms = layout.rooms.map((r, i) => {
    const w = +(r.w ?? r.width), d = +(r.d ?? r.depth), x = +r.x, z = +r.z;
    if (![x, z, w, d].every(Number.isFinite) || w <= 0 || d <= 0) throw new Error(`mapa-nave: la estancia "${r.id ?? i}" no tiene x, z, ancho y fondo válidos`);
    const id = String(r.id ?? 'sala-' + i);
    if (seen.has(id)) throw new Error(`mapa-nave: id de estancia repetido "${id}"`);
    seen.add(id);
    const name = r.name || id;
    const corridor = r.kind ? r.kind === 'corridor' : /^(pasillo|corredor|corridor)/i.test(id) || /^(pasillo|corredor)/i.test(name);
    return {
      ...r, id, name, x, z, w, d, sub: r.sub || '',
      color: r.color != null ? hex(r.color) : PALETTE[i % PALETTE.length],
      kind: corridor ? 'corridor' : 'room', short: r.short || shortName(name), cx: x + w / 2, cz: z + d / 2,
    };
  });
  const doors = (Array.isArray(layout.doors) ? layout.doors : []).map((dr, i) => {
    const w = +(dr.w ?? dr.width), d = +(dr.d ?? dr.depth), [a, b] = Array.isArray(dr.between) ? dr.between : [dr.a, dr.b];
    return { ...dr, id: dr.id || 'puerta-' + i, a, b, x: +dr.x, z: +dr.z, w, d, cx: +dr.x + w / 2, cz: +dr.z + d / 2 };
  }).filter(d => [d.x, d.z, d.w, d.d].every(Number.isFinite) && d.w > 0 && d.d > 0);

  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const r of rooms) { x0 = Math.min(x0, r.x); z0 = Math.min(z0, r.z); x1 = Math.max(x1, r.x + r.w); z1 = Math.max(z1, r.z + r.d); }
  const sh = layout.ship, bb = layout.bounds;
  // con `ship` o `bounds` el casco va por las paredes exteriores; si no, se deja un margen alrededor de las salas
  const fromShip = !!(sh && [sh.x, sh.z, sh.width ?? sh.w, sh.depth ?? sh.d].every(v => Number.isFinite(+v)));
  const b = fromShip ? { x0: +sh.x, z0: +sh.z, x1: +sh.x + +(sh.width ?? sh.w), z1: +sh.z + +(sh.depth ?? sh.d) }
    : (bb && [bb.x0, bb.z0, bb.x1, bb.z1].every(num) ? { ...bb } : { x0, z0, x1, z1 });
  const unit = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 100; // 1 % del lado mayor: todo el dibujo escala con esto

  // punto de aparición: el del layout o, si falta, justo dentro de la puerta que da al pasillo, mirando hacia dentro
  for (const r of rooms) {
    if (r.spawn && num(+r.spawn.x) && num(+r.spawn.z)) { r.spawn = { x: +r.spawn.x, z: +r.spawn.z, yaw: num(+r.spawn.yaw) ? +r.spawn.yaw : 0 }; continue; }
    if (r.kind === 'corridor') { r.spawn = { x: r.cx, z: r.cz, yaw: r.w >= r.d ? yawFromDir(1, 0) : yawFromDir(0, 1) }; continue; }
    const own = doors.filter(d => d.a === r.id || d.b === r.id);
    const cand = own.length ? own : doors.filter(d => touches(d, r));
    const door = cand.find(d => { const o = rooms.find(q => q !== r && (q.id === d.a || q.id === d.b || touches(d, q))); return o && o.kind === 'corridor'; }) || cand[0];
    if (!door) { r.spawn = { x: r.cx, z: r.cz, yaw: 0 }; continue; }
    const alongZ = door.d > door.w; // la puerta se extiende en Z: se cruza en X
    const nx = alongZ ? Math.sign(r.cx - door.cx) || 1 : 0, nz = alongZ ? 0 : Math.sign(r.cz - door.cz) || 1;
    const step = (alongZ ? door.w : door.d) / 2 + Math.min(1.6, (alongZ ? r.w : r.d) * 0.3);
    const sx = Math.min(r.x + r.w - 0.3, Math.max(r.x + 0.3, door.cx + nx * step));
    const sz = Math.min(r.z + r.d - 0.3, Math.max(r.z + 0.3, door.cz + nz * step));
    r.spawn = { x: sx, z: sz, yaw: yawFromDir(nx, nz) };
  }
  return {
    name: layout.name || 'Cubierta principal', deck: layout.deck || 'Plano de la nave',
    rooms, doors, windows: parseWindows(layout.windows), bounds: b, unit, fromShip,
    hull: layout.hull ?? 'auto', engines: layout.engines ?? 3,
  };
}

/**
 * Crea el mapa dentro de `container`. Ver README.md para todas las opciones.
 */
export function init(container, layout, opciones = {}) {
  if (!container || typeof container.appendChild !== 'function') throw new Error('mapa-nave: falta el contenedor');
  const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const opt = {
    mode: 'compact', keyboard: true, toggleKey: 'KeyM', canToggle: null, trail: true, autoMove: false,
    closeOnTeleport: true, closeDelay: 260, releasePointer: true, teleportCorridors: true, bare: false,
    title: null, hint: null, noseLength: null, ...opciones,
  };
  let L = normalize(layout);
  const me = ++uid, gradId = `mn-cone-${me}`;

  if (!styleRefs++ && !document.getElementById(STYLE_ID)) {
    const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
  }

  const cbs = { teleport: new Set(), room: new Set(), toggle: new Set() };
  const on = k => cb => { if (typeof cb !== 'function') return () => {}; cbs[k].add(cb); return () => cbs[k].delete(cb); };
  const emit = (k, ...a) => { for (const cb of [...cbs[k]]) { try { cb(...a); } catch (e) { console.error('mapa-nave', e); } } };
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

  /* ---------- DOM ---------- */
  const root = html('div', 'mn mn--compact' + (opt.bare ? ' mn--bare' : ''));
  root.dataset.mapaNave = VERSION;
  const frame = html('div', 'mn-frame', root);
  const head = html('div', 'mn-head', frame);
  const headTxt = html('div', '', head);
  const eyebrow = html('div', 'mn-eyebrow', headTxt);
  const title = html('h2', 'mn-title', headTxt);
  title.id = `mn-title-${me}`;
  const headR = html('div', 'mn-headr', head);
  html('p', 'mn-hint', headR, opt.hint ?? (COARSE ? 'Toca una estancia para teletransportarte.' : 'Haz clic en una estancia para teletransportarte.'));
  const closeBtn = html('button', 'mn-close', headR, COARSE ? 'Cerrar' : 'Cerrar · Esc');
  closeBtn.type = 'button';
  const bar = html('div', 'mn-bar', frame);
  const barRoom = html('b', '', bar, '—');
  html('span', 'mn-key', bar, opt.keyboard && !COARSE ? 'M · plano' : 'Plano');
  const wrap = html('div', 'mn-svgwrap', frame);
  const sv = svg('svg', { class: 'mn-svg', focusable: 'false' }, wrap);
  const legend = html('div', 'mn-legend', frame);
  legend.innerHTML = '<span><i class="mn-lg-you"></i>Tú</span><span><i class="mn-lg-door"></i>Puerta</span><span><i class="mn-lg-win"></i>Ventanal</span>' +
    '<span class="mn-lg-others" hidden><i class="mn-lg-oth"></i><b>0</b>&nbsp;visitantes</span>' +
    (COARSE ? '' : '<span class="mn-lg-keys">Flechas para elegir · Intro para ir</span>');
  const lgOthers = legend.querySelector('.mn-lg-others'), lgOthersN = lgOthers.querySelector('b');

  const defs = svg('defs', null, sv);
  const grad = svg('radialGradient', { id: gradId, cx: '0', cy: '0', r: '1', gradientUnits: 'userSpaceOnUse' }, defs);
  svg('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '.55' }, grad);
  svg('stop', { offset: '1', 'stop-color': '#ffffff', 'stop-opacity': '0' }, grad);
  const gGrid = svg('g', null, sv), gShip = svg('g', null, sv), gWin = svg('g', null, sv), gRooms = svg('g', null, sv);
  const gDoors = svg('g', null, sv), gBadges = svg('g', null, sv), gOthers = svg('g', null, sv);
  const gTrail = svg('g', { class: 'mn-trail' }, sv), gFx = svg('g', null, sv);
  const gPlayer = svg('g', { class: 'mn-player', visibility: 'hidden' }, sv);
  const cone = svg('path', { fill: `url(#${gradId})` }, gPlayer);
  const halo = svg('circle', { class: 'mn-halo' }, gPlayer);
  const dot = svg('path', { class: 'mn-dot' }, gPlayer);
  const TRAIL_N = 24;
  const trailDots = Array.from({ length: TRAIL_N }, () => svg('circle', { visibility: 'hidden' }, gTrail));

  let roomEls = new Map(), badgeEls = new Map(), player = null, current = null, expanded = false, overlay = null;
  let trail = [], lastFocus = null, disposed = false, closeTimer = null, fitRaf = 0, counts = {};
  const others = new Map(); // id → { g, c, l, t, color }

  /* ---------- dibujo ---------- */
  function build() {
    const { bounds: b, unit: u, rooms, doors } = L;
    sv.style.setProperty('--mn-sw', r2(u * 0.18));
    const depth = b.z1 - b.z0, m = L.fromShip ? 0 : u * 3, nose = num(opt.noseLength) ? opt.noseLength : depth * 0.3, eng = u * 6;
    const vx0 = b.x0 - m - eng * 1.4 - u * 2, vx1 = b.x1 + m + (L.hull ? nose : 0) + u * 2, vz0 = b.z0 - m - u * 2, vz1 = b.z1 + m + u * 2;
    sv.setAttribute('viewBox', [vx0, vz0, vx1 - vx0, vz1 - vz0].map(r2).join(' '));
    eyebrow.textContent = L.deck; title.textContent = opt.title || L.name;
    for (const g of [gGrid, gShip, gWin, gRooms, gDoors, gBadges]) g.replaceChildren();

    // rejilla tenue de fondo, cada 5 % del lado mayor
    const step = u * 5;
    for (let x = Math.ceil(vx0 / step) * step; x < vx1; x += step) svg('line', { class: 'mn-gridline', x1: r2(x), x2: r2(x), y1: r2(vz0), y2: r2(vz1) }, gGrid);
    for (let z = Math.ceil(vz0 / step) * step; z < vz1; z += step) svg('line', { class: 'mn-gridline', y1: r2(z), y2: r2(z), x1: r2(vx0), x2: r2(vx1) }, gGrid);

    // casco: popa redondeada, motores como la nave exterior (dos laterales y uno central más largo) y proa en punta
    if (L.hull) {
      const hx0 = b.x0 - m, hx1 = b.x1 + m, hz0 = b.z0 - m, hz1 = b.z1 + m, cz = (hz0 + hz1) / 2, rr = u * 7;
      const custom = typeof L.hull === 'string' && L.hull !== 'auto';
      if (!custom && L.engines) {
        const list = L.engines >= 3 ? [[-0.27, 1], [0.27, 1], [0, 1.4]] : L.engines === 2 ? [[-0.27, 1], [0.27, 1]] : [[0, 1.4]];
        for (const [k, len] of list) {
          const ez = cz + k * depth, eh = depth * (k ? 0.2 : 0.17), el = eng * len;
          svg('rect', { class: 'mn-flame', x: r2(hx0 - el - u * 1.6), y: r2(ez - eh * 0.32), width: r2(u * 2.2), height: r2(eh * 0.64), rx: r2(u) }, gShip);
          svg('rect', { class: 'mn-engine', x: r2(hx0 - el), y: r2(ez - eh / 2), width: r2(el + u), height: r2(eh), rx: r2(u * 1.6) }, gShip);
        }
      }
      const d = custom ? L.hull :
        `M${r2(hx0 + rr)} ${r2(hz0)} L${r2(hx1)} ${r2(hz0)} Q${r2(hx1 + nose * 0.55)} ${r2(hz0)} ${r2(hx1 + nose)} ${r2(cz)} Q${r2(hx1 + nose * 0.55)} ${r2(hz1)} ${r2(hx1)} ${r2(hz1)} L${r2(hx0 + rr)} ${r2(hz1)} Q${r2(hx0)} ${r2(hz1)} ${r2(hx0)} ${r2(hz1 - rr)} L${r2(hx0)} ${r2(hz0 + rr)} Q${r2(hx0)} ${r2(hz0)} ${r2(hx0 + rr)} ${r2(hz0)}Z`;
      svg('path', { class: 'mn-hullshape', d }, gShip);
      if (!custom) {
        const i = u * 1.4;
        svg('path', { class: 'mn-hullin', d: `M${r2(hx0 + rr)} ${r2(hz0 + i)} L${r2(hx1)} ${r2(hz0 + i)} Q${r2(hx1 + nose * 0.5)} ${r2(hz0 + i)} ${r2(hx1 + nose - i * 2)} ${r2(cz)} Q${r2(hx1 + nose * 0.5)} ${r2(hz1 - i)} ${r2(hx1)} ${r2(hz1 - i)} L${r2(hx0 + rr)} ${r2(hz1 - i)}` }, gShip);
      }
    }
    // ventanales (mismos rectángulos que la nave 3D), dibujados como una franja luminosa centrada en el muro
    for (const w of L.windows) {
      const t = u * 0.8, alongZ = w.d > w.w;
      svg('rect', alongZ ? { class: 'mn-win', x: r2(w.x + w.w / 2 - t / 2), y: r2(w.z), width: r2(t), height: r2(w.d), rx: r2(t / 2) }
        : { class: 'mn-win', x: r2(w.x), y: r2(w.z + w.d / 2 - t / 2), width: r2(w.w), height: r2(t), rx: r2(t / 2) }, gWin);
    }

    // estancias: pasillos primero, para que queden debajo
    roomEls = new Map(); badgeEls = new Map();
    const sorted = [...rooms].sort((a, c) => (a.kind === 'corridor' ? 0 : 1) - (c.kind === 'corridor' ? 0 : 1));
    for (const r of sorted) {
      const corridor = r.kind === 'corridor', canTp = !corridor || opt.teleportCorridors;
      const g = svg('g', { class: 'mn-room' + (corridor ? ' mn-room--corridor' : ''), style: `--c:${r.color}`, 'data-room': r.id }, gRooms);
      const pad = u * 0.5;
      svg('rect', { x: r2(r.x + pad), y: r2(r.z + pad), width: r2(r.w - pad * 2), height: r2(r.d - pad * 2), rx: r2(u * 1.3) }, g);
      const fs = Math.min(u * 3.1, r.w * 0.13, r.d * 0.22), fsSub = fs * 0.62, tx = r.x + u * 2.2, maxL = r.w - u * 4.4;
      const text = (cls, x, y, size, str, max, center) => {
        const t = svg('text', { class: cls, x: r2(x), y: r2(y), 'font-size': r2(size) }, g);
        if (center) { t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'central'); }
        t.dataset.fs = r2(size); t.dataset.max = r2(max); t.textContent = str; return t;
      };
      if (corridor) {
        text('mn-name', r.cx, r.cz, Math.min(u * 1.9, r.d * 0.36), r.name, r.w - u * 6, true);
      } else {
        const ty = r.cz - (fs + fsSub) * 0.25;
        text('mn-name mn-name-long', tx, ty, fs, r.name, maxL);
        text('mn-name mn-name-short', r.cx, r.cz, Math.min(u * 4.4, r.w * 0.2), r.short, r.w - u * 2.4, true);
        if (r.sub) text('mn-sub', tx, ty + fs * 1.25, fsSub, r.sub, maxL);
        text('mn-here', tx, ty + fs * 1.25, fsSub, 'Estás aquí', maxL);
      }
      if (canTp) {
        g.dataset.tp = '1';
        g.addEventListener('click', e => { if (expanded) { e.stopPropagation(); teleport(r.id, 'click'); } });
        g.addEventListener('keydown', e => { if (expanded && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); teleport(r.id, 'key'); } });
      }
      roomEls.set(r.id, g);
      // etiqueta de visitantes (multijugador), arriba a la derecha de la sala
      const bh = u * 2.6, bw = u * 9.5, bx = r.x + r.w - pad - u * 0.8 - bw, by = r.z + pad + u * 0.8;
      const bg = svg('g', { class: 'mn-badge' }, gBadges);
      svg('rect', { x: r2(bx), y: r2(by), width: r2(bw), height: r2(bh), rx: r2(bh / 2) }, bg);
      const bt = svg('text', { x: r2(bx + bw / 2), y: r2(by + bh / 2), 'font-size': r2(bh * 0.52), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, bg);
      bt.dataset.fs = r2(bh * 0.52); bt.dataset.max = r2(bw - u * 1.4);
      badgeEls.set(r.id, { g: bg, t: bt });
    }
    for (const d of doors) {
      const t = u * 0.9, alongZ = d.d > d.w;
      svg('rect', alongZ ? { class: 'mn-door', x: r2(d.cx - t / 2), y: r2(d.z + u * 0.4), width: r2(t), height: r2(Math.max(t, d.d - u * 0.8)), rx: r2(t / 2) }
        : { class: 'mn-door', x: r2(d.x + u * 0.4), y: r2(d.cz - t / 2), width: r2(Math.max(t, d.w - u * 0.8)), height: r2(t), rx: r2(t / 2) }, gDoors);
    }
    applyA11y(); sizeMarkers(); applyCounts();
    if (current) markHere(current, true);
    scheduleFit();
  }

  // encoge el cuerpo de letra de los nombres que no caben en su estancia (necesita que el SVG esté pintado)
  function fit() {
    fitRaf = 0;
    if (disposed || !root.isConnected || !root.getClientRects().length) return;
    for (const t of sv.querySelectorAll('text[data-max]')) {
      t.setAttribute('font-size', t.dataset.fs);
      let len = 0; try { len = t.getComputedTextLength(); } catch { /* no pintado */ }
      const max = +t.dataset.max;
      if (len > max && max > 0) t.setAttribute('font-size', r2(t.dataset.fs * max / len * 0.98));
    }
  }
  function scheduleFit() { if (!fitRaf && !disposed) fitRaf = requestAnimationFrame(fit); }

  function sizeMarkers() {
    const u = L.unit * (expanded ? 1 : 1.7), R = u * 1.25, C = u * 9, a = Math.PI / 5.5;
    dot.setAttribute('d', `M0 ${r2(-R * 1.6)} L${r2(R * 1.15)} ${r2(R)} L0 ${r2(R * 0.45)} L${r2(-R * 1.15)} ${r2(R)}Z`);
    halo.setAttribute('r', r2(R * 1.1));
    cone.setAttribute('d', `M0 0 L${r2(-Math.sin(a) * C)} ${r2(-Math.cos(a) * C)} A${r2(C)} ${r2(C)} 0 0 1 ${r2(Math.sin(a) * C)} ${r2(-Math.cos(a) * C)}Z`);
    grad.setAttribute('r', r2(C));
    for (const c of trailDots) c.setAttribute('r', r2(L.unit * (expanded ? 0.45 : 0.7)));
    for (const o of others.values()) sizeOther(o);
  }

  /* ---------- accesibilidad ---------- */
  function applyA11y() {
    const names = L.rooms.filter(r => r.kind !== 'corridor').map(r => r.name).join(', ');
    if (expanded) {
      frame.removeAttribute('role'); frame.removeAttribute('tabindex'); frame.removeAttribute('aria-label');
      sv.removeAttribute('aria-hidden'); sv.setAttribute('role', 'group'); sv.setAttribute('aria-labelledby', title.id);
    } else {
      frame.setAttribute('role', 'button'); frame.setAttribute('tabindex', '0');
      frame.setAttribute('aria-label', `Abrir el plano de la nave. ${current ? 'Estás en ' + current.name + '.' : ''}`.trim());
      sv.setAttribute('aria-hidden', 'true'); sv.removeAttribute('role'); sv.removeAttribute('aria-labelledby');
    }
    for (const [id, g] of roomEls) {
      const r = L.rooms.find(q => q.id === id);
      if (expanded && g.dataset.tp) {
        g.setAttribute('role', 'button'); g.setAttribute('tabindex', '0');
        g.setAttribute('aria-label', `${r.name}${r.sub ? ', ' + r.sub : ''}${counts[id] ? `, ${counts[id]} ${counts[id] === 1 ? 'visitante' : 'visitantes'}` : ''}. Teletransportarse.`);
      } else { g.removeAttribute('role'); g.removeAttribute('tabindex'); g.removeAttribute('aria-label'); }
      if (current && current.id === id) g.setAttribute('aria-current', 'location'); else g.removeAttribute('aria-current');
    }
    sv.setAttribute('aria-description', `${L.deck}: ${L.name}. ${names}.`);
  }

  /* ---------- jugador ---------- */
  function roomAt(x, z) {
    if (!num(x) || !num(z)) return null;
    let hit = null;
    for (const r of L.rooms) if (inRect(r, x, z) && (!hit || hit.kind === 'corridor')) hit = r;
    return hit;
  }
  function markHere(r, on) { const g = r && roomEls.get(r.id); if (g) { g.classList.toggle('mn-room--here', on); if (on) g.setAttribute('aria-current', 'location'); else g.removeAttribute('aria-current'); } }

  function setPlayer(x, z, yaw) {
    if (disposed || !num(x) || !num(z)) return;
    if (!num(yaw)) yaw = player ? player.yaw : 0;
    if (player && player.x === x && player.z === z && player.yaw === yaw) return; // nada que hacer este frame
    const jump = player && Math.hypot(x - player.x, z - player.z) > L.unit * 12;
    const first = !player;
    player = { x, z, yaw };
    gPlayer.setAttribute('transform', `translate(${r2(x)} ${r2(z)}) rotate(${r2(-normYaw(yaw) * 180 / Math.PI)})`);
    if (first) gPlayer.removeAttribute('visibility');
    if (opt.trail) {
      if (jump) trail = [];
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(x - last.x, z - last.z) > L.unit * 1.6) {
        trail.push({ x, z }); if (trail.length > TRAIL_N + 1) trail.shift();
        drawTrail();
      } else if (jump) drawTrail();
    }
    // en una puerta o rozando el borde se mantiene la estancia anterior: sin parpadeos de "en tránsito"
    let r = roomAt(x, z);
    if (!r && current && (inRect(current, x, z, L.unit) || L.doors.some(d => inRect(d, x, z, L.unit * 0.3)))) r = current;
    if (r !== current) {
      const prev = current;
      markHere(prev, false); current = r; markHere(r, true);
      barRoom.textContent = r ? r.name : 'En tránsito';
      if (!expanded) frame.setAttribute('aria-label', `Abrir el plano de la nave. ${r ? 'Estás en ' + r.name + '.' : ''}`.trim());
      emit('room', { room: r ? { ...r } : null, prev: prev ? { ...prev } : null });
    }
  }
  function drawTrail() {
    const pts = trail.slice(0, -1), n = pts.length;
    trailDots.forEach((c, i) => {
      const p = pts[i];
      if (!p) { c.setAttribute('visibility', 'hidden'); return; }
      c.setAttribute('cx', r2(p.x)); c.setAttribute('cy', r2(p.z));
      c.setAttribute('fill-opacity', r2(0.05 + 0.4 * (i / Math.max(1, n))));
      c.removeAttribute('visibility');
    });
  }

  /* ---------- otros visitantes (multijugador) ---------- */
  function sizeOther(o) {
    const u = L.unit * (expanded ? 1 : 1.5);
    o.c.setAttribute('r', r2(u * 0.95));
    o.l.setAttribute('y2', r2(-u * 2.1));
    o.t.setAttribute('font-size', r2(L.unit * 1.7)); o.t.setAttribute('y', r2(-L.unit * 1.2));
  }
  function setOthers(list, { yawOffset = 0 } = {}) {
    if (disposed) return;
    const alive = new Set();
    for (const p of Array.isArray(list) ? list : []) {
      if (!p || p.id == null || !num(+p.x) || !num(+p.z)) continue;
      const id = String(p.id); alive.add(id);
      let o = others.get(id);
      const color = p.color ? hex(p.color) : colorFromId(id);
      if (!o) {
        const g = svg('g', { class: 'mn-other' }, gOthers);
        const ring = svg('g', null, g);
        const l = svg('line', { x1: 0, y1: 0, x2: 0 }, ring);
        const c = svg('circle', { cx: 0, cy: 0 }, ring);
        const t = svg('text', { class: 'mn-oname', x: r2(L.unit * 1.6) }, g);
        const tt = svg('title', null, g);
        o = { g, ring, c, l, t, tt, color: null, name: '', x: 0, z: 0 };
        others.set(id, o); sizeOther(o);
      }
      if (o.color !== color) { o.color = color; o.c.style.fill = color; o.l.style.stroke = color; o.t.style.fill = color; }
      const name = String(p.name || 'Visitante');
      if (o.name !== name) { o.name = name; o.t.textContent = name; o.tt.textContent = name; }
      o.x = +p.x; o.z = +p.z;
      o.g.setAttribute('transform', `translate(${r2(o.x)} ${r2(o.z)})`);
      const yw = num(+p.yaw) ? +p.yaw + yawOffset : null;
      if (yw == null) o.l.setAttribute('visibility', 'hidden');
      else { o.l.removeAttribute('visibility'); o.ring.setAttribute('transform', `rotate(${r2(-normYaw(yw) * 180 / Math.PI)})`); }
    }
    for (const [id, o] of others) if (!alive.has(id)) { o.g.remove(); others.delete(id); }
    placeLabels();
    lgOthersN.textContent = others.size;
    lgOthers.hidden = others.size === 0;
    lgOthers.lastChild.textContent = ' ' + (others.size === 1 ? 'visitante' : 'visitantes');
  }
  // nombres de los visitantes sin solaparse: a la derecha, si no cabe a la izquierda, y si tampoco, solo el punto
  function placeLabels() {
    if (!expanded) return;
    const u = L.unit, fs = u * 1.7, placed = [];
    if (player) placed.push({ x0: player.x - u * 1.6, x1: player.x + u * 1.6, z0: player.z - u * 2, z1: player.z + u * 1.4 });
    const over = a => placed.some(b => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1);
    const list = [...others.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const o of list) {
      if (list.length > 40) { o.t.setAttribute('visibility', 'hidden'); continue; }
      const w = o.name.length * fs * 0.62, z0 = o.z - u * 1.2 - fs * 0.8, z1 = o.z - u * 1.2 + fs * 0.2;
      const right = { x0: o.x + u * 1.6, x1: o.x + u * 1.6 + w, z0, z1 }, left = { x0: o.x - u * 1.6 - w, x1: o.x - u * 1.6, z0, z1 };
      const spot = !over(right) ? right : !over(left) ? left : null;
      if (!spot) { o.t.setAttribute('visibility', 'hidden'); continue; }
      placed.push(spot);
      o.t.removeAttribute('visibility');
      o.t.setAttribute('x', r2(spot === right ? u * 1.6 : -u * 1.6));
      o.t.setAttribute('text-anchor', spot === right ? 'start' : 'end');
    }
  }
  function setRoomCounts(c) {
    counts = {};
    if (c && typeof c === 'object') for (const k in c) { const n = Math.max(0, Math.floor(+c[k] || 0)); if (n) counts[k] = n; }
    applyCounts(); if (expanded) { applyA11y(); scheduleFit(); }
  }
  function applyCounts() {
    for (const [id, b] of badgeEls) {
      const n = counts[id] || 0;
      b.g.classList.toggle('mn-badge--on', n > 0);
      b.t.textContent = n ? `${n} ${n === 1 ? 'visitante' : 'visitantes'}` : '';
    }
  }

  /* ---------- teletransporte ---------- */
  function fx(from, to) {
    const u = L.unit;
    const c = svg('circle', { class: 'mn-pulse', cx: r2(to.x), cy: r2(to.z), r: r2(u * 2.2) }, gFx);
    later(() => c.remove(), 950);
    if (from && Math.hypot(to.x - from.x, to.z - from.z) > u * 3) {
      const mx = (from.x + to.x) / 2, mz = (from.z + to.z) / 2, dx = to.x - from.x, dz = to.z - from.z, k = 0.22;
      const d = `M${r2(from.x)} ${r2(from.z)} Q${r2(mx - dz * k)} ${r2(mz + dx * k)} ${r2(to.x)} ${r2(to.z)}`;
      const p = svg('path', { class: 'mn-beam', d }, gFx);
      let len = 0; try { len = p.getTotalLength(); } catch { len = Math.hypot(dx, dz) * 1.1; }
      p.style.setProperty('--len', r2(len)); p.style.strokeDasharray = r2(len);
      later(() => p.remove(), 950);
    }
  }
  function teleport(id, via = 'api') {
    if (disposed) return false;
    const r = L.rooms.find(q => q.id === id);
    if (!r) return false;
    const from = player ? { ...player } : null;
    const ev = { roomId: r.id, room: { ...r, spawn: { ...r.spawn } }, x: r.spawn.x, z: r.spawn.z, yaw: r.spawn.yaw, from, via };
    fx(from, ev);
    if (opt.autoMove) setPlayer(ev.x, ev.z, ev.yaw);
    emit('teleport', ev);
    if (opt.closeOnTeleport && expanded) { clearTimeout(closeTimer); closeTimer = later(() => collapse('teleport'), Math.max(0, +opt.closeDelay || 0)); }
    return true;
  }

  /* ---------- plano ampliado ---------- */
  function focusables() { return [...roomEls.values()].filter(g => g.getAttribute('tabindex') === '0').concat(closeBtn); }
  function moveFocus(dx, dz) {
    const el = document.activeElement?.closest?.('.mn-room');
    const from = (el && L.rooms.find(r => r.id === el.dataset.room)) || current || L.rooms[0];
    let best = null, bs = Infinity;
    for (const r of L.rooms) {
      const g = roomEls.get(r.id);
      if (r === from || !g || g.getAttribute('tabindex') !== '0') continue;
      const vx = r.cx - from.cx, vz = r.cz - from.cz, along = vx * dx + vz * dz;
      if (along <= 0.01) continue;
      const s = along + Math.abs(vx * dz - vz * dx) * 2;
      if (s < bs) { bs = s; best = g; }
    }
    best?.focus({ preventScroll: true });
  }
  function onOverlayKey(e) {
    if (e.isComposing) return;
    const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); collapse('escape'); return; }
    if (e.code === opt.toggleKey && opt.keyboard && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) collapse('key'); return; }
    if (dirs[e.key]) { e.preventDefault(); e.stopPropagation(); moveFocus(...dirs[e.key]); return; }
    if (e.key === 'Tab') {
      const f = focusables(); if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      e.preventDefault(); e.stopPropagation();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus({ preventScroll: true });
      return;
    }
    e.stopPropagation(); // el resto de teclas no llega al juego mientras el plano está abierto
  }

  function expand(via = 'api') {
    if (expanded || disposed) return;
    expanded = true; lastFocus = document.activeElement;
    overlay = html('div', 'mn-overlay');
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-labelledby', title.id);
    overlay.addEventListener('click', e => { if (e.target === overlay) collapse('backdrop'); });
    overlay.addEventListener('keydown', onOverlayKey);
    root.classList.replace('mn--compact', 'mn--expanded');
    overlay.appendChild(root); document.body.appendChild(overlay);
    applyA11y(); sizeMarkers(); placeLabels(); fit();
    const tgt = current && roomEls.get(current.id)?.getAttribute('tabindex') === '0' ? roomEls.get(current.id) : closeBtn;
    tgt.focus({ preventScroll: true });
    emit('toggle', true, { via });
    // después de avisar: así el host ya está en modo modal cuando llega el pointerlockchange
    if (opt.releasePointer && document.pointerLockElement) try { document.exitPointerLock(); } catch { /* sin pointer lock */ }
  }
  function collapse(via = 'api') {
    if (!expanded) return;
    expanded = false; clearTimeout(closeTimer); closeTimer = null;
    root.classList.replace('mn--expanded', 'mn--compact');
    if (container.isConnected && !disposed) container.appendChild(root); else root.remove();
    overlay?.remove(); overlay = null;
    applyA11y(); sizeMarkers(); scheduleFit();
    if (via !== 'dispose' && lastFocus && typeof lastFocus.focus === 'function' && lastFocus.isConnected && lastFocus !== document.body) {
      try { lastFocus.focus({ preventScroll: true }); } catch { /* nada */ }
    }
    lastFocus = null;
    emit('toggle', false, { via });
  }
  const toggle = (via = 'api') => (expanded ? collapse(via) : expand(via));

  // ¿se ve el minimapa y está encima? (oculto con display:none, tapado por el universo o un panel → la M no hace nada)
  function isShown() {
    if (!root.isConnected) return false;
    const rects = root.getClientRects();
    if (!rects.length) return false;
    const r = frame.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (r.width < 2 || r.height < 2 || getComputedStyle(root).visibility === 'hidden') return false;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return true;
    const hit = document.elementFromPoint(cx, cy);
    return !hit || root.contains(hit);
  }
  const typing = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const onKey = e => {
    if (disposed || e.defaultPrevented || e.isComposing) return;
    if (expanded) { if (e.key === 'Escape') { e.preventDefault(); collapse('escape'); } else if (e.code === opt.toggleKey && opt.keyboard && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) { e.preventDefault(); collapse('key'); } return; }
    if (!opt.keyboard || e.code !== opt.toggleKey || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (!isShown()) return;
    if (typeof opt.canToggle === 'function') { let ok = true; try { ok = opt.canToggle(e) !== false; } catch { ok = false; } if (!ok) return; }
    e.preventDefault(); expand('key');
  };
  const onFrameClick = () => { if (!expanded) expand('click'); };
  const onFrameKey = e => { if (!expanded && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); expand('key'); } };
  frame.addEventListener('click', onFrameClick);
  frame.addEventListener('keydown', onFrameKey);
  closeBtn.addEventListener('click', e => { e.stopPropagation(); collapse('close'); });
  window.addEventListener('keydown', onKey);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleFit) : null;
  ro?.observe(root);
  const fontsDone = () => scheduleFit();
  document.fonts?.ready?.then(fontsDone).catch(() => {});
  document.fonts?.addEventListener?.('loadingdone', fontsDone);

  container.appendChild(root);
  build();
  if (opt.mode === 'expanded') expand('api');

  return {
    version: VERSION,
    setPlayer,
    setOthers,
    setRoomCounts,
    onTeleport: on('teleport'),
    onRoomChange: on('room'),
    onToggle: on('toggle'),
    teleportTo: id => teleport(id, 'api'),
    expand: () => expand('api'), collapse: () => collapse('api'), toggle: () => toggle('api'),
    isExpanded: () => expanded,
    roomAt: (x, z) => { const r = roomAt(x, z); return r ? { ...r } : null; },
    currentRoom: () => (current ? { ...current } : null),
    getRoom: id => { const r = L.rooms.find(q => q.id === id); return r ? { ...r, spawn: { ...r.spawn } } : null; },
    getLayout: () => L,
    setLayout(next) {
      if (disposed) return;
      L = normalize(next);
      if (current) { current = null; barRoom.textContent = '—'; }
      trail = []; drawTrail();
      build();
      if (player) { const p = player; player = null; setPlayer(p.x, p.z, p.yaw); }
    },
    dispose() {
      if (disposed) return;
      if (expanded) collapse('dispose');
      disposed = true;
      window.removeEventListener('keydown', onKey);
      document.fonts?.removeEventListener?.('loadingdone', fontsDone);
      ro?.disconnect();
      if (fitRaf) cancelAnimationFrame(fitRaf);
      for (const t of timers) clearTimeout(t); timers.clear();
      overlay?.remove(); root.remove(); others.clear();
      for (const k in cbs) cbs[k].clear();
      if (--styleRefs <= 0) { styleRefs = 0; document.getElementById(STYLE_ID)?.remove(); }
    },
  };
}

export default { init, fromGrid, yawFromDir, parseWindows, colorFromId, VERSION };
