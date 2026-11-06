<script setup>
// Fondo tranquilo: estrellas que derivan muy despacio detrás del cristal de la consola.
// Versión ligera para el panel (un canvas 2D); se queda quieto si se piden menos animaciones.
import { onBeforeUnmount, onMounted, ref } from 'vue'

const canvas = ref(null)
let raf = 0
let stars = []
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const TINTS = ['#ffffff', '#d4c4ff', '#e39be0', '#8be3e0', '#ffcf8a']

function resize() {
  const c = canvas.value
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  c.width = innerWidth * dpr
  c.height = innerHeight * dpr
  const n = Math.round((innerWidth * innerHeight) / 5200)
  stars = Array.from({ length: n }, () => ({
    x: Math.random() * c.width,
    y: Math.random() * c.height,
    r: (Math.random() ** 3 * 1.4 + 0.3) * dpr,
    a: Math.random() * 0.7 + 0.2,
    tw: Math.random() * Math.PI * 2,
    v: (Math.random() * 0.06 + 0.015) * dpr,
    tint: TINTS[Math.random() < 0.82 ? 0 : 1 + Math.floor(Math.random() * 4)],
  }))
  draw(0)
}

function draw(t) {
  const c = canvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, c.width, c.height)
  for (const s of stars) {
    if (!reduced) {
      s.x -= s.v
      if (s.x < -2) { s.x = c.width + 2; s.y = Math.random() * c.height }
    }
    ctx.globalAlpha = s.a * (0.75 + 0.25 * Math.sin(t / 1400 + s.tw))
    ctx.fillStyle = s.tint
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
  if (!reduced) raf = requestAnimationFrame(draw)
}

onMounted(() => { resize(); addEventListener('resize', resize) })
onBeforeUnmount(() => { cancelAnimationFrame(raf); removeEventListener('resize', resize) })
</script>

<template>
  <canvas ref="canvas" class="starfield" aria-hidden="true"></canvas>
</template>

<style scoped>
.starfield {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  pointer-events: none;
}
</style>
