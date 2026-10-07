<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api.js'
import { formatDate, postUrl } from '../../util.js'
import { toast } from '../../toast.js'
import AppIcon from '../../components/AppIcon.vue'

const comments = ref([])
const filter = ref('all')

async function load() {
  comments.value = await api.adminComments()
}
onMounted(load)

const visible = computed(() => (filter.value === 'all' ? comments.value : comments.value.filter((c) => c.status === filter.value)))

async function toggle(c) {
  const next = c.status === 'visible' ? 'hidden' : 'visible'
  await api.setCommentStatus(c.id, next)
  c.status = next
  toast(next === 'hidden' ? 'Comentario ocultado' : 'Comentario visible de nuevo')
}

async function remove(c) {
  if (!confirm(`¿Borrar el comentario de ${c.author}?`)) return
  await api.deleteComment(c.id)
  comments.value = comments.value.filter((x) => x.id !== c.id)
  toast('Comentario borrado')
}
</script>

<template>
  <div>
    <header class="head">
      <p class="eyebrow">Transmisiones recibidas</p>
      <h1 class="page-title">Comentarios</h1>
    </header>

    <div class="chips">
      <button class="chip" :class="{ active: filter === 'all' }" @click="filter = 'all'">Todos <span class="n">{{ comments.length }}</span></button>
      <button class="chip" :class="{ active: filter === 'visible' }" @click="filter = 'visible'">Visibles</button>
      <button class="chip" :class="{ active: filter === 'hidden' }" @click="filter = 'hidden'">Ocultos</button>
    </div>

    <ul class="list">
      <li v-for="c in visible" :key="c.id" class="panel item" :class="{ hidden: c.status === 'hidden' }">
        <div class="item-head">
          <strong>{{ c.author }}</strong>
          <span class="muted">en</span>
          <a :href="postUrl({ slug: c.post_slug, published_at: c.post_date })" target="_blank">{{ c.post_title }}</a>
          <span class="readout when">{{ formatDate(c.created_at, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</span>
        </div>
        <p class="body">{{ c.body }}</p>
        <div class="actions">
          <span v-if="c.status === 'hidden'" class="pill pill-warn">Oculto</span>
          <button class="btn btn-sm" @click="toggle(c)">
            <AppIcon :name="c.status === 'visible' ? 'eye-off' : 'eye'" :size="14" />
            {{ c.status === 'visible' ? 'Ocultar' : 'Mostrar' }}
          </button>
          <button class="btn btn-sm btn-danger" @click="remove(c)"><AppIcon name="trash" :size="14" /> Borrar</button>
        </div>
      </li>
      <li v-if="!visible.length" class="empty panel">No hay comentarios por aquí.</li>
    </ul>
  </div>
</template>

<style scoped>
.head {
  margin-bottom: 20px;
}
.chips {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 12px;
}
.item {
  padding: 18px 20px;
}
.item.hidden {
  opacity: 0.6;
}
.item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 8px;
}
.when {
  margin-left: auto;
  text-transform: none;
}
.body {
  margin: 10px 0 14px;
  white-space: pre-line;
  color: var(--text-soft);
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
