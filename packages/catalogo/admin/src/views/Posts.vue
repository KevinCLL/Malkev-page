<script setup>
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, POST_STATUSES, fmtDate } from '../api.js'
import { toast } from '../toast.js'
import Pager from '../components/Pager.vue'
import AppIcon from '../components/AppIcon.vue'

const route = useRoute()
const router = useRouter()
const f = reactive({ status: route.query.status || '', q: route.query.q || '', tag: route.query.tag || '', offset: Number(route.query.offset) || 0 })
const LIMIT = 30
const data = ref({ total: 0, posts: [] })

async function load() {
  try { data.value = await api.posts({ ...f, limit: LIMIT }) } catch (e) { toast(e.message, 'error') }
}
function sync() {
  router.replace({ query: Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== 0)) })
  load()
}
let timer = 0
watch(() => [f.status, f.tag], () => { f.offset = 0; sync() })
watch(() => f.q, () => { clearTimeout(timer); timer = setTimeout(() => { f.offset = 0; sync() }, 250) })
onMounted(load)
const pillClass = (s) => ({ published: 'pill-ok', scheduled: 'pill-warn' })[s] || ''
</script>

<template>
  <div>
    <header class="view-head">
      <div>
        <p class="eyebrow">Diario de a bordo</p>
        <h1 class="page-title">Bitácora</h1>
      </div>
      <div class="actions"><RouterLink to="/bitacora/nueva" class="btn btn-primary"><AppIcon name="edit" :size="16" /> Nueva entrada</RouterLink></div>
    </header>
    <div class="chips">
      <button class="chip" :class="{ active: !f.status }" @click="f.status = ''">Todas</button>
      <button v-for="(l, k) in POST_STATUSES" :key="k" class="chip" :class="{ active: f.status === k }" @click="f.status = k">{{ l }}</button>
      <button v-if="f.tag" class="chip active" @click="f.tag = ''"><AppIcon name="tag" :size="14" /> {{ f.tag }} <AppIcon name="close" :size="12" /></button>
    </div>
    <div class="toolbar-row"><input v-model="f.q" class="input grow" type="search" placeholder="Buscar en títulos y textos…" /></div>
    <section class="panel table-wrap">
      <table class="table">
        <thead><tr><th>Título</th><th>Estado</th><th>Fecha</th><th class="num">Palabras</th><th class="num">Coment.</th></tr></thead>
        <tbody>
          <tr v-for="p in data.posts" :key="p.id">
            <td>
              <RouterLink :to="`/bitacora/${p.id}`" class="row-title">{{ p.title }}</RouterLink>
              <div class="muted" style="font-size: 12px">{{ p.path }}<template v-if="p.tags.length"> · {{ p.tags.map((t) => t.name).join(', ') }}</template></div>
            </td>
            <td><span class="pill" :class="pillClass(p.status)">{{ POST_STATUSES[p.status] }}</span></td>
            <td class="muted" style="white-space: nowrap">{{ fmtDate(p.published_at) }}</td>
            <td class="num muted">{{ p.word_count.toLocaleString('es-ES') }}</td>
            <td class="num muted">{{ p.comment_count }}</td>
          </tr>
          <tr v-if="!data.posts.length"><td colspan="5" class="empty">No hay entradas con esos filtros.</td></tr>
        </tbody>
      </table>
    </section>
    <Pager :total="data.total" :limit="LIMIT" :offset="f.offset" @go="(o) => { f.offset = o; sync() }" />
  </div>
</template>
