// sistemas-estelares.js · Sistemas estelares procedurales de La Malkevnia (escena Three.js)
// Depende de 'three' (probado con three@0.160.0) y de los módulos hermanos:
//   ./generador.js                          datos puros (systemSpec)
//   ./estrellas.js                          cuerpos estelares y lente gravitatoria
//   ../planetas-procedurales/planetas.js    cuerpos planetarios
//
// API (ver README.md):
//   generateSystem(seed)                     -> spec (datos puros, sin GPU)
//   buildSystem(seedOrSpec, opts)            -> { group, spec, update(dt, camera), bodies, lenses, ... , dispose() }
//   createBackdrop(spec | {nebulosa})        -> fondo de estrellas y nebulosa que sigue a la cámara
//   LensingShader, lensUniformsFrom          -> reexportados de estrellas.js para el pase de lente

import * as THREE from 'three';
import { systemSpec, keplerPosition, lagrangeOfPair, makeRng, escalaEscena, esGaseoso, periodDays } from './generador.js';
import { createStar, LensingShader, lensUniformsFrom } from './estrellas.js';
import * as PL from '../planetas-procedurales/planetas.js';

export { systemSpec as generateSystem, systemSpec, LensingShader, lensUniformsFrom };
export { STAR_CLASSES, ARQUITECTURAS, keplerPosition, escalaEscena } from './generador.js';

/* ------------------------------------------------------------------ */
/*  GLSL comunes                                                        */
/* ------------------------------------------------------------------ */

const HASH_GLSL = /* glsl */`
float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

// Puntos con tamaño en píxeles atenuado por distancia (uPx = altura_px / (2 tan(fov/2)))
const GLOW_POINTS_VERT = /* glsl */`
attribute float aSize; attribute vec3 aColor; attribute float aPhase;
uniform float uPx; uniform float uTime;
varying vec3 vColor; varying float vPhase;
void main(){
  vColor = aColor; vPhase = aPhase;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uPx / max(-mv.z, 0.001), 1.5, 96.0);
  gl_Position = projectionMatrix * mv;
}`;
const GLOW_POINTS_FRAG = /* glsl */`
uniform float uTime; uniform float uBlink; uniform float uOpacity; uniform float uShape;
varying vec3 vColor; varying float vPhase;
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0; float r = length(q);
  float a;
  if (uShape > 0.5) { // rombo hueco (marcadores de Lagrange)
    float d = abs(q.x) + abs(q.y);
    a = smoothstep(0.95, 0.8, d) * smoothstep(0.45, 0.62, d) + exp(-r * r * 30.0) * 0.8;
  } else {
    a = exp(-r * r * 5.0) + exp(-r * 18.0) * 0.6;
  }
  float blink = mix(1.0, 0.25 + 0.75 * step(0.6, fract(uTime * 0.7 + vPhase)), uBlink);
  if (a * blink < 0.01) discard;
  gl_FragColor = vec4(vColor * a * blink * uOpacity, a * blink * uOpacity);
}`;

function glowPointsMaterial({ blink = 0, opacity = 1, shape = 0 } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: GLOW_POINTS_VERT, fragmentShader: GLOW_POINTS_FRAG,
    uniforms: { uPx: { value: 600 }, uTime: { value: 0 }, uBlink: { value: blink }, uOpacity: { value: opacity }, uShape: { value: shape } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

function glowPoints(positions, colors, sizes, opts) {
  const n = positions.length / 3;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  const ph = new Float32Array(n); for (let i = 0; i < n; i++) ph[i] = (i * 0.6180339) % 1;
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 1));
  const m = glowPointsMaterial(opts);
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

/* ---- Cinturones (rocas en órbita kepleriana calculada en GPU) ---- */
const BELT_VERT = /* glsl */`
attribute float aR; attribute float aPhase; attribute float aW; attribute float aY; attribute float aSize; attribute float aTint;
uniform float uTime; uniform float uPx;
varying float vTint; varying float vR;
void main(){
  float ang = aPhase + uTime * aW;
  vec3 p = vec3(cos(ang) * aR, aY, sin(ang) * aR);
  vTint = aTint; vR = aR;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(aSize * uPx / max(-mv.z, 0.001), 1.0, 9.0);
  gl_Position = projectionMatrix * mv;
}`;
const BELT_FRAG = /* glsl */`
uniform vec3 uColorA; uniform vec3 uColorB; uniform float uOpacity; uniform float uCrystal; uniform float uReal;
varying float vTint; varying float vR;
vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  vec3 c = mix(uColorA, uColorB, vTint);
  if (uCrystal > 0.5) c = mix(c, hue(fract(vTint * 3.0 + uReal * 0.05 + vR * 0.01)) * 1.6, 0.75) * (0.7 + 0.8 * pow(fract(vTint * 17.0 + uReal * 0.4), 8.0));
  float a = (1.0 - r2) * uOpacity;
  gl_FragColor = vec4(c * a, a);
}`;

/* ---- Cola de cometa / planeta que se desintegra ---- */
const TAIL_VERT = /* glsl */`
attribute float aT; attribute vec3 aRand; attribute float aKind;
uniform vec3 uHead; uniform vec3 uAway; uniform vec3 uVel; uniform float uLen; uniform float uReal; uniform float uPx; uniform float uSpread;
varying float vT; varying float vKind;
void main(){
  float t = fract(aT + uReal * (0.05 + aKind * 0.02));
  vT = t; vKind = aKind;
  vec3 dir = aKind < 0.5 ? uAway : normalize(uAway - uVel * 0.55 * t);
  vec3 p = uHead + dir * t * uLen * (aKind < 0.5 ? 1.0 : 0.75) + aRand * uSpread * (0.15 + t * (aKind < 0.5 ? 0.35 : 1.2)) * uLen * 0.12;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp((1.0 - t * 0.6) * 2.4 * uPx / max(-mv.z, 0.001), 1.0, 22.0);
  gl_Position = projectionMatrix * mv;
}`;
const TAIL_FRAG = /* glsl */`
uniform vec3 uIon; uniform vec3 uDust; uniform float uOpacity;
varying float vT; varying float vKind;
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q);
  if (r > 1.0) discard;
  float a = exp(-r * 3.0) * pow(1.0 - vT, 1.6) * uOpacity * 0.55;
  vec3 c = vKind < 0.5 ? uIon : uDust;
  gl_FragColor = vec4(c * a, a);
}`;

function makeTail(nIon, nDust, ion, dust, rng) {
  const n = nIon + nDust;
  const g = new THREE.BufferGeometry();
  const T = new Float32Array(n), R = new Float32Array(n * 3), K = new Float32Array(n), P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    T[i] = rng(); K[i] = i < nIon ? 0 : 1;
    const u = rng() * 2 - 1, th = rng() * Math.PI * 2, rr = Math.sqrt(1 - u * u) * Math.pow(rng(), 0.5);
    R[i * 3] = Math.cos(th) * rr; R[i * 3 + 1] = u * Math.pow(rng(), 0.5); R[i * 3 + 2] = Math.sin(th) * rr;
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(T, 1));
  g.setAttribute('aRand', new THREE.Float32BufferAttribute(R, 3));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(K, 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: TAIL_VERT, fragmentShader: TAIL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uHead: { value: new THREE.Vector3() }, uAway: { value: new THREE.Vector3(1, 0, 0) }, uVel: { value: new THREE.Vector3(0, 0, 1) },
      uLen: { value: 10 }, uReal: { value: 0 }, uPx: { value: 600 }, uSpread: { value: 1 },
      uIon: { value: new THREE.Color(ion) }, uDust: { value: new THREE.Color(dust) }, uOpacity: { value: 1 },
    },
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

/* ---- Luces de ciudades (civilización visible) ---- */
const CITY_VERT = /* glsl */`
varying vec3 vN; varying vec3 vP;
void main(){ vP = position; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CITY_FRAG = /* glsl */`
uniform vec3 uLightDir; uniform vec3 uColor; uniform vec3 uColor2; uniform float uSeed; uniform float uDensity; uniform float uTime;
varying vec3 vN; varying vec3 vP;
${HASH_GLSL}
void main(){
  float night = smoothstep(0.12, -0.28, dot(normalize(vN), normalize(uLightDir)));
  if (night < 0.01) discard;
  vec3 p = normalize(vP);
  float land = smoothstep(0.48, 0.62, fbm3(p * 2.2 + uSeed));
  float cluster = smoothstep(0.45, 0.8, fbm3(p * 6.0 + uSeed * 1.7));
  vec3 c = floor(p * 90.0);
  float h = hash13(c + uSeed);
  vec3 f = fract(p * 90.0) - 0.5;
  float dotm = step(1.0 - uDensity * (0.25 + cluster * 0.6), h) * smoothstep(0.42, 0.05, length(f));
  float roads = smoothstep(0.985, 1.0, sin(p.x * 140.0 + uSeed) * sin(p.z * 140.0)) * cluster * 0.4;
  float k = (dotm + roads) * land * night * (0.85 + 0.15 * sin(uTime * 2.0 + h * 30.0));
  vec3 col = mix(uColor, uColor2, step(0.82, hash13(c * 1.3 + 7.0)));
  if (k < 0.01) discard;
  gl_FragColor = vec4(col * k * 2.2, k);
}`;

/* ---- Anillo orbital / megaestructuras emisivas ---- */
const RINGSTRUCT_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
void main(){
  float seg = step(0.12, fract(vUv.x * 64.0));
  float lights = pow(fract(vUv.x * 256.0 - uTime * 0.6), 30.0) * 3.0;
  vec3 c = uColor * (0.35 * seg) + vec3(1.0, 0.85, 0.6) * lights;
  gl_FragColor = vec4(c, 1.0);
}`;
const UV_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/* ---- Zona habitable ---- */
const ZONE_VERT = /* glsl */`varying vec2 vXY; void main(){ vXY = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ZONE_FRAG = /* glsl */`
uniform float uIn; uniform float uOut; uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
varying vec2 vXY;
void main(){
  float r = length(vXY);
  float t = (r - uIn) / (uOut - uIn);
  float body = smoothstep(0.0, 0.18, t) * smoothstep(1.0, 0.82, t);
  float edge = exp(-pow((t) * 40.0, 2.0)) + exp(-pow((t - 1.0) * 40.0, 2.0));
  float waves = 0.75 + 0.25 * sin(atan(vXY.y, vXY.x) * 24.0 + uTime * 0.3 + r * 0.4);
  float a = (body * 0.22 * waves + edge * 0.7) * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
}`;

/* ---- Disco protoplanetario ---- */
const DISK_FRAG = /* glsl */`
uniform float uIn; uniform float uOut; uniform float uGaps[8]; uniform int uGapCount; uniform float uTime; uniform vec3 uColA; uniform vec3 uColB;
varying vec2 vXY;
${HASH_GLSL}
void main(){
  float r = length(vXY);
  float t = (r - uIn) / (uOut - uIn);
  float ang = atan(vXY.y, vXY.x);
  float swirl = ang + uTime * 0.6 / sqrt(max(r, 1.0)) * 4.0 - log(r) * 2.0;
  float n = fbm3(vec3(cos(swirl) * 3.0, sin(swirl) * 3.0, r * 0.15));
  float d = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.55, t) * (0.45 + 0.9 * n);
  for (int i = 0; i < 8; i++) { if (i >= uGapCount) break; float g = uGaps[i]; d *= 1.0 - 0.9 * exp(-pow((r - g) / (0.9 + g * 0.035), 2.0)); }
  vec3 c = mix(uColA, uColB, smoothstep(0.0, 0.9, t)) * (1.6 - t);
  float a = clamp(d, 0.0, 1.0) * 0.75;
  gl_FragColor = vec4(c * a, a);
}`;

/* ---- Agujero de gusano ---- */
const WORM_VERT = /* glsl */`varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){ vP = position; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const WORM_FRAG = /* glsl */`
uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
${HASH_GLSL}
void main(){
  float f = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  vec3 p = normalize(vP);
  float ang = atan(p.z, p.x);
  float sw = fbm3(vec3(ang * 2.0 + f * 6.0 - uTime * 0.4, f * 5.0, uTime * 0.05));
  float stars = step(0.985, hash13(floor(vec3(ang * 40.0 + uTime * 0.6 * f, f * 60.0, 3.0))));
  vec3 inner = mix(vec3(0.05, 0.02, 0.12), vec3(0.3, 0.5, 1.0), pow(f, 6.0)) + stars * vec3(1.0, 0.9, 1.0) * f;
  vec3 rim = mix(vec3(0.75, 0.35, 1.0), vec3(0.3, 0.9, 1.0), sw) * pow(1.0 - f, 2.5) * 3.0;
  gl_FragColor = vec4(inner + rim * (0.6 + sw), 1.0);
}`;

/* ---- Fondo: nebulosa ---- */
const NEB_VERT = /* glsl */`varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const NEB_FRAG = /* glsl */`
uniform vec3 uTint; uniform vec3 uTint2; uniform float uSeed; varying vec3 vD;
${HASH_GLSL}
void main(){
  vec3 d = normalize(vD);
  float band = exp(-pow(dot(d, normalize(vec3(0.3, 1.0, 0.2))) * 3.2, 2.0));
  float n = fbm3(d * 2.4 + uSeed); float m = fbm3(d * 5.5 - uSeed * 0.7);
  float neb = smoothstep(0.42, 0.85, n) * (0.5 + m);
  float dust = smoothstep(0.55, 0.75, fbm3(d * 9.0 + 3.0));
  vec3 c = uTint * neb * 0.32 + uTint2 * band * 0.10 * (0.6 + m) - dust * band * 0.05;
  c += vec3(0.012, 0.008, 0.03);
  gl_FragColor = vec4(max(c, 0.0), 1.0);
}`;

/* ------------------------------------------------------------------ */
/*  Utilidades                                                          */
/* ------------------------------------------------------------------ */

const v3 = () => new THREE.Vector3();
const _k = { x: 0, y: 0, z: 0 };

function ellipsePoints(orbita, segments = 256) {
  // Contorno de la órbita usando el mismo Kepler (puntos equiespaciados en anomalía excéntrica)
  const pts = [];
  const e = orbita.eEscena ?? orbita.e, a = orbita.aEscena;
  const cw = Math.cos(orbita.argPeri), sw = Math.sin(orbita.argPeri), ci = Math.cos(orbita.inclinacion), si = Math.sin(orbita.inclinacion), cn = Math.cos(orbita.nodo), sn = Math.sin(orbita.nodo);
  for (let i = 0; i < segments; i++) {
    const E = (i / segments) * Math.PI * 2;
    const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E);
    let px = x * cw - y * sw, pz = x * sw + y * cw;
    const py = pz * si; pz = pz * ci;
    pts.push(new THREE.Vector3(px * cn - pz * sn, py, px * sn + pz * cn));
  }
  return pts;
}

function lineLoop(points, color, opacity) {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  return new THREE.LineLoop(g, m);
}

function circlePoints(r, n = 160) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
  return pts;
}

function dashedCircle(r, color, opacity) {
  const pts = circlePoints(r, 200); pts.push(pts[0].clone());
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: r * 0.03, gapSize: r * 0.025, depthWrite: false });
  const l = new THREE.Line(g, m); l.computeLineDistances();
  return l;
}

// Contorno del potencial de Roche (marching squares) en el sistema que rota con el par.
// Unidades: separación = 1; donante en x = -mu, acretor en x = 1 - mu.
function rocheContour(mu, level, res = 200) {
  const x0 = -1.9, x1 = 1.9, y0 = -1.5, y1 = 1.5, nx = res, ny = Math.round(res * 0.8);
  const phi = (x, y) => -(1 - mu) / Math.hypot(x + mu, y) - mu / Math.hypot(x - 1 + mu, y) - 0.5 * (x * x + y * y);
  const F = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) F[j * (nx + 1) + i] = phi(x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny) - level;
  const seg = [];
  const P = (i, j) => [x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny];
  const lerp = (a, b, fa, fb) => { const t = fa / (fa - fb); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const f00 = F[j * (nx + 1) + i], f10 = F[j * (nx + 1) + i + 1], f01 = F[(j + 1) * (nx + 1) + i], f11 = F[(j + 1) * (nx + 1) + i + 1];
    const p00 = P(i, j), p10 = P(i + 1, j), p01 = P(i, j + 1), p11 = P(i + 1, j + 1);
    const cr = [];
    if ((f00 < 0) !== (f10 < 0)) cr.push(lerp(p00, p10, f00, f10));
    if ((f10 < 0) !== (f11 < 0)) cr.push(lerp(p10, p11, f10, f11));
    if ((f11 < 0) !== (f01 < 0)) cr.push(lerp(p11, p01, f11, f01));
    if ((f01 < 0) !== (f00 < 0)) cr.push(lerp(p01, p00, f01, f00));
    if (cr.length >= 2) seg.push(cr[0][0], 0, cr[0][1], cr[1][0], 0, cr[1][1]);
    if (cr.length === 4) seg.push(cr[2][0], 0, cr[2][1], cr[3][0], 0, cr[3][1]);
  }
  return seg;
}

// Trayectoria balística del chorro de masa desde L1 (problema restringido de tres cuerpos, RK4)
function massStreamPath(mu, L1x, stopR) {
  const acc = (x, y, vx, vy) => {
    const r1 = Math.hypot(x + mu, y) ** 3, r2 = Math.hypot(x - 1 + mu, y) ** 3;
    const ax = x - (1 - mu) * (x + mu) / r1 - mu * (x - 1 + mu) / r2 + 2 * vy;
    const ay = y - (1 - mu) * y / r1 - mu * y / r2 - 2 * vx;
    return [ax, ay];
  };
  let s = [L1x + 0.004, 0, 0.02, -0.004];
  const pts = [[s[0], s[1]]];
  const h = 0.0015;
  for (let k = 0; k < 6000; k++) {
    const f = (st) => { const [ax, ay] = acc(st[0], st[1], st[2], st[3]); return [st[2], st[3], ax, ay]; };
    const k1 = f(s), k2 = f(s.map((v, i) => v + k1[i] * h / 2)), k3 = f(s.map((v, i) => v + k2[i] * h / 2)), k4 = f(s.map((v, i) => v + k3[i] * h));
    s = s.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    if (k % 6 === 0) pts.push([s[0], s[1]]);
    if (Math.hypot(s[0] - 1 + mu, s[1]) < stopR) break;
  }
  pts.push([s[0], s[1]]);
  return pts;
}

function luminosityWeight(L) { return Math.max(0.02, Math.log10(1 + L * 10)); }

/* ------------------------------------------------------------------ */
/*  Fondo                                                               */
/* ------------------------------------------------------------------ */

export function createBackdrop(specOrOpts = {}, opts = {}) {
  const tint = new THREE.Color(specOrOpts.nebulosa ?? 0x5a3aa8);
  const tint2 = tint.clone().offsetHSL(0.12, -0.1, 0.1);
  const seed = makeRng(specOrOpts.seed ?? 'malkevnia', 'fondo');
  const R = opts.radius ?? 9000;
  const group = new THREE.Group();
  group.name = 'fondo-estelar';
  const neb = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 24), new THREE.ShaderMaterial({
    vertexShader: NEB_VERT, fragmentShader: NEB_FRAG, side: THREE.BackSide, depthWrite: false,
    uniforms: { uTint: { value: tint }, uTint2: { value: tint2 }, uSeed: { value: seed() * 100 } },
  }));
  neb.renderOrder = -10; neb.frustumCulled = false;
  group.add(neb);
  const N = opts.stars ?? 7000;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    let u = seed() * 2 - 1; const th = seed() * Math.PI * 2;
    if (i % 3 === 0) u *= 0.25; // densidad extra en la banda galáctica
    const r = Math.sqrt(1 - u * u);
    const d = new THREE.Vector3(Math.cos(th) * r, u, Math.sin(th) * r).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.35);
    pos.set([d.x * R * 0.92, d.y * R * 0.92, d.z * R * 0.92], i * 3);
    const t = seed();
    c.setHSL(t < 0.5 ? 0.62 + seed() * 0.15 : t < 0.8 ? 0.1 : 0.78, 0.4 + seed() * 0.4, 0.75 + seed() * 0.2);
    const b = Math.pow(seed(), 3) * 1.4 + 0.3;
    col.set([c.r * b, c.g * b, c.b * b], i * 3);
    size[i] = (0.6 + Math.pow(seed(), 6) * 2.6) * R * 0.0016;
  }
  const stars = glowPoints(pos, col, size, { opacity: 1 });
  stars.renderOrder = -9;
  group.add(stars);
  return {
    group,
    update(camera, pxScale) { if (camera) group.position.copy(camera.position); if (pxScale) stars.material.uniforms.uPx.value = pxScale; },
    dispose() { group.removeFromParent(); neb.geometry.dispose(); neb.material.dispose(); stars.geometry.dispose(); stars.material.dispose(); },
  };
}

/* ------------------------------------------------------------------ */
/*  Constructor de escena                                               */
/* ------------------------------------------------------------------ */

/**
 * @param {string|object} seedOrSpec  semilla o spec ya generado con generateSystem()
 * @param {{detail?:'alta'|'media'|'baja', timeScale?:number, backdrop?:boolean, lights?:boolean, planetDetail?:string}} [opts]
 */
export function buildSystem(seedOrSpec, opts = {}) {
  const spec = typeof seedOrSpec === 'object' && seedOrSpec?.estrellas ? seedOrSpec : systemSpec(seedOrSpec);
  const root = spec._root;
  const nodes = spec._nodes;
  const detail = opts.detail ?? 'media';
  const planetDetail = opts.planetDetail ?? (spec.planetas.length > 14 ? 'baja' : detail);
  const rng = makeRng(spec.seed, 'escena');

  const group = new THREE.Group();
  group.name = `sistema:${spec.seed}`;
  group.userData.spec = spec;
  const layers = {
    orbitas: new THREE.Group(), zonas: new THREE.Group(), civilizacion: new THREE.Group(), cinturones: new THREE.Group(), etiquetasGravedad: [],
  };
  for (const k of ['orbitas', 'zonas', 'civilizacion', 'cinturones']) { layers[k].name = k; group.add(layers[k]); }

  const disposables = [];
  const track = (o) => { if (o) disposables.push(o); return o; };
  const trackObj = (obj) => { obj.traverse((o) => { if (o.geometry) track(o.geometry); if (o.material) [].concat(o.material).forEach(track); }); return obj; };
  const pxMaterials = [];        // materiales con uPx
  const realTimeUniforms = [];   // uTime en segundos reales
  const simTimeUniforms = [];    // uTime en días simulados
  const bodies = [];
  const updaters = [];

  // Estado de tiempo
  const state = { t: opts.t0 ?? 0, real: 0, timeScale: opts.timeScale ?? 2, paused: false };

  // Posiciones de nodos
  for (const n of nodes) { n._pos = v3(); n._rel = v3(); n._vel = v3(); }
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const starNode = new Map(nodes.filter((n) => n.tipo === 'estrella').map((n) => [n.estrella.id, n]));

  function placeNodes(t) {
    (function walk(n, pos) {
      n._pos.copy(pos);
      if (n.tipo !== 'par') return;
      keplerPosition(n.orbita, t, _k); n._rel.set(_k.x, _k.y, _k.z);
      keplerPosition(n.orbita, t + n.orbita.periodoDias * 0.001, _k); n._vel.set(_k.x, _k.y, _k.z).sub(n._rel);
      const fa = n.b.M / n.M, fb = n.a.M / n.M;
      walk(n.a, v3().copy(pos).addScaledVector(n._rel, -fa));
      walk(n.b, v3().copy(pos).addScaledVector(n._rel, fb));
    })(root, v3());
  }
  placeNodes(state.t);

  // Centro luminoso de un nodo (para la luz de los planetas y las colas de cometa)
  const starsUnder = (n) => (n.tipo === 'estrella' ? [n.estrella] : [...starsUnder(n.a), ...starsUnder(n.b)]);
  function lightCenter(n, out) {
    const ss = starsUnder(n); let w = 0; out.set(0, 0, 0);
    for (const s of ss) { const k = luminosityWeight(s.luminosidadSol) + (s.clase === 'agujero-negro' && s.flags.discoAcrecion ? 1 : 0); out.addScaledVector(starNode.get(s.id)._pos, k); w += k; }
    return w > 0 ? out.multiplyScalar(1 / w) : out.copy(n._pos);
  }
  function lightColor(n) {
    const ss = starsUnder(n); const c = new THREE.Color(0, 0, 0); let w = 0;
    for (const s of ss) { const k = luminosityWeight(s.luminosidadSol); const sc = new THREE.Color(s.clase === 'agujero-negro' ? 0xffc080 : s.color); c.r += sc.r * k; c.g += sc.g * k; c.b += sc.b * k; w += k; }
    if (w) c.multiplyScalar(1 / w);
    return c.lerp(new THREE.Color(1, 1, 1), 0.45);
  }

  /* ---------------- Estrellas ---------------- */
  const stars = [];
  for (const s of spec.estrellas) {
    const h = createStar(s, { detail });
    h.group.name = `estrella:${s.id}`;
    group.add(h.group);
    let light = null;
    if (opts.lights !== false && s.clase !== 'enana-marron') {
      const L = s.clase === 'agujero-negro' ? (s.flags.discoAcrecion ? 3e3 : 0) : s.luminosidadSol;
      const intensity = THREE.MathUtils.clamp(1.2 + Math.log10(Math.max(L, 1e-4)) * 0.45, 0.35, 4.5);
      light = new THREE.PointLight(s.clase === 'agujero-negro' ? 0xffc890 : s.color, intensity, 0, 0);
      h.group.add(light);
    }
    const node = starNode.get(s.id);
    stars.push({ star: s, handle: h, node, light });
    const b = { id: s.id, tipo: 'estrella', nombre: s.nombre, subtitulo: s.claseNombre, radio: Math.max(s.radio, h.glowRadius ? h.glowRadius * 0.35 : s.radio), position: v3(), datos: s, object3D: h.group };
    bodies.push(b);
    updaters.push(() => { h.group.position.copy(node._pos); b.position.copy(node._pos); });
  }
  const ambient = opts.lights !== false ? new THREE.AmbientLight(0x2a2048, 0.55) : null;
  if (ambient) group.add(ambient);

  /* ---------------- Órbitas de las estrellas ---------------- */
  for (const n of nodes) {
    if (n.tipo !== 'par') continue;
    const pts = ellipsePoints({ ...n.orbita, eEscena: n.orbita.e });
    const fa = n.b.M / n.M, fb = n.a.M / n.M;
    const la = lineLoop(pts.map((p) => p.clone().multiplyScalar(-fa)), 0xffd9a0, 0.22);
    const lb = lineLoop(pts.map((p) => p.clone().multiplyScalar(fb)), 0xffd9a0, 0.22);
    const g = new THREE.Group(); g.add(la, lb); trackObj(g);
    layers.orbitas.add(g);
    updaters.push(() => g.position.copy(n._pos));
  }

  /* ---------------- Zonas: habitable y línea de hielo ---------------- */
  for (const n of nodes) {
    if (!n.zonaHabitable || !n.planetas.length) continue;
    const zin = escalaEscena(spec, n.id, n.zonaHabitable.interiorUA), zout = escalaEscena(spec, n.id, n.zonaHabitable.exteriorUA);
    if (zout <= n.nucleo * 0.9) continue;
    const zi = Math.max(zin, n.nucleo * 0.85);
    const ring = new THREE.Mesh(new THREE.RingGeometry(zi, zout, 192, 1), new THREE.ShaderMaterial({
      vertexShader: ZONE_VERT, fragmentShader: ZONE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uIn: { value: zi }, uOut: { value: zout }, uColor: { value: new THREE.Color(0x52f0b0) }, uOpacity: { value: 0.9 }, uTime: { value: 0 } },
    }));
    ring.rotation.x = -Math.PI / 2;
    realTimeUniforms.push(ring.material.uniforms.uTime);
    const g = new THREE.Group(); g.add(ring);
    if (n.lineaHieloUA) {
      const fr = escalaEscena(spec, n.id, n.lineaHieloUA);
      if (fr > n.nucleo) g.add(dashedCircle(fr, 0x9ad8ff, 0.45));
    }
    trackObj(g);
    layers.zonas.add(g);
    updaters.push(() => g.position.copy(n._pos));
  }

  /* ---------------- Lóbulos de Roche, puntos de Lagrange del par, transferencia ---------------- */
  const pairFrames = [];
  for (const n of nodes) {
    if (n.tipo !== 'par' || n.orbita.aUA > 2) continue;
    const tr = n.transferencia;
    // Marco: donante (o A) en -mu, compañera en 1-mu; eje X de la primera a la segunda
    const first = tr ? (n.a.tipo === 'estrella' && n.a.estrella.id === tr.donante ? n.a : n.b) : n.a;
    const second = first === n.a ? n.b : n.a;
    const mu = second.M / n.M;
    const L = lagrangeOfPair(mu);
    const phiAt = (x, y) => -(1 - mu) / Math.hypot(x + mu, y) - mu / Math.hypot(x - 1 + mu, y) - 0.5 * (x * x + y * y);
    const frame = new THREE.Group(); frame.matrixAutoUpdate = false; frame.name = `roche:${n.id}`;
    const lob = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rocheContour(mu, phiAt(L.L1[0], 0) + 1e-4), 3)),
      new THREE.LineBasicMaterial({ color: 0x9e8cff, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
    const outer = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rocheContour(mu, phiAt(L.L2[0], 0) + 1e-4, 160), 3)),
      new THREE.LineBasicMaterial({ color: 0x6a5acd, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
    frame.add(lob, outer);
    const lp = [], lc = [], ls = [];
    for (const k of ['L1', 'L2', 'L3', 'L4', 'L5']) { lp.push(L[k][0], 0, L[k][1]); lc.push(1, 0.85, 0.45); ls.push(0.09); }
    const lpts = glowPoints(lp, lc, ls, { shape: 1, opacity: 0.9 });
    pxMaterials.push(lpts.material); realTimeUniforms.push(lpts.material.uniforms.uTime);
    frame.add(lpts);
    trackObj(frame);
    layers.zonas.add(frame);
    const marks = ['L1', 'L2', 'L3', 'L4', 'L5'].map((k) => {
      const b = { id: `${n.id}-${k}`, tipo: 'lagrange', nombre: `${k} de ${spec.nombre} ${n.id}`, subtitulo: 'Punto de Lagrange del par', radio: 0.5, position: v3(), local: new THREE.Vector3(L[k][0], 0, L[k][1]), capa: 'zonas' };
      bodies.push(b); return b;
    });
    // Chorro de transferencia de masa
    let stream = null;
    if (tr) {
      const acc = second.estrella;
      const sep0 = n.orbita.aEscena;
      const stopR = (acc.flags.discoAcrecion?.exterior ?? 1) / sep0 * 0.8;
      const path = massStreamPath(mu, L.L1[0], stopR);
      const N = 900;
      const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
      const donorCol = new THREE.Color(first.estrella.color), hot = new THREE.Color(0xbfd4ff);
      const params = [];
      for (let i = 0; i < N; i++) { params.push([rng(), 0.05 + rng() * 0.05, (rng() - 0.5) * 0.012, (rng() - 0.5) * 0.008]); size[i] = 0.05 + rng() * 0.08; }
      stream = glowPoints(pos, col, size, { opacity: 1 });
      pxMaterials.push(stream.material);
      frame.add(stream);
      const hs = glowPoints([path[path.length - 1][0], 0, path[path.length - 1][1]], [1.4, 1.5, 2.2], [0.35], { opacity: 1 });
      pxMaterials.push(hs.material); realTimeUniforms.push(hs.material.uniforms.uTime);
      frame.add(hs); trackObj(stream); trackObj(hs);
      // El chorro vive en la capa de estrellas (siempre visible), no en la de zonas
      layers.zonas.remove(frame);
      const fz = new THREE.Group(); fz.matrixAutoUpdate = false; fz.add(lob, outer, lpts); layers.zonas.add(fz);
      group.add(frame);
      pairFrames.push({ n, first, second, frame: fz, marks });
      stream.userData = { path, params, donorCol, hot };
    }
    pairFrames.push({ n, first, second, frame, marks, stream });
  }
  const _X = v3(), _Y = v3(), _Z = v3(), _M4 = new THREE.Matrix4(), _S = v3();
  function updatePairFrames() {
    for (const pf of pairFrames) {
      const a = pf.first._pos, b = pf.second._pos;
      _X.copy(b).sub(a); const sep = _X.length(); _X.normalize();
      _Z.copy(pf.n._vel); _Z.addScaledVector(_X, -_Z.dot(_X)); // dirección del movimiento de la segunda
      if (pf.second === pf.n.a) _Z.negate();
      if (_Z.lengthSq() < 1e-10) _Z.set(0, 0, 1); _Z.normalize();
      _Y.crossVectors(_Z, _X).normalize();
      _M4.makeBasis(_X.clone().multiplyScalar(sep), _Y.clone().multiplyScalar(sep), _Z.clone().multiplyScalar(sep));
      _M4.setPosition(pf.n._pos);
      pf.frame.matrix.copy(_M4); pf.frame.matrixWorldNeedsUpdate = true;
      if (pf.marks) for (const m of pf.marks) m.position.copy(m.local).applyMatrix4(_M4);
      if (pf.stream) {
        const { path, params, donorCol, hot } = pf.stream.userData;
        const P = pf.stream.geometry.attributes.position.array, C = pf.stream.geometry.attributes.aColor.array;
        const last = path.length - 1;
        for (let i = 0; i < params.length; i++) {
          const [ph, sp, ox, oy] = params[i];
          const u = (ph + state.real * sp) % 1;
          const f = u * last, k = Math.floor(f), t = f - k;
          const p0 = path[k], p1 = path[Math.min(k + 1, last)];
          P[i * 3] = p0[0] + (p1[0] - p0[0]) * t + ox * (1 - u);
          P[i * 3 + 1] = oy * (1 - u);
          P[i * 3 + 2] = p0[1] + (p1[1] - p0[1]) * t + ox * (1 - u);
          const c = donorCol.clone().lerp(hot, u);
          const br = 0.9 + u * 1.6;
          C[i * 3] = c.r * br; C[i * 3 + 1] = c.g * br; C[i * 3 + 2] = c.b * br;
        }
        pf.stream.geometry.attributes.position.needsUpdate = true; pf.stream.geometry.attributes.aColor.needsUpdate = true;
      }
    }
  }

  /* ---------------- Planetas ---------------- */
  const planets = [];
  for (const p of spec.planetas) {
    const host = nodeById.get(p.orbita.alrededorDe);
    const popts = { radius: p.radio, detail: planetDetail, ...(p.planetOpts || {}) };
    const h = PL.generatePlanet(p.planetSeed, popts);
    h.group.name = `planeta:${p.id}`;
    group.add(h.group);
    if (typeof h.setLightColor === 'function') h.setLightColor(lightColor(host));
    const extras = new THREE.Group(); extras.name = 'extras'; // en radios del planeta
    h.group.add(extras);
    const entry = { p, h, host, extras, lightPos: v3(), tails: [], minor: null, spinners: [] };
    planets.push(entry);

    // Órbita
    const orbitLine = lineLoop(ellipsePoints(p.orbita), p.zona === 'habitable' ? 0x6ff0c0 : p.civilizacion && !p.civilizacion.extinta ? 0xffd27a : 0xa48cff, p.zona === 'habitable' ? 0.42 : 0.26);
    trackObj(orbitLine); layers.orbitas.add(orbitLine);
    entry.orbitLine = orbitLine;

    // Lunas menores (instanciadas)
    if (p.lunasMenores > 0) {
      const n = p.lunasMenores;
      const geo = track(new THREE.IcosahedronGeometry(1, 1));
      const mat = track(new THREE.MeshStandardMaterial({ color: 0x9a90a8, roughness: 0.95, metalness: 0, flatShading: true }));
      const im = new THREE.InstancedMesh(geo, mat, n);
      const mrng = makeRng(p.planetSeed, 'lunas-menores');
      const data = [];
      const inner = 2.2, outer = Math.max(3.2, (p.alcanceEscena / p.radio) * 0.95);
      for (let i = 0; i < n; i++) {
        const d = inner + Math.pow(mrng(), 0.8) * (outer - inner);
        data.push({ d, ph: mrng() * 6.283, w: (2 * Math.PI) / (6 * Math.pow(d / 2, 1.5)) * (mrng() < 0.12 ? -1 : 1), inc: (mrng() - 0.5) * (mrng() < 0.2 ? 1.2 : 0.25), s: 0.025 + Math.pow(mrng(), 3) * 0.07 });
      }
      im.userData.data = data;
      extras.add(im);
      entry.minor = im;
    }

    // Esfera de Hill y límite de Roche (capa de zonas)
    {
      const hill = new THREE.Mesh(track(new THREE.SphereGeometry(Math.max(p.alcanceEscena / p.radio, 2.6), 32, 16)), track(new THREE.MeshBasicMaterial({ color: 0x8f7bff, wireframe: true, transparent: true, opacity: 0.06, depthWrite: false })));
      const roche = new THREE.LineLoop(track(new THREE.BufferGeometry().setFromPoints(circlePoints(2.44, 96))), track(new THREE.LineBasicMaterial({ color: 0xff7a9a, transparent: true, opacity: 0.55, depthWrite: false })));
      const zg = new THREE.Group(); zg.add(hill, roche); zg.userData.capa = 'zonas';
      extras.add(zg);
      entry.zoneGroup = zg;
    }

    // Anillos gigantes (anomalía)
    if (p.anomalia === 'anillo-gigante') {
      const rg = new THREE.Mesh(track(new THREE.RingGeometry(3, 3 + p.alcanceEscena / p.radio * 0.8, 256, 1)), track(new THREE.ShaderMaterial({
        vertexShader: ZONE_VERT, fragmentShader: /* glsl */`
          uniform float uIn; uniform float uOut; varying vec2 vXY;
          float h(float x){ return fract(sin(x * 127.1) * 43758.5); }
          void main(){ float r = length(vXY); float t = (r - uIn) / (uOut - uIn);
            float b = 0.5 + 0.5 * sin(t * 90.0 + h(floor(t * 30.0)) * 6.0) * h(floor(t * 60.0));
            float a = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.85, t) * b * 0.42;
            vec3 c = mix(vec3(0.85, 0.75, 1.0), vec3(1.0, 0.8, 0.6), t);
            gl_FragColor = vec4(c * a, a); }`,
        uniforms: { uIn: { value: 3 }, uOut: { value: 3 + p.alcanceEscena / p.radio * 0.8 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      })));
      rg.rotation.x = -Math.PI / 2 + 0.35;
      extras.add(rg);
    }

    // Planeta desintegrándose: cola de roca evaporada
    if (p.anomalia === 'desintegrandose') {
      const tail = makeTail(0, 900, 0xffa060, 0xffb070, makeRng(p.planetSeed, 'cola'));
      track(tail.geometry); track(tail.material); pxMaterials.push(tail.material);
      group.add(tail);
      entry.tails.push({ points: tail, len: 30, spread: 0.7 });
    }

    // Civilización visible
    const civ = p.civilizacion;
    if (civ) buildCivilization(entry, civ);

    const b = { id: p.id, tipo: 'planeta', nombre: p.nombre, subtitulo: `${p.designacion} · ${p.tipoNombre}`, radio: p.radio, position: v3(), datos: p, object3D: h.group, alcance: p.alcanceEscena };
    bodies.push(b);
    entry.body = b;
  }

  function buildCivilization(entry, civ) {
    const { p, h, extras } = entry;
    const crng = makeRng(p.planetSeed, 'civ');
    const civGroup = new THREE.Group(); civGroup.userData.capa = 'civilizacion';
    extras.add(civGroup);
    entry.civGroup = civGroup;
    const warm = new THREE.Color(crng.pick([0xffc46b, 0xffb35a, 0xfff0b0, 0xd8a0ff, 0x8fe0ff]));
    // Luces de ciudades: hija de la superficie para girar con ella
    if (civ.rasgos.includes('luces') || civ.rasgos.includes('ruinas')) {
      const m = new THREE.Mesh(track(new THREE.SphereGeometry(1.006, 96, 48)), track(new THREE.ShaderMaterial({
        vertexShader: CITY_VERT, fragmentShader: CITY_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: {
          uLightDir: { value: h.lightDirection }, uColor: { value: warm }, uColor2: { value: new THREE.Color(0x9fe8ff) }, uSeed: { value: crng() * 50 },
          uDensity: { value: civ.extinta ? 0.08 : 0.25 + civ.nivel * 0.1 }, uTime: { value: 0 },
        },
      })));
      realTimeUniforms.push(m.material.uniforms.uTime);
      h.mesh.add(m);
      entry.cityMesh = m;
    }
    // Estaciones orbitales
    for (let i = 0; i < civ.estaciones; i++) {
      const st = new THREE.Group();
      const ringR = 0.16 + crng() * 0.08;
      const mat = track(new THREE.MeshStandardMaterial({ color: 0xcfc8e8, metalness: 0.7, roughness: 0.35, emissive: warm, emissiveIntensity: 0.12 }));
      const torus = new THREE.Mesh(track(new THREE.TorusGeometry(ringR, ringR * 0.18, 8, 32)), mat);
      const hub = new THREE.Mesh(track(new THREE.CylinderGeometry(ringR * 0.18, ringR * 0.18, ringR * 1.4, 10)), mat);
      hub.rotation.x = Math.PI / 2;
      const spoke = new THREE.Mesh(track(new THREE.BoxGeometry(ringR * 2, ringR * 0.06, ringR * 0.06)), mat);
      const spoke2 = spoke.clone(); spoke2.rotation.z = Math.PI / 2;
      st.add(torus, hub, spoke, spoke2);
      const blink = glowPoints([0, 0, 0], [warm.r * 2, warm.g * 2, warm.b * 2], [ringR * 0.9 * p.radio], { blink: 1 });
      track(blink.geometry); track(blink.material); pxMaterials.push(blink.material); realTimeUniforms.push(blink.material.uniforms.uTime);
      st.add(blink);
      const orbit = new THREE.Group();
      orbit.rotation.set((crng() - 0.5) * 1.2, crng() * 6.28, (crng() - 0.5) * 0.8);
      const d = 1.9 + crng() * 1.3;
      st.position.set(d, 0, 0);
      orbit.add(st);
      civGroup.add(orbit);
      entry.spinners.push({ obj: orbit, w: 0.5 / Math.pow(d, 1.5) }, { obj: st, w: 0.6 });
    }
    // Anillo orbital + ascensores (giran con la superficie)
    if (civ.rasgos.includes('anillo-orbital')) {
      const ring = new THREE.Mesh(track(new THREE.TorusGeometry(1.5, 0.014, 6, 256)), track(new THREE.ShaderMaterial({
        vertexShader: UV_VERT, fragmentShader: RINGSTRUCT_FRAG, uniforms: { uColor: { value: warm.clone().multiplyScalar(1.2) }, uTime: { value: 0 } },
      })));
      realTimeUniforms.push(ring.material.uniforms.uTime);
      ring.rotation.x = Math.PI / 2;
      const ringHolder = new THREE.Group(); ringHolder.add(ring); ringHolder.userData.capa = 'civilizacion';
      const pts = [];
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.3; pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), new THREE.Vector3(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5)); }
      const lifts = new THREE.LineSegments(track(new THREE.BufferGeometry().setFromPoints(pts)), track(new THREE.LineBasicMaterial({ color: warm, transparent: true, opacity: 0.8 })));
      ringHolder.add(lifts);
      h.mesh.add(ringHolder);
      entry.ringHolder = ringHolder;
    }
    // Ruinas: arcos rotos a la deriva
    if (civ.rasgos.includes('ruinas')) {
      const mat = track(new THREE.MeshStandardMaterial({ color: 0x4a4458, metalness: 0.6, roughness: 0.7, emissive: 0x2a1840, emissiveIntensity: 0.3 }));
      for (let i = 0; i < 7; i++) {
        const arc = new THREE.Mesh(track(new THREE.TorusGeometry(1.7 + crng() * 0.5, 0.025, 5, 24, 0.3 + crng() * 0.7)), mat);
        arc.rotation.set(Math.PI / 2 + (crng() - 0.5) * 0.3, crng() * 6.28, (crng() - 0.5) * 0.3);
        civGroup.add(arc);
        entry.spinners.push({ obj: arc, w: (crng() - 0.5) * 0.05 });
      }
    }
    // Faro
    if (civ.rasgos.includes('faro')) {
      const f = glowPoints([0, 2.6, 0], [0.7, 1.4, 2.2], [0.6 * p.radio], { blink: 1 });
      track(f.geometry); track(f.material); pxMaterials.push(f.material); realTimeUniforms.push(f.material.uniforms.uTime);
      civGroup.add(f);
    }
  }

  /* ---------------- Megaestructuras de Dyson ---------------- */
  const dysons = [];
  for (const p of spec.planetas) {
    const civ = p.civilizacion;
    if (!civ || civ.nivel < 4) continue;
    const host = nodeById.get(p.orbita.alrededorDe);
    const ss = starsUnder(host).filter((s) => !['agujero-negro', 'neutrones', 'pulsar', 'magnetar', 'estrella-quark'].includes(s.clase));
    if (!ss.length) continue;
    const target = ss.sort((a, b) => b.luminosidadSol - a.luminosidadSol)[0];
    if (dysons.some((d) => d.star === target)) continue;
    const drng = makeRng(spec.seed, 'dyson-' + target.id);
    const R = target.radio * (civ.nivel >= 5 ? 2.4 : 2.0) + 0.8;
    const g = new THREE.Group(); g.userData.capa = 'civilizacion';
    const panelMat = track(new THREE.MeshStandardMaterial({ color: 0x241f38, metalness: 0.85, roughness: 0.28, emissive: 0x7a4dff, emissiveIntensity: 0.22, side: THREE.DoubleSide }));
    // Enjambre: anillos inclinados de paneles hexagonales
    const nRings = civ.nivel >= 5 ? 5 : drng.int(3, 6), perRing = 90;
    const im = new THREE.InstancedMesh(track(new THREE.CircleGeometry(1, 6)), panelMat, nRings * perRing);
    const rings = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = v3(), sc = v3();
    for (let r = 0; r < nRings; r++) rings.push({ q: new THREE.Quaternion().setFromEuler(new THREE.Euler(drng.range(-1.2, 1.2), drng.range(0, 6.28), drng.range(-1.2, 1.2))), rad: R * drng.range(1.05, 1.35), w: drng.range(0.04, 0.09) * (drng() < 0.5 ? -1 : 1), ph: drng() * 6.28 });
    im.userData = { rings, perRing, m4, q, pos, sc, size: target.radio * 0.11 };
    g.add(im);
    // Esfera parcial (tipo II): armazón geodésico + paneles en la mitad de las caras
    if (civ.nivel >= 5) {
      const ico = track(new THREE.IcosahedronGeometry(R * 1.5, 3));
      const edges = new THREE.LineSegments(track(new THREE.EdgesGeometry(ico)), track(new THREE.LineBasicMaterial({ color: 0xb08cff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })));
      const posA = ico.attributes.position.array; const keep = [];
      for (let f = 0; f < posA.length / 9; f++) {
        const cx = posA[f * 9] + posA[f * 9 + 3] + posA[f * 9 + 6], cy = posA[f * 9 + 1] + posA[f * 9 + 4] + posA[f * 9 + 7];
        if (Math.sin(cx * 0.7 / R) + Math.cos(cy * 0.9 / R) + drng() * 0.8 > 0.6) for (let k = 0; k < 9; k++) keep.push(posA[f * 9 + k]);
      }
      const shell = new THREE.Mesh(track(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(keep, 3))), panelMat);
      shell.geometry.computeVertexNormals();
      g.add(edges, shell);
      g.userData.rotW = 0.01;
    }
    trackObj(g);
    layers.civilizacion.add(g);
    dysons.push({ star: target, group: g, im, node: starNode.get(target.id) });
  }
  function updateDysons(dt) {
    for (const d of dysons) {
      d.group.position.copy(d.node._pos);
      if (d.group.userData.rotW) d.group.rotation.y += d.group.userData.rotW * dt;
      const u = d.im.userData; let k = 0;
      for (const r of u.rings) {
        for (let i = 0; i < u.perRing; i++) {
          const a = r.ph + (i / u.perRing) * Math.PI * 2 + state.real * r.w;
          u.pos.set(Math.cos(a) * r.rad, Math.sin(i * 1.7) * 0.15, Math.sin(a) * r.rad).applyQuaternion(r.q);
          u.m4.lookAt(u.pos, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
          u.sc.setScalar(u.size * (0.7 + 0.3 * Math.sin(i * 3.1)));
          u.m4.scale(u.sc); u.m4.setPosition(u.pos);
          d.im.setMatrixAt(k++, u.m4);
        }
      }
      d.im.instanceMatrix.needsUpdate = true;
    }
  }

  /* ---------------- Tráfico interplanetario ---------------- */
  let traffic = null;
  {
    const civs = planets.filter((e) => e.p.civilizacion && !e.p.civilizacion.extinta && e.p.civilizacion.nivel >= 3);
    const routes = [];
    for (const e of civs) {
      const others = planets.filter((o) => o !== e && o.host === e.host);
      const trng = makeRng(e.p.planetSeed, 'rutas');
      const n = Math.min(others.length, 1 + Math.floor(e.p.civilizacion.nivel / 2));
      const pool = [...others].sort(() => trng() - 0.5).slice(0, n);
      for (const o of pool) routes.push([e, o]);
    }
    if (routes.length) {
      const R = routes.slice(0, 8);
      const N = 70 * R.length;
      const g = new THREE.BufferGeometry();
      const aRoute = new Float32Array(N), aPh = new Float32Array(N), aSp = new Float32Array(N), aOff = new Float32Array(N * 3);
      const trng = makeRng(spec.seed, 'trafico');
      for (let i = 0; i < N; i++) { aRoute[i] = i % R.length; aPh[i] = trng(); aSp[i] = (0.02 + trng() * 0.03) * (trng() < 0.5 ? 1 : -1); aOff.set([(trng() - 0.5), (trng() - 0.5) * 0.4, (trng() - 0.5)], i * 3); }
      g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
      g.setAttribute('aRoute', new THREE.Float32BufferAttribute(aRoute, 1));
      g.setAttribute('aPh', new THREE.Float32BufferAttribute(aPh, 1));
      g.setAttribute('aSp', new THREE.Float32BufferAttribute(aSp, 1));
      g.setAttribute('aOff', new THREE.Float32BufferAttribute(aOff, 3));
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uA: { value: R.map(() => v3()) }, uB: { value: R.map(() => v3()) }, uC: { value: R.map(() => v3()) }, uReal: { value: 0 }, uPx: { value: 600 } },
        vertexShader: /* glsl */`
          #define NR ${R.length}
          attribute float aRoute; attribute float aPh; attribute float aSp; attribute vec3 aOff;
          uniform vec3 uA[NR]; uniform vec3 uB[NR]; uniform vec3 uC[NR]; uniform float uReal; uniform float uPx;
          varying float vT; varying float vDir;
          void main(){
            int r = int(aRoute + 0.5);
            float t = fract(aPh + uReal * aSp);
            vec3 a = uA[r], b = uB[r], c = uC[r];
            vec3 p = mix(mix(a, c, t), mix(c, b, t), t) + aOff * sin(t * 3.14159) * 1.4;
            vT = t; vDir = sign(aSp);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = clamp(0.5 * uPx / max(-mv.z, 0.001), 1.5, 7.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */`
          varying float vT; varying float vDir;
          void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard;
            float fade = smoothstep(0.0, 0.08, vT) * smoothstep(1.0, 0.92, vT);
            vec3 c = vDir > 0.0 ? vec3(1.0, 0.82, 0.5) : vec3(0.55, 0.85, 1.0);
            float a = exp(-r * 3.0) * fade; gl_FragColor = vec4(c * a * 1.6, a); }`,
      });
      const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.userData.capa = 'civilizacion';
      track(g); track(mat); pxMaterials.push(mat);
      layers.civilizacion.add(pts);
      traffic = { pts, routes: R };
    }
  }
  function updateTraffic() {
    if (!traffic) return;
    const u = traffic.pts.material.uniforms;
    traffic.routes.forEach(([a, b], i) => {
      u.uA.value[i].copy(a.h.group.position); u.uB.value[i].copy(b.h.group.position);
      const mid = u.uC.value[i].copy(a.h.group.position).add(b.h.group.position).multiplyScalar(0.5);
      const off = v3().copy(b.h.group.position).sub(a.h.group.position);
      mid.add(v3(-off.z, off.length() * 0.08, off.x).multiplyScalar(0.18));
    });
    u.uReal.value = state.real;
  }

  /* ---------------- Cinturones y discos ---------------- */
  const belts = [];
  for (const c of spec.cinturones) {
    const node = nodeById.get(c.alrededorDe);
    const crng = makeRng(spec.seed, 'belt-' + c.id);
    const g = new THREE.Group(); g.name = `cinturon:${c.id}`;
    if (c.tipo === 'disco-protoplanetario') {
      const inner = Math.max(c.interiorEscena, node.nucleo * 0.6), outer = Math.max(c.exteriorEscena, inner * 3);
      const gaps = c.huecosEscena.slice(0, 8); while (gaps.length < 8) gaps.push(-1000);
      const mesh = new THREE.Mesh(track(new THREE.RingGeometry(inner, outer, 256, 4)), track(new THREE.ShaderMaterial({
        vertexShader: ZONE_VERT, fragmentShader: DISK_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { uIn: { value: inner }, uOut: { value: outer }, uGaps: { value: gaps }, uGapCount: { value: c.huecosEscena.length }, uTime: { value: 0 }, uColA: { value: new THREE.Color(0xffa060) }, uColB: { value: new THREE.Color(0x6a3aa0) } },
      })));
      mesh.rotation.x = -Math.PI / 2;
      realTimeUniforms.push(mesh.material.uniforms.uTime);
      g.add(mesh);
    }
    const isDisk = c.tipo === 'disco-protoplanetario';
    const lo = c.interiorEscena, hi = Math.max(c.exteriorEscena, lo * 1.05);
    const area = (hi * hi - lo * lo);
    const N = Math.round(THREE.MathUtils.clamp(area * (c.tipo === 'hielo' ? 0.12 : isDisk ? 0.08 : 0.5), 1200, c.tipo === 'hielo' ? 9000 : 7000) * (detail === 'baja' ? 0.5 : 1));
    const aR = new Float32Array(N), aPh = new Float32Array(N), aW = new Float32Array(N), aY = new Float32Array(N), aS = new Float32Array(N), aT = new Float32Array(N);
    const gaps = c.huecosKirkwood ? c.huecosEscena : [];
    const gapW = (hi - lo) * 0.02;
    const thick = c.tipo === 'hielo' ? 0.06 : c.tipo === 'escombros' ? 0.02 : 0.025;
    for (let i = 0; i < N; i++) {
      let r;
      for (let tries = 0; tries < 8; tries++) {
        const u = crng();
        r = c.tipo === 'asteroides' || c.tipo === 'cristal' ? lo + (hi - lo) * (0.5 + 0.5 * Math.sin((u - 0.5) * Math.PI)) : lo + (hi - lo) * u;
        if (!gaps.some((gp) => Math.abs(r - gp) < gapW * (0.6 + crng() * 0.6))) break;
      }
      const f = (r - lo) / (hi - lo);
      const aUA = c.interiorUA + (c.exteriorUA - c.interiorUA) * f;
      aR[i] = r; aPh[i] = crng() * Math.PI * 2;
      aW[i] = (2 * Math.PI) / periodDays(aUA, node.M) * (0.97 + crng() * 0.06);
      aY[i] = (crng() + crng() + crng() - 1.5) * r * thick;
      aS[i] = (c.tipo === 'hielo' ? 0.16 : 0.12) * (0.4 + Math.pow(crng(), 4) * 2.4);
      aT[i] = crng();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    for (const [k, arr] of [['aR', aR], ['aPhase', aPh], ['aW', aW], ['aY', aY], ['aSize', aS], ['aTint', aT]]) geo.setAttribute(k, new THREE.Float32BufferAttribute(arr, 1));
    const cols = { asteroides: [0x9a8a7a, 0xc8b8a8], hielo: [0x9ab8e8, 0xe0e8ff], escombros: [0xd09870, 0xa080c0], cristal: [0xc0b0ff, 0xffffff], 'disco-protoplanetario': [0xd08850, 0x8a60c0] }[c.tipo];
    const mat = new THREE.ShaderMaterial({
      vertexShader: BELT_VERT, fragmentShader: BELT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPx: { value: 600 }, uColorA: { value: new THREE.Color(cols[0]) }, uColorB: { value: new THREE.Color(cols[1]) }, uOpacity: { value: c.tipo === 'hielo' ? 0.55 : 0.85 }, uCrystal: { value: c.tipo === 'cristal' ? 1 : 0 }, uReal: { value: 0 } },
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
    track(geo); track(mat); pxMaterials.push(mat); simTimeUniforms.push(mat.uniforms.uTime); realTimeUniforms.push(mat.uniforms.uReal);
    g.add(pts);
    trackObj(g);
    layers.cinturones.add(g);
    belts.push({ c, g, node });
    bodies.push({ id: c.id, tipo: 'cinturon', nombre: c.tipoNombre, subtitulo: `${c.interiorUA}–${c.exteriorUA} UA`, radio: 0, position: v3(), datos: c, ancla: (out) => out.copy(node._pos).add(v3((lo + hi) / 2, 0, 0)) });
  }

  /* ---------------- Troyanos y puntos de Lagrange de planetas ---------------- */
  const trojans = [];
  for (const lg of spec.gravedad.lagrange) {
    const e = planets.find((x) => x.p.id === lg.planeta);
    if (!e) continue;
    const d = e.p.orbita.aEscena;
    const hillVis = Math.max(e.p.alcanceEscena * 1.2, d * Math.cbrt(lg.mu / 3));
    // Marcadores L1..L5 en el marco que gira con el planeta (radio d, ángulo 0 = planeta)
    const L = { L1: [d - hillVis, 0], L2: [d + hillVis, 0], L3: [-d * (1 + 5 * lg.mu / 12), 0], L4: [d * 0.5, d * 0.866], L5: [d * 0.5, -d * 0.866] };
    const frame = new THREE.Group(); frame.name = `lagrange:${e.p.id}`;
    const lp = [], lc = [], ls = [];
    for (const k of Object.keys(L)) { lp.push(L[k][0], 0, L[k][1]); lc.push(1, 0.85, 0.45); ls.push(0.55); }
    const lpts = glowPoints(lp, lc, ls, { shape: 1, opacity: 0.9 });
    trackObj(lpts); pxMaterials.push(lpts.material); realTimeUniforms.push(lpts.material.uniforms.uTime);
    frame.add(lpts);
    const zf = new THREE.Group(); zf.add(frame); layers.zonas.add(zf);
    const marks = Object.keys(L).map((k) => { const b = { id: `${e.p.id}-${k}`, tipo: 'lagrange', nombre: `${k} de ${e.p.nombre}`, subtitulo: k === 'L4' || k === 'L5' ? 'Punto de Lagrange estable (troyanos)' : 'Punto de Lagrange inestable', radio: 0.4, position: v3(), local: new THREE.Vector3(L[k][0], 0, L[k][1]), capa: 'zonas' }; bodies.push(b); return b; });
    // Nubes troyanas en L4 y L5 (siempre visibles: son rocas de verdad)
    let swarm = null;
    if (lg.troyanos) {
      const trng = makeRng(e.p.planetSeed, 'troyanos');
      const N = 900; const pos = [], col = [], size = [];
      for (let i = 0; i < N; i++) {
        const side = i % 2 ? 1 : -1;
        const ang = side * (Math.PI / 3) + (trng() + trng() - 1) * 0.32;
        const r = d * (1 + (trng() + trng() - 1) * 0.045);
        pos.push(Math.cos(ang) * r, (trng() - 0.5) * d * 0.03, Math.sin(ang) * r);
        const b = 0.35 + trng() * 0.35; col.push(0.75 * b, 0.65 * b, 0.6 * b); size.push(0.12 + Math.pow(trng(), 4) * 0.25);
      }
      swarm = glowPoints(pos, col, size, { opacity: 0.8 });
      trackObj(swarm); pxMaterials.push(swarm.material);
      const sg = new THREE.Group(); sg.add(swarm); layers.cinturones.add(sg);
      swarm.userData.holder = sg;
    }
    trojans.push({ e, frame: zf, marks, swarm });
  }
  const _ang = v3();
  function updateTrojans() {
    for (const tj of trojans) {
      const host = tj.e.host._pos;
      _ang.copy(tj.e.h.group.position).sub(host);
      const ang = Math.atan2(-_ang.z, _ang.x);
      tj.frame.position.copy(host); tj.frame.rotation.y = ang;
      tj.frame.updateMatrixWorld(true);
      for (const m of tj.marks) m.position.copy(m.local).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang).add(host);
      if (tj.swarm) { const hg = tj.swarm.userData.holder; hg.position.copy(host); hg.rotation.y = ang; }
    }
  }

  /* ---------------- Cometas ---------------- */
  const comets = [];
  for (const c of spec.cometas) {
    const node = nodeById.get(c.alrededorDe);
    const crng = makeRng(spec.seed, c.id);
    const head = glowPoints([0, 0, 0], [1.4, 1.6, 2.0], [0.45], { opacity: 1 });
    trackObj(head); pxMaterials.push(head.material);
    const tail = makeTail(500, 700, 0x7ab8ff, 0xfff0d8, crng);
    trackObj(tail); pxMaterials.push(tail.material);
    const orbitLine = lineLoop(ellipsePoints(c.orbita), 0x7ab8ff, 0.12);
    trackObj(orbitLine); layers.orbitas.add(orbitLine);
    group.add(head, tail);
    const b = { id: c.id, tipo: 'cometa', nombre: c.nombre, subtitulo: `Cometa · e = ${c.orbita.e}`, radio: 0.5, position: v3(), datos: c, object3D: head };
    bodies.push(b);
    comets.push({ c, node, head, tail, orbitLine, body: b, prev: v3() });
  }

  /* ---------------- Anomalías ---------------- */
  const anomalies = [];
  for (const a of spec.anomalias) {
    if (a.tipo === 'agujero-de-gusano') {
      const R = 3.2;
      const m = new THREE.Mesh(track(new THREE.SphereGeometry(R, 64, 32)), track(new THREE.ShaderMaterial({ vertexShader: WORM_VERT, fragmentShader: WORM_FRAG, uniforms: { uTime: { value: 0 } } })));
      realTimeUniforms.push(m.material.uniforms.uTime);
      const halo = glowPoints([0, 0, 0], [0.8, 0.5, 1.6], [R * 5], { opacity: 0.6 });
      trackObj(halo); pxMaterials.push(halo.material);
      const g = new THREE.Group(); g.add(m, halo);
      g.position.set(Math.cos(a.fase) * a.distanciaEscena, a.distanciaEscena * 0.06, Math.sin(a.fase) * a.distanciaEscena);
      group.add(g);
      const b = { id: a.id, tipo: 'anomalia', nombre: a.nombre, subtitulo: 'Anomalía', radio: R, position: g.position.clone(), datos: a, object3D: g, lens: { radius: R * 2.2, strength: 0.75 } };
      bodies.push(b); anomalies.push({ a, g, b });
    } else if (a.tipo === 'baliza-antigua') {
      const core = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.5)), track(new THREE.MeshStandardMaterial({ color: 0x8a80a0, metalness: 0.9, roughness: 0.2, emissive: 0x40ffd0, emissiveIntensity: 0.5 })));
      const pulse = glowPoints([0, 0, 0], [0.4, 2.0, 1.6], [3], { opacity: 1 });
      trackObj(pulse); pxMaterials.push(pulse.material);
      const g = new THREE.Group(); g.add(core, pulse);
      g.position.set(Math.cos(a.fase) * a.distanciaEscena, -a.distanciaEscena * 0.04, Math.sin(a.fase) * a.distanciaEscena);
      group.add(g);
      const b = { id: a.id, tipo: 'anomalia', nombre: a.nombre, subtitulo: 'Señal desconocida', radio: 0.6, position: g.position.clone(), datos: a, object3D: g };
      bodies.push(b); anomalies.push({ a, g, b, core, pulse });
    }
  }

  /* ---------------- Visibilidad de capas ---------------- */
  const visible = { orbitas: true, zonas: false, civilizacion: true, cinturones: true };
  function applyVisibility() {
    layers.orbitas.visible = visible.orbitas;
    layers.zonas.visible = visible.zonas;
    layers.civilizacion.visible = visible.civilizacion;
    layers.cinturones.visible = visible.cinturones;
    for (const e of planets) {
      if (e.zoneGroup) e.zoneGroup.visible = visible.zonas;
      if (e.civGroup) e.civGroup.visible = visible.civilizacion;
      if (e.ringHolder) e.ringHolder.visible = visible.civilizacion;
      if (e.cityMesh) e.cityMesh.visible = visible.civilizacion;
    }
  }
  function setVisible(patch) { Object.assign(visible, patch); applyVisibility(); }
  applyVisibility();

  /* ---------------- Bucle ---------------- */
  const _lc = v3(), _tmp = v3(), _wp = v3();
  let pxScale = 600;
  const lenses = [];

  function update(dt = 1 / 60, camera = null) {
    dt = Math.min(dt, 0.1);
    state.real += dt;
    if (!state.paused) state.t += dt * state.timeScale;
    const t = state.t;
    if (camera && camera.isPerspectiveCamera && opts.viewportHeight) pxScale = opts.viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    placeNodes(t);
    for (const u of updaters) u();
    updatePairFrames();

    // Estrellas
    for (const s of stars) s.handle.update(dt, state.real, camera);

    // Planetas
    const spinDt = state.paused ? 0 : dt * THREE.MathUtils.clamp(state.timeScale / 2, 0.25, 6);
    for (const e of planets) {
      keplerPosition(e.p.orbita, t, _k);
      e.h.group.position.set(_k.x, _k.y, _k.z).add(e.host._pos);
      e.orbitLine.position.copy(e.host._pos);
      e.h.update(spinDt);
      lightCenter(e.host, e.lightPos);
      e.h.lightDirection.copy(e.lightPos).sub(e.h.group.position).normalize();
      e.body.position.copy(e.h.group.position);
      if (e.minor) {
        const im = e.minor, data = im.userData.data, m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
        for (let i = 0; i < data.length; i++) {
          const d = data[i];
          d.cur = (d.cur ?? d.ph) + (state.paused ? 0 : dt * d.w * THREE.MathUtils.clamp(state.timeScale / 2, 0.3, 8));
          _tmp.set(Math.cos(d.cur) * d.d, Math.sin(d.cur) * d.d * d.inc, Math.sin(d.cur) * d.d);
          m4.compose(_tmp, q, _wp.setScalar(d.s));
          im.setMatrixAt(i, m4);
        }
        im.instanceMatrix.needsUpdate = true;
      }
      for (const sp of e.spinners) sp.obj.rotation.y += sp.w * spinDt;
      for (const tl of e.tails) {
        const u = tl.points.material.uniforms;
        u.uHead.value.copy(e.h.group.position);
        u.uAway.value.copy(e.h.group.position).sub(e.lightPos).normalize();
        keplerPosition(e.p.orbita, t + e.p.orbita.periodoDias * 0.01, _k);
        u.uVel.value.set(_k.x, _k.y, _k.z).add(e.host._pos).sub(e.h.group.position).normalize();
        u.uLen.value = tl.len * (e.p.radio + 0.5); u.uReal.value = state.real; u.uSpread.value = tl.spread;
      }
    }

    // Cometas
    for (const c of comets) {
      keplerPosition(c.c.orbita, t, _k);
      const pos = _tmp.set(_k.x, _k.y, _k.z).add(c.node._pos);
      c.head.position.copy(pos);
      c.orbitLine.position.copy(c.node._pos);
      c.body.position.copy(pos);
      lightCenter(c.node, _lc);
      const dist = pos.distanceTo(_lc);
      const u = c.tail.material.uniforms;
      u.uHead.value.copy(pos);
      u.uAway.value.copy(pos).sub(_lc).normalize();
      keplerPosition(c.c.orbita, t + c.c.orbita.periodoDias * 0.002, _k);
      u.uVel.value.set(_k.x, _k.y, _k.z).add(c.node._pos).sub(pos).normalize();
      const Lroot = Math.max(root.L, 0.05);
      u.uLen.value = THREE.MathUtils.clamp(900 * Math.sqrt(Lroot) / (dist + 20), 2, 70);
      u.uOpacity.value = THREE.MathUtils.clamp(60 / (dist + 10), 0.15, 1.2);
      u.uReal.value = state.real;
    }

    updateDysons(dt);
    updateTrojans();
    updateTraffic();
    for (const b of belts) b.g.position.copy(b.node._pos);
    for (const b of bodies) if (b.ancla) b.ancla(b.position);
    for (const an of anomalies) {
      an.g.rotation.y += dt * 0.1;
      if (an.pulse) { const ph = (state.real % 7.3) / 7.3; an.pulse.material.uniforms.uOpacity.value = Math.max(0, 1 - ph * 3) * 1.5 + 0.08; }
    }
    for (const u of realTimeUniforms) u.value = state.real;
    for (const u of simTimeUniforms) u.value = t;
    for (const m of pxMaterials) m.uniforms.uPx.value = pxScale;

    // Lentes gravitatorias (posiciones en mundo)
    lenses.length = 0;
    group.updateMatrixWorld();
    for (const s of stars) if (s.handle.lens) lenses.push({ position: s.handle.group.getWorldPosition(v3()), radius: s.handle.lens.radius, strength: s.handle.lens.strength, id: s.star.id });
    for (const an of anomalies) if (an.b.lens) lenses.push({ position: an.g.getWorldPosition(v3()), radius: an.b.lens.radius, strength: an.b.lens.strength, id: an.a.id });
  }

  function setTimeScale(daysPerSecond) { state.timeScale = daysPerSecond; }
  function setPaused(p) { state.paused = !!p; }
  function setViewportHeight(h) { opts.viewportHeight = h; }
  function getBody(id) { return bodies.find((b) => b.id === id) || null; }

  function dispose() {
    group.removeFromParent();
    for (const s of stars) s.handle.dispose();
    for (const e of planets) e.h.dispose();
    for (const d of disposables) d.dispose?.();
    disposables.length = 0;
  }

  if (!opts.viewportHeight) opts.viewportHeight = 800;
  update(0);

  return {
    group, spec, bodies, lenses, layers, state,
    update, setTimeScale, setPaused, setVisible, visible, setViewportHeight, getBody, dispose,
    get time() { return state.t; }, set time(v) { state.t = v; },
    get timeScale() { return state.timeScale; },
    extension: spec.extensionEscena,
  };
}
