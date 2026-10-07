<script setup>
defineProps({ value: { type: Number, default: null } })
</script>

<template>
  <div v-if="value !== null && value !== undefined" class="rating" :aria-label="`Nota: ${value} de 10`" role="img">
    <span v-for="i in 10" :key="i" class="seg" :class="{ on: i <= value }"></span>
    <span class="num">{{ value }}<small>/10</small></span>
  </div>
</template>

<style scoped>
.rating {
  display: flex;
  align-items: center;
  gap: 3px;
}
.seg {
  width: 14px;
  height: 6px;
  border-radius: 3px;
  background: rgba(201, 182, 255, 0.14);
}
.seg.on {
  background: linear-gradient(90deg, var(--violet), var(--orchid));
  box-shadow: 0 0 8px rgba(161, 132, 255, 0.5);
}
.num {
  margin-left: 10px;
  font-family: var(--font-mono);
  color: var(--lavender);
}
.num small {
  color: var(--muted);
}
</style>
