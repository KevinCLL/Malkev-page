<script setup>
import { onMounted, ref, watch } from 'vue'
import { api } from '../../api.js'
import { confirmAction, debounce, formatDate, postUrl } from '../../util.js'
import { toast } from '../../toast.js'
import AppIcon from '../../components/AppIcon.vue'

const data = ref(null)
const q = ref('')
const status = ref('')
const page = ref(1)

async function load() {
  data.value = await api.posts({ all: 1, q: q.value, status: status.value, page: page.value })
}

watch(q, debounce(() => { page.value = 1; load() }, 300))
watch([status, page], load)
onMounted(load)

async function remove(post) {
  if (!confirmAction(`¿Borrar "${post.title}" para siempre? Se borrarán también sus comentarios.`)) return
  await api.deletePost(post.id)
  toast('Entrada borrada')
  load()
}

async function toggleStatus(post) {
  const full = await api.adminPost(post.id)
  const next = post.status === 'published' ? 'draft' : 'published'
  await api.updatePost(post.id, { ...full, status: next })
  toast(next === 'published' ? 'Entrada publicada' : 'Entrada pasada a borrador')
  load()
}
</script>

<template>
  <div>
    <header class="head">
      <div>
        <p class="eyebrow">Bitácora</p>
        <h1 class="page-title">Entradas</h1>
      </div>
      <RouterLink to="/consola/entradas/nueva" class="btn btn-primary"><AppIcon name="plus" :size="16" /> Nueva entrada</RouterLink>
    </header>

    <div class="filters">
      <input v-model="q" class="input" type="search" placeholder="Buscar por título o contenido…" />
      <div class="chips">
        <button class="chip" :class="{ active: status === '' }" @click="status = ''; page = 1">Todas</button>
        <button class="chip" :class="{ active: status === 'published' }" @click="status = 'published'; page = 1">Publicadas</button>
        <button class="chip" :class="{ active: status === 'draft' }" @click="status = 'draft'; page = 1">Borradores</button>
      </div>
    </div>

    <div class="panel table-wrap">
      <table v-if="data?.posts.length">
        <thead>
          <tr>
            <th>Título</th>
            <th>Sección</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th class="num"><AppIcon name="comment" :size="14" /><span class="sr-only">Comentarios</span></th>
            <th class="actions-col"><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in data.posts" :key="p.id">
            <td>
              <RouterLink :to="`/consola/entradas/${p.id}`" class="title-link">{{ p.title }}</RouterLink>
              <div class="tags muted">{{ p.tags.map((t) => `#${t}`).join(' ') }}</div>
            </td>
            <td>{{ p.category }}</td>
            <td>
              <button class="pill status" :class="p.status === 'published' ? 'pill-ok' : 'pill-warn'" :title="p.status === 'published' ? 'Pasar a borrador' : 'Publicar'" @click="toggleStatus(p)">
                {{ p.status === 'published' ? 'Publicada' : 'Borrador' }}
              </button>
            </td>
            <td class="date">{{ formatDate(p.published_at, { day: '2-digit', month: 'short', year: 'numeric' }) }}</td>
            <td class="num">{{ p.comment_count }}</td>
            <td class="actions">
              <RouterLink :to="`/consola/entradas/${p.id}`" class="btn btn-ghost btn-icon" title="Editar"><AppIcon name="edit" :size="16" /></RouterLink>
              <RouterLink :to="`${postUrl(p)}${p.status === 'draft' ? '?preview=1' : ''}`" class="btn btn-ghost btn-icon" title="Ver"><AppIcon name="eye" :size="16" /></RouterLink>
              <button class="btn btn-ghost btn-icon btn-danger" title="Borrar" @click="remove(p)"><AppIcon name="trash" :size="16" /></button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="data" class="empty">No hay entradas con esos filtros.</p>
    </div>

    <nav v-if="data && data.pages > 1" class="pager">
      <button class="btn btn-sm" :disabled="page <= 1" @click="page--"><AppIcon name="arrow-left" :size="14" /></button>
      <span class="readout">{{ data.total }} entradas · página {{ data.page }} de {{ data.pages }}</span>
      <button class="btn btn-sm" :disabled="page >= data.pages" @click="page++"><AppIcon name="arrow-right" :size="14" /></button>
    </nav>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}
.filters .input {
  flex: 1;
  min-width: 220px;
  border-radius: 999px;
}
.chips {
  display: flex;
  gap: 6px;
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
th {
  text-align: left;
  font-family: var(--font-mono);
  font-weight: 400;
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
}
td {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(201, 182, 255, 0.07);
  vertical-align: middle;
}
tr:last-child td {
  border-bottom: none;
}
tbody tr:hover {
  background: rgba(161, 132, 255, 0.05);
}
.title-link {
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
}
.title-link:hover {
  color: var(--lavender);
}
.tags {
  font-size: 12px;
  margin-top: 2px;
}
.status {
  cursor: pointer;
  background: none;
}
.date {
  white-space: nowrap;
  color: var(--text-soft);
}
.num {
  text-align: center;
}
.actions {
  white-space: nowrap;
  text-align: right;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 20px;
}
</style>
