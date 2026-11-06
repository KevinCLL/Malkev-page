<script setup>
// Ficha de una cosa del catálogo. Al crearla, se busca por título en Open Library, TMDB, AniList o
// BoardGameGeek y se rellenan los datos; tú pones la nota, el estado y dónde va.
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, KINDS, STATUSES, STATUS_FOR, fmtDate } from '../api.js'
import { toast } from '../toast.js'
import Cover from '../components/Cover.vue'
import TagInput from '../components/TagInput.vue'
import AppIcon from '../components/AppIcon.vue'

const props = defineProps({ id: String })
const route = useRoute()
const router = useRouter()
const isNew = computed(() => !props.id)

const blank = () => ({
  kind: route.query.kind || 'book', title: '', original_title: '', creator: '', year: '', synopsis: '', cover_url: '',
  color: '', status: 'owned', notes: '', featured: false, hidden: false, started_on: '', finished_on: '', tags: [],
})
const form = reactive(blank())
const item = ref(null)
const extJson = ref('{}')
const metaJson = ref('{}')
const saving = ref(false)
const allCollections = ref([])
const addTo = ref('')

function fill(it) {
  item.value = it
  Object.assign(form, {
    kind: it.kind, title: it.title, original_title: it.original_title || '', creator: it.creator, year: it.year ?? '',
    synopsis: it.synopsis, cover_url: it.cover_url || '', color: it.color || '', status: it.status, notes: it.notes,
    featured: it.featured, hidden: it.hidden, started_on: it.started_on || '', finished_on: it.finished_on || '',
    tags: it.tags.map((t) => t.name),
  })
  extJson.value = JSON.stringify(it.external_ids, null, 2)
  metaJson.value = JSON.stringify(it.meta, null, 2)
}

onMounted(async () => {
  try {
    allCollections.value = (await api.collections()).collections
    if (!isNew.value) fill(await api.item(props.id))
  } catch (e) { toast(e.message, 'error') }
})

function parseJson(text, name) {
  try {
    const v = JSON.parse(text || '{}')
    if (typeof v !== 'object' || Array.isArray(v) || v === null) throw new Error()
    return v
  } catch { throw new Error(`El campo «${name}» no es un JSON válido (tiene que ser un objeto { … }).`) }
}

async function save() {
  saving.value = true
  try {
    const body = { ...form, external_ids: parseJson(extJson.value, 'Identificadores'), meta: parseJson(metaJson.value, 'Datos extra') }
    if (isNew.value) {
      const created = await api.createItem({ ...body, rating: pendingRating.value === '' ? null : Number(pendingRating.value) })
      toast('Añadido al catálogo.')
      router.replace(`/catalogo/${created.id}`)
    } else {
      fill(await api.updateItem(props.id, body))
      toast('Guardado.')
    }
  } catch (e) { toast(e.message, 'error') } finally { saving.value = false }
}

async function remove() {
  if (!confirm(`¿Borrar «${form.title}» del catálogo? También sale de todas las colecciones.`)) return
  try { await api.deleteItem(props.id); toast('Borrado.'); router.push('/catalogo') } catch (e) { toast(e.message, 'error') }
}

/* ---------- Autocompletado ---------- */
const lq = ref('')
const lookingUp = ref(false)
const candidates = ref([])
const lookupError = ref('')
async function lookup() {
  if (lq.value.trim().length < 2) return
  lookingUp.value = true
  lookupError.value = ''
  try { candidates.value = (await api.lookup(form.kind, lq.value.trim())).results } catch (e) { lookupError.value = e.message; candidates.value = [] } finally { lookingUp.value = false }
}
function useCandidate(c) {
  Object.assign(form, {
    title: c.title || form.title, original_title: c.original_title || form.original_title, creator: c.creator || form.creator,
    year: c.year || form.year, synopsis: c.synopsis || form.synopsis, cover_url: c.cover_url || form.cover_url, color: c.color || form.color,
  })
  const ext = { ...parseJson(extJson.value, 'Identificadores'), ...Object.fromEntries(Object.entries(c.external_ids || {}).filter(([, v]) => v != null)) }
  extJson.value = JSON.stringify(ext, null, 2)
  metaJson.value = JSON.stringify({ ...parseJson(metaJson.value, 'Datos extra'), ...(c.meta || {}) }, null, 2)
  candidates.value = []
  toast('Datos rellenados. Revisa y guarda.')
}
const lookupSource = computed(() => ({
  book: 'Open Library', rpg: 'Open Library', manga: 'AniList', film: 'TMDB', series: 'TMDB', boardgame: 'BoardGameGeek', videogame: null,
})[form.kind])

/* ---------- Nota ---------- */
const pendingRating = ref('')
const score = ref(7)
const review = ref('')
async function rate() {
  try {
    fill(await api.rate(props.id, Number(score.value), review.value))
    review.value = ''
    toast('Nota apuntada.')
  } catch (e) { toast(e.message, 'error') }
}
async function dropRating(r) {
  if (!confirm('¿Quitar esta nota del historial?')) return
  try { fill(await api.deleteRating(props.id, r.id)) } catch (e) { toast(e.message, 'error') }
}

/* ---------- Colecciones ---------- */
async function addToCollection() {
  if (!addTo.value) return
  try {
    await api.placeItem(addTo.value, { item_id: Number(props.id) })
    fill(await api.item(props.id))
    addTo.value = ''
    toast('Colocado.')
  } catch (e) { toast(e.message, 'error') }
}
async function removeFrom(c) {
  const col = allCollections.value.find((x) => x.slug === c.slug)
  try { await api.unplaceItem(col.id, props.id); fill(await api.item(props.id)) } catch (e) { toast(e.message, 'error') }
}
const statusOptions = computed(() => {
  const preferred = STATUS_FOR[form.kind] || Object.keys(STATUSES)
  return [...preferred, ...Object.keys(STATUSES).filter((s) => !preferred.includes(s))]
})
const publicUrl = computed(() => item.value && `/api/v1/items/${item.value.kind}/${item.value.slug}`)
</script>

<template>
  <form @submit.prevent="save">
    <RouterLink to="/catalogo" class="back"><AppIcon name="arrow-left" :size="14" /> Catálogo</RouterLink>
    <header class="view-head">
      <div>
        <p class="eyebrow">{{ KINDS[form.kind]?.one }}</p>
        <h1 class="page-title">{{ isNew ? 'Añadir al catálogo' : form.title || 'Sin título' }}</h1>
        <p v-if="item" class="readout">Actualizado {{ fmtDate(item.updated_at, true) }} · <a :href="publicUrl" target="_blank">ver en la API</a></p>
      </div>
      <div class="actions">
        <button v-if="!isNew" type="button" class="btn btn-danger" @click="remove"><AppIcon name="trash" :size="16" /> Borrar</button>
        <button class="btn btn-primary" :disabled="saving"><AppIcon name="save" :size="16" /> {{ saving ? 'Guardando…' : 'Guardar' }}</button>
      </div>
    </header>

    <div class="split">
      <div style="display: grid; gap: 16px">
        <section v-if="isNew" class="panel panel-pad">
          <h2 class="section-title">Autocompletar</h2>
          <div class="form-grid">
            <label class="field">
              <span>Tipo</span>
              <select v-model="form.kind" class="select">
                <option v-for="(k, key) in KINDS" :key="key" :value="key">{{ k.one }}</option>
              </select>
            </label>
            <label class="field" style="grid-column: span 2">
              <span>Buscar en {{ lookupSource || '—' }}</span>
              <div class="lookup-row">
                <input v-model="lq" class="input" :disabled="!lookupSource" placeholder="Título…" @keydown.enter.prevent="lookup" />
                <button type="button" class="btn" :disabled="!lookupSource || lookingUp" @click="lookup"><AppIcon name="search" :size="16" /> {{ lookingUp ? 'Buscando…' : 'Buscar' }}</button>
              </div>
            </label>
          </div>
          <p v-if="!lookupSource" class="hint">Para videojuegos todavía no hay autocompletado: rellénalo a mano.</p>
          <p v-if="lookupError" class="hint" style="color: var(--danger)">{{ lookupError }}</p>
          <ul v-if="candidates.length" class="candidates">
            <li v-for="(c, i) in candidates" :key="i">
              <button type="button" @click="useCandidate(c)">
                <Cover :item="c" :size="40" />
                <span><strong>{{ c.title }}</strong><br /><small class="muted">{{ [c.creator, c.year].filter(Boolean).join(' · ') || '—' }}</small></span>
              </button>
            </li>
          </ul>
        </section>

        <section class="panel panel-pad">
          <h2 class="section-title">Datos</h2>
          <div class="form-grid">
            <label class="field wide"><span>Título</span><input v-model="form.title" class="input" required /></label>
            <label class="field"><span>Título original</span><input v-model="form.original_title" class="input" /></label>
            <label class="field"><span>Autoría (autor, director, diseño…)</span><input v-model="form.creator" class="input" /></label>
            <label class="field"><span>Año</span><input v-model="form.year" class="input" type="number" min="1000" max="2200" /></label>
            <label v-if="!isNew" class="field">
              <span>Tipo</span>
              <select v-model="form.kind" class="select"><option v-for="(k, key) in KINDS" :key="key" :value="key">{{ k.one }}</option></select>
            </label>
            <label class="field wide"><span>Sinopsis</span><textarea v-model="form.synopsis" class="textarea" rows="4" /></label>
            <label class="field wide"><span>Notas privadas (no salen en la web)</span><textarea v-model="form.notes" class="textarea" rows="3" /></label>
          </div>
        </section>

        <section class="panel panel-pad">
          <h2 class="section-title">Etiquetas</h2>
          <TagInput v-model="form.tags" />
        </section>

        <section class="panel panel-pad">
          <h2 class="section-title">Avanzado</h2>
          <div class="form-grid">
            <label class="field"><span>Identificadores en otras webs</span><textarea v-model="extJson" class="textarea code" spellcheck="false" /></label>
            <label class="field"><span>Datos extra (páginas, plataforma, tomos…)</span><textarea v-model="metaJson" class="textarea code" spellcheck="false" /></label>
          </div>
          <p class="hint">Formato JSON. Ejemplo: <code>{"tmdb": 593, "imdb": "tt0069293"}</code></p>
        </section>
      </div>

      <aside>
        <section class="panel panel-pad cover-box">
          <Cover :item="{ title: form.title || '?', cover_url: form.cover_url, color: form.color }" :size="150" />
          <label class="field" style="width: 100%"><span>URL de la portada</span><input v-model="form.cover_url" class="input" placeholder="https://…" /></label>
          <label class="field" style="width: 100%">
            <span>Color (lomos y cajas)</span>
            <div class="lookup-row">
              <input :value="form.color || '#6d4fd8'" type="color" class="swatch" @input="form.color = $event.target.value" />
              <input v-model="form.color" class="input mono" placeholder="#rrggbb" />
            </div>
          </label>
        </section>

        <section class="panel panel-pad" style="display: grid; gap: 12px">
          <h2 class="section-title">Estado</h2>
          <select v-model="form.status" class="select">
            <option v-for="s in statusOptions" :key="s" :value="s">{{ STATUSES[s] }}</option>
          </select>
          <div class="form-grid">
            <label class="field"><span>Empezado</span><input v-model="form.started_on" class="input" type="date" /></label>
            <label class="field"><span>Terminado</span><input v-model="form.finished_on" class="input" type="date" /></label>
          </div>
          <label class="check"><input v-model="form.featured" type="checkbox" /> Destacado</label>
          <label class="check"><input v-model="form.hidden" type="checkbox" /> Oculto en la web</label>
        </section>

        <section class="panel panel-pad" style="display: grid; gap: 10px">
          <h2 class="section-title">Nota</h2>
          <template v-if="isNew">
            <input v-model="pendingRating" class="input" type="number" min="0" max="10" placeholder="0 a 10 (opcional)" />
          </template>
          <template v-else>
            <p class="big-rating">{{ item?.rating ?? '—' }}<small>/10</small></p>
            <div class="lookup-row">
              <input v-model="score" type="range" min="0" max="10" step="1" style="flex: 1; accent-color: var(--violet)" />
              <span class="mono">{{ score }}</span>
            </div>
            <textarea v-model="review" class="textarea" rows="2" placeholder="Reseña corta (opcional)" />
            <button type="button" class="btn btn-sm" @click="rate"><AppIcon name="star" :size="14" /> Apuntar nota</button>
            <ul v-if="item?.ratings.length" class="history">
              <li v-for="r in item.ratings" :key="r.id">
                <span class="mono">{{ r.score }}</span>
                <span class="muted">{{ fmtDate(r.rated_at) }}</span>
                <span v-if="r.review" class="rv">«{{ r.review }}»</span>
                <button type="button" class="btn btn-icon btn-ghost btn-sm" aria-label="Quitar" @click="dropRating(r)"><AppIcon name="close" :size="12" /></button>
              </li>
            </ul>
          </template>
        </section>

        <section v-if="!isNew" class="panel panel-pad" style="display: grid; gap: 10px">
          <h2 class="section-title">Dónde está</h2>
          <p v-if="!item?.collections.length" class="muted">En ninguna colección.</p>
          <ul class="history">
            <li v-for="c in item?.collections" :key="c.slug">
              <RouterLink :to="`/colecciones/${allCollections.find((x) => x.slug === c.slug)?.id}`">{{ c.name }}</RouterLink>
              <span v-if="c.row" class="muted">fila {{ c.row }}, col. {{ c.col }}</span>
              <button type="button" class="btn btn-icon btn-ghost btn-sm" aria-label="Sacar" @click="removeFrom(c)"><AppIcon name="close" :size="12" /></button>
            </li>
          </ul>
          <div class="lookup-row">
            <select v-model="addTo" class="select" style="flex: 1">
              <option value="">Colocar en…</option>
              <option v-for="c in allCollections.filter((x) => !item?.collections.some((y) => y.slug === x.slug))" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <button type="button" class="btn btn-sm" :disabled="!addTo" @click="addToCollection">Añadir</button>
          </div>
        </section>
      </aside>
    </div>
  </form>
</template>

<style scoped>
.lookup-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.lookup-row .input {
  flex: 1;
}
.candidates {
  list-style: none;
  padding: 0;
  margin: 14px 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 6px;
}
.candidates button {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 8px;
  text-align: left;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(6, 3, 16, 0.4);
  cursor: pointer;
}
.candidates button:hover {
  border-color: var(--lavender);
}
.cover-box {
  display: grid;
  justify-items: center;
  gap: 12px;
}
.swatch {
  width: 44px;
  height: 40px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: none;
  padding: 2px;
}
.big-rating {
  margin: 0;
  font-family: var(--font-display);
  font-size: 40px;
  color: var(--lavender);
}
.big-rating small {
  font-size: 16px;
  color: var(--muted);
}
.history {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 4px;
  font-size: 14px;
}
.history li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.history .rv {
  flex: 1;
  font-style: italic;
  color: var(--text-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history li > :last-child {
  margin-left: auto;
}
</style>
