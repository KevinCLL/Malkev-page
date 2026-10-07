<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api.js'
import { fallbackColor, isLight, shade } from '../util.js'
import GenCover from '../components/GenCover.vue'
import ItemModal from '../components/ItemModal.vue'
import ShelfRows from '../components/ShelfRows.vue'
import AppIcon from '../components/AppIcon.vue'

const items = ref([])
const selected = ref(null)
const filter = ref('all')
const mode = ref('shelf')

try { mode.value = localStorage.getItem('malkevnia-films-mode') || 'shelf' } catch {}
function setMode(m) {
  mode.value = m
  try { localStorage.setItem('malkevnia-films-mode', m) } catch {}
}

onMounted(async () => {
  items.value = await api.items('film,series')
})

const visible = computed(() => {
  const list = filter.value === 'all' ? items.value : items.value.filter((i) => i.kind === filter.value)
  // Las series al final de la estantería, como en casa.
  return [...list].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'series' ? 1 : -1))
})

const FORMAT = {
  bluray: { label: 'BLU-RAY', band: '#2f6fd6', width: 26, height: 178 },
  '4k': { label: '4K UHD', band: '#0b0b10', width: 26, height: 178 },
  dvd: { label: 'DVD', band: null, width: 30, height: 200 },
}
const fmt = (it) => FORMAT[it.meta?.format] || FORMAT.dvd

function caseWidth(it) {
  if (it.kind === 'series') return 18 + (it.meta?.seasons || 1) * 15
  return fmt(it).width
}

function caseStyle(it) {
  const c = it.color || fallbackColor(it.title)
  return {
    width: `${caseWidth(it)}px`,
    height: `${it.kind === 'series' ? 196 : fmt(it).height}px`,
    '--c': c,
    '--c-dark': shade(c, -0.5),
    '--c-light': shade(c, 0.2),
    '--band': fmt(it).band || 'transparent',
    color: isLight(c) ? '#1a1030' : '#f6f2ff',
  }
}

const counts = computed(() => ({
  film: items.value.filter((i) => i.kind === 'film').length,
  series: items.value.filter((i) => i.kind === 'series').length,
}))
</script>

<template>
  <main class="page">
    <header class="page-head">
      <p class="eyebrow">Cubierta 2 · Sala de proyección</p>
      <h1 class="page-title">Sala de proyección</h1>
      <p class="page-lead">Las luces bajas, el proyector zumbando y una estantería entera para elegir. Pasa por encima de un lomo para asomarte a la carátula.</p>
    </header>

    <div class="toolbar">
      <div class="chips">
        <button class="chip" :class="{ active: filter === 'all' }" @click="filter = 'all'">Todo <span class="n">{{ items.length }}</span></button>
        <button class="chip" :class="{ active: filter === 'film' }" @click="filter = 'film'">Películas <span class="n">{{ counts.film }}</span></button>
        <button class="chip" :class="{ active: filter === 'series' }" @click="filter = 'series'">Series <span class="n">{{ counts.series }}</span></button>
      </div>
      <div class="chips" role="group" aria-label="Vista">
        <button class="chip" :class="{ active: mode === 'shelf' }" @click="setMode('shelf')"><AppIcon name="rows" :size="14" /> Estantería</button>
        <button class="chip" :class="{ active: mode === 'covers' }" @click="setMode('covers')"><AppIcon name="grid" :size="14" /> Carátulas</button>
      </div>
    </div>

    <section v-if="mode === 'shelf'" class="cabinet panel">
      <ShelfRows :items="visible" :width-of="caseWidth" :gap="3" :padding="36">
        <template #row="{ row }">
          <div class="shelf">
            <div class="cases">
              <button
                v-for="it in row"
                :key="it.id"
                class="case"
                :class="[it.kind, it.meta?.format]"
                :style="caseStyle(it)"
                @click="selected = it"
              >
                <span class="band">{{ fmt(it).band ? fmt(it).label : '' }}</span>
                <span class="case-title">{{ it.title }}</span>
                <span class="case-foot">{{ it.kind === 'series' ? (it.meta?.seasons > 1 ? `T1–${it.meta.seasons}` : 'T1') : it.year }}</span>
                <span class="peek" aria-hidden="true"><GenCover :item="it" /></span>
              </button>
            </div>
            <div class="plank" aria-hidden="true"></div>
          </div>
        </template>
      </ShelfRows>
    </section>

    <section v-else class="covers">
      <button v-for="it in visible" :key="it.id" class="cover-card" @click="selected = it">
        <GenCover :item="it" />
        <span class="cover-title">{{ it.title }}</span>
        <span class="readout">{{ it.year }}<template v-if="it.kind === 'series'"> · Serie</template></span>
      </button>
    </section>

    <ItemModal :item="selected" @close="selected = null" />
  </main>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cabinet {
  padding: 30px 0 24px;
  background:
    radial-gradient(80% 50% at 50% 0%, rgba(139, 227, 224, 0.06), transparent 70%),
    rgba(12, 7, 26, 0.75);
}
.shelf {
  padding: 34px 36px 0;
}
.cases {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  min-height: 210px;
}
.case {
  position: relative;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 0 8px;
  border: none;
  border-radius: 2px 2px 1px 1px;
  cursor: pointer;
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.35) 0%, transparent 18%, rgba(255, 255, 255, 0.14) 45%, transparent 60%, rgba(0, 0, 0, 0.4) 100%),
    linear-gradient(180deg, var(--c-light), var(--c) 30%, var(--c-dark));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  transition: transform 0.45s var(--ease), filter 0.3s;
}
.case.series {
  border-radius: 3px;
  background:
    repeating-linear-gradient(90deg, transparent 0 14px, rgba(0, 0, 0, 0.25) 14px 15px),
    linear-gradient(90deg, rgba(0, 0, 0, 0.3), transparent 20%, rgba(255, 255, 255, 0.1) 50%, rgba(0, 0, 0, 0.35)),
    linear-gradient(180deg, var(--c-light), var(--c) 30%, var(--c-dark));
}
.band {
  width: 100%;
  height: 18px;
  flex: none;
  display: grid;
  place-items: center;
  background: var(--band);
  color: #fff;
  font-family: var(--font-display);
  font-size: 5.5px;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}
.case-title {
  flex: 1;
  writing-mode: vertical-rl;
  rotate: 180deg;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.03em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-height: 140px;
}
.case-foot {
  font-family: var(--font-mono);
  font-size: 9px;
  opacity: 0.75;
  margin-top: 6px;
}
.peek {
  position: absolute;
  bottom: calc(100% + 14px);
  left: 50%;
  width: 120px;
  translate: -50% 8px;
  border-radius: 6px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  font-size: 13px;
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.9), 0 0 0 1px var(--line-strong);
  transition: opacity 0.3s, translate 0.4s var(--ease);
  z-index: 5;
}
.case:hover,
.case:focus-visible {
  transform: translateY(-14px);
  filter: brightness(1.15) drop-shadow(0 0 10px rgba(139, 227, 224, 0.35));
  z-index: 4;
}
.case:hover .peek,
.case:focus-visible .peek {
  opacity: 1;
  translate: -50% 0;
}
.plank {
  height: 12px;
  margin: 0 -36px;
  background: linear-gradient(180deg, rgba(212, 196, 255, 0.35), rgba(70, 50, 130, 0.6) 40%, rgba(20, 13, 40, 0.9));
  box-shadow: 0 10px 30px -6px rgba(139, 227, 224, 0.35), 0 2px 0 rgba(139, 227, 224, 0.5);
}
.covers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 22px 18px;
}
.cover-card {
  display: grid;
  gap: 6px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
}
.cover-card :deep(.cover) {
  border-radius: 8px;
  box-shadow: 0 20px 30px -18px rgba(0, 0, 0, 0.9), 0 0 0 1px var(--line);
  transition: transform 0.4s var(--ease), box-shadow 0.3s;
}
.cover-card:hover :deep(.cover) {
  transform: translateY(-5px);
  box-shadow: 0 26px 40px -18px rgba(0, 0, 0, 0.9), 0 0 0 1px var(--line-strong), 0 0 30px rgba(161, 132, 255, 0.25);
}
.cover-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-top: 4px;
}
@media (max-width: 640px) {
  .shelf {
    padding: 30px 16px 0;
  }
  .plank {
    margin: 0 -16px;
  }
}
</style>
