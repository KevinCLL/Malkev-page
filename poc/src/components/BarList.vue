<script setup>
// Una lista de barras horizontales para una sola serie (contar cosas por década, por nota, por
// máquina…): etiqueta, barra fina con el extremo redondeado y el valor al final.
const props = defineProps({
  rows: { type: Array, required: true }, // [{ label, value, hint? }]
  format: { type: Function, default: (v) => v.toLocaleString('es-ES') },
})
</script>

<template>
  <ol class="bars">
    <li v-for="row in rows" :key="row.label" class="bar-row" :title="row.hint || `${row.label}: ${format(row.value)}`">
      <span class="bar-label">{{ row.label }}</span>
      <span class="bar-track"><span class="bar" :style="{ width: `${(row.value / Math.max(1, ...rows.map((r) => r.value))) * 100}%` }"></span></span>
      <span class="bar-value">{{ format(row.value) }}</span>
    </li>
  </ol>
</template>

<style scoped>
.bars {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.bar-row {
  display: grid;
  grid-template-columns: minmax(64px, 30%) 1fr auto;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.bar-label {
  color: var(--text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar-track {
  height: 14px;
  display: flex;
}
.bar {
  height: 100%;
  min-width: 2px;
  border-radius: 0 4px 4px 0;
  background: var(--violet);
  transition: width 0.6s var(--ease);
}
.bar-value {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  min-width: 2.5ch;
  text-align: right;
}
</style>
