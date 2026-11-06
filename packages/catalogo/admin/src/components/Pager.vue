<script setup>
import { computed } from 'vue'
const props = defineProps({ total: Number, limit: Number, offset: Number })
const emit = defineEmits(['go'])
const page = computed(() => Math.floor(props.offset / props.limit) + 1)
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.limit)))
</script>

<template>
  <div class="pager">
    <span class="readout">{{ total.toLocaleString('es-ES') }} en total · página {{ page }} de {{ pages }}</span>
    <div class="actions">
      <button class="btn btn-sm" :disabled="page <= 1" @click="emit('go', offset - limit)">Anterior</button>
      <button class="btn btn-sm" :disabled="page >= pages" @click="emit('go', offset + limit)">Siguiente</button>
    </div>
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  gap: 8px;
}
</style>
