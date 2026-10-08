<script setup>
// Una caja o un libro de la Kallax: tumbada (lomo horizontal), de pie (lomo vertical) o de frente (portada).
import { computed } from 'vue'
import { fallbackColor, isLight, seeded, shade } from '../../util.js'
import GenCover from '../GenCover.vue'

const props = defineProps({
  entry: { type: Object, required: true },
  item: { type: Object, required: true },
  how: { type: String, default: 'lying' },
  state: { type: String, default: '' },
  // En la vista general las cajas solo se miran (el clic acerca el cubo); en la vista de cerca se pueden abrir.
  interactive: { type: Boolean, default: false },
})
const emit = defineEmits(['pick'])

function onClick(e) {
  if (!props.interactive) return
  e.stopPropagation()
  emit('pick', props.item)
}

const pose = computed(() => (props.entry.face ? 'face' : props.entry.upright ? 'upright' : props.how))
const u = (v) => `calc(var(--u) * ${Number(v.toFixed(4))})`

const style = computed(() => {
  const { w, h } = props.entry
  const c = props.item.color || fallbackColor(props.item.title)
  const thick = pose.value === 'upright' ? w : h
  return {
    width: u(w),
    height: u(h),
    '--c': c,
    '--c-dark': shade(c, -0.42),
    '--c-light': shade(c, 0.24),
    '--jitter': u(pose.value === 'lying' ? (seeded(props.item.title, 'j') - 0.5) * 0.04 : 0),
    // Umbral más bajo que en el resto de la web: en lomos tan finos el texto oscuro se lee mejor.
    color: isLight(c, 0.52) ? '#1a1030' : '#f6f2ff',
    fontSize: u(pose.value === 'face' ? Math.min(w * 0.11, 0.09) : Math.min(thick * 0.52, 0.072)),
  }
})
</script>

<template>
  <component
    :is="interactive ? 'button' : 'span'"
    class="box"
    :class="[pose, item.kind, state, { tilt: entry.tilt, interactive }]"
    :style="style"
    :title="item.title"
    @click="onClick"
  >
    <GenCover v-if="pose === 'face'" :item="item" :ratio="`${entry.w} / ${entry.h}`" />
    <span v-else class="spine">{{ item.title }}</span>
    <span v-if="item.meta?.postit" class="postit" aria-hidden="true"></span>
    <span v-if="item.meta?.dot" class="dot" aria-hidden="true"></span>
  </component>
</template>

<style scoped>
.box {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0;
  border: none;
  border-radius: calc(var(--u) * 0.008);
  overflow: hidden;
  translate: var(--jitter) 0;
  background: linear-gradient(180deg, var(--c-light) 0%, var(--c) 16%, var(--c) 72%, var(--c-dark) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 1px 0 rgba(0, 0, 0, 0.55);
  transition: transform 0.35s var(--ease), filter 0.3s, opacity 0.3s;
}
.spine {
  display: block;
  max-width: 100%;
  padding: 0 7%;
  font-family: var(--font-body);
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
}
.upright {
  justify-content: center;
  background: linear-gradient(90deg, var(--c-dark) 0%, var(--c) 18%, var(--c) 78%, var(--c-light) 100%);
}
.upright .spine {
  writing-mode: vertical-rl;
  max-height: 100%;
  padding: 8% 0;
}
/* Los libros de rol: lomo con dos bandas, como los de tapa dura. */
.rpg.upright::before,
.rpg.upright::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 2%;
  background: rgba(255, 255, 255, 0.22);
}
.rpg.upright::before { top: 6%; }
.rpg.upright::after { bottom: 6%; }
.rpg.upright .spine {
  text-transform: none;
  font-weight: 600;
  padding: 14% 0;
}
.face {
  display: block;
  box-shadow: 0 10px 16px -8px rgba(0, 0, 0, 0.9), 3px 0 0 rgba(0, 0, 0, 0.35);
}
.face :deep(.cover) {
  height: 100%;
}
.tilt {
  rotate: -9deg;
  transform-origin: bottom right;
}
.postit {
  position: absolute;
  right: 4%;
  top: 50%;
  translate: 0 -50%;
  width: calc(var(--u) * 0.09);
  height: min(80%, calc(var(--u) * 0.09));
  background: #ffe678;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  rotate: 4deg;
}
.upright .postit {
  top: 12%;
  right: 50%;
  translate: 50% 0;
  width: 70%;
  height: calc(var(--u) * 0.09);
}
.dot {
  position: absolute;
  left: 3%;
  bottom: 12%;
  width: calc(var(--u) * 0.035);
  height: calc(var(--u) * 0.035);
  border-radius: 50%;
  background: #ffb347;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
}
.interactive {
  cursor: pointer;
}
.box:hover,
.box:focus-visible {
  transform: translateY(-3%) scale(1.03);
  filter: brightness(1.25) drop-shadow(0 0 8px rgba(161, 132, 255, 0.7));
  z-index: 4;
}
.lying:hover,
.lying:focus-visible {
  transform: translateX(5%);
}
.dim {
  opacity: 0.16;
  filter: grayscale(0.8);
}
.lit {
  z-index: 3;
  filter: brightness(1.15);
  box-shadow: 0 0 0 calc(var(--u) * 0.012) var(--lavender), 0 0 calc(var(--u) * 0.08) rgba(161, 132, 255, 0.9);
}
</style>
