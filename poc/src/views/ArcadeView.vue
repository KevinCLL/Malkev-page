<script setup>
// La sala recreativa: la colección de videojuegos, ordenada por máquinas (plataformas) como en
// LaunchBox, con búsqueda, orden y unos cuantos datos de la sala.
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api.js'
import { coverRatio, formatDate, formatPlayTime } from '../util.js'
import { useItemLink } from '../useItemLink.js'
import GenCover from '../components/GenCover.vue'
import ItemModal from '../components/ItemModal.vue'
import BarList from '../components/BarList.vue'
import AppIcon from '../components/AppIcon.vue'

const items = ref([])
const selected = ref(null)
const loaded = ref(false)
useItemLink(items, selected)

const platform = ref('')
const q = ref('')
const only = ref('all')
const sort = ref('title')
const PAGE = 96
const limit = ref(PAGE)

onMounted(async () => {
  items.value = await api.items('videogame')
  loaded.value = true
})

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const platformOf = (it) => it.meta?.platform || 'Sin plataforma'

// Las máquinas: una por plataforma, de más a menos juegos.
const platforms = computed(() => {
  const map = new Map()
  for (const it of items.value) {
    const name = platformOf(it)
    const p = map.get(name) || { name, count: 0, done: 0 }
    p.count++
    if (it.status === 'done') p.done++
    map.set(name, p)
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'))
})

const ONLY = [
  { id: 'all', label: 'Todos' },
  { id: 'done', label: 'Terminados', test: (it) => it.status === 'done' },
  { id: 'featured', label: 'Favoritos', test: (it) => it.featured },
  { id: 'played', label: 'Con partidas', test: (it) => it.meta?.play_count > 0 },
]

const SORTS = {
  title: (a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }),
  year: (a, b) => (a.year || 9999) - (b.year || 9999) || SORTS.title(a, b),
  rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || SORTS.title(a, b),
  played: (a, b) => String(b.meta?.last_played || '').localeCompare(String(a.meta?.last_played || '')) || (b.meta?.play_count || 0) - (a.meta?.play_count || 0) || SORTS.title(a, b),
}

const visible = computed(() => {
  const text = norm(q.value.trim())
  const test = ONLY.find((o) => o.id === only.value)?.test
  const list = items.value.filter((it) =>
    (!platform.value || platformOf(it) === platform.value)
    && (!test || test(it))
    && (!text || norm(`${it.title} ${it.creator} ${it.meta?.genre || ''} ${platformOf(it)}`).includes(text)))
  return [...list].sort(SORTS[sort.value] || SORTS.title)
})
const shown = computed(() => visible.value.slice(0, limit.value))
watch([platform, q, only, sort], () => { limit.value = PAGE })

// Datos de la sala: números sueltos, no gráficas.
const stats = computed(() => {
  const all = items.value
  const done = all.filter((it) => it.status === 'done').length
  const seconds = all.reduce((s, it) => s + (it.meta?.play_time || 0), 0)
  const plays = all.reduce((s, it) => s + (it.meta?.play_count || 0), 0)
  const mostPlayed = [...all].filter((it) => it.meta?.play_count > 0).sort((a, b) => b.meta.play_count - a.meta.play_count).slice(0, 3)
  const last = [...all].filter((it) => it.meta?.last_played).sort(SORTS.played)[0] || null
  return { total: all.length, done, pct: all.length ? Math.round((done / all.length) * 100) : 0, seconds, plays, mostPlayed, last }
})

function pick(p) {
  platform.value = platform.value === p ? '' : p
}
</script>

<template>
  <main class="page">
    <header class="page-head">
      <p class="eyebrow">Cubierta 4 · Sala recreativa</p>
      <h1 class="page-title">Sala recreativa</h1>
      <p class="page-lead">
        Las máquinas de siempre, sin polvo ni monedas.
        <template v-if="loaded && items.length">{{ items.length }} juegos repartidos en {{ platforms.length }} {{ platforms.length === 1 ? 'máquina' : 'máquinas' }}, ordenados como en LaunchBox.</template>
      </p>
    </header>

    <section v-if="loaded && items.length" class="machines" aria-label="Máquinas">
      <button class="machine" :class="{ active: !platform }" @click="platform = ''">
        <span class="machine-name">Todas las máquinas</span>
        <span class="readout">{{ items.length }} juegos</span>
      </button>
      <button v-for="p in platforms" :key="p.name" class="machine" :class="{ active: platform === p.name }" @click="pick(p.name)">
        <span class="machine-name">{{ p.name }}</span>
        <span class="readout">{{ p.count }} {{ p.count === 1 ? 'juego' : 'juegos' }}<template v-if="p.done"> · {{ p.done }} ✓</template></span>
      </button>
    </section>

    <div v-if="loaded && items.length" class="toolbar">
      <label class="search-field">
        <AppIcon name="search" :size="15" />
        <input v-model="q" class="input" type="search" placeholder="Buscar un juego, un estudio, un género…" />
      </label>
      <div class="chips">
        <button v-for="o in ONLY" :key="o.id" class="chip" :class="{ active: only === o.id }" @click="only = o.id">{{ o.label }}</button>
      </div>
      <label class="sort">
        <span class="readout">Orden</span>
        <select v-model="sort" class="select">
          <option value="title">Título</option>
          <option value="year">Año</option>
          <option value="rating">Nota</option>
          <option value="played">Última partida</option>
        </select>
      </label>
    </div>

    <section v-if="loaded && items.length" class="cabinet panel">
      <p class="readout cabinet-count">{{ visible.length }} {{ visible.length === 1 ? 'juego' : 'juegos' }}<template v-if="platform"> · {{ platform }}</template></p>
      <div class="games">
        <button v-for="it in shown" :key="it.id" class="game" :class="{ done: it.status === 'done' }" @click="selected = it">
          <span class="box"><GenCover :item="it" :ratio="coverRatio(it)" /></span>
          <span class="game-title">{{ it.title }}</span>
          <span class="game-meta">
            <span class="readout">{{ it.year || '' }}</span>
            <span v-if="!platform" class="platform">{{ platformOf(it) }}</span>
            <AppIcon v-if="it.status === 'done'" name="check" :size="12" class="tick" />
            <AppIcon v-if="it.featured" name="star" :size="12" class="fav" />
          </span>
        </button>
      </div>
      <p v-if="!visible.length" class="empty">Ninguna máquina tiene eso cargado.</p>
      <div v-if="visible.length > shown.length" class="more">
        <button class="btn" @click="limit += PAGE * 2">Ver más <span class="readout">{{ visible.length - shown.length }} restantes</span></button>
      </div>
    </section>

    <section v-if="loaded && items.length" class="data panel panel-pad" aria-label="Datos de la sala">
      <p class="eyebrow">Datos de la sala</p>
      <div class="tiles">
        <div class="tile"><span class="tile-label">Juegos</span><strong class="tile-value">{{ stats.total.toLocaleString('es-ES') }}</strong></div>
        <div class="tile"><span class="tile-label">Máquinas</span><strong class="tile-value">{{ platforms.length }}</strong></div>
        <div class="tile"><span class="tile-label">Terminados</span><strong class="tile-value">{{ stats.done }}</strong><span class="tile-note">{{ stats.pct }} % de la sala</span></div>
        <div class="tile"><span class="tile-label">Partidas</span><strong class="tile-value">{{ stats.plays.toLocaleString('es-ES') }}</strong><span v-if="stats.seconds" class="tile-note">{{ formatPlayTime(stats.seconds) }} en total</span></div>
      </div>
      <div class="lists">
        <div v-if="platforms.length > 1">
          <p class="readout">Juegos por máquina</p>
          <BarList :rows="platforms.slice(0, 10).map((p) => ({ label: p.name, value: p.count }))" />
        </div>
        <div v-if="stats.mostPlayed.length">
          <p class="readout">Los más jugados</p>
          <ol class="top">
            <li v-for="it in stats.mostPlayed" :key="it.id"><button class="link-btn" @click="selected = it">{{ it.title }}</button> <span class="muted">{{ it.meta.play_count }} partidas</span></li>
          </ol>
        </div>
        <div v-if="stats.last">
          <p class="readout">Última partida</p>
          <p class="last"><button class="link-btn" @click="selected = stats.last">{{ stats.last.title }}</button> <span class="muted">{{ formatDate(stats.last.meta.last_played) }}</span></p>
        </div>
      </div>
    </section>

    <section v-if="loaded && !items.length" class="empty panel">
      La sala está a oscuras: todavía no hay videojuegos. Se cargan desde LaunchBox con <code>npm run import:launchbox -- "carpeta de LaunchBox"</code>.
    </section>

    <ItemModal :item="selected" @close="selected = null" />
  </main>
</template>

<style scoped>
.machines {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 2px 12px;
  margin-bottom: 14px;
  scrollbar-width: thin;
}
.machine {
  flex: none;
  display: grid;
  gap: 2px;
  justify-items: start;
  padding: 10px 16px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: rgba(159, 227, 180, 0.04);
  color: var(--text-soft);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s, background 0.2s, transform 0.3s var(--ease);
}
.machine:hover {
  border-color: var(--line-strong);
  color: #fff;
  transform: translateY(-2px);
}
.machine.active {
  background: rgba(159, 227, 180, 0.14);
  border-color: rgba(159, 227, 180, 0.6);
  color: #fff;
}
.machine-name {
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.04em;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}
.search-field {
  position: relative;
  flex: 1 1 260px;
  display: flex;
  align-items: center;
}
.search-field .icon {
  position: absolute;
  left: 14px;
  color: var(--muted);
}
.search-field .input {
  padding-left: 38px;
  border-radius: 999px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sort {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sort .select {
  width: auto;
  padding: 7px 12px;
}
.cabinet {
  padding: 18px 22px 22px;
  margin-bottom: 24px;
  background:
    radial-gradient(70% 40% at 50% 0%, rgba(159, 227, 180, 0.07), transparent 70%),
    rgba(12, 7, 26, 0.75);
}
.cabinet-count {
  margin: 0 0 14px;
}
.games {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 22px 16px;
  align-items: end;
}
.game {
  display: grid;
  gap: 6px;
  align-content: end;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  color: var(--text);
}
.box {
  display: block;
  border-radius: 6px;
  overflow: hidden;
  font-size: 11px;
  box-shadow: 0 18px 28px -16px rgba(0, 0, 0, 0.9), 0 0 0 1px var(--line);
  transition: transform 0.4s var(--ease), box-shadow 0.3s;
}
.game:hover .box,
.game:focus-visible .box {
  transform: translateY(-5px);
  box-shadow: 0 26px 40px -18px rgba(0, 0, 0, 0.9), 0 0 0 1px var(--line-strong), 0 0 30px rgba(159, 227, 180, 0.22);
}
.game-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.25;
  margin-top: 2px;
}
.game-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 16px;
}
.platform {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.tick {
  color: var(--ok);
}
.fav {
  color: var(--amber);
}
.more {
  display: flex;
  justify-content: center;
  margin-top: 22px;
}
.more .readout {
  margin-left: 6px;
}
.data {
  display: grid;
  gap: 18px;
}
.data .eyebrow {
  margin: 0;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}
.tile {
  display: grid;
  gap: 2px;
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  background: rgba(6, 3, 16, 0.4);
}
.tile-label {
  font-size: 13px;
  color: var(--muted);
}
.tile-value {
  font-size: 30px;
  font-weight: 600;
  line-height: 1.1;
}
.tile-note {
  font-size: 12px;
  color: var(--muted);
}
.lists {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}
.lists .readout {
  margin: 0 0 6px;
}
.top {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 4px;
}
.top li::marker {
  color: var(--violet);
  font-family: var(--font-mono);
}
.last {
  margin: 0;
}
.link-btn {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: var(--lavender);
}
.link-btn:hover {
  color: #fff;
}
code {
  font-family: var(--font-mono);
  font-size: 0.9em;
  color: var(--text-soft);
}
@media (max-width: 640px) {
  .games {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 16px 12px;
  }
  .cabinet {
    padding: 14px;
  }
}
</style>
