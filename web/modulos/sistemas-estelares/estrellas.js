// estrellas.js · Estrellas procedurales para los sistemas estelares de La Malkevnia
// Módulo ES autocontenido. Depende solo de 'three' (probado con three@0.160.0
// vía importmap). Sin texturas: todo se genera en GLSL. Determinista: la
// misma semilla produce siempre la misma estrella (manchas, protuberancias,
// inclinación del disco, forma de la nebulosa...).
//
// API pública:
//   createStar(star, opts)        -> { group, update(dt, time, camera), dispose(), glowRadius, lens, nebulaRadius, coreRadius }
//   LensingShader                 -> shader para ShaderPass (lente gravitatoria en pantalla)
//   lensUniformsFrom(lenses, camera, uniforms) -> rellena uLenses/uCount/uAspect
//   STAR_CLASSES                  -> lista de clases soportadas
//
// Orden de render usado (transparentes): nebulosa 1, disco emisivo 2,
// corona/halo 3, arco de lente 4, protuberancias/líneas 5, disco de polvo 6, chorros/haces 7.

import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Aleatoriedad determinista                                          */
/* ------------------------------------------------------------------ */

function hashString(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed, salt = '') {
  const r = mulberry32(hashString(String(seed) + '|' + salt));
  const rng = () => r();
  rng.range = (a, b) => a + (b - a) * r();
  rng.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  rng.chance = (p) => r() < p;
  rng.unit = () => {
    const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    return new THREE.Vector3(s * Math.cos(a), z, s * Math.sin(a));
  };
  return rng;
}

/* ------------------------------------------------------------------ */
/*  Color                                                               */
/* ------------------------------------------------------------------ */

// Aproximación de cuerpo negro (Tanner Helland) -> THREE.Color (sRGB de entrada)
function kelvinToColor(k) {
  const t = THREE.MathUtils.clamp(k, 1000, 40000) / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v) => THREE.MathUtils.clamp(v, 0, 255) / 255;
  return new THREE.Color().setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
}

const col = (hex) => new THREE.Color(hex);

/* ------------------------------------------------------------------ */
/*  Catálogo de clases                                                  */
/* ------------------------------------------------------------------ */
// modo: shader de fotosfera (0 normal, 1 gigante, 2 violeta, 3 enana marrón, 4 quark, 5 compacta, 6 protoestrella)

const CLASES = {
  'O':                { tipo: 'normal', modo: 0, T: 38000, R: 6,    L: 1e5,  I: 1.8, celda: 40, contraste: 0.45, halo: 4.2, rayos: 0.9, picos: 0.35, prom: 0x9fb8ff, flareK: 0.6 },
  'B':                { tipo: 'normal', modo: 0, T: 18000, R: 4.5,  L: 1e3,  I: 1.7, celda: 38, contraste: 0.5, halo: 3.8, rayos: 0.8, picos: 0.2, prom: 0xb0c4ff, flareK: 0.6 },
  'A':                { tipo: 'normal', modo: 0, T: 9000,  R: 3.5,  L: 20,   I: 1.55, celda: 36, contraste: 0.5, halo: 3.4, rayos: 0.7, picos: 0.1, prom: 0xd8dcff, flareK: 0.7 },
  'F':                { tipo: 'normal', modo: 0, T: 6800,  R: 3.2,  L: 3,    I: 1.45, celda: 34, contraste: 0.55, halo: 3.2, rayos: 0.7, picos: 0.0, prom: 0xffb3a0, flareK: 0.9 },
  'G':                { tipo: 'normal', modo: 0, T: 5700,  R: 3,    L: 1,    I: 1.25, celda: 34, contraste: 0.6, halo: 3.0, rayos: 0.8, picos: 0.0, prom: 0xff7a6a, flareK: 1.0 },
  'K':                { tipo: 'normal', modo: 0, T: 4500,  R: 2.6,  L: 0.3,  I: 1.35, celda: 32, contraste: 0.6, halo: 2.8, rayos: 0.7, picos: 0.0, prom: 0xff6a4a, flareK: 1.6 },
  'M':                { tipo: 'normal', modo: 0, T: 3200,  R: 2,    L: 0.02, I: 1.3, celda: 30, contraste: 0.6, halo: 2.6, rayos: 0.6, picos: 0.0, prom: 0xff5a3a, flareK: 3.0 },
  'estrella-violeta': { tipo: 'normal', modo: 2, T: 9000,  R: 3.5,  L: 5,    I: 1.35, celda: 2,  contraste: 1.0, halo: 3.4, rayos: 1.0, picos: 0.05, prom: 0xd070ff, flareK: 1.0, colorFijo: 0xb46bff },
  'enana-marron':     { tipo: 'normal', modo: 3, T: 1300,  R: 1.6,  L: 3e-5, I: 0.85, celda: 15, contraste: 1.0, halo: 1.9, rayos: 0.15, picos: 0.0, prom: 0xff3a6a, flareK: 0.4, colorFijo: 0x8a2a4e },
  'gigante-roja':     { tipo: 'gigante', modo: 1, T: 3600, R: 14,   L: 400,  I: 1.25, celda: 2.6, contraste: 0.9, halo: 2.0, rayos: 0.35, picos: 0.0, prom: 0xff5530, flareK: 0.3 },
  'supergigante-roja':{ tipo: 'gigante', modo: 1, T: 3400, R: 19,   L: 1e5,  I: 1.35, celda: 2.0, contraste: 1.0, halo: 2.1, rayos: 0.3, picos: 0.0, prom: 0xff4a28, flareK: 0.3 },
  'supergigante-azul':{ tipo: 'normal', modo: 0, T: 22000, R: 11,   L: 3e5,  I: 2.0, celda: 34, contraste: 0.45, halo: 4.6, rayos: 1.1, picos: 1.0, prom: 0x9fb8ff, flareK: 0.5 },
  'wolf-rayet':       { tipo: 'normal', modo: 0, T: 70000, R: 2.5,  L: 2e5,  I: 2.2, celda: 30, contraste: 0.4, halo: 5.0, rayos: 1.2, picos: 0.5, prom: 0xa98bff, flareK: 0.5, colorFijo: 0x9db0ff },
  'enana-blanca':     { tipo: 'compacta', modo: 5, T: 25000, R: 0.5, L: 0.01, I: 2.5, halo: 16, picos: 0.6, color2: 0xcfe0ff },
  'neutrones':        { tipo: 'compacta', modo: 5, T: 600000, R: 0.25, L: 0.5, I: 3.0, halo: 22, picos: 0.9, color2: 0xa8c8ff },
  'pulsar':           { tipo: 'compacta', modo: 5, T: 600000, R: 0.25, L: 0.5, I: 3.0, halo: 20, picos: 0.9, color2: 0xa8c8ff },
  'magnetar':         { tipo: 'compacta', modo: 5, T: 800000, R: 0.25, L: 1,   I: 3.0, halo: 20, picos: 0.7, color2: 0xc0a8ff },
  'estrella-quark':   { tipo: 'compacta', modo: 4, T: 900000, R: 0.35, L: 0.5, I: 2.0, halo: 16, picos: 0.5, color2: 0xffffff },
  'agujero-negro':    { tipo: 'agujero', modo: -1, T: 0, R: 1.2, L: 0, I: 1 },
  'protoestrella':    { tipo: 'normal', modo: 6, T: 3800, R: 3,    L: 5,    I: 1.5, celda: 3, contraste: 1.0, halo: 3.0, rayos: 0.4, picos: 0.0, prom: 0xff7a40, flareK: 1.5, colorFijo: 0xff9a5a },
};

export const STAR_CLASSES = Object.keys(CLASES);

const DETALLE = {
  alta:  { seg: 96, oct: 5, worley: true,  pasos: 44, prom: 6, discoSeg: 192, tubo: 64 },
  media: { seg: 64, oct: 4, worley: true,  pasos: 30, prom: 4, discoSeg: 128, tubo: 40 },
  baja:  { seg: 40, oct: 3, worley: false, pasos: 18, prom: 2, discoSeg: 96,  tubo: 24 },
};

/* ------------------------------------------------------------------ */
/*  GLSL compartido                                                     */
/* ------------------------------------------------------------------ */

const GLSL_RUIDO = /* glsl */`
// Ruido simplex 3D (Ashima / Stefan Gustavson)
vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
// fbm con OCT octavas (OCT se define por material según el detalle)
float fbm(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < OCT; i++) { s += a * snoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
vec3 hash33(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// Celdas de Voronoi animadas: devuelve (F1, F2)
vec2 worley(vec3 p, float t){
  vec3 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = hash33(i + g);
    o = 0.5 + 0.42 * sin(t + 6.2831 * o);
    vec3 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(vec2(d1, d2));
}
vec3 paleta(float t){ return 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + t)); }
`;

// Vértice común: posición de objeto, normal y posición en espacio de vista
const VERT_COMUN = /* glsl */`
varying vec3 vObj;
varying vec3 vNrmV;
varying vec3 vPosV;
varying vec2 vUv;
void main(){
  vObj = position;
  vUv = uv;
  vNrmV = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPosV = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

/* ---------------- Fotosfera ---------------- */

const FRAG_FOTOSFERA = /* glsl */`
uniform float uTime, uIntensity, uSpots, uActivity, uCellScale, uContrast, uFlare;
uniform vec3 uColor, uHot, uCool, uFlareDir, uSeed;
varying vec3 vObj; varying vec3 vNrmV; varying vec3 vPosV; varying vec2 vUv;
${GLSL_RUIDO}
void main(){
  vec3 p = normalize(vObj);
  float mu = clamp(dot(normalize(vNrmV), normalize(-vPosV)), 0.0, 1.0);
  float t = uTime;
  vec3 c = vec3(0.0);
  float fine = snoise(p * uCellScale * 2.3 + vec3(t * 0.08)) * 0.5 + 0.5;

#if MODE == 0
  // --- Estrella de secuencia principal: granulación, supergranulación, manchas, fáculas
  vec3 q = p * uCellScale + uSeed;
  float sup = fbm(p * 3.0 + uSeed + vec3(0.0, 0.0, t * 0.015));
  #ifdef WORLEY
    vec2 w = worley(q + sup * 0.4, t * 0.25);
    float gran = smoothstep(0.0, 0.65, w.y - w.x);
  #else
    float gran = 0.5 + 0.5 * snoise(q * 1.4 + vec3(t * 0.05));
  #endif
  float b = mix(1.0, 0.5 + 0.5 * gran + 0.05 * fine, uContrast);
  b *= 0.88 + 0.24 * sup;
  float sp = fbm(p * 1.7 + uSeed * 1.7 + vec3(t * 0.003, 0.0, 0.0));
  float latm = smoothstep(0.85, 0.35, abs(p.y)) * smoothstep(0.02, 0.14, abs(p.y));
  float pen = smoothstep(0.24, 0.31, sp * latm) * uSpots;
  float umb = smoothstep(0.34, 0.40, sp * latm) * uSpots;
  float fac = smoothstep(0.1, 0.5, sup) * pow(1.0 - mu, 1.5) * (0.25 + 0.7 * uActivity) * (1.0 - pen);
  float ld = 1.0 - 0.62 * (1.0 - pow(mu, 0.8));
  vec3 base = mix(uCool, uHot, clamp(b * ld * 0.95, 0.0, 1.0));
  c = base * b * ld;
  c = mix(c, uCool * 0.3 * ld, pen * 0.65);
  c = mix(c, uCool * 0.04, umb);
  c += uHot * fac * 0.7;
#elif MODE == 1
  // --- Gigante roja: pocas celdas convectivas enormes, bajo contraste
  float warp = fbm(p * 1.6 + uSeed + vec3(t * 0.008));
  vec2 w = worley(p * uCellScale + uSeed + warp * 0.7, t * 0.04);
  float cell = smoothstep(0.0, 0.75, w.y - w.x);
  float small = fbm(p * 6.0 + vec3(t * 0.02));
  float b = 0.55 + 0.45 * cell * uContrast + 0.14 * small;
  float sp = smoothstep(0.25, 0.45, fbm(p * 1.2 + uSeed * 2.0 + vec3(t * 0.002))) * uSpots;
  b *= 1.0 - 0.45 * sp;
  float ld = 1.0 - 0.78 * (1.0 - pow(mu, 0.55));
  c = mix(uCool, uHot, clamp(b * ld, 0.0, 1.0)) * b * ld;
#elif MODE == 2
  // --- Estrella violeta (ficticia): auroras arremolinadas lentas
  float tt = t * 0.035;
  vec3 q = p * 2.2 + uSeed;
  vec3 w1 = vec3(fbm(q + vec3(0.0, tt, 0.0)), fbm(q + vec3(5.2, 1.3, tt)), fbm(q + vec3(tt, 2.8, 7.1)));
  float f = fbm(q * 1.3 + 2.4 * w1 + vec3(0.0, 0.0, tt * 1.5));
  float bands = pow(1.0 - abs(sin(p.y * 5.0 + f * 3.5 + tt * 3.0)), 6.0);
  float swirl = 0.5 + 0.5 * f;
  vec3 deep = uCool, mag = uHot, cian = vec3(0.55, 0.78, 1.0);
  c = mix(deep, mag, smoothstep(0.2, 0.85, swirl));
  c += cian * bands * 0.5 + vec3(1.0, 0.75, 1.0) * pow(swirl, 4.0) * 0.7;
  float ld = 1.0 - 0.5 * (1.0 - pow(mu, 0.7));
  c *= ld;
  c += mag * pow(1.0 - mu, 3.0) * 0.6;
#elif MODE == 3
  // --- Enana marrón: bandas como un gigante gaseoso, tormentas y rotación diferencial
  float lat = p.y;
  float ang = t * 0.03 * (1.0 + 0.5 * sin(lat * 9.0));
  float cs = cos(ang), sn = sin(ang);
  vec3 pr = vec3(cs * p.x - sn * p.z, p.y, sn * p.x + cs * p.z);
  float warp = fbm(vec3(pr.x * 1.6, pr.y * 7.0, pr.z * 1.6) + uSeed);
  float bands = sin(lat * uCellScale + warp * 2.6);
  float st = smoothstep(0.32, 0.55, fbm(pr * 3.2 + uSeed * 2.0));
  float ld = 0.3 + 0.7 * pow(mu, 0.5);
  c = mix(uCool * 0.35, uColor, 0.5 + 0.5 * bands);
  c = mix(c, uHot * 1.5, st * 0.7);       // claros en las nubes: se ve el calor de dentro
  c += uHot * 0.25 * fine * (0.5 - 0.5 * bands);
  c *= ld;
#elif MODE == 4
  // --- Estrella de quarks: superficie iridiscente cambiante
  float n = fbm(p * 3.0 + vec3(t * 0.1));
  vec2 w = worley(p * 5.0 + uSeed, t * 0.6);
  float edges = 1.0 - smoothstep(0.0, 0.12, w.y - w.x);
  float fres = 1.0 - mu;
  vec3 rb = paleta(n * 1.4 + fres * 1.2 + t * 0.06);
  c = mix(vec3(1.0), rb, 0.75) * (0.7 + 0.8 * fres) + rb * edges * 1.5;
#elif MODE == 5
  // --- Objeto compacto: blanco-azulado ardiente
  float n = snoise(p * 5.0 + vec3(t * 0.4)) * 0.5 + 0.5;
  float ld = 0.8 + 0.2 * mu;
  c = mix(uHot, vec3(1.0), 0.55) * (0.85 + 0.3 * n) * ld;
#elif MODE == 6
  // --- Protoestrella: turbulenta, con parches oscuros de polvo
  vec3 q = p * uCellScale + uSeed;
  float f = fbm(q + fbm(q * 1.7 + vec3(t * 0.03)) * 1.5);
  float b = 0.55 + 0.6 * f;
  float ld = 1.0 - 0.6 * (1.0 - pow(mu, 0.7));
  c = mix(uCool, uHot, clamp(b, 0.0, 1.0)) * b * ld;
#endif

  // Fulguración: mancha brillante breve
  float fd = dot(p, uFlareDir);
  float fl = uFlare * smoothstep(0.92, 0.995, fd) * (0.6 + 0.6 * fine);
  c += uHot * fl * 4.0;
  gl_FragColor = vec4(c * uIntensity, 1.0);
}
`;

/* ---------------- Corona / halo (billboard) ---------------- */

const FRAG_CORONA = /* glsl */`
uniform float uTime, uCore, uIntensity, uHalo, uFalloff, uRays, uRayFreq, uSpikes, uFlare, uPulse, uDust, uRainbow, uEdge;
uniform vec3 uColor, uCoreColor, uSeed;
varying vec2 vUv;
${GLSL_RUIDO}
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float rr = max(r / uCore, 1.0);          // en radios estelares
  float x = rr - 1.0;
  float inner = exp(-x * uFalloff);
  float halo = uHalo * pow(1.0 / rr, 1.5);
  float fade = 1.0 - smoothstep(uEdge, 1.0, r);
  vec2 cs = vec2(cos(a), sin(a));
  // serpentinas de la corona que fluyen hacia fuera
  float n = fbm(vec3(cs * uRayFreq, log(rr) * 1.3 - uTime * 0.035) + uSeed);
  float streak = smoothstep(-0.15, 0.6, n);
  float fino = pow(snoise(vec3(cs * 22.0, uTime * 0.02 + uSeed.x)) * 0.5 + 0.5, 3.0);
  float rays = uRays * (streak * 0.5 + fino * 0.18) * exp(-x * 0.75) * smoothstep(0.0, 0.15, x + 0.02);
  // destellos tipo lente (fijos a pantalla)
  float sp = 0.0;
  if (uSpikes > 0.0) {
    float w = 0.0025 + 0.012 * r;
    sp += exp(-abs(p.y) / w) * pow(1.0 - r, 1.5) * 1.3;
    sp += exp(-abs(p.x) / w) * pow(1.0 - r, 2.5) * 0.7;
    vec2 d = vec2(p.x + p.y, p.x - p.y) * 0.7071;
    sp += (exp(-abs(d.x) / w) + exp(-abs(d.y) / w)) * pow(1.0 - r, 4.0) * 0.25;
    sp *= uSpikes;
  }
  vec3 tint = uColor;
  if (uRainbow > 0.0) tint = mix(uColor, paleta(a / 6.2831 * 2.0 + x * 0.12 - uTime * 0.05) * 1.3, uRainbow);
  float dust = 1.0;
  if (uDust > 0.0) dust = mix(1.0, smoothstep(-0.4, 0.7, fbm(vec3(p * 3.0, uTime * 0.01) + uSeed)), uDust);
  vec3 c = uCoreColor * inner + tint * (halo + rays) * dust + mix(uCoreColor, vec3(1.0), 0.5) * sp;
  if (uRainbow > 0.0) {
    // halos prismáticos (como de difracción) que giran despacio
    float ring1 = exp(-pow((r - 0.32) / 0.05, 2.0)), ring2 = exp(-pow((r - 0.55) / 0.035, 2.0)) * 0.6;
    c += paleta(r * 2.5 + a / 6.2831 + uTime * 0.04) * (ring1 + ring2) * uRainbow * 0.3 * (0.6 + 0.4 * streak);
  }
  c *= uIntensity * (1.0 + uFlare) * uPulse * fade;
  gl_FragColor = vec4(c, 1.0);
}
`;

/* ---------------- Tubos: protuberancias y líneas de campo ---------------- */

const VERT_TUBO = /* glsl */`
attribute float aFase;
varying vec3 vObj; varying vec3 vNrmV; varying vec3 vPosV; varying vec2 vUv; varying float vFase;
void main(){
  vObj = position; vUv = uv; vFase = aFase;
  vNrmV = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPosV = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG_TUBO = /* glsl */`
uniform float uTime, uLife, uIntensity;
uniform vec3 uColA, uColB, uSeed;
varying vec3 vObj; varying vec3 vNrmV; varying vec3 vPosV; varying vec2 vUv; varying float vFase;
${GLSL_RUIDO}
void main(){
  float edge = pow(abs(dot(normalize(vNrmV), normalize(-vPosV))), 1.3);
#ifdef CAMPO
  // líneas de campo magnético: pulsos de energía que recorren la línea
  float pulso = pow(fract(vUv.x * 3.0 - uTime * 0.45 + vFase), 8.0);
  float pulso2 = pow(fract(-vUv.x * 2.0 - uTime * 0.3 + vFase * 1.7), 12.0);
  float I = (0.22 + 1.6 * pulso + 1.0 * pulso2) * edge * uLife;
  vec3 c = mix(uColA, uColB, pulso);
#else
  // protuberancia: plasma que fluye por el arco
  float n = fbm(vec3(vUv.x * 7.0 - uTime * 0.25, vUv.y * 1.5, 0.0) + uSeed);
  float n2 = snoise(vec3(vUv.x * 25.0 + uTime * 0.4, vUv.y * 4.0, uSeed.y));
  float I = uLife * (0.35 + 0.9 * smoothstep(-0.3, 0.6, n) + 0.25 * n2) * edge;
  vec3 c = mix(uColA, uColB, smoothstep(0.0, 0.7, n));
#endif
  gl_FragColor = vec4(c * I * uIntensity, 1.0);
}
`;

/* ---------------- Chorros y haces ---------------- */

const FRAG_CHORRO = /* glsl */`
uniform float uTime, uIntensity, uKnots, uKnotFreq, uSpeed, uFlicker, uWidth;
uniform vec3 uColA, uColB, uSeed;
varying vec3 vObj; varying vec3 vNrmV; varying vec3 vPosV; varying vec2 vUv;
${GLSL_RUIDO}
void main(){
  float s = vUv.y;        // 0 en la base, 1 en la punta
  float edge = pow(abs(dot(normalize(vNrmV), normalize(-vPosV))), 1.6);
  float n = 0.5 + 0.5 * fbm(vec3(vObj.x / uWidth * 1.2, s * 7.0 - uTime * uSpeed, vObj.z / uWidth * 1.2) + uSeed);
  float k = pow(0.5 + 0.5 * sin((s * uKnotFreq - uTime * uSpeed * 0.12) * 6.2831), 14.0) * uKnots;
  float fall = pow(1.0 - s, 1.3) * smoothstep(0.0, 0.03, s);
  float fl = 1.0 + uFlicker * snoise(vec3(uTime * 6.0, s * 3.0, uSeed.x));
  float wisp = smoothstep(0.25, 0.85, n);
  float I = (fall * (0.15 + 1.2 * wisp) + k * (1.0 - 0.6 * s) * (0.5 + n)) * edge * fl;
  vec3 c = mix(uColA, uColB, smoothstep(0.0, 0.8, s));
  gl_FragColor = vec4(c * I * uIntensity, 1.0);
}
`;

/* ---------------- Disco de acreción ---------------- */

const VERT_DISCO = /* glsl */`
varying vec3 vGeo;
void main(){
  vGeo = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG_DISCO = /* glsl */`
uniform float uInner, uOuter, uTime, uBeta, uIntensity, uSpin, uAlpha;
uniform vec3 uCamLocal, uHot, uMid, uOuterCol, uSeed;
varying vec3 vGeo;
${GLSL_RUIDO}
float vetas(float a, float lr, float off){
  vec2 cs = vec2(cos(a), sin(a));
  float f = fbm(vec3(cs * 1.3, lr * 6.0 + off) + uSeed);
  float g = snoise(vec3(cs * 5.0, lr * 22.0 + off * 2.0) + uSeed);
  return 0.5 + 0.5 * f + 0.25 * g;
}
void main(){
  vec2 q = vGeo.xy;
  float r = length(q);
  float phi = atan(q.y, q.x);
  float x = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
  float lr = log(r / uInner);
  // rotación kepleriana; dos fases mezcladas para que la cizalla no se acumule
  float omega = uSpin * pow(uInner / r, 1.5);
  float T = 14.0;
  float ph1 = fract(uTime / T), ph2 = fract(uTime / T + 0.5);
  float w1 = 1.0 - abs(2.0 * ph1 - 1.0);
  float st = vetas(phi - omega * ph1 * T, lr, 0.0) * w1 + vetas(phi - omega * ph2 * T, lr, 3.7) * (1.0 - w1);
  float Tm = pow(uInner / r, 0.85);
#ifdef POLVO
  // disco de polvo de protoestrella: carriles oscuros, borde interior iluminado
  float lanes = smoothstep(0.35, 0.75, 0.5 + 0.5 * sin(lr * 14.0 + st * 2.5));
  float dens = smoothstep(0.0, 0.07, x) * (1.0 - smoothstep(0.3, 1.0, x + 0.25 * (st - 0.5)));
  vec3 lit = uHot * pow(uInner / r, 4.0) * 1.4;
  vec3 c = uOuterCol * (0.04 + 0.1 * st) * (1.0 - 0.7 * lanes) * 0.6 + lit * (0.5 + 0.5 * st);
  float alpha = dens * (0.7 + 0.3 * lanes) * uAlpha;
  gl_FragColor = vec4(c * uIntensity, alpha);
#else
  float inEdge = smoothstep(0.0, 0.05, x);
  float outEdge = 1.0 - smoothstep(0.45, 1.0, x + 0.12 * (st - 0.5));
  vec3 c = mix(uOuterCol, uMid, smoothstep(0.12, 0.5, Tm));
  c = mix(c, uHot, smoothstep(0.55, 0.95, Tm));
  float br = (0.18 + 1.6 * Tm * Tm) * (0.3 + 0.95 * st) * inEdge * outEdge;
  // Doppler relativista: el lado que se acerca brilla más y azulea
  vec3 v = vec3(-q.y, q.x, 0.0) / r;
  vec3 vd = normalize(uCamLocal - vGeo);
  float beta = uBeta * sqrt(uInner / r);
  float D = sqrt(1.0 - beta * beta) / (1.0 - beta * dot(v, vd));
  float boost = clamp(pow(D, 3.0), 0.05, 6.0);
  c = mix(c, c * vec3(0.7, 0.9, 1.35), clamp(D - 1.0, 0.0, 1.0));
  c *= mix(vec3(1.0), vec3(1.15, 0.65, 0.55), clamp(1.0 - D, 0.0, 1.0));
  gl_FragColor = vec4(c * br * boost * uIntensity, 1.0);
#endif
}
`;

/* ---------------- Arco de lente del agujero negro (billboard) ---------------- */

const FRAG_ARCO = /* glsl */`
uniform float uTime, uScale, uIncl, uIntensity, uR0, uArc;
uniform vec2 uUp, uSide;
uniform vec3 uHot, uMid, uOuterCol, uSeed;
varying vec2 vUv;
${GLSL_RUIDO}
void main(){
  vec2 p = (vUv * 2.0 - 1.0) * uScale;     // en radios del horizonte
  float r = length(p);
  if (r < 0.98) discard;
  vec2 dir = p / r;
  float y = dot(dir, uUp), xs = dot(dir, uSide);
  float edge = 1.0 - uIncl;                 // 1 = disco de canto
  // anillo de fotones: fino y muy brillante
  float ring = exp(-pow((r - 1.06) / 0.022, 2.0)) * 0.9 + exp(-pow((r - 1.08) / 0.1, 2.0)) * 0.2;
  // imagen lensada de la cara lejana del disco, curvada sobre el horizonte
  float w = mix(0.22, 1.5, edge);
  float r0 = uR0;
  float band = smoothstep(r0 - 0.03, r0 + 0.05, r) * (1.0 - smoothstep(r0 + w * 0.25, r0 + w, r));
  float bandB = smoothstep(r0 - 0.04, r0 + 0.02, r) * (1.0 - smoothstep(r0 + 0.06, r0 + 0.06 + w * 0.22, r));
  float top = smoothstep(-0.35, 0.55, y);
  float bot = smoothstep(0.25, -0.6, y);
  float img = band * mix(1.0, top, edge) + bandB * bot * edge * 0.8;
  float a = atan(dir.y, dir.x);
  float n = fbm(vec3(cos(a) * 2.5, sin(a) * 2.5, r * 3.0 - uTime * 0.25) + uSeed);
  float dop = clamp(1.0 + 0.85 * xs * edge, 0.15, 2.2);
  float heat = 1.0 - smoothstep(r0, r0 + w, r);
  vec3 c = mix(uOuterCol, uMid, smoothstep(0.0, 0.5, heat));
  c = mix(c, uHot, smoothstep(0.5, 1.0, heat));
  c = mix(c, c * vec3(0.75, 0.9, 1.3), clamp(xs * edge, 0.0, 1.0));
  vec3 outc = c * img * (0.55 + 0.6 * n) * dop * dop * 0.6 * uArc + mix(uHot, vec3(1.0), 0.4) * ring * (0.8 + 0.4 * dop);
  outc *= 1.0 - smoothstep(0.75 * uScale, uScale, r);
  gl_FragColor = vec4(outc * uIntensity, 1.0);
}
`;

/* ---------------- Nebulosas (raymarching en esfera) ---------------- */

const VERT_NEBULOSA = /* glsl */`
varying vec3 vObj;
void main(){
  vObj = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG_NEBULOSA = /* glsl */`
uniform vec3 uCamObj, uColA, uColB, uColC, uSeed;
uniform float uRadius, uTime, uIntensity, uShape, uExpand;
varying vec3 vObj;
${GLSL_RUIDO}
vec3 emision(vec3 p){
  float r = length(p);
  vec3 n = p / max(r, 1e-4);
#if NEB == 0
  // nebulosa planetaria: cáscara (anillo / reloj de arena), relleno OIII, anillo ecuatorial
  float cy = abs(n.y);
  float nz = fbm(p * 3.2 + uSeed);
  float Rs = 0.3 + uShape * 0.42 * pow(cy, 2.2) + 0.05 * nz;
  float shell = exp(-pow((r - Rs) / (0.045 + 0.04 * cy), 2.0));
  float fill = (1.0 - smoothstep(0.0, Rs, r)) * 0.45 + smoothstep(Rs * 0.3, Rs, r) * (1.0 - smoothstep(Rs * 0.9, Rs, r)) * 0.35;
  float ring = exp(-pow((length(p.xz) - 0.3) / 0.045, 2.0) - pow(p.y / 0.06, 2.0)) * (0.55 + 0.6 * nz) * (1.0 - uShape * 0.4);
  float halo = exp(-pow((r - 0.72) / 0.13, 2.0)) * 0.1 * (0.5 + nz);
  float k = smoothstep(0.45, 0.8, snoise(p * 13.0 + uSeed)) * shell;
  return uColA * fill * (0.9 + 1.2 * max(nz + 0.3, 0.0)) + uColB * (shell * (0.35 + 0.8 * max(nz + 0.2, 0.0)) + halo * 0.6) + uColC * (ring * 1.0 + k * 1.2);
#elif NEB == 1
  // viento de Wolf-Rayet: cáscaras grumosas que se expanden
  vec3 e = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float ph = fract(uTime * uExpand + float(i) / 3.0);
    float Rk = 0.12 + 0.82 * ph;
    float fade = sin(3.14159 * ph);
    float cl = fbm(p / Rk * 2.6 + uSeed + float(i) * 7.3);
    float clump = smoothstep(0.0, 0.5, cl);
    float sh = exp(-pow((r - Rk) / (0.025 + 0.05 * ph), 2.0));
    e += mix(uColA, uColB, ph) * sh * clump * fade * 1.6;
  }
  e += uColC * exp(-r * 7.0) * 0.5;
  return e;
#else
  // remanente de supernova: filamentos en cáscara y niebla sincrotrón interior
  float f = pow(1.0 - abs(snoise(p * 2.6 + uSeed)), 14.0);
  float f2 = pow(1.0 - abs(snoise(p * 5.5 + uSeed * 1.3)), 16.0);
  float shell = smoothstep(0.55, 0.85, r) * (1.0 - smoothstep(0.88, 1.0, r));
  vec3 e = (uColA * f * 1.6 + uColB * f2 * 1.0) * shell * 1.5;
  e += uColC * exp(-r * r * 6.0) * 0.45 * (0.6 + 0.6 * smoothstep(-0.4, 0.6, fbm(p * 3.0 + vec3(uTime * 0.02))));
  return e;
#endif
}
void main(){
  vec3 ro = uCamObj / uRadius;
  vec3 rd = normalize(vObj / uRadius - ro);
  float b = dot(ro, rd), c = dot(ro, ro) - 1.0;
  float h = b * b - c;
  if (h <= 0.0) discard;
  h = sqrt(h);
  float t0 = max(-b - h, 0.0), t1 = -b + h;
  if (t1 <= 0.0) discard;
  float dt = (t1 - t0) / float(STEPS);
  float j = hash12(gl_FragCoord.xy);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * (t0 + dt * (float(i) + j));
    acc += emision(p);
  }
  gl_FragColor = vec4(acc * dt * uIntensity, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/*  Lente gravitatoria (post-proceso)                                   */
/* ------------------------------------------------------------------ */

export const LensingShader = {
  uniforms: {
    tDiffuse: { value: null },
    uLenses: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
    uCount: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec4 uLenses[8];
    uniform int uCount;
    uniform float uAspect;
    varying vec2 vUv;
    void main(){
      vec2 total = vec2(0.0);
      float shade = 1.0;
      for (int i = 0; i < 8; i++) {
        if (i >= uCount) break;
        vec4 L = uLenses[i];
        float rE = L.z;
        if (rE <= 0.0) continue;
        float s = min(L.w, 1.5);
        vec2 d = vUv - L.xy;
        d.x *= uAspect;                       // a unidades de altura
        float r = length(d);
        // lente puntual: desplazamiento ~ rE²/r, suavizado en el centro
        float soft = rE * 0.18;
        float k = rE * rE / (r * r + soft * soft);
        // ventana para que el efecto no se extienda por toda la pantalla
        float win = 1.0 - smoothstep(rE * 2.5, rE * 7.0, r);
        // en lentes débiles (estrellas compactas) el núcleo no se refleja: se ve el propio objeto
        float nucleo = s < 1.0 ? smoothstep(rE * 0.25, rE * 0.8, r) : 1.0;
        total += d * k * min(s, 1.0) * win * nucleo;
        // sombra del horizonte para agujeros negros
        // sombra del agujero negro: dentro del radio de Einstein solo habría imágenes
        // reflejadas del propio disco (artefacto de hacer la lente en pantalla), así que se oscurece
        if (s >= 1.0) {
          shade *= smoothstep(rE * 0.9, rE * 1.04, r);
          // los rayos cuyo origen cae sobre el horizonte también son negros
          float beta = length(d * (1.0 - k * win));
          shade *= mix(1.0, smoothstep(rE * 0.3, rE * 0.45, beta), smoothstep(rE * 2.0, rE, r));
        }
      }
      total.x /= uAspect;
      vec2 suv = vUv - total;
      vec4 c = texture2D(tDiffuse, clamp(suv, vec2(0.001), vec2(0.999)));
      gl_FragColor = vec4(c.rgb * shade, c.a);
    }
  `,
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// Proyecta las lentes a pantalla y rellena los uniforms de un ShaderPass(LensingShader)
export function lensUniformsFrom(lenses, camera, target) {
  const u = target.uniforms ? target.uniforms : target;
  let n = 0;
  const aspect = camera.isPerspectiveCamera ? camera.aspect : ((camera.right - camera.left) / (camera.top - camera.bottom) || 1);
  if (u.uAspect) u.uAspect.value = aspect;
  camera.updateMatrixWorld();
  for (const L of lenses || []) {
    if (n >= 8) break;
    if (!L || !L.position || !(L.radius > 0)) continue;
    _v.copy(L.position).applyMatrix4(camera.matrixWorldInverse);
    const dist = -_v.z;
    if (dist <= 1e-3) continue;               // detrás de la cámara
    let rUv;
    if (camera.isPerspectiveCamera) {
      const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) / (camera.zoom || 1);
      rUv = 0.5 * L.radius / (dist * tanH);
    } else {
      rUv = L.radius * (camera.zoom || 1) / (camera.top - camera.bottom);
    }
    rUv = Math.min(rUv, 0.6);
    _v2.copy(L.position).project(camera);
    const x = _v2.x * 0.5 + 0.5, y = _v2.y * 0.5 + 0.5;
    const m = rUv * 4;
    if (x < -m / aspect || x > 1 + m / aspect || y < -m || y > 1 + m) continue;
    u.uLenses.value[n].set(x, y, rUv, L.strength ?? 0.5);
    n++;
  }
  u.uCount.value = n;
  return n;
}

/* ------------------------------------------------------------------ */
/*  Utilidades de construcción                                          */
/* ------------------------------------------------------------------ */

function aditivo(params) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    ...params,
  });
}

// Une varias geometrías no indexadas o indexadas (posición, normal, uv, aFase)
function unirGeometrias(geos, fases) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), fa = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  geos.forEach((g, k) => {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, ov * 3);
    nor.set(g.attributes.normal.array, ov * 3);
    uv.set(g.attributes.uv.array, ov * 2);
    fa.fill(fases[k], ov, ov + c);
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + ov; oi += g.index.count; }
    else { for (let i = 0; i < c; i++) idx[oi + i] = ov + i; oi += c; }
    ov += c;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('aFase', new THREE.BufferAttribute(fa, 1));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function conFase(geo, f = 0) {
  geo.setAttribute('aFase', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(f), 1));
  return geo;
}

function seedVec(rng) { return new THREE.Vector3(rng.range(-50, 50), rng.range(-50, 50), rng.range(-50, 50)); }

/* ------------------------------------------------------------------ */
/*  createStar                                                          */
/* ------------------------------------------------------------------ */

export function createStar(star = {}, opts = {}) {
  const clase = CLASES[star.clase] ? star.clase : 'G';
  const C = CLASES[clase];
  const det = DETALLE[opts.detail] || DETALLE.media;
  const seed = String(star.seed ?? star.id ?? clase);
  const rng = makeRng(seed, 'estrella');
  const flags = star.flags || {};
  const R = star.radio > 0 ? star.radio : C.R;
  const L = star.luminosidad > 0 ? star.luminosidad : C.L;
  const act = THREE.MathUtils.clamp(star.actividad ?? 0.4, 0, 1);
  const periodo = star.rotacionPeriodo > 0 ? star.rotacionPeriodo : (C.tipo === 'compacta' ? 2 : 90);
  const logL = Math.log10(Math.max(L, 1e-6));
  const escalaNeb = opts.escalaNebulosa ?? 1;

  // Color base: el que manda el generador, o cuerpo negro por temperatura
  let base;
  if (C.colorFijo !== undefined && (star.color === undefined || clase === 'estrella-violeta' || clase === 'enana-marron')) base = col(C.colorFijo);
  else if (star.color !== undefined) base = col(star.color);
  else base = kelvinToColor(star.temperaturaK || C.T || 5800);
  const tK = star.temperaturaK || C.T || 5800;
  const hot = base.clone().lerp(new THREE.Color(1, 1, 1), tK < 4200 ? 0.15 : tK < 6500 ? 0.3 : 0.4);
  const cool = base.clone().multiply(new THREE.Color(1.0, 0.6, 0.3));
  if (clase === 'estrella-violeta') { hot.set(0xff6ad8); cool.set(0x3a0d7a); }
  if (clase === 'enana-marron') { hot.set(0xff4d6d); cool.set(0x2a0818); }

  const group = new THREE.Group();
  group.name = `estrella-${star.id ?? ''}-${clase}`;
  const spin = new THREE.Group();            // rota con la estrella
  group.add(spin);
  const tilt = new THREE.Group();            // eje de discos/chorros (ligera inclinación)
  tilt.rotation.set(rng.range(-0.22, 0.22), 0, rng.range(-0.22, 0.22));
  group.add(tilt);
  spin.quaternion.copy(tilt.quaternion);

  const recursos = [];
  const billboards = [];                     // { mesh, offset }
  const updaters = [];
  const T = (o) => { recursos.push(o); return o; };
  let glowRadius = R * 1.5;
  let lens = null;
  let nebulaRadius = 0;
  let tReal = 0;

  // Uniform de fulguración compartido
  const flare = { value: 0 };
  const flareDir = { value: new THREE.Vector3(0, 1, 0) };
  const pulse = { value: 1 };
  const tiempo = { value: 0 };

  /* ---------- Fotosfera ---------- */
  let foto = null;
  if (C.modo >= 0) {
    const defines = { MODE: C.modo, OCT: det.oct };
    if (det.worley) defines.WORLEY = 1;
    const mat = T(new THREE.ShaderMaterial({
      defines,
      uniforms: {
        uTime: tiempo, uIntensity: { value: C.I }, uSpots: { value: flags.manchas ? 0.55 + 0.45 * act : 0 },
        uActivity: { value: act }, uCellScale: { value: C.celda || 6 }, uContrast: { value: C.contraste ?? 1 },
        uFlare: flare, uFlareDir: flareDir, uColor: { value: base }, uHot: { value: hot }, uCool: { value: cool },
        uSeed: { value: seedVec(rng).multiplyScalar(0.1) },
      },
      vertexShader: VERT_COMUN, fragmentShader: FRAG_FOTOSFERA,
    }));
    const segs = C.tipo === 'compacta' ? Math.max(24, det.seg / 2) : det.seg;
    foto = new THREE.Mesh(T(new THREE.SphereGeometry(R, segs, Math.round(segs * 0.6))), mat);
    foto.name = 'fotosfera';
    spin.add(foto);
  }

  /* ---------- Corona / halo ---------- */
  function corona({ size, intensity = 1, halo = 0.6, falloff = 4, rays = 0.6, rayFreq = 2.5, spikes = 0, color = base, coreColor = hot, dust = 0, rainbow = 0, edge = 0.55, order = 3, usePulse = false, useFlare = true }) {
    const mat = T(aditivo({
      defines: { OCT: Math.min(det.oct, 4) },
      uniforms: {
        uTime: tiempo, uCore: { value: R / size }, uIntensity: { value: intensity }, uHalo: { value: halo },
        uFalloff: { value: falloff }, uRays: { value: rays }, uRayFreq: { value: rayFreq }, uSpikes: { value: spikes },
        uFlare: useFlare ? flare : { value: 0 }, uPulse: usePulse ? pulse : { value: 1 }, uDust: { value: dust },
        uRainbow: { value: rainbow }, uEdge: { value: edge },
        uColor: { value: color.clone() }, uCoreColor: { value: coreColor.clone() }, uSeed: { value: seedVec(rng).multiplyScalar(0.05) },
      },
      vertexShader: VERT_COMUN, fragmentShader: FRAG_CORONA,
    }));
    const m = new THREE.Mesh(T(new THREE.PlaneGeometry(size * 2, size * 2)), mat);
    m.renderOrder = order;
    m.name = 'corona';
    group.add(m);
    billboards.push({ mesh: m, offset: 0 });
    glowRadius = Math.max(glowRadius, size * 0.75);
    return m;
  }

  /* ---------- Protuberancias y fulguraciones ---------- */
  function protuberancias(count, colorHex) {
    const proms = [];
    const pc = col(colorHex);
    for (let i = 0; i < count; i++) {
      const w = rng.range(0.08, 0.22);
      const h = rng.range(0.12, 0.35);
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const s = k / 16;
        const ang = THREE.MathUtils.lerp(-w, w, s);
        const lift = 1 + h * Math.pow(Math.sin(Math.PI * s), 0.85);
        const tw = 0.25 * w * Math.sin(Math.PI * s);
        pts.push(new THREE.Vector3(Math.sin(ang), Math.cos(ang), tw).normalize().multiplyScalar(R * lift * 0.995));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = T(conFase(new THREE.TubeGeometry(curve, det.tubo, R * rng.range(0.018, 0.035), 8, false)));
      const mat = T(aditivo({
        defines: { OCT: 3 },
        uniforms: {
          uTime: tiempo, uLife: { value: 0 }, uIntensity: { value: 2.2 },
          uColA: { value: pc.clone() }, uColB: { value: pc.clone().lerp(new THREE.Color(1, 0.9, 0.8), 0.6) },
          uSeed: { value: seedVec(rng).multiplyScalar(0.1) },
        },
        vertexShader: VERT_TUBO, fragmentShader: FRAG_TUBO,
      }));
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 5;
      spin.add(m);
      const p = { mesh: m, age: rng.range(0, 10), dur: rng.range(8, 18) / (0.6 + act), visible: false };
      const colocar = () => {
        const u = rng.unit();
        u.y *= 0.7; u.normalize();
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), u);
        m.rotateY(rng.range(0, Math.PI * 2));
        p.dur = rng.range(8, 18) / (0.6 + act);
        p.amp = rng.range(0.5, 1.0);
      };
      colocar();
      p.colocar = colocar;
      proms.push(p);
    }
    updaters.push((dt) => {
      for (const p of proms) {
        p.age += dt;
        if (p.age > p.dur) { p.age = 0; p.colocar(); }
        const x = p.age / p.dur;
        p.mesh.material.uniforms.uLife.value = p.amp * Math.pow(Math.sin(Math.PI * x), 1.5) * (1 + flare.value * 0.8);
        p.mesh.scale.setScalar(1 + 0.04 * x);
      }
    });
  }

  function fulguraciones(rate, amp = 1, decay = 1.6) {
    // rate: eventos por segundo de tiempo real
    let next = rng.range(2, 6) / Math.max(rate * 6, 0.05);
    let t0 = -1e9, A = 0;
    updaters.push(() => {
      if (tReal > next) {
        t0 = tReal; A = amp * rng.range(0.5, 1.2);
        flareDir.value.copy(rng.unit());
        next = tReal + (-Math.log(1 - rng() * 0.98) / Math.max(rate, 1e-3));
      }
      const e = tReal - t0;
      flare.value = e < 0 ? 0 : A * Math.min(e / 0.25, 1) * Math.exp(-e / decay);
    });
  }

  /* ---------- Disco de acreción ---------- */
  function disco({ interior, exterior, color, polvo = false, beta = 0.4, spin: wSpin = 0.8, intensity = 1.2 }) {
    const outerCol = col(color ?? (polvo ? 0x7a4a3a : 0x9a5cff));
    const meshes = [];
    const capas = polvo ? [-1, 0, 1] : [0];
    for (const k of capas) {
      const g = new THREE.RingGeometry(interior, exterior, det.discoSeg, polvo ? 12 : 8);
      if (k !== 0) {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const rr = Math.hypot(p.getX(i), p.getY(i)); p.setZ(i, k * 0.12 * rr * Math.pow(rr / exterior, 0.5)); }
      }
      const defines = { OCT: Math.min(det.oct, 4) };
      if (polvo) defines.POLVO = 1;
      const mat = T(new THREE.ShaderMaterial({
        defines,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: polvo ? THREE.NormalBlending : THREE.AdditiveBlending,
        uniforms: {
          uInner: { value: interior }, uOuter: { value: exterior }, uTime: tiempo, uBeta: { value: beta },
          uIntensity: { value: intensity }, uSpin: { value: wSpin }, uAlpha: { value: k === 0 ? 0.95 : 0.6 },
          uCamLocal: { value: new THREE.Vector3() },
          uHot: { value: polvo ? col(0xffb070) : col(0xfff4e6) }, uMid: { value: col(0xff9a3c) }, uOuterCol: { value: outerCol },
          uSeed: { value: seedVec(rng).multiplyScalar(0.05) },
        },
        vertexShader: VERT_DISCO, fragmentShader: FRAG_DISCO,
      }));
      const m = new THREE.Mesh(T(g), mat);
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = polvo ? 6 + (k === 0 ? 0.1 : 0) : 2;
      m.name = polvo ? 'disco-polvo' : 'disco-acrecion';
      tilt.add(m);
      meshes.push(m);
    }
    glowRadius = Math.max(glowRadius, exterior);
    updaters.push((dt, ctx) => {
      for (const m of meshes) m.material.uniforms.uCamLocal.value.copy(ctx.camWorld).applyMatrix4(_mInv.copy(m.matrixWorld).invert());
    });
    return meshes;
  }

  /* ---------- Chorros bipolares ---------- */
  function chorros({ length, base: rb, tip, colA, colB, knots = 0, knotFreq = 6, speed = 1, intensity = 1.5, flicker = 0.1, parent = tilt, order = 7 }) {
    const meshes = [];
    for (const s of [1, -1]) {
      const g = new THREE.CylinderGeometry(tip, rb, length, 24, 1, true);
      g.translate(0, length / 2, 0);
      const mat = T(aditivo({
        defines: { OCT: 3 },
        side: THREE.DoubleSide,
        uniforms: {
          uTime: tiempo, uIntensity: { value: intensity }, uKnots: { value: knots }, uKnotFreq: { value: knotFreq },
          uSpeed: { value: speed }, uFlicker: { value: flicker }, uWidth: { value: Math.max(tip, rb) },
          uColA: { value: col(colA) }, uColB: { value: col(colB) }, uSeed: { value: seedVec(rng).multiplyScalar(0.05) },
        },
        vertexShader: VERT_COMUN, fragmentShader: FRAG_CHORRO,
      }));
      const m = new THREE.Mesh(T(g), mat);
      if (s < 0) m.rotation.z = Math.PI;
      m.renderOrder = order;
      m.name = 'chorro';
      parent.add(m);
      meshes.push(m);
    }
    return meshes;
  }

  /* ---------- Nebulosa ---------- */
  function nebulosa(tipo) {
    const id = tipo === 'planetaria' ? 0 : tipo === 'wolf-rayet' ? 1 : 2;
    const radius = (id === 0 ? rng.range(80, 130) : id === 1 ? rng.range(40, 65) : rng.range(55, 85)) * escalaNeb;
    const cols = [
      [0x2fd6c8, 0xd23f9a, 0xff8a7a],   // planetaria: OIII turquesa, Hα/NII magenta
      [0x7a8bff, 0xff4f8a, 0xb6a0ff],   // Wolf-Rayet: azul violeta -> rosa
      [0xff5050, 0x3fe0b0, 0x7fa8ff],   // remanente: Hα rojo, OIII verde, sincrotrón azul
    ][id];
    const mat = T(aditivo({
      defines: { NEB: id, STEPS: det.pasos, OCT: Math.max(2, det.oct - 2) },
      side: THREE.BackSide,
      uniforms: {
        uCamObj: { value: new THREE.Vector3() }, uRadius: { value: radius }, uTime: tiempo,
        uIntensity: { value: id === 0 ? 0.8 : id === 1 ? 0.8 : 0.7 }, uShape: { value: rng.range(0.0, 1.0) },
        uExpand: { value: 1 / rng.range(90, 150) },
        uColA: { value: col(cols[0]) }, uColB: { value: col(cols[1]) }, uColC: { value: col(cols[2]) },
        uSeed: { value: seedVec(rng).multiplyScalar(0.1) },
      },
      vertexShader: VERT_NEBULOSA, fragmentShader: FRAG_NEBULOSA,
    }));
    const m = new THREE.Mesh(T(new THREE.SphereGeometry(radius, 32, 20)), mat);
    m.rotation.set(rng.range(-0.6, 0.6), rng.range(0, 6.28), rng.range(-0.6, 0.6));
    m.renderOrder = 1;
    m.name = 'nebulosa-' + tipo;
    group.add(m);
    nebulaRadius = radius;
    glowRadius = Math.max(glowRadius, radius);
    updaters.push((dt, ctx) => {
      mat.uniforms.uCamObj.value.copy(ctx.camWorld).applyMatrix4(_mInv.copy(m.matrixWorld).invert());
    });
  }

  /* ================== Montaje por tipo de objeto ================== */

  const lumF = THREE.MathUtils.clamp(1 + 0.08 * logL, 0.7, 1.5);

  if (C.tipo === 'normal' || C.tipo === 'gigante') {
    const giant = C.tipo === 'gigante';
    const size = R * C.halo * lumF;
    const flareRate = act * 0.02 * C.flareK;
    corona({
      size, intensity: giant ? 0.45 : (clase === 'enana-marron' ? 0.2 : 0.55 + 0.05 * logL),
      halo: giant ? 0.3 : 0.3, falloff: giant ? 3 : 4.5,
      rays: C.rayos, rayFreq: clase === 'supergigante-azul' ? 3.5 : 2.2,
      spikes: C.picos, edge: 0.45,
      color: clase === 'protoestrella' ? col(0xff7a3a) : base,
    });
    if (clase === 'supergigante-azul' || clase === 'O' || clase === 'wolf-rayet') {
      // segundo halo amplio y destellos
      corona({ size: size * 2.2, intensity: 0.35, halo: 0.6, falloff: 1.2, rays: 0.25, rayFreq: 1.5, spikes: C.picos * 1.2, edge: 0.3, color: base });
    }
    if (giant) {
      // atmósfera exterior extendida, difusa y translúcida
      corona({ size: R * 3.0, intensity: 0.35, halo: 0.25, falloff: 2.2, rays: 0.0, dust: 0.8, edge: 0.15, color: cool.clone().lerp(base, 0.4), coreColor: base, useFlare: false });
      const P = rng.range(25, 45), A = 0.018;
      updaters.push(() => { spin.scale.setScalar(1 + A * Math.sin(tReal * 2 * Math.PI / P)); });
    }
    if (clase === 'protoestrella') {
      // envoltura de polvo tenue
      corona({ size: R * 9, intensity: 0.22, halo: 0.6, falloff: 0.6, rays: 0.15, rayFreq: 1.4, dust: 0.9, edge: 0.2, color: col(0xa0503a), coreColor: col(0xff9050), order: 2 });
    }
    if (clase !== 'enana-marron' && det.prom > 0 && !giant) {
      const n = Math.round(det.prom * (0.25 + act * 0.75) * (clase === 'M' ? 1.3 : 1));
      if (n > 0) protuberancias(Math.min(n, det.prom + 1), C.prom);
    } else if (giant && act > 0.3 && det.prom > 2) {
      protuberancias(2, C.prom);
    }
    if (flareRate > 0) fulguraciones(flareRate, clase === 'M' ? 1.2 : 0.8);
  }

  if (C.tipo === 'compacta') {
    const size = Math.max(R * C.halo, 3.5);
    const c2 = col(C.color2);
    const isQuark = clase === 'estrella-quark';
    corona({
      size, intensity: clase === 'enana-blanca' ? 0.6 : 0.7, halo: 0.22, falloff: 3.5, rays: isQuark ? 0.5 : 0.25, rayFreq: 3,
      spikes: C.picos, color: isQuark ? col(0xd9b3ff) : base.clone().lerp(c2, 0.5), coreColor: c2.clone().lerp(new THREE.Color(1, 1, 1), 0.5),
      rainbow: isQuark ? 1 : 0, edge: 0.35, usePulse: true,
    });
    // núcleo puntual muy brillante (para que el bloom lo convierta en un alfiler de luz)
    corona({ size: R * 3, intensity: 0.7, halo: 0.25, falloff: 5.0, rays: 0, spikes: 0, color: c2, coreColor: new THREE.Color(1, 1, 1), edge: 0.2, order: 4, usePulse: true });
    if (clase === 'neutrones' || clase === 'pulsar' || clase === 'magnetar') {
      lens = { radius: Math.max(R * 4, 1.0), strength: clase === 'magnetar' ? 0.4 : 0.35 };
    } else if (clase === 'enana-blanca') {
      lens = { radius: Math.max(R * 1.6, 0.8), strength: 0.12 };
    } else if (isQuark) {
      lens = { radius: Math.max(R * 3, 1.0), strength: 0.28 };
    }

    // Eje magnético (para pulsar y magnetar): gira con la estrella
    const ejeGiro = new THREE.Group();
    const ejeMag = new THREE.Group();
    ejeMag.rotation.z = rng.range(0.35, 0.75) * (rng.chance(0.5) ? 1 : -1);
    ejeGiro.add(ejeMag);
    tilt.add(ejeGiro);
    const periodoVisual = THREE.MathUtils.clamp(periodo * 6, 0.7, 6);

    if (clase === 'pulsar') {
      const len = rng.range(16, 24);
      // haz exterior ancho + núcleo estrecho muy brillante
      chorros({ length: len, base: R * 0.6, tip: len * 0.06, colA: 0xd8e6ff, colB: 0x8a6bff, speed: 3, intensity: 0.35, flicker: 0.25, parent: ejeMag });
      chorros({ length: len * 0.85, base: R * 0.3, tip: len * 0.015, colA: 0xffffff, colB: 0xa8c8ff, speed: 4, intensity: 0.9, flicker: 0.3, parent: ejeMag });
      glowRadius = Math.max(glowRadius, len * 0.6);
    }
    if (clase === 'magnetar') {
      const geos = [], fases = [];
      const Ls = [3.2, 5, 8, 12];
      const nAz = det.prom >= 4 ? 8 : 5;
      for (const Lk of Ls) {
        const Lr = Lk * R;
        const th0 = Math.asin(Math.sqrt(R / Lr));
        for (let j = 0; j < nAz; j++) {
          const ph = (j / nAz) * Math.PI * 2 + rng.range(-0.2, 0.2) + Lk;
          const pts = [];
          for (let k = 0; k <= 40; k++) {
            const th = THREE.MathUtils.lerp(th0, Math.PI - th0, k / 40);
            const r = Lr * Math.sin(th) ** 2;
            pts.push(new THREE.Vector3(r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph)));
          }
          geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), det.tubo, R * 0.04 * (1 + Lk * 0.08), 5, false));
          fases.push(rng());
        }
      }
      const mat = T(aditivo({
        defines: { OCT: 2, CAMPO: 1 },
        uniforms: {
          uTime: tiempo, uLife: { value: 1 }, uIntensity: { value: 1.6 },
          uColA: { value: col(0x6a5cff) }, uColB: { value: col(0x9ff0ff) }, uSeed: { value: new THREE.Vector3() },
        },
        vertexShader: VERT_TUBO, fragmentShader: FRAG_TUBO,
      }));
      const lines = new THREE.Mesh(T(unirGeometrias(geos, fases)), mat);
      lines.renderOrder = 5;
      lines.name = 'campo-magnetico';
      ejeMag.add(lines);
      glowRadius = Math.max(glowRadius, 12 * R);
      fulguraciones(0.05 + act * 0.08, 2.5, 0.9);       // terremotos estelares
      updaters.push(() => { mat.uniforms.uLife.value = 1 + flare.value * 1.5; });
    }
    updaters.push((dt, ctx) => {
      ejeGiro.rotation.y = (tReal / periodoVisual) * Math.PI * 2;
      if (clase === 'pulsar') {
        // pulso cuando un haz apunta a la cámara
        _q.copy(tilt.quaternion).multiply(ejeGiro.quaternion).multiply(ejeMag.quaternion);
        _v.set(0, 1, 0).applyQuaternion(_q);
        const c = Math.abs(_v.dot(ctx.toCamDir));
        pulse.value = 1 + 2.2 * THREE.MathUtils.smoothstep(c, 0.9, 0.995) + 0.12 * Math.sin(tReal * 40);
      } else if (clase === 'magnetar') {
        pulse.value = 1 + flare.value * 0.8;
      } else {
        pulse.value = 1 + 0.03 * Math.sin(tReal * 3.1);
      }
    });
  }

  if (C.tipo === 'agujero') {
    // Horizonte de sucesos: esfera negra que tapa la cara lejana del disco
    const hor = new THREE.Mesh(T(new THREE.SphereGeometry(R, 48, 32)), T(new THREE.MeshBasicMaterial({ color: 0x000000 })));
    hor.name = 'horizonte';
    group.add(hor);
    lens = { radius: R * 2.6, strength: 1.0 };
    const d = flags.discoAcrecion || { interior: R * 2.4, exterior: R * 9, color: 0x9a5cff };
    const inner = Math.max(d.interior ?? R * 2.4, R * 1.3), outer = Math.max(d.exterior ?? R * 9, inner * 1.5);
    disco({ interior: inner, exterior: outer, color: d.color ?? 0x9a5cff, beta: 0.5, spin: 1.1, intensity: 1.0 });
    // Arco lensado + anillo de fotones (billboard ligeramente adelantado)
    const scale = 4.2;
    const arcMat = T(aditivo({
      defines: { OCT: 3 },
      uniforms: {
        uTime: tiempo, uScale: { value: scale }, uIncl: { value: 0 }, uIntensity: { value: 0.9 }, uR0: { value: 1.16 }, uArc: { value: opts.arcoLente === false ? 0 : 1 },
        uUp: { value: new THREE.Vector2(0, 1) }, uSide: { value: new THREE.Vector2(1, 0) },
        uHot: { value: col(0xfff4e6) }, uMid: { value: col(0xff9a3c) }, uOuterCol: { value: col(d.color ?? 0x9a5cff) },
        uSeed: { value: seedVec(rng).multiplyScalar(0.05) },
      },
      vertexShader: VERT_COMUN, fragmentShader: FRAG_ARCO,
    }));
    const arc = new THREE.Mesh(T(new THREE.PlaneGeometry(R * scale * 2, R * scale * 2)), arcMat);
    arc.renderOrder = 4;
    arc.name = 'arco-lente';
    group.add(arc);
    billboards.push({ mesh: arc, offset: R * 1.25 });
    // halo tenue del disco
    corona({ size: outer * 1.3, intensity: 0.12, halo: 0.5, falloff: 0.5, rays: 0, color: col(d.color ?? 0x9a5cff), coreColor: col(0xffb070), edge: 0.2, order: 2, useFlare: false });
    updaters.push((dt, ctx) => {
      const n = _n.set(0, 1, 0).applyQuaternion(tilt.quaternion);
      const tc = ctx.toCamDir;
      const cosI = tc.dot(n);
      arcMat.uniforms.uIncl.value = Math.abs(cosI);
      const h = _h.copy(tc).addScaledVector(n, -cosI);
      if (h.lengthSq() > 1e-6) {
        h.normalize();
        const far = _v.copy(h).negate().applyQuaternion(ctx.camLocalQInv);
        arcMat.uniforms.uUp.value.set(far.x, far.y).normalize();
        const app = _v2.crossVectors(h, n).applyQuaternion(ctx.camLocalQInv);
        arcMat.uniforms.uSide.value.set(app.x, app.y).normalize();
      }
    });
    if (flags.jets) chorros({ length: outer * 2.4, base: R * 0.35, tip: outer * 0.05, colA: 0xcfe0ff, colB: 0x8a5cff, knots: 0.5, knotFreq: 5, speed: 2.5, intensity: 0.3, flicker: 0.15 });
  }

  // Disco y chorros de objetos que no son agujero negro
  if (C.tipo !== 'agujero') {
    const d = flags.discoAcrecion;
    const polvo = clase === 'protoestrella';
    if (d || polvo) {
      const dd = d || {};
      const inner = Math.max(dd.interior ?? R * 1.6, R * 1.15);
      const outer = Math.max(dd.exterior ?? R * (polvo ? 8 : 6), inner * 1.4);
      if (polvo) {
        disco({ interior: inner, exterior: outer, color: dd.color ?? 0x8a4a38, polvo: true, beta: 0.05, spin: 0.25, intensity: 1.0 });
      } else {
        disco({ interior: inner, exterior: outer, color: dd.color ?? 0x9a5cff, beta: C.tipo === 'compacta' ? 0.35 : 0.15, spin: 0.9, intensity: 1.3 });
      }
    }
    if (flags.jets || (polvo && flags.jets !== false)) {
      const len = polvo ? R * 12 : Math.max(R * 30, 8);
      if (polvo) chorros({ length: len, base: R * 0.2, tip: len * 0.035, colA: 0xffc090, colB: 0xff4f7a, knots: 0.8, knotFreq: 4, speed: 0.6, intensity: 0.45, flicker: 0.05 });
      else chorros({ length: len, base: R * 0.4, tip: len * 0.08, colA: 0xd8e6ff, colB: 0x8a6bff, knots: 0.5, knotFreq: 5, speed: 2, intensity: 1.4 });
      glowRadius = Math.max(glowRadius, len * 0.5);
    }
  }

  // Nebulosa alrededor
  let nebTipo = flags.nebulosa || null;
  if (nebTipo === true) nebTipo = clase === 'wolf-rayet' ? 'wolf-rayet' : clase === 'enana-blanca' ? 'planetaria' : 'remanente';
  if (nebTipo) nebulosa(nebTipo);

  /* ================== Actualización ================== */

  const ctx = {
    camWorld: new THREE.Vector3(), camLocal: new THREE.Vector3(), toCamDir: new THREE.Vector3(),
    camLocalQ: new THREE.Quaternion(), camLocalQInv: new THREE.Quaternion(), dist: 1,
  };
  const _gq = new THREE.Quaternion();

  function update(dt = 0.016, time = 0, camera) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    tReal += dt;
    tiempo.value = tReal;
    // rotación del cuerpo estelar (tiempo de simulación)
    const ang = (time / periodo) * Math.PI * 2;
    if (foto) foto.rotation.y = C.tipo === 'compacta' ? tReal * 0.5 : ang;

    if (camera) {
      group.updateWorldMatrix(true, true);
      camera.getWorldPosition(ctx.camWorld);
      ctx.camLocal.copy(ctx.camWorld);
      group.worldToLocal(ctx.camLocal);
      ctx.dist = Math.max(ctx.camLocal.length(), 1e-4);
      ctx.toCamDir.copy(ctx.camLocal).divideScalar(ctx.dist);
      group.getWorldQuaternion(_gq);
      camera.getWorldQuaternion(ctx.camLocalQ);
      ctx.camLocalQ.premultiply(_gq.invert());
      ctx.camLocalQInv.copy(ctx.camLocalQ).invert();
      for (const b of billboards) {
        b.mesh.quaternion.copy(ctx.camLocalQ);
        if (b.offset) {
          const off = Math.min(b.offset, ctx.dist * 0.5);
          b.mesh.position.copy(ctx.toCamDir).multiplyScalar(off);
          b.mesh.scale.setScalar((ctx.dist - off) / ctx.dist);
        }
      }
    }
    for (const u of updaters) u(dt, ctx);
  }

  function dispose() {
    if (group.parent) group.parent.remove(group);
    for (const r of recursos) r.dispose && r.dispose();
    recursos.length = 0;
  }

  return { group, update, dispose, glowRadius, lens, nebulaRadius, coreRadius: R, clase };
}

const _q = new THREE.Quaternion();
const _n = new THREE.Vector3();
const _h = new THREE.Vector3();
const _mInv = new THREE.Matrix4();
