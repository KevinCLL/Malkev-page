<script setup>
// El plano de la nave: la cubierta principal de la Malkevnia vista desde arriba, con cada estancia en
// su sitio. Se puede pasar por encima y entrar en cualquiera. Dibujado en SVG, sin imágenes.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { PATHS } from '../icons.js'

const props = defineProps({ stats: { type: Object, default: null } })
const router = useRouter()
const hover = ref(null)

const n = (k) => props.stats?.items?.[k] ?? 0
const plural = (v, one, many) => `${v} ${v === 1 ? one : many}`

// Cada estancia: dónde está en el plano (en unidades del viewBox) y qué hay dentro.
const rooms = computed(() => [
  { to: '/', name: 'Puente', icon: 'ship', x: 748, y: 150, w: 142, h: 140, here: true,
    detail: 'Estás aquí', hint: 'El ventanal y los mandos' },
  { to: '/blog', name: 'Bitácora', icon: 'log', x: 562, y: 92, w: 176, h: 98,
    detail: props.stats ? plural(props.stats.posts, 'entrada', 'entradas') : '', hint: 'El cuaderno del capitán' },
  { to: '/biblioteca', name: 'Biblioteca', icon: 'book', x: 562, y: 250, w: 176, h: 98,
    detail: props.stats ? `${plural(n('book'), 'libro', 'libros')} · ${plural(n('manga'), 'manga', 'mangas')}` : '', hint: 'Libros y manga' },
  { to: '/sala-de-proyeccion', name: 'Sala de proyección', icon: 'film', x: 376, y: 92, w: 176, h: 98,
    detail: props.stats ? `${plural(n('film'), 'peli', 'pelis')} · ${plural(n('series'), 'serie', 'series')}` : '', hint: 'Pelis y series' },
  { to: '/sala-de-juegos', name: 'Sala de juegos', icon: 'dice', x: 376, y: 250, w: 176, h: 98,
    detail: props.stats ? `${plural(n('boardgame'), 'caja', 'cajas')} · ${plural(n('rpg'), 'de rol', 'de rol')}` : '', hint: 'Las dos Kallax' },
  { to: '/sala-recreativa', name: 'Sala recreativa', icon: 'gamepad', x: 190, y: 92, w: 176, h: 98,
    detail: props.stats ? plural(n('videogame'), 'juego', 'juegos') : '', hint: 'Videojuegos' },
  { to: '/consola', name: 'Consola', icon: 'console', x: 190, y: 250, w: 176, h: 98,
    detail: 'Sala de máquinas', hint: 'Solo para el capitán' },
])

// Compuertas: de cada estancia al pasillo central.
const hatches = computed(() => rooms.value.filter((r) => !r.here).map((r) => ({
  x: r.x + r.w / 2 - 14,
  y: r.y < 200 ? r.y + r.h - 3 : r.y - 5,
})))

function go(room) {
  if (room.to === '/') {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  router.push(room.to)
}
</script>

<template>
  <div class="map-wrap">
    <svg class="map" viewBox="0 0 1000 440" role="group" aria-label="Plano de la nave: una estancia por sala, cada una lleva a su sección">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="rgba(201, 182, 255, 0.07)" stroke-width="1" />
        </pattern>
        <linearGradient id="hull-fill" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="rgba(26, 17, 52, 0.92)" />
          <stop offset="1" stop-color="rgba(40, 27, 78, 0.92)" />
        </linearGradient>
        <radialGradient id="exhaust" cx="1" cy="0.5" r="1">
          <stop offset="0" stop-color="rgba(139, 227, 224, 0.9)" />
          <stop offset="0.5" stop-color="rgba(161, 132, 255, 0.45)" />
          <stop offset="1" stop-color="rgba(161, 132, 255, 0)" />
        </radialGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <rect width="1000" height="440" fill="url(#grid)" />
      <!-- Marcas de esquina y la rosa, como en un plano técnico -->
      <g class="marks" fill="none" stroke="rgba(201, 182, 255, 0.35)" stroke-width="1.5">
        <path d="M14 34V14h20 M966 14h20v20 M14 406v20h20 M986 406v20h-20" />
      </g>
      <g class="compass" transform="translate(944 392)">
        <circle r="18" fill="none" stroke="rgba(201, 182, 255, 0.35)" />
        <path d="M0 -13L5 0L0 13L-5 0Z" fill="rgba(161, 132, 255, 0.8)" />
        <text y="-24" class="tiny">PROA</text>
      </g>
      <text x="22" y="418" class="tiny">LA MALKEVNIA · CUBIERTA PRINCIPAL · ESCALA 1:1 (MÁS O MENOS)</text>

      <!-- Motores -->
      <g class="engines">
        <ellipse class="exhaust" cx="30" cy="155" rx="60" ry="22" fill="url(#exhaust)" />
        <ellipse class="exhaust" cx="30" cy="285" rx="60" ry="22" fill="url(#exhaust)" />
        <rect x="28" y="128" width="70" height="54" rx="14" class="nacelle" />
        <rect x="28" y="258" width="70" height="54" rx="14" class="nacelle" />
        <rect x="90" y="150" width="26" height="140" rx="4" class="nacelle" />
      </g>

      <!-- Casco -->
      <path
        class="hull"
        d="M980 220 L830 112 Q760 68 560 68 L160 68 Q104 68 104 124 L104 316 Q104 372 160 372 L560 372 Q760 372 830 328 Z"
      />
      <path class="hull-inner" d="M940 220 L812 134 Q750 100 560 100 L170 100 Q136 100 136 134 L136 306 Q136 340 170 340 L560 340 Q750 340 812 306 Z" />

      <!-- Pasillo central -->
      <rect x="184" y="198" width="560" height="44" rx="8" class="corridor" />
      <text x="464" y="225" class="corridor-label">PASILLO CENTRAL</text>
      <g class="hatches">
        <rect v-for="(h, i) in hatches" :key="i" :x="h.x" :y="h.y" width="28" height="8" rx="2" />
      </g>

      <!-- Estancias -->
      <a
        v-for="room in rooms"
        :key="room.to"
        :href="room.to"
        class="room"
        :class="{ here: room.here, lit: hover === room.to }"
        @click.prevent="go(room)"
        @mouseenter="hover = room.to"
        @mouseleave="hover = null"
        @focus="hover = room.to"
        @blur="hover = null"
      >
        <title>{{ room.name }}: {{ room.hint }}</title>
        <rect :x="room.x" :y="room.y" :width="room.w" :height="room.h" rx="12" class="room-floor" />
        <g :transform="`translate(${room.x + 14} ${room.y + 12}) scale(1.05)`" class="room-icon">
          <path :d="PATHS[room.icon]" />
        </g>
        <text :x="room.x + 14" :y="room.y + room.h - 34" class="room-name">{{ room.name }}</text>
        <text :x="room.x + 14" :y="room.y + room.h - 14" class="room-detail">{{ room.detail }}</text>
        <circle v-if="room.here" :cx="room.x + room.w - 24" :cy="room.y + 24" r="5" class="here-dot" />
      </a>

      <!-- Luces de posición: roja a babor, verde a estribor, blanca en la proa -->
      <circle cx="846" cy="118" r="5" class="light port" />
      <circle cx="846" cy="322" r="5" class="light starboard" />
      <circle cx="978" cy="220" r="4" class="light strobe" />
    </svg>
  </div>
</template>

<style scoped>
.map-wrap {
  overflow-x: auto;
  scrollbar-width: thin;
}
.map {
  display: block;
  width: 100%;
  min-width: 760px;
  height: auto;
  font-family: var(--font-body);
}
.tiny {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  fill: var(--muted);
  text-anchor: start;
}
.compass .tiny {
  text-anchor: middle;
}
.nacelle {
  fill: rgba(20, 13, 40, 0.95);
  stroke: rgba(201, 182, 255, 0.4);
  stroke-width: 1.5;
}
.exhaust {
  animation: breathe 3.4s ease-in-out infinite;
  transform-origin: 90px 50%;
}
.exhaust:nth-child(2) {
  animation-delay: -1.7s;
}
.hull {
  fill: url(#hull-fill);
  stroke: var(--lavender);
  stroke-width: 2;
  filter: drop-shadow(0 18px 30px rgba(0, 0, 0, 0.6));
}
.hull-inner {
  fill: none;
  stroke: rgba(201, 182, 255, 0.18);
  stroke-width: 1;
  stroke-dasharray: 6 6;
}
.corridor {
  fill: rgba(6, 3, 16, 0.5);
  stroke: rgba(201, 182, 255, 0.22);
  stroke-width: 1;
}
.corridor-label {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.3em;
  fill: rgba(148, 136, 184, 0.7);
  text-anchor: middle;
}
.hatches rect {
  fill: rgba(161, 132, 255, 0.55);
}
.room {
  cursor: pointer;
  outline: none;
}
.room-floor {
  fill: rgba(161, 132, 255, 0.08);
  stroke: rgba(201, 182, 255, 0.35);
  stroke-width: 1.2;
  transition: fill 0.25s, stroke 0.25s;
}
.room.lit .room-floor,
.room:focus-visible .room-floor {
  fill: rgba(161, 132, 255, 0.26);
  stroke: var(--violet);
  filter: url(#glow);
}
.room.here .room-floor {
  fill: rgba(139, 227, 224, 0.1);
  stroke: rgba(139, 227, 224, 0.5);
}
.room.here.lit .room-floor {
  fill: rgba(139, 227, 224, 0.22);
  stroke: var(--teal);
}
.room-icon path {
  fill: none;
  stroke: var(--lavender);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.room-name {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  fill: var(--text);
}
.room-detail {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.03em;
  fill: var(--muted);
}
.room.lit .room-detail {
  fill: var(--lavender);
}
.here-dot {
  fill: var(--teal);
  filter: drop-shadow(0 0 6px var(--teal));
  animation: pulse 2.4s ease-in-out infinite;
}
.light {
  animation: blink 2s steps(1) infinite;
}
.light.port {
  fill: #ff4d3d;
  filter: drop-shadow(0 0 6px #ff4d3d);
}
.light.starboard {
  fill: #3dff8a;
  filter: drop-shadow(0 0 6px #3dff8a);
  animation-delay: -1s;
}
.light.strobe {
  fill: #fff;
  filter: drop-shadow(0 0 8px #fff);
  animation: strobe 2.6s ease-out infinite;
}
@keyframes breathe {
  0%, 100% { opacity: 0.55; transform: scaleX(1); }
  50% { opacity: 1; transform: scaleX(1.25); }
}
@keyframes blink {
  0%, 60% { opacity: 1; }
  60.01%, 100% { opacity: 0.25; }
}
@keyframes strobe {
  0%, 6% { opacity: 1; }
  12%, 100% { opacity: 0.08; }
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@media (prefers-reduced-motion: reduce) {
  .exhaust, .light, .here-dot {
    animation: none;
  }
}
</style>
