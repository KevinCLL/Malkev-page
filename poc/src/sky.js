// El cielo que se ve desde la nave, compartido por el fondo de la web y el ventanal del puente.
// Todo son fórmulas en un shader: estrellas de varios tamaños y colores, la Vía Láctea con su polvo,
// nebulosas y, encima, las estrellas brillantes con su destello. Lo caro (nebulosas y miles de
// estrellas) se calcula una sola vez en una textura; cada fotograma solo la desplaza y añade las
// estrellas brillantes, que titilan, y alguna estrella fugaz.

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
  vec3 c = mix(vec3(0.68, 0.80, 1.00), vec3(0.96, 0.96, 1.00), smoothstep(0.0, 0.3, t));
  c = mix(c, vec3(1.00, 0.92, 0.78), smoothstep(0.55, 0.8, t));
  c = mix(c, vec3(1.00, 0.70, 0.48), smoothstep(0.86, 1.0, t));
  return c;
}

// Las estrellas brillantes: pocas, con halo, un destello en cruz y un titileo lento.
// px va en píxeles CSS para que se vean igual en todas las pantallas.
vec3 brightStars(vec2 px, float cell, float density, float seed, float t) {
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
      if (d > 48.0) continue;
      float b = 0.35 + 0.65 * pow(h.w, 2.0);
      float tw = 0.86 + 0.14 * sin(t * (1.2 + 2.2 * h.y) + h.z * 6.2832);
      float r = 1.0 + 1.5 * b;
      float core = exp(-d * d / (r * r));
      float halo = exp(-d / (r * 4.5)) * 0.09;
      float big = smoothstep(0.55, 1.0, b);
      float spikes = (exp(-abs(v.x) * 1.1) * exp(-abs(v.y) * 0.09) + exp(-abs(v.y) * 1.1) * exp(-abs(v.x) * 0.09)) * 0.3 * big;
      acc += starColor(h.x / density) * ((core * 1.5 + halo) * b * tw + spikes * (0.8 + 0.2 * tw));
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
      float b = pow(h.w, 2.5);
      float r = size * (0.55 + 0.9 * b);
      float core = exp(-d * d / (r * r));
      float halo = exp(-d / (r * 4.0)) * 0.05 * b;
      acc += starColor(h.x / density) * (core * (0.12 + 0.88 * b) + halo);
    }
  }
  return acc;
}

vec2 rot(vec2 v, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
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
  if (n.w < 0.5) { a = vec3(0.40, 0.24, 0.92); b = vec3(0.86, 0.46, 0.96); }
  else if (n.w < 1.5) { a = vec3(0.78, 0.26, 0.62); b = vec3(1.00, 0.62, 0.52); }
  else { a = vec3(0.16, 0.62, 0.70); b = vec3(0.56, 0.88, 0.92); }
  float gas = smoothstep(0.32, 0.80, body * (0.55 + 0.7 * mask)) * mask;
  float threads = pow(smoothstep(0.42, 0.88, wisp), 2.2) * mask;
  float glowCore = pow(mask, 3.0) * smoothstep(0.3, 0.7, body) * 0.35;
  vec3 col = mix(a, b, smoothstep(0.25, 0.75, wisp)) * (gas * 0.5 + threads * 0.45) + b * glowCore;
  col *= 1.0 - 0.55 * smoothstep(0.52, 0.72, dust) * mask;
  return col;
}

void main() {
  vec2 px = gl_FragCoord.xy / uScale;
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  // El fondo: casi negro, con un punto violeta, y una luz muy tenue que viene de la galaxia.
  vec3 col = vec3(0.012, 0.008, 0.028);
  vec2 q = rot(uv - uBand.xy, -uBand.z);
  float by = q.y / uBand.w;
  float band = exp(-by * by);
  float wide = exp(-by * by / 5.76);
  col += vec3(0.05, 0.03, 0.10) * wide * 0.5;

  // La Vía Láctea: una franja de luz moteada, cálida en el centro y azulada en los bordes,
  // cruzada por vetas de polvo oscuro.
  float n1 = fbm2(q * 2.2 + uSeed);
  float n2 = fbm2(q * vec2(3.4, 6.5) + 11.0 + uSeed);
  float n3 = fbm2(q * vec2(1.3, 2.6) + 23.0 - uSeed);
  float dust = smoothstep(0.44, 0.64, n2) * band;
  float glow = band * (0.3 + 0.7 * smoothstep(0.22, 0.82, n1)) + wide * 0.22 * smoothstep(0.3, 0.8, n3);
  glow *= 1.0 - 0.85 * dust;
  vec3 bandCol = mix(vec3(0.60, 0.68, 0.98), vec3(0.96, 0.86, 0.72), smoothstep(0.1, 0.9, n1) * band);
  col += bandCol * glow * uGain.x;
  col = mix(col, vec3(0.045, 0.028, 0.02), dust * 0.55);

  // Nebulosas.
  vec3 neb = vec3(0.0);
  for (int i = 0; i < 3; i++) neb += nebula(uv, uNeb[i], uSeed + float(i) * 13.0);
  col += neb * uGain.y;

  // Estrellas: polvo fino, medianas y alguna más grande; muchas más dentro de la Vía Láctea.
  float dens = 1.0 + 2.6 * band + 0.6 * wide;
  vec3 stars = starLayer(px, 6.0, min(0.2 * dens, 0.85), 0.72, uSeed);
  stars += starLayer(px, 13.0, min(0.28 * (1.0 + 1.2 * band), 0.8), 0.95, uSeed + 3.0);
  stars += starLayer(px, 34.0, 0.42, 1.3, uSeed + 7.0);
  col += stars * uGain.z;

  // Hombro suave en las luces, como una foto, y un poco de grano para que no haya bandas.
  col = 1.0 - exp(-col * 1.3);
  col += (hash1(gl_FragCoord.xy) - 0.5) / 160.0;
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
// opts: { scale, seed, band: [x, y, ángulo, anchura], gain: [vía láctea, nebulosas, estrellas], nebulae: [[x, y, r, tipo] ×3] }
export function bakeSky(gl, w, h, opts, previous) {
  let sky = skyPrograms.get(gl)
  if (!sky) {
    sky = buildProgram(gl, SKY_FRAG, ['uRes', 'uScale', 'uSeed', 'uBand', 'uGain', 'uNeb[0]'])
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
