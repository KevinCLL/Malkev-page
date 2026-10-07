<script setup>
// Reparte objetos de distinto ancho en baldas que caben en el ancho disponible.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  items: { type: Array, required: true },
  widthOf: { type: Function, required: true },
  gap: { type: Number, default: 3 },
  padding: { type: Number, default: 36 },
})

const root = ref(null)
const width = ref(1000)
let observer

onMounted(() => {
  observer = new ResizeObserver(([entry]) => { width.value = entry.contentRect.width })
  observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())

const rows = computed(() => {
  const max = Math.max(120, width.value - props.padding * 2)
  const out = [[]]
  let used = 0
  for (const item of props.items) {
    const w = props.widthOf(item) + props.gap
    if (used + w > max && out[out.length - 1].length) {
      out.push([])
      used = 0
    }
    out[out.length - 1].push(item)
    used += w
  }
  return out
})
</script>

<template>
  <div ref="root" class="shelf-rows">
    <slot v-for="(row, i) in rows" :key="i" name="row" :row="row" :index="i" />
  </div>
</template>
