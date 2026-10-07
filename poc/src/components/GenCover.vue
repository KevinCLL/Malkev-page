<script setup>
// Portada: la imagen real si existe; si no, una generada a partir del título y el color.
import { computed, ref, watch } from 'vue'
import { fallbackColor, isLight, seeded, shade, KIND_LABELS } from '../util.js'

const props = defineProps({
  item: { type: Object, required: true },
  ratio: { type: String, default: '2 / 3' },
  showText: { type: Boolean, default: true },
})

const failed = ref(false)
watch(() => props.item.cover_url, () => { failed.value = false })

const color = computed(() => props.item.color || fallbackColor(props.item.title))
const light = computed(() => isLight(color.value))
const style = computed(() => {
  const s = (salt) => seeded(props.item.title, salt)
  const c = color.value
  return {
    aspectRatio: props.ratio,
    '--c': c,
    '--c-dark': shade(c, -0.55),
    '--c-light': shade(c, 0.35),
    '--ink': light.value ? '#1a1030' : '#fbf8ff',
    '--px': `${15 + s('x') * 70}%`,
    '--py': `${12 + s('y') * 45}%`,
    '--pr': `${22 + s('r') * 30}%`,
    '--angle': `${Math.round(s('a') * 360)}deg`,
  }
})
</script>

<template>
  <div class="cover" :style="style">
    <img v-if="item.cover_url && !failed" :src="item.cover_url" :alt="`Portada de ${item.title}`" loading="lazy" @error="failed = true" />
    <div v-else class="gen">
      <div class="planet"></div>
      <div class="rings"></div>
      <div v-if="showText" class="gen-text">
        <span class="gen-kind">{{ KIND_LABELS[item.kind] }}</span>
        <strong class="gen-title">{{ item.title }}</strong>
        <span class="gen-creator">{{ item.creator }}<template v-if="item.year"> · {{ item.year }}</template></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cover {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: inherit;
  background: var(--c-dark);
}
img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gen {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 90% at 50% 0%, var(--c-light) 0%, transparent 55%),
    linear-gradient(var(--angle), var(--c-dark), var(--c));
}
.planet {
  position: absolute;
  left: var(--px);
  top: var(--py);
  width: var(--pr);
  aspect-ratio: 1;
  translate: -50% -50%;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 30%, var(--c-light), var(--c) 45%, var(--c-dark) 100%);
  box-shadow: 0 0 40px rgba(255, 255, 255, 0.12);
}
.rings {
  position: absolute;
  left: var(--px);
  top: var(--py);
  width: calc(var(--pr) * 1.9);
  aspect-ratio: 3 / 1;
  translate: -50% -50%;
  rotate: -18deg;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.28);
}
.gen-text {
  position: absolute;
  inset: auto 0 0;
  padding: 12% 9% 9%;
  display: grid;
  gap: 4px;
  color: var(--ink);
  background: linear-gradient(0deg, color-mix(in srgb, var(--c-dark) 75%, transparent), transparent);
}
.gen-kind {
  font-family: var(--font-mono);
  font-size: 0.62em;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  opacity: 0.75;
}
.gen-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1em;
  line-height: 1.15;
  letter-spacing: 0.03em;
  overflow-wrap: anywhere;
}
.gen-creator {
  font-size: 0.72em;
  opacity: 0.8;
}
</style>
