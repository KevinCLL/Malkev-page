<script setup>
// El espacio al otro lado del casco: estrellas en tres capas que se desplazan despacio,
// como si la nave avanzara a velocidad de crucero. Alguna estrella fugaz de vez en cuando.
import { onBeforeUnmount, onMounted, ref } from 'vue'

const canvas = ref(null)
let raf = 0
let stars = []
let shooting = null
let w = 0
let h = 0
let dpr = 1
let last = 0
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const LAYERS = [
  { count: 0.00018, speed: 2.5, size: [0.4, 0.9], alpha: [0.25, 0.6] },
  { count: 0.00008, speed: 6, size: [0.7, 1.3], alpha: [0.4, 0.85] },
  { count: 0.000025, speed: 13, size: [1.1, 1.9], alpha: [0.6, 1] },
]
const TINTS = ['255,255,255', '214,200,255', '196,180,255', '255,226,200', '190,230,255']

const rand = (a, b) => a + Math.random() * (b - a)

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  w = window.innerWidth
  h = window.innerHeight
  canvas.value.width = w * dpr
  canvas.value.height = h * dpr
  stars = []
  LAYERS.forEach((layer, li) => {
    const n = Math.round(w * h * layer.count)
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: rand(...layer.size),
        a: rand(...layer.alpha),
        tw: rand(0.2, 1.2),
        ph: Math.random() * Math.PI * 2,
        speed: layer.speed,
        tint: TINTS[Math.floor(Math.random() * TINTS.length)],
        layer: li,
      })
    }
  })
  if (reduced) draw(0, 0)
}

function draw(t, dt) {
  const ctx = canvas.value.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  for (const s of stars) {
    s.x -= s.speed * dt
    if (s.x < -2) {
      s.x = w + 2
      s.y = Math.random() * h
    }
    const twinkle = 0.75 + 0.25 * Math.sin(t * 0.001 * s.tw + s.ph)
    ctx.globalAlpha = s.a * twinkle
    ctx.fillStyle = `rgb(${s.tint})`
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()
    if (s.layer === 2 && s.r > 1.6) {
      ctx.globalAlpha = s.a * twinkle * 0.15
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  if (shooting) {
    shooting.life += dt
    const p = shooting.life / shooting.duration
    if (p >= 1) {
      shooting = null
    } else {
      const x = shooting.x + shooting.vx * shooting.life
      const y = shooting.y + shooting.vy * shooting.life
      const grad = ctx.createLinearGradient(x, y, x - shooting.vx * 0.12, y - shooting.vy * 0.12)
      grad.addColorStop(0, `rgba(230,220,255,${0.9 * Math.sin(p * Math.PI)})`)
      grad.addColorStop(1, 'rgba(230,220,255,0)')
      ctx.globalAlpha = 1
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - shooting.vx * 0.12, y - shooting.vy * 0.12)
      ctx.stroke()
    }
  } else if (!reduced && Math.random() < dt * 0.04) {
    shooting = { x: rand(w * 0.2, w), y: rand(0, h * 0.5), vx: -rand(500, 800), vy: rand(150, 280), life: 0, duration: rand(0.7, 1.2) }
  }
  ctx.globalAlpha = 1
}

function loop(t) {
  const dt = last ? Math.min((t - last) / 1000, 0.05) : 0
  last = t
  draw(t, dt)
  raf = requestAnimationFrame(loop)
}

function onVisibility() {
  if (reduced) return
  cancelAnimationFrame(raf)
  last = 0
  if (!document.hidden) raf = requestAnimationFrame(loop)
}

onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', onVisibility)
  if (!reduced) raf = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <div class="space" aria-hidden="true">
    <div class="nebula nebula-a"></div>
    <div class="nebula nebula-b"></div>
    <canvas ref="canvas"></canvas>
  </div>
</template>

<style scoped>
.space {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
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
