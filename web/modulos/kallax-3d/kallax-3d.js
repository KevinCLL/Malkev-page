// Kallax 3D · módulo autónomo para La Malkevnia
// Dos Kallax 5×5 con las cajas reales del inventario. Las cajas se cogen,
// vuelan hacia la cámara y abren su ficha.
//
//   import { init } from './kallax-3d.js';
//   const k = init(scene, { camera, domElement });   // dentro de otra escena
//   const k = init(document.getElementById('app'));  // demo autónoma
//   ...cada frame: k.update(dt)   ·   al salir: k.dispose()
//
// Requiere que 'three' resuelva a three@0.160.x (import map).

import * as THREE from 'three';
import DEFAULT_DATA from './kallax-data.js';

// ───────────────────────────── medidas reales (metros)
const KW = 1.82, KH = 1.82, KD = 0.39;      // Kallax 5×5
const T = 0.038, TI = 0.016;                 // tablero exterior / divisiones
const CELL = (KW - 2 * T - 4 * TI) / 5;      // ≈ 0.336
const GAP = 0.05;                            // separación entre las dos Kallax
const FRONT = KD / 2;

// ───────────────────────────── utilidades
const hash = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const ord = (n, f) => `${n}${f ? 'ª' : 'º'}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ───────────────────────────── colores de caja
const KNOWN = [
  [/^azul$/i, '#1f6fb8'], [/twilight imperium/i, '#15121d'], [/gloomhaven/i, '#6a3b22'], [/^root/i, '#d9c08a'],
  [/scythe/i, '#7d6236'], [/spirit island/i, '#2e6a4f'], [/ark nova/i, '#2a6e8c'], [/nemesis/i, '#22252e'],
  [/^dune/i, '#c47a2c'], [/wingspan/i, '#9cc2d6'], [/splendor/i, '#cdb98f'], [/sagrada/i, '#3a2a6a'],
  [/cthulhu/i, '#17271f'], [/vampiro|mascarada|gehena|linajes|malkavian|requiem|réquiem/i, '#5a0d14'],
  [/mago/i, '#33266a'], [/hombre lobo|apocalipsis/i, '#3d4a2a'], [/degenesis/i, '#b3a582'], [/d&d|strahd/i, '#7a1c1c'],
  [/anima|gaïa|exxet/i, '#2c3e6b'], [/battlestar/i, '#2a2e36'], [/batman/i, '#1c1f2a'], [/star wars/i, '#141414'],
  [/catan/i, '#c0392b'], [/harry potter/i, '#6b1d1d'], [/dead of winter/i, '#6f8291'], [/ubongo/i, '#e2a32a'],
  [/virus/i, '#3aa04a'], [/tabú/i, '#e3a21a'], [/jenga/i, '#6b3fa0'], [/guerra del anillo/i, '#3b2a1c'],
  [/spartacus/i, '#8c1e1e'], [/battletech/i, '#3a3f2a'], [/street fighter/i, '#d8a21c'], [/totoro/i, '#5f8f4e'],
  [/onitama/i, '#c9b48a'], [/santorini/i, '#2f8fc9'], [/gipf|tzaar|zèrtz|dvonn|pünct|yinsh|lyngk|matrx|tamsk/i, '#d9d4c6'],
  [/7 wonders/i, '#c8a35a'], [/secret hitler/i, '#c7652a'], [/subbuteo/i, '#1c3f8a'], [/fanhunter|fanpiro/i, '#d0402a'],
  [/eclipse phase/i, '#1b2b33'], [/alien/i, '#1d2622'], [/mundodisco/i, '#2b4c8a'], [/aquelarre/i, '#5c3a1e'],
  [/cthulhu|de profundis/i, '#203328'], [/oceans/i, '#1a5b8a'], [/underwater/i, '#1f6e7a'], [/on mars/i, '#b2482a'],
  [/seti/i, '#151a3a'], [/bios/i, '#4a6b3a'], [/high frontier/i, '#1e2440'], [/oath/i, '#3e4a6a'],
  [/too many bones/i, '#6a2a2a'], [/potion/i, '#5a3a8a'], [/el dorado/i, '#d9a040'], [/canvas/i, '#ece3d2'],
  [/decrypto/i, '#1d2c3a'], [/wavelength/i, '#2c3e8a'], [/dropmix/i, '#e04a8a'], [/mr\. jack/i, '#3a2a22'],
  [/captain sonar|sonar/i, '#1f4f7a'], [/ciudadelas/i, '#6a2a5a'], [/regicide/i, '#2a2a2a'], [/parade/i, '#e8d9b8'],
];
const WORDS = [
  [/azul brillante/i, '#2a8cff'], [/azul marino/i, '#1d2a55'], [/azul oscuro/i, '#1f2b5e'], [/rayas pastel/i, '#f2c6a0'],
  [/calavera mexicana/i, '#2d5fa8'], [/libro antiguo/i, '#c9b07a'], [/metal oxidado/i, '#7a4a2c'], [/negra y dorada/i, '#17130c'],
  [/roj[ao]s?/i, '#b8323a'], [/azul/i, '#2f5fb3'], [/amarill[ao]/i, '#e0b12a'], [/negr[ao]|oscur[ao]/i, '#1b1a22'],
  [/morad[ao]/i, '#5b2d8a'], [/blanc[ao]/i, '#e6e2ec'], [/verde/i, '#2f7a4d'], [/gris/i, '#6d6d78'], [/madera/i, '#8a5a33'],
  [/cartón/i, '#b48a5a'], [/precintad/i, '#cfcad6'],
];
function boxColor(name) {
  for (const [re, c] of WORDS) if (re.test(name) && /caja|libro|cajita|mazo|suplementos|lomo/i.test(name)) return new THREE.Color(c);
  for (const [re, c] of KNOWN) if (re.test(name)) return new THREE.Color(c);
  const r = rng(hash(name));
  return new THREE.Color().setHSL(r(), .28 + r() * .35, .22 + r() * .32);
}

// ───────────────────────────── tamaños
const BIG = /guerra del anillo \(2|rebellion|twilight imperium \(|gloomhaven|^nemesis$|^nemesis: (lockdown|represalia)$|^cthulhu wars$|batman: gotham city chronicles$|^spirit island$|^ark nova$|^root$|^scythe$|^battlestar galactica$|^vampiro: chapters$|spartacus|^dead of winter$|high frontier|^on mars$|^underwater cities$|^oath$|^seti$|glorantha|song of ice|dune \(gale|street fighter|stationfall|twilight struggle|sekigahara|battletech|subbuteo|automaton|canvas|metal gear|dropmix|insectos guerreros|cartón grande|nemesis: terrain|scythe \(|monkey palace/i;
const SMALL = /pocket|duel|mindbug|regicide|parade|two rooms|lovecraft letter|secret hitler|mascarade|bang|hombre lobo: (art|edi)|human punishment|virus|^set$|^tak|onitama|taco|decrypto|sospechosos|fun facts|dobble|geistesblitz|brain games|strike|klüster|cocoslocos|tuki|magic mandala|ice game|burger|kling|nictofobia|cajita|mazo|pequeña|^onus!$|^qe$|tabú|fog of love|kelp|cold case|rayas pastel|calavera|libro antiguo|caja amarilla$|devir|caja roja \(|azul brillante|sound box|imagine|macedonia|tragedy|not alone|cryptid|caja azul de pie|hormigas|magic maze|escuela de ping|garabatos|windward|snitch|mr\. jack|alice|bucle|cajitas|morada de pie|that time|double 12|gipf|tzaar|zèrtz|dvonn|pünct|yinsh|lyngk|matrx|tamsk|reversi|help arrives|scope|tail feathers \(|caja negra fina|primigenio|kurosuke|madera \(encima/i;
const THIN = /fina|fino|finos|pantalla|legión|suplementos|map$|mapas|mazo/i;
const LONG = /alargada|onus!|scope|sekigahara|help arrives|twilight struggle/i;

function dimsFor(item, orient, inBooks) {
  const n = item.name, r = rng(hash(n + orient));
  const size = BIG.test(n) ? 'big' : SMALL.test(n) ? 'small' : 'mid';
  if (orient === 'book') {
    let w = /suplementos|pantalla|legión|barcelofia|fanpiro|fino/i.test(n) ? .01 + r() * .006 : /d&d|anima|degenesis: (atlas|punk)|mundo de tinieblas|20º|eclipse|savage worlds: libro|llamada|runequest|alien|dominus|arcana|gaïa|strahd|monstruos/i.test(n) ? .03 + r() * .012 : .019 + r() * .012;
    return { w, h: .262 + r() * .04, d: .2 + r() * .03 };
  }
  if (orient === 'stand') {
    if (/gipf|tzaar|zèrtz|dvonn|pünct|yinsh|lyngk|matrx/i.test(n)) return { w: .052, h: .21, d: .21 };
    if (inBooks) return dimsFor(item, 'book');
    const s = size === 'big' ? { w: .1, h: .3, d: .3 } : size === 'small' ? { w: .05, h: .2, d: .19 } : { w: .07, h: .28, d: .28 };
    return { w: s.w * (.9 + r() * .2), h: s.h, d: s.d };
  }
  if (orient === 'front') {
    if (/gloomhaven/i.test(n)) return { w: .31, h: .31, d: .19 };
    const s = size === 'small' ? { w: .13, h: .18, d: .05 } : { w: .27, h: .27, d: .07 };
    return s;
  }
  // tumbada
  let w, d, h;
  if (size === 'big') { w = .3 + r() * .02; d = .29 + r() * .02; h = .09 + r() * .03; }
  else if (size === 'small') { w = .14 + r() * .07; d = .12 + r() * .07; h = .035 + r() * .025; }
  else { w = .26 + r() * .04; d = .25 + r() * .04; h = .06 + r() * .025; }
  if (LONG.test(n)) { w = .31; d = .16 + r() * .04; }
  if (THIN.test(n)) h *= .45;
  if (/historias no contadas/i.test(n)) { w = .21; d = .28; h = .03; }
  return { w, h, d };
}

// ───────────────────────────── atlas de lomos
class Atlas {
  constructor() { this.pages = []; this.SW = 256; this.SH = 48; this.S = 2048; }
  _page() {
    const c = document.createElement('canvas'); c.width = c.height = this.S;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: .62, metalness: .05 });
    const p = { c, g: c.getContext('2d'), tex, mat, n: 0, cap: Math.floor(this.S / this.SW) * Math.floor(this.S / this.SH) };
    this.pages.push(p); return p;
  }
  add(item, color) {
    let p = this.pages[this.pages.length - 1];
    if (!p || p.n >= p.cap) p = this._page();
    const per = Math.floor(this.S / this.SW), i = p.n++;
    const x = (i % per) * this.SW, y = Math.floor(i / per) * this.SH;
    drawSpine(p.g, x, y, this.SW, this.SH, item, color);
    const S = this.S;
    return { page: p, u0: (x + 10) / S, u1: (x + this.SW - 2) / S, vT: 1 - (y + 2) / S, vB: 1 - (y + this.SH - 2) / S, su: (x + 4) / S, sv: 1 - (y + this.SH / 2) / S };
  }
  dispose() { for (const p of this.pages) { p.tex.dispose(); p.mat.dispose(); } }
}

function lum(c) { return .2126 * c.r + .7152 * c.g + .0722 * c.b; }
function drawSpine(g, x, y, w, h, item, color) {
  const r = rng(hash(item.name));
  const base = '#' + color.getHexString();
  g.fillStyle = base; g.fillRect(x, y, w, h);
  const light = lum(color) > .45;
  // variación: bandas, degradado, filete
  const grad = g.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, 'rgba(255,255,255,.10)'); grad.addColorStop(.5, 'rgba(255,255,255,0)'); grad.addColorStop(1, 'rgba(0,0,0,.22)');
  g.fillStyle = grad; g.fillRect(x + 8, y, w - 8, h);
  const style = Math.floor(r() * 4);
  const accent = new THREE.Color().setHSL((color.getHSL({}).h + .45 + r() * .2) % 1, .55, light ? .3 : .68);
  g.fillStyle = '#' + accent.getHexString();
  if (style === 0) { g.fillRect(x + 8, y + 3, w - 10, 2); g.fillRect(x + 8, y + h - 5, w - 10, 2); }
  else if (style === 1) g.fillRect(x + 8, y, 26, h);
  else if (style === 2) g.fillRect(x + w - 34, y, 32, h);
  else { g.globalAlpha = .35; for (let k = 0; k < 6; k++) g.fillRect(x + 14 + k * 40, y, 14, h); g.globalAlpha = 1; }
  // título
  let t = item.name;
  g.fillStyle = light ? '#17121f' : '#f4efff';
  g.textBaseline = 'middle'; g.textAlign = 'center';
  let fs = 22; const maxW = w - 54;
  const font = (s) => `600 ${s}px "Segoe UI", system-ui, sans-serif`;
  g.font = font(fs);
  while (g.measureText(t).width > maxW && fs > 12) { fs--; g.font = font(fs); }
  if (g.measureText(t).width > maxW) { while (g.measureText(t + '…').width > maxW && t.length > 3) t = t.slice(0, -1); t += '…'; }
  g.fillText(t, x + 8 + (w - 8) / 2 + (style === 1 ? 12 : style === 2 ? -12 : 0), y + h / 2 + 1);
  // pegatina de color
  if (item.dot) {
    const cx = x + w - 16, cy = y + h / 2;
    g.fillStyle = ['#ff5b8a', '#ffd23f', '#3fd6ff', '#7dff8a'][hash(item.dot) % 4];
    g.beginPath(); g.arc(cx, cy, 11, 0, 7); g.fill();
    g.fillStyle = '#1b1426'; g.font = font(item.dot.length > 2 ? 9 : 13); g.fillText(item.dot, cx, cy + 1);
  }
  // borde de color sólido a la izquierda (para las caras lisas)
  g.fillStyle = base; g.fillRect(x, y, 9, h);
}

function wrap(g, text, maxW) {
  const words = text.split(' '), lines = []; let cur = '';
  for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
function coverTexture(item, color, aspect) {
  const W = 512, H = Math.round(512 / aspect);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const r = rng(hash(item.name + 'cover'));
  const hsl = color.getHSL({});
  const g1 = g.createLinearGradient(0, 0, W, H);
  g1.addColorStop(0, '#' + color.clone().offsetHSL(0, 0, .12).getHexString());
  g1.addColorStop(1, '#' + color.clone().offsetHSL(.04, 0, -.12).getHexString());
  g.fillStyle = g1; g.fillRect(0, 0, W, H);
  const acc = new THREE.Color().setHSL((hsl.h + .5) % 1, .6, hsl.l > .45 ? .3 : .7);
  g.strokeStyle = g.fillStyle = '#' + acc.getHexString();
  const motif = Math.floor(r() * 5);
  g.globalAlpha = .28;
  if (motif === 0) for (let i = 0; i < 9; i++) { g.lineWidth = 2 + r() * 6; g.beginPath(); g.arc(W * r(), H * r(), 30 + r() * 180, 0, 7); g.stroke(); }
  else if (motif === 1) for (let i = 0; i < 14; i++) { g.save(); g.translate(W / 2, H / 2); g.rotate(i / 14 * Math.PI * 2); g.fillRect(0, -6, W, 12); g.restore(); }
  else if (motif === 2) { for (let i = 0; i < 160; i++) { g.beginPath(); g.arc(W * r(), H * r(), r() * 2.4, 0, 7); g.fill(); } g.globalAlpha = .5; g.beginPath(); g.arc(W * .7, H * .35, H * .22, 0, 7); g.fill(); }
  else if (motif === 3) { const s = 46; for (let yy = 0; yy < H + s; yy += s * .86) for (let xx = 0; xx < W + s; xx += s) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.lineTo(xx + ((yy / (s * .86)) % 2 ? s / 2 : 0) + Math.cos(a) * s * .5, yy + Math.sin(a) * s * .5); } g.closePath(); g.lineWidth = 2; g.stroke(); } }
  else { for (let i = 0; i < 7; i++) { g.lineWidth = 10 + r() * 30; g.beginPath(); g.moveTo(-20, H * r()); g.bezierCurveTo(W * .3, H * r(), W * .7, H * r(), W + 20, H * r()); g.stroke(); } }
  g.globalAlpha = 1;
  // marco
  g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,.18)'; g.strokeRect(14, 14, W - 28, H - 28);
  // título
  const light = lum(color) > .45;
  const title = item.name.split(':');
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  let fsz = title[0].length > 18 ? 46 : 58; if (aspect < .5) fsz = 34;
  g.font = `700 ${fsz}px "Segoe UI", system-ui, sans-serif`;
  let lines = wrap(g, title[0].trim(), W - 70);
  while (lines.length > 4 && fsz > 24) { fsz -= 4; g.font = `700 ${fsz}px "Segoe UI", system-ui, sans-serif`; lines = wrap(g, title[0].trim(), W - 70); }
  const lh = fsz * 1.08;
  let yy = H * .42 - (lines.length - 1) * lh / 2;
  g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 12;
  g.fillStyle = light ? '#16111e' : '#fbf8ff';
  for (const l of lines) { g.fillText(l, W / 2, yy); yy += lh; }
  if (title[1]) { g.font = `500 28px "Segoe UI", system-ui, sans-serif`; for (const l of wrap(g, title.slice(1).join(':').trim(), W - 90)) { g.fillText(l, W / 2, yy + 6); yy += 34; } }
  g.shadowBlur = 0;
  g.font = '500 16px ui-monospace, monospace'; g.globalAlpha = .7;
  g.fillText('CARGA DE LA MALKEVNIA · ' + (item.code || ''), W / 2, H - 30);
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

// UVs de BoxGeometry: caras +x,-x,+y,-y,+z,-z; 4 vértices por cara: (0,1)(1,1)(0,0)(1,0)
function mapBoxUV(geo, slot, spineFace, rotated) {
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k, u = uv.getX(i), v = uv.getY(i);
    if (f === spineFace) {
      if (rotated) uv.setXY(i, slot.u0 + v * (slot.u1 - slot.u0), slot.vB + (1 - u) * (slot.vT - slot.vB));
      else uv.setXY(i, slot.u0 + u * (slot.u1 - slot.u0), slot.vB + v * (slot.vT - slot.vB));
    } else uv.setXY(i, slot.su, slot.sv);
  }
  uv.needsUpdate = true;
}

// ───────────────────────────── props (lo que no es un juego)
function makeProp(name, mats) {
  const g = new THREE.Group();
  const M = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: .8, ...o }); mats.push(m); return m; };
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  let dims = { w: .2, h: .1, d: .2 };
  if (/tele/i.test(name)) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 288; const x = c.getContext('2d');
    const gr = x.createRadialGradient(330, 120, 10, 300, 140, 380); gr.addColorStop(0, '#6d3bd1'); gr.addColorStop(.45, '#26104f'); gr.addColorStop(1, '#07040f');
    x.fillStyle = gr; x.fillRect(0, 0, 512, 288); const rr = rng(7);
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(255,255,255,${rr() * .9})`; x.fillRect(rr() * 512, rr() * 288, rr() * 2, rr() * 2); }
    x.fillStyle = '#c9a8ff'; x.beginPath(); x.arc(120, 210, 60, 0, 7); x.fill(); x.fillStyle = '#26104f'; x.beginPath(); x.arc(140, 200, 56, 0, 7); x.fill();
    x.fillStyle = 'rgba(244,239,255,.85)'; x.font = '600 22px ui-monospace, monospace'; x.textAlign = 'center'; x.fillText('LA MALKEVNIA · EN RUTA', 256, 262);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }); mats.push(scr); g.userData.tex = tex;
    add(new THREE.BoxGeometry(.6, .36, .04), M(0x0d0b12, { roughness: .4, metalness: .4 }), 0, .23, 0);
    add(new THREE.PlaneGeometry(.58, .326), scr, 0, .23, .0205);
    add(new THREE.BoxGeometry(.18, .02, .12), M(0x0d0b12), 0, .01, 0); add(new THREE.BoxGeometry(.04, .06, .03), M(0x0d0b12), 0, .04, -.01);
    // gafas VR arriba
    const vr = new THREE.Group(); vr.position.set(.16, .48, .02);
    const vb = new THREE.Mesh(new THREE.BoxGeometry(.17, .09, .1), M(0xf1f0f5, { roughness: .35 })); vr.add(vb);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(.09, .012, 8, 24, Math.PI), M(0x2a2a33)); strap.rotation.x = Math.PI / 2; strap.position.z = -.05; vr.add(strap);
    g.add(vr);
    dims = { w: .62, h: .55, d: .14 }; g.userData.static = true;
  } else if (/peluche de gato/i.test(name)) {
    add(new THREE.SphereGeometry(.07, 24, 16), M(0xb9a6ff), 0, .07, 0).scale.set(1, .95, .9);
    add(new THREE.SphereGeometry(.055, 24, 16), M(0xf4f0ea), 0, .17, .01);
    for (const s of [-1, 1]) add(new THREE.ConeGeometry(.018, .035, 12), M(0xf4f0ea), s * .03, .22, .01).rotation.z = -s * .3;
    const helm = add(new THREE.SphereGeometry(.075, 24, 16), M(0xcfe8ff, { transparent: true, opacity: .25, roughness: .05, metalness: .2, depthWrite: false }), 0, .175, .01);
    helm.renderOrder = 2;
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(.008, 8, 8), M(0x221a2e), s * .02, .18, .06);
    dims = { w: .16, h: .25, d: .15 };
  } else if (/peluche/i.test(name)) {
    add(new THREE.SphereGeometry(.08, 24, 16), M(0xc2303a, { roughness: 1 }), 0, .08, 0).scale.set(1.05, .9, .9);
    add(new THREE.SphereGeometry(.06, 24, 16), M(0xc2303a, { roughness: 1 }), 0, .19, .01);
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(.022, 12, 8), M(0xa0222b, { roughness: 1 }), s * .045, .24, 0);
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(.009, 8, 8), M(0x111111), s * .02, .2, .065);
    dims = { w: .18, h: .27, d: .17 };
  } else if (/maletín/i.test(name)) {
    add(new THREE.BoxGeometry(.42, .3, .1), M(0x121116, { roughness: .45, metalness: .3 }), 0, .15, 0);
    add(new THREE.TorusGeometry(.04, .008, 8, 20, Math.PI), M(0x2a2830), 0, .3, 0);
    dims = { w: .44, h: .34, d: .11 };
  } else if (/estuche/i.test(name)) {
    const big = /morado/i.test(name);
    const w = big ? .62 : .2, d = big ? .3 : .12, h = big ? .06 : .05;
    add(new THREE.BoxGeometry(w, h, d), M(big ? 0x5b2d8a : 0xb8323a, { roughness: .7 }), 0, h / 2, 0);
    add(new THREE.BoxGeometry(w * .98, .005, .004), M(0xd8d0e8, { metalness: .8, roughness: .3 }), 0, h * .55, d / 2);
    dims = { w, h, d };
  } else if (/mapas|pizarras/i.test(name)) {
    const n = /pizarras/i.test(name) ? 6 : 5;
    for (let i = 0; i < n; i++) add(new THREE.BoxGeometry(.008, .28, .26), M(/pizarras/i.test(name) ? 0xf2f2f6 : [0xd9c9a3, 0x6a4a8a, 0x2f5fb3][i % 3]), -n * .005 + i * .01, .14, 0).rotation.z = (i - n / 2) * .01;
    dims = { w: n * .01 + .01, h: .29, d: .26 };
  } else if (/casita/i.test(name)) {
    add(new THREE.BoxGeometry(.16, .14, .14), M(0x9a6a3e), 0, .07, 0);
    const roof = add(new THREE.CylinderGeometry(.11, .11, .17, 3, 1), M(0x6e4524), 0, .175, 0); roof.rotation.z = Math.PI / 2; roof.rotation.x = Math.PI / 2; roof.scale.set(1, 1, .55);
    add(new THREE.CircleGeometry(.025, 20), M(0x1a120a), 0, .085, .071);
    dims = { w: .2, h: .24, d: .16 };
  } else if (/bolsa/i.test(name)) {
    const c = /dados/i.test(name) ? 0x2a1d4a : 0x6b33a8;
    add(new THREE.SphereGeometry(.07, 20, 14), M(c, { roughness: 1 }), 0, .05, 0).scale.set(1, .7, 1);
    add(new THREE.CylinderGeometry(.015, .03, .04, 12), M(c, { roughness: 1 }), 0, .11, 0);
    dims = { w: .15, h: .13, d: .15 };
  } else if (/organizador/i.test(name)) {
    const wood = M(0xa8743f);
    add(new THREE.BoxGeometry(.34, .01, .22), wood, 0, .005, 0);
    for (const s of [-1, 1]) { add(new THREE.BoxGeometry(.01, .08, .22), wood, s * .165, .04, 0); add(new THREE.BoxGeometry(.34, .08, .01), wood, 0, .04, s * .105); }
    dims = { w: .34, h: .08, d: .22 };
  } else if (/soportes/i.test(name)) {
    const cs = [0x9b7bff, 0xff6ad5, 0x3fd6ff];
    for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(.02, .03, .06, 6), M(cs[i], { roughness: .5 }), -.05 + i * .05, .03, 0);
    dims = { w: .15, h: .06, d: .06 };
  } else if (/cajas blancas/i.test(name)) {
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(.035, .24, .22), M(0xeeeaf3), -.04 + i * .04, .12, 0);
    dims = { w: .13, h: .24, d: .22 };
  } else {
    add(new THREE.BoxGeometry(.15, .08, .12), M(0x444050), 0, .04, 0);
    dims = { w: .15, h: .08, d: .12 };
  }
  // pivotar desde la esquina inferior izquierda delantera para el layout
  g.userData.dims = dims;
  return g;
}

// ───────────────────────────── estilos de la interfaz
const CSS = `
.kx-ui{position:absolute;inset:0;pointer-events:none;font-family:"Segoe UI",system-ui,-apple-system,sans-serif;color:#efe8ff;z-index:5}
.kx-ui *{box-sizing:border-box}
.kx-tip{position:absolute;padding:5px 10px;border-radius:8px;background:rgba(20,12,40,.82);border:1px solid rgba(190,160,255,.35);font-size:13px;white-space:nowrap;transform:translate(14px,14px);backdrop-filter:blur(6px);display:none}
.kx-tip small{opacity:.65;margin-left:6px}
.kx-center{position:absolute;left:50%;bottom:16%;transform:translateX(-50%);padding:7px 14px;border-radius:999px;background:rgba(20,12,40,.75);border:1px solid rgba(190,160,255,.35);font-size:14px;display:none}
.kx-card{pointer-events:auto;position:absolute;top:16px;right:16px;bottom:16px;width:min(380px,calc(100% - 32px));overflow:auto;padding:22px 22px 18px;border-radius:18px;
 background:linear-gradient(160deg,rgba(43,26,84,.88),rgba(16,10,34,.92));border:1px solid rgba(190,160,255,.32);box-shadow:0 0 0 1px rgba(0,0,0,.3),0 20px 60px rgba(10,0,30,.6),inset 0 1px 0 rgba(255,255,255,.06);
 backdrop-filter:blur(12px);transform:translateX(30px);opacity:0;transition:opacity .35s,transform .35s;scrollbar-width:thin}
.kx-card.on{opacity:1;transform:none}
.kx-code{font:600 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.14em;color:#b9a2ff;opacity:.85}
.kx-card h2{margin:10px 0 6px;font-size:24px;line-height:1.15;font-weight:650;color:#fff}
.kx-chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 14px}
.kx-chip{font-size:12px;padding:3px 9px;border-radius:999px;background:rgba(155,123,255,.16);border:1px solid rgba(155,123,255,.35);color:#e3d8ff}
.kx-chip.dot{background:rgba(255,210,63,.14);border-color:rgba(255,210,63,.45);color:#ffe9a6}
.kx-chip.q{background:rgba(63,214,255,.12);border-color:rgba(63,214,255,.4);color:#bdefff}
.kx-row{margin:12px 0;font-size:14px;line-height:1.45;color:#d9cff2}
.kx-row b{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#a993e6;margin-bottom:3px;font-weight:600}
.kx-postit{display:inline-block;margin-top:4px;padding:10px 14px;background:#ffe873;color:#3a3012;border-radius:2px;transform:rotate(-1.5deg);box-shadow:0 6px 14px rgba(0,0,0,.35);font:500 15px/1.3 "Segoe Print","Comic Sans MS",cursive}
.kx-doubt{padding:10px 12px;border-radius:10px;background:rgba(63,214,255,.08);border:1px dashed rgba(63,214,255,.4)}
.kx-list{display:flex;flex-direction:column;gap:2px;margin-top:4px}
.kx-list button,.kx-res button{all:unset;cursor:pointer;padding:5px 8px;border-radius:7px;font-size:13.5px;color:#e6dcff}
.kx-list button:hover,.kx-list button:focus-visible,.kx-res button:hover,.kx-res button:focus-visible{background:rgba(155,123,255,.18)}
.kx-list button.cur{background:rgba(155,123,255,.28);color:#fff}
.kx-actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
.kx-btn{all:unset;cursor:pointer;padding:8px 14px;border-radius:10px;font-size:13.5px;background:rgba(155,123,255,.2);border:1px solid rgba(155,123,255,.45);color:#f1eaff}
.kx-btn:hover,.kx-btn:focus-visible{background:rgba(155,123,255,.34)}
.kx-btn.main{background:#8f6cff;border-color:#a98bff;color:#fff}
.kx-hint{margin-top:12px;font-size:12px;opacity:.55}
.kx-search{pointer-events:auto;position:absolute;left:16px;top:16px;width:min(320px,calc(100% - 32px));padding:14px;border-radius:16px;background:rgba(22,13,46,.78);border:1px solid rgba(190,160,255,.28);backdrop-filter:blur(10px)}
.kx-search h1{margin:0 0 2px;font-size:15px;font-weight:650;letter-spacing:.02em}
.kx-search p{margin:0 0 10px;font-size:12px;opacity:.7}
.kx-search input{width:100%;padding:9px 12px;border-radius:10px;border:1px solid rgba(190,160,255,.35);background:rgba(8,4,20,.6);color:#fff;font:inherit;font-size:14px;outline:none}
.kx-search input:focus{border-color:#a98bff;box-shadow:0 0 0 3px rgba(143,108,255,.25)}
.kx-filters{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.kx-filters button{all:unset;cursor:pointer;font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid rgba(155,123,255,.35);color:#d9ccff}
.kx-filters button[aria-pressed=true]{background:#8f6cff;color:#fff;border-color:#a98bff}
.kx-res{display:flex;flex-direction:column;margin-top:8px;max-height:240px;overflow:auto}
.kx-res small{opacity:.55;margin-left:6px;font-size:11.5px}
.kx-collapse{all:unset;cursor:pointer;position:absolute;right:12px;top:12px;font-size:12px;opacity:.6}
.kx-search.min .kx-body{display:none}
@media (max-width:720px){.kx-ui.picking .kx-search{display:none}.kx-card{top:auto;left:8px;right:8px;bottom:8px;width:auto;max-height:58%;transform:translateY(30px)}.kx-search{left:8px;top:8px;width:calc(100% - 16px)}}
`;

// ───────────────────────────── el módulo
export function init(target, opts = {}) {
  const standalone = target instanceof HTMLElement;
  const data = opts.data || DEFAULT_DATA;
  const disposables = [], mats = [], listeners = [];
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); listeners.push(() => el.removeEventListener(ev, fn, o)); };

  let renderer, scene, camera, dom, container, orbit, composer, raf, room;
  if (standalone) {
    container = target;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block'; renderer.domElement.style.touchAction = 'none';
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x07040f);
    scene.fog = new THREE.Fog(0x07040f, 7, 16);
    camera = new THREE.PerspectiveCamera(48, 1, .02, 60);
    dom = renderer.domElement;
    room = buildRoom(scene, mats, disposables);
    if (opts.createComposer) composer = opts.createComposer(renderer, scene, camera);
  } else {
    scene = target; camera = opts.camera; dom = opts.domElement;
    container = opts.uiContainer || dom?.parentElement || document.body;
    if (!camera) throw new Error('kallax-3d: en modo escena hace falta opts.camera');
  }
  const pointerMode = opts.pointer || (standalone ? 'mouse' : 'mouse'); // 'mouse' | 'center'
  const uiOn = opts.ui !== false;

  // ── grupo raíz
  const root = new THREE.Group(); root.name = 'kallax-3d';
  if (opts.position) root.position.copy(opts.position);
  if (opts.rotationY) root.rotation.y = opts.rotationY;
  if (opts.scale) root.scale.setScalar(opts.scale);
  scene.add(root);

  const kallaxMat = new THREE.MeshStandardMaterial({ color: opts.kallaxColor ?? 0xe8e2f2, roughness: .72, metalness: 0 }); mats.push(kallaxMat);
  const backMat = new THREE.MeshStandardMaterial({ color: 0xcfc8dc, roughness: .9 }); mats.push(backMat);
  const orgMat = new THREE.MeshStandardMaterial({ color: 0x2b2140, roughness: .7 }); mats.push(orgMat);
  const barMat = new THREE.MeshStandardMaterial({ color: 0x9a92ad, roughness: .35, metalness: .8 }); mats.push(barMat);
  const ledColor = new THREE.Color(opts.ledColor ?? 0xb08cff);
  const ledMat = new THREE.MeshBasicMaterial({ color: ledColor.clone().multiplyScalar(1.15), toneMapped: false }); mats.push(ledMat);
  const postitMat = new THREE.MeshStandardMaterial({ color: 0xffe873, roughness: .9, side: THREE.DoubleSide }); mats.push(postitMat);
  const atlas = new Atlas();
  const boxes = new THREE.BoxGeometry(1, 1, 1); disposables.push(boxes);

  const items = [];      // { id, name, kallax, cell, mesh, ... }
  const pickables = [];


  function cellRect(r1, r2, c1, c2) {
    const x0 = -KW / 2 + T + (c1 - 1) * (CELL + TI), x1 = -KW / 2 + T + (c2 - 1) * (CELL + TI) + CELL;
    const yTop = KH - T - (r1 - 1) * (CELL + TI), y0 = KH - T - (r2 - 1) * (CELL + TI) - CELL;
    return { x0, x1, y0, y1: yTop };
  }
  function inMerged(merged, r, c) { return merged.find((m) => r >= m.rows[0] && r <= m.rows[1] && c >= m.cols[0] && c <= m.cols[1]); }
  function box(parent, w, h, d, x, y, z, mat) { const m = new THREE.Mesh(boxes, mat); m.scale.set(w, h, d); m.position.set(x, y, z); parent.add(m); return m; }

  function buildFrame(kg, merged) {
    box(kg, KW, T, KD, 0, T / 2, 0, kallaxMat); box(kg, KW, T, KD, 0, KH - T / 2, 0, kallaxMat);
    box(kg, T, KH, KD, -KW / 2 + T / 2, KH / 2, 0, kallaxMat); box(kg, T, KH, KD, KW / 2 - T / 2, KH / 2, 0, kallaxMat);
    box(kg, KW - 2 * T, KH - 2 * T, .006, 0, KH / 2, -KD / 2 + .003, backMat);
    for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) {
      const rc = cellRect(r, r, c, c);
      // divisor vertical a la derecha de (r,c)
      if (c < 5) {
        const m1 = inMerged(merged, r, c), m2 = inMerged(merged, r, c + 1);
        if (!(m1 && m1 === m2)) box(kg, TI, CELL + 2 * TI, KD - .006, rc.x1 + TI / 2, (rc.y0 + rc.y1) / 2, .003, kallaxMat);
        else if (m1.bar) box(kg, .012, CELL + TI, .012, rc.x1 + TI / 2, (rc.y0 + rc.y1) / 2, -KD / 2 + .03, barMat);
      }
      // balda horizontal por debajo de (r,c)
      if (r < 5) {
        const m1 = inMerged(merged, r, c), m2 = inMerged(merged, r + 1, c);
        if (!(m1 && m1 === m2)) box(kg, CELL + TI * (c < 5 ? 1 : 0) + .001, TI, KD - .006, (rc.x0 + rc.x1) / 2 + (c < 5 ? TI / 2 : 0), rc.y0 - TI / 2, .003, kallaxMat);
      }
    }
    // tiras LED bajo cada techo de cubo, en el borde delantero
    for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) {
      const m = inMerged(merged, r, c);
      if (m && (r !== m.rows[0] || c !== m.cols[0])) continue;
      const rc = m ? cellRect(m.rows[0], m.rows[1], m.cols[0], m.cols[1]) : cellRect(r, r, c, c);
      box(kg, rc.x1 - rc.x0 - .03, .004, .008, (rc.x0 + rc.x1) / 2, rc.y1 - .003, FRONT - .02, ledMat);
    }
  }

  // ── colocación de grupos
  const shelfLabel = (k) => ['la de arriba', '2ª', '3ª', '4ª'][k] || `${k + 1}ª`;
  function placeCell(kg, kd, ki, cell) {
    let region;
    if (cell.top) region = { x0: -KW / 2 + .02, x1: KW / 2 - .02, y0: KH, y1: KH + .62 };
    else { const rc = cellRect(cell.rows[0], cell.rows[1], cell.cols[0], cell.cols[1]); region = { x0: rc.x0 + .004, x1: rc.x1 - .004, y0: rc.y0, y1: rc.y1 - .006 }; }
    const where = { kallax: kd.name, nick: kd.nick, ki, label: cell.top ? 'Encima' : cell.label.replace(/ \(.*\)$/, ''), cellKey: `${ki}:${cell.label}`, books: !!cell.books };
    const code = `K${ki + 1}·${cell.top ? 'TOP' : `F${cell.rows[0]}${cell.rows[1] !== cell.rows[0] ? '-' + cell.rows[1] : ''}C${cell.cols[0]}${cell.cols[1] !== cell.cols[0] ? '-' + cell.cols[1] : ''}`}`;
    const ctx = { kg, where, code, n: 0 };
    if (cell.empty) return;
    if (cell.shelves) {
      const ow = cell.beside ? (region.x1 - region.x0) * .64 : region.x1 - region.x0;
      const ox0 = region.x0, ox1 = region.x0 + ow;
      const H = region.y1 - region.y0, sh = .008, bh = (H - 3 * sh) / 4;
      // estructura del organizador
      for (const x of [ox0 + .004, ox1 - .004]) box(kg, .008, H, KD - .05, x, region.y0 + H / 2, .02, orgMat);
      for (let k = 1; k < 4; k++) box(kg, ow, sh, KD - .05, (ox0 + ox1) / 2, region.y1 - k * (bh + sh) + sh / 2, .02, orgMat);
      cell.shelves.forEach((groups, k) => {
        const y1 = region.y1 - k * (bh + sh), y0 = y1 - bh;
        layout(groups, { x0: ox0 + .01, x1: ox1 - .01, y0, y1: y1 - .002 }, { ...ctx, sub: `balda ${k + 1} del organizador (${shelfLabel(k)})` });
      });
      if (cell.beside) layout(cell.beside, { x0: ox1 + .008, x1: region.x1, y0: region.y0, y1: region.y1 }, { ...ctx, sub: 'al lado del organizador' });
    } else layout(cell.groups, region, ctx);
  }

  function natural(g, books) {
    // devuelve una copia con medidas naturales
    const isProp = (it) => it.prop;
    if (g.type === 'stack') { const ds = g.items.map((it) => isProp(it) ? { w: .2, h: .05, d: .2 } : dimsFor(it, 'flat')); return { ds, w: Math.max(...ds.map((d) => d.w)), h: ds.reduce((a, d) => a + d.h, 0) }; }
    if (g.type === 'standing') { const ds = g.items.map((it) => dimsFor(it, books ? 'book' : 'stand', books)); return { ds, w: ds.reduce((a, d) => a + d.w, 0) + .002 * ds.length, h: Math.max(...ds.map((d) => d.h)) }; }
    if (g.type === 'front') { const ds = [dimsFor(g.items[0], 'front')]; return { ds, w: ds[0].w, h: ds[0].h }; }
    if (g.type === 'prop' || g.items[0].prop) { return { prop: true, ds: [null], w: 0, h: 0 }; }
    const ds = [dimsFor(g.items[0], 'flat')]; return { ds, w: ds[0].w, h: ds[0].h };
  }

  function layout(groups, region, ctx, depth = 0) {
    if (!groups.length) return 0;
    const books = ctx.where.books;
    const nat = groups.map((g) => {
      const n = natural(g, books);
      if (n.prop) { const pg = makeProp(g.items[0].name, mats); n.propObj = pg; n.w = pg.userData.dims.w; n.h = pg.userData.dims.h; n.ds = [pg.userData.dims]; }
      return n;
    });
    const avail = region.x1 - region.x0;
    const flowIdx = groups.map((g, i) => g.cover ? -1 : i).filter((i) => i >= 0);
    const totalW = flowIdx.reduce((a, i) => a + nat[i].w, 0) + .006 * (flowIdx.length - 1);
    const sx = Math.min(1, avail / totalW);
    // altura: escala vertical si no cabe
    const availH = region.y1 - region.y0;
    let sy = 1;
    const est = (i) => nat[i].h + estimateOn(groups[i].on, books);
    const maxH = Math.max(...flowIdx.map(est), 0) + groups.filter((g) => g.cover).reduce((a, g, i) => a + .06, 0);
    if (maxH > availH) sy = availH / maxH;
    const leftover = avail - totalW * sx;
    const gap = Math.min(.03, leftover / (flowIdx.length + 1));
    let x = region.x0 + gap * (depth ? .5 : 1) + (depth ? 0 : Math.max(0, leftover - gap * (flowIdx.length + 1)) * .5);
    let topAll = region.y0;
    groups.forEach((g, i) => {
      const n = nat[i];
      if (g.cover) {
        // tumbada por encima de todo lo anterior
        const d = n.ds[0]; const w = Math.min(d.w, avail);
        const gx0 = region.x0 + (avail - w) / 2;
        placeItem(g.items[0], { w, h: d.h * sy, d: d.d }, gx0, topAll, ctx, { kind: 'flat', desc: 'tumbada por encima de todo lo anterior' });
        topAll += d.h * sy;
        return;
      }
      const gw = n.w * sx;
      let top = region.y0;
      if (g.type === 'stack') {
        let y = region.y0;
        g.items.forEach((it, k) => {
          const d = n.ds[k]; const w = d.w * sx, dd = Math.min(d.d, KD - .03);
          placeItem(it, { w, h: d.h * sy, d: dd }, x + (gw - w) / 2, y, ctx, { kind: 'flat', desc: `pila, ${ord(k + 1, true)} empezando por abajo`, jitter: true });
          y += d.h * sy;
        });
        top = y;
      } else if (g.type === 'standing') {
        let xx = x;
        g.items.forEach((it, k) => {
          const d = n.ds[k]; const w = d.w * sx, h = Math.min(d.h, availH - .004);
          placeItem(it, { w, h, d: Math.min(d.d, KD - .03) }, xx, region.y0, ctx, { kind: books || d.w < .045 ? 'book' : 'stand', desc: `de pie, ${ord(k + 1)} por la izquierda` });
          xx += w + .002 * sx;
          top = Math.max(top, region.y0 + h);
        });
      } else if (g.type === 'front') {
        const d = n.ds[0]; const w = d.w * sx, h = Math.min(d.h, availH - .004);
        placeItem(g.items[0], { w, h, d: d.d }, x, region.y0, ctx, { kind: 'front', desc: 'de frente' });
        top = region.y0 + h;
      } else if (n.prop) {
        const pg = n.propObj; const s = Math.min(1, gw / n.w, availH / n.h);
        pg.scale.setScalar(s);
        pg.position.set(x + gw / 2, region.y0, FRONT - .03 - n.ds[0].d * s / 2);
        ctx.kg.add(pg);
        const it = g.items[0];
        const rec = registerItem(it, ctx, { kind: 'prop', desc: '' }, pg);
        pg.traverse((o) => { if (o.isMesh) { o.userData.kx = rec; pickables.push(o); } });
        top = region.y0 + n.h * s;
        if (g.on.length) top += 0;
      } else {
        const d = n.ds[0]; const w = d.w * sx;
        placeItem(g.items[0], { w, h: d.h * sy, d: Math.min(d.d, KD - .03) }, x + (gw - w) / 2, region.y0, ctx, { kind: 'flat', desc: depth ? 'tumbada encima' : 'tumbada' });
        top = region.y0 + d.h * sy;
      }
      if (g.on.length) {
        const r2 = { x0: x, x1: x + Math.max(gw, .12), y0: top, y1: Math.max(region.y1, top + .05) };
        top = layout(g.on, r2, { ...ctx, sub: (ctx.sub ? ctx.sub + ' · ' : '') + 'encima de la pila' }, depth + 1);
      }
      topAll = Math.max(topAll, top);
      x += gw + gap;
    });
    return topAll;
  }
  function estimateOn(on, books) {
    if (!on || !on.length) return 0;
    return Math.max(...on.map((g) => { const n = natural(g, books); return (n.prop ? .1 : n.h) + estimateOn(g.on, books); }));
  }

  function registerItem(it, ctx, pos, obj) {
    const idx = ++ctx.n;
    const rec = {
      id: `${ctx.code}-${String(idx).padStart(2, '0')}`, name: it.name, prop: !!it.prop, postit: it.postit || null, dot: it.dot || null,
      doubt: it.doubt || null, doubtText: it.doubtText || null, book: ctx.where.books && !it.prop,
      kallax: ctx.where.kallax, kallaxNick: ctx.where.nick, cell: ctx.where.label, cellKey: ctx.where.cellKey,
      place: [ctx.sub, pos.desc].filter(Boolean).join(' · '), code: ctx.code, kind: pos.kind, object: obj,
    };
    it.code = rec.id;
    items.push(rec); return rec;
  }

  function placeItem(it, d, x0, y0, ctx, pos) {
    if (it.prop) { // un prop tumbado (estuche) dentro de una pila
      const pg = makeProp(it.name, mats); const pd = pg.userData.dims; const s = Math.min(1, d.w / pd.w);
      pg.scale.setScalar(s); pg.position.set(x0 + d.w / 2, y0, FRONT - .03 - pd.d * s / 2); ctx.kg.add(pg);
      const rec = registerItem(it, ctx, { kind: 'prop', desc: pos.desc }, pg);
      pg.traverse((o) => { if (o.isMesh) { o.userData.kx = rec; pickables.push(o); } });
      return;
    }
    const color = boxColor(it.name);
    const rec = registerItem(it, ctx, pos, null);
    const slot = atlas.add({ ...it, name: it.name }, color);
    let gw, gh, gd, spineFace = 4, rotated = false, coverFace = 2;
    if (pos.kind === 'flat') { gw = d.w; gh = d.h; gd = d.d; coverFace = 2; }
    else if (pos.kind === 'book' || pos.kind === 'stand') { gw = d.w; gh = d.h; gd = d.d; rotated = true; coverFace = 0; }
    else { gw = d.w; gh = d.h; gd = d.d; spineFace = 0; rotated = true; coverFace = 4; }
    const geo = new THREE.BoxGeometry(gw, gh, gd); mapBoxUV(geo, slot, spineFace, rotated); disposables.push(geo);
    const mesh = new THREE.Mesh(geo, slot.page.mat);
    const r = rng(hash(it.name + rec.id));
    const jx = pos.jitter ? (r() - .5) * .008 : 0;
    mesh.position.set(x0 + gw / 2 + jx, y0 + gh / 2, FRONT - .012 - gd / 2 - (pos.kind === 'book' ? r() * .01 : 0));
    mesh.rotation.y = pos.jitter ? (r() - .5) * .03 : (pos.kind === 'book' ? (r() - .5) * .01 : 0);
    ctx.kg.add(mesh);
    mesh.userData.kx = rec;
    Object.assign(rec, { mesh, color, coverFace, dims: { w: gw, h: gh, d: gd }, home: { p: mesh.position.clone(), q: mesh.quaternion.clone() } });
    pickables.push(mesh);
    if (pos.kind === 'front') ensureCover(rec);
    if (it.postit) {
      const flatK = pos.kind === 'flat', ph = flatK ? Math.min(.04, gh * .8) : .04, pw = flatK ? .045 : Math.min(.04, gw * .9);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), postitMat); disposables.push(p.geometry);
      p.position.set(flatK ? gw / 2 - .035 : 0, flatK ? 0 : gh / 2 - .05, gd / 2 + .0012); p.rotation.z = (r() - .5) * .25;
      mesh.add(p);
    }
  }

  // ── construir cada Kallax
  data.kallax.forEach((kd, ki) => {
    const kg = new THREE.Group();
    kg.position.x = (ki - (data.kallax.length - 1) / 2) * (KW + GAP);
    root.add(kg);
    const merged = kd.cells.filter((c) => c.merged);
    buildFrame(kg, merged);
    for (const cell of kd.cells) placeCell(kg, kd, ki, cell);
  });

  // ── relaciones para la ficha
  const byCell = new Map();
  for (const it of items) { if (!byCell.has(it.cellKey)) byCell.set(it.cellKey, []); byCell.get(it.cellKey).push(it); }
  const family = (it) => norm(it.name.split(/[:(–]/)[0].replace(/^(la|el|los|las)\s+/i, '').trim());
  for (const it of items) it.family = family(it);

  // ── resaltado
  const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)); disposables.push(edgeGeo);
  const edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0xd6bfff).multiplyScalar(2), toneMapped: false, transparent: true, opacity: .95 }); mats.push(edgeMat);
  const matchMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0x7fe6ff).multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: .8 }); mats.push(matchMat);
  const hoverEdge = new THREE.LineSegments(edgeGeo, edgeMat); hoverEdge.visible = false;
  const matchEdges = [];

  // ── estado de interacción
  const ray = new THREE.Raycaster(); ray.far = 8;
  const ndc = new THREE.Vector2(-9, -9);
  let hovered = null, picked = null, filterSet = null;
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4();
  const anims = new Map(); // rec -> { pull: 0..1 }
  const spin = { yaw: 0, pitch: 0, vy: 0, vp: 0 };
  let flyT = 0, flyDir = 0, flyFrom = null, flyFromQ = null;
  let time = 0;

  function slideOffset(rec) { return rec.kind === 'flat' || rec.kind === 'book' || rec.kind === 'stand' || rec.kind === 'front' ? 1 : 0; }

  function setHover(rec) {
    if (rec === hovered) return;
    hovered = rec;
    if (rec && rec.mesh && rec !== picked) { rec.mesh.add(hoverEdge); hoverEdge.scale.set(rec.dims.w + .004, rec.dims.h + .004, rec.dims.d + .004); hoverEdge.visible = true; }
    else hoverEdge.visible = false;
    opts.onHover?.(rec ? pub(rec) : null);
    ui?.hover(rec);
  }

  function presentQuat(rec, out) {
    // cara de la portada hacia la cámara
    const local = new THREE.Quaternion();
    if (rec.coverFace === 2) local.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    else if (rec.coverFace === 0) local.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
    const user = new THREE.Quaternion().setFromEuler(new THREE.Euler(spin.pitch, spin.yaw, 0, 'YXZ'));
    return camera.getWorldQuaternion(out).multiply(user).multiply(local);
  }
  function holdPoint(rec, out) {
    const m = Math.max(rec.dims.w, rec.dims.h, rec.dims.d);
    const vt = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), ht = vt * camera.aspect;
    const mobile = !!ui && container.clientWidth <= 720;
    const narrow = !!ui && !mobile;
    let dist = Math.max(m * 2.1 + .12, m / (ht * 2 * (mobile ? .8 : .5)));
    if (mobile) dist = Math.max(dist, m / (vt * 2 * .34));
    camera.getWorldDirection(out);
    const cq = camera.getWorldQuaternion(tmpQ);
    const right = tmpV.set(1, 0, 0).applyQuaternion(cq);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cq);
    const fovH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
    out.multiplyScalar(dist).add(camera.getWorldPosition(new THREE.Vector3()));
    if (narrow) out.addScaledVector(right, -fovH * camera.aspect * .28);
    else if (mobile) out.addScaledVector(up, fovH * .52);
    else out.addScaledVector(up, fovH * .1);
    return out;
  }

  function ensureCover(rec) {
    if (rec.coverMats) return;
    const { w, h, d } = rec.dims;
    const aspect = rec.coverFace === 2 ? w / d : rec.coverFace === 0 ? d / h : w / h;
    const tex = coverTexture(rec, rec.color, aspect); disposables.push(tex);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: .82 }); mats.push(m);
    const base = rec.mesh.material;
    rec.coverMats = [base, base, base, base, base, base]; rec.coverMats[rec.coverFace] = m;
    const faces = rec.coverFace === 0 ? [0, 1] : [rec.coverFace];
    if (rec.coverFace === 0) rec.coverMats[1] = m; // libro: contraportada igual
    const uv = rec.mesh.geometry.attributes.uv, U = [[0, 1], [1, 1], [0, 0], [1, 0]];
    for (const f of faces) for (let k = 0; k < 4; k++) uv.setXY(f * 4 + k, U[k][0], U[k][1]);
    uv.needsUpdate = true;
    rec.mesh.material = rec.coverMats;
  }

  function pick(rec) {
    if (!rec) return;
    if (picked && picked !== rec) { drop(true); }
    if (rec.mesh) {
      ensureCover(rec);
      picked = rec; flyDir = 1; flyT = 0; spin.yaw = spin.pitch = spin.vy = spin.vp = 0;
      flyFrom = null;
      hoverEdge.visible = false;
    } else { picked = rec; flyDir = 0; }
    ui?.open(rec);
    opts.onOpen?.(pub(rec));
  }
  function drop(silent) {
    if (!picked) return;
    const rec = picked;
    if (rec.mesh) {
      // volver: guardar desde dónde
      rec.returning = { t: 0, p: rec.mesh.position.clone(), q: rec.mesh.quaternion.clone() };
      returning.add(rec);
    }
    picked = null; flyDir = 0;
    if (!silent) { ui?.close(); opts.onClose?.(); }
  }
  const returning = new Set();

  // posición de "cajón abierto" en local
  function pulledPos(rec, amount, out) {
    out.copy(rec.home.p);
    out.z += amount * (rec.kind === 'flat' ? Math.min(.12, rec.dims.d * .45) : .05);
    return out;
  }

  // ── bucle
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pi = new THREE.Quaternion();
  function update(dt = 1 / 60) {
    dt = Math.min(dt, .1); time += dt;
    if (orbit) orbit.update(dt);
    if (pointerMode === 'center' && !picked) { ndc.set(0, 0); }
    // hover por raycast
    if (!picked && !dragging) {
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickables, false)[0];
      setHover(hit ? hit.object.userData.kx : null);
    }
    // tirar ligeramente de las cajas resaltadas / con hover
    for (const rec of items) {
      if (!rec.mesh || rec === picked || returning.has(rec)) continue;
      const want = (rec === hovered ? 1 : 0) * .55 + (filterSet && filterSet.has(rec) ? .35 : 0);
      const a = anims.get(rec) ?? 0;
      if (Math.abs(a - want) < .001 && a === 0) continue;
      const na = a + (want - a) * Math.min(1, dt * 10);
      anims.set(rec, na);
      pulledPos(rec, na, rec.mesh.position);
    }
    // caja cogida
    if (picked && picked.mesh) {
      const m = picked.mesh, par = m.parent;
      par.updateWorldMatrix(true, false);
      flyT = Math.min(1, flyT + dt / .75);
      // origen: la caja ya sacada del cubo
      if (!flyFrom) { const pp = pulledPos(picked, 1.6, new THREE.Vector3()); flyFrom = pp.applyMatrix4(par.matrixWorld); flyFromQ = par.getWorldQuaternion(new THREE.Quaternion()).multiply(picked.home.q); }
      spin.yaw += spin.vy * dt; spin.pitch += spin.vp * dt; spin.vy *= Math.pow(.04, dt); spin.vp *= Math.pow(.04, dt);
      if (!dragging) { spin.pitch += (0 - spin.pitch) * Math.min(1, dt * .8); }
      const target = holdPoint(picked, _p);
      target.y += Math.sin(time * 1.6) * .006;
      const q = presentQuat(picked, _q);
      q.multiply(_pi.setFromEuler(new THREE.Euler(Math.sin(time * .7) * .04, Math.sin(time * .5) * .06, 0)));
      const k = ease(flyT);
      // primero sale del cubo (0..0.3) y luego vuela
      let wp, wq;
      if (k < .25) {
        const s = k / .25;
        const local = pulledPos(picked, 1.6 * s, new THREE.Vector3());
        wp = local.applyMatrix4(par.matrixWorld);
        wq = par.getWorldQuaternion(new THREE.Quaternion()).multiply(picked.home.q);
      } else {
        const s = (k - .25) / .75;
        wp = flyFrom.clone().lerp(target, s); wp.y += Math.sin(s * Math.PI) * .05;
        wq = flyFromQ.clone().slerp(q, s);
      }
      // a local del padre
      m.position.copy(par.worldToLocal(wp));
      m.quaternion.copy(par.getWorldQuaternion(_wq).invert().multiply(wq));
    }
    for (const rec of [...returning]) {
      const m = rec.mesh, R = rec.returning;
      R.t = Math.min(1, R.t + dt / .6);
      const k = ease(R.t);
      const pulled = pulledPos(rec, 1.6, new THREE.Vector3());
      if (k < .75) { const s = k / .75; m.position.lerpVectors(R.p, pulled, s); m.quaternion.slerpQuaternions(R.q, rec.home.q, s); }
      else { const s = (k - .75) / .25; pulledPos(rec, 1.6 * (1 - s), m.position); m.quaternion.copy(rec.home.q); }
      if (R.t >= 1) { returning.delete(rec); m.position.copy(rec.home.p); anims.set(rec, 0); }
    }
    if (room) room.update(time);
    if (matchEdges.length) { const o = .55 + Math.sin(time * 3) * .3; matchMat.opacity = o; }
  }

  // ── punteros
  let dragging = false, down = null, lastX = 0, lastY = 0;
  function setNdcFromEvent(e) { const r = dom.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ui?.tipAt(e.clientX - r.left, e.clientY - r.top); }
  if (dom) {
    on(dom, 'pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now() }; lastX = e.clientX; lastY = e.clientY;
      if (picked && picked.mesh) { dragging = true; try { dom.setPointerCapture(e.pointerId); } catch {} }
    });
    on(dom, 'pointermove', (e) => {
      if (pointerMode === 'mouse' && e.pointerType === 'mouse') setNdcFromEvent(e);
      if (down && dragging && picked) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
        spin.yaw += dx * .01; spin.pitch = clamp(spin.pitch + dy * .01, -1.3, 1.3); spin.vy = dx * .6; spin.vp = dy * .3;
      }
    });
    on(dom, 'pointerleave', () => { if (pointerMode === 'mouse') { ndc.set(-9, -9); } });
    on(dom, 'pointerup', (e) => {
      const wasDrag = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
      dragging = false;
      if (!down) return; down = null;
      if (wasDrag || orbit?.moved) return;
      if (pointerMode === 'center' && opts.clickToPick === false) return;
      if (pointerMode === 'mouse') { setNdcFromEvent(e); ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(pickables, false)[0]; const rec = hit?.object.userData.kx;
        if (picked) { if (rec && rec !== picked) pick(rec); else if (!rec || rec !== picked) drop(); return; }
        if (rec) pick(rec);
      } else if (!picked && hovered) pick(hovered);
    });
  }
  on(window, 'keydown', (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'Escape' && picked) { drop(); e.stopPropagation(); }
    if (picked && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) step(e.key === 'ArrowRight' ? 1 : -1);
  });
  function step(dir) {
    if (!picked) return; const list = byCell.get(picked.cellKey); const i = list.indexOf(picked);
    pick(list[(i + dir + list.length) % list.length]);
  }

  // ── controles de órbita propios (solo modo autónomo)
  if (standalone) {
    orbit = makeOrbit(camera, dom, () => !!picked, on);
    orbit.set({ target: new THREE.Vector3(0, 1.02, 0), dist: 4.3, yaw: 0, pitch: .06 });
  }

  // ── interfaz
  const ui = uiOn ? makeUI() : null;
  function makeUI() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = document.createElement('div'); el.className = 'kx-ui'; container.appendChild(el);
    const tip = document.createElement('div'); tip.className = 'kx-tip'; el.appendChild(tip);
    const center = document.createElement('div'); center.className = 'kx-center'; el.appendChild(center);
    const card = document.createElement('aside'); card.className = 'kx-card'; card.hidden = true; card.setAttribute('aria-live', 'polite'); el.appendChild(card);
    let search = null;
    const totals = { all: items.filter((i) => !i.prop).length, books: items.filter((i) => i.book).length };
    totals.boxes = totals.all - totals.books;
    if (opts.search !== false) {
      search = document.createElement('section'); search.className = 'kx-search';
      const F = [['postit', 'Con pósit', (i) => i.postit], ['doubt', 'Dudas', (i) => i.doubt], ['dot', 'Pegatinas', (i) => i.dot], ['book', 'Libros de rol', (i) => i.book]];
      search.innerHTML = `<button class="kx-collapse" aria-label="Plegar">—</button><h1>Bodega de juegos · Las Kallax</h1>
        <p>${totals.all} juegos y libros de rol, cubo a cubo</p>
        <div class="kx-body"><input type="search" placeholder="Buscar un juego…" aria-label="Buscar un juego">
        <div class="kx-filters">${F.map(([k, l, f]) => `<button data-f="${k}" aria-pressed="false">${l} · ${items.filter(f).length}</button>`).join('')}</div>
        <div class="kx-res" role="list"></div></div>`;
      el.appendChild(search);
      if (container.clientWidth <= 720) search.classList.add('min');
      const inp = search.querySelector('input'), res = search.querySelector('.kx-res');
      let activeF = null;
      const render = () => {
        const q = norm(inp.value.trim());
        const fn = activeF ? F.find((f) => f[0] === activeF)[2] : null;
        let list = items.filter((i) => (!q || norm(i.name).includes(q)) && (!fn || fn(i)));
        if (!q && !fn) list = [];
        const was = !!filterSet; setFilter(q || fn ? list : null);
        if (orbit && !was && filterSet) orbit.overview();
        res.innerHTML = list.slice(0, 60).map((i) => `<button data-id="${i.id}" role="listitem">${esc(i.name)}<small>${i.kallax.replace('Kallax ', 'K')} · ${esc(i.cell)}</small></button>`).join('') + (list.length > 60 ? `<small style="padding:6px 8px">y ${list.length - 60} más…</small>` : '');
      };
      inp.addEventListener('input', render);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = res.querySelector('button'); if (b) b.click(); } });
      search.querySelector('.kx-filters').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; activeF = activeF === b.dataset.f ? null : b.dataset.f; search.querySelectorAll('.kx-filters button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.f === activeF)); render(); });
      res.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) select(b.dataset.id); });
      search.querySelector('.kx-collapse').addEventListener('click', () => search.classList.toggle('min'));
    }
    card.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act;
      if (a === 'close') drop(); else if (a === 'next') step(1); else if (a === 'prev') step(-1); else if (a === 'go') select(b.dataset.id);
    });
    let hideT;
    return {
      el,
      hover(rec) {
        if (pointerMode === 'center') { center.style.display = rec && !picked ? 'block' : 'none'; if (rec) center.innerHTML = `${esc(rec.name)} <small style="opacity:.6">· ${opts.actionHint || 'clic para cogerlo'}</small>`; return; }
        tip.style.display = rec && !picked ? 'block' : 'none';
        if (rec) tip.innerHTML = `${esc(rec.name)}<small>${rec.kallax.replace('Kallax ', 'K')} · ${esc(rec.cell)}</small>`;
        dom.style.cursor = rec ? 'pointer' : '';
      },
      tipAt(x, y) { tip.style.left = x + 'px'; tip.style.top = y + 'px'; },
      open(rec) {
        clearTimeout(hideT); tip.style.display = 'none'; center.style.display = 'none';
        const mates = byCell.get(rec.cellKey) || [];
        const fam = items.filter((i) => i !== rec && i.family === rec.family && i.family.length > 2 && !i.prop).slice(0, 8);
        const type = rec.prop ? 'Objeto (no es un juego)' : rec.book ? 'Libro de rol' : 'Juego de mesa';
        card.innerHTML = `
          <div class="kx-code">FICHA DE CARGA · ${rec.id}</div>
          <h2>${esc(rec.name)}</h2>
          <div class="kx-chips"><span class="kx-chip">${type}</span>${rec.dot ? `<span class="kx-chip dot">● ${esc(rec.dot)}</span>` : ''}${rec.postit ? '<span class="kx-chip dot">📝 pósit</span>' : ''}${rec.doubt ? `<span class="kx-chip q">❓ duda nº ${rec.doubt}</span>` : ''}</div>
          <div class="kx-row"><b>Dónde está</b>${esc(rec.kallax)}${rec.kallaxNick ? ` (${esc(rec.kallaxNick)})` : ''} · ${esc(rec.cell)}${rec.place ? `<br><span style="opacity:.75">${esc(rec.place[0].toUpperCase() + rec.place.slice(1))}</span>` : ''}</div>
          ${rec.postit ? `<div class="kx-row"><b>Lo que pone el pósit</b><span class="kx-postit">${esc(rec.postit)}</span></div>` : ''}
          ${rec.dot ? `<div class="kx-row"><b>Pegatina de color</b>● ${esc(rec.dot)} <span style="opacity:.65">(¿jugadores ideales?)</span></div>` : ''}
          ${rec.doubt ? `<div class="kx-row"><b>Duda pendiente</b><div class="kx-doubt">${esc(rec.doubtText || '')}<br><span style="opacity:.7;font-size:12.5px">Si sabes qué es, contesta con el nº ${rec.doubt}.</span></div></div>` : ''}
          ${fam.length ? `<div class="kx-row"><b>De la misma familia</b><div class="kx-list">${fam.map((i) => `<button data-act="go" data-id="${i.id}">${esc(i.name)} <span style="opacity:.5;font-size:12px">· ${i.kallax.replace('Kallax ', 'K')} ${esc(i.cell)}</span></button>`).join('')}</div></div>` : ''}
          <div class="kx-row"><b>En el mismo cubo · ${mates.length}</b><div class="kx-list">${mates.map((i) => `<button data-act="go" data-id="${i.id}" class="${i === rec ? 'cur' : ''}">${esc(i.name)}</button>`).join('')}</div></div>
          <div class="kx-actions"><button class="kx-btn main" data-act="close">Devolver a la Kallax</button>${mates.length > 1 ? '<button class="kx-btn" data-act="prev" aria-label="Anterior">‹</button><button class="kx-btn" data-act="next" aria-label="Siguiente">›</button>' : ''}</div>
          <div class="kx-hint">${rec.mesh ? 'Arrastra para girar la caja · ← → para recorrer el cubo · Esc para devolverla' : 'Esc para cerrar'}</div>`;
        card.hidden = false; el.classList.add('picking'); requestAnimationFrame(() => card.classList.add('on'));
        card.scrollTop = 0;
      },
      close() { card.classList.remove('on'); el.classList.remove('picking'); hideT = setTimeout(() => (card.hidden = true), 350); },
      dispose() { el.remove(); st.remove(); },
    };
  }

  function setFilter(list) {
    for (const e of matchEdges) e.removeFromParent(); matchEdges.length = 0;
    filterSet = list ? new Set(list) : null;
    if (!list) return;
    for (const rec of list.slice(0, 120)) {
      if (!rec.mesh) continue;
      const e = new THREE.LineSegments(edgeGeo, matchMat); e.scale.set(rec.dims.w + .003, rec.dims.h + .003, rec.dims.d + .003); rec.mesh.add(e); matchEdges.push(e);
    }
  }

  function resolve(q) {
    if (!q) return null; if (typeof q === 'object') return items.find((i) => i.id === q.id) || null;
    const byId = items.find((i) => i.id === q); if (byId) return byId;
    const n = norm(q); return items.find((i) => norm(i.name) === n) || items.find((i) => norm(i.name).includes(n)) || null;
  }
  function select(q) {
    const rec = resolve(q); if (!rec) return null;
    if (orbit && rec.mesh) {
      const wp = rec.mesh.getWorldPosition(new THREE.Vector3());
      orbit.flyTo(new THREE.Vector3(wp.x, wp.y, 0), camera.aspect < .8 ? 3.4 : 1.7);
      setTimeout(() => pick(rec), 380);
    } else pick(rec);
    return pub(rec);
  }
  const pub = (r) => ({ id: r.id, name: r.name, kallax: r.kallax, cell: r.cell, place: r.place, postit: r.postit, dot: r.dot, doubt: r.doubt, doubtText: r.doubtText, book: r.book, prop: r.prop });

  // ── tamaño y bucle autónomo
  function resize() {
    if (!standalone) return;
    const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
    renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix(); composer?.setSize(w, h);
    if (orbit) orbit.fit(camera.aspect);
  }
  let ro;
  if (standalone) {
    ro = new ResizeObserver(resize); ro.observe(container); resize();
    let last = performance.now();
    const loop = (t) => { raf = requestAnimationFrame(loop); const dt = (t - last) / 1000; last = t; update(dt); composer ? composer.render() : renderer.render(scene, camera); };
    raf = requestAnimationFrame(loop);
  }

  function dispose() {
    cancelAnimationFrame(raf); ro?.disconnect();
    listeners.forEach((f) => f()); ui?.dispose();
    root.removeFromParent(); root.traverse((o) => { if (o.geometry && o.geometry !== boxes) o.geometry.dispose(); });
    for (const d of disposables) d.dispose?.(); for (const m of mats) { m.map?.dispose?.(); m.dispose(); } atlas.dispose();
    for (const it of items) if (it.object?.userData.tex) it.object.userData.tex.dispose();
    if (standalone) { room?.dispose(); renderer.dispose(); renderer.domElement.remove(); composer?.dispose?.(); }
  }

  return {
    group: root, items: items.map(pub), size: { width: data.kallax.length * KW + (data.kallax.length - 1) * GAP, height: KH, depth: KD },
    update, dispose, select, close: () => drop(), pickHovered: () => { if (hovered && !picked) pick(hovered); return !!picked; },
    get isOpen() { return !!picked; }, get hovered() { return hovered ? pub(hovered) : null; },
    setPointer(x, y) { ndc.set(x, y); }, highlight: (q) => setFilter(q ? items.filter((i) => norm(i.name).includes(norm(q))) : null),
    renderer, scene, camera,
  };
}

// ───────────────────────────── órbita mínima (sin addons)
function makeOrbit(camera, dom, busy, on) {
  const s = { target: new THREE.Vector3(), dist: 4, yaw: 0, pitch: 0 }, g = { target: new THREE.Vector3(), dist: 4, yaw: 0, pitch: 0 };
  const ptrs = new Map(); let pinch = 0; const o = { moved: false };
  let minD = 1.1, maxD = 6.5;
  on(dom, 'pointerdown', (e) => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }); o.moved = false; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
  on(dom, 'pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) o.moved = true;
    if (busy()) return;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) g.dist = clamp(g.dist * pinch / d, minD, maxD); pinch = d; return; }
    if (e.buttons === 2 || e.shiftKey) { // desplazar
      const k = g.dist * .0012; const right = new THREE.Vector3(Math.cos(g.yaw), 0, -Math.sin(g.yaw));
      g.target.addScaledVector(right, -dx * k); g.target.y = clamp(g.target.y + dy * k, .2, 2.3); g.target.x = clamp(g.target.x, -2, 2);
    } else { g.yaw = clamp(g.yaw - dx * .005, -1.25, 1.25); g.pitch = clamp(g.pitch + dy * .004, -.35, .9); }
  });
  const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; };
  on(dom, 'pointerup', up); on(dom, 'pointercancel', up);
  on(dom, 'contextmenu', (e) => e.preventDefault());
  on(dom, 'wheel', (e) => { if (busy()) return; e.preventDefault(); g.dist = clamp(g.dist * Math.pow(1.0012, e.deltaY), minD, maxD); }, { passive: false });
  o.set = (v) => { Object.assign(g, v); g.target = v.target.clone(); s.target.copy(v.target); s.dist = v.dist; s.yaw = v.yaw; s.pitch = v.pitch; };
  o.flyTo = (t, d) => { g.target.copy(t); g.dist = d; g.yaw = clamp(g.yaw, -.5, .5); g.pitch = .05; };
  o.overview = () => { g.target.set(0, 1.02, 0); g.dist = Math.max(g.dist, maxD > 7 ? 7.6 : 4.3); g.yaw = 0; g.pitch = .06; };
  o.fit = (aspect) => { maxD = aspect < .8 ? 9 : 6.5; if (aspect < .8 && g.dist < 6) { g.dist = 7.6; s.dist = 7.6; } };
  o.update = (dt) => {
    const k = 1 - Math.pow(.002, dt);
    s.target.lerp(g.target, k); s.dist += (g.dist - s.dist) * k; s.yaw += (g.yaw - s.yaw) * k; s.pitch += (g.pitch - s.pitch) * k;
    camera.position.set(s.target.x + Math.sin(s.yaw) * Math.cos(s.pitch) * s.dist, s.target.y + Math.sin(s.pitch) * s.dist, s.target.z + Math.cos(s.yaw) * Math.cos(s.pitch) * s.dist);
    camera.lookAt(s.target);
  };
  return o;
}

// ───────────────────────────── bodega de la nave (solo modo autónomo)
function buildRoom(scene, mats, disposables) {
  const M = (o) => { const m = new THREE.MeshStandardMaterial(o); mats.push(m); return m; };
  const g = new THREE.Group(); scene.add(g);
  // suelo con rejilla suave
  const fc = document.createElement('canvas'); fc.width = fc.height = 512; const f = fc.getContext('2d');
  f.fillStyle = '#17102a'; f.fillRect(0, 0, 512, 512); f.strokeStyle = 'rgba(160,120,255,.22)'; f.lineWidth = 3; f.strokeRect(0, 0, 512, 512);
  f.strokeStyle = 'rgba(160,120,255,.07)'; f.lineWidth = 1; for (let i = 64; i < 512; i += 64) { f.beginPath(); f.moveTo(i, 0); f.lineTo(i, 512); f.moveTo(0, i); f.lineTo(512, i); f.stroke(); }
  const ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(8, 8); ft.colorSpace = THREE.SRGBColorSpace; ft.anisotropy = 8; disposables.push(ft);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), M({ map: ft, roughness: .35, metalness: .6 })); floor.rotation.x = -Math.PI / 2; g.add(floor); disposables.push(floor.geometry);
  // pared trasera con paneles
  const wc = document.createElement('canvas'); wc.width = 1024; wc.height = 512; const w = wc.getContext('2d');
  w.fillStyle = '#1d1533'; w.fillRect(0, 0, 1024, 512);
  for (let x = 0; x < 1024; x += 128) { w.fillStyle = 'rgba(0,0,0,.25)'; w.fillRect(x, 0, 3, 512); w.fillStyle = 'rgba(255,255,255,.035)'; w.fillRect(x + 3, 0, 2, 512); }
  w.fillStyle = 'rgba(0,0,0,.3)'; w.fillRect(0, 170, 1024, 4); w.fillRect(0, 400, 1024, 4);
  const wt = new THREE.CanvasTexture(wc); wt.colorSpace = THREE.SRGBColorSpace; wt.wrapS = THREE.RepeatWrapping; wt.repeat.set(2, 1); disposables.push(wt);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.2), M({ map: wt, roughness: .8, metalness: .3 })); wall.position.set(0, 2.1, -.3); g.add(wall); disposables.push(wall.geometry);
  for (const s of [-1, 1]) { const sw = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.2), M({ map: wt, roughness: .8, metalness: .3 })); sw.position.set(s * 4.6, 2.1, 3.6); sw.rotation.y = -s * Math.PI / 2; g.add(sw); disposables.push(sw.geometry); }
  // ojo de buey con estrellas y un planeta
  const sc = document.createElement('canvas'); sc.width = sc.height = 512; const s2 = sc.getContext('2d');
  const bg = s2.createRadialGradient(256, 256, 20, 256, 256, 360); bg.addColorStop(0, '#2a1458'); bg.addColorStop(1, '#05020c'); s2.fillStyle = bg; s2.fillRect(0, 0, 512, 512);
  const rr = rng(42); for (let i = 0; i < 500; i++) { s2.fillStyle = `rgba(255,255,255,${rr()})`; s2.fillRect(rr() * 512, rr() * 512, rr() * 1.8, rr() * 1.8); }
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace; disposables.push(st);
  const portM = new THREE.MeshBasicMaterial({ map: st, toneMapped: false }); mats.push(portM);
  const ports = [];
  for (const x of [-2.75, 2.75]) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(.55, 48), portM); disc.position.set(x, 2.25, -.29); g.add(disc); ports.push(disc); disposables.push(disc.geometry);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.58, .05, 12, 48), M({ color: 0x3b3260, metalness: .8, roughness: .35 })); ring.position.set(x, 2.25, -.27); g.add(ring); disposables.push(ring.geometry);
  }
  const planet = new THREE.Mesh(new THREE.SphereGeometry(.17, 32, 16), new THREE.MeshStandardMaterial({ color: 0xa57dff, roughness: 1, emissive: 0x2a1060 })); mats.push(planet.material); disposables.push(planet.geometry);
  planet.position.set(2.85, 2.38, -.31); planet.scale.z = .1; g.add(planet);
  // tira de luz del techo
  const strip = new THREE.Mesh(new THREE.BoxGeometry(5.4, .03, .05), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc4a8ff).multiplyScalar(1.4), toneMapped: false })); mats.push(strip.material); disposables.push(strip.geometry);
  strip.position.set(0, 3.0, .35); g.add(strip);
  for (const x of [-2.4, 2.4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.04, .03, 1.6), strip.material); p.position.set(x * 1.6, .015, 1.1); g.add(p); disposables.push(p.geometry); }
  // luces
  g.add(new THREE.HemisphereLight(0xb9a6ff, 0x1a1030, .55));
  const key = new THREE.SpotLight(0xfff1e6, 30, 0, .75, .65, 1.6); key.position.set(.8, 3.2, 3.6); key.target.position.set(0, 1, 0); g.add(key, key.target);
  const fill = new THREE.PointLight(0x9b7bff, 5, 0, 1.6); fill.position.set(-2.6, 1.4, 2.2); g.add(fill);
  const fill2 = new THREE.PointLight(0x6ad5ff, 2.5, 0, 1.6); fill2.position.set(2.8, .8, 2.4); g.add(fill2);
  return {
    update(t) { st.offset.x = (t * .004) % 1; planet.rotation.y = t * .1; },
    dispose() { g.removeFromParent(); },
  };
}
