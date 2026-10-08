// El cielo que se ve desde la nave, compartido por el fondo de la web y el ventanal del puente.
// Todo son fórmulas en un shader: negro profundo, estrellas de varios tamaños y colores, la Vía Láctea
// con su polvo y nebulosas apenas insinuadas, como en una foto de larga exposición. Lo caro (nebulosas
// y miles de estrellas) se calcula una sola vez en una textura; cada fotograma solo la desplaza y
// añade las estrellas brillantes y, en el fondo de la web, alguna estrella fugaz.

export const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`

// Funciones que usan tanto la textura del cielo como lo que se dibuja encima cada fotograma.
export const STARS_GLSL = `
float hash1(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 hash4(vec2 p) {
  vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}

// Color de una estrella según su temperatura: de azul blanco a naranja, con las blancas en mayoría.
vec3 starColor(float t) {
  vec3 c = mix(vec3(0.72, 0.82, 1.00), vec3(0.97, 0.97, 1.00), smoothstep(0.0, 0.3, t));
  c = mix(c, vec3(1.00, 0.93, 0.82), smoothstep(0.55, 0.8, t));
  c = mix(c, vec3(1.00, 0.76, 0.56), smoothstep(0.86, 1.0, t));
  return c;
}

// Las estrellas brillantes: pocas, con un halo pequeño y, las más grandes, un destello en cruz tenue.
// px va en píxeles CSS para que se vean igual en todas las pantallas. twinkle y spike: cuánto titilan
// y cuánto destello llevan (0 = nada, como en el espacio de verdad).
vec3 brightStars(vec2 px, float cell, float density, float seed, float t, float twinkle, float spike) {
  vec2 i = floor(px / cell);
  vec3 acc = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = i + vec2(float(x), float(y));
      vec4 h = hash4(c * 2.3 + seed);
      if (h.x > density) continue;
      vec2 pos = (c + 0.15 + 0.7 * h.yz) * cell;
      vec2 v = px - pos;
      float d = length(v);
      if (d > 40.0) continue;
      float b = 0.3 + 0.7 * pow(h.w, 2.2);
      float tw = 1.0 - twinkle * (0.5 + 0.5 * sin(t * (1.2 + 2.2 * h.y) + h.z * 6.2832));
      float r = 0.85 + 1.25 * b;
      float core = exp(-d * d / (r * r));
      float halo = exp(-d / (r * 3.0)) * 0.05 * b;
      float big = smoothstep(0.7, 1.0, b);
      float spikes = (exp(-abs(v.x) * 1.4) * exp(-abs(v.y) * 0.12) + exp(-abs(v.y) * 1.4) * exp(-abs(v.x) * 0.12)) * spike * big;
      acc += starColor(h.x / density) * ((core * 1.4 + halo) * b * tw + spikes * tw);
    }
  }
  return acc;
}
`

// La textura del cielo: fondo, Vía Láctea, nebulosas y tres capas de estrellas.
export const SKY_FRAG = `${PRECISION}
uniform vec2 uRes;      // tamaño de la textura en píxeles
uniform float uScale;   // píxeles de textura por píxel CSS
uniform float uSeed;
uniform vec4 uBand;     // Vía Láctea: centro (x, y), ángulo y anchura, en unidades de la altura
uniform vec3 uGain;     // intensidad de la Vía Láctea, de las nebulosas y de las estrellas
uniform vec3 uStars;    // cuántas estrellas hay en cada capa (finas, medianas, grandes), 1 = cielo lleno
uniform float uSat;     // saturación del color del gas (1 = foto de Hubble, 0 = gris)
uniform vec4 uNeb[3];   // nebulosas: centro (x, y), radio y tipo (0 violeta, 1 magenta, 2 turquesa)
${STARS_GLSL}

float noise2(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash1(i), hash1(i + vec2(1.0, 0.0)), f.x), mix(hash1(i + vec2(0.0, 1.0)), hash1(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm2(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    v += a * noise2(p);
    p = m * p * 2.03 + 7.3;
    a *= 0.5;
  }
  return v;
}

// Una capa de estrellas: a lo sumo una por celda, en un sitio al azar, muchas tenues y pocas brillantes.
// Las tenues son puntos de un píxel; solo las brillantes crecen un poco, como en una foto.
vec3 starLayer(vec2 px, float cell, float density, float size, float seed) {
  vec2 i = floor(px / cell);
  vec3 acc = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = i + vec2(float(x), float(y));
      vec4 h = hash4(c * 1.7 + seed);
      if (h.x > density) continue;
      vec2 pos = (c + 0.1 + 0.8 * h.yz) * cell;
      float d = length(px - pos);
      float b = pow(h.w, 3.0);
      float r = size * (0.5 + 0.9 * b);
      float core = exp(-d * d / (r * r));
      acc += starColor(h.x / density) * core * (0.1 + 0.9 * b);
    }
  }
  return acc;
}

vec2 rot(vec2 v, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

vec3 desat(vec3 c, float sat) {
  float l = dot(c, vec3(0.3, 0.5, 0.2));
  return mix(vec3(l), c, sat);
}

// Una nebulosa: una masa de gas con sus hilos, más densa en el centro, y polvo oscuro por delante.
vec3 nebula(vec2 uv, vec4 n, float seed) {
  vec2 d = (uv - n.xy) / n.z;
  float mask = exp(-dot(d, d) * 1.5);
  if (mask < 0.01) return vec3(0.0);
  float body = fbm2(d * 1.6 + seed);
  float wisp = fbm2(d * 4.2 + seed * 1.7 + 5.0);
  float dust = fbm2(d * 3.1 - seed + 2.0);
  vec3 a, b;
  if (n.w < 0.5) { a = vec3(0.40, 0.26, 0.90); b = vec3(0.84, 0.50, 0.94); }
  else if (n.w < 1.5) { a = vec3(0.78, 0.30, 0.60); b = vec3(1.00, 0.66, 0.56); }
  else { a = vec3(0.18, 0.60, 0.70); b = vec3(0.58, 0.86, 0.92); }
  float gas = smoothstep(0.34, 0.82, body * (0.55 + 0.7 * mask)) * mask;
  float threads = pow(smoothstep(0.45, 0.9, wisp), 2.4) * mask;
  float glowCore = pow(mask, 3.0) * smoothstep(0.3, 0.7, body) * 0.3;
  vec3 col = mix(a, b, smoothstep(0.25, 0.75, wisp)) * (gas * 0.5 + threads * 0.45) + b * glowCore;
  col *= 1.0 - 0.6 * smoothstep(0.52, 0.72, dust) * mask;
  return col;
}

void main() {
  vec2 px = gl_FragCoord.xy / uScale;
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  // El fondo: negro de verdad, con una pizca de azul.
  vec3 col = vec3(0.003, 0.003, 0.007);
  vec2 q = rot(uv - uBand.xy, -uBand.z);
  float by = q.y / uBand.w;
  float band = exp(-by * by);
  float wide = exp(-by * by / 5.76);

  // La Vía Láctea: una franja de luz moteada, gris cálida en el centro y azulada en los bordes,
  // cruzada por vetas de polvo oscuro.
  float n1 = fbm2(q * 2.2 + uSeed);
  float n2 = fbm2(q * vec2(3.4, 6.5) + 11.0 + uSeed);
  float n3 = fbm2(q * vec2(1.3, 2.6) + 23.0 - uSeed);
  float dust = smoothstep(0.44, 0.64, n2) * band;
  float glow = band * (0.3 + 0.7 * smoothstep(0.22, 0.82, n1)) + wide * 0.22 * smoothstep(0.3, 0.8, n3);
  glow *= 1.0 - 0.85 * dust;
  vec3 bandCol = mix(vec3(0.62, 0.70, 0.98), vec3(0.96, 0.88, 0.76), smoothstep(0.1, 0.9, n1) * band);
  col += desat(bandCol, uSat) * glow * uGain.x;
  col = mix(col, vec3(0.03, 0.02, 0.015), dust * 0.5 * uGain.x);

  // Nebulosas.
  vec3 neb = vec3(0.0);
  for (int i = 0; i < 3; i++) neb += nebula(uv, uNeb[i], uSeed + float(i) * 13.0);
  col += desat(neb, uSat) * uGain.y;

  // Estrellas: polvo fino, medianas y alguna más grande; más dentro de la Vía Láctea.
  float dens = 1.0 + 2.2 * band + 0.5 * wide;
  vec3 stars = starLayer(px, 7.0, min(0.16 * dens * uStars.x, 0.85), 0.62, uSeed);
  stars += starLayer(px, 15.0, min(0.24 * (1.0 + 1.1 * band) * uStars.y, 0.8), 0.85, uSeed + 3.0);
  stars += starLayer(px, 38.0, 0.4 * uStars.z, 1.15, uSeed + 7.0);
  col += stars * uGain.z;

  // Hombro suave en las luces, como una foto, y un poco de grano para que no haya bandas.
  col = 1.0 - exp(-col * 1.3);
  col += (hash1(gl_FragCoord.xy) - 0.5) / 200.0;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`

const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`

// Un contexto WebGL con el triángulo que cubre toda la pantalla ya preparado, o null si no hay WebGL.
export function initGL(canvas) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' })
  if (!gl) return null
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  return gl
}

function compile(gl, type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh))
  return sh
}

// Compila un shader de fragmentos y devuelve el programa con las posiciones de sus uniformes.
export function buildProgram(gl, frag, names) {
  const program = gl.createProgram()
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, frag))
  gl.bindAttribLocation(program, 0, 'a')
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
  const u = {}
  for (const name of names) u[name] = gl.getUniformLocation(program, name)
  return { program, u }
}

const skyPrograms = new WeakMap()

// Dibuja el cielo en una textura de w×h píxeles (ya multiplicados por la escala) y la devuelve.
// opts: { scale, seed, band: [x, y, ángulo, anchura], gain: [vía láctea, nebulosas, estrellas],
//         stars: [finas, medianas, grandes], sat, nebulae: [[x, y, r, tipo] ×3] }
export function bakeSky(gl, w, h, opts, previous) {
  let sky = skyPrograms.get(gl)
  if (!sky) {
    sky = buildProgram(gl, SKY_FRAG, ['uRes', 'uScale', 'uSeed', 'uBand', 'uGain', 'uStars', 'uSat', 'uNeb[0]'])
    skyPrograms.set(gl, sky)
  }
  const tex = previous || gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const fb = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.viewport(0, 0, w, h)
  gl.useProgram(sky.program)
  gl.uniform2f(sky.u.uRes, w, h)
  gl.uniform1f(sky.u.uScale, opts.scale)
  gl.uniform1f(sky.u.uSeed, opts.seed)
  gl.uniform4f(sky.u.uBand, ...opts.band)
  gl.uniform3f(sky.u.uGain, ...opts.gain)
  gl.uniform3f(sky.u.uStars, ...opts.stars)
  gl.uniform1f(sky.u.uSat, opts.sat)
  gl.uniform4fv(sky.u['uNeb[0]'], new Float32Array(opts.nebulae.flat()))
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.deleteFramebuffer(fb)
  return tex
}

// El tamaño máximo de textura que admite la tarjeta, para no pasarse en pantallas enormes.
export function maxTexture(gl) {
  return gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096
}
