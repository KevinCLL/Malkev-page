<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api.js'
import { fallbackColor, isLight, seeded, shade } from '../util.js'
import GenCover from '../components/GenCover.vue'
import ItemModal from '../components/ItemModal.vue'
import AppIcon from '../components/AppIcon.vue'

const games = ref([])
const selected = ref(null)
const query = ref('')

onMounted(async () => {
  games.value = await api.items('boardgame')
})

// Grosor de cada caja tumbada, en % de la altura del cubo.
const THICKNESS = { xl: 27, l: 20, m: 15, s: 10 }
const CAPACITY = 92
const CUBES = 16
// Reparto de cada Kallax 4×4: dónde van los favoritos de frente, las pilas y la decoración.
const TEMPLATE = [
  'face', 'stack', 'stack', 'deco',
  'stack', 'face', 'stack', 'stack',
  'deco', 'stack', 'face', 'stack',
  'stack', 'stack', 'deco', 'face',
]
const DECOS = ['plant', 'dice', 'lamp', 'meeple']

const thickness = (g) => THICKNESS[g.meta?.box] || THICKNESS.m

const units = computed(() => {
  const explicit = new Map()
  const faces = []
  const loose = []
  for (const g of games.value) {
    if (g.shelf !== null && g.shelf !== undefined) {
      if (!explicit.has(g.shelf)) explicit.set(g.shelf, [])
      explicit.get(g.shelf).push(g)
    } else if (g.featured) {
      faces.push({ type: 'face', items: [g] })
    } else {
      loose.push(g)
    }
  }
  const stacks = []
  let current = null
  for (const g of loose) {
    const t = thickness(g)
    if (!current || current.used + t > CAPACITY) {
      current = { type: 'stack', items: [], used: 0 }
      stacks.push(current)
    }
    current.items.push(g)
    current.used += t
  }

  const totalCubes = Math.max(CUBES, Math.ceil((faces.length + stacks.length + explicit.size) / CUBES) * CUBES)
  const cubes = new Array(totalCubes).fill(null)
  for (const [shelf, items] of explicit) {
    if (shelf < totalCubes) cubes[shelf] = { type: items.length === 1 && items[0].featured ? 'face' : 'stack', items }
  }
  // Los cubos que sobran se decoran, primero en los huecos de decoración de la plantilla.
  const free = cubes.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0)
  const decoCount = free.length - faces.length - stacks.length
  const decoSlots = new Set(free.filter((i) => TEMPLATE[i % CUBES] === 'deco').slice(0, decoCount))
  for (const i of [...free].reverse()) if (decoSlots.size < decoCount) decoSlots.add(i)
  let deco = 0
  for (const i of free) {
    if (decoSlots.has(i)) {
      cubes[i] = { type: 'deco', deco: DECOS[deco++ % DECOS.length], items: [] }
    } else {
      cubes[i] = TEMPLATE[i % CUBES] === 'face' ? faces.shift() || stacks.shift() : stacks.shift() || faces.shift()
    }
  }
  const out = []
  for (let i = 0; i < cubes.length; i += CUBES) out.push(cubes.slice(i, i + CUBES))
  return out
})

const normalized = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const matches = (g) => !query.value || normalized(`${g.title} ${g.creator}`).includes(normalized(query.value))
const matchCount = computed(() => games.value.filter(matches).length)

function slabStyle(g) {
  const c = g.color || fallbackColor(g.title)
  return {
    height: `${thickness(g)}%`,
    width: `${80 + seeded(g.title, 'w') * 16}%`,
    marginLeft: `${seeded(g.title, 'l') * 6}%`,
    '--c': c,
    '--c-dark': shade(c, -0.45),
    '--c-light': shade(c, 0.25),
    color: isLight(c) ? '#1a1030' : '#f6f2ff',
  }
}

const topRated = computed(() => [...games.value].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 5))
const longest = computed(() => [...games.value].sort((a, b) => (b.meta?.minutes ?? 0) - (a.meta?.minutes ?? 0))[0])
</script>

<template>
  <main class="page">
    <header class="page-head">
      <p class="eyebrow">Cubierta 2 · Sala de recreo</p>
      <h1 class="page-title">Sala de juegos</h1>
      <p class="page-lead">La Kallax de a bordo. Los favoritos miran de frente, el resto descansa en pilas esperando la próxima partida. Toca cualquier caja para sacarla.</p>
    </header>

    <div class="room-layout">
      <div class="kallax-area">
        <div v-for="(unit, u) in units" :key="u" class="kallax" :aria-label="`Kallax ${u + 1}`">
          <div v-for="(cube, i) in unit" :key="i" class="cube">
            <span class="led" aria-hidden="true"></span>

            <button
              v-if="cube.type === 'face'"
              class="face-box"
              :class="{ dim: !matches(cube.items[0]) }"
              :title="cube.items[0].title"
              @click="selected = cube.items[0]"
            >
              <GenCover :item="cube.items[0]" ratio="1 / 1" />
              <span class="face-label">{{ cube.items[0].title }}</span>
            </button>

            <div v-else-if="cube.type === 'stack'" class="stack">
              <button
                v-for="g in cube.items"
                :key="g.id"
                class="slab"
                :class="{ dim: !matches(g) }"
                :style="slabStyle(g)"
                :title="g.title"
                @click="selected = g"
              >
                <span class="slab-title">{{ g.title }}</span>
              </button>
            </div>

            <div v-else class="deco" :class="cube.deco" aria-hidden="true">
              <svg v-if="cube.deco === 'plant'" viewBox="0 0 100 100">
                <path d="M50 70 C40 50 22 48 16 34 C34 34 46 46 50 66 Z" class="leaf" />
                <path d="M50 70 C58 46 74 40 86 28 C82 50 64 56 52 68 Z" class="leaf" />
                <path d="M50 72 C48 50 50 32 56 16 C62 34 58 54 51 70 Z" class="leaf leaf-b" />
                <path d="M34 70 h32 l-4 22 h-24 z" class="pot" />
              </svg>
              <svg v-else-if="cube.deco === 'dice'" viewBox="0 0 100 100">
                <path d="M50 22 L76 37 L76 67 L50 82 L24 67 L24 37 Z" class="die" />
                <path d="M50 22 L50 52 M24 37 L50 52 L76 37 M50 52 L50 82" class="die-line" />
                <text x="50" y="45" class="die-num">20</text>
              </svg>
              <svg v-else-if="cube.deco === 'lamp'" viewBox="0 0 100 100">
                <circle cx="50" cy="52" r="20" class="orb" />
                <path d="M40 76 h20 l3 10 h-26 z" class="pot" />
              </svg>
              <svg v-else viewBox="0 0 100 100">
                <path d="M50 26 a9 9 0 1 1 0.1 0 Z M36 46 C40 40 60 40 64 46 L78 52 C80 58 74 60 68 58 L64 58 L70 84 L56 84 L50 70 L44 84 L30 84 L36 58 L32 58 C26 60 20 58 22 52 Z" class="meeple" />
              </svg>
            </div>
          </div>
        </div>
        <div class="feet" aria-hidden="true"><span></span><span></span></div>
      </div>

      <aside class="side">
        <div class="panel panel-pad">
          <label class="search">
            <AppIcon name="search" class="search-icon" />
            <span class="sr-only">Buscar un juego</span>
            <input v-model="query" class="input" type="search" placeholder="Buscar un juego…" />
          </label>
          <p v-if="query" class="readout match">{{ matchCount }} {{ matchCount === 1 ? 'caja encendida' : 'cajas encendidas' }}</p>
        </div>

        <div class="panel panel-pad stats">
          <div><span class="readout">Juegos</span><strong>{{ games.length }}</strong></div>
          <div><span class="readout">Favoritos</span><strong>{{ games.filter((g) => g.featured).length }}</strong></div>
          <div v-if="longest" class="wide"><span class="readout">La partida más larga</span><span>{{ longest.title }} · {{ longest.meta.minutes }} min</span></div>
        </div>

        <div class="panel panel-pad">
          <p class="eyebrow">Los mejor valorados</p>
          <ol class="top">
            <li v-for="g in topRated" :key="g.id">
              <button class="top-item" @click="selected = g">
                <span class="swatch" :style="{ background: g.color || fallbackColor(g.title) }"></span>
                <span class="top-title">{{ g.title }}</span>
                <span class="readout">{{ g.rating }}</span>
              </button>
            </li>
          </ol>
        </div>
      </aside>
    </div>

    <ItemModal :item="selected" @close="selected = null" />
  </main>
</template>

<style scoped>
.room-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 32px;
  align-items: start;
}
.kallax-area {
  display: grid;
  gap: 40px;
  justify-items: center;
}
.kallax {
  --frame: 14px;
  width: min(100%, 720px);
  aspect-ratio: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: var(--frame);
  padding: var(--frame);
  border-radius: 6px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.07), transparent 40%),
    linear-gradient(180deg, #2a1d4d, #1b1235);
  box-shadow:
    0 50px 80px -40px rgba(0, 0, 0, 0.95),
    0 0 0 1px rgba(201, 182, 255, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
.cube {
  position: relative;
  container-type: inline-size;
  border-radius: 3px;
  background:
    radial-gradient(90% 60% at 50% 0%, rgba(161, 132, 255, 0.2), transparent 70%),
    linear-gradient(180deg, #0b0718, #120b26);
  box-shadow: inset 0 10px 24px rgba(0, 0, 0, 0.75), inset 0 -1px 0 rgba(255, 255, 255, 0.05);
  overflow: hidden;
}
.led {
  position: absolute;
  top: 0;
  left: 12%;
  right: 12%;
  height: 2px;
  border-radius: 2px;
  background: var(--lavender);
  box-shadow: 0 0 12px 2px rgba(161, 132, 255, 0.7);
  opacity: 0.8;
  z-index: 2;
}

/* Caja de frente */
.face-box {
  position: absolute;
  inset: 12% 10% 6%;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 3px;
  font-size: 8cqw;
  transform: perspective(500px) rotateX(4deg);
  transform-origin: bottom;
  transition: transform 0.45s var(--ease), filter 0.3s, opacity 0.3s;
  box-shadow: 0 14px 18px -8px rgba(0, 0, 0, 0.9), 4px 0 0 rgba(0, 0, 0, 0.35);
}
.face-box :deep(.cover) {
  height: 100%;
  border-radius: 3px;
}
.face-box:hover,
.face-box:focus-visible {
  transform: perspective(500px) rotateX(0deg) translateY(-4%) scale(1.04);
  filter: drop-shadow(0 0 16px rgba(161, 132, 255, 0.5));
}
.face-label {
  position: absolute;
  inset: auto 0 0;
  padding: 6% 8%;
  background: linear-gradient(0deg, rgba(4, 2, 10, 0.85), transparent);
  font-size: 7cqw;
  font-weight: 600;
  color: #fff;
  text-align: left;
  opacity: 0;
  transition: opacity 0.3s;
}
.face-box:hover .face-label,
.face-box:focus-visible .face-label {
  opacity: 1;
}

/* Pila de cajas tumbadas */
.stack {
  position: absolute;
  inset: 8% 6% 2%;
  display: flex;
  flex-direction: column-reverse;
  justify-content: flex-start;
}
.slab {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  padding: 0 5%;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  background: linear-gradient(180deg, var(--c-light) 0%, var(--c) 14%, var(--c) 70%, var(--c-dark) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 1px 0 rgba(0, 0, 0, 0.6);
  transition: transform 0.4s var(--ease), filter 0.3s, opacity 0.3s;
  text-align: left;
}
.slab::after {
  content: '';
  position: absolute;
  right: 4%;
  top: 34%;
  bottom: 34%;
  width: 3%;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.22);
}
.slab-title {
  font-family: var(--font-body);
  font-size: clamp(7px, 6.6cqw, 13px);
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90%;
  line-height: 1;
}
.slab:hover,
.slab:focus-visible {
  transform: translateX(6%);
  filter: brightness(1.2) drop-shadow(0 0 10px rgba(161, 132, 255, 0.6));
  z-index: 1;
}
.dim {
  opacity: 0.18;
  filter: grayscale(0.7);
}

/* Decoración */
.deco {
  position: absolute;
  inset: 16% 14% 4%;
  display: grid;
  place-items: end center;
}
.deco svg {
  width: 78%;
  height: auto;
  overflow: visible;
}
.leaf {
  fill: #7fd6b8;
  opacity: 0.85;
  filter: drop-shadow(0 0 6px rgba(127, 214, 184, 0.6));
  transform-origin: 50% 70%;
  animation: sway 8s ease-in-out infinite alternate;
}
.leaf-b {
  fill: #a7e8cf;
  animation-duration: 11s;
}
@keyframes sway {
  to { transform: rotate(3deg); }
}
.pot {
  fill: #3a2a66;
  stroke: rgba(201, 182, 255, 0.4);
}
.die {
  fill: rgba(161, 132, 255, 0.25);
  stroke: var(--lavender);
  stroke-width: 1.5;
  filter: drop-shadow(0 0 8px rgba(161, 132, 255, 0.6));
}
.die-line {
  fill: none;
  stroke: rgba(212, 196, 255, 0.5);
  stroke-width: 1;
}
.die-num {
  fill: var(--lavender);
  font-family: var(--font-display);
  font-size: 11px;
  text-anchor: middle;
}
.orb {
  fill: var(--amber);
  filter: drop-shadow(0 0 14px rgba(255, 207, 138, 0.9));
  animation: breathe 6s ease-in-out infinite;
}
@keyframes breathe {
  50% { opacity: 0.7; }
}
.meeple {
  fill: var(--orchid);
  filter: drop-shadow(0 0 8px rgba(227, 155, 224, 0.5));
}
.feet {
  display: flex;
  justify-content: space-between;
  width: min(100%, 720px);
  margin-top: -40px;
  padding: 0 4%;
}
.feet span {
  width: 18px;
  height: 10px;
  background: #1b1235;
  border-radius: 0 0 4px 4px;
}

/* Lateral */
.side {
  display: grid;
  gap: 16px;
  position: sticky;
  top: calc(var(--header-h) + 20px);
}
.search {
  position: relative;
  display: block;
}
.search-icon {
  position: absolute;
  left: 13px;
  top: 50%;
  translate: 0 -50%;
  color: var(--muted);
}
.search .input {
  padding-left: 40px;
  border-radius: 999px;
}
.match {
  margin: 12px 0 0;
}
.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.stats > div {
  display: grid;
  gap: 2px;
}
.stats strong {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 600;
  color: var(--lavender);
}
.stats .wide {
  grid-column: 1 / -1;
  font-size: 14px;
  color: var(--text-soft);
}
.top {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 4px;
}
.top-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: none;
  border-radius: 8px;
  background: none;
  cursor: pointer;
  text-align: left;
}
.top-item:hover {
  background: rgba(161, 132, 255, 0.1);
}
.swatch {
  width: 10px;
  height: 22px;
  border-radius: 2px;
  flex: none;
}
.top-title {
  flex: 1;
  font-size: 14px;
}
@media (max-width: 960px) {
  .room-layout {
    grid-template-columns: 1fr;
  }
  .side {
    position: static;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }
}
@media (max-width: 520px) {
  .kallax {
    --frame: 7px;
  }
}
</style>
