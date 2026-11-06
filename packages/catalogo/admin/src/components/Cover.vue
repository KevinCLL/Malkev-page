<script setup>
// Portada en miniatura; si no hay imagen, una tapa generada con el color de la cosa y sus iniciales.
import { computed, ref } from 'vue'
const props = defineProps({ item: { type: Object, required: true }, size: { type: Number, default: 34 } })
const broken = ref(false)
const initials = computed(() => props.item.title.split(/\s+/).filter((w) => /\w/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase())
const bg = computed(() => props.item.color || `hsl(${[...props.item.title].reduce((a, c) => a + c.charCodeAt(0), 0) % 360} 35% 32%)`)
const style = computed(() => ({ width: `${props.size}px`, height: `${Math.round(props.size * 1.4)}px`, fontSize: `${Math.max(11, Math.round(props.size * 0.3))}px` }))
</script>

<template>
  <img v-if="item.cover_url && !broken" :src="item.cover_url" :style="style" class="thumb" alt="" loading="lazy" referrerpolicy="no-referrer" @error="broken = true" />
  <span v-else class="thumb gen" :style="{ ...style, background: bg }">{{ initials }}</span>
</template>
