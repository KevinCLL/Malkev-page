<script setup>
// Buscador de cosas del catálogo para añadirlas a una colección o enlazarlas a una entrada.
import { ref, watch } from 'vue'
import { api, KINDS } from '../api.js'
import Cover from './Cover.vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({ kinds: { type: Array, default: () => [] }, exclude: { type: Array, default: () => [] }, placeholder: { type: String, default: 'Buscar en el catálogo…' } })
const emit = defineEmits(['pick'])
const q = ref('')
const results = ref([])
let timer = 0

watch(q, (value) => {
  clearTimeout(timer)
  if (value.trim().length < 2) { results.value = []; return }
  timer = setTimeout(async () => {
    try {
      const { items } = await api.items({ q: value.trim(), kind: props.kinds, limit: 12 })
      results.value = items
    } catch { results.value = [] }
  }, 220)
})

function pick(item) {
  emit('pick', item)
  q.value = ''
  results.value = []
}
</script>

<template>
  <div class="picker">
    <div class="search">
      <AppIcon name="search" :size="16" />
      <input v-model="q" class="input" :placeholder="placeholder" @keydown.esc="q = ''" />
    </div>
    <ul v-if="results.length" class="results panel">
      <li v-for="it in results" :key="it.id">
        <button type="button" :disabled="exclude.includes(it.id)" @click="pick(it)">
          <Cover :item="it" :size="26" />
          <span class="t">{{ it.title }}<small class="muted"> · {{ KINDS[it.kind].one }}{{ it.year ? ` · ${it.year}` : '' }}</small></span>
          <span v-if="exclude.includes(it.id)" class="readout">ya está</span>
          <AppIcon v-else name="plus" :size="16" />
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.picker {
  position: relative;
}
.search {
  position: relative;
}
.search .icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
}
.search .input {
  padding-left: 40px;
}
.results {
  position: absolute;
  z-index: 30;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  list-style: none;
  margin: 0;
  padding: 6px;
  max-height: 360px;
  overflow: auto;
  background: var(--hull-solid);
}
.results button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  background: none;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}
.results button:hover:not(:disabled) {
  background: rgba(161, 132, 255, 0.14);
}
.results button:disabled {
  opacity: 0.5;
  cursor: default;
}
.t {
  flex: 1;
  min-width: 0;
}
</style>
