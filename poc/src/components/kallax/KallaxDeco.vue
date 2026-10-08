<script setup>
// Lo que hay en la Kallax y no es un juego: la tele, peluches, estuches, la casita de pájaros…
import { computed } from 'vue'
import { shade } from '../../util.js'

const props = defineProps({ deco: { type: Object, required: true } })
const u = (v) => `calc(var(--u) * ${v})`
const style = computed(() => ({
  width: u(props.deco.w),
  height: u(props.deco.h),
  '--d': props.deco.color || '#3a2f5a',
  '--d-dark': shade(props.deco.color || '#3a2f5a', -0.45),
  '--d-light': shade(props.deco.color || '#3a2f5a', 0.3),
}))
</script>

<template>
  <div class="deco" :class="`d-${deco.deco}`" :style="style" :title="deco.label || undefined" :aria-label="deco.label || undefined" :role="deco.label ? 'img' : undefined">
    <svg v-if="deco.deco === 'tv'" viewBox="0 0 164 190" preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id="tv-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#d9dbe3" /><stop offset="1" stop-color="#8d909c" />
        </linearGradient>
        <linearGradient id="tv-screen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#2b2f45" /><stop offset="0.55" stop-color="#121424" /><stop offset="1" stop-color="#1d2238" />
        </linearGradient>
      </defs>
      <!-- Balda con las gafas de realidad virtual -->
      <rect x="-12" y="46" width="188" height="6" class="plank" />
      <path d="M36 44c0-12 10-18 22-18s20 6 20 14v4z" class="vr" />
      <path d="M40 30c-6-14 12-22 28-18 14 4 22 14 16 26" class="cable" />
      <path d="M92 44c4-10 16-12 24-6l8 6z M118 44c2-8 14-10 20-4l4 4z" class="vr" />
      <!-- La tele de tubo -->
      <rect x="8" y="60" width="148" height="128" rx="8" fill="url(#tv-body)" />
      <rect x="20" y="70" width="112" height="94" rx="10" fill="url(#tv-screen)" />
      <path d="M28 76 L70 76 L40 150 L28 150 Z" class="glare" />
      <rect x="138" y="72" width="10" height="90" rx="3" class="speaker" />
      <rect x="64" y="172" width="36" height="5" rx="2" class="brand" />
    </svg>

    <svg v-else-if="deco.deco === 'plush'" viewBox="0 0 100 120" preserveAspectRatio="xMidYMax meet">
      <path d="M22 30 L30 6 L42 24 Z M78 30 L70 6 L58 24 Z" class="fill" />
      <ellipse cx="50" cy="40" rx="30" ry="25" class="fill" />
      <path d="M24 70 C24 54 76 54 76 70 L80 112 C64 120 36 120 20 112 Z" class="fill" />
      <ellipse cx="50" cy="88" rx="16" ry="20" class="belly" />
      <circle cx="40" cy="38" r="4" class="eye" /><circle cx="60" cy="38" r="4" class="eye" />
      <path d="M45 48 Q50 52 55 48" class="mouth" />
    </svg>

    <svg v-else-if="deco.deco === 'birdhouse'" viewBox="0 0 100 140" preserveAspectRatio="xMidYMax meet">
      <path d="M10 46 L50 8 L90 46 Z" class="wood-dark" />
      <rect x="18" y="44" width="64" height="94" class="wood" />
      <circle cx="50" cy="78" r="13" class="hole" />
      <rect x="47" y="98" width="6" height="14" class="wood-dark" />
    </svg>

    <svg v-else-if="deco.deco === 'organizer'" viewBox="0 0 100 30" preserveAspectRatio="none">
      <path d="M2 28 H98 M8 28 V8 M30 28 V4 M52 28 V10 M74 28 V2 M94 28 V12 M4 18 H98" class="mdf" />
    </svg>

    <svg v-else-if="deco.deco === 'pouch'" viewBox="0 0 100 60" preserveAspectRatio="none">
      <path d="M8 58 C2 30 20 14 40 14 L60 14 C80 14 98 30 92 58 Z" class="fill" />
      <path d="M30 16 C38 6 62 6 70 16" class="string" />
    </svg>

    <svg v-else-if="deco.deco === 'holders'" viewBox="0 0 60 100" preserveAspectRatio="xMidYMax meet">
      <path d="M4 98 V40 H24 V98 Z M30 98 V20 H56 V98 Z" class="grey" />
      <path d="M8 46 H20 M34 26 H52" class="grey-line" />
    </svg>

    <div v-else-if="deco.deco === 'papers' || deco.deco === 'boxes' || deco.deco === 'board'" class="sheets">
      <span></span><span></span><span></span>
    </div>

    <div v-else-if="deco.deco === 'case'" class="case"></div>
  </div>
</template>

<style scoped>
.deco {
  position: relative;
  flex: none;
  pointer-events: none;
}
.deco svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.d-gap {
  height: 1px;
}
.plank,
.wood {
  fill: #7a4a2c;
}
.wood {
  fill: #d8b884;
}
.wood-dark {
  fill: #b08a5a;
}
.hole {
  fill: #2a1a10;
}
.vr {
  fill: #121216;
}
.cable {
  fill: none;
  stroke: #121216;
  stroke-width: 2.5;
}
.glare {
  fill: rgba(255, 255, 255, 0.06);
}
.speaker {
  fill: rgba(0, 0, 0, 0.12);
}
.brand {
  fill: rgba(0, 0, 0, 0.2);
}
.fill {
  fill: var(--d);
}
.belly {
  fill: var(--d-light);
  opacity: 0.6;
}
.eye {
  fill: #fff;
}
.mouth,
.string {
  fill: none;
  stroke: var(--d-dark);
  stroke-width: 2.5;
  stroke-linecap: round;
}
.string {
  stroke: #e8e0ff;
  stroke-width: 2;
}
.mdf {
  fill: none;
  stroke: #c89a62;
  stroke-width: 2.4;
}
.grey {
  fill: #9a9aa6;
}
.grey-line {
  stroke: #6a6a76;
  stroke-width: 2;
}
.sheets {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  gap: 4%;
}
.sheets span {
  flex: 1;
  height: 100%;
  border-radius: 1px;
  background: linear-gradient(90deg, #d9d6e4, #f4f2fa);
  box-shadow: inset -1px 0 0 rgba(0, 0, 0, 0.15);
}
.sheets span:nth-child(2) {
  height: 92%;
}
.sheets span:nth-child(3) {
  height: 96%;
}
.d-board .sheets span:nth-child(n + 2) {
  display: none;
}
.case {
  position: absolute;
  inset: 0;
  border-radius: calc(var(--u) * 0.04);
  background: linear-gradient(180deg, var(--d-light), var(--d) 30%, var(--d-dark));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}
.case::after {
  content: '';
  position: absolute;
  left: 10%;
  right: 10%;
  top: 22%;
  border-top: 1px dashed rgba(255, 255, 255, 0.35);
}
</style>
