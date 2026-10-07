<script setup>
import { useRoute } from 'vue-router'
import AppIcon from '../../components/AppIcon.vue'

const route = useRoute()
const links = [
  { to: '/consola', label: 'Entradas', icon: 'log', match: (p) => p === '/consola' || p.startsWith('/consola/entradas') },
  { to: '/consola/comentarios', label: 'Comentarios', icon: 'comment', match: (p) => p.startsWith('/consola/comentarios') },
  { to: '/consola/coleccion', label: 'Colección', icon: 'grid', match: (p) => p.startsWith('/consola/coleccion') },
]
</script>

<template>
  <main class="page console">
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
      <p class="note">
        <span class="dot-live"></span>Modo local: la consola no pide contraseña. En el servidor real irá detrás de un inicio de sesión.
      </p>
    </aside>
    <section class="console-main">
      <RouterView />
    </section>
  </main>
</template>

<style scoped>
.console {
  width: min(1320px, 100% - 32px);
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  gap: 28px;
  align-items: start;
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
}
.console-link:hover {
  background: rgba(161, 132, 255, 0.08);
  color: #fff;
}
.console-link.active {
  background: rgba(161, 132, 255, 0.18);
  color: #fff;
}
.new-post {
  margin: 4px 6px 0;
}
.note {
  margin: 4px 8px 0;
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
}
</style>
