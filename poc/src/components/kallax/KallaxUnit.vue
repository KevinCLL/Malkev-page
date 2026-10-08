<script setup>
// Una Kallax entera: lo que hay encima, la rejilla de cubos (con los huecos unidos) y las ruedas.
import { computed } from 'vue'
import { BOARD, FRAME, furnitureWidth, groupSize } from '../../kallax.js'
import KallaxCell from './KallaxCell.vue'
import KallaxGroup from './KallaxGroup.vue'

const props = defineProps({
  furniture: { type: Object, required: true },
  items: { type: Map, required: true },
  mark: { type: Function, required: true },
  unit: { type: Number, required: true },
})
const emit = defineEmits(['pick', 'zoom'])

const u = (v) => `calc(var(--u) * ${Number(v.toFixed(4))})`
const layout = computed(() => props.furniture.layout)
const width = computed(() => furnitureWidth(props.furniture))
const topHeight = computed(() => Math.max(0.2, ...layout.value.top.map((g) => groupSize(g).h)) + 0.04)
const top = computed(() => ({ top: true, groups: layout.value.top }))

const bodyStyle = computed(() => ({
  gridTemplateColumns: `repeat(${props.furniture.cols}, var(--u))`,
  gridTemplateRows: `repeat(${props.furniture.rows}, var(--u))`,
  gap: u(BOARD),
  padding: u(FRAME),
}))

const label = (c) => {
  const rows = c.rows > 1 ? `filas ${c.row}–${c.row + c.rows - 1}` : `fila ${c.row}`
  const cols = c.cols > 1 ? `columnas ${c.col}–${c.col + c.cols - 1}` : `columna ${c.col}`
  return `${rows}, ${cols}`
}
</script>

<template>
  <section class="unit" :style="{ '--u': `${unit}px`, width: u(width) }" :aria-label="furniture.name">
    <!-- Los huecos no son <button> porque dentro van las cajas, que sí lo son. -->
    <div
      class="top"
      role="button"
      tabindex="0"
      :style="{ height: u(topHeight) }"
      :aria-label="`Ver de cerca lo que hay encima de la ${furniture.name}`"
      @click="emit('zoom', furniture, top)"
      @keydown.enter.self.prevent="emit('zoom', furniture, top)"
    >
      <KallaxGroup v-for="(g, i) in layout.top" :key="i" :group="g" :items="items" :mark="mark" @pick="(it) => emit('pick', it, furniture, top)" />
    </div>
    <div class="body" :style="bodyStyle">
      <div
        v-for="c in layout.cubes"
        :key="`${c.row}-${c.col}`"
        class="slot"
        :class="{ vacant: !c.tiers.flat().length }"
        :style="{ gridRow: `${c.row} / span ${c.rows}`, gridColumn: `${c.col} / span ${c.cols}` }"
        role="button"
        tabindex="0"
        :aria-label="`Ver de cerca: ${label(c)}`"
        @click="emit('zoom', furniture, c)"
        @keydown.enter.self.prevent="emit('zoom', furniture, c)"
      >
        <span class="led" aria-hidden="true"></span>
        <KallaxCell :cell="c" :items="items" :mark="mark" @pick="(it) => emit('pick', it, furniture, c)" />
      </div>
    </div>
    <div class="wheels" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
    <h2 class="unit-name readout">{{ furniture.name }}</h2>
  </section>
</template>

<style scoped>
.unit {
  position: relative;
  flex: none;
}
.unit-name {
  margin: 14px 0 0;
  text-align: center;
}
.top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  width: 100%;
  cursor: zoom-in;
}
.body {
  display: grid;
  border-radius: calc(var(--u) * 0.03);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.07), transparent 40%),
    linear-gradient(180deg, #2a1d4d, #1b1235);
  box-shadow:
    0 50px 80px -40px rgba(0, 0, 0, 0.95),
    0 0 0 1px rgba(201, 182, 255, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
.slot {
  position: relative;
  display: flex;
  align-items: flex-end;
  border-radius: calc(var(--u) * 0.015);
  cursor: zoom-in;
  background:
    radial-gradient(90% 60% at 50% 0%, rgba(161, 132, 255, 0.18), transparent 70%),
    linear-gradient(180deg, #0b0718, #120b26);
  box-shadow: inset 0 calc(var(--u) * 0.08) calc(var(--u) * 0.2) rgba(0, 0, 0, 0.75), inset 0 -1px 0 rgba(255, 255, 255, 0.05);
}
.slot:focus-visible,
.top:focus-visible {
  outline: 2px solid var(--violet);
  outline-offset: 2px;
}
.slot.vacant {
  cursor: default;
}
.led {
  position: absolute;
  top: 0;
  left: 14%;
  right: 14%;
  height: 2px;
  border-radius: 2px;
  background: var(--lavender);
  box-shadow: 0 0 12px 2px rgba(161, 132, 255, 0.6);
  opacity: 0.7;
  z-index: 7;
}
.wheels {
  display: flex;
  justify-content: space-between;
  padding: 0 6%;
}
.wheels span {
  width: calc(var(--u) * 0.12);
  height: calc(var(--u) * 0.12);
  margin-top: 2px;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #6a5a8a, #1b1235 70%);
}
</style>
