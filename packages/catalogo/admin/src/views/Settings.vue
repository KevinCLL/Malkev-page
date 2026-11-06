<script setup>
import { ref } from 'vue'
import { api, session } from '../api.js'
import { toast } from '../toast.js'
import AppIcon from '../components/AppIcon.vue'

const current = ref('')
const next = ref('')
const repeat = ref('')
const busy = ref(false)

async function change() {
  if (next.value !== repeat.value) return toast('Las dos contraseñas nuevas no coinciden.', 'error')
  busy.value = true
  try {
    await api.changePassword(current.value, next.value)
    current.value = next.value = repeat.value = ''
    toast('Contraseña cambiada. Las demás sesiones se han cerrado.')
  } catch (e) { toast(e.message, 'error') } finally { busy.value = false }
}
</script>

<template>
  <div>
    <header class="view-head">
      <div>
        <p class="eyebrow">Camarote del capitán</p>
        <h1 class="page-title">Ajustes</h1>
      </div>
    </header>
    <div class="cols">
      <form class="panel panel-pad" style="display: grid; gap: 12px" @submit.prevent="change">
        <h2 class="section-title">Cambiar contraseña</h2>
        <p class="muted" style="margin: 0">Sesión iniciada como <strong>{{ session.captain.username }}</strong>.</p>
        <label class="field"><span>Contraseña actual</span><input v-model="current" class="input" type="password" autocomplete="current-password" required /></label>
        <label class="field"><span>Nueva (10 caracteres o más)</span><input v-model="next" class="input" type="password" minlength="10" autocomplete="new-password" required /></label>
        <label class="field"><span>Repite la nueva</span><input v-model="repeat" class="input" type="password" minlength="10" autocomplete="new-password" required /></label>
        <button class="btn btn-primary" :disabled="busy"><AppIcon name="lock" :size="15" /> Cambiar</button>
      </form>
      <section class="panel panel-pad">
        <h2 class="section-title">API pública</h2>
        <p class="muted">Lo que lee la web (Astro, la nave 3D…). Solo lectura, sin sesión; lo oculto y las notas privadas no salen.</p>
        <ul class="links mono">
          <li><a href="/api/v1/stats" target="_blank">/api/v1/stats</a></li>
          <li><a href="/api/v1/items?kind=book&amp;limit=5" target="_blank">/api/v1/items?kind=book</a></li>
          <li><a href="/api/v1/collections" target="_blank">/api/v1/collections</a></li>
          <li><a href="/api/v1/posts?limit=5" target="_blank">/api/v1/posts</a></li>
          <li><a href="/api/v1/tags" target="_blank">/api/v1/tags</a></li>
        </ul>
        <p class="hint">Documentación completa en <code>packages/catalogo/API.md</code>.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  align-items: start;
}
.links {
  padding-left: 18px;
  font-size: 14px;
}
</style>
