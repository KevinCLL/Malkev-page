<script setup>
// La proa de la Malkevnia, vista desde el puente: asoma por la parte baja del ventanal,
// con las luces de posición (roja a babor, verde a estribor), el estroboscópico y el brillo del casco.
</script>

<template>
  <svg class="prow" viewBox="0 0 900 260" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <defs>
      <linearGradient id="hull" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2a2150" />
        <stop offset="0.35" stop-color="#171131" />
        <stop offset="1" stop-color="#07050f" />
      </linearGradient>
      <linearGradient id="hull-side" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="rgba(255,255,255,0.10)" />
        <stop offset="0.45" stop-color="rgba(255,255,255,0)" />
        <stop offset="1" stop-color="rgba(161,132,255,0.22)" />
      </linearGradient>
      <linearGradient id="strip" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="rgba(139,227,224,0)" />
        <stop offset="0.2" stop-color="#8be3e0" />
        <stop offset="0.8" stop-color="#8be3e0" />
        <stop offset="1" stop-color="rgba(139,227,224,0)" />
      </linearGradient>
      <radialGradient id="port" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ff8a9e" /><stop offset="0.4" stop-color="#ff3b5c" /><stop offset="1" stop-color="rgba(255,59,92,0)" />
      </radialGradient>
      <radialGradient id="starboard" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#b8ffd0" /><stop offset="0.4" stop-color="#3ddc84" /><stop offset="1" stop-color="rgba(61,220,132,0)" />
      </radialGradient>
      <radialGradient id="strobe" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff" /><stop offset="0.3" stop-color="#e6e0ff" /><stop offset="1" stop-color="rgba(230,224,255,0)" />
      </radialGradient>
    </defs>

    <!-- Casco principal -->
    <path class="hull" d="M90 262 L250 118 Q450 54 650 118 L810 262 Z" fill="url(#hull)" />
    <path d="M90 262 L250 118 Q450 54 650 118 L810 262 Z" fill="url(#hull-side)" />
    <!-- Arista superior iluminada por el sol -->
    <path d="M250 118 Q450 54 650 118" fill="none" stroke="rgba(230,224,255,0.55)" stroke-width="2" />
    <path d="M262 126 Q450 68 638 126" fill="none" stroke="rgba(161,132,255,0.18)" stroke-width="1" />
    <!-- Paneles -->
    <g class="panels" fill="none" stroke="rgba(201,182,255,0.16)" stroke-width="1">
      <path d="M330 262 L395 112" /><path d="M570 262 L505 112" />
      <path d="M450 262 L450 88" />
      <path d="M190 262 L300 150 Q450 102 600 150 L710 262" />
      <path d="M284 196 L616 196" /><path d="M236 232 L664 232" />
    </g>
    <!-- Antena -->
    <path d="M450 88 L450 34" stroke="rgba(230,224,255,0.6)" stroke-width="2" />
    <circle cx="450" cy="30" r="4" class="strobe" fill="url(#strobe)" />
    <!-- Banda luminosa del casco -->
    <rect x="300" y="160" width="300" height="5" rx="2.5" fill="url(#strip)" class="strip" />
    <!-- Luces de posición -->
    <circle cx="256" cy="130" r="14" fill="url(#port)" class="nav" />
    <circle cx="644" cy="130" r="14" fill="url(#starboard)" class="nav" />
    <!-- Cabina: el reflejo del ventanal sobre el morro -->
    <path d="M405 262 Q450 214 495 262 Z" fill="rgba(139,227,224,0.08)" />
  </svg>
</template>

<style scoped>
.prow {
  position: absolute;
  left: 50%;
  bottom: -2px;
  width: min(72%, 900px);
  z-index: 1;
  height: auto;
  translate: -50% 0;
  filter: drop-shadow(0 -10px 40px rgba(4, 2, 10, 0.9));
  pointer-events: none;
}
.hull {
  filter: drop-shadow(0 -2px 0 rgba(255, 255, 255, 0.06));
}
.strobe {
  animation: strobe 2.6s steps(1) infinite;
}
@keyframes strobe {
  0%, 94% { opacity: 0.25; }
  95%, 100% { opacity: 1; }
}
.nav {
  animation: nav 4s ease-in-out infinite;
}
@keyframes nav {
  0%, 100% { opacity: 0.65; }
  50% { opacity: 1; }
}
.strip {
  animation: strip 6s ease-in-out infinite;
  filter: drop-shadow(0 0 6px rgba(139, 227, 224, 0.9));
}
@keyframes strip {
  50% { opacity: 0.6; }
}
@media (max-width: 720px) {
  .prow {
    width: 86%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .strobe, .nav, .strip { animation: none; }
}
</style>
