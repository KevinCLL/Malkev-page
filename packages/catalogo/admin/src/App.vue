<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api, session } from './api.js'
import { toasts, toast } from './toast.js'
import AppIcon from './components/AppIcon.vue'
import StarField from './components/StarField.vue'

const route = useRoute()
const pending = ref(0)
const menuOpen = ref(false)

const links = [
  { to: '/', label: 'Puente', icon: 'compass', exact: true },
  { to: '/catalogo', label: 'Catálogo', icon: 'grid' },
  { to: '/colecciones', label: 'Colecciones', icon: 'rows' },
  { to: '/etiquetas', label: 'Etiquetas', icon: 'tag' },
  { to: '/bitacora', label: 'Bitácora', icon: 'log' },
  { to: '/comentarios', label: 'Comentarios', icon: 'comment', badge: true },
  { to: '/ajustes', label: 'Ajustes', icon: 'lock' },
]
const isActive = (l) => (l.exact ? route.path === l.to : route.path.startsWith(l.to))

async function refreshBadge() {
  if (!session.captain) return
  try { pending.value = (await api.stats()).blog.pending_comments || 0 } catch {}
}

onMounted(async () => {
  try { await api.auth() } catch (e) { session.loaded = true; toast(e.message, 'error') }
  refreshBadge()
})
watch(() => route.fullPath, () => { menuOpen.value = false; refreshBadge() })
watch(() => session.captain, refreshBadge)

/* Inicio de sesión */
const username = ref('capitan')
const password = ref('')
const busy = ref(false)
async function login() {
  busy.value = true
  try {
    await api.login(username.value, password.value)
    password.value = ''
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    busy.value = false
  }
}
async function logout() {
  await api.logout()
  toast('Sesión cerrada. Buen viaje.')
}
</script>

<template>
  <StarField />

  <main v-if="!session.loaded" class="boot"><p class="readout"><span class="dot-live"></span>Conectando con la consola…</p></main>

  <main v-else-if="!session.captain" class="login-wrap">
    <form class="panel panel-pad login" @submit.prevent="login">
      <p class="eyebrow">La Malkevnia</p>
      <h1 class="page-title">Consola del capitán</h1>
      <template v-if="session.configured">
        <label class="field">
          <span class="label">Usuario</span>
          <input v-model="username" class="input" autocomplete="username" required />
        </label>
        <label class="field">
          <span class="label">Contraseña</span>
          <input v-model="password" class="input" type="password" autocomplete="current-password" required autofocus />
        </label>
        <button class="btn btn-primary" :disabled="busy">
          <AppIcon name="lock" :size="16" /> {{ busy ? 'Comprobando…' : 'Entrar' }}
        </button>
      </template>
      <p v-else class="muted">
        Aún no hay cuenta de capitán. Créala en el servidor con
        <code>npm run capitan</code> (o con <code>ADMIN_PASSWORD</code> en el <code>.env</code>) y recarga.
      </p>
    </form>
  </main>

  <div v-else class="shell">
    <aside class="side panel" :class="{ open: menuOpen }">
      <div class="brand">
        <span class="brand-mark"><AppIcon name="ship" :size="22" /></span>
        <div>
          <p class="brand-name">Malkevnia</p>
          <p class="readout">Consola del capitán</p>
        </div>
        <button class="btn btn-icon btn-ghost menu-btn" type="button" aria-label="Menú" @click="menuOpen = !menuOpen">
          <AppIcon :name="menuOpen ? 'close' : 'rows'" />
        </button>
      </div>
      <nav>
        <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="nav-link" :class="{ active: isActive(l) }">
          <AppIcon :name="l.icon" :size="17" />
          <span>{{ l.label }}</span>
          <span v-if="l.badge && pending" class="badge">{{ pending }}</span>
        </RouterLink>
      </nav>
      <div class="side-actions">
        <RouterLink to="/bitacora/nueva" class="btn btn-primary"><AppIcon name="edit" :size="16" /> Escribir</RouterLink>
        <RouterLink to="/catalogo/nuevo" class="btn"><AppIcon name="plus" :size="16" /> Añadir al catálogo</RouterLink>
      </div>
      <div class="side-foot">
        <p class="readout"><span class="dot-live"></span>{{ session.captain.username }} a bordo</p>
        <button type="button" class="nav-link small" @click="logout"><AppIcon name="arrow-left" :size="15" /> Cerrar sesión</button>
      </div>
    </aside>
    <section class="main">
      <RouterView :key="route.path" />
    </section>
  </div>

  <div class="toasts" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">{{ t.message }}</div>
  </div>
</template>
