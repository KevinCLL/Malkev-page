<script setup>
import AppIcon from '../components/AppIcon.vue'
</script>

<template>
  <main class="page lost">
    <p class="eyebrow">Error 404 · Sector sin cartografiar</p>
    <h1 class="page-title">Aquí solo hay vacío</h1>
    <p class="page-lead">Esta parte de la nave no existe, o la desmontamos para hacer sitio a más juegos de mesa.</p>
    <RouterLink to="/" class="btn btn-primary"><AppIcon name="ship" :size="16" /> Volver al puente</RouterLink>
  </main>
</template>

<style scoped>
.lost {
  min-height: 80vh;
  display: grid;
  align-content: center;
  justify-items: center;
  text-align: center;
  gap: 12px;
}
.lost .page-lead {
  margin-bottom: 20px;
}
</style>
