<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import StarField from './components/StarField.vue'
import AppIcon from './components/AppIcon.vue'
import { toasts } from './toast.js'
import { setAmbient } from './ambient.js'

const route = useRoute()
const menuOpen = ref(false)
const sound = ref(false)

const rooms = [
  { to: '/', label: 'Puente', icon: 'ship', exact: true },
  { to: '/blog', label: 'Bitácora', icon: 'log' },
  { to: '/sala-de-juegos', label: 'Sala de juegos', icon: 'dice' },
  { to: '/sala-de-proyeccion', label: 'Proyección', icon: 'film' },
  { to: '/biblioteca', label: 'Biblioteca', icon: 'book' },
]

function toggleSound() {
  sound.value = !sound.value
  setAmbient(sound.value)
}

watch(() => route.fullPath, () => { menuOpen.value = false })
</script>

<template>
  <StarField />

  <header class="ship-header">
    <div class="ship-header-inner">
      <RouterLink to="/" class="brand" aria-label="Malkevnia, ir al puente">
        <span class="brand-mark"><AppIcon name="ship" :size="20" /></span>
        <span class="brand-name">MALKEVNIA</span>
      </RouterLink>

      <button class="btn btn-ghost btn-icon menu-toggle" :aria-expanded="menuOpen" aria-controls="ship-nav" @click="menuOpen = !menuOpen">
        <AppIcon :name="menuOpen ? 'close' : 'rows'" />
        <span class="sr-only">Menú</span>
      </button>

      <nav id="ship-nav" class="ship-nav" :class="{ open: menuOpen }" aria-label="Estancias de la nave">
        <RouterLink
          v-for="room in rooms"
          :key="room.to"
          :to="room.to"
          class="nav-link"
          :class="{ active: room.exact ? route.path === room.to : route.path.startsWith(room.to) }"
        >
          <AppIcon :name="room.icon" :size="16" />
          {{ room.label }}
        </RouterLink>
      </nav>

      <div class="ship-tools">
        <button class="btn btn-ghost btn-icon" :title="sound ? 'Apagar el zumbido de la nave' : 'Escuchar el zumbido de la nave'" @click="toggleSound">
          <AppIcon :name="sound ? 'sound' : 'mute'" />
          <span class="sr-only">Sonido ambiente</span>
        </button>
        <RouterLink to="/consola" class="btn btn-sm" :class="{ 'btn-primary': route.path.startsWith('/consola') }">
          <AppIcon name="console" :size="16" />
          <span class="tool-label">Consola</span>
        </RouterLink>
      </div>
    </div>
  </header>

  <RouterView v-slot="{ Component }">
    <Transition name="warp" mode="out-in">
      <component :is="Component" :key="route.matched[0]?.path === '/consola' ? 'consola' : route.path" />
    </Transition>
  </RouterView>

  <div class="toasts" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast panel" :class="t.type">
        <AppIcon :name="t.type === 'error' ? 'close' : 'check'" :size="16" />
        {{ t.message }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.ship-header {
  position: fixed;
  inset: 0 0 auto;
  z-index: 50;
  height: var(--header-h);
  background: linear-gradient(180deg, rgba(6, 3, 16, 0.85), rgba(6, 3, 16, 0.55));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.ship-header-inner {
  width: min(1240px, 100% - 32px);
  margin: 0 auto;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 20px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text);
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--line-strong);
  color: var(--lavender);
  background: radial-gradient(circle at 50% 30%, rgba(161, 132, 255, 0.3), transparent 70%);
}
.brand-name {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: 0.22em;
  font-size: 15px;
}
.ship-nav {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
.nav-link {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 13px;
  border-radius: 999px;
  color: var(--text-soft);
  text-decoration: none;
  font-size: 14px;
  transition: all 0.25s var(--ease);
}
.nav-link:hover {
  color: #fff;
  background: rgba(161, 132, 255, 0.08);
}
.nav-link.active {
  color: #fff;
  background: rgba(161, 132, 255, 0.16);
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
.ship-tools {
  display: flex;
  align-items: center;
  gap: 6px;
}
.menu-toggle {
  display: none;
}

.toasts {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 100;
  display: grid;
  gap: 10px;
}
.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  font-size: 14px;
  border-color: rgba(159, 227, 180, 0.4);
}
.toast.error {
  border-color: rgba(255, 138, 158, 0.5);
  color: var(--danger);
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.35s var(--ease);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@media (max-width: 1020px) {
  .menu-toggle {
    display: inline-flex;
    margin-left: auto;
  }
  .ship-nav {
    position: absolute;
    top: var(--header-h);
    left: 0;
    right: 0;
    flex-direction: column;
    padding: 12px 16px 20px;
    background: rgba(8, 4, 20, 0.96);
    border-bottom: 1px solid var(--line);
    display: none;
  }
  .ship-nav.open {
    display: flex;
  }
  .nav-link {
    padding: 12px 14px;
    font-size: 16px;
  }
}
@media (max-width: 520px) {
  .tool-label {
    display: none;
  }
  .brand-name {
    font-size: 13px;
    letter-spacing: 0.16em;
  }
}
</style>

<style>
.warp-enter-active {
  transition: opacity 0.35s var(--ease), transform 0.45s var(--ease);
}
.warp-leave-active {
  transition: opacity 0.16s ease-in, transform 0.16s ease-in;
}
.warp-enter-from {
  opacity: 0;
  transform: translateY(14px);
}
.warp-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
