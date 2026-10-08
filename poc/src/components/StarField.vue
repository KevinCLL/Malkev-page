<script setup>
// El espacio al otro lado del casco: negro profundo con estrellas nítidas de distintos colores, la Vía
// Láctea y alguna nebulosa apenas insinuadas, dibujado en un shader. Deriva muy despacio, como si la nave avanzara
// a velocidad de crucero, se desplaza un poco al hacer scroll y con el ratón, las estrellas brillantes
// titilan y de vez en cuando cruza una estrella fugaz. Sin WebGL quedan los puntos de siempre.
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { PRECISION, STARS_GLSL, bakeSky, buildProgram, initGL, maxTexture } from '../sky.js'

const glCanvas = ref(null)
const flatCanvas = ref(null)
const flat = ref(false)
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Margen de la textura alrededor de la pantalla, para que la deriva y el paralaje no enseñen el borde.
const PAD = { x: 0.06, y: 0.16 }

const FRAG = `${PRECISION}
uniform sampler2D uSky;
uniform vec2 uTex;      // tamaño de la textura del cielo
uniform vec2 uOff;      // desplazamiento del cielo, en píxeles de textura
uniform vec2 uOff2;     // desplazamiento de las estrellas brillantes, en píxeles CSS
uniform float uScale;
uniform float uTime;
uniform float uSeed;
uniform vec4 uMeteor;   // estrella fugaz: cabeza (x, y) en píxeles CSS y dirección
uniform vec2 uMeteorP;  // progreso (0..1, 0 = ninguna) y longitud de la cola
${STARS_GLSL}

vec3 meteor(vec2 px) {
  if (uMeteorP.x <= 0.0) return vec3(0.0);
  vec2 rel = px - uMeteor.xy;
  float along = dot(rel, -uMeteor.zw);
  float across = dot(rel, vec2(-uMeteor.w, uMeteor.z));
  float tail = clamp(1.0 - along / uMeteorP.y, 0.0, 1.0);
  float inside = step(0.0, along) * step(along, uMeteorP.y);
  float glow = exp(-across * across / 1.6) * tail * tail * inside;
  float head = exp(-dot(rel, rel) / 4.0);
  float a = sin(uMeteorP.x * 3.1416);
  return vec3(0.92, 0.9, 1.0) * (glow * 0.8 + head) * a;
}

void main() {
  vec3 col = texture2D(uSky, (gl_FragCoord.xy + uOff) / uTex).rgb;
  vec2 px = gl_FragCoord.xy / uScale + uOff2;
  col += brightStars(px, 210.0, 0.32, uSeed + 31.0, uTime, 0.08, 0.35);
  col += meteor(px);
  gl_FragColor = vec4(col, 1.0);
}
`

let gl = null
let view = null
let sky = null
let raf = 0
let w = 0
let h = 0
let scale = 1
let texW = 0
let texH = 0
let started = 0
let lastFrame = 0
let scrollY = 0
let meteor = null
const target = { x: 0, y: 0 }
const shift = { x: 0, y: 0 }

function bake() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  const maxT = maxTexture(gl)
  scale = Math.min(dpr, maxT / (w * (1 + 2 * PAD.x)), maxT / (h * (1 + 2 * PAD.y)))
  glCanvas.value.width = Math.round(w * scale)
  glCanvas.value.height = Math.round(h * scale)
  glCanvas.value.style.height = `${h}px`
  texW = Math.round(w * (1 + 2 * PAD.x) * scale)
  texH = Math.round(h * (1 + 2 * PAD.y) * scale)
  const aspect = texW / texH
  const fx = (f) => f * aspect * 0.5
  // La Vía Láctea cruza en diagonal, subiendo hacia la derecha; las nebulosas, repartidas por el cielo.
  // Negro profundo, estrellas nítidas y la Vía Láctea y las nebulosas apenas insinuadas, como en una
  // foto de larga exposición: el gas está, pero no manda.
  sky = bakeSky(gl, texW, texH, {
    scale,
    seed: 4.2,
    band: [fx(0.15), -0.02, 0.5, 0.22],
    gain: [0.11, 0.16, 0.7],
    stars: [0.55, 0.6, 0.7],
    sat: 0.55,
    nebulae: [
      [fx(-0.6), 0.22, 0.42, 0],
      [fx(0.55), -0.3, 0.38, 1],
      [fx(0.12), 0.44, 0.28, 2],
    ],
  }, sky)
  gl.viewport(0, 0, glCanvas.value.width, glCanvas.value.height)
  gl.useProgram(view.program)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, sky)
  gl.uniform1i(view.u.uSky, 0)
  gl.uniform2f(view.u.uTex, texW, texH)
  gl.uniform1f(view.u.uScale, scale)
  gl.uniform1f(view.u.uSeed, 4.2)
  if (reduced) frame(started)
}

function resize() {
  if (!gl) return
  const nw = window.innerWidth
  const nh = window.innerHeight
  // En el móvil la altura cambia al esconderse la barra del navegador: el cielo se calcula para la
  // altura mayor y se queda, en vez de rehacerse a cada rato.
  const sameWidth = nw === w
  if (sameWidth && nh <= h) return
  w = nw
  h = sameWidth ? Math.max(h, nh) : nh
  bake()
}

function frame(now) {
  if (!gl) return
  const t = (now - started) / 1000
  shift.x += (target.x - shift.x) * 0.05
  shift.y += (target.y - shift.y) * 0.05
  const dx = 16 * Math.sin(t * 0.013) + shift.x * 7
  const dy = 9 * Math.sin(t * 0.019 + 1.0) + shift.y * 7
  // Al hacer scroll el cielo sube un poco, sin llegar nunca al borde de la textura.
  const room = PAD.y * h * 0.8
  const par = room * Math.tanh((scrollY * 0.07) / room)
  gl.uniform2f(view.u.uOff, (PAD.x * w + dx) * scale, (PAD.y * h + dy - par) * scale)
  gl.uniform2f(view.u.uOff2, (dx + shift.x * 5) * 1.6, (dy - par + shift.y * 5) * 1.6)
  gl.uniform1f(view.u.uTime, t)
  if (meteor) {
    const p = (now - meteor.start) / meteor.duration
    if (p >= 1) meteor = null
    else {
      const e = (now - meteor.start) / 1000
      gl.uniform4f(view.u.uMeteor, meteor.x + meteor.dx * meteor.speed * e, meteor.y + meteor.dy * meteor.speed * e, meteor.dx, meteor.dy)
      gl.uniform2f(view.u.uMeteorP, p, meteor.len)
    }
  }
  if (!meteor) gl.uniform2f(view.u.uMeteorP, 0, 0)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

function loop(now) {
  raf = requestAnimationFrame(loop)
  if (document.hidden) return
  // Treinta imágenes por segundo bastan para algo que se mueve tan despacio.
  if (now - lastFrame < 31) return
  const dt = lastFrame ? (now - lastFrame) / 1000 : 0
  lastFrame = now
  if (!meteor && Math.random() < dt * 0.05) {
    const ang = -Math.PI * (0.55 + Math.random() * 0.3)
    meteor = {
      x: w * (0.3 + Math.random() * 0.75), y: h * (0.55 + Math.random() * 0.5),
      dx: Math.cos(ang), dy: Math.sin(ang), speed: 700 + Math.random() * 300,
      len: 110 + Math.random() * 110, duration: 600 + Math.random() * 400, start: now,
    }
  }
  frame(now)
}

function onPointer(e) {
  target.x = e.clientX / window.innerWidth - 0.5
  target.y = -(e.clientY / window.innerHeight - 0.5)
}
function onScroll() {
  scrollY = window.scrollY
}

function startGL() {
  gl = initGL(glCanvas.value)
  if (!gl) return false
  view = buildProgram(gl, FRAG, ['uSky', 'uTex', 'uOff', 'uOff2', 'uScale', 'uTime', 'uSeed', 'uMeteor', 'uMeteorP'])
  started = performance.now()
  resize()
  glCanvas.value.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stopGL(); goFlat() })
  window.addEventListener('resize', resize)
  window.addEventListener('scroll', onScroll, { passive: true })
  if (!reduced) {
    window.addEventListener('pointermove', onPointer, { passive: true })
    raf = requestAnimationFrame(loop)
  }
  return true
}

function stopGL() {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('pointermove', onPointer)
  gl?.getExtension('WEBGL_lose_context')?.loseContext()
  gl = null
}

// Sin WebGL: los puntos de siempre en un canvas normal, con dos manchas de color por detrás.
let flatRaf = 0
let flatStars = []
let flatLast = 0

function flatResize() {
  const c = flatCanvas.value
  if (!c) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  w = window.innerWidth
  h = window.innerHeight
  c.width = w * dpr
  c.height = h * dpr
  c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0)
  flatStars = []
  const tints = ['255,255,255', '214,200,255', '196,180,255', '255,226,200', '190,230,255']
  for (const [count, speed, size, alpha] of [[0.00018, 2.5, 0.9, 0.6], [0.00008, 6, 1.3, 0.85], [0.000025, 13, 1.9, 1]]) {
    for (let i = 0; i < w * h * count; i++) {
      flatStars.push({ x: Math.random() * w, y: Math.random() * h, r: size * (0.5 + Math.random() * 0.5), a: alpha * (0.5 + Math.random() * 0.5), speed, tint: tints[Math.floor(Math.random() * tints.length)], ph: Math.random() * 7 })
    }
  }
  if (reduced) flatDraw(0, 0)
}

function flatDraw(t, dt) {
  const ctx = flatCanvas.value.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  for (const s of flatStars) {
    s.x -= s.speed * dt
    if (s.x < -2) { s.x = w + 2; s.y = Math.random() * h }
    ctx.globalAlpha = s.a * (0.75 + 0.25 * Math.sin(t * 0.001 + s.ph))
    ctx.fillStyle = `rgb(${s.tint})`
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function flatLoop(t) {
  const dt = flatLast ? Math.min((t - flatLast) / 1000, 0.05) : 0
  flatLast = t
  if (!document.hidden) flatDraw(t, dt)
  flatRaf = requestAnimationFrame(flatLoop)
}

async function goFlat() {
  flat.value = true
  await nextTick()
  flatResize()
  window.addEventListener('resize', flatResize)
  if (!reduced) flatRaf = requestAnimationFrame(flatLoop)
}

onMounted(() => {
  let ok = false
  try {
    ok = startGL()
  } catch (err) {
    console.warn('El cielo se queda con los puntos de siempre:', err.message)
    stopGL()
  }
  if (!ok) goFlat()
})

onBeforeUnmount(() => {
  stopGL()
  cancelAnimationFrame(flatRaf)
  window.removeEventListener('resize', flatResize)
})
</script>

<template>
  <div class="space" aria-hidden="true">
    <template v-if="flat">
      <div class="nebula nebula-a"></div>
      <div class="nebula nebula-b"></div>
      <canvas ref="flatCanvas"></canvas>
    </template>
    <canvas v-else ref="glCanvas" class="sky"></canvas>
  </div>
</template>

<style scoped>
.space {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  background: var(--space-0);
}
canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.sky {
  inset: 0 0 auto;
}
.nebula {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.55;
  animation: drift 90s ease-in-out infinite alternate;
}
.nebula-a {
  width: 60vw;
  height: 45vw;
  right: -15vw;
  top: -10vw;
  background: radial-gradient(closest-side, rgba(124, 82, 230, 0.45), rgba(124, 82, 230, 0));
}
.nebula-b {
  width: 50vw;
  height: 40vw;
  left: -20vw;
  bottom: -15vw;
  background: radial-gradient(closest-side, rgba(214, 120, 200, 0.22), rgba(214, 120, 200, 0));
  animation-duration: 120s;
}
@keyframes drift {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(-6vw, 3vw, 0) scale(1.08); }
}
</style>
