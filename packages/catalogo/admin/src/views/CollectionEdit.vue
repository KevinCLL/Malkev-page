<script setup>
// Una colección: sus datos, una vista del mueble hueco a hueco (si tiene filas y columnas) y la lista
// de lo que contiene, que se reordena arrastrando. Los cambios de orden y huecos se guardan juntos.
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, COLLECTION_KINDS, KINDS } from '../api.js'
import { toast } from '../toast.js'
import Cover from '../components/Cover.vue'
import ItemPicker from '../components/ItemPicker.vue'
import AppIcon from '../components/AppIcon.vue'

const props = defineProps({ id: String })
const router = useRouter()
const col = ref(null)
const form = reactive({})
const rows = ref([])
const dirty = ref(false)
const cell = ref(null) // hueco seleccionado {row, col}
const q = ref('')

async function load() {
  try {
    col.value = await api.collection(props.id)
    Object.assign(form, {
      name: col.value.name, slug: col.value.slug, kind: col.value.kind, room: col.value.room || '', description: col.value.description,
      rows: col.value.rows ?? '', cols: col.value.cols ?? '', is_public: col.value.is_public, position: col.value.position,
    })
    rows.value = col.value.items.map((it) => ({ ...it, slot: { ...it.slot } }))
    dirty.value = false
  } catch (e) { toast(e.message, 'error') }
}
onMounted(load)

async function saveMeta() {
  try { await api.updateCollection(props.id, form); toast('Colección guardada.'); await load() } catch (e) { toast(e.message, 'error') }
}
async function saveItems() {
  try {
    await api.setCollectionItems(props.id, rows.value.map((r, i) => ({ item_id: r.id, position: i, row: r.slot.row, col: r.slot.col, placement: r.slot.placement, note: r.slot.note })))
    toast('Orden y huecos guardados.')
    await load()
  } catch (e) { toast(e.message, 'error') }
}
async function remove() {
  if (!confirm(`¿Borrar la colección «${form.name}»? Las cosas siguen en el catálogo.`)) return
  try { await api.deleteCollection(props.id); router.push('/colecciones') } catch (e) { toast(e.message, 'error') }
}

function add(item) {
  rows.value.push({ ...item, slot: { row: cell.value?.row ?? null, col: cell.value?.col ?? null, placement: '', note: '' } })
  dirty.value = true
}
function drop(i) { rows.value.splice(i, 1); dirty.value = true }

/* Arrastrar para reordenar */
const dragging = ref(null)
function onDragStart(i) { dragging.value = i }
function onDrop(i) {
  if (dragging.value === null || dragging.value === i) return
  const [moved] = rows.value.splice(dragging.value, 1)
  rows.value.splice(i, 0, moved)
  dragging.value = null
  dirty.value = true
}
const move = (i, d) => {
  const j = i + d
  if (j < 0 || j >= rows.value.length) return
  ;[rows.value[i], rows.value[j]] = [rows.value[j], rows.value[i]]
  dirty.value = true
}

/* Vista del mueble */
const hasGrid = computed(() => col.value?.rows && col.value?.cols)
// Huecos del mueble: si la colección trae la colocación detallada, se respetan los huecos dobles
// (baldas o tabiques quitados); si no, una rejilla normal de filas × columnas.
const cubes = computed(() => {
  const fromLayout = col.value?.layout?.cubes
  if (fromLayout?.length) {
    return fromLayout.map((k) => {
      const deco = (k.tiers || []).flat().filter((g) => g.type === 'deco' && g.items?.[0]?.label).map((g) => g.items[0].label)
      return { row: k.row, col: k.col, rows: k.rows || 1, cols: k.cols || 1, label: deco[0] || '' }
    })
  }
  const out = []
  for (let r = 1; r <= (col.value?.rows || 0); r++) for (let c = 1; c <= (col.value?.cols || 0); c++) out.push({ row: r, col: c, rows: 1, cols: 1 })
  return out
})
const cellCount = (r, c) => rows.value.filter((x) => x.slot.row === r && x.slot.col === c).length
const unplaced = computed(() => rows.value.filter((x) => x.slot.row == null).length)
const visible = computed(() => {
  let list = rows.value.map((r, i) => ({ r, i }))
  if (cell.value) list = list.filter(({ r }) => cell.value.row === 0 ? r.slot.row == null : r.slot.row === cell.value.row && r.slot.col === cell.value.col)
  if (q.value.trim()) {
    const needle = q.value.trim().toLowerCase()
    list = list.filter(({ r }) => r.title.toLowerCase().includes(needle))
  }
  return list
})
function pickCell(r, c) {
  cell.value = cell.value?.row === r && cell.value?.col === c ? null : { row: r, col: c }
}
const ROOMS = { 'sala-recreativa': 'Sala recreativa', proyeccion: 'Sala de proyección', biblioteca: 'Biblioteca' }
</script>

<template>
  <div v-if="col">
    <RouterLink to="/colecciones" class="back"><AppIcon name="arrow-left" :size="14" /> Colecciones</RouterLink>
    <header class="view-head">
      <div>
        <p class="eyebrow">{{ COLLECTION_KINDS[col.kind] }} · {{ col.total }} cosas</p>
        <h1 class="page-title">{{ col.name }}</h1>
        <p class="readout"><a :href="`/api/v1/collections/${col.slug}`" target="_blank">/api/v1/collections/{{ col.slug }}</a></p>
      </div>
      <div class="actions">
        <button class="btn btn-danger" @click="remove"><AppIcon name="trash" :size="16" /> Borrar</button>
        <button class="btn btn-primary" :disabled="!dirty" @click="saveItems"><AppIcon name="save" :size="16" /> {{ dirty ? 'Guardar cambios' : 'Sin cambios' }}</button>
      </div>
    </header>

    <div class="split">
      <div style="display: grid; gap: 16px; min-width: 0">
        <section v-if="hasGrid" class="panel panel-pad">
          <h2 class="section-title">El mueble, hueco a hueco</h2>
          <div class="kallax" :style="{ gridTemplateColumns: `repeat(${col.cols}, minmax(0, 1fr))` }">
            <button v-for="k in cubes" :key="`${k.row}-${k.col}`" type="button" class="cube"
              :style="{ gridRow: `${k.row} / span ${k.rows}`, gridColumn: `${k.col} / span ${k.cols}` }"
              :class="{ active: cell?.row === k.row && cell?.col === k.col, empty: !cellCount(k.row, k.col) }" @click="pickCell(k.row, k.col)">
              <span class="n">{{ cellCount(k.row, k.col) }}</span>
              <span class="pos">{{ k.row }}·{{ k.col }}</span>
              <span v-if="k.label" class="deco">{{ k.label }}</span>
            </button>
          </div>
          <div class="chips" style="margin: 12px 0 0">
            <button class="chip" :class="{ active: cell?.row === 0 }" @click="cell = cell?.row === 0 ? null : { row: 0, col: 0 }">Sin hueco (encima, sueltas) <span class="n">{{ unplaced }}</span></button>
            <button v-if="cell" class="chip" @click="cell = null">Ver todo</button>
          </div>
          <p class="hint">Toca un hueco para ver lo que hay dentro; lo que añadas irá a ese hueco.</p>
        </section>

        <section class="panel panel-pad">
          <div class="toolbar-row">
            <div style="flex: 1 1 280px"><ItemPicker :exclude="rows.map((r) => r.id)" placeholder="Añadir algo del catálogo…" @pick="add" /></div>
            <input v-model="q" class="input" type="search" placeholder="Filtrar aquí…" style="flex: 0 1 200px" />
          </div>
          <p class="readout" style="margin: 0 0 8px">{{ visible.length }} {{ cell ? (cell.row ? `en el hueco ${cell.row}·${cell.col}` : 'sin hueco') : 'en total' }}</p>
          <ol class="list">
            <li v-for="{ r, i } in visible.slice(0, 400)" :key="r.id" draggable="true" :class="{ dragging: dragging === i }"
              @dragstart="onDragStart(i)" @dragover.prevent @drop="onDrop(i)">
              <span class="grip" title="Arrastra para mover">⋮⋮</span>
              <Cover :item="r" :size="28" />
              <div class="who">
                <RouterLink :to="`/catalogo/${r.id}`" class="row-title">{{ r.title }}</RouterLink>
                <small class="muted">{{ KINDS[r.kind].one }}<template v-if="r.slot.placement"> · {{ r.slot.placement }}</template></small>
              </div>
              <template v-if="hasGrid">
                <input v-model.number="r.slot.row" class="input tiny" type="number" min="1" :max="col.rows" placeholder="fila" @input="dirty = true" />
                <input v-model.number="r.slot.col" class="input tiny" type="number" min="1" :max="col.cols" placeholder="col" @input="dirty = true" />
              </template>
              <span class="ops">
                <button type="button" class="btn btn-icon btn-ghost btn-sm" aria-label="Subir" @click="move(i, -1)">↑</button>
                <button type="button" class="btn btn-icon btn-ghost btn-sm" aria-label="Bajar" @click="move(i, 1)">↓</button>
                <button type="button" class="btn btn-icon btn-ghost btn-sm" aria-label="Sacar" @click="drop(i)"><AppIcon name="close" :size="13" /></button>
              </span>
            </li>
          </ol>
          <p v-if="visible.length > 400" class="hint">Mostrando 400 de {{ visible.length }}. Filtra para ver el resto.</p>
          <p v-if="!visible.length" class="empty">Aquí no hay nada todavía.</p>
        </section>
      </div>

      <aside>
        <form class="panel panel-pad" style="display: grid; gap: 12px" @submit.prevent="saveMeta">
          <h2 class="section-title">Datos</h2>
          <label class="field"><span>Nombre</span><input v-model="form.name" class="input" required /></label>
          <label class="field"><span>Slug (URL)</span><input v-model="form.slug" class="input mono" /></label>
          <label class="field"><span>Tipo</span><select v-model="form.kind" class="select"><option v-for="(l, k) in COLLECTION_KINDS" :key="k" :value="k">{{ l }}</option></select></label>
          <label class="field"><span>Estancia</span><select v-model="form.room" class="select"><option value="">—</option><option v-for="(l, k) in ROOMS" :key="k" :value="k">{{ l }}</option></select></label>
          <div class="form-grid">
            <label class="field"><span>Filas</span><input v-model="form.rows" class="input" type="number" min="1" max="50" /></label>
            <label class="field"><span>Columnas</span><input v-model="form.cols" class="input" type="number" min="1" max="50" /></label>
          </div>
          <label class="field"><span>Descripción</span><textarea v-model="form.description" class="textarea" rows="3" /></label>
          <label class="field"><span>Orden entre colecciones</span><input v-model="form.position" class="input" type="number" /></label>
          <label class="check"><input v-model="form.is_public" type="checkbox" /> Visible en la web</label>
          <button class="btn"><AppIcon name="save" :size="15" /> Guardar datos</button>
          <p v-if="Object.keys(col.layout || {}).length" class="hint">Esta colección guarda además la colocación detallada (pilas, cajas de pie, decoración) en <code>layout</code>, que usa la Kallax 3D.</p>
        </form>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.kallax {
  display: grid;
  max-width: 560px;
  grid-auto-rows: 1fr;
  gap: 6px;
  padding: 10px;
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(240, 230, 255, 0.1), rgba(240, 230, 255, 0.04));
  border: 1px solid var(--line-strong);
}
.cube {
  min-height: 72px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: rgba(6, 3, 16, 0.6);
  display: grid;
  place-items: center;
  position: relative;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}
.cube:hover {
  border-color: var(--lavender);
}
.cube.active {
  background: rgba(161, 132, 255, 0.28);
  border-color: var(--lavender);
  box-shadow: var(--glow);
}
.cube.empty .n {
  color: var(--muted);
}
.cube .n {
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--lavender);
}
.cube .deco {
  position: absolute;
  bottom: 6px;
  left: 6px;
  right: 6px;
  font-size: 11px;
  line-height: 1.2;
  color: var(--muted);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.cube .pos {
  position: absolute;
  left: 6px;
  top: 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--muted);
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 2px;
}
.list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 8px;
  border-radius: 10px;
  border: 1px solid transparent;
}
.list li:hover {
  background: rgba(161, 132, 255, 0.06);
  border-color: var(--line);
}
.list li.dragging {
  opacity: 0.4;
}
.grip {
  cursor: grab;
  color: var(--muted);
  letter-spacing: -3px;
  user-select: none;
}
.who {
  flex: 1;
  min-width: 0;
  display: grid;
}
.who small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.input.tiny {
  width: 64px;
  padding: 6px 8px;
}
.ops {
  display: flex;
  gap: 2px;
}
</style>
