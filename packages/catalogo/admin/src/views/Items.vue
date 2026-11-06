<script setup>
// Catálogo: todo lo que hay a bordo, con filtros, búsqueda y cambios en bloque.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, KINDS, STATUSES } from '../api.js'
import { toast } from '../toast.js'
import Cover from '../components/Cover.vue'
import Pager from '../components/Pager.vue'
import AppIcon from '../components/AppIcon.vue'

const route = useRoute()
const router = useRouter()
const f = reactive({
  kind: route.query.kind || '', status: route.query.status || '', q: route.query.q || '',
  hidden: route.query.hidden || '', tag: route.query.tag || '', sort: route.query.sort || 'title', offset: Number(route.query.offset) || 0,
})
const LIMIT = 50
const data = ref({ total: 0, items: [] })
const loading = ref(false)
const selected = ref(new Set())

async function load() {
  loading.value = true
  try {
    data.value = await api.items({ ...f, limit: LIMIT })
    selected.value = new Set()
  } catch (e) { toast(e.message, 'error') } finally { loading.value = false }
}
let timer = 0
watch(() => [f.kind, f.status, f.hidden, f.sort, f.tag], () => { f.offset = 0; sync() })
watch(() => f.q, () => { clearTimeout(timer); timer = setTimeout(() => { f.offset = 0; sync() }, 250) })
function sync() {
  router.replace({ query: Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== '' && !(k === 'offset' && !v) && !(k === 'sort' && v === 'title'))) })
  load()
}
onMounted(load)

const allChecked = computed(() => data.value.items.length && data.value.items.every((i) => selected.value.has(i.id)))
function toggleAll() {
  selected.value = allChecked.value ? new Set() : new Set(data.value.items.map((i) => i.id))
}
function toggle(id) {
  const s = new Set(selected.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selected.value = s
}
async function bulk(patch, action) {
  const ids = [...selected.value]
  if (action === 'delete' && !confirm(`¿Borrar ${ids.length} cosa(s) del catálogo? No se puede deshacer.`)) return
  try {
    await api.bulk(ids, patch, action)
    toast(action === 'delete' ? 'Borrado.' : 'Hecho.')
    load()
  } catch (e) { toast(e.message, 'error') }
}
const stars = (r) => (r == null ? '—' : `${r}/10`)
const reviewState = (it) => it.meta?.import?.match?.estado
</script>

<template>
  <div>
    <header class="view-head">
      <div>
        <p class="eyebrow">Bodega</p>
        <h1 class="page-title">Catálogo</h1>
      </div>
      <div class="actions">
        <RouterLink :to="{ path: '/catalogo/nuevo', query: f.kind ? { kind: f.kind } : {} }" class="btn btn-primary"><AppIcon name="plus" :size="16" /> Añadir</RouterLink>
      </div>
    </header>

    <div class="chips">
      <button class="chip" :class="{ active: !f.kind }" @click="f.kind = ''">Todo</button>
      <button v-if="f.tag" class="chip active" @click="f.tag = ''"><AppIcon name="tag" :size="14" /> {{ f.tag }} <AppIcon name="close" :size="12" /></button>
      <button v-for="(k, key) in KINDS" :key="key" class="chip" :class="{ active: f.kind === key }" @click="f.kind = key">
        <AppIcon :name="k.icon" :size="14" /> {{ k.label }}
      </button>
    </div>

    <div class="toolbar-row">
      <input v-model="f.q" class="input grow" type="search" placeholder="Buscar por título, autor, director…" />
      <select v-model="f.status" class="select">
        <option value="">Cualquier estado</option>
        <option v-for="(label, key) in STATUSES" :key="key" :value="key">{{ label }}</option>
      </select>
      <select v-model="f.hidden" class="select">
        <option value="">Visibles y ocultos</option>
        <option value="false">Solo visibles</option>
        <option value="true">Solo ocultos</option>
      </select>
      <select v-model="f.sort" class="select">
        <option value="title">Título A-Z</option>
        <option value="-updated">Tocados hace poco</option>
        <option value="-created">Añadidos hace poco</option>
        <option value="-rating">Mejor nota</option>
        <option value="-year">Más recientes (año)</option>
        <option value="year">Más antiguos (año)</option>
        <option value="-finished">Terminados hace poco</option>
      </select>
    </div>

    <div v-if="selected.size" class="panel panel-pad bulk">
      <span class="readout"><strong>{{ selected.size }}</strong> seleccionadas</span>
      <button class="btn btn-sm" @click="bulk({ hidden: true })"><AppIcon name="eye-off" :size="14" /> Ocultar</button>
      <button class="btn btn-sm" @click="bulk({ hidden: false })"><AppIcon name="eye" :size="14" /> Mostrar</button>
      <button class="btn btn-sm" @click="bulk({ featured: true })"><AppIcon name="star" :size="14" /> Destacar</button>
      <button class="btn btn-sm" @click="bulk({ featured: false })">Quitar destacado</button>
      <button class="btn btn-sm btn-danger" @click="bulk(null, 'delete')"><AppIcon name="trash" :size="14" /> Borrar</button>
    </div>

    <section class="panel table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th><input type="checkbox" class="check" :checked="allChecked" aria-label="Seleccionar todo" @change="toggleAll" /></th>
            <th></th>
            <th>Título</th>
            <th class="hide-sm">Tipo</th>
            <th class="hide-sm">Autoría</th>
            <th class="num hide-sm">Año</th>
            <th class="num">Nota</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in data.items" :key="it.id" :class="{ 'is-hidden': it.hidden }">
            <td><input type="checkbox" :checked="selected.has(it.id)" :aria-label="`Seleccionar ${it.title}`" @change="toggle(it.id)" /></td>
            <td><Cover :item="it" /></td>
            <td>
              <RouterLink :to="`/catalogo/${it.id}`" class="row-title">{{ it.title }}</RouterLink>
              <AppIcon v-if="it.featured" name="star" :size="13" style="color: var(--amber); margin-left: 6px" />
              <AppIcon v-if="it.hidden" name="eye-off" :size="13" style="margin-left: 6px" />
              <span v-if="reviewState(it) && reviewState(it) !== 'ok'" class="pill pill-warn" style="margin-left: 6px">{{ reviewState(it) }}</span>
              <div v-if="it.tags.length" class="muted" style="font-size: 12px">{{ it.tags.map((t) => t.name).join(' · ') }}</div>
            </td>
            <td class="muted hide-sm">{{ KINDS[it.kind].one }}</td>
            <td class="muted hide-sm">{{ it.creator || '—' }}</td>
            <td class="num muted hide-sm">{{ it.year || '—' }}</td>
            <td class="num">{{ stars(it.rating) }}</td>
            <td><span class="pill" :class="{ 'pill-ok': it.status === 'done' }">{{ STATUSES[it.status] }}</span></td>
          </tr>
          <tr v-if="!loading && !data.items.length"><td colspan="8" class="empty">Nada por aquí con esos filtros.</td></tr>
        </tbody>
      </table>
    </section>
    <Pager :total="data.total" :limit="LIMIT" :offset="f.offset" @go="(o) => { f.offset = o; sync() }" />
  </div>
</template>

<style scoped>
.bulk {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 12px 16px;
  margin-bottom: 12px;
}
</style>
