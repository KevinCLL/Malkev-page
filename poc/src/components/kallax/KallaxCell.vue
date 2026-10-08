<script setup>
// El interior de un hueco de la Kallax: sus baldas (si lleva organizador), las barras de apoyo
// y lo que está delante de todo.
import { computed } from 'vue'
import { PLANK, span, tierHeights, tiersWidth, inFront } from '../../kallax.js'
import KallaxGroup from './KallaxGroup.vue'
import KallaxDeco from './KallaxDeco.vue'

const props = defineProps({
  cell: { type: Object, required: true },
  items: { type: Map, required: true },
  mark: { type: Function, required: true },
  interactive: { type: Boolean, default: false },
})
const emit = defineEmits(['pick'])

const u = (v) => `calc(var(--u) * ${Number(v.toFixed(4))})`
const sizeOf = (e) => e
const heights = computed(() => tierHeights(props.cell))
const front = computed(() => props.cell.tiers.flat().filter(inFront))
</script>

<template>
  <div class="cell" :class="{ organizer: cell.organizer }" :style="{ width: u(span(cell.cols)), height: u(span(cell.rows)) }">
    <div class="tiers" :style="{ width: u(tiersWidth(cell, sizeOf)) }">
      <template v-for="(tier, t) in cell.tiers" :key="t">
        <div v-if="t > 0" class="plank" :style="{ height: u(PLANK) }"></div>
        <div class="tier" :style="{ height: u(heights[t]) }">
          <KallaxGroup v-for="(g, i) in tier.filter((x) => !inFront(x))" :key="i" :group="g" :items="items" :mark="mark" :interactive="interactive" @pick="emit('pick', $event)" />
        </div>
      </template>
    </div>
    <div v-if="cell.aside" class="aside">
      <KallaxGroup :group="cell.aside" :items="items" :mark="mark" :interactive="interactive" @pick="emit('pick', $event)" />
    </div>
    <div v-if="front.length" class="front">
      <KallaxDeco v-for="(g, i) in front" :key="i" :deco="g.items[0]" />
    </div>
    <span v-for="(r, i) in cell.rods" :key="`rod${i}`" class="rod" :style="{ left: `${r * 100}%` }" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.cell {
  position: relative;
  display: flex;
  align-items: flex-end;
}
.tiers {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.tier {
  display: flex;
  align-items: flex-end;
  justify-content: space-evenly;
  flex: none;
}
.organizer .tiers {
  padding: 0 calc(var(--u) * 0.015);
  border-left: calc(var(--u) * 0.02) solid #9a6a42;
  border-right: calc(var(--u) * 0.02) solid #9a6a42;
  background: rgba(154, 106, 66, 0.12);
  box-sizing: border-box;
}
.plank {
  flex: none;
  margin: 0 calc(var(--u) * -0.015);
  background: linear-gradient(180deg, #b07d50, #7a5030);
}
.aside {
  flex: none;
  margin-left: auto;
  display: flex;
  align-items: flex-end;
}
.front {
  position: absolute;
  left: 2%;
  bottom: -2%;
  display: flex;
  align-items: flex-end;
  gap: 4%;
  z-index: 5;
}
.rod {
  position: absolute;
  top: 0;
  bottom: 0;
  width: calc(var(--u) * 0.04);
  translate: -50% 0;
  border-radius: calc(var(--u) * 0.02);
  background: linear-gradient(90deg, #3a2414, #8a5a36 45%, #4a2e1a);
  box-shadow: 0 0 calc(var(--u) * 0.03) rgba(0, 0, 0, 0.6);
  z-index: 6;
  pointer-events: none;
}
</style>
