<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../../api.js'
import { confirmAction, coverRatio, fallbackColor, KIND_LABELS, STATUS_BY_KIND, STATUS_LABELS } from '../../util.js'
import { toast } from '../../toast.js'
import GenCover from '../../components/GenCover.vue'
import AppIcon from '../../components/AppIcon.vue'

const route = useRoute()
const router = useRouter()

const KINDS = [
  { id: 'boardgame', label: 'Juegos de mesa', room: '/sala-de-juegos', source: 'BoardGameGeek' },
  { id: 'rpg', label: 'Libros de rol', room: '/sala-de-juegos', source: 'Open Library' },
  { id: 'film', label: 'Películas', room: '/sala-de-proyeccion', source: 'TMDB' },
  { id: 'series', label: 'Series', room: '/sala-de-proyeccion', source: 'TMDB' },
  { id: 'book', label: 'Libros', room: '/biblioteca', source: 'Open Library' },
  { id: 'manga', label: 'Manga', room: '/biblioteca', source: 'AniList' },
  { id: 'videogame', label: 'Videojuegos', room: '/sala-recreativa', source: null },
]

const kind = computed(() => (KINDS.some((k) => k.id === route.params.kind) ? route.params.kind : 'boardgame'))
const kindInfo = computed(() => KINDS.find((k) => k.id === kind.value))
// Los juegos y los libros de rol viven en las Kallax: su sitio sale de cómo están colocados.
const inKallax = computed(() => kind.value === 'boardgame' || kind.value === 'rpg')
const items = ref([])
const q = ref('')
const editing = ref(null)
const form = reactive({})
const saving = ref(false)
const lookupQuery = ref('')
const lookupResults = ref([])
const lookupState = ref('')

async function load() {
  items.value = await api.items(kind.value, true)
}
watch(kind, () => { editing.value = null; load() }, { immediate: true })

const filtered = computed(() => {
  const s = q.value.trim().toLowerCase()
  return s ? items.value.filter((i) => `${i.title} ${i.creator}`.toLowerCase().includes(s)) : items.value
})

function blank() {
  return {
    kind: kind.value, title: '', creator: '', year: '', cover_url: '', color: '#6d4fd8', rating: 7,
    status: 'owned', notes: '', shelf: '', position: 0, featured: false, hidden: false, meta: {},
  }
}

function open(item) {
  editing.value = item ? item.id : 'new'
  const base = item ? { ...item, meta: { ...item.meta } } : blank()
  if (!base.color) base.color = '#6d4fd8'
  for (const k of Object.keys(form)) delete form[k]
  Object.assign(form, base, {
    year: base.year ?? '',
    cover_url: base.cover_url ?? '',
    rating: base.rating ?? '',
    shelf: base.shelf ?? '',
  })
  lookupQuery.value = base.title
  lookupResults.value = []
  lookupState.value = ''
}

async function save() {
  saving.value = true
  try {
    const payload = { ...form, kind: kind.value }
    const saved = editing.value === 'new' ? await api.createItem(payload) : await api.updateItem(editing.value, payload)
    toast(`"${saved.title}" guardado`)
    editing.value = null
    load()
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!confirmAction(`¿Sacar "${form.title}" de la colección?`)) return
  await api.deleteItem(editing.value)
  toast('Eliminado de la colección')
  editing.value = null
  load()
}

async function search() {
  if (lookupQuery.value.trim().length < 2) return
  lookupState.value = 'loading'
  lookupResults.value = []
  try {
    lookupResults.value = await api.lookup(kind.value, lookupQuery.value)
    lookupState.value = lookupResults.value.length ? '' : 'Sin resultados.'
  } catch (e) {
    lookupState.value = e.message
  }
}

function pick(r) {
  Object.assign(form, {
    title: r.title || form.title,
    creator: r.creator || form.creator,
    year: r.year || form.year,
    cover_url: r.cover_url || form.cover_url,
    color: r.color || form.color,
    meta: { ...form.meta, ...Object.fromEntries(Object.entries(r.meta || {}).filter(([, v]) => v !== null && v !== '')) },
  })
  if (r.meta?.overview && !form.notes) form.notes = r.meta.overview
  lookupResults.value = []
  toast('Datos rellenados. Revisa y guarda.')
}
</script>

<template>
  <div>
    <header class="head">
      <div>
        <p class="eyebrow">Colección</p>
        <h1 class="page-title">{{ kindInfo.label }}</h1>
      </div>
      <div class="head-actions">
        <RouterLink :to="kindInfo.room" class="btn btn-sm"><AppIcon name="eye" :size="14" /> Ver la sala</RouterLink>
        <button class="btn btn-primary" @click="open(null)"><AppIcon name="plus" :size="16" /> Añadir</button>
      </div>
    </header>

    <nav class="tabs">
      <button v-for="k in KINDS" :key="k.id" class="chip" :class="{ active: kind === k.id }" @click="router.replace(`/consola/coleccion/${k.id}`)">
        {{ k.label }}
      </button>
    </nav>

    <input v-model="q" class="input search" type="search" :placeholder="`Filtrar ${kindInfo.label.toLowerCase()}…`" />

    <div class="grid">
      <button v-for="it in filtered" :key="it.id" class="card panel" :class="{ hidden: it.hidden, current: editing === it.id }" @click="open(it)">
        <span class="thumb" :class="kind"><GenCover :item="it" :ratio="coverRatio(it)" :show-text="false" /></span>
        <span class="card-info">
          <strong>{{ it.title }}</strong>
          <span class="muted">{{ it.creator }}<template v-if="it.year"> · {{ it.year }}</template></span>
          <span class="flags">
            <span v-if="it.rating !== null" class="readout">★ {{ it.rating }}</span>
            <span v-if="it.featured" class="pill">Favorito</span>
            <span v-if="it.hidden" class="pill pill-warn">Oculto</span>
            <span v-if="it.meta?.doubt" class="pill pill-warn">Duda</span>
            <span v-if="it.meta?.postit" class="pill pill-postit">Pósit</span>
            <span v-if="it.status !== 'owned'" class="pill">{{ STATUS_LABELS[it.status] }}</span>
          </span>
        </span>
      </button>
    </div>

    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="editing" class="drawer-overlay" @click.self="editing = null">
          <form class="drawer panel" @submit.prevent="save">
            <header class="drawer-head">
              <div>
                <p class="eyebrow">{{ KIND_LABELS[kind] }}</p>
                <h2>{{ editing === 'new' ? 'Añadir a la colección' : form.title }}</h2>
              </div>
              <button type="button" class="btn btn-ghost btn-icon" @click="editing = null"><AppIcon name="close" /><span class="sr-only">Cerrar</span></button>
            </header>

            <section v-if="kindInfo.source" class="lookup">
              <span class="label">Rellenar desde {{ kindInfo.source }}</span>
              <div class="lookup-row">
                <input v-model="lookupQuery" class="input" placeholder="Título a buscar…" @keydown.enter.prevent="search" />
                <button type="button" class="btn" @click="search"><AppIcon name="search" :size="15" /> Buscar</button>
              </div>
              <p v-if="lookupState === 'loading'" class="readout">Consultando {{ kindInfo.source }}…</p>
              <p v-else-if="lookupState" class="lookup-msg">{{ lookupState }}</p>
              <ul v-if="lookupResults.length" class="results">
                <li v-for="(r, i) in lookupResults" :key="i">
                  <button type="button" class="result" @click="pick(r)">
                    <img v-if="r.cover_url" :src="r.cover_url" alt="" />
                    <span v-else class="noimg" :style="{ background: r.color || fallbackColor(r.title) }"></span>
                    <span><strong>{{ r.title }}</strong><br /><span class="muted">{{ r.creator }} {{ r.year ? `· ${r.year}` : '' }}</span></span>
                  </button>
                </li>
              </ul>
            </section>

            <div class="form-grid">
              <label class="field span-2"><span>Título</span><input v-model="form.title" class="input" required /></label>
              <label class="field"><span>{{ kind === 'boardgame' ? 'Diseño' : kind === 'film' ? 'Dirección' : kind === 'videogame' ? 'Desarrollo' : 'Autoría' }}</span><input v-model="form.creator" class="input" /></label>
              <label class="field"><span>Año</span><input v-model="form.year" class="input" type="number" min="1800" max="2100" /></label>

              <label class="field span-2"><span>Portada (URL)</span><input v-model="form.cover_url" class="input" placeholder="Vacío: se genera una con el color" /></label>

              <label class="field"><span>Color del lomo</span>
                <span class="color-row"><input v-model="form.color" type="color" class="color" /><code>{{ form.color }}</code></span>
              </label>
              <label class="field"><span>Nota: {{ form.rating === '' ? '—' : form.rating }}/10</span><input v-model.number="form.rating" type="range" min="0" max="10" class="range" /></label>

              <label class="field"><span>Estado</span>
                <select v-model="form.status" class="select">
                  <option v-for="s in STATUS_BY_KIND[kind]" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
                </select>
              </label>
              <label v-if="!inKallax" class="field">
                <span>Balda</span>
                <input v-model="form.shelf" class="input" type="number" min="0" placeholder="Automático" />
              </label>
              <div v-else class="field">
                <span>Dónde está</span>
                <p class="where">{{ form.meta.location || 'Sin colocar todavía: aparece en la mesa de la sala de juegos.' }}</p>
              </div>

              <template v-if="kind === 'boardgame'">
                <label class="field"><span>Jugadores</span><input v-model="form.meta.players" class="input" placeholder="2-4" /></label>
                <label class="field"><span>Duración (min)</span><input v-model.number="form.meta.minutes" class="input" type="number" min="0" /></label>
              </template>
              <template v-if="inKallax">
                <label class="field"><span>Pósit (lo que le falta)</span><input v-model="form.meta.postit" class="input" placeholder="inserto · expansiones" /></label>
                <label class="field"><span>Pegatina de color</span><input v-model="form.meta.dot" class="input" placeholder="2, 3-4…" /></label>
                <label v-if="form.meta.doubt" class="field span-2"><span>Duda al leer la foto</span><textarea v-model="form.meta.doubt" class="textarea" rows="2"></textarea></label>
              </template>
              <template v-if="kind === 'film' || kind === 'series'">
                <label class="field"><span>Formato</span>
                  <select v-model="form.meta.format" class="select">
                    <option value="bluray">Blu-ray</option><option value="4k">4K UHD</option><option value="dvd">DVD</option>
                  </select>
                </label>
                <label v-if="kind === 'series'" class="field"><span>Temporadas</span><input v-model.number="form.meta.seasons" class="input" type="number" min="1" /></label>
              </template>
              <template v-if="kind === 'videogame'">
                <label class="field"><span>Plataforma</span><input v-model="form.meta.platform" class="input" placeholder="Super Nintendo Entertainment System" /></label>
                <label class="field"><span>Género</span><input v-model="form.meta.genre" class="input" placeholder="Plataformas; Acción" /></label>
                <label class="field"><span>Editor</span><input v-model="form.meta.publisher" class="input" /></label>
                <label class="field"><span>Partidas jugadas</span><input v-model.number="form.meta.play_count" class="input" type="number" min="0" /></label>
              </template>
              <label v-if="kind === 'book'" class="field"><span>Páginas</span><input v-model.number="form.meta.pages" class="input" type="number" min="1" /></label>
              <template v-if="kind === 'manga'">
                <label class="field"><span>Tomos que tengo</span><input v-model.number="form.meta.volumes_owned" class="input" type="number" min="1" /></label>
                <label class="field"><span>Tomos publicados</span><input v-model.number="form.meta.volumes_total" class="input" type="number" min="1" /></label>
              </template>

              <label class="field span-2"><span>Notas</span><textarea v-model="form.notes" class="textarea" rows="4" placeholder="Qué te pareció, con quién lo jugaste, dónde lo compraste…"></textarea></label>

              <label class="check"><input v-model="form.featured" type="checkbox" /> Favorito</label>
              <label class="check"><input v-model="form.hidden" type="checkbox" /> Ocultar en la web</label>
            </div>

            <footer class="drawer-foot">
              <button v-if="editing !== 'new'" type="button" class="btn btn-danger" @click="remove"><AppIcon name="trash" :size="15" /> Eliminar</button>
              <span class="spacer"></span>
              <button type="button" class="btn btn-ghost" @click="editing = null">Cancelar</button>
              <button class="btn btn-primary" :disabled="saving"><AppIcon name="save" :size="15" /> Guardar</button>
            </footer>
          </form>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.head-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}
.search {
  border-radius: 999px;
  margin-bottom: 18px;
  max-width: 420px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.card {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 10px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.3s var(--ease);
}
.card:hover,
.card.current {
  border-color: var(--line-strong);
  transform: translateY(-2px);
}
.card.hidden {
  opacity: 0.5;
}
.thumb {
  width: 54px;
  flex: none;
  border-radius: 6px;
  overflow: hidden;
}
.card-info {
  display: grid;
  gap: 2px;
  min-width: 0;
  font-size: 14px;
}
.card-info strong {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-info .muted {
  font-size: 13px;
}
.flags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-top: 4px;
}

.drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(4, 2, 10, 0.6);
  backdrop-filter: blur(3px);
  display: flex;
  justify-content: flex-end;
}
.drawer {
  width: min(560px, 100%);
  height: 100%;
  overflow-y: auto;
  border-radius: 0;
  border-width: 0 0 0 1px;
  background: rgba(16, 10, 34, 0.97);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.drawer-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.drawer-head h2 {
  margin: 0;
  font-size: 22px;
}
.drawer-head .eyebrow {
  margin-bottom: 4px;
}
.lookup {
  display: grid;
  gap: 10px;
  padding: 16px;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--line-strong);
  background: rgba(161, 132, 255, 0.05);
}
.lookup-row {
  display: flex;
  gap: 8px;
}
.lookup-msg {
  margin: 0;
  font-size: 14px;
  color: var(--amber);
}
.results {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 4px;
  max-height: 260px;
  overflow-y: auto;
}
.result {
  width: 100%;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 6px;
  border: none;
  border-radius: 8px;
  background: none;
  cursor: pointer;
  text-align: left;
  font-size: 14px;
}
.result:hover {
  background: rgba(161, 132, 255, 0.12);
}
.result img,
.noimg {
  width: 36px;
  height: 50px;
  object-fit: cover;
  border-radius: 4px;
  flex: none;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.where {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--line-strong);
  font-size: 14px;
  color: var(--text-soft);
}
.pill-postit {
  border-color: rgba(255, 230, 120, 0.5);
  color: #ffe678;
}
.span-2 {
  grid-column: span 2;
}
.color-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.color {
  width: 48px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: none;
  cursor: pointer;
}
code {
  font-family: var(--font-mono);
  color: var(--muted);
}
.range {
  accent-color: var(--violet);
  margin-top: 10px;
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-soft);
  grid-column: span 2;
}
.check input {
  accent-color: var(--violet);
  width: 16px;
  height: 16px;
}
.drawer-foot {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
  position: sticky;
  bottom: -24px;
  background: rgba(16, 10, 34, 0.97);
  padding-bottom: 4px;
}
.spacer {
  flex: 1;
}
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.3s;
}
.drawer-enter-active .drawer,
.drawer-leave-active .drawer {
  transition: transform 0.4s var(--ease);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .drawer,
.drawer-leave-to .drawer {
  transform: translateX(40px);
}
@media (max-width: 560px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .span-2,
  .check {
    grid-column: auto;
  }
}
</style>
