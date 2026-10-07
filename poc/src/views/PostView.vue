<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api.js'
import { formatDate, postUrl } from '../util.js'
import { toast } from '../toast.js'
import AppIcon from '../components/AppIcon.vue'

const route = useRoute()
const post = ref(null)
const comments = ref([])
const error = ref('')
const form = reactive({ author: '', body: '', website: '' })
const sending = ref(false)

try { form.author = localStorage.getItem('malkevnia-author') || '' } catch {}

const showCover = computed(() => post.value?.cover && !post.value.content_html.includes(post.value.cover))

async function load() {
  error.value = ''
  post.value = null
  try {
    post.value = await api.post(route.params.slug, route.query.preview)
    document.title = `${post.value.title} · Malkevnia`
    comments.value = await api.comments(route.params.slug)
  } catch (e) {
    error.value = e.message
  }
}

watch(() => route.params.slug, (slug) => slug && load(), { immediate: true })

async function send() {
  if (!form.author.trim() || !form.body.trim()) return
  sending.value = true
  try {
    const c = await api.addComment(route.params.slug, form)
    comments.value.push(c)
    form.body = ''
    try { localStorage.setItem('malkevnia-author', form.author) } catch {}
    toast('Mensaje recibido a bordo. ¡Gracias!')
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <main class="page post-page">
    <RouterLink to="/blog" class="btn btn-ghost btn-sm back"><AppIcon name="arrow-left" :size="14" /> Bitácora</RouterLink>

    <p v-if="error" class="empty panel">{{ error }}</p>

    <article v-if="post">
      <header class="post-head">
        <p v-if="post.status === 'draft'" class="pill pill-warn">Borrador: solo lo ves tú</p>
        <p class="eyebrow">
          <RouterLink :to="{ path: '/blog', query: { category: post.category } }">{{ post.category }}</RouterLink>
        </p>
        <h1 class="post-title">{{ post.title }}</h1>
        <div class="post-meta readout">
          <span>{{ formatDate(post.published_at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }}</span>
          <span><AppIcon name="clock" :size="13" /> {{ post.reading_minutes }} min de lectura</span>
          <a href="#comentarios"><AppIcon name="comment" :size="13" /> {{ comments.length }}</a>
        </div>
        <div class="tags">
          <RouterLink v-for="t in post.tags" :key="t" :to="{ path: '/blog', query: { tag: t } }" class="chip">#{{ t }}</RouterLink>
        </div>
      </header>

      <img v-if="showCover" :src="post.cover" alt="" class="hero-cover" />

      <div class="panel content-panel">
        <div class="prose" v-html="post.content_html"></div>
      </div>

      <nav class="neighbours">
        <RouterLink v-if="post.previous" :to="postUrl(post.previous)" class="neighbour panel">
          <span class="readout"><AppIcon name="arrow-left" :size="12" /> Anterior</span>
          <strong>{{ post.previous.title }}</strong>
        </RouterLink>
        <span v-else></span>
        <RouterLink v-if="post.next" :to="postUrl(post.next)" class="neighbour panel next">
          <span class="readout">Siguiente <AppIcon name="arrow-right" :size="12" /></span>
          <strong>{{ post.next.title }}</strong>
        </RouterLink>
      </nav>

      <section id="comentarios" class="comments">
        <h2 class="comments-title">
          <AppIcon name="comment" /> Transmisiones recibidas
          <span class="readout">{{ comments.length }}</span>
        </h2>

        <ol class="comment-list">
          <li v-for="c in comments" :key="c.id" class="comment panel" :class="{ captain: c.author === 'Malkev' }">
            <div class="comment-head">
              <span class="avatar" aria-hidden="true">{{ c.author.slice(0, 1).toUpperCase() }}</span>
              <strong>{{ c.author }}</strong>
              <span v-if="c.author === 'Malkev'" class="pill">Capitán</span>
              <span class="readout">{{ formatDate(c.created_at, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</span>
            </div>
            <p class="comment-body">{{ c.body }}</p>
          </li>
          <li v-if="!comments.length" class="muted no-comments">Aún no ha llegado ninguna transmisión. Sé el primero.</li>
        </ol>

        <form v-if="post.status === 'published'" class="comment-form panel panel-pad" @submit.prevent="send">
          <p class="eyebrow">Enviar una transmisión</p>
          <label class="field">
            <span>Tu nombre</span>
            <input v-model="form.author" class="input" maxlength="60" required autocomplete="nickname" />
          </label>
          <label class="field">
            <span>Mensaje</span>
            <textarea v-model="form.body" class="textarea" maxlength="4000" required rows="4"></textarea>
          </label>
          <label class="trap" aria-hidden="true">
            Web <input v-model="form.website" tabindex="-1" autocomplete="off" />
          </label>
          <div>
            <button class="btn btn-primary" :disabled="sending">
              <AppIcon name="arrow-right" :size="16" /> {{ sending ? 'Enviando…' : 'Transmitir' }}
            </button>
          </div>
        </form>
      </section>
    </article>
  </main>
</template>

<style scoped>
.post-page {
  width: min(860px, 100% - 32px);
}
.back {
  margin: 0 0 24px -12px;
}
.post-head {
  margin-bottom: 32px;
}
.post-head .eyebrow a {
  color: var(--violet);
  text-decoration: none;
}
.post-title {
  font-size: clamp(30px, 5vw, 48px);
  font-weight: 600;
  line-height: 1.15;
  margin: 0 0 18px;
  letter-spacing: 0.01em;
}
.post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
  text-transform: none;
  letter-spacing: 0.04em;
}
.post-meta span,
.post-meta a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  text-decoration: none;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 16px;
}
.hero-cover {
  display: block;
  width: 100%;
  max-height: 420px;
  object-fit: cover;
  border-radius: var(--radius);
  margin-bottom: 24px;
  border: 1px solid var(--line);
}
.content-panel {
  padding: clamp(24px, 5vw, 56px);
}
.prose :deep(> :first-child) {
  margin-top: 0;
}
.neighbours {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 28px 0 64px;
}
.neighbour {
  display: grid;
  gap: 6px;
  padding: 18px 20px;
  text-decoration: none;
  color: var(--text);
  transition: border-color 0.3s;
}
.neighbour:hover {
  border-color: var(--line-strong);
  color: #fff;
}
.neighbour.next {
  text-align: right;
}
.neighbour .readout {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.neighbour.next .readout {
  justify-content: flex-end;
}
.comments-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 20px;
}
.comment-list {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
  display: grid;
  gap: 12px;
}
.comment {
  padding: 18px 20px;
}
.comment.captain {
  border-color: rgba(161, 132, 255, 0.45);
  background: rgba(60, 38, 120, 0.45);
}
.comment-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.comment-head .readout {
  margin-left: auto;
  text-transform: none;
}
.avatar {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  font-family: var(--font-display);
  font-size: 13px;
  background: linear-gradient(135deg, var(--violet-deep), var(--orchid));
}
.comment-body {
  margin: 10px 0 0;
  white-space: pre-line;
  color: var(--text-soft);
}
.no-comments {
  padding: 8px 4px;
}
.comment-form {
  display: grid;
  gap: 16px;
}
.trap {
  position: absolute;
  left: -9999px;
}
@media (max-width: 640px) {
  .neighbours {
    grid-template-columns: 1fr;
  }
}
</style>
