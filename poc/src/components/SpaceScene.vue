<script setup>
// Lo que se ve por el ventanal del puente: un gigante gaseoso con su luna orbitando, nebulosa al fondo
// y la luz de un sol que queda fuera del encuadre. Todo se dibuja en un shader (WebGL), sin texturas.
import { onBeforeUnmount, onMounted, ref } from 'vue'

const emit = defineEmits(['unsupported'])
const canvas = ref(null)
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uPlanet;   // centro (x, y) y radio, en unidades de la altura del ventanal
uniform vec3 uOrbit;    // semiejes de la órbita de la luna (x, y) y su radio
uniform vec2 uShift;    // paralaje con el ratón
uniform float uDetail;  // 1 = todos los octavos de ruido; menos en pantallas pequeñas

const vec3 LIGHT = normalize(vec3(-0.72, 0.42, 0.5));
const vec3 ATMO = vec3(0.60, 0.50, 1.00);

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

// El gigante gaseoso: bandas de nubes deformadas por ruido, tormentas, atmósfera y terminador suave.
vec4 planet(vec2 d, float r, float aa) {
  float l = length(d);
  if (l > r + aa) return vec4(0.0);
  float edge = 1.0 - smoothstep(r - aa, r + aa, l);
  l = min(l, r - 0.0005);
  float z = sqrt(r * r - l * l);
  vec3 n = vec3(d, z) / r;
  vec3 p = rotY(rotZ(n, -0.32), uTime * 0.018);

  float warp = fbm(p * 2.3) - 0.5;
  float band = p.y * 7.5 + warp * 2.4 + 0.35 * (fbm(p * 5.1 + 3.0) - 0.5);
  float s = sin(band * 3.1416);
  float s2 = sin(band * 6.2832 + 1.3);
  vec3 deep = vec3(0.13, 0.08, 0.34);
  vec3 violet = vec3(0.40, 0.29, 0.78);
  vec3 cream = vec3(0.78, 0.70, 0.93);
  vec3 magenta = vec3(0.56, 0.26, 0.60);
  vec3 col = mix(deep, violet, smoothstep(-0.7, 0.7, s));
  col = mix(col, cream, pow(smoothstep(0.25, 0.95, s2), 1.6) * 0.6);
  col = mix(col, magenta, smoothstep(0.2, 0.9, fbm(p * 3.7 + 7.0)) * 0.5);
  col = mix(col, deep * 0.7, smoothstep(0.55, 0.9, fbm(p * 2.9 + 11.0)) * 0.5);
  float storm = fbm(p * 6.5 + vec3(0.0, 0.0, uTime * 0.01));
  col = mix(col, vec3(0.96, 0.90, 0.98), smoothstep(0.60, 0.76, storm) * 0.65);
  col *= 0.82 + 0.36 * fbm(p * 11.0);

  float ndl = dot(n, LIGHT);
  float lit = smoothstep(-0.18, 0.5, ndl);
  vec3 h = normalize(LIGHT + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, h), 0.0), 30.0) * 0.07;
  col = col * (0.05 + 1.0 * lit) * (0.72 + 0.28 * n.z) + spec;

  float rim = pow(1.0 - n.z, 2.6);
  col += ATMO * rim * (0.16 + 0.9 * smoothstep(-0.45, 0.45, ndl));
  col += ATMO * pow(1.0 - n.z, 9.0) * 0.9 * smoothstep(-0.3, 0.3, ndl);
  return vec4(col, edge);
}

// La luna: roca gris con cráteres y relieve, iluminada por el mismo sol y un poco por el planeta.
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

  float albedo = 0.52 + 0.45 * h0;
  float cr = noise(p * 9.0);
  float crater = smoothstep(0.58, 0.68, cr) * (1.0 - smoothstep(0.68, 0.76, cr));
  albedo *= 1.0 - 0.45 * crater;
  float cr2 = noise(p * 17.0 + 5.0);
  albedo *= 1.0 - 0.3 * smoothstep(0.66, 0.74, cr2) * (1.0 - smoothstep(0.74, 0.8, cr2));
  vec3 col = vec3(0.80, 0.78, 0.86) * albedo;

  float ndl = dot(bump, LIGHT);
  float lit = smoothstep(-0.08, 0.5, ndl);
  col = col * (0.05 + 1.1 * lit) + ATMO * 0.08 * max(dot(n, vec3(0.6, -0.2, 0.2)), 0.0);
  col += vec3(0.9, 0.88, 1.0) * pow(1.0 - n.z, 6.0) * 0.25 * lit;
  return vec4(col, edge);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float aa = 1.2 / uRes.y;
  vec2 pc = uPlanet.xy + uShift;
  float r = uPlanet.z;

  // Nebulosa lejana, apenas insinuada, que se mueve con el paralaje al revés que el planeta.
  vec2 np = p - uShift * 0.4;
  float neb = fbm(vec3(np * 1.4 + vec2(uTime * 0.004, 0.0), 2.0));
  float neb2 = fbm(vec3(np * 2.6 - vec2(0.0, uTime * 0.003), 7.0));
  vec3 nebCol = mix(vec3(0.42, 0.26, 0.86), vec3(0.20, 0.60, 0.66), smoothstep(0.3, 0.7, neb2));
  float nebA = smoothstep(0.42, 0.78, neb) * 0.32;
  vec4 col = vec4(nebCol * nebA, nebA);

  // Resplandor del sol, que queda arriba a la izquierda, fuera del ventanal.
  vec2 sun = vec2(-0.5 * uRes.x / uRes.y - 0.1, 0.62);
  float glare = exp(-length(p - sun) * 2.2) * 0.22;
  col += vec4(vec3(0.85, 0.78, 1.0) * glare, glare);

  // Órbita de la luna: delante del planeta cuando pasa por la parte baja.
  float th = uTime * 0.075 - 0.644;
  float depth = sin(th);
  vec2 mc = pc + vec2(uOrbit.x * cos(th), -uOrbit.y * depth) + uShift * 0.9;
  float mr = uOrbit.z * (1.0 + 0.18 * depth);

  vec4 pl = planet(p - pc, r, aa);
  vec4 mo = moon(p - mc, mr, uTime * 0.05 + th, aa);

  // Halo de la atmósfera fuera del disco.
  float dist = length(p - pc) - r;
  if (dist > 0.0) {
    float side = smoothstep(-0.6, 0.7, dot(normalize(vec3((p - pc) / r, 0.0)), LIGHT)) + 0.15;
    float halo = exp(-dist / r * 11.0) * 0.55 * side;
    col = mix(col, vec4(ATMO, 1.0), halo);
  }

  if (depth < 0.0) {
    col = mix(col, mo, mo.a);
    col = mix(col, pl, pl.a);
  } else {
    col = mix(col, pl, pl.a);
    col = mix(col, mo, mo.a);
  }

  gl_FragColor = vec4(col.rgb * col.a, col.a);
}
`

let gl = null
let raf = 0
let program = null
let uniforms = {}
let observer = null
let io = null
let visible = true
let lastFrame = 0
let w = 0
let h = 0
let started = 0
const target = { x: 0, y: 0 }
const shift = { x: 0, y: 0 }

function compile(type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh))
  return sh
}

function setup() {
  gl = canvas.value.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' })
  if (!gl) return false
  program = gl.createProgram()
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
  gl.useProgram(program)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(program, 'a')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  for (const name of ['uRes', 'uTime', 'uPlanet', 'uOrbit', 'uShift', 'uDetail']) uniforms[name] = gl.getUniformLocation(program, name)
  return true
}

function resize() {
  const el = canvas.value.parentElement
  w = el.clientWidth
  h = el.clientHeight
  const narrow = w < 720
  // En pantallas pequeñas se dibuja a menos resolución y con menos detalle: el ruido es lo caro.
  const scale = narrow ? 1 : Math.min(window.devicePixelRatio || 1, 1.5)
  canvas.value.width = Math.round(w * scale)
  canvas.value.height = Math.round(h * scale)
  gl.viewport(0, 0, canvas.value.width, canvas.value.height)
  gl.uniform2f(uniforms.uRes, canvas.value.width, canvas.value.height)
  gl.uniform1f(uniforms.uDetail, narrow ? 0.5 : 1)
  const aspect = w / h
  // El planeta, cortado por el borde derecho; en vertical baja al rincón inferior derecho.
  // En vertical el texto va abajo, así que el planeta sube a la mitad de arriba.
  // La órbita de la luna se queda a la derecha, sin pasar por delante del texto; en vertical
  // da la vuelta al revés, para que el paso por delante sea por arriba del planeta.
  if (narrow) {
    gl.uniform3f(uniforms.uPlanet, aspect / 2 + 0.02, 0.22, 0.4)
    gl.uniform3f(uniforms.uOrbit, 0.42, -0.12, 0.05)
  } else {
    gl.uniform3f(uniforms.uPlanet, aspect / 2 - 0.3, -0.04, 0.47)
    gl.uniform3f(uniforms.uOrbit, 0.5, 0.2, 0.08)
  }
  if (reduced) frame(0)
}

function frame(now) {
  if (!gl) return
  shift.x += (target.x - shift.x) * 0.04
  shift.y += (target.y - shift.y) * 0.04
  gl.uniform2f(uniforms.uShift, shift.x, shift.y)
  gl.uniform1f(uniforms.uTime, 40 + (now - started) / 1000)
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
