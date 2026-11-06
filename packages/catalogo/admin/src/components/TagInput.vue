<script setup>
// Etiquetas como fichas: Enter o coma para añadir, retroceso para quitar la última. Sugiere las existentes.
import { computed, onMounted, ref } from 'vue'
import { api } from '../api.js'
import AppIcon from './AppIcon.vue'

const model = defineModel({ type: Array, default: () => [] })
const text = ref('')
const all = ref([])
const listId = `tags-${Math.random().toString(36).slice(2, 8)}`

onMounted(async () => { try { all.value = (await api.tags()).tags } catch {} })
const suggestions = computed(() => all.value.filter((t) => !model.value.includes(t.name)).map((t) => t.name))

function add() {
  const parts = text.value.split(',').map((s) => s.trim()).filter(Boolean)
  for (const p of parts) if (!model.value.some((t) => t.toLowerCase() === p.toLowerCase())) model.value = [...model.value, p]
  text.value = ''
}
function onKey(e) {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
  else if (e.key === 'Backspace' && !text.value && model.value.length) model.value = model.value.slice(0, -1)
}
const remove = (t) => { model.value = model.value.filter((x) => x !== t) }
</script>

<template>
  <div class="tag-input input">
    <span v-for="t in model" :key="t" class="chip active">
      {{ t }}
      <button type="button" :aria-label="`Quitar ${t}`" @click="remove(t)"><AppIcon name="close" :size="12" /></button>
    </span>
    <input v-model="text" :list="listId" placeholder="Añadir etiqueta…" @keydown="onKey" @blur="add" />
    <datalist :id="listId"><option v-for="s in suggestions" :key="s" :value="s" /></datalist>
  </div>
</template>

<style scoped>
.tag-input {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-height: 44px;
  padding: 6px 8px;
}
.tag-input input {
  flex: 1 1 120px;
  border: none;
  background: none;
  outline: none;
  min-width: 100px;
  padding: 4px;
}
.chip button {
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  padding: 0 0 0 4px;
  display: inline-flex;
}
</style>
