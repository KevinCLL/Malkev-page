<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '../api.js'
import { eachPlaced, furnitureWidth, groupSize, span } from '../kallax.js'
import { fallbackColor } from '../util.js'
import KallaxUnit from '../components/kallax/KallaxUnit.vue'
import KallaxCell from '../components/kallax/KallaxCell.vue'
import KallaxGroup from '../components/kallax/KallaxGroup.vue'
import ItemModal from '../components/ItemModal.vue'
import AppIcon from '../components/AppIcon.vue'

const furniture = ref([])
const list = ref([])
const selected = ref(null)
const zoom = ref(null)
const query = ref('')
const filter = ref('all')

onMounted(async () => {
  const [f, items] = await Promise.all([api.furniture(), api.items('boardgame,rpg')])
  furniture.value = f
  list.value = items
})

const items = computed(() => new Map(list.value.map((i) => [i.id, i])))
const asPlaced = (f, cells = f.layout.cubes, top = f.layout.top) => ({ name: f.name, top, cubes: cells })

// Lo que se ha añadido desde la consola y aún no tiene sitio en ninguna Kallax.
const unplaced = computed(() => {
  const placed = new Set()
  for (const f of furniture.value) eachPlaced(asPlaced(f), (e) => placed.add(e.id))
  return list.value.filter((i) => !placed.has(i.id))
})

/* ---------- Búsqueda y filtros ---------- */

const FILTERS = [
  { id: 'all', label: 'Todo' },
  { id: 'boardgame', label: 'Juegos', test: (i) => i.kind === 'boardgame' },
  { id: 'rpg', label: 'Libros de rol', test: (i) => i.kind === 'rpg' },
  { id: 'postit', label: 'Con pósit', test: (i) => !!i.meta?.postit },
  { id: 'dot', label: 'Con pegatina', test: (i) => !!i.meta?.dot },
  { id: 'doubt', label: 'Dudas', test: (i) => !!i.meta?.doubt },
]
const counts = computed(() => Object.fromEntries(FILTERS.map((f) => [f.id, f.test ? list.value.filter(f.test).length : list.value.length])))

const normalized = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const active = computed(() => !!query.value.trim() || filter.value !== 'all')
function matches(item) {
  const f = FILTERS.find((x) => x.id === filter.value)
  if (f.test && !f.test(item)) return false
  const q = normalized(query.value.trim())
  return !q || normalized(`${item.title} ${item.creator} ${item.meta?.postit || ''}`).includes(q)
}
const mark = (item) => (active.value ? (matches(item) ? 'lit' : 'dim') : '')
const results = computed(() => (active.value ? list.value.filter(matches) : []))

/* ---------- Tamaño de las Kallax según el ancho disponible ---------- */

const area = ref(null)
const areaWidth = ref(1100)
const viewport = ref({ w: window.innerWidth, h: window.innerHeight })
const SIDE_GAP = 40
const sideBySide = computed(() => areaWidth.value >= 900 && furniture.value.length > 1)
const unit = computed(() => {
  const widest = Math.max(1, ...furniture.value.map(furnitureWidth))
  const per = sideBySide.value ? (areaWidth.value - SIDE_GAP) / 2 : Math.min(areaWidth.value, 640)
  return Math.floor((per / widest) * 100) / 100
})

let observer
const onResize = () => { viewport.value = { w: window.innerWidth, h: window.innerHeight } }
onMounted(() => {
  observer = new ResizeObserver(([entry]) => { areaWidth.value = entry.contentRect.width })
  observer.observe(area.value)
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKey)
})

/* ---------- Vista de cerca de un cubo ---------- */

const topHeight = (groups) => Math.max(0.2, ...groups.map((g) => groupSize(g).h)) + 0.04

function openZoom(f, cell) {
  if (!cell.top && !cell.tiers.flat().length) return
  zoom.value = { furniture: f, cell }
}

function onKey(e) {
  // Si la ficha está abierta, el Escape la cierra a ella y no a la vista de cerca.
  if (e.key === 'Escape' && zoom.value && !selected.value) zoom.value = null
}

const zoomTitle = computed(() => {
  const c = zoom.value?.cell
  if (!c) return ''
  if (c.top) return 'Encima'
  const list = (from, n) => (n === 1 ? `${from}` : n === 2 ? `${from} y ${from + 1}` : `${from} a ${from + n - 1}`)
  return `${c.rows > 1 ? 'Filas' : 'Fila'} ${list(c.row, c.rows)} · ${c.cols > 1 ? 'columnas' : 'columna'} ${list(c.col, c.cols)}`
})

const zoomUnit = computed(() => {
  if (!zoom.value) return 0
  const { furniture: f, cell: c } = zoom.value
  const w = c.top ? furnitureWidth(f) : span(c.cols)
  const h = c.top ? topHeight(c.groups) : span(c.rows)
  const maxW = Math.min(viewport.value.w - 72, 980)
  const maxH = viewport.value.h * (viewport.value.w < 700 ? 0.4 : 0.52)
  return Math.min(maxW / w, maxH / h, 420)
})

const zoomItems = computed(() => {
  if (!zoom.value) return []
  const { furniture: f, cell: c } = zoom.value
  const out = []
  eachPlaced(c.top ? asPlaced(f, [], c.groups) : asPlaced(f, [c], []), (e, where) => {
    const item = items.value.get(e.id)
    if (item) out.push({ item, where: where.split(' · ').slice(2).join(' · ') })
  })
  return out
})
</script>

<template>
  <main class="page">
    <header class="page-head">
      <p class="eyebrow">Cubierta 2 · Sala de recreo</p>
      <h1 class="page-title">Sala de juegos</h1>
      <p class="page-lead">Las dos Kallax de casa, tal cual están: pilas de cajas tumbadas, filas de pie y los libros de rol en la balda de abajo. Toca un cubo para acercarte y una caja para sacar su ficha.</p>
    </header>

    <section class="toolbar panel panel-pad" aria-label="Buscar en la sala de juegos">
      <label class="search">
        <AppIcon name="search" class="search-icon" />
        <span class="sr-only">Buscar un juego o un libro de rol</span>
        <input v-model="query" class="input" type="search" placeholder="Buscar un juego o un libro de rol…" />
      </label>
      <div class="filters" role="group" aria-label="Resaltar en las Kallax">
        <button v-for="f in FILTERS" :key="f.id" class="chip" :class="{ active: filter === f.id }" :aria-pressed="filter === f.id" @click="filter = f.id">
          {{ f.label }} <span class="n">{{ counts[f.id] }}</span>
        </button>
      </div>
      <div v-if="active" class="results">
        <p class="readout">{{ results.length }} {{ results.length === 1 ? 'encendida' : 'encendidas' }} en las Kallax</p>
        <ul v-if="results.length" class="result-list">
          <li v-for="it in results" :key="it.id">
            <button class="result" @click="selected = it">
              <span class="swatch" :style="{ background: it.color || fallbackColor(it.title) }"></span>
              <span class="result-title">{{ it.title }}</span>
              <span class="result-where muted">{{ it.meta?.location || 'Sin colocar' }}</span>
            </button>
          </li>
        </ul>
      </div>
    </section>

    <div ref="area" class="kallax-area" :class="{ 'side-by-side': sideBySide }">
      <KallaxUnit
        v-for="f in furniture"
        :key="f.id"
        :furniture="f"
        :items="items"
        :mark="mark"
        :unit="unit"
        @zoom="openZoom"
        @pick="(it, fu, cell) => openZoom(fu, cell)"
      />
    </div>

    <p class="legend muted">
      <span><span class="legend-postit" aria-hidden="true"></span> pósit con lo que le falta a la caja</span>
      <span><span class="legend-dot" aria-hidden="true"></span> pegatina de color</span>
    </p>

    <section v-if="unplaced.length" class="table panel panel-pad">
      <p class="eyebrow">En la mesa, esperando sitio</p>
      <div class="table-items">
        <button v-for="it in unplaced" :key="it.id" class="chip" @click="selected = it">{{ it.title }}</button>
      </div>
    </section>

    <Teleport to="body">
      <Transition name="zoom">
        <div v-if="zoom" class="zoom-overlay" @click.self="zoom = null">
          <article class="zoom panel" role="dialog" aria-modal="true" :aria-label="`${zoom.furniture.name}: ${zoomTitle}`">
            <header class="zoom-head">
              <div>
                <p class="eyebrow">{{ zoom.furniture.name }}</p>
                <h2 class="zoom-title">{{ zoomTitle }}</h2>
              </div>
              <button class="btn btn-ghost btn-icon" @click="zoom = null"><AppIcon name="close" /><span class="sr-only">Cerrar</span></button>
            </header>
            <div class="zoom-view" :style="{ '--u': `${zoomUnit}px` }">
              <div v-if="zoom.cell.top" class="zoom-top" :style="{ width: `calc(var(--u) * ${furnitureWidth(zoom.furniture)})`, height: `calc(var(--u) * ${topHeight(zoom.cell.groups)})` }">
                <KallaxGroup v-for="(g, i) in zoom.cell.groups" :key="i" :group="g" :items="items" :mark="mark" interactive @pick="selected = $event" />
              </div>
              <div v-else class="zoom-slot">
                <KallaxCell :cell="zoom.cell" :items="items" :mark="mark" interactive @pick="selected = $event" />
              </div>
            </div>
            <ol class="zoom-list">
              <li v-for="{ item, where } in zoomItems" :key="item.id">
                <button class="result" :class="mark(item)" @click="selected = item">
                  <span class="swatch" :style="{ background: item.color || fallbackColor(item.title) }"></span>
                  <span class="result-title">{{ item.title }}</span>
                  <span class="result-where muted">{{ where }}</span>
                  <span class="badges">
                    <span v-if="item.meta?.postit" class="badge postit" :title="`Pósit: ${item.meta.postit}`">{{ item.meta.postit }}</span>
                    <span v-if="item.meta?.dot" class="badge dot" title="Pegatina de color">{{ item.meta.dot }}</span>
                    <span v-if="item.meta?.doubt" class="badge doubt" :title="item.meta.doubt">duda</span>
                  </span>
                </button>
              </li>
            </ol>
          </article>
        </div>
      </Transition>
    </Teleport>

    <ItemModal :item="selected" @close="selected = null" />
  </main>
</template>

<style scoped>
.toolbar {
  display: grid;
  gap: 14px;
  margin-bottom: 36px;
}
.search {
  position: relative;
  display: block;
  max-width: 520px;
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
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.results .readout {
  margin: 0 0 8px;
}
.result-list,
.zoom-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
}
.result-list {
  max-height: 260px;
  overflow: auto;
}
.result {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  padding: 7px 8px;
  border: none;
  border-radius: 8px;
  background: none;
  cursor: pointer;
  text-align: left;
}
.result:hover,
.result:focus-visible {
  background: rgba(161, 132, 255, 0.1);
}
.result.dim {
  opacity: 0.45;
}
.swatch {
  width: 10px;
  height: 20px;
  border-radius: 2px;
  flex: none;
}
.result-title {
  font-size: 14px;
}
.result-where {
  font-size: 13px;
  margin-left: auto;
}

.kallax-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 56px;
}
.kallax-area.side-by-side {
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-end;
  gap: 40px;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 22px;
  margin: 28px 0 0;
  font-size: 14px;
}
.legend-postit,
.legend-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  background: #ffe678;
  rotate: 4deg;
}
.legend-dot {
  border-radius: 50%;
  background: #ffb347;
  rotate: none;
}
.table {
  margin-top: 32px;
}
.table-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

/* Vista de cerca */
.zoom-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  overflow: auto;
  padding: 24px 16px;
  background: rgba(4, 2, 10, 0.75);
  backdrop-filter: blur(6px);
}
.zoom {
  width: min(1040px, 100%);
  margin: 0 auto;
  padding: 24px;
  background: rgba(18, 11, 38, 0.94);
}
.zoom-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.zoom-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 22px;
  letter-spacing: 0.03em;
}
.zoom-view {
  display: flex;
  justify-content: center;
  padding: 8px 0 24px;
  overflow-x: auto;
}
.zoom-slot {
  display: flex;
  padding: calc(var(--u) * 0.06);
  border-radius: calc(var(--u) * 0.03);
  background: #1b1235;
  box-shadow: 0 0 0 1px rgba(201, 182, 255, 0.18);
}
.zoom-slot > :deep(.cell) {
  border-radius: calc(var(--u) * 0.015);
  background:
    radial-gradient(90% 60% at 50% 0%, rgba(161, 132, 255, 0.18), transparent 70%),
    linear-gradient(180deg, #0b0718, #120b26);
  box-shadow: inset 0 calc(var(--u) * 0.08) calc(var(--u) * 0.2) rgba(0, 0, 0, 0.75);
}
.zoom-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  border-bottom: calc(var(--u) * 0.06) solid #2a1d4d;
}
.zoom-list {
  border-top: 1px solid var(--line);
  padding-top: 12px;
}
.badges {
  display: flex;
  gap: 6px;
}
.badge {
  padding: 1px 8px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 12px;
}
.badge.postit {
  background: #ffe678;
  color: #2a2008;
}
.badge.dot {
  border-radius: 999px;
  background: #ffb347;
  color: #2a1a08;
}
.badge.doubt {
  border: 1px solid rgba(255, 207, 138, 0.5);
  color: var(--amber);
}
.zoom-enter-active,
.zoom-leave-active {
  transition: opacity 0.3s var(--ease);
}
.zoom-enter-from,
.zoom-leave-to {
  opacity: 0;
}
@media (max-width: 640px) {
  .zoom {
    padding: 18px 14px;
  }
  .result-where {
    margin-left: 20px;
    flex-basis: 100%;
  }
}
</style>
