/*
 * mapa-nave.js · Plano de la nave en tiempo real para La Malkevnia
 * Módulo ES autocontenido (sin dependencias). Dibuja un minimapa SVG con la
 * posición del jugador y un plano ampliado donde se puede tocar una estancia
 * para teletransportarse.
 *
 * Coordenadas: las del mundo 3D, en el plano XZ. X crece hacia la derecha del
 * plano y Z hacia abajo. Yaw igual que la cámara de three.js con
 * rotation.order 'YXZ': yaw 0 mira hacia -Z y el vector "adelante" es
 * (-sin(yaw), -cos(yaw)).
 *
 * API: const mapa = init(container, layout, opciones)
 *   mapa.setPlayer(x, z, yaw)   cada frame o cuando cambie la posición
 *   mapa.onTeleport(cb)         cb({ roomId, room, x, z, yaw }); devuelve la baja
 *   mapa.dispose()              quita DOM, listeners y estilos
 * Más en README.md.
 */

const NS = 'http://www.w3.org/2000/svg';
const STYLE_ID = 'mapa-nave-css';
let styleRefs = 0;

const CSS = `
.mn{--mn-bg:rgba(14,9,32,.84);--mn-line:rgba(176,150,255,.3);--mn-fg:#ece6ff;--mn-muted:#a99ccf;
  --mn-accent:#b9a2ff;--mn-glow:#7fd6ff;--mn-player:#ffffff;--mn-hull:rgba(120,96,220,.10);
  --mn-font:"Exo 2",system-ui,sans-serif;--mn-display:"Orbitron","Exo 2",system-ui,sans-serif;
  --mn-mono:"JetBrains Mono",ui-monospace,monospace;
  color:var(--mn-fg);font-family:var(--mn-font);box-sizing:border-box;width:100%;user-select:none;-webkit-user-select:none}
.mn *{box-sizing:border-box}
.mn-frame{background:var(--mn-bg);border:1px solid var(--mn-line);border-radius:12px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);overflow:hidden}
.mn--compact .mn-frame{cursor:pointer;padding:6px 8px 8px}
.mn--compact .mn-frame:hover{border-color:var(--mn-accent)}
.mn--compact .mn-frame:focus-visible{outline:2px solid var(--mn-accent);outline-offset:2px}
.mn-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;font:600 10px/1.2 var(--mn-mono);letter-spacing:.2em;text-transform:uppercase;color:var(--mn-muted);padding:2px 2px 6px}
.mn-bar b{color:var(--mn-fg);font-weight:600;letter-spacing:.08em;text-transform:none;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.mn-key{border:1px solid var(--mn-line);border-radius:4px;padding:1px 5px;font-size:9px;letter-spacing:.1em;color:var(--mn-muted);flex:none}
.mn-svg{display:block;width:100%;height:auto;overflow:visible}
.mn-head{display:none}
.mn--expanded .mn-bar{display:none}
.mn--expanded .mn-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:10px 20px;padding:18px 20px 6px}
.mn-eyebrow{font:600 11px var(--mn-mono);letter-spacing:.28em;text-transform:uppercase;color:var(--mn-accent)}
.mn-title{font:700 clamp(20px,3vw,28px)/1.1 var(--mn-display);letter-spacing:.03em;margin:6px 0 0;text-wrap:balance}
.mn-hint{font:400 14px var(--mn-font);color:var(--mn-muted);margin:0}
.mn-close{font:600 12px var(--mn-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--mn-fg);background:transparent;border:1px solid var(--mn-line);border-radius:999px;padding:8px 14px;cursor:pointer}
.mn-close:hover,.mn-close:focus-visible{border-color:var(--mn-accent);outline:none;background:rgba(185,162,255,.12)}
.mn--expanded .mn-frame{border-radius:18px;width:min(1100px,100%);max-height:100%;display:flex;flex-direction:column}
.mn--expanded .mn-svgwrap{padding:6px 20px 20px;min-height:0;flex:1;display:flex;align-items:center;justify-content:center}
.mn--expanded .mn-svg{max-height:calc(100vh - 170px);max-height:calc(100dvh - 170px)}
.mn-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
  padding:calc(16px + env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) calc(16px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));
  background:radial-gradient(ellipse at 50% 40%,rgba(40,24,90,.55),rgba(4,2,12,.86));animation:mn-in .22s ease-out}
.mn-overlay .mn{max-height:100%;display:flex;justify-content:center}
@keyframes mn-in{from{opacity:0}to{opacity:1}}

.mn-hullshape{fill:var(--mn-hull);stroke:var(--mn-accent);stroke-opacity:.75;stroke-width:var(--mn-sw)}
.mn-hullin{fill:none;stroke:var(--mn-accent);stroke-opacity:.22;stroke-dasharray:calc(var(--mn-sw)*6) calc(var(--mn-sw)*5);stroke-width:var(--mn-sw)}
.mn-engine{fill:rgba(120,96,220,.16);stroke:var(--mn-accent);stroke-opacity:.5;stroke-width:var(--mn-sw)}
.mn-flame{fill:var(--mn-glow);opacity:.35;animation:mn-flame 2.4s ease-in-out infinite}
@keyframes mn-flame{50%{opacity:.12}}
.mn-gridline{stroke:var(--mn-accent);stroke-opacity:.06;stroke-width:calc(var(--mn-sw)*.6)}
.mn-room rect{fill:var(--c);fill-opacity:.11;stroke:var(--c);stroke-opacity:.5;stroke-width:var(--mn-sw);transition:fill-opacity .2s,stroke-opacity .2s}
.mn-room--corridor rect{fill:#0b0720;fill-opacity:.7;stroke:var(--mn-accent);stroke-opacity:.25}
.mn--expanded .mn-room{cursor:pointer;outline:none}
.mn--expanded .mn-room:hover rect,.mn--expanded .mn-room:focus-visible rect{fill-opacity:.26;stroke-opacity:1}
.mn--expanded .mn-room:focus-visible rect{stroke-width:calc(var(--mn-sw)*2.4)}
.mn-room--here rect{fill-opacity:.3;stroke-opacity:1;stroke-width:calc(var(--mn-sw)*1.8)}
.mn-room--corridor.mn-room--here rect{fill:var(--mn-accent);fill-opacity:.12}
.mn-door{fill:var(--mn-accent);fill-opacity:.55}
.mn-name{fill:var(--mn-fg);font-family:var(--mn-display);font-weight:700;letter-spacing:.02em;pointer-events:none}
.mn-room--corridor .mn-name{fill:var(--mn-muted);font-family:var(--mn-mono);font-weight:600;letter-spacing:.35em;text-transform:uppercase}
.mn-sub,.mn-here{font-family:var(--mn-mono);fill:var(--mn-muted);pointer-events:none;letter-spacing:.04em}
.mn-here{fill:var(--mn-glow);display:none}
.mn-room--here .mn-here{display:inline}
.mn-room--here .mn-sub{display:none}
.mn--compact .mn-sub,.mn--compact .mn-here,.mn--compact .mn-name-long,.mn--compact .mn-room--corridor .mn-name{display:none}
.mn--expanded .mn-name-short{display:none}
.mn--compact .mn-name{fill:var(--c)}
.mn-trail circle{fill:var(--mn-player)}
.mn-cone{fill:url(#mn-cone-grad)}
.mn-dot{fill:var(--mn-player);stroke:#1a1038;stroke-width:calc(var(--mn-sw)*1.2)}
.mn-halo{fill:none;stroke:var(--mn-player);stroke-opacity:.5;stroke-width:var(--mn-sw);transform-box:fill-box;transform-origin:center;animation:mn-halo 2.2s ease-out infinite}
@keyframes mn-halo{from{transform:scale(1);opacity:.9}to{transform:scale(2.6);opacity:0}}
.mn-pulse{fill:none;stroke:var(--mn-glow);stroke-width:calc(var(--mn-sw)*2);transform-box:fill-box;transform-origin:center;animation:mn-pulse .9s ease-out forwards}
@keyframes mn-pulse{from{transform:scale(.2);opacity:1}to{transform:scale(3);opacity:0}}
@media (prefers-reduced-motion:reduce){.mn-halo,.mn-flame,.mn-overlay{animation:none}.mn-pulse{animation-duration:.01s}}
`;

function svg(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
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
const hex = c => typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : (c || '#b9a2ff');
const PALETTE = ['#b9a2ff', '#ff8ad8', '#ffc27a', '#7fd6ff', '#9b7bff', '#ffb36b', '#6affc8', '#d1a6ff'];
const r2 = v => Math.round(v * 1000) / 1000;

/** Convierte una dirección (dx, dz) en yaw con la convención de three.js. */
export function yawFromDir(dx, dz) { return Math.atan2(-dx, -dz); }

/**
 * Convierte el formato de rejilla de nave-3d (ROOMS con x0..x1 / z0..z1 en
 * casillas, inclusivos, y DOORS con lista de casillas) a un layout en metros.
 */
export function fromGrid({ rooms, doors = [], tile = 1, name, deck } = {}) {
  return {
    name, deck,
    rooms: rooms.map(r => ({
      id: r.id, name: r.name, sub: r.sub, short: r.short, color: hex(r.color), spawn: r.spawn,
      kind: r.kind || (/^pasillo/i.test(r.id) || /^pasillo/i.test(r.name || '') ? 'corridor' : 'room'),
      x: r.x0 * tile, z: r.z0 * tile, w: (r.x1 - r.x0 + 1) * tile, d: (r.z1 - r.z0 + 1) * tile,
    })),
    doors: doors.map((d, i) => {
      const xs = d.tiles.map(t => t[0]), zs = d.tiles.map(t => t[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      return { id: d.id || 'puerta-' + i, a: d.a, b: d.b, x: x0 * tile, z: z0 * tile, w: (x1 - x0 + 1) * tile, d: (z1 - z0 + 1) * tile };
    }),
  };
}

function shortName(n = '') {
  return n.replace(/^Sala de (las? )?/i, '').replace(/^Puente de mando$/i, 'Puente').replace(/^Ordenador de a bordo$/i, 'Ordenador');
}
const inRect = (r, x, z, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && z >= r.z - pad && z <= r.z + r.d + pad;
const touches = (a, b, eps = 0.01) => a.x <= b.x + b.w + eps && b.x <= a.x + a.w + eps && a.z <= b.z + b.d + eps && b.z <= a.z + a.d + eps;

function normalize(layout) {
  if (!layout || !Array.isArray(layout.rooms) || !layout.rooms.length) throw new Error('mapa-nave: el layout necesita rooms[]');
  // acepta w/d o width/depth (layout.json de nave-3d), y between:[a,b] en puertas
  const rooms = layout.rooms.map((r, i) => {
    const w = r.w ?? r.width, d = r.d ?? r.depth;
    const corridor = r.kind ? r.kind === 'corridor' : /^pasillo|corridor/i.test(r.id + ' ' + (r.name || ''));
    return { ...r, w, d, color: r.color != null ? hex(r.color) : PALETTE[i % PALETTE.length], kind: corridor ? 'corridor' : 'room',
      short: r.short || shortName(r.name), cx: r.x + w / 2, cz: r.z + d / 2 };
  });
  const doors = (layout.doors || []).map((d, i) => {
    const w = d.w ?? d.width, dd = d.d ?? d.depth, [a, b] = d.between || [d.a, d.b];
    return { id: d.id || 'puerta-' + i, ...d, a, b, w, d: dd, cx: d.x + w / 2, cz: d.z + dd / 2 };
  });
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const r of rooms) { x0 = Math.min(x0, r.x); z0 = Math.min(z0, r.z); x1 = Math.max(x1, r.x + r.w); z1 = Math.max(z1, r.z + r.d); }
  const b = layout.bounds || (layout.ship ? { x0: layout.ship.x, z0: layout.ship.z, x1: layout.ship.x + layout.ship.width, z1: layout.ship.z + layout.ship.depth } : { x0, z0, x1, z1 });
  const unit = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 100; // 1 % del lado mayor

  // punto de aparición: justo dentro de la puerta principal, mirando hacia dentro
  for (const r of rooms) {
    if (r.spawn) { r.spawn = { yaw: 0, ...r.spawn }; continue; }
    if (r.kind === 'corridor') { r.spawn = { x: r.cx, z: r.cz, yaw: r.w >= r.d ? yawFromDir(1, 0) : yawFromDir(0, 1) }; continue; }
    const own = doors.filter(d => d.a === r.id || d.b === r.id);
    const cand = (own.length ? own : doors.filter(d => touches(d, r)));
    const door = cand.find(d => { const o = rooms.find(q => q !== r && (q.id === d.a || q.id === d.b)); return o && o.kind === 'corridor'; }) || cand[0];
    if (!door) { r.spawn = { x: r.cx, z: r.cz, yaw: 0 }; continue; }
    const alongZ = door.d > door.w; // la puerta se extiende en Z: se cruza en X
    const nx = alongZ ? Math.sign(r.cx - door.cx) || 1 : 0, nz = alongZ ? 0 : Math.sign(r.cz - door.cz) || 1;
    const step = (alongZ ? door.w : door.d) / 2 + Math.min(1.6, (alongZ ? r.w : r.d) * 0.3);
    let sx = door.cx + nx * step, sz = door.cz + nz * step;
    sx = Math.min(r.x + r.w - 0.3, Math.max(r.x + 0.3, sx)); sz = Math.min(r.z + r.d - 0.3, Math.max(r.z + 0.3, sz));
    r.spawn = { x: sx, z: sz, yaw: yawFromDir(nx, nz) };
  }
  return { name: layout.name || 'Cubierta principal', deck: layout.deck || 'Plano de la nave', rooms, doors, bounds: b, unit, hull: layout.hull ?? 'auto', nose: layout.nose || '+x' };
}

/**
 * Crea el mapa dentro de `container`.
 * opciones: { mode:'compact'|'expanded', keyboard:true, toggleKey:'KeyM', trail:true,
 *             autoMove:false, closeOnTeleport:true, releasePointer:true, teleportCorridors:true,
 *             title, hint }
 */
export function init(container, layout, opciones = {}) {
  if (!container) throw new Error('mapa-nave: falta el contenedor');
  const opt = { mode: 'compact', keyboard: true, toggleKey: 'KeyM', trail: true, autoMove: false, closeOnTeleport: true,
    releasePointer: true, teleportCorridors: true, hint: 'Toca una estancia para teletransportarte.', ...opciones };
  let L = normalize(layout);

  if (!styleRefs++) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); }

  const cbs = { teleport: new Set(), room: new Set(), toggle: new Set() };
  const on = k => cb => { cbs[k].add(cb); return () => cbs[k].delete(cb); };
  const emit = (k, v) => { for (const cb of [...cbs[k]]) { try { cb(v); } catch (e) { console.error('mapa-nave', e); } } };

  const root = html('div', 'mn mn--compact');
  const frame = html('div', 'mn-frame', root);
  const head = html('div', 'mn-head', frame);
  const headTxt = html('div', '', head);
  const eyebrow = html('div', 'mn-eyebrow', headTxt);
  const title = html('h2', 'mn-title', headTxt);
  const headRight = html('div', '', head);
  headRight.style.cssText = 'display:flex;align-items:center;gap:14px;flex-wrap:wrap';
  const hint = html('p', 'mn-hint', headRight, opt.hint);
  const closeBtn = html('button', 'mn-close', headRight, 'Cerrar · Esc');
  closeBtn.type = 'button';
  const bar = html('div', 'mn-bar', frame);
  const barLabel = html('span', '', bar); const barRoom = html('b', '', barLabel);
  const barKey = html('span', 'mn-key', bar, opt.keyboard ? 'M · plano' : 'plano');
  const wrap = html('div', 'mn-svgwrap', frame);
  const sv = svg('svg', { class: 'mn-svg', role: 'img' }, wrap);
  const defs = svg('defs', {}, sv);
  const grad = svg('radialGradient', { id: 'mn-cone-grad', cx: '0', cy: '0', r: '1', gradientUnits: 'userSpaceOnUse' }, defs);
  svg('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '.55' }, grad);
  svg('stop', { offset: '1', 'stop-color': '#ffffff', 'stop-opacity': '0' }, grad);
  const gShip = svg('g', {}, sv), gGrid = svg('g', {}, sv), gRooms = svg('g', {}, sv), gDoors = svg('g', {}, sv);
  const gTrail = svg('g', { class: 'mn-trail' }, sv), gFx = svg('g', {}, sv);
  const gPlayer = svg('g', { class: 'mn-player' }, sv);
  const gPlayerInner = svg('g', {}, gPlayer);
  const cone = svg('path', { class: 'mn-cone' }, gPlayerInner);
  const halo = svg('circle', { class: 'mn-halo' }, gPlayerInner);
  const dot = svg('path', { class: 'mn-dot' }, gPlayerInner);

  let roomEls = new Map(), player = null, current = null, expanded = false, overlay = null, trail = [], lastFocus = null, disposed = false;

  function build() {
    const { bounds: b, unit: u, rooms, doors } = L;
    sv.style.setProperty('--mn-sw', r2(u * 0.18));
    const depth = b.z1 - b.z0, m = u * 3, nose = opt.noseLength ?? depth * 0.42, eng = u * 6;
    const vx0 = b.x0 - m - eng - u * 2, vx1 = b.x1 + m + nose + u * 2, vz0 = b.z0 - m - u * 2, vz1 = b.z1 + m + u * 2;
    sv.setAttribute('viewBox', [vx0, vz0, vx1 - vx0, vz1 - vz0].map(r2).join(' '));
    sv.setAttribute('aria-label', `${L.deck}: ${L.name}. ${rooms.filter(r => r.kind !== 'corridor').map(r => r.name).join(', ')}.`);
    eyebrow.textContent = L.deck; title.textContent = opt.title || L.name;
    for (const g of [gShip, gGrid, gRooms, gDoors]) g.replaceChildren();

    // casco
    if (L.hull) {
      const hx0 = b.x0 - m, hx1 = b.x1 + m, hz0 = b.z0 - m, hz1 = b.z1 + m, cz = (hz0 + hz1) / 2, rr = u * 7;
      const d = typeof L.hull === 'string' && L.hull !== 'auto' ? L.hull :
        `M${hx0 + rr} ${hz0} L${hx1} ${hz0} Q${hx1 + nose * 0.55} ${hz0} ${hx1 + nose} ${cz} Q${hx1 + nose * 0.55} ${hz1} ${hx1} ${hz1} L${hx0 + rr} ${hz1} Q${hx0} ${hz1} ${hx0} ${hz1 - rr} L${hx0} ${hz0 + rr} Q${hx0} ${hz0} ${hx0 + rr} ${hz0}Z`;
      for (const s of [-1, 1]) {
        const ez = cz + s * depth * 0.27, eh = depth * 0.2;
        svg('rect', { class: 'mn-flame', x: r2(hx0 - eng - u * 1.6), y: r2(ez - eh * 0.32), width: r2(u * 2.2), height: r2(eh * 0.64), rx: r2(u) }, gShip);
        svg('rect', { class: 'mn-engine', x: r2(hx0 - eng), y: r2(ez - eh / 2), width: r2(eng + u), height: r2(eh), rx: r2(u * 1.6) }, gShip);
      }
      svg('path', { class: 'mn-hullshape', d }, gShip);
      if (!(typeof L.hull === 'string' && L.hull !== 'auto')) {
        const i = u * 1.4;
        svg('path', { class: 'mn-hullin', d: `M${hx0 + rr} ${hz0 + i} L${hx1} ${hz0 + i} Q${hx1 + nose * 0.5} ${hz0 + i} ${hx1 + nose - i * 2} ${cz} Q${hx1 + nose * 0.5} ${hz1 - i} ${hx1} ${hz1 - i} L${hx0 + rr} ${hz1 - i}` }, gShip);
      }
    }
    // rejilla tenue
    const step = u * 5;
    for (let x = Math.ceil(vx0 / step) * step; x < vx1; x += step) svg('line', { class: 'mn-gridline', x1: r2(x), x2: r2(x), y1: vz0, y2: vz1 }, gGrid);
    for (let z = Math.ceil(vz0 / step) * step; z < vz1; z += step) svg('line', { class: 'mn-gridline', y1: r2(z), y2: r2(z), x1: vx0, x2: vx1 }, gGrid);

    // estancias (pasillos primero, debajo)
    roomEls = new Map();
    const sorted = [...rooms].sort((a, c) => (a.kind === 'corridor' ? 0 : 1) - (c.kind === 'corridor' ? 0 : 1));
    for (const r of sorted) {
      const corridor = r.kind === 'corridor', canTp = !corridor || opt.teleportCorridors;
      const g = svg('g', { class: 'mn-room' + (corridor ? ' mn-room--corridor' : ''), style: `--c:${r.color}`, 'data-room': r.id }, gRooms);
      const pad = u * 0.5;
      svg('rect', { x: r2(r.x + pad), y: r2(r.z + pad), width: r2(r.w - pad * 2), height: r2(r.d - pad * 2), rx: r2(u * 1.3) }, g);
      const fs = Math.min(u * 3.1, r.w * 0.13, r.d * 0.22), fsSub = fs * 0.62;
      if (corridor) {
        const t = svg('text', { class: 'mn-name', x: r2(r.cx), y: r2(r.cz), 'font-size': r2(Math.min(L.unit * 1.9, r.d * 0.36)), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
        t.textContent = r.name;
      } else {
        const ty = r.cz - (fs + fsSub) * 0.25;
        const tl = svg('text', { class: 'mn-name mn-name-long', x: r2(r.x + u * 2.2), y: r2(ty), 'font-size': r2(fs) }, g); tl.textContent = r.name;
        const ts = svg('text', { class: 'mn-name mn-name-short', x: r2(r.cx), y: r2(r.cz), 'font-size': r2(Math.min(u * 4.4, r.w * 0.2)), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g); ts.textContent = r.short;
        if (r.sub) { const s = svg('text', { class: 'mn-sub', x: r2(r.x + u * 2.2), y: r2(ty + fs * 1.25), 'font-size': r2(fsSub) }, g); s.textContent = r.sub; }
        const h = svg('text', { class: 'mn-here', x: r2(r.x + u * 2.2), y: r2(ty + fs * 1.25), 'font-size': r2(fsSub) }, g); h.textContent = 'Estás aquí';
      }
      if (canTp) {
        g.setAttribute('role', 'button'); g.setAttribute('tabindex', '-1');
        g.setAttribute('aria-label', `Teletransportarse a ${r.name}`);
        g.addEventListener('click', e => { if (expanded) { e.stopPropagation(); teleport(r.id); } });
        g.addEventListener('keydown', e => { if (expanded && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); teleport(r.id); } });
      }
      roomEls.set(r.id, g);
    }
    for (const d of doors) {
      const t = u * 0.9, alongZ = d.d > d.w;
      svg('rect', alongZ ? { class: 'mn-door', x: r2(d.cx - t / 2), y: r2(d.z + u * 0.4), width: r2(t), height: r2(d.d - u * 0.8), rx: r2(t / 2) }
        : { class: 'mn-door', x: r2(d.x + u * 0.4), y: r2(d.cz - t / 2), width: r2(d.w - u * 0.8), height: r2(t), rx: r2(t / 2) }, gDoors);
    }
    sizePlayer();
    if (current) roomEls.get(current.id)?.classList.add('mn-room--here');
    requestAnimationFrame(fit);
  }

  // encoge los nombres que no caben en su estancia
  function fit() {
    if (disposed) return;
    for (const [id, g] of roomEls) {
      const r = L.rooms.find(q => q.id === id);
      for (const t of g.querySelectorAll('text')) {
        if (!t.dataset.fs) t.dataset.fs = t.getAttribute('font-size');
        t.setAttribute('font-size', t.dataset.fs);
        let len = 0; try { len = t.getComputedTextLength(); } catch { }
        const max = r.w - L.unit * (t.getAttribute('text-anchor') === 'middle' ? 2.4 : 4.4);
        if (len > max && max > 0) t.setAttribute('font-size', r2(t.dataset.fs * max / len));
      }
    }
  }

  function sizePlayer() {
    const u = L.unit * (expanded ? 1 : 1.7), R = u * 1.25, C = u * 9;
    dot.setAttribute('d', `M0 ${-R * 1.6} L${R * 1.15} ${R} L0 ${R * 0.45} L${-R * 1.15} ${R}Z`);
    halo.setAttribute('r', r2(R * 1.1));
    const a = Math.PI / 5.5;
    cone.setAttribute('d', `M0 0 L${r2(-Math.sin(a) * C)} ${r2(-Math.cos(a) * C)} A${C} ${C} 0 0 1 ${r2(Math.sin(a) * C)} ${r2(-Math.cos(a) * C)}Z`);
    grad.setAttribute('r', r2(C));
    for (const c of gTrail.children) c.setAttribute('r', r2(L.unit * (expanded ? 0.45 : 0.7)));
  }

  function roomAt(x, z) {
    let hit = null;
    for (const r of L.rooms) if (inRect(r, x, z) && (!hit || hit.kind === 'corridor')) hit = r;
    return hit;
  }

  function setPlayer(x, z, yaw = player?.yaw ?? 0) {
    if (disposed || !Number.isFinite(x) || !Number.isFinite(z)) return;
    const jump = player && Math.hypot(x - player.x, z - player.z) > L.unit * 12;
    player = { x, z, yaw };
    gPlayer.setAttribute('transform', `translate(${r2(x)} ${r2(z)}) rotate(${r2(-yaw * 180 / Math.PI)})`);
    if (opt.trail) {
      if (jump) trail = [];
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(x - last.x, z - last.z) > L.unit * 1.6) {
        trail.push({ x, z }); if (trail.length > 26) trail.shift();
        gTrail.replaceChildren(...trail.slice(0, -1).map((p, i, a) => svg('circle', { cx: r2(p.x), cy: r2(p.z), r: r2(L.unit * (expanded ? 0.45 : 0.7)), 'fill-opacity': r2(0.05 + 0.4 * (i / a.length)) })));
      }
    }
    const r = roomAt(x, z);
    if (r !== current && (r || !current || !inRect(current, x, z, L.unit))) {
      const prev = current;
      if (prev) roomEls.get(prev.id)?.classList.remove('mn-room--here');
      current = r;
      if (r) roomEls.get(r.id)?.classList.add('mn-room--here');
      barRoom.textContent = r ? r.name : 'En tránsito';
      emit('room', { room: r, prev });
    }
  }

  function pulse(x, z) {
    const c = svg('circle', { class: 'mn-pulse', cx: r2(x), cy: r2(z), r: r2(L.unit * 2.2) }, gFx);
    setTimeout(() => c.remove(), 950);
  }

  function teleport(id) {
    const r = L.rooms.find(q => q.id === id);
    if (!r) return false;
    const ev = { roomId: r.id, room: r, x: r.spawn.x, z: r.spawn.z, yaw: r.spawn.yaw };
    pulse(ev.x, ev.z);
    if (opt.autoMove) setPlayer(ev.x, ev.z, ev.yaw);
    emit('teleport', ev);
    if (opt.closeOnTeleport && expanded) setTimeout(() => collapse(), 260);
    return true;
  }

  function setRoomFocusable(v) { for (const g of roomEls.values()) if (g.hasAttribute('role')) g.setAttribute('tabindex', v ? '0' : '-1'); }

  function expand() {
    if (expanded || disposed) return;
    expanded = true; lastFocus = document.activeElement;
    if (opt.releasePointer && document.pointerLockElement) try { document.exitPointerLock(); } catch { }
    overlay = html('div', 'mn-overlay');
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', `${L.deck}: ${L.name}`);
    overlay.addEventListener('click', e => { if (e.target === overlay) collapse(); });
    root.classList.replace('mn--compact', 'mn--expanded');
    frame.removeAttribute('tabindex'); frame.removeAttribute('role');
    overlay.appendChild(root); document.body.appendChild(overlay);
    setRoomFocusable(true); sizePlayer(); fit(); requestAnimationFrame(fit);
    (current && roomEls.get(current.id)?.hasAttribute('role') ? roomEls.get(current.id) : closeBtn).focus({ preventScroll: true });
    emit('toggle', true);
  }
  function collapse() {
    if (!expanded) return;
    expanded = false;
    root.classList.replace('mn--expanded', 'mn--compact');
    setRoomFocusable(false); setCompactA11y();
    container.appendChild(root); overlay?.remove(); overlay = null;
    sizePlayer(); requestAnimationFrame(fit);
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    emit('toggle', false);
  }
  const toggle = () => (expanded ? collapse() : expand());

  function setCompactA11y() { frame.setAttribute('tabindex', '0'); frame.setAttribute('role', 'button'); frame.setAttribute('aria-label', 'Abrir el plano de la nave'); }

  const onFrameClick = () => { if (!expanded) expand(); };
  const onFrameKey = e => { if (!expanded && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); expand(); } };
  const onKey = e => {
    if (e.key === 'Escape' && expanded) { e.preventDefault(); collapse(); return; }
    if (!opt.keyboard || e.code !== opt.toggleKey || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault(); toggle();
  };
  frame.addEventListener('click', onFrameClick);
  frame.addEventListener('keydown', onFrameKey);
  closeBtn.addEventListener('click', e => { e.stopPropagation(); collapse(); });
  window.addEventListener('keydown', onKey);

  setCompactA11y();
    barRoom.textContent = '—';
  container.appendChild(root);
  build();
  if (opt.mode === 'expanded') expand();

  return {
    setPlayer,
    onTeleport: on('teleport'),
    onRoomChange: on('room'),
    onToggle: on('toggle'),
    teleportTo: teleport,
    expand, collapse, toggle,
    isExpanded: () => expanded,
    roomAt,
    getRoom: id => L.rooms.find(r => r.id === id) || null,
    getLayout: () => L,
    setLayout(next) { L = normalize(next); current = null; trail = []; gTrail.replaceChildren(); build(); if (player) setPlayer(player.x, player.z, player.yaw); },
    dispose() {
      if (disposed) return; disposed = true;
      window.removeEventListener('keydown', onKey);
      overlay?.remove(); root.remove();
      for (const k in cbs) cbs[k].clear();
      if (!--styleRefs) document.getElementById(STYLE_ID)?.remove();
    },
  };
}

export default { init, fromGrid, yawFromDir };
