<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../../api.js'
import { auth, setAuth } from '../../auth.js'
import { toast } from '../../toast.js'
import AppIcon from '../../components/AppIcon.vue'
import AdminLogin from './AdminLogin.vue'

const route = useRoute()
const demo = import.meta.env.MODE === 'demo'
const links = [
  { to: '/consola', label: 'Entradas', icon: 'log', match: (p) => p === '/consola' || p.startsWith('/consola/entradas') },
  { to: '/consola/comentarios', label: 'Comentarios', icon: 'comment', match: (p) => p.startsWith('/consola/comentarios') },
  { to: '/consola/coleccion', label: 'Colección', icon: 'grid', match: (p) => p.startsWith('/consola/coleccion') },
]

onMounted(async () => {
  try { setAuth(await api.auth()) } catch (e) { toast(e.message, 'error') }
})

const ready = computed(() => auth.loaded && auth.authenticated)

async function logout() {
  setAuth(await api.logout())
  toast('Sesión cerrada')
}

/* Cambio de contraseña, en un pequeño desplegable del lateral. */
const changing = ref(false)
const current = ref('')
const next = ref('')
const busy = ref(false)
async function changePassword() {
  busy.value = true
  try {
    setAuth(await api.changePassword(current.value, next.value))
    current.value = ''
    next.value = ''
    changing.value = false
    toast('Contraseña cambiada. Las demás sesiones se han cerrado.')
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AdminLogin v-if="auth.loaded && !auth.authenticated" />
  <main v-else-if="ready" class="page console">
    <aside class="console-nav panel">
      <p class="eyebrow">Consola de mando</p>
      <nav>
        <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="console-link" :class="{ active: l.match(route.path) }">
          <AppIcon :name="l.icon" :size="17" /> {{ l.label }}
        </RouterLink>
      </nav>
      <RouterLink to="/consola/entradas/nueva" class="btn btn-primary new-post">
        <AppIcon name="plus" :size="16" /> Nueva entrada
      </RouterLink>

      <div class="account">
        <p class="label">Capitán</p>
        <a v-if="!demo" :href="api.backupUrl" class="console-link small" download>
          <AppIcon name="save" :size="15" /> Copia de seguridad
        </a>
        <button type="button" class="console-link small" @click="changing = !changing">
          <AppIcon name="lock" :size="15" /> Cambiar contraseña
        </button>
        <form v-if="changing" class="pass-form" @submit.prevent="changePassword">
          <input v-model="current" class="input" type="password" placeholder="Actual" required autocomplete="current-password" />
          <input v-model="next" class="input" type="password" placeholder="Nueva (8 o más)" minlength="8" required autocomplete="new-password" />
          <button class="btn btn-sm" :disabled="busy">Guardar</button>
        </form>
        <button type="button" class="console-link small" @click="logout">
          <AppIcon name="arrow-left" :size="15" /> Cerrar sesión
        </button>
        <p v-if="demo" class="note"><span class="dot-live"></span>En esta demo la consola está abierta; en la versión real pide la contraseña.</p>
      </div>
    </aside>
    <section class="console-main">
      <RouterView />
    </section>
  </main>
  <main v-else class="page console-loading"><p class="readout">Conectando con la consola…</p></main>
</template>

<style scoped>
.console {
  width: min(1320px, 100% - 32px);
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  gap: 28px;
  align-items: start;
}
.console-loading {
  text-align: center;
}
.console-nav {
  position: sticky;
  top: calc(var(--header-h) + 24px);
  padding: 20px 14px;
  display: grid;
  gap: 14px;
}
.console-nav .eyebrow {
  padding: 0 10px;
  margin: 0;
}
nav {
  display: grid;
  gap: 2px;
}
.console-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  color: var(--text-soft);
  text-decoration: none;
  transition: background 0.2s;
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
  text-align: left;
  width: 100%;
}
.console-link:hover {
  background: rgba(161, 132, 255, 0.08);
  color: #fff;
}
.console-link.active {
  background: rgba(161, 132, 255, 0.18);
  color: #fff;
}
.console-link.small {
  padding: 7px 10px;
  font-size: 14px;
}
.new-post {
  margin: 4px 6px 0;
}
.account {
  display: grid;
  gap: 2px;
  border-top: 1px solid var(--line);
  padding-top: 12px;
  margin-top: 4px;
}
.account .label {
  margin: 0 0 6px;
  padding: 0 10px;
}
.pass-form {
  display: grid;
  gap: 6px;
  padding: 6px 6px 10px;
}
.note {
  margin: 8px 8px 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted);
}
@media (max-width: 900px) {
  .console {
    grid-template-columns: 1fr;
  }
  .console-nav {
    position: static;
  }
  nav {
    display: flex;
    flex-wrap: wrap;
  }
  .account {
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }
  .account .label,
  .pass-form,
  .note {
    grid-column: 1 / -1;
  }
}
</style>
