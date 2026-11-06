<script setup>
import { onMounted, ref } from 'vue'
import { api, KINDS, STATUSES } from '../api.js'
import { toast } from '../toast.js'
import Cover from '../components/Cover.vue'
import AppIcon from '../components/AppIcon.vue'

const stats = ref(null)
const drafts = ref([])
onMounted(async () => {
  try {
    stats.value = await api.stats()
    drafts.value = (await api.posts({ status: 'draft', limit: 5 })).posts
  } catch (e) { toast(e.message, 'error') }
})
const hour = new Date().getHours()
const greeting = hour < 7 ? 'Turno de noche' : hour < 14 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches'
const total = (s) => Object.values(s.items).reduce((a, b) => a + b, 0)
</script>

<template>
  <div>
    <header class="view-head">
      <div>
        <p class="eyebrow">Puente de mando</p>
        <h1 class="page-title">{{ greeting }}, capitán</h1>
        <p v-if="stats" class="page-lead">A bordo hay {{ total(stats).toLocaleString('es-ES') }} cosas catalogadas y {{ stats.blog.published }} entradas en la bitácora.</p>
      </div>
    </header>

    <template v-if="stats">
      <section class="stat-grid">
        <RouterLink v-for="(info, kind) in KINDS" :key="kind" :to="{ path: '/catalogo', query: { kind } }" class="panel stat">
          <span class="label"><AppIcon :name="info.icon" :size="14" /> {{ info.label }}</span>
          <span class="value">{{ stats.items[kind].toLocaleString('es-ES') }}</span>
        </RouterLink>
      </section>

      <section class="stat-grid" style="margin-top: 12px">
        <RouterLink to="/comentarios" class="panel stat">
          <span class="label">Comentarios por revisar</span>
          <span class="value" :style="{ color: stats.blog.pending_comments ? 'var(--orchid)' : undefined }">{{ stats.blog.pending_comments }}</span>
        </RouterLink>
        <RouterLink :to="{ path: '/bitacora', query: { status: 'draft' } }" class="panel stat">
          <span class="label">Borradores</span><span class="value">{{ stats.blog.drafts }}</span>
        </RouterLink>
        <RouterLink :to="{ path: '/bitacora', query: { status: 'scheduled' } }" class="panel stat">
          <span class="label">Programadas</span><span class="value">{{ stats.blog.scheduled }}</span>
        </RouterLink>
        <div class="panel stat"><span class="label">Comentarios visibles</span><span class="value">{{ stats.blog.comments }}</span></div>
      </section>

      <div class="two">
        <section class="panel panel-pad">
          <h2 class="section-title">Ahora mismo</h2>
          <p v-if="!stats.now_on_board.length" class="muted">Nada en curso. Marca algo como «leyendo», «viendo» o «jugando» y aparecerá aquí.</p>
          <ul class="now">
            <li v-for="it in stats.now_on_board" :key="it.id">
              <RouterLink :to="`/catalogo/${it.id}`">
                <Cover :item="it" :size="30" />
                <span><strong>{{ it.title }}</strong><br /><small class="muted">{{ STATUSES[it.status] }} · {{ KINDS[it.kind].one }}</small></span>
              </RouterLink>
            </li>
          </ul>
        </section>
        <section class="panel panel-pad">
          <h2 class="section-title">Borradores recientes</h2>
          <p v-if="!drafts.length" class="muted">No hay borradores.</p>
          <ul class="now">
            <li v-for="p in drafts" :key="p.id">
              <RouterLink :to="`/bitacora/${p.id}`"><AppIcon name="edit" :size="16" /><span>{{ p.title }}</span></RouterLink>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.two {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  margin-top: 24px;
}
.now {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
}
.now a {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 8px;
  border-radius: 10px;
  text-decoration: none;
  color: var(--text);
}
.now a:hover {
  background: rgba(161, 132, 255, 0.08);
}
</style>
