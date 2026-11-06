<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api.js'
import { toast } from '../toast.js'
import AppIcon from '../components/AppIcon.vue'

const tags = ref([])
const q = ref('')
const newName = ref('')
const editing = ref(null)
const mergeInto = ref('')

const load = async () => { try { tags.value = (await api.tags()).tags } catch (e) { toast(e.message, 'error') } }
onMounted(load)
const shown = computed(() => tags.value.filter((t) => !q.value || t.name.toLowerCase().includes(q.value.toLowerCase())))

async function create() {
  if (!newName.value.trim()) return
  try { await api.createTag({ name: newName.value.trim() }); newName.value = ''; load() } catch (e) { toast(e.message, 'error') }
}
function edit(t) { editing.value = { ...t }; mergeInto.value = '' }
async function save() {
  try { await api.updateTag(editing.value.id, editing.value); editing.value = null; toast('Etiqueta guardada.'); load() } catch (e) { toast(e.message, 'error') }
}
async function merge() {
  const into = tags.value.find((t) => t.id === Number(mergeInto.value))
  if (!into || !confirm(`¿Fusionar «${editing.value.name}» dentro de «${into.name}»? La primera desaparece.`)) return
  try { await api.mergeTag(editing.value.id, into.id); editing.value = null; toast('Fusionadas.'); load() } catch (e) { toast(e.message, 'error') }
}
async function remove(t) {
  if (!confirm(`¿Borrar la etiqueta «${t.name}»? Se quita de ${t.item_count} cosas y ${t.post_count} entradas.`)) return
  try { await api.deleteTag(t.id); load() } catch (e) { toast(e.message, 'error') }
}
</script>

<template>
  <div>
    <header class="view-head">
      <div>
        <p class="eyebrow">Compartidas por catálogo y bitácora</p>
        <h1 class="page-title">Etiquetas</h1>
      </div>
    </header>
    <div class="toolbar-row">
      <input v-model="q" class="input grow" type="search" placeholder="Buscar etiqueta…" />
      <form class="toolbar-row" style="margin: 0" @submit.prevent="create">
        <input v-model="newName" class="input" placeholder="Nueva etiqueta" />
        <button class="btn"><AppIcon name="plus" :size="15" /> Crear</button>
      </form>
    </div>
    <section class="panel table-wrap">
      <table class="table">
        <thead><tr><th>Nombre</th><th>Slug</th><th class="num">Cosas</th><th class="num">Entradas</th><th></th></tr></thead>
        <tbody>
          <tr v-for="t in shown" :key="t.id">
            <td><span class="chip" :style="t.color ? { borderColor: t.color, color: t.color } : {}">{{ t.name }}</span></td>
            <td class="mono muted">{{ t.slug }}</td>
            <td class="num"><RouterLink :to="{ path: '/catalogo', query: { tag: t.slug } }" class="muted">{{ t.item_count }}</RouterLink></td>
            <td class="num"><RouterLink :to="{ path: '/bitacora', query: { tag: t.slug } }" class="muted">{{ t.post_count }}</RouterLink></td>
            <td style="text-align: right; white-space: nowrap">
              <button class="btn btn-sm btn-ghost" @click="edit(t)"><AppIcon name="edit" :size="14" /> Editar</button>
              <button class="btn btn-sm btn-ghost" @click="remove(t)"><AppIcon name="trash" :size="14" /></button>
            </td>
          </tr>
          <tr v-if="!shown.length"><td colspan="5" class="empty">No hay etiquetas.</td></tr>
        </tbody>
      </table>
    </section>

    <div v-if="editing" class="modal-back" @click.self="editing = null">
      <form class="panel panel-pad modal" style="display: grid; gap: 12px" @submit.prevent="save">
        <h2 class="section-title">Editar etiqueta</h2>
        <label class="field"><span>Nombre</span><input v-model="editing.name" class="input" required /></label>
        <label class="field"><span>Slug</span><input v-model="editing.slug" class="input mono" /></label>
        <label class="field"><span>Color</span>
          <div style="display: flex; gap: 8px">
            <input :value="editing.color || '#a184ff'" type="color" @input="editing.color = $event.target.value" />
            <input v-model="editing.color" class="input mono" placeholder="sin color" />
          </div>
        </label>
        <div style="display: flex; gap: 8px; justify-content: flex-end">
          <button type="button" class="btn btn-ghost" @click="editing = null">Cancelar</button>
          <button class="btn btn-primary">Guardar</button>
        </div>
        <h2 class="section-title" style="margin-top: 8px">Fusionar con otra</h2>
        <div style="display: flex; gap: 8px">
          <select v-model="mergeInto" class="select" style="flex: 1">
            <option value="">Elige la etiqueta que se queda…</option>
            <option v-for="t in tags.filter((x) => x.id !== editing.id)" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <button type="button" class="btn" :disabled="!mergeInto" @click="merge">Fusionar</button>
        </div>
      </form>
    </div>
  </div>
</template>
