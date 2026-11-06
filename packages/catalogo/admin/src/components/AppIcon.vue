<script setup>
// Iconos propios en SVG de trazo, sin librerías externas.
import { PATHS } from '../icons.js'
defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 18 },
})

</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="PATHS[name] || PATHS.sparkle" />
  </svg>
</template>

<style scoped>
.icon {
  flex: none;
  display: inline-block;
  vertical-align: middle;
}
</style>
