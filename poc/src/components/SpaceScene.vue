<script setup>
// Lo que se ve por el ventanal del puente, como una foto tomada desde órbita: espacio negro con pocas
// estrellas, un gigante gaseoso con luz dura y una atmósfera fina en el limbo, su luna, el destello del
// sol en la lente y, abajo, el morro de la Malkevnia en 3D (chapas, lomo, mástil y luces de posición)
// iluminado por el mismo sol. Todo se dibuja en un shader (WebGL), sin texturas ni imágenes.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { PRECISION, STARS_GLSL, bakeSky, buildProgram, initGL, maxTexture } from '../sky.js'

const emit = defineEmits(['unsupported'])
const canvas = ref(null)
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Margen del cielo alrededor del ventanal, para el paralaje.
const PAD = 0.05

const FRAG = `${PRECISION}
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uPlanet;   // centro (x, y) y radio, en unidades de la altura del ventanal
uniform vec3 uOrbit;    // semiejes de la órbita de la luna (x, y) y su radio
uniform vec2 uShift;    // paralaje con el ratón
uniform float uDetail;  // 1 = todos los octavos de ruido; menos en pantallas pequeñas
uniform sampler2D uSky; // el cielo de fondo, calculado una vez
uniform vec2 uTex;      // tamaño de la textura del cielo
uniform float uScale;   // píxeles del lienzo por píxel CSS
uniform float uSeed;
uniform float uView;    // cuánto baja el morro en pantalla (en vertical, para dejar sitio al texto)
${STARS_GLSL}

const vec3 LIGHT = normalize(vec3(-0.72, 0.42, 0.5));
const vec3 ATMO = vec3(0.62, 0.60, 1.00);
const vec3 SUN = vec3(1.0, 0.96, 0.9);
const float FOCAL = 1.1;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (float(i) > 2.0 + 2.0 * uDetail) break;
    v += a * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}

vec3 rotY(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}
vec3 rotZ(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z);
}

// El gigante gaseoso: bandas de nubes con remolinos, tormentas, luz dura del sol con el lado de noche
// casi negro, el limbo oscurecido y una atmósfera fina y azulada donde da el sol.
vec4 planet(vec2 d, float r, float aa) {
  float l = length(d);
  if (l > r + aa) return vec4(0.0);
  float edge = 1.0 - smoothstep(r - aa, r + aa, l);
  l = min(l, r - 0.0005);
  float z = sqrt(r * r - l * l);
  vec3 n = vec3(d, z) / r;
  vec3 p = rotY(rotZ(n, -0.32), uTime * 0.018);

  float w1 = fbm(p * 2.1) - 0.5;
  float w2 = fbm(p * 4.3 + vec3(w1 * 1.6, 0.0, 3.0)) - 0.5;
  float band = p.y * 8.0 + w1 * 1.7 + w2 * 0.9;
  float s = sin(band * 3.1416);
  float s2 = sin(band * 6.2832 + 1.3);
  vec3 deep = vec3(0.19, 0.15, 0.27);
  vec3 violet = vec3(0.44, 0.38, 0.58);
  vec3 cream = vec3(0.80, 0.77, 0.84);
  vec3 mauve = vec3(0.53, 0.41, 0.54);
  vec3 col = mix(deep, violet, smoothstep(-0.7, 0.7, s));
  col = mix(col, cream, pow(smoothstep(0.2, 0.95, s2), 1.4) * 0.5);
  col = mix(col, mauve, smoothstep(0.3, 0.9, fbm(p * 3.7 + vec3(w2, 0.0, 7.0))) * 0.45);
  col = mix(col, deep * 0.8, smoothstep(0.55, 0.9, fbm(p * 2.9 + 11.0)) * 0.5);
  float storm = fbm(p * 7.0 + vec3(w2 * 2.0, 0.0, uTime * 0.01));
  col = mix(col, vec3(0.92, 0.90, 0.93), smoothstep(0.62, 0.78, storm) * 0.5);
  col *= 0.86 + 0.28 * fbm(p * 14.0 + w2 * 2.0);
  col = mix(vec3(dot(col, vec3(0.3, 0.5, 0.2))), col, 0.8);

  float ndl = dot(n, LIGHT);
  float lit = smoothstep(-0.06, 0.34, ndl);
  col = col * (0.012 + 1.15 * lit) * (0.55 + 0.45 * n.z);

  float rim = pow(1.0 - n.z, 4.0);
  float day = smoothstep(-0.25, 0.35, ndl);
  col += ATMO * rim * 0.35 * day;
  col += ATMO * pow(1.0 - n.z, 14.0) * 1.2 * day;
  col += vec3(0.4, 0.22, 0.5) * smoothstep(-0.22, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.25, ndl)) * 0.14;
  return vec4(col, edge);
}

// La luna: roca gris con cráteres y relieve, luz dura del sol y un poco de luz que rebota del planeta.
vec4 moon(vec2 d, float r, float spin, float aa) {
  float l = length(d);
  if (l > r + aa) return vec4(0.0);
  float edge = 1.0 - smoothstep(r - aa, r + aa, l);
  l = min(l, r - 0.0005);
  float z = sqrt(r * r - l * l);
  vec3 n = vec3(d, z) / r;
  vec3 p = rotY(n, spin);

  float e = 0.012;
  float h0 = fbm(p * 4.0);
  float hx = fbm((p + vec3(e, 0, 0)) * 4.0);
  float hy = fbm((p + vec3(0, e, 0)) * 4.0);
  vec3 bump = normalize(n + vec3(hx - h0, hy - h0, 0.0) * 9.0);

  float albedo = 0.5 + 0.45 * h0;
  float cr = noise(p * 9.0);
  float crater = smoothstep(0.58, 0.68, cr) * (1.0 - smoothstep(0.68, 0.76, cr));
  albedo *= 1.0 - 0.5 * crater;
  float cr2 = noise(p * 17.0 + 5.0);
  albedo *= 1.0 - 0.3 * smoothstep(0.66, 0.74, cr2) * (1.0 - smoothstep(0.74, 0.8, cr2));
  vec3 col = vec3(0.78, 0.77, 0.80) * albedo;

  float ndl = dot(bump, LIGHT);
  float lit = smoothstep(-0.03, 0.42, ndl);
  col = col * (0.01 + 1.2 * lit) + ATMO * 0.06 * max(dot(n, vec3(0.6, -0.2, 0.2)), 0.0);
  return vec4(col, edge);
}

// El destello del sol en la lente: el sol queda arriba a la izquierda, fuera del encuadre, y deja un
// resplandor, una raya anamórfica y unos fantasmas de colores en la línea que pasa por el centro.
vec3 flare(vec2 p) {
  vec2 sun = vec2(-0.5 * uRes.x / uRes.y - 0.12, 0.64);
  vec2 v = p - sun;
  float d = length(v);
  vec3 col = SUN * exp(-d * 2.4) * 0.38;
  col += vec3(0.6, 0.72, 1.0) * exp(-abs(v.y) * 28.0) * exp(-abs(v.x) * 0.8) * 0.1;
  for (int i = 0; i < 4; i++) {
    float k = 1.25 + float(i) * 0.38;
    vec2 c = sun - sun * k;
    float rad = 0.045 + 0.035 * float(i);
    float g = smoothstep(rad, rad * 0.6, length(p - c));
    vec3 tint = i == 0 ? vec3(0.55, 0.72, 1.0) : i == 1 ? vec3(0.9, 0.55, 0.85) : i == 2 ? vec3(0.55, 0.9, 0.75) : vec3(1.0, 0.82, 0.55);
    col += tint * g * 0.04;
  }
  float ring = smoothstep(0.02, 0.0, abs(length(p - (sun - sun * 1.9)) - 0.17));
  col += vec3(0.7, 0.6, 1.0) * ring * 0.02;
  return col;
}

// --- El morro de la nave, por raymarching de campos de distancia ---

float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }

const vec3 PORT = vec3(-1.25, -1.33, -3.4);
const vec3 STARBOARD = vec3(1.25, -1.33, -3.4);
const vec3 MAST_BASE = vec3(0.35, -1.2, -5.0);
const vec3 MAST_TOP = vec3(0.35, -0.72, -5.0);

float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// El casco: un morro largo y aplanado, con la cubierta apenas curvada, chaflanes a los lados, el lomo
// y un par de placas con relieve.
float hullBody(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float d = sdEllipsoid(p - vec3(0.0, -1.52, -3.4), vec3(1.5, 0.42, 3.6));
  d = smax(d, dot(q - vec3(0.92, -1.1, 0.0), normalize(vec3(0.75, 1.0, 0.0))), 0.06);
  float spine = sdEllipsoid(p - vec3(0.0, -1.12, -3.6), vec3(0.14, 0.08, 2.8));
  d = smin(d, spine, 0.06);
  float plate = sdRoundBox(q - vec3(0.5, -1.11, -3.3), vec3(0.16, 0.03, 0.3), 0.02);
  d = smin(d, plate, 0.03);
  plate = sdRoundBox(q - vec3(0.58, -1.14, -4.7), vec3(0.12, 0.03, 0.22), 0.02);
  d = smin(d, plate, 0.03);
  return d;
}

// id: 0 casco, 1 mástil, 2 luz roja (babor), 3 luz verde (estribor), 4 estroboscópico
float hull(vec3 p, out float id) {
  float d = hullBody(p);
  id = 0.0;
  float m = sdCapsule(p, MAST_BASE, MAST_TOP, 0.012);
  if (m < d) { d = m; id = 1.0; }
  float lp = length(p - PORT) - 0.04;
  if (lp < d) { d = lp; id = 2.0; }
  float ls = length(p - STARBOARD) - 0.04;
  if (ls < d) { d = ls; id = 3.0; }
  float st = length(p - MAST_TOP) - 0.018;
  if (st < d) { d = st; id = 4.0; }
  return d;
}

vec3 hullNormal(vec3 p) {
  vec2 e = vec2(0.0025, 0.0);
  float id;
  return normalize(vec3(
    hull(p + e.xyy, id) - hull(p - e.xyy, id),
    hull(p + e.yxy, id) - hull(p - e.yxy, id),
    hull(p + e.yyx, id) - hull(p - e.yyx, id)));
}

// Sombra suave hacia el sol (para que el mástil y el lomo proyecten sombra en la cubierta).
float hullShadow(vec3 ro) {
  float res = 1.0;
  float t = 0.03;
  float id;
  for (int i = 0; i < 18; i++) {
    float d = hull(ro + LIGHT * t, id);
    res = min(res, 12.0 * d / t);
    t += clamp(d, 0.02, 0.2);
    if (res < 0.01 || t > 3.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

float pointLight(vec3 pos, vec3 n, vec3 lp) {
  vec3 v = lp - pos;
  float d2 = dot(v, v);
  return max(dot(n, v / sqrt(d2)), 0.0) * 0.012 / (0.004 + d2);
}

vec3 shadeHull(vec3 pos, vec3 n, vec3 rd, float id, float strobe) {
  if (id == 2.0) return vec3(1.0, 0.16, 0.12) * 2.5;
  if (id == 3.0) return vec3(0.16, 1.0, 0.42) * 2.2;
  if (id == 4.0) return vec3(1.0) * (0.25 + 3.0 * strobe);
  vec3 base = id == 1.0 ? vec3(0.55, 0.56, 0.6) : vec3(0.44, 0.45, 0.5);
  if (id == 0.0) {
    // Chapas: una rejilla de juntas oscuras, cada panel de un tono ligeramente distinto, y roña.
    vec2 g = vec2(pos.x * 3.0, pos.z * 1.5);
    g.x += mod(floor(g.y), 2.0) * 0.5;
    vec2 cell = floor(g);
    base *= 1.0 + (hash1(cell + 3.0) - 0.5) * 0.16;
    vec2 f = abs(fract(g) - 0.5);
    float seam = 1.0 - smoothstep(0.465, 0.5, max(f.x, f.y));
    base *= 1.0 - 0.4 * seam;
    base *= 0.8 + 0.4 * fbm(pos * 4.0);
    base *= 1.0 - 0.3 * smoothstep(0.62, 0.8, noise(pos * 9.0 + 3.0));
  }
  float ndl = max(dot(n, LIGHT), 0.0);
  float sh = ndl > 0.0 ? hullShadow(pos + n * 0.01) : 1.0;
  vec3 h = normalize(LIGHT - rd);
  float spec = pow(max(dot(n, h), 0.0), 36.0) * 0.9;
  vec3 col = base * (SUN * ndl * sh * 1.3 + 0.02);
  col += SUN * spec * sh * (0.3 + 0.7 * ndl);
  // Luz que rebota del planeta, a la derecha, y su reflejo en la chapa.
  vec3 planetDir = normalize(vec3(0.75, 0.12, -1.0));
  col += base * vec3(0.42, 0.34, 0.62) * max(dot(n, planetDir), 0.0) * 0.35;
  vec3 refl = reflect(rd, n);
  float fres = pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
  col += vec3(0.42, 0.35, 0.62) * smoothstep(0.7, 0.95, dot(refl, planetDir)) * (0.08 + 0.35 * fres);
  // Las luces de posición tiñen el casco a su alrededor.
  col += vec3(1.0, 0.2, 0.15) * pointLight(pos, n, PORT) * base.x * 3.0;
  col += vec3(0.2, 1.0, 0.45) * pointLight(pos, n, STARBOARD) * base.x * 3.0;
  col += vec3(1.0) * pointLight(pos, n, MAST_TOP) * strobe * 2.0;
  return col;
}

vec2 project(vec3 q) {
  return vec2(q.x, q.y) / (-q.z) * FOCAL - vec2(0.0, uView);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float aa = 1.2 / uRes.y;
  vec2 pc = uPlanet.xy + uShift;
  float r = uPlanet.z;

  // El cielo lejano, que se mueve menos que el planeta con el paralaje; las estrellas brillantes,
  // algo más cerca, un poco más. Pocas: la cámara está expuesta para el planeta.
  vec2 pad = 0.5 * (uTex - uRes);
  vec3 sky = texture2D(uSky, (gl_FragCoord.xy + pad - uShift * uRes.y * 0.25) / uTex).rgb;
  vec2 cpx = (gl_FragCoord.xy - uShift * uRes.y * 0.5) / uScale;
  sky += brightStars(cpx, 260.0, 0.22, uSeed + 31.0, uTime, 0.0, 0.2);
  vec4 col = vec4(sky, 1.0);

  // Órbita de la luna: delante del planeta cuando pasa por la parte baja.
  float th = uTime * 0.075 - 0.644;
  float depth = sin(th);
  vec2 mc = pc + vec2(uOrbit.x * cos(th), -uOrbit.y * depth) + uShift * 0.9;
  float mr = uOrbit.z * (1.0 + 0.18 * depth);

  vec4 pl = planet(p - pc, r, aa);
  vec4 mo = moon(p - mc, mr, uTime * 0.05 + th, aa);

  // La atmósfera fuera del disco: una franja fina y brillante, con un halo muy tenue, solo de día.
  float dist = length(p - pc) - r;
  if (dist > 0.0) {
    float side = smoothstep(-0.45, 0.6, dot(normalize(vec3((p - pc) / r, 0.0)), LIGHT));
    float halo = exp(-dist / r * 48.0) * 0.9 + exp(-dist / r * 10.0) * 0.08;
    col.rgb += ATMO * halo * side;
  }

  if (depth < 0.0) {
    col = mix(col, mo, mo.a);
    col = mix(col, pl, pl.a);
  } else {
    col = mix(col, pl, pl.a);
    col = mix(col, mo, mo.a);
  }

  col.rgb += flare(p);

  // El morro de la nave, por delante de todo. Solo se busca en la parte baja del ventanal.
  float strobe = pow(max(sin(uTime * 2.6), 0.0), 30.0);
  vec3 rd = normalize(vec3(p.x, p.y + uView, -FOCAL));
  if (p.y + uView < 0.03) {
    float t = 0.0;
    float id = 0.0;
    bool hit = false;
    for (int i = 0; i < 72; i++) {
      vec3 q = rd * t;
      float d = hull(q, id);
      if (d < 0.0012 * (1.0 + t)) { hit = true; break; }
      t += d * 0.85;
      if (t > 9.0) break;
    }
    if (hit) {
      vec3 pos = rd * t;
      vec3 n = hullNormal(pos);
      col.rgb = shadeHull(pos, n, rd, id, strobe);
    }
  }

  // El resplandor de las luces, por encima de todo (se ve incluso cuando tapan el casco).
  vec2 sp = project(PORT);
  col.rgb += vec3(1.0, 0.25, 0.2) * exp(-dot(p - sp, p - sp) * 2200.0) * 0.9;
  sp = project(STARBOARD);
  col.rgb += vec3(0.25, 1.0, 0.5) * exp(-dot(p - sp, p - sp) * 2200.0) * 0.8;
  sp = project(MAST_TOP);
  col.rgb += vec3(0.95, 0.95, 1.0) * exp(-dot(p - sp, p - sp) * 1400.0) * strobe * 1.2;

  gl_FragColor = vec4(col.rgb, 1.0);
}
`

let gl = null
let raf = 0
let view = null
let sky = null
let observer = null
let io = null
let visible = true
let lastFrame = 0
let w = 0
let h = 0
let started = 0
const target = { x: 0, y: 0 }
const shift = { x: 0, y: 0 }

function setup() {
  gl = initGL(canvas.value)
  if (!gl) return false
  view = buildProgram(gl, FRAG, ['uRes', 'uTime', 'uPlanet', 'uOrbit', 'uShift', 'uDetail', 'uSky', 'uTex', 'uScale', 'uSeed', 'uView'])
  return true
}

function resize() {
  const el = canvas.value.parentElement
  w = el.clientWidth
  h = el.clientHeight
  if (!w || !h) return
  const narrow = w < 720
  // En pantallas pequeñas el planeta se dibuja con menos detalle: el ruido es lo caro.
  const maxT = maxTexture(gl)
  const scale = Math.min(window.devicePixelRatio || 1, 1.5, maxT / (w * (1 + 2 * PAD)), maxT / (h * (1 + 2 * PAD)))
  canvas.value.width = Math.round(w * scale)
  canvas.value.height = Math.round(h * scale)
  const texW = Math.round(w * (1 + 2 * PAD) * scale)
  const texH = Math.round(h * (1 + 2 * PAD) * scale)
  const aspect = texW / texH
  const fx = (f) => f * aspect * 0.5
  // Como en las fotos desde órbita: la cámara está expuesta para el planeta, así que el espacio sale
  // negro, con pocas estrellas y sin nebulosas; la Vía Láctea queda solo como una sombra de luz.
  sky = bakeSky(gl, texW, texH, {
    scale,
    seed: 9.7,
    band: [fx(0.2), narrow ? 0.38 : 0.26, -0.3, narrow ? 0.16 : 0.2],
    gain: [0.035, 0.03, 0.75],
    stars: [0.22, 0.28, 0.45],
    sat: 0.4,
    nebulae: [
      [fx(-0.55), 0.3, 0.5, 0],
      [fx(0.75), 0.42, 0.42, 1],
      [fx(-0.2), -0.32, 0.36, 2],
    ],
  }, sky)
  gl.viewport(0, 0, canvas.value.width, canvas.value.height)
  gl.useProgram(view.program)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, sky)
  gl.uniform1i(view.u.uSky, 0)
  gl.uniform2f(view.u.uTex, texW, texH)
  gl.uniform1f(view.u.uScale, scale)
  gl.uniform1f(view.u.uSeed, 9.7)
  gl.uniform2f(view.u.uRes, canvas.value.width, canvas.value.height)
  gl.uniform1f(view.u.uDetail, narrow ? 0.5 : 1)
  const ratio = w / h
  // El planeta, cortado por el borde derecho. En vertical el texto va abajo, así que el planeta sube
  // a la mitad de arriba y el morro baja para dejarle sitio. La órbita de la luna se queda a la
  // derecha, sin pasar por delante del texto; en vertical da la vuelta al revés.
  // La órbita es más ancha que el planeta más la luna: así, cuando la luna pasa de delante a detrás
  // (en los extremos de la órbita), ya está fuera del disco y no se nota el cambio de orden.
  if (narrow) {
    gl.uniform3f(view.u.uPlanet, ratio / 2 + 0.02, 0.22, 0.4)
    gl.uniform3f(view.u.uOrbit, 0.52, -0.12, 0.05)
    gl.uniform1f(view.u.uView, 0.18)
  } else {
    gl.uniform3f(view.u.uPlanet, ratio / 2 - 0.3, -0.04, 0.47)
    gl.uniform3f(view.u.uOrbit, 0.64, 0.2, 0.07)
    gl.uniform1f(view.u.uView, 0.0)
  }
  if (reduced) frame(started)
}

function frame(now) {
  if (!gl) return
  shift.x += (target.x - shift.x) * 0.04
  shift.y += (target.y - shift.y) * 0.04
  gl.uniform2f(view.u.uShift, shift.x, shift.y)
  gl.uniform1f(view.u.uTime, 40 + (now - started) / 1000)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

function loop(now) {
  raf = requestAnimationFrame(loop)
  if (!visible || document.hidden) return
  // Treinta imágenes por segundo bastan para algo que se mueve tan despacio.
  if (now - lastFrame < 31) return
  lastFrame = now
  frame(now)
}

function onPointer(e) {
  const rect = canvas.value.getBoundingClientRect()
  target.x = ((e.clientX - rect.left) / rect.width - 0.5) * 0.03
  target.y = -((e.clientY - rect.top) / rect.height - 0.5) * 0.03
}
function onLeave() {
  target.x = 0
  target.y = 0
}

onMounted(() => {
  try {
    if (!setup()) throw new Error('Sin WebGL')
  } catch (err) {
    console.warn('El ventanal se queda con el planeta plano:', err.message)
    emit('unsupported')
    return
  }
  started = performance.now()
  observer = new ResizeObserver(resize)
  observer.observe(canvas.value.parentElement)
  resize()
  io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
  io.observe(canvas.value)
  canvas.value.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); gl = null; emit('unsupported') })
  if (!reduced) {
    const parent = canvas.value.parentElement
    parent.addEventListener('pointermove', onPointer)
    parent.addEventListener('pointerleave', onLeave)
    raf = requestAnimationFrame(loop)
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  observer?.disconnect()
  io?.disconnect()
  const parent = canvas.value?.parentElement
  parent?.removeEventListener('pointermove', onPointer)
  parent?.removeEventListener('pointerleave', onLeave)
  gl?.getExtension('WEBGL_lose_context')?.loseContext()
  gl = null
})
</script>

<template>
  <canvas ref="canvas" class="scene" aria-hidden="true"></canvas>
</template>

<style scoped>
.scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
</style>
