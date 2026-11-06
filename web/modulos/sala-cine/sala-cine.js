// sala-cine.js · Sala de proyección de La Malkevnia
// Módulo ES autocontenido para Three.js (probado con three@0.160.0). Solo depende de 'three' y 'three/addons/' (RoundedBoxGeometry).
//
//   import { init } from './sala-cine.js';
//   const sala = init({ scene, origin: new THREE.Vector3(x, 0, z), films });
//   // en el bucle:  sala.update(dt);
//   // al salir:     sala.dispose();
//
// La sala mira hacia -Z en su espacio local: pantalla al fondo (z = -depth/2), entrada y proyector detrás (z = +depth/2).
// Ver README.md para la API completa.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const TAU = Math.PI * 2;
const FONT_D = 'Orbitron, "Exo 2", system-ui, sans-serif';
const FONT_B = '"Exo 2", system-ui, sans-serif';
const FONT_M = '"JetBrains Mono", ui-monospace, monospace';
const FORMAT = { '4k': '4K UHD', bluray: 'BLU-RAY', dvd: 'DVD' };
const C_SCREEN = new THREE.Color(0x9b7bff), C_BEAM = new THREE.Color(0xe9e2ff);
const TRAILER_LEN = 24;      // segundos del tráiler generado
const LEADER_LEN = 3.2;      // cuenta atrás 3-2-1 al encender el proyector

/* ---------------- utilidades ---------------- */
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const fadeIO = (T, a, b, f = 0.6) => (T < a || T > b) ? 0 : Math.min(smooth(a, a + f, T), 1 - smooth(b - f, b, T));
const mix = (c1, c2, t) => '#' + new THREE.Color(c1).lerp(new THREE.Color(c2), t).getHexString();
const shade = (c, t) => t < 0 ? mix(c, '#05030c', -t) : mix(c, '#f4eeff', t);
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const ctex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

// Color de respaldo cuando la película no trae uno: tono sacado del título, apagado y oscuro.
const autoColor = (title) => { const h = hash(String(title || '')); return '#' + new THREE.Color().setHSL((h % 360) / 360, 0.42 + ((h >>> 9) % 22) / 100, 0.26 + ((h >>> 17) % 12) / 100, THREE.SRGBColorSpace).getHexString(); };
// Color de una imagen (media de una miniatura), con algo más de saturación y luz contenida.
function colorFromImage(img) {
  try {
    const c = canvas(6, 9), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 6, 9);
    const d = g.getImageData(0, 0, 6, 9).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    const col = new THREE.Color().setRGB(r / 54 / 255, gg / 54 / 255, b / 54 / 255, THREE.SRGBColorSpace); const hsl = {}; col.getHSL(hsl, THREE.SRGBColorSpace);
    return '#' + new THREE.Color().setHSL(hsl.h, clamp(hsl.s * 1.35, 0.3, 0.75), clamp(hsl.l, 0.24, 0.48), THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace);
  } catch { return null; }
}
// Una imagen puede venir como URL (con CORS), como imagen o bitmap ya cargados, o como función que devuelve
// una Promise de cualquiera de las dos cosas (para cargar solo lo que se ve).
function loadImage(src) {
  if (!src) return Promise.reject(new Error('sin imagen'));
  if (typeof src === 'function') return Promise.resolve().then(src).then(loadImage);
  if (typeof src === 'string') return new Promise((ok, ko) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async'; img.onload = () => ok(img); img.onerror = () => ko(new Error('no carga ' + src)); img.src = src; });
  return Promise.resolve(src);
}
// Los ImageBitmap que entregan las funciones de carga son de la sala: se liberan al dejar de usarlos.
const release = (img, own) => { if (own && typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) img.close(); };
const imgW = (img) => img.naturalWidth || img.videoWidth || img.width, imgH = (img) => img.naturalHeight || img.videoHeight || img.height;
function cover(g, img, W, H, zoom = 1, fx = 0.5, fy = 0.5) {
  const iw = imgW(img), ih = imgH(img), s = Math.max(W / iw, H / ih) * zoom, w = iw * s, h = ih * s;
  g.drawImage(img, (W - w) * fx, (H - h) * fy, w, h);
}
// Texto corto para la pantalla: la frase de cartel o, si no hay, el comienzo de la sinopsis.
function blurb(f, max = 150) {
  let t = (f.tagline || f.synopsis || '').replace(/\s+/g, ' ').trim(); if (!t) return '';
  if (!f.tagline) { const m = t.match(/^(.+?[.!?…])(\s|$)/); if (m) t = m[1]; }
  return t.length > max ? t.slice(0, max).replace(/[\s,;:]+\S*$/, '') + '…' : t;
}
const runtimeText = (min) => min ? (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`) : '';

function fitFont(g, text, weight, family, maxSize, maxW, minSize = 12) {
  let s = maxSize; g.font = `${weight} ${s}px ${family}`;
  while (s > minSize && g.measureText(text).width > maxW) { s -= 2; g.font = `${weight} ${s}px ${family}`; }
  return s;
}
function wrap(g, text, maxW) {
  const words = String(text).split(/\s+/); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
// Título en 1-3 líneas con el mayor tamaño que quepa.
function titleBlock(g, text, family, maxSize, maxW, maxLines = 3, weight = 700) {
  for (let s = maxSize; s >= 14; s -= 2) {
    g.font = `${weight} ${s}px ${family}`;
    const lines = wrap(g, text, maxW);
    if (lines.length <= maxLines && lines.every(l => g.measureText(l).width <= maxW)) return { size: s, lines };
  }
  g.font = `${weight} 14px ${family}`; return { size: 14, lines: wrap(g, text, maxW).slice(0, maxLines) };
}
// Igual que titleBlock pero contando el espaciado entre letras (para el título del tráiler).
function fitSpaced(g, text, family, maxSize, maxW, spacing, maxLines = 2) {
  const fits = (l) => g.measureText(l).width + spacing * ([...l].length - 1) <= maxW;
  for (let s = maxSize; s >= 14; s -= 2) {
    g.font = `700 ${s}px ${family}`;
    const words = text.split(/\s+/), lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (!fits(t) && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every(fits)) return { size: s, lines };
  }
  return { size: 14, lines: [text] };
}
function spaced(g, text, x, y, spacing, align = 'center') {
  const chars = [...text]; const ws = chars.map(c => g.measureText(c).width);
  const total = ws.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : x; const prev = g.textAlign; g.textAlign = 'left';
  chars.forEach((c, i) => { g.fillText(c, cx, y); cx += ws[i] + spacing; }); g.textAlign = prev; return total;
}
function stars(g, x, y, rating, size, color, dim) {
  const n = clamp((rating || 0) / 2, 0, 5);
  const shape = (cx) => { g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? size * 0.22 : size * 0.5, a = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(cx + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill(); };
  for (let i = 0; i < 5; i++) {
    const cx = x + i * size * 1.25, fill = clamp(n - i);
    g.fillStyle = dim; shape(cx);
    if (fill > 0) { g.save(); g.beginPath(); g.rect(cx - size / 2, y - size, size * fill, size * 2); g.clip(); g.fillStyle = color; shape(cx); g.restore(); }
  }
}

/* ---------------- arte generado: pósters ---------------- */
function paletteOf(film) {
  const base = film.color || '#5b3fa0';
  const c = new THREE.Color(base); const hsl = {}; c.getHSL(hsl);
  const accent = '#' + new THREE.Color().setHSL((hsl.h + 0.08) % 1, Math.max(0.55, hsl.s), 0.68).getHexString();
  const glow = '#' + new THREE.Color().setHSL(hsl.h, Math.max(0.5, hsl.s), 0.8).getHexString();
  return { base, dark: shade(base, -0.82), deep: shade(base, -0.55), mid: shade(base, -0.15), light: shade(base, 0.45), accent, glow, lum: hsl.l };
}

function drawPoster(c, film, img) {
  const g = c.getContext('2d'); const W = c.width, H = c.height; const p = paletteOf(film); const r = rng(hash(film.title + film.year));
  if (img) {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H); cover(g, img, W, H);
    g.strokeStyle = '#ffffff22'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
    return;
  }
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, p.dark); bg.addColorStop(0.55, p.deep); bg.addColorStop(1, p.dark);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.6})`; const s = r() < 0.9 ? 1 : 2; g.fillRect(r() * W, r() * H * 0.7, s, s); }
  const style = hash(film.title) % 7;   // reparto uniforme de los 7 estilos
  const hy = H * (0.5 + r() * 0.12);
  if (style === 0) { // planeta o sol sobre el horizonte
    const R = W * (0.22 + r() * 0.18), px = W * (0.3 + r() * 0.4), py = hy - R * (0.2 + r() * 0.5);
    const glow = g.createRadialGradient(px, py, R * 0.6, px, py, R * 2.2); glow.addColorStop(0, p.glow + '88'); glow.addColorStop(1, p.glow + '00');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    const pg = g.createLinearGradient(px - R, py - R, px + R, py + R); pg.addColorStop(0, p.light); pg.addColorStop(1, p.mid);
    g.fillStyle = pg; g.beginPath(); g.arc(px, py, R, 0, TAU); g.fill();
    if (r() < 0.6) { g.strokeStyle = p.glow + 'aa'; g.lineWidth = 3; g.beginPath(); g.ellipse(px, py, R * 1.7, R * 0.35, -0.25, 0, TAU); g.stroke(); }
  } else if (style === 1) { // túnel de arcos
    const cx = W / 2, cy = hy - H * 0.12;
    for (let i = 14; i > 0; i--) { g.strokeStyle = i % 2 ? p.accent + '99' : p.glow + '44'; g.lineWidth = 2 + i * 0.4; g.beginPath(); g.arc(cx, cy, i * W * 0.045, Math.PI, TAU); g.stroke(); }
    const hl = g.createRadialGradient(cx, cy, 0, cx, cy, W * 0.25); hl.addColorStop(0, '#ffffffcc'); hl.addColorStop(1, '#ffffff00'); g.fillStyle = hl; g.fillRect(0, 0, W, H);
  } else if (style === 2) { // monolito con luz
    const mw = W * (0.12 + r() * 0.08), mh = H * (0.32 + r() * 0.1), mx = W / 2 - mw / 2, my = hy - mh;
    const hl = g.createRadialGradient(W / 2, my, 0, W / 2, my, H * 0.5); hl.addColorStop(0, p.glow + 'cc'); hl.addColorStop(1, p.glow + '00'); g.fillStyle = hl; g.fillRect(0, 0, W, H);
    g.fillStyle = '#05030c'; g.fillRect(mx, my, mw, mh);
    g.strokeStyle = p.glow; g.lineWidth = 2; g.strokeRect(mx, my, mw, mh);
  } else if (style === 4) { // eclipse con corona
    const R = W * 0.26, px = W / 2, py = hy - H * 0.2;
    for (let k = 6; k > 0; k--) { g.fillStyle = p.glow + ['08', '10', '18', '22', '33', '55'][6 - k]; g.beginPath(); g.arc(px, py, R + k * 14, 0, TAU); g.fill(); }
    g.fillStyle = '#05030c'; g.beginPath(); g.arc(px, py, R, 0, TAU); g.fill();
    g.strokeStyle = '#fff8'; g.lineWidth = 2; g.beginPath(); g.arc(px, py, R + 1, Math.PI * 1.1, Math.PI * 1.55); g.stroke();
  } else if (style === 5) { // sol poniente en rejilla
    const px = W / 2, py = hy - 10, R = W * 0.24;
    g.save(); g.beginPath(); g.arc(px, py, R, Math.PI, TAU); g.clip();
    const sgd = g.createLinearGradient(0, py - R, 0, py); sgd.addColorStop(0, p.glow); sgd.addColorStop(1, p.accent); g.fillStyle = sgd; g.fillRect(px - R, py - R, R * 2, R);
    g.fillStyle = p.dark; for (let k = 0; k < 6; k++) g.fillRect(px - R, py - R * 0.5 + k * k * 3.2, R * 2, 2 + k * 1.6);
    g.restore();
    g.strokeStyle = p.accent + '88'; g.lineWidth = 1.5;
    for (let k = -10; k <= 10; k++) { g.beginPath(); g.moveTo(px + k * 14, hy); g.lineTo(px + k * 90, H); g.stroke(); }
    for (let k = 1; k < 9; k++) { const y = hy + Math.pow(k / 9, 2) * (H - hy); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  } else if (style === 6) { // figura sola bajo una luna enorme
    const R = W * 0.36, px = W * (0.4 + r() * 0.2), py = hy - R * 0.55;
    const mg = g.createRadialGradient(px - R * 0.3, py - R * 0.3, R * 0.1, px, py, R); mg.addColorStop(0, p.light); mg.addColorStop(1, p.mid);
    g.fillStyle = mg; g.beginPath(); g.arc(px, py, R, 0, TAU); g.fill();
    g.fillStyle = shade(p.base, -0.1) + '55'; for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(px + (r() - 0.5) * R, py + (r() - 0.5) * R, 6 + r() * 22, 0, TAU); g.fill(); }
    const fx = W * 0.5, fy = hy + 4; g.fillStyle = '#05030c';
    g.beginPath(); g.arc(fx, fy - 46, 7, 0, TAU); g.fill(); g.fillRect(fx - 7, fy - 39, 14, 26); g.fillRect(fx - 6, fy - 14, 5, 16); g.fillRect(fx + 1, fy - 14, 5, 16);
  } else { // franjas diagonales
    g.save(); g.translate(W / 2, hy - H * 0.15); g.rotate(-0.5 + r() * 0.3);
    for (let i = -6; i <= 6; i++) { g.fillStyle = i % 2 ? p.accent + '66' : p.light + '33'; g.fillRect(-W, i * 34, W * 2, 16 + r() * 10); }
    g.restore();
    g.fillStyle = p.glow; g.beginPath(); g.arc(W * (0.25 + r() * 0.5), hy - H * 0.28, W * 0.08, 0, TAU); g.fill();
  }
  // horizonte de montañas en capas
  for (let layer = 0; layer < 3; layer++) {
    g.fillStyle = [shade(p.base, -0.35), shade(p.base, -0.6), '#06040d'][layer];
    g.beginPath(); g.moveTo(0, H); let y = hy + layer * H * 0.05;
    for (let x = 0; x <= W; x += W / 24) { y += (r() - 0.5) * 30; y = clamp(y, hy - 80 + layer * 30, hy + 60 + layer * 30); g.lineTo(x, y); }
    g.lineTo(W, H); g.closePath(); g.fill();
  }
  // tipografía
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillStyle = '#d9ccffcc'; g.font = `600 ${Math.round(W * 0.03)}px ${FONT_M}`;
  spaced(g, ('UN FILM DE ' + (film.director || '')).toUpperCase(), W / 2, H * 0.07, 3);
  const tb = titleBlock(g, film.title.toUpperCase(), FONT_D, Math.round(W * 0.12), W * 0.86, 3);
  g.fillStyle = '#ffffff'; g.shadowColor = p.glow; g.shadowBlur = 18;
  const lh = tb.size * 1.05; let ty = H * 0.86 - (tb.lines.length - 1) * lh;
  for (const l of tb.lines) { g.font = `700 ${tb.size}px ${FONT_D}`; g.fillText(l, W / 2, ty); ty += lh; }
  g.shadowBlur = 0;
  g.fillStyle = '#b9aee0'; g.font = `600 ${Math.round(W * 0.028)}px ${FONT_M}`;
  spaced(g, `${film.year || ''}  ·  ${FORMAT[film.format] || ''}  ·  ★ ${film.rating ?? '–'}`, W / 2, H * 0.955, 2);
  // grano y marco
  const img2 = g.getImageData(0, 0, W, H); const d = img2.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img2, 0, 0);
  g.strokeStyle = '#ffffff22'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
}

/* ---------------- el módulo ---------------- */
export function init(opts = {}) {
  const o = {
    width: 9, depth: 7.5, height: 3, shell: true, rotationY: 0, rows: 3, seatsPerSide: 4,
    autoAdvance: true, sound: false, roomLights: opts.shell ?? true, maxPosters: 32, followPosters: true,
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    ...opts,
  };
  o.origin = new THREE.Vector3().copy(opts.origin || { x: 0, y: 0, z: 0 });
  const films = (o.films && o.films.length ? o.films : [{ title: 'Sin películas', director: '—', year: '', rating: 0 }])
    .map(f => ({ ...f, title: String(f.title ?? ''), director: f.director || f.creator || '', color: f.color || autoColor(f.title), colorAuto: !f.color }));
  const W = o.width, D = o.depth, H = o.height;
  const group = new THREE.Group(); group.name = 'sala-cine';
  group.position.copy(o.origin); group.rotation.y = o.rotationY;
  if (o.scene) o.scene.add(group);
  const disposables = [];
  const track = (x) => { disposables.push(x); return x; };
  const pickables = [];
  const state = { mode: 'sala', index: 0, level: 1, posterPage: 0, time: 0, selTime: 0 };

  /* ---- materiales ---- */
  const M = {
    velvet: track(new THREE.MeshPhysicalMaterial({ color: 0x3d2266, roughness: 0.85, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xb59bff) })),
    curtain: track(new THREE.MeshPhysicalMaterial({ color: 0x2a1450, roughness: 0.9, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x9b7bff), side: THREE.DoubleSide })),
    dark: track(new THREE.MeshStandardMaterial({ color: 0x0d0918, roughness: 0.8, metalness: 0.3 })),
    metal: track(new THREE.MeshStandardMaterial({ color: 0x2a2440, roughness: 0.35, metalness: 0.8 })),
    black: track(new THREE.MeshStandardMaterial({ color: 0x030207, roughness: 1 })),
    led: track(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xb59bff, emissiveIntensity: 2 })),
    ledCyan: track(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x7fd6ff, emissiveIntensity: 2 })),
    sconce: track(new THREE.MeshStandardMaterial({ color: 0x1a1230, emissive: 0xd9b8ff, emissiveIntensity: 3 })),
  };
  const geo = (g) => track(g);
  const add = (mesh, parent = group) => { parent.add(mesh); return mesh; };
  const boxAt = (w, h, d, x, y, z, mat, parent) => { const m = new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, d)), mat); m.position.set(x, y + h / 2, z); return add(m, parent); };

  /* ---- carcasa (suelo, paredes, techo) ---- */
  if (o.shell) {
    const carpet = canvas(256, 256); { const g = carpet.getContext('2d'); g.fillStyle = '#140c26'; g.fillRect(0, 0, 256, 256); const r = rng(7); for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${120 + r() * 60},${90 + r() * 50},${200 + r() * 50},${r() * 0.12})`; g.fillRect(r() * 256, r() * 256, 2, 2); } g.strokeStyle = 'rgba(181,155,255,.10)'; g.lineWidth = 2; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(128, 128, 30 + k * 26, 0, TAU); g.stroke(); } }
    const ct = track(ctex(carpet)); ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(W / 1.6, D / 1.6);
    const floor = add(new THREE.Mesh(geo(new THREE.PlaneGeometry(W, D)), track(new THREE.MeshStandardMaterial({ map: ct, roughness: 0.95 }))));
    floor.rotation.x = -Math.PI / 2;
    const panel = canvas(256, 512); { const g = panel.getContext('2d'); const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, '#1b1233'); gr.addColorStop(0.5, '#24183f'); gr.addColorStop(1, '#1b1233'); g.fillStyle = gr; g.fillRect(0, 0, 256, 512); g.fillStyle = '#0c0818'; g.fillRect(0, 0, 6, 512); g.fillRect(250, 0, 6, 512); const r = rng(3); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.15})`; g.fillRect(r() * 256, r() * 512, 1, 3); } }
    const pt = track(ctex(panel)); pt.wrapS = THREE.RepeatWrapping;
    const wallMat = (len) => { const t = pt.clone(); track(t); t.repeat.set(len / 0.9, 1); t.needsUpdate = true; return track(new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 })); };
    const wall = (len, x, z, ry, mat) => { const m = add(new THREE.Mesh(geo(new THREE.PlaneGeometry(len, H)), mat)); m.position.set(x, H / 2, z); m.rotation.y = ry; return m; };
    wall(D, -W / 2, 0, Math.PI / 2, wallMat(D)); wall(D, W / 2, 0, -Math.PI / 2, wallMat(D));
    wall(W, 0, D / 2, Math.PI, wallMat(W)); wall(W, 0, -D / 2, 0, M.black);
    const ceil = add(new THREE.Mesh(geo(new THREE.PlaneGeometry(W, D)), track(new THREE.MeshStandardMaterial({ color: 0x07050f, roughness: 1 }))));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H;
    // zócalo luminoso
    for (const s of [-1, 1]) boxAt(0.02, 0.025, D, s * (W / 2 - 0.012), 0.08, 0, M.led);
  }

  /* ---- pantalla ---- */
  const SW = Math.min(W * 0.7, (H - 0.65) * 2.35, 6.6), SH = SW / 2.35, SY = 0.3 + SH / 2, SZ = -D / 2 + 0.1;
  const scrC = canvas(1280, 544); const sg = scrC.getContext('2d');
  const scrT = track(ctex(scrC));
  const scrMat = track(new THREE.MeshBasicMaterial({ map: scrT, toneMapped: false }));
  const screen = add(new THREE.Mesh(geo(new THREE.PlaneGeometry(SW, SH)), scrMat));
  screen.position.set(0, SY, SZ); screen.userData.salaCine = { type: 'screen' }; pickables.push(screen);
  // marco negro y escenario
  boxAt(SW + 0.3, 0.12, 0.06, 0, SY + SH / 2, SZ - 0.02, M.black);
  boxAt(SW + 0.3, 0.12, 0.06, 0, SY - SH / 2 - 0.12, SZ - 0.02, M.black);
  const stageD = 0.75; boxAt(SW + 0.6, 0.22, stageD, 0, 0, SZ + stageD / 2, M.dark);
  boxAt(SW + 0.6, 0.02, 0.02, 0, 0.2, SZ + stageD, M.led);
  // telones laterales con pliegues
  const curtains = [];
  for (const s of [-1, 1]) {
    const cw = Math.max(0.6, (W - SW) / 2 - 0.15), g2 = geo(new THREE.PlaneGeometry(cw, H - 0.05, 36, 6));
    const base = g2.attributes.position.array.slice();
    const m = add(new THREE.Mesh(g2, M.curtain)); m.position.set(s * (SW / 2 + cw / 2 - 0.05), (H - 0.05) / 2, SZ + 0.18);
    curtains.push({ m, base, s });
  }
  // bambalina superior
  { const g2 = geo(new THREE.PlaneGeometry(W, 0.32, 60, 1)); const a = g2.attributes.position; for (let i = 0; i < a.count; i++) a.setZ(i, Math.sin(a.getX(i) * 9) * 0.05); g2.computeVertexNormals(); const m = add(new THREE.Mesh(g2, M.curtain)); m.position.set(0, H - 0.16, SZ + 0.25); }

  /* ---- butacas en gradas ---- */
  const rowGap = 1.1, aisle = 1.3, pitch = 0.68;
  const zFront = Math.max(SZ + stageD + 1.7, -D / 2 + 2.6);
  const rows = Math.max(1, Math.min(o.rows, Math.floor((D / 2 - 0.9 - zFront) / rowGap) + 1));
  const perSide = Math.max(1, Math.min(o.seatsPerSide, Math.floor((W / 2 - aisle / 2 - 0.35) / pitch)));
  const seatList = [];
  for (let r = 0; r < rows; r++) for (const s of [-1, 1]) for (let i = 0; i < perSide; i++)
    seatList.push({ x: s * (aisle / 2 + pitch / 2 + i * pitch), z: zFront + r * rowGap, y: r * 0.2, row: r, side: s, i });
  const n = seatList.length, dummy = new THREE.Object3D();
  const inst = (g, mat, count = n) => { const m = track(new THREE.InstancedMesh(geo(g), mat, count)); add(m); return m; };
  const cushion = inst(new RoundedBoxGeometry(0.56, 0.14, 0.5, 3, 0.05), M.velvet);
  const back = inst(new RoundedBoxGeometry(0.56, 0.7, 0.14, 3, 0.06), M.velvet);
  const pedestal = inst(new THREE.BoxGeometry(0.34, 0.36, 0.34), M.metal);
  const arms = inst(new RoundedBoxGeometry(0.08, 0.07, 0.52, 2, 0.03), M.metal, n + rows * 2);
  const armLeds = inst(new THREE.BoxGeometry(0.03, 0.012, 0.2), M.ledCyan, n + rows * 2);
  let ai = 0;
  seatList.forEach((s, k) => {
    dummy.rotation.set(0, 0, 0); dummy.position.set(s.x, s.y + 0.18, s.z); dummy.updateMatrix(); pedestal.setMatrixAt(k, dummy.matrix);
    dummy.position.set(s.x, s.y + 0.43, s.z - 0.02); dummy.updateMatrix(); cushion.setMatrixAt(k, dummy.matrix);
    dummy.position.set(s.x, s.y + 0.8, s.z + 0.26); dummy.rotation.x = 0.16; dummy.updateMatrix(); back.setMatrixAt(k, dummy.matrix); dummy.rotation.x = 0;
    const armX = [s.x + s.side * pitch / 2]; if (s.i === 0) armX.push(s.x - s.side * pitch / 2);
    for (const ax of armX) { dummy.position.set(ax, s.y + 0.62, s.z); dummy.updateMatrix(); arms.setMatrixAt(ai, dummy.matrix); dummy.position.set(ax, s.y + 0.66, s.z - 0.14); dummy.updateMatrix(); armLeds.setMatrixAt(ai, dummy.matrix); ai++; }
    s.eye = new THREE.Vector3(s.x, s.y + 1.18, s.z + 0.05);
  });
  arms.count = ai; armLeds.count = ai;
  cushion.userData.salaCine = { type: 'seat' }; pickables.push(cushion, back);
  back.userData.salaCine = { type: 'seat' };
  // gradas (solo bajo los bloques de butacas: los pasillos quedan a ras de suelo)
  const blockW = perSide * pitch + 0.25, blockX = aisle / 2 + blockW / 2 - 0.12;
  for (let r = 1; r < rows; r++) for (const s of [-1, 1]) {
    boxAt(blockW, r * 0.2, rowGap, s * blockX, 0, zFront + r * rowGap + 0.05, M.dark);
    boxAt(blockW, 0.015, 0.015, s * blockX, r * 0.2 - 0.01, zFront + r * rowGap + 0.05 - rowGap / 2, M.led);
  }
  // balizas del pasillo
  for (let r = 0; r < rows; r++) for (const s of [-1, 1]) boxAt(0.06, 0.03, 0.12, s * (aisle / 2 - 0.05), 0, zFront + r * rowGap, M.ledCyan);
  // costado de cada fila hacia el pasillo, con su letra (A delante)
  const plateGeo = geo(new THREE.PlaneGeometry(0.13, 0.13));
  for (let r = 0; r < rows; r++) {
    const c = canvas(64, 64), g = c.getContext('2d'); g.fillStyle = '#0b0718'; g.beginPath(); g.roundRect(2, 2, 60, 60, 10); g.fill();
    g.strokeStyle = '#7fd6ff'; g.lineWidth = 3; g.stroke(); g.fillStyle = '#bfeaff'; g.font = `700 38px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String.fromCharCode(65 + r), 32, 35);
    const mat = track(new THREE.MeshBasicMaterial({ map: track(ctex(c)), toneMapped: false }));
    for (const s of [-1, 1]) {
      boxAt(0.05, 0.6, 0.5, s * aisle / 2, r * 0.2, zFront + r * rowGap, M.metal);   // costado de fila
      const m = add(new THREE.Mesh(plateGeo, mat)); m.position.set(s * (aisle / 2 - 0.027), r * 0.2 + 0.42, zFront + r * rowGap); m.rotation.y = -s * Math.PI / 2;
    }
  }
  // alfombra del pasillo central
  { const len = D / 2 - (zFront - 0.7) - 0.15; const m = add(new THREE.Mesh(geo(new THREE.PlaneGeometry(aisle - 0.3, len)), track(new THREE.MeshStandardMaterial({ color: 0x241540, roughness: 1 }))));
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0.006, zFront - 0.7 + len / 2); }

  /* ---- pósters retroiluminados en las paredes laterales ---- */
  const posterCache = new Map();
  // Caché de pósters con límite (LRU): con cientos de películas no se guardan todos los canvas a la vez.
  function posterCanvas(i) {
    const hit = posterCache.get(i);
    if (hit) { posterCache.delete(i); posterCache.set(i, hit); return hit.c; }
    const c = canvas(512, 768); const film = films[i]; drawPoster(c, film); const t = ctex(c);
    posterCache.set(i, { c, t });
    if (film.poster) {
      const own = typeof film.poster === 'function';
      loadImage(film.poster).then(img => {
        if (posterCache.get(i)?.c !== c) { release(img, own); return; }
        if (film.colorAuto) { const col = colorFromImage(img); if (col) { film.color = col; film.colorAuto = false; if (i === state.index) trailer = makeTrailer(film, trailer); } }
        drawPoster(c, film, img); release(img, own); t.needsUpdate = true;
        if (i === state.index) { drawIdleCache(); drawConsole(); }
        o.onPosterReady?.(film, i, c);
      }).catch(() => { /* sin CORS o sin red: se queda el póster generado */ });
    }
    if (posterCache.size > o.maxPosters) {
      const keep = new Set([state.index, ...slots.map(sl => sl.filmIndex)]);
      for (const [k, v] of posterCache) { if (posterCache.size <= o.maxPosters) break; if (!keep.has(k)) { v.t.dispose(); posterCache.delete(k); } }
    }
    return c;
  }
  const posterTex = (i) => { posterCanvas(i); return posterCache.get(i).t; };
  const perWall = Math.max(1, Math.floor((D - 2.4) / 1.3));
  const slots = [];
  const posterStep = perWall > 1 ? (D - 3.0) / (perWall - 1) : 0;
  const posterZ = Array.from({ length: perWall }, (_, k) => perWall > 1 ? -D / 2 + 1.5 + k * posterStep : 0);
  const sconceZ = [posterZ[0] - Math.min(0.9, posterStep / 2 || 0.9), ...posterZ.slice(1).map((z, k) => (z + posterZ[k]) / 2), posterZ[perWall - 1] + Math.min(0.9, posterStep / 2 || 0.9)].filter(z => Math.abs(z) < D / 2 - 0.3);
  const frameGeo = geo(new THREE.BoxGeometry(0.06, 1.22, 0.86)), pGeo = geo(new THREE.PlaneGeometry(0.72, 1.08)), edgeGeo = geo(new THREE.BoxGeometry(0.02, 1.26, 0.9));
  const washTex = (() => { const c = canvas(128, 256), g = c.getContext('2d'); g.scale(1, 1.9); const gr = g.createRadialGradient(64, 80, 2, 64, 80, 60); gr.addColorStop(0, 'rgba(217,184,255,.85)'); gr.addColorStop(0.35, 'rgba(217,184,255,.35)'); gr.addColorStop(1, 'rgba(217,184,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 256 / 1.9); return track(ctex(c)); })();
  const washMat = track(new THREE.MeshBasicMaterial({ map: washTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.3 }));
  const washGeo = geo(new THREE.PlaneGeometry(0.9, Math.min(1.4, H - 1.6)));
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.05), ry = -s * Math.PI / 2;
    for (let k = 0; k < perWall; k++) {
      const z = posterZ[k];
      const frame = add(new THREE.Mesh(frameGeo, M.dark)); frame.position.set(x, 1.6, z);
      const edgeMat = track(new THREE.MeshStandardMaterial({ color: 0, emissive: 0xb59bff, emissiveIntensity: 1.2 }));
      const edge = add(new THREE.Mesh(edgeGeo, edgeMat)); edge.position.set(x - s * 0.005, 1.6, z);
      const mat = track(new THREE.MeshBasicMaterial({ map: null, toneMapped: true }));
      const pm = add(new THREE.Mesh(pGeo, mat)); pm.position.set(x - s * 0.04, 1.6, z); pm.rotation.y = ry;
      const slot = { mesh: pm, mat, edgeMat, filmIndex: 0, hover: 0, pos: new THREE.Vector3(x - s * 0.6, 0, z) };
      pm.userData.salaCine = { type: 'poster', slot }; pickables.push(pm); slots.push(slot);
    }
    // apliques entre pósters
    for (const z of sconceZ) {
      boxAt(0.06, 0.16, 0.22, x - s * 0.02, 2.05, z, M.sconce);
      const wh = Math.min(1.4, H - 1.6), w = add(new THREE.Mesh(washGeo, washMat)); w.position.set(x - s * 0.012, H - 0.05 - wh / 2, z); w.rotation.y = ry;
    }
  }
  function fillSlots() {
    slots.forEach((sl, k) => { sl.filmIndex = (state.posterPage * slots.length + k) % films.length; const t = posterTex(sl.filmIndex); if (sl.mat.map !== t) { sl.mat.map = t; sl.mat.needsUpdate = true; } });
  }

  /* ---- proyector, haz de luz y polvo ---- */
  const LENS = new THREE.Vector3(0, H - 0.42, D / 2 - 0.75);
  const proj = new THREE.Group(); add(proj); proj.position.copy(LENS);
  boxAt(0.55, 0.34, 0.6, 0, -0.17, 0.3, M.metal, proj);
  boxAt(0.04, 0.4, 0.04, 0, 0.17, 0.3, M.metal, proj);
  const lensMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const lens = new THREE.Mesh(geo(new THREE.CircleGeometry(0.07, 24)), lensMat); lens.position.set(0, 0, -0.005); lens.rotation.y = Math.PI; proj.add(lens);
  lens.userData.salaCine = { type: 'projector' }; pickables.push(lens);
  // haz: tronco de pirámide desde la lente hasta las esquinas de la pantalla
  const corners = [[-SW / 2, SY - SH / 2], [SW / 2, SY - SH / 2], [SW / 2, SY + SH / 2], [-SW / 2, SY + SH / 2]];
  const bp = [], bt = [], bi = [];
  corners.forEach(([x, y], k) => { bp.push(LENS.x + Math.sign(x) * 0.05, LENS.y + Math.sign(y - SY) * 0.03, LENS.z, x, y, SZ + 0.02); bt.push(0, 1); });
  for (let k = 0; k < 4; k++) { const a = k * 2, b = ((k + 1) % 4) * 2; bi.push(a, a + 1, b + 1, a, b + 1, b); }
  const beamGeo = geo(new THREE.BufferGeometry()); beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); beamGeo.setAttribute('t', new THREE.Float32BufferAttribute(bt, 1)); beamGeo.setIndex(bi);
  const beamMat = track(new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0 }, uColor: { value: new THREE.Color(0xd9ccff) }, uTime: { value: 0 } },
    vertexShader: 'attribute float t; varying float vT; varying vec3 vP; void main(){ vT=t; vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform float uStrength; uniform vec3 uColor; uniform float uTime; varying float vT; varying vec3 vP;\n float h(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5);}\n void main(){ float streak=0.75+0.25*sin(vP.x*7.0+vP.y*5.0+uTime*0.7)*sin(vP.y*11.0-uTime*0.4); float a=uStrength*mix(0.07,0.022,pow(vT,0.5))*streak*smoothstep(0.0,0.08,vT); gl_FragColor=vec4(uColor*a,1.0); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  const beam = add(new THREE.Mesh(beamGeo, beamMat)); beam.renderOrder = 2;
  // motas de polvo dentro del haz
  const DUST = 420, dPos = new Float32Array(DUST * 3), dSeed = [];
  const dr = rng(11);
  for (let i = 0; i < DUST; i++) dSeed.push({ t: dr(), u: dr(), v: dr(), sp: 0.004 + dr() * 0.01, ph: dr() * TAU });
  const dustGeo = geo(new THREE.BufferGeometry()); dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dustTex = (() => { const c = canvas(32, 32), g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return track(ctex(c)); })();
  const dustMat = track(new THREE.PointsMaterial({ size: 0.012, map: dustTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xe9e2ff }));
  const dust = add(new THREE.Points(dustGeo, dustMat));

  /* ---- techo estrellado de fibra óptica ---- */
  const SC = Math.round(W * D * 9), sPos = new Float32Array(SC * 3), sPh = new Float32Array(SC);
  const sr = rng(5); for (let i = 0; i < SC; i++) { sPos[i * 3] = (sr() - 0.5) * (W - 0.3); sPos[i * 3 + 1] = H - 0.03; sPos[i * 3 + 2] = (sr() - 0.5) * (D - 0.3); sPh[i] = sr() * 100; }
  const starGeo = geo(new THREE.BufferGeometry()); starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3)); starGeo.setAttribute('ph', new THREE.BufferAttribute(sPh, 1));
  const starMat = track(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBright: { value: 0.6 }, uScale: { value: Math.min(2, o.renderer?.getPixelRatio?.() ?? (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)) } },
    vertexShader: 'attribute float ph; uniform float uTime; uniform float uScale; varying float vA; void main(){ vA=0.55+0.45*sin(uTime*(0.6+fract(ph)*1.4)+ph); vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=(1.5+fract(ph*7.0)*2.0)*uScale*(3.0/max(0.5,-mv.z)); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform float uBright; varying float vA; void main(){ vec2 c=gl_PointCoord-0.5; float d=1.0-smoothstep(0.1,0.5,length(c)); gl_FragColor=vec4(vec3(0.85,0.8,1.0)*uBright*vA*d,1.0); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  add(new THREE.Points(starGeo, starMat));

  /* ---- consola de proyección (al fondo a la derecha) y cartel de compuerta ---- */
  const consC = canvas(512, 256), consT = track(ctex(consC));
  const CONS = new THREE.Vector3(W / 2 - 0.7, 0, D / 2 - 0.75);
  boxAt(0.5, 1.0, 0.4, CONS.x, 0, CONS.z, M.metal);
  const consScreen = add(new THREE.Mesh(geo(new THREE.PlaneGeometry(0.56, 0.28)), track(new THREE.MeshBasicMaterial({ map: consT, toneMapped: false }))));
  consScreen.position.set(CONS.x, 1.12, CONS.z - 0.12); consScreen.rotation.set(0.5, Math.PI, 0);
  consScreen.userData.salaCine = { type: 'projector' }; pickables.push(consScreen);
  function drawConsole() {
    const g = consC.getContext('2d'); const on = state.mode === 'proyeccion'; const f = films[state.index];
    g.fillStyle = '#0b0718'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = on ? '#7fd6ff' : '#b59bff'; g.lineWidth = 4; g.strokeRect(8, 8, 496, 240);
    g.fillStyle = '#a99cd6'; g.font = `600 22px ${FONT_M}`; g.textAlign = 'left'; g.fillText('PROYECTOR · SALA 1', 28, 50);
    g.fillStyle = on ? '#7fd6ff' : '#e9e2ff'; g.font = `700 40px ${FONT_D}`; g.fillText(on ? 'EN PROYECCIÓN' : 'LISTO', 28, 110);
    g.fillStyle = '#e9e2ff'; fitFont(g, f.title, 600, FONT_B, 30, 456); g.fillText(f.title, 28, 165);
    g.fillStyle = '#a99cd6'; g.font = `400 20px ${FONT_M}`; g.fillText(`${state.index + 1}/${films.length} · ${FORMAT[f.format] || ''}`, 28, 215);
    consT.needsUpdate = true;
  }
  {
    const c = canvas(512, 96), g = c.getContext('2d'); g.fillStyle = '#04120d'; g.fillRect(0, 0, 512, 96); g.fillStyle = '#6affc8'; g.font = `700 46px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('COMPUERTA', 256, 50);
    const m = add(new THREE.Mesh(geo(new THREE.PlaneGeometry(0.6, 0.11)), track(new THREE.MeshBasicMaterial({ map: track(ctex(c)), toneMapped: false }))));
    m.position.set(0, 2.42, D / 2 - 0.02); m.rotation.y = Math.PI;
  }

  /* ---- luces ---- */
  // Las luces de Three son globales: dentro de la nave (roomLights: false) solo se añade el reflejo de la pantalla,
  // y el anfitrión baja sus propias luces con onDim.
  const hemi = o.roomLights ? add(new THREE.HemisphereLight(0x8f7bff, 0x120a22, 0.5)) : null;
  const roomL = o.roomLights ? [-1, 1].map(s => { const l = add(new THREE.PointLight(0xc9b0ff, 6, 0, 1.7)); l.position.set(s * W * 0.3, H - 0.3, 0.6); return l; }) : [];
  const scrLight = add(new THREE.PointLight(0x9b7bff, 3, 0, 1.4)); scrLight.position.set(0, SY, SZ + 1.6);

  /* ---- pantalla: dibujo ---- */
  const bgStars = Array.from({ length: 160 }, (_, i) => { const r = rng(i * 7 + 1); return { x: r() * 1280, y: r() * 544, z: 0.2 + r() * 0.8 }; });
  const grain = [0, 1, 2].map(k => { const c = canvas(320, 136), g = c.getContext('2d'); const im = g.createImageData(320, 136); const r = rng(k + 99); for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); return c; });
  let idleCard = null; // canvas con la ficha estática de la película actual
  let trailer = null;  // datos generados del tráiler actual
  let T = 0;           // tiempo dentro del tráiler
  let video = null;
  // Color medio de lo que se proyecta, para teñir la luz de la sala y el haz. Se declara al pintar cada escena
  // en vez de leer píxeles del canvas (leerlos obliga a la GPU a esperar).
  const tint = new THREE.Color(0x9b7bff);
  const setTint = (c, k = 1) => tint.set(c).multiplyScalar(k);

  // prev: tráiler anterior de la misma película (al cambiar solo el color se conserva su fotograma ya cargado)
  function makeTrailer(film, prev) {
    const r = rng(hash(film.title) ^ 0x9e37); const p = paletteOf(film);
    const layers = [0, 1, 2].map(() => Array.from({ length: 96 }, () => r()));
    const tr = { film, p, layers, planet: { x: 0.25 + r() * 0.5, y: 0.22 + r() * 0.2, R: 70 + r() * 90, ring: r() < 0.5, moons: Math.floor(r() * 3) },
      cuts: [0, 1, 2, 3].map(() => ({ kind: Math.floor(r() * 4), a: r(), b: r(), fx: 0.2 + r() * 0.6, fy: 0.25 + r() * 0.5, z: 1.5 + r() * 0.8 })),
      shipY: 0.15 + r() * 0.25, pan: r() < 0.5 ? 1 : -1, still: null, soft: null, own: false, requested: false };
    if (prev && prev.film === film) { Object.assign(tr, { still: prev.still, soft: prev.soft, own: prev.own, requested: prev.requested }); prev.still = null; }
    else if (prev) dropStill(prev);
    return tr;
  }
  function dropStill(tr) { if (tr?.still) { release(tr.still, tr.own); tr.still = null; tr.soft = null; } }
  // El fotograma se pide cuando la película lleva un momento elegida (así no se descargan al pasar deprisa).
  function requestStill(tr) {
    tr.requested = true; const f = tr.film; if (!f.backdrop) return;
    const own = typeof f.backdrop === 'function';
    loadImage(f.backdrop).then(img => {
      if (trailer !== tr) { release(img, own); return; }
      tr.still = img; tr.own = own; tr.stillAt = state.time;
      const soft = canvas(96, 41); const g = soft.getContext('2d'); cover(g, img, 96, 41); tr.soft = soft;   // versión desenfocada barata
      drawIdleCache();
    }).catch(() => {});
  }
  function drawIdleCache() {
    const f = films[state.index]; const p = paletteOf(f);
    idleCard = canvas(1280, 544); const g = idleCard.getContext('2d');
    g.drawImage(posterCanvas(state.index), 80, 48, 300, 450);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#a99cd6'; g.font = `600 20px ${FONT_M}`; spaced(g, 'A CONTINUACIÓN · SESIÓN DE A BORDO', 440, 92, 3, 'left');
    const tb = titleBlock(g, f.title.toUpperCase(), FONT_D, 64, 760, 2);
    g.fillStyle = '#ffffff'; let y = 92 + 24 + tb.size;
    for (const l of tb.lines) { g.font = `700 ${tb.size}px ${FONT_D}`; g.fillText(l, 440, y); y += tb.size * 1.08; }
    g.fillStyle = '#d9ccff'; g.font = `400 28px ${FONT_B}`; fitFont(g, `Un film de ${f.director}${f.year ? ' · ' + f.year : ''}`, 400, FONT_B, 28, 760, 18); g.fillText(`Un film de ${f.director}${f.year ? ' · ' + f.year : ''}`, 440, y + 10);
    const meta = [f.type, ...(f.genres || []).slice(0, 3), runtimeText(f.runtime)].filter(Boolean).join('  ·  ');
    if (meta) { g.fillStyle = '#a99cd6'; g.font = `400 19px ${FONT_M}`; fitFont(g, meta.toUpperCase(), 400, FONT_M, 19, 760, 12); g.fillText(meta.toUpperCase(), 440, y + 46); y += 30; }
    g.fillStyle = '#c8bdf0'; g.font = `italic 300 25px ${FONT_B}`;
    const text = blurb(f, 190), tl = text ? wrap(g, f.tagline ? '«' + text + '»' : text, 760).slice(0, 3) : []; tl.forEach((l, i) => g.fillText(l, 440, y + 62 + i * 33));
    const yy = Math.min(Math.max(y + 62 + tl.length * 33 + 18, 400), 456);
    stars(g, 452, yy, f.rating ?? 0, 30, p.glow, '#ffffff26');
    g.fillStyle = '#e9e2ff'; g.font = `600 22px ${FONT_M}`; g.fillText(`${f.rating ?? '–'}/10`, 452 + 5 * 37 + 10, yy + 8);
    if (f.format) { g.strokeStyle = '#b59bff'; g.lineWidth = 2; const bx = 452 + 5 * 37 + 110, label = FORMAT[f.format] || f.format; g.font = `600 18px ${FONT_M}`; const w = g.measureText(label).width + 24; g.beginPath(); g.roundRect(bx, yy - 18, w, 32, 6); g.stroke(); g.fillStyle = '#b59bff'; g.fillText(label, bx + 12, yy + 5); }
    g.fillStyle = '#a99cd6'; g.font = `400 18px ${FONT_M}`; g.textAlign = 'right'; g.fillText(`${String(state.index + 1).padStart(2, '0')} / ${String(films.length).padStart(2, '0')}`, 1240, 44);
  }
  function drawIdle(t) {
    const f = films[state.index]; const p = paletteOf(f);
    sg.globalAlpha = 1; sg.shadowBlur = 0; sg.textBaseline = 'alphabetic'; setTint(shade(p.base, -0.25), 1.2);
    const bg = sg.createRadialGradient(330, 272, 40, 640, 272, 900); bg.addColorStop(0, shade(p.base, -0.45)); bg.addColorStop(1, '#07050f');
    sg.fillStyle = bg; sg.fillRect(0, 0, 1280, 544);
    if (trailer?.still) {   // fotograma de fondo, muy oscurecido y con un zoom lento
      sg.globalAlpha = 0.5 * clamp((state.time - (trailer.stillAt ?? -9)) / 0.8); cover(sg, trailer.still, 1280, 544, 1.04 + 0.03 * Math.sin(t * 0.05), 0.5, 0.4); sg.globalAlpha = 1;
      const sh = sg.createLinearGradient(0, 0, 1280, 0); sh.addColorStop(0, 'rgba(7,5,15,.92)'); sh.addColorStop(0.55, 'rgba(7,5,15,.78)'); sh.addColorStop(1, 'rgba(7,5,15,.55)');
      sg.fillStyle = sh; sg.fillRect(0, 0, 1280, 544);
    }
    for (const s of bgStars) { const x = ((s.x - t * 12 * s.z) % 1280 + 1280) % 1280; sg.fillStyle = `rgba(233,226,255,${0.25 + s.z * 0.5})`; sg.fillRect(x, s.y, s.z * 2.2, s.z * 2.2); }
    sg.save(); sg.shadowColor = p.glow; sg.shadowBlur = 40; sg.fillStyle = '#000'; sg.fillRect(80, 48, 300, 450); sg.restore();
    sg.drawImage(idleCard, 0, 0);
    const a = 0.45 + 0.35 * Math.sin(t * 2);
    sg.fillStyle = `rgba(127,214,255,${a})`; sg.font = `600 18px ${FONT_M}`; sg.textAlign = 'left'; spaced(sg, 'ENCIENDE EL PROYECTOR PARA VER EL TRÁILER', 440, 500, 2, 'left');
  }
  function drawStill(T0, tr, f) {
    const k = T0 / 5.5, z = 1.06 + 0.12 * k;
    sg.fillStyle = '#000'; sg.fillRect(0, 0, 1280, 544);
    cover(sg, tr.still, 1280, 544, z, 0.5 + tr.pan * (0.5 * k - 0.25) * 0.6, 0.45);
    sg.globalCompositeOperation = 'soft-light'; sg.globalAlpha = 0.35; sg.fillStyle = tr.p.base; sg.fillRect(0, 0, 1280, 544);
    sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = 1;
    const low = sg.createLinearGradient(0, 330, 0, 544); low.addColorStop(0, 'rgba(0,0,0,0)'); low.addColorStop(1, 'rgba(0,0,0,.75)'); sg.fillStyle = low; sg.fillRect(0, 330, 1280, 214);
    taglineOver(T0, f);
  }
  function taglineOver(T0, f) {
    const text = blurb(f, 120); if (!text) return;
    const a = fadeIO(T0, 0.8, 5.4, 0.7); if (a <= 0) return;
    sg.globalAlpha = a; sg.fillStyle = '#f4eeff'; sg.textAlign = 'center'; sg.shadowColor = '#000'; sg.shadowBlur = 16;
    // subtítulo en dos líneas como mucho, a un tamaño que se lea desde las butacas
    const size = f.tagline ? 38 : 32; sg.font = `italic 300 ${size}px ${FONT_B}`;
    let lines = wrap(sg, text, 1040);
    if (lines.length > 2) { lines = lines.slice(0, 2); lines[1] = lines[1].replace(/[\s,;:.…]*$/, '') + '…'; }
    lines.forEach((l, i) => sg.fillText(l, 640, 504 - (lines.length - 1 - i) * size * 1.25));
    sg.shadowBlur = 0; sg.globalAlpha = 1;
  }
  function drawLandscape(T0, tr, f) {
    const p = tr.p; const sky = sg.createLinearGradient(0, 0, 0, 544); sky.addColorStop(0, '#05030c'); sky.addColorStop(0.65, shade(p.base, -0.25)); sky.addColorStop(1, p.light);
    sg.fillStyle = sky; sg.fillRect(0, 0, 1280, 544);
    for (const s of bgStars) { if (s.y > 300) continue; sg.fillStyle = `rgba(255,255,255,${s.z * 0.7})`; sg.fillRect((s.x - T0 * 6 * s.z + 1280) % 1280, s.y, 2, 2); }
    const pl = tr.planet, px = pl.x * 1280 - T0 * 8, py = pl.y * 544 + T0 * 3;
    const gl = sg.createRadialGradient(px, py, pl.R * 0.5, px, py, pl.R * 2.6); gl.addColorStop(0, p.glow + '66'); gl.addColorStop(1, p.glow + '00'); sg.fillStyle = gl; sg.fillRect(0, 0, 1280, 544);
    const pg = sg.createLinearGradient(px - pl.R, py - pl.R, px + pl.R, py + pl.R); pg.addColorStop(0, p.light); pg.addColorStop(1, p.deep);
    sg.fillStyle = pg; sg.beginPath(); sg.arc(px, py, pl.R, 0, TAU); sg.fill();
    if (pl.ring) { sg.strokeStyle = p.glow + 'aa'; sg.lineWidth = 3; sg.beginPath(); sg.ellipse(px, py, pl.R * 1.9, pl.R * 0.32, -0.2, 0, TAU); sg.stroke(); }
    for (let m = 0; m < pl.moons; m++) { sg.fillStyle = p.light; sg.beginPath(); sg.arc(px + pl.R * (2.2 + m), py - pl.R * (0.6 - m * 0.5), 8 + m * 4, 0, TAU); sg.fill(); }
    // nave cruzando
    const sx = -100 + T0 * 260, sy = tr.shipY * 544;
    if (sx < 1400) { sg.fillStyle = '#0a0614'; sg.beginPath(); sg.moveTo(sx, sy); sg.lineTo(sx - 46, sy - 9); sg.lineTo(sx - 38, sy); sg.lineTo(sx - 46, sy + 9); sg.closePath(); sg.fill(); const eg = sg.createRadialGradient(sx - 44, sy, 0, sx - 44, sy, 22); eg.addColorStop(0, '#7fd6ffee'); eg.addColorStop(1, '#7fd6ff00'); sg.fillStyle = eg; sg.fillRect(sx - 70, sy - 22, 50, 44); }
    tr.layers.forEach((L, li) => {
      sg.fillStyle = [shade(p.base, -0.45), shade(p.base, -0.68), '#04020a'][li];
      const off = T0 * (14 + li * 26), base = 380 + li * 50, amp = 70 - li * 12;
      sg.beginPath(); sg.moveTo(0, 544);
      for (let x = 0; x <= 1280; x += 20) { const u = (x + off) / 40, i0 = Math.floor(u), fr = u - i0; const a = L[((i0 % 96) + 96) % 96], b = L[(((i0 + 1) % 96) + 96) % 96]; sg.lineTo(x, base - (a + (b - a) * fr) * amp); }
      sg.lineTo(1280, 544); sg.closePath(); sg.fill();
    });
    taglineOver(T0, f);
  }
  function drawCut(c, tr, k, u) {
    const p = tr.p; sg.fillStyle = k % 2 ? shade(p.base, -0.7) : '#05030c'; sg.fillRect(0, 0, 1280, 544);
    if (tr.still) {   // planos cortos: encuadres distintos del mismo fotograma
      cover(sg, tr.still, 1280, 544, c.z + u * 0.12, c.fx, c.fy);
      if (k % 2) { sg.globalCompositeOperation = 'soft-light'; sg.globalAlpha = 0.5; sg.fillStyle = p.glow; sg.fillRect(0, 0, 1280, 544); sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = 1; }
      return;
    }
    if (c.kind === 0) { sg.fillStyle = p.glow; sg.beginPath(); sg.arc(640, 272, 190, 0, TAU); sg.fill(); sg.fillStyle = '#05030c'; sg.beginPath(); sg.arc(640 + 40 + c.a * 40, 262, 186, 0, TAU); sg.fill(); }
    else if (c.kind === 1) { for (let i = 0; i < 26; i++) { sg.strokeStyle = i % 3 ? p.accent + '88' : '#ffffffcc'; sg.lineWidth = 1 + (i % 4); sg.beginPath(); sg.moveTo(640, 272); const ang = (i / 26) * TAU + c.a; sg.lineTo(640 + Math.cos(ang) * 1400, 272 + Math.sin(ang) * 1400); sg.stroke(); } }
    else if (c.kind === 2) { sg.strokeStyle = p.accent; sg.lineWidth = 2; for (let i = -12; i <= 12; i++) { sg.beginPath(); sg.moveTo(640 + i * 20, 300); sg.lineTo(640 + i * 160, 544); sg.stroke(); } for (let j = 0; j < 8; j++) { const y = 300 + Math.pow(j / 8, 2) * 244; sg.beginPath(); sg.moveTo(0, y); sg.lineTo(1280, y); sg.stroke(); } sg.fillStyle = p.glow; sg.fillRect(0, 296, 1280, 4); }
    else { const dg = sg.createLinearGradient(0, 0, 0, 544); dg.addColorStop(0, p.light); dg.addColorStop(1, p.glow); sg.fillStyle = dg; sg.fillRect(540, 60, 200, 484); sg.fillStyle = '#05030c'; sg.beginPath(); sg.arc(640, 260, 26, 0, TAU); sg.fill(); sg.fillRect(612, 290, 56, 150); sg.fillRect(616, 440, 20, 104); sg.fillRect(644, 440, 20, 104); }
  }
  function drawTrailer(T) {
    const f = films[state.index]; const tr = trailer; const p = tr.p;
    sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.globalAlpha = 1; sg.shadowBlur = 0;
    if (video && video.readyState >= 2 && T >= LEADER_LEN) {
      const s = Math.max(1280 / video.videoWidth, 544 / video.videoHeight); sg.fillStyle = '#000'; sg.fillRect(0, 0, 1280, 544);
      sg.drawImage(video, (1280 - video.videoWidth * s) / 2, (544 - video.videoHeight * s) / 2, video.videoWidth * s, video.videoHeight * s);
    } else if (T < LEADER_LEN) { // cuenta atrás
      setTint(T < 3 ? '#3a2c5c' : '#000000');
      sg.fillStyle = '#231a38'; sg.fillRect(0, 0, 1280, 544);
      if (T < 3) {
        const fr = T % 1; sg.fillStyle = '#3a2c5c'; sg.beginPath(); sg.moveTo(640, 272); sg.arc(640, 272, 700, -Math.PI / 2, -Math.PI / 2 + fr * TAU); sg.closePath(); sg.fill();
        sg.strokeStyle = '#d9ccff'; sg.lineWidth = 3; for (const R of [190, 230]) { sg.beginPath(); sg.arc(640, 272, R, 0, TAU); sg.stroke(); }
        sg.beginPath(); sg.moveTo(0, 272); sg.lineTo(1280, 272); sg.moveTo(640, 0); sg.lineTo(640, 544); sg.stroke();
        sg.fillStyle = '#f4eeff'; sg.font = `700 230px ${FONT_D}`; sg.fillText(String(3 - Math.floor(T)), 640, 290);
      } else { sg.fillStyle = '#000'; sg.fillRect(0, 0, 1280, 544); }
    } else if (T < 6.5) { // presentación
      setTint('#1a1530');
      sg.fillStyle = '#05030c'; sg.fillRect(0, 0, 1280, 544);
      for (const s of bgStars) { const z = s.z + (T - 3.2) * 0.05; sg.fillStyle = `rgba(233,226,255,${s.z * 0.8})`; sg.fillRect(640 + (s.x - 640) * z, 272 + (s.y - 272) * z, 2, 2); }
      const a = fadeIO(T, 3.6, 6.4, 0.8); sg.globalAlpha = a; sg.fillStyle = '#d9ccff'; sg.font = `600 34px ${FONT_D}`; spaced(sg, 'LA MALKEVNIA', 640, 252, 14); sg.font = `400 22px ${FONT_M}`; sg.fillStyle = '#a99cd6'; spaced(sg, 'PRESENTA', 640, 304, 10); sg.globalAlpha = 1;
    } else if (T < 12) {
      if (tr.still) drawStill(T - 6.5, tr, f); else drawLandscape(T - 6.5, tr, f);
      setTint(mix(p.light, p.base, 0.5), 0.8 * smooth(6.5, 7.2, T));
      const fi = 1 - smooth(6.5, 7.2, T); if (fi > 0) { sg.fillStyle = `rgba(0,0,0,${fi})`; sg.fillRect(0, 0, 1280, 544); }
    } else if (T < 13.6) { // dirección
      setTint('#120f20');
      sg.fillStyle = '#05030c'; sg.fillRect(0, 0, 1280, 544);
      const a = fadeIO(T, 12, 13.6, 0.35); sg.globalAlpha = a; sg.fillStyle = '#a99cd6'; sg.font = `400 24px ${FONT_M}`; spaced(sg, 'UNA PELÍCULA DE', 640, 220, 8);
      sg.fillStyle = '#f4eeff'; const dn = f.director.toUpperCase(); fitFont(sg, dn, 700, FONT_D, 64, 1100 - 6 * dn.length); spaced(sg, dn, 640, 290, 6); sg.globalAlpha = 1;
    } else if (T < 15.6) { // cortes rápidos
      const k = Math.min(3, Math.floor((T - 13.6) / 0.5)); drawCut(tr.cuts[k], tr, k, ((T - 13.6) % 0.5) / 0.5); setTint(k % 2 ? shade(p.base, -0.4) : p.glow, k % 2 ? 1 : 0.6);
      const fl = 1 - clamp(((T - 13.6) % 0.5) / 0.12); if (fl > 0) { sg.fillStyle = o.reducedMotion ? `rgba(0,0,0,${fl})` : `rgba(255,255,255,${fl * 0.5})`; sg.fillRect(0, 0, 1280, 544); }
    } else if (T < 21) { // título
      setTint(mix(shade(p.base, -0.35), '#ffffff', 0.15), 0.4 + 0.6 * fadeIO(T, 15.6, 21, 0.5));
      sg.fillStyle = '#05030c'; sg.fillRect(0, 0, 1280, 544);
      const neb = sg.createRadialGradient(640, 272, 20, 640, 272, 700); neb.addColorStop(0, shade(p.base, -0.35) + 'ff'); neb.addColorStop(1, '#05030c'); sg.globalAlpha = 0.9; sg.fillStyle = neb; sg.fillRect(0, 0, 1280, 544); sg.globalAlpha = 1;
      if (tr.soft) { sg.globalAlpha = 0.55; sg.imageSmoothingQuality = 'high'; cover(sg, tr.soft, 1280, 544, 1.1 + (T - 15.6) * 0.01); sg.globalAlpha = 1; sg.fillStyle = 'rgba(5,3,12,.55)'; sg.fillRect(0, 0, 1280, 544); }
      for (const s of bgStars) { const z = 1 + (T - 15.6) * 0.04 * s.z; sg.fillStyle = `rgba(233,226,255,${s.z * 0.6})`; sg.fillRect(640 + (s.x - 640) * z, 272 + (s.y - 272) * z, 2, 2); }
      const a = fadeIO(T, 15.6, 21, 0.5); sg.globalAlpha = a;
      const sp = 4 + (T - 15.6) * 2.2;
      if (!tr.title) tr.title = fitSpaced(sg, f.title.toUpperCase(), FONT_D, 96, 1120, 4 + 5.4 * 2.2, 2);
      const tb = tr.title;
      sg.fillStyle = '#ffffff'; sg.shadowColor = p.glow; sg.shadowBlur = 36;
      const lh = tb.size * 1.1; let y = 250 - (tb.lines.length - 1) * lh / 2;
      for (const l of tb.lines) { sg.font = `700 ${tb.size}px ${FONT_D}`; spaced(sg, l, 640, y, sp); y += lh; }
      sg.shadowBlur = 0; sg.fillStyle = '#d9ccff'; sg.font = `400 26px ${FONT_M}`; spaced(sg, `·  ${f.year || ''}  ·`, 640, y + 26, 8);
      stars(sg, 640 - 2.5 * 37 + 15, y + 86, f.rating ?? 0, 30, p.glow, '#ffffff22');
      sg.globalAlpha = 1;
    } else { // cierre
      setTint('#100d1e');
      sg.fillStyle = '#05030c'; sg.fillRect(0, 0, 1280, 544);
      const a = fadeIO(T, 21, TRAILER_LEN, 0.6); sg.globalAlpha = a;
      sg.save(); sg.shadowColor = p.glow; sg.shadowBlur = 30; sg.drawImage(posterCanvas(state.index), 250, 92, 240, 360); sg.restore();
      sg.textAlign = 'left';
      sg.fillStyle = '#a99cd6'; sg.font = `400 22px ${FONT_M}`; spaced(sg, 'EN LA FILMOTECA DE A BORDO', 560, 190, 5, 'left');
      const tb = titleBlock(sg, f.title.toUpperCase(), FONT_D, 46, 560, 2); sg.fillStyle = '#f4eeff';
      tb.lines.forEach((l, i) => { sg.font = `700 ${tb.size}px ${FONT_D}`; sg.fillText(l, 560, 250 + i * tb.size * 1.1); });
      const yb = 250 + tb.lines.length * tb.size * 1.1 + 10;
      sg.fillStyle = '#d9ccff'; sg.font = `400 24px ${FONT_B}`; sg.fillText([f.year, FORMAT[f.format], runtimeText(f.runtime)].filter(Boolean).join('  ·  '), 560, yb);
      sg.fillStyle = '#7fd6ff'; sg.font = `400 22px ${FONT_B}`; sg.fillText(`Nota del capitán: ${f.rating ?? '–'}/10`, 560, yb + 44);
      sg.textAlign = 'center'; sg.globalAlpha = 1;
    }
    // grano, rayas y viñeta
    sg.globalCompositeOperation = 'overlay'; sg.globalAlpha = 0.16; sg.drawImage(grain[Math.floor(state.time * 24) % 3], 0, 0, 1280, 544);
    sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = 1;
    if (!o.reducedMotion && Math.random() < 0.08) { sg.fillStyle = 'rgba(255,255,255,.18)'; sg.fillRect(Math.random() * 1280, 0, 1, 544); }
    const vg = sg.createRadialGradient(640, 272, 300, 640, 272, 760); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); sg.fillStyle = vg; sg.fillRect(0, 0, 1280, 544);
  }

  /* ---- sonido opcional (WebAudio, sin ficheros) ---- */
  let ac = null, hum = null, soundOn = false;
  function ensureAudio() {
    if (ac) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC(); const master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = ac.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    const click = ac.createGain(); click.gain.value = 0;
    const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 24; const lfoG = ac.createGain(); lfoG.gain.value = 0.02; lfo.connect(lfoG); lfoG.connect(click.gain);
    const motor = ac.createOscillator(); motor.frequency.value = 55; const mg = ac.createGain(); mg.gain.value = 0.025; motor.connect(mg);
    const out = ac.createGain(); out.gain.value = 0;
    noise.connect(bp); bp.connect(click); click.connect(out); mg.connect(out); out.connect(master);
    noise.start(); lfo.start(); motor.start();
    hum = { out, master };
  }
  function sfx(kind) {
    if (!soundOn || !ac) return; const t0 = ac.currentTime;
    if (kind === 'beep') { const o2 = ac.createOscillator(), g = ac.createGain(); o2.frequency.value = 1000; g.gain.setValueAtTime(0.08, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12); o2.connect(g); g.connect(hum.master); o2.start(t0); o2.stop(t0 + 0.13); }
    if (kind === 'boom') { const o2 = ac.createOscillator(), g = ac.createGain(); o2.frequency.setValueAtTime(70, t0); o2.frequency.exponentialRampToValueAtTime(28, t0 + 1.6); g.gain.setValueAtTime(0.5, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2); o2.connect(g); g.connect(hum.master); o2.start(t0); o2.stop(t0 + 2.3); }
  }
  function updateHum() { if (hum) hum.out.gain.setTargetAtTime(soundOn && state.mode === 'proyeccion' ? 1 : 0, ac.currentTime, 0.4); }

  /* ---- control ---- */
  function loadVideo() {
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); video = null; }
    const f = films[state.index]; if (!f.trailer || state.mode !== 'proyeccion') return;
    video = document.createElement('video'); video.crossOrigin = 'anonymous'; video.playsInline = true; video.preload = 'auto';
    video.muted = !soundOn; video.loop = !o.autoAdvance; video.src = f.trailer;
    video.addEventListener('ended', () => { if (o.autoAdvance) next(); });
    video.addEventListener('error', () => { video = null; });   // sin CORS o URL rota: se queda el tráiler generado
  }
  // Algunos navegadores no dejan reproducir con sonido fuera de un clic: se reintenta en silencio.
  const playVideo = () => { const v = video; if (!v) return; v.play().catch(() => { if (video === v && !v.muted) { v.muted = true; v.play().catch(() => {}); } }); };
  function select(i, { restart = true, notify = true } = {}) {
    state.index = ((i % films.length) + films.length) % films.length; state.selTime = 0;
    trailer = makeTrailer(films[state.index], trailer);
    if (o.followPosters && slots.length && !slots.some(sl => sl.filmIndex === state.index)) { state.posterPage = Math.floor(state.index / slots.length); fillSlots(); }
    drawIdleCache(); drawConsole();
    if (state.mode === 'proyeccion' && restart) { T = LEADER_LEN; loadVideo(); playVideo(); }
    if (notify) o.onSelect?.(films[state.index], state.index);
  }
  const next = () => select(state.index + 1), prev = () => select(state.index - 1);
  function setProjection(on) {
    const mode = on ? 'proyeccion' : 'sala'; if (mode === state.mode) return;
    state.mode = mode; T = 0; drawConsole(); loadVideo();
    if (video) { const v = video; setTimeout(() => { if (video === v && state.mode === 'proyeccion') playVideo(); }, LEADER_LEN * 1000); }
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); updateHum();
    o.onModeChange?.(mode);
  }
  const toggleProjection = () => setProjection(state.mode !== 'proyeccion');
  function setSound(on) { soundOn = !!on; if (soundOn) { ensureAudio(); ac?.resume?.().catch?.(() => {}); } if (video) video.muted = !soundOn; updateHum(); }
  function pagePosters(dir = 1) { const pages = Math.max(1, Math.ceil(films.length / slots.length)); state.posterPage = ((state.posterPage + dir) % pages + pages) % pages; fillSlots(); }

  function info(hit) {
    if (!hit) return null; const d = hit.object.userData.salaCine; if (!d) return null;
    if (d.type === 'poster') return { type: 'poster', index: d.slot.filmIndex, film: films[d.slot.filmIndex], slot: d.slot };
    if (d.type === 'seat') { const s = seatList[hit.instanceId ?? 0]; return { type: 'seat', seatIndex: hit.instanceId ?? 0, eye: group.localToWorld(s.eye.clone()) }; }
    return { type: d.type };
  }
  const pick = (raycaster) => info(raycaster.intersectObjects(pickables, false)[0]);
  let hovered = null;
  function hover(raycaster) { const h = raycaster ? pick(raycaster) : null; hovered = h && h.type === 'poster' ? h.slot : null; return h; }

  // colisiones e interacciones en coordenadas del mundo
  const toWorld = (x, z) => new THREE.Vector3(x, 0, z).applyEuler(new THREE.Euler(0, o.rotationY, 0)).add(o.origin);
  const rect = (x0, z0, x1, z1) => { const a = toWorld(x0, z0), b = toWorld(x1, z1); return [Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z)]; };
  const colliders = [
    ...[-1, 1].map(s => rect(s * (aisle / 2 - 0.05), zFront - 0.45, s * (aisle / 2 + perSide * pitch + 0.15), zFront + (rows - 1) * rowGap + 0.6)),
    rect(-(SW + 0.6) / 2, -D / 2, (SW + 0.6) / 2, SZ + stageD),
    rect(CONS.x - 0.3, CONS.z - 0.25, CONS.x + 0.3, CONS.z + 0.25),
  ];
  const cw = toWorld(CONS.x, CONS.z - 0.6);
  const interactions = [
    { x: cw.x, z: cw.z, r: 1.3, get label() { return state.mode === 'proyeccion' ? 'Apagar el proyector' : 'Encender el proyector'; }, run: toggleProjection },
    ...slots.map(sl => { const w = toWorld(sl.pos.x, sl.pos.z); return { x: w.x, z: w.z, r: 0.75, get label() { return `Ver «${films[sl.filmIndex].title}»`; }, run: () => select(sl.filmIndex) }; }),
  ];

  /* ---- bucle ---- */
  let drawAcc = 1, sampleAcc = 0, lastLevel = -1, beepAt = -1;
  const sample = canvas(4, 2), sampleG = sample.getContext('2d', { willReadFrequently: true });
  const scrAvg = new THREE.Color(0x9b7bff);
  function update(dt = 1 / 60) {
    dt = Math.min(dt, 0.1); state.time += dt;
    state.selTime += dt; if (trailer && !trailer.requested && (state.selTime > 0.35 || state.mode === 'proyeccion')) requestStill(trailer);
    const target = state.mode === 'proyeccion' ? 0.05 : 1;
    state.level += (target - state.level) * Math.min(1, dt * (target < state.level ? 0.9 : 1.6));
    const L = state.level, dark = 1 - L;
    // luces de sala
    if (hemi) hemi.intensity = 0.5 * (0.15 + 0.85 * L);
    roomL.forEach(l => l.intensity = 6 * L);
    M.sconce.emissiveIntensity = 0.2 + 2.8 * L; washMat.opacity = 0.03 + 0.27 * L;
    M.led.emissiveIntensity = 1 + 1.2 * L; M.ledCyan.emissiveIntensity = 1.2 + 0.8 * dark;
    starMat.uniforms.uTime.value = state.time; starMat.uniforms.uBright.value = 0.45 + 0.8 * dark;
    // pantalla
    if (state.mode === 'proyeccion') {
      const prevT = T; T += dt;
      if (T < 3 && Math.floor(T) !== beepAt) { beepAt = Math.floor(T); sfx('beep'); }
      if (T >= 3) beepAt = -1;
      if (prevT < 15.6 && T >= 15.6 && !(video && video.readyState >= 2)) sfx('boom');
      const end = video ? Infinity : TRAILER_LEN;          // con vídeo manda su evento 'ended'
      if (T >= end) { if (o.autoAdvance) select(state.index + 1); else T = LEADER_LEN; }
      drawAcc += dt;
      if (drawAcc >= 1 / 24) {                               // 24 fotogramas por segundo, como el cine
        drawAcc %= 1 / 24; drawTrailer(T); scrT.needsUpdate = true;
        scrMat.color.setScalar(o.reducedMotion ? 1 : 0.94 + Math.random() * 0.06);
      }
    } else {
      drawAcc += dt; if (drawAcc > 1 / 30) { drawAcc = 0; drawIdle(state.time); scrT.needsUpdate = true; }
      scrMat.color.setScalar(0.55 + 0.45 * L);
    }
    sampleAcc += dt;
    if (state.mode === 'proyeccion' && video && video.readyState >= 2 && T >= LEADER_LEN) {
      // con vídeo no se sabe qué hay en pantalla: se mide en un canvas diminuto (en CPU) 4 veces por segundo
      if (sampleAcc > 0.25) { sampleAcc = 0; try { sampleG.drawImage(video, 0, 0, 4, 2); const d = sampleG.getImageData(0, 0, 4, 2).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } tint.setRGB(r / 2040, g / 2040, b / 2040, THREE.SRGBColorSpace); } catch { /* vídeo sin CORS */ } }
    }
    scrAvg.lerp(tint, Math.min(1, dt * 5));
    scrLight.color.copy(scrAvg).lerp(C_SCREEN, 0.3); scrLight.intensity = 1.5 + 5 * dark;
    // proyector
    beamMat.uniforms.uStrength.value = dark * (o.reducedMotion ? 0.92 : 0.85 + Math.random() * 0.15); beamMat.uniforms.uTime.value = state.time;
    beamMat.uniforms.uColor.value.copy(scrAvg).lerp(C_BEAM, 0.55);
    beam.visible = dark > 0.02; dust.visible = beam.visible;
    lensMat.color.setScalar(0.15 + 0.85 * dark);
    if (dust.visible) {
      dustMat.opacity = dark * 0.6;
      for (let i = 0; i < DUST; i++) {
        const s = dSeed[i]; s.t = (s.t + s.sp * dt) % 1; const t = s.t, u = s.u - 0.5 + Math.sin(state.time * 0.3 + s.ph) * 0.02, v = s.v - 0.5 + Math.cos(state.time * 0.25 + s.ph) * 0.02;
        dPos[i * 3] = LENS.x + (u * SW - LENS.x) * t; dPos[i * 3 + 1] = LENS.y + (SY + v * SH - LENS.y) * t; dPos[i * 3 + 2] = LENS.z + (SZ - LENS.z) * t;
      }
      dustGeo.attributes.position.needsUpdate = true;
    }
    // telones
    if (!o.reducedMotion) for (const c of curtains) { const a = c.m.geometry.attributes.position; for (let i = 0; i < a.count; i++) { const x = c.base[i * 3], y = c.base[i * 3 + 1]; a.setZ(i, Math.sin(x * 22 + c.s) * 0.06 + Math.sin(state.time * 0.6 + y * 1.5 + x * 3) * 0.012); } a.needsUpdate = true; c.m.geometry.computeVertexNormals(); }
    // pósters
    for (const sl of slots) {
      sl.hover += ((sl === hovered ? 1 : 0) - sl.hover) * Math.min(1, dt * 8);
      const sel = sl.filmIndex === state.index ? 1 : 0;
      sl.edgeMat.emissiveIntensity = (0.6 + 0.8 * L) + sl.hover * 2 + sel * (1.2 + Math.sin(state.time * 3) * 0.4);
      sl.edgeMat.emissive.setHex(sel ? 0x7fd6ff : 0xb59bff);
      sl.mat.color.setScalar(0.5 + 0.5 * L + sl.hover * 0.2);
      sl.mesh.scale.setScalar(1 + sl.hover * 0.04);
    }
    if (Math.abs(L - lastLevel) > 0.002) { lastLevel = L; o.onDim?.(L); }
  }

  function dispose() {
    setSound(false); if (video) { video.pause(); video = null; }
    if (ac) { ac.close().catch(() => {}); ac = null; hum = null; }
    group.parent?.remove(group);
    for (const d of disposables) d.dispose?.();
    for (const v of posterCache.values()) v.t.dispose();
    dropStill(trailer);
    posterCache.clear(); pickables.length = 0; slots.length = 0; hovered = null;
  }

  // arranque
  fillSlots(); select(0, { restart: false, notify: false }); drawIdle(0); scrT.needsUpdate = true;
  if (o.sound) setSound(true);   // el audio arranca suspendido hasta el primer clic (setProjection o setSound)
  group.updateMatrixWorld(true);

  return {
    group, films, state, colliders, interactions, pickables,
    seats: seatList.map(s => group.localToWorld(s.eye.clone())),
    bestSeat: (rows - 1) * 2 * perSide,   // última fila, junto al pasillo: la que mejor encuadra la pantalla
    screen: { center: group.localToWorld(new THREE.Vector3(0, SY, SZ)), width: SW, height: SH },
    poster: (i) => posterCanvas(((i % films.length) + films.length) % films.length),
    update, dispose, select, next, prev, setProjection, toggleProjection, setSound, pagePosters, pick, hover,
    get mode() { return state.mode; }, get current() { return films[state.index]; },
  };
}

// Convierte las fichas de la base de datos de Malkevnia (las del importador: kind, creator, cover_url, details…)
// en películas para la sala, ordenadas por nota (de mayor a menor), luego año y título.
export function filmsFromFichas(fichas) {
  const list = Array.isArray(fichas) ? fichas : fichas?.fichas || [];
  return list.filter(f => f && f.kind === 'film' && !f.hidden).map(f => {
    const d = f.details || {};
    return {
      title: f.title, director: f.creator || '', year: f.year ?? undefined, rating: f.rating ?? undefined, color: f.color || undefined,
      poster: f.cover_url || undefined, backdrop: d.backdrop_url ? d.backdrop_url.replace('/t/p/w1280/', '/t/p/w780/') : undefined,
      tagline: d.tagline || undefined, synopsis: f.synopsis || undefined, genres: f.genres || undefined, runtime: d.runtime || undefined,
      format: d.format || undefined, type: d.type || undefined, slug: f.slug,
    };
  }).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title, 'es'));
}

export default { init, filmsFromFichas };
