<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../../api.js'
import { confirmAction, postUrl, slugify } from '../../util.js'
import { toast } from '../../toast.js'
import RichEditor from '../../components/RichEditor.vue'
import AppIcon from '../../components/AppIcon.vue'

const route = useRoute()
const router = useRouter()
const id = computed(() => (route.params.id ? Number(route.params.id) : null))
const saving = ref(false)
const dirty = ref(false)
const loaded = ref(false)
const slugTouched = ref(false)
const tagDraft = ref('')
const categories = ref([])
const coverInput = ref(null)

const post = reactive({
  title: '',
  slug: '',
  excerpt: '',
  content_html: '',
  cover: '',
  category: '',
  tags: [],
  status: 'draft',
  published_at: new Date().toISOString(),
})

// <input type="datetime-local"> trabaja en hora local sin zona.
const localDate = computed({
  get() {
    const d = new Date(post.published_at)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  },
  set(v) {
    if (v) post.published_at = new Date(v).toISOString()
  },
})

async function load() {
  loaded.value = false
  slugTouched.value = !!id.value
  if (id.value) {
    const data = await api.adminPost(id.value)
    Object.assign(post, { ...data, cover: data.cover || '' })
  }
  categories.value = (await api.taxonomy()).categories.map((c) => c.name)
  loaded.value = true
  setTimeout(() => { dirty.value = false }, 0)
}

watch(id, load)
onMounted(load)

watch(() => post.title, (t) => {
  if (!slugTouched.value) post.slug = slugify(t)
})
watch(post, () => { if (loaded.value) dirty.value = true }, { deep: true })

function addTag() {
  for (const raw of tagDraft.value.split(',')) {
    const t = raw.trim().toLowerCase().replace(/^#/, '')
    if (t && !post.tags.includes(t)) post.tags.push(t)
  }
  tagDraft.value = ''
}

function onTagKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addTag()
  } else if (e.key === 'Backspace' && !tagDraft.value && post.tags.length) {
    post.tags.pop()
  }
}

async function uploadCover(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    post.cover = (await api.upload(file)).url
  } catch (err) {
    toast(err.message, 'error')
  }
}

async function save(status) {
  if (status) post.status = status
  if (!post.title.trim()) {
    toast('La entrada necesita un título', 'error')
    return
  }
  saving.value = true
  try {
    addTag()
    const saved = id.value ? await api.updatePost(id.value, post) : await api.createPost(post)
    post.slug = saved.slug
    dirty.value = false
    toast(saved.status === 'published' ? 'Entrada guardada y publicada' : 'Borrador guardado')
    if (!id.value) router.replace(`/consola/entradas/${saved.id}`)
  } catch (err) {
    toast(err.message, 'error')
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!confirmAction('¿Borrar esta entrada para siempre?')) return
  await api.deletePost(id.value)
  dirty.value = false
  toast('Entrada borrada')
  router.push('/consola')
}

const viewUrl = computed(() => post.slug && id.value ? `${postUrl(post)}${post.status === 'draft' ? '?preview=1' : ''}` : null)

function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    save()
  }
}
function onBeforeUnload(e) {
  if (dirty.value) e.preventDefault()
}
window.addEventListener('keydown', onKey)
window.addEventListener('beforeunload', onBeforeUnload)
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <div class="editor-page">
    <header class="head">
      <div>
        <p class="eyebrow">{{ id ? 'Editando entrada' : 'Nueva entrada' }}</p>
        <p class="readout state">
          <span v-if="dirty" class="pill pill-warn">Cambios sin guardar</span>
          <span v-else-if="id" class="pill pill-ok">Guardado</span>
          <span class="hint">Ctrl + S para guardar</span>
        </p>
      </div>
      <div class="head-actions">
        <RouterLink v-if="viewUrl" :to="viewUrl" class="btn btn-sm"><AppIcon name="eye" :size="15" /> Ver</RouterLink>
        <button class="btn btn-sm" :disabled="saving" @click="save('draft')"><AppIcon name="save" :size="15" /> Guardar borrador</button>
        <button class="btn btn-sm btn-primary" :disabled="saving" @click="save('published')">
          <AppIcon name="sparkle" :size="15" /> {{ post.status === 'published' ? 'Actualizar' : 'Publicar' }}
        </button>
      </div>
    </header>

    <div class="layout">
      <div class="main-col">
        <input v-model="post.title" class="title-input" placeholder="Título de la entrada" aria-label="Título" />
        <RichEditor v-if="loaded" v-model="post.content_html" />
      </div>

      <aside class="meta-col">
        <div class="panel panel-pad meta-card">
          <label class="field">
            <span>Estado</span>
            <select v-model="post.status" class="select">
              <option value="draft">Borrador</option>
              <option value="published">Publicada</option>
            </select>
          </label>
          <label class="field">
            <span>Fecha de publicación</span>
            <input v-model="localDate" type="datetime-local" class="input" />
          </label>
          <label class="field">
            <span>Dirección</span>
            <input v-model="post.slug" class="input mono" @input="slugTouched = true" />
          </label>
        </div>

        <div class="panel panel-pad meta-card">
          <label class="field">
            <span>Sección</span>
            <input v-model="post.category" class="input" list="categories" placeholder="Diario, Relatos, Rol…" />
            <datalist id="categories">
              <option v-for="c in categories" :key="c" :value="c" />
            </datalist>
          </label>
          <div class="field">
            <span>Etiquetas</span>
            <div class="tag-input input" @click="$refs.tagField.focus()">
              <span v-for="(t, i) in post.tags" :key="t" class="chip active small">
                #{{ t }}
                <button type="button" class="x" :aria-label="`Quitar ${t}`" @click.stop="post.tags.splice(i, 1)">×</button>
              </span>
              <input ref="tagField" v-model="tagDraft" placeholder="Añadir…" @keydown="onTagKey" @blur="addTag" />
            </div>
          </div>
          <label class="field">
            <span>Resumen</span>
            <textarea v-model="post.excerpt" class="textarea" rows="4" placeholder="Si lo dejas vacío, se usa el principio del texto."></textarea>
          </label>
        </div>

        <div class="panel panel-pad meta-card">
          <div class="field">
            <span>Imagen de portada</span>
            <div v-if="post.cover" class="cover-preview">
              <img :src="post.cover" alt="" />
              <button class="btn btn-sm btn-danger" @click="post.cover = ''"><AppIcon name="trash" :size="14" /> Quitar</button>
            </div>
            <input v-model="post.cover" class="input" placeholder="URL de la imagen" />
            <button class="btn btn-sm" @click="coverInput.click()"><AppIcon name="upload" :size="14" /> Subir imagen</button>
            <input ref="coverInput" type="file" accept="image/*" hidden @change="uploadCover" />
          </div>
        </div>

        <button v-if="id" class="btn btn-sm btn-danger delete" @click="remove"><AppIcon name="trash" :size="14" /> Borrar entrada</button>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}
.head .eyebrow {
  margin: 0;
}
.state {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 6px 0 0;
  text-transform: none;
}
.hint {
  font-size: 12px;
}
.head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 24px;
  align-items: start;
}
.title-input {
  width: 100%;
  margin-bottom: 16px;
  padding: 8px 4px;
  border: none;
  border-bottom: 1px solid var(--line);
  background: none;
  font-size: clamp(26px, 3.4vw, 38px);
  font-weight: 600;
  color: var(--text);
}
.title-input:focus {
  outline: none;
  border-bottom-color: var(--violet);
}
.title-input::placeholder {
  color: var(--muted);
}
.meta-col {
  display: grid;
  gap: 14px;
}
.meta-card {
  display: grid;
  gap: 14px;
  padding: 18px;
}
.mono {
  font-family: var(--font-mono);
  font-size: 13px;
}
.tag-input {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  cursor: text;
  min-height: 44px;
}
.tag-input input {
  flex: 1;
  min-width: 80px;
  border: none;
  background: none;
  outline: none;
  padding: 2px;
}
.chip.small {
  padding: 2px 4px 2px 10px;
  font-size: 12px;
}
.x {
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 0 4px;
}
.cover-preview {
  display: grid;
  gap: 8px;
}
.cover-preview img {
  width: 100%;
  max-height: 160px;
  object-fit: cover;
  border-radius: 8px;
}
.delete {
  justify-self: start;
}
@media (max-width: 1080px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
