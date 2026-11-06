<script setup>
import { onMounted, ref, watch } from 'vue'
import { api, COMMENT_STATUSES, fmtDate } from '../api.js'
import { toast } from '../toast.js'
import Pager from '../components/Pager.vue'
import AppIcon from '../components/AppIcon.vue'

const status = ref('pending')
const offset = ref(0)
const LIMIT = 30
const data = ref({ total: 0, comments: [], counts: {} })
const replying = ref(null)
const replyText = ref('')

const load = async () => { try { data.value = await api.comments({ status: status.value, limit: LIMIT, offset: offset.value }) } catch (e) { toast(e.message, 'error') } }
watch(status, () => { offset.value = 0; load() })
onMounted(load)

async function set(c, s) {
  try { await api.moderate(c.id, { status: s }); toast({ visible: 'Aprobado.', hidden: 'Ocultado.', spam: 'Marcado como spam.' }[s] || 'Hecho.'); load() } catch (e) { toast(e.message, 'error') }
}
async function remove(c) {
  if (!confirm('¿Borrar este comentario para siempre?')) return
  try { await api.deleteComment(c.id); load() } catch (e) { toast(e.message, 'error') }
}
async function reply(c) {
  try { await api.reply(c.id, replyText.value); replying.value = null; replyText.value = ''; toast('Respuesta publicada.'); load() } catch (e) { toast(e.message, 'error') }
}
</script>

<template>
  <div>
    <header class="view-head">
      <div>
        <p class="eyebrow">Mensajes de la tripulación</p>
        <h1 class="page-title">Comentarios</h1>
      </div>
    </header>
    <div class="chips">
      <button v-for="(l, k) in COMMENT_STATUSES" :key="k" class="chip" :class="{ active: status === k }" @click="status = k">
        {{ l }} <span class="n">{{ data.counts[k] || 0 }}</span>
      </button>
    </div>
    <p v-if="!data.comments.length" class="panel panel-pad empty">Nada por aquí. Todo en calma.</p>
    <ul class="list">
      <li v-for="c in data.comments" :key="c.id" class="panel panel-pad">
        <div class="meta">
          <strong>{{ c.author }}</strong>
          <span v-if="c.is_captain" class="pill pill-ok">capitán</span>
          <span class="muted">en <RouterLink :to="`/bitacora/${c.post_id}`">{{ c.post_title }}</RouterLink> · {{ fmtDate(c.created_at, true) }}</span>
          <span v-if="c.email" class="muted mono">{{ c.email }}</span>
          <a v-if="c.website" :href="c.website" target="_blank" rel="noopener nofollow" class="muted">{{ c.website }}</a>
        </div>
        <p class="body">{{ c.body }}</p>
        <div class="ops">
          <button v-if="c.status !== 'visible'" class="btn btn-sm btn-primary" @click="set(c, 'visible')"><AppIcon name="check" :size="14" /> Aprobar</button>
          <button v-if="c.status !== 'hidden'" class="btn btn-sm" @click="set(c, 'hidden')"><AppIcon name="eye-off" :size="14" /> Ocultar</button>
          <button v-if="c.status !== 'spam'" class="btn btn-sm" @click="set(c, 'spam')">Spam</button>
          <button v-if="!c.is_captain" class="btn btn-sm" @click="replying = replying === c.id ? null : c.id"><AppIcon name="comment" :size="14" /> Responder</button>
          <button class="btn btn-sm btn-ghost" @click="remove(c)"><AppIcon name="trash" :size="14" /></button>
        </div>
        <form v-if="replying === c.id" class="reply" @submit.prevent="reply(c)">
          <textarea v-model="replyText" class="textarea" rows="3" placeholder="Tu respuesta (al responder, el comentario queda aprobado)" required />
          <button class="btn btn-sm btn-primary">Publicar respuesta</button>
        </form>
      </li>
    </ul>
    <Pager v-if="data.total > LIMIT" :total="data.total" :limit="LIMIT" :offset="offset" @go="(o) => { offset = o; load() }" />
  </div>
</template>

<style scoped>
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 12px;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 14px;
}
.body {
  white-space: pre-wrap;
  margin: 10px 0 14px;
  color: var(--text-soft);
}
.ops {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.reply {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  justify-items: start;
}
</style>
