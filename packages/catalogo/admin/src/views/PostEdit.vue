<script setup>
// Editor de entradas: TipTap sin interfaz prestada (la barra es nuestra), imágenes arrastrando o
// pegando, borradores, programar la publicación y enlazar cosas del catálogo.
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { api, POST_STATUSES, KINDS, fmtDate } from '../api.js'
import { toast } from '../toast.js'
import RichEditor from '../components/RichEditor.vue'
import TagInput from '../components/TagInput.vue'
import ItemPicker from '../components/ItemPicker.vue'
import Cover from '../components/Cover.vue'
import AppIcon from '../components/AppIcon.vue'

const props = defineProps({ id: String })
const router = useRouter()
const isNew = computed(() => !props.id)
const form = reactive({
  title: '', slug: '', description: '', content_html: '', cover_url: '', category: 'Bitácora', status: 'draft',
  published_at: '', allow_comments: true, tags: [], aliases: [],
})
const contentJson = ref(null)
const items = ref([])
const post = ref(null)
const saving = ref(false)
const dirty = ref(false)
let loaded = false

// <input type="datetime-local"> trabaja en hora local sin zona.
const toLocal = (d) => {
  if (!d) return ''
  const x = new Date(d)
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function fill(p) {
  post.value = p
  Object.assign(form, {
    title: p.title, slug: p.slug, description: p.description, content_html: p.content_html, cover_url: p.cover_url || '',
    category: p.category, status: p.status, published_at: toLocal(p.published_at), allow_comments: p.allow_comments,
    tags: p.tags.map((t) => t.name), aliases: p.aliases || [],
  })
  items.value = p.items
  setTimeout(() => { dirty.value = false; loaded = true }, 0)
}

onMounted(async () => {
  if (isNew.value) { loaded = true; return }
  try { fill(await api.post(props.id)) } catch (e) { toast(e.message, 'error') }
})

const markDirty = () => { if (loaded) dirty.value = true }

async function save(status) {
  if (status) form.status = status
  saving.value = true
  try {
    const body = {
      ...form,
      published_at: form.published_at ? new Date(form.published_at).toISOString() : null,
      content_json: contentJson.value,
      item_ids: items.value.map((i) => i.id),
    }
    if (isNew.value) {
      const created = await api.createPost(body)
      dirty.value = false
      toast(created.status === 'published' ? 'Publicada.' : 'Borrador guardado.')
      router.replace(`/bitacora/${created.id}`)
    } else {
      fill(await api.updatePost(props.id, body))
      toast(form.status === 'published' ? 'Guardada y publicada.' : form.status === 'scheduled' ? 'Programada.' : 'Borrador guardado.')
    }
  } catch (e) { toast(e.message, 'error') } finally { saving.value = false }
}

async function remove() {
  if (!confirm(`¿Borrar «${form.title}» con sus comentarios? No se puede deshacer.`)) return
  try { await api.deletePost(props.id); dirty.value = false; router.push('/bitacora') } catch (e) { toast(e.message, 'error') }
}

async function uploadCover(e) {
  const file = e.target.files[0]
  if (!file) return
  try { form.cover_url = (await api.upload(file)).url; markDirty() } catch (err) { toast(err.message, 'error') }
  e.target.value = ''
}

// Ctrl+S guarda; avisar antes de salir con cambios sin guardar.
const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() } }
const onUnload = (e) => { if (dirty.value) { e.preventDefault(); e.returnValue = '' } }
onMounted(() => { addEventListener('keydown', onKey); addEventListener('beforeunload', onUnload) })
onBeforeUnmount(() => { removeEventListener('keydown', onKey); removeEventListener('beforeunload', onUnload) })
onBeforeRouteLeave(() => !dirty.value || confirm('Hay cambios sin guardar. ¿Salir igualmente?'))

const aliasText = computed({
  get: () => form.aliases.join('\n'),
  set: (v) => { form.aliases = v.split('\n').map((s) => s.trim()).filter(Boolean); markDirty() },
})
</script>

<template>
  <div>
    <RouterLink to="/bitacora" class="back"><AppIcon name="arrow-left" :size="14" /> Bitácora</RouterLink>
    <header class="view-head">
      <div>
        <p class="eyebrow">{{ isNew ? 'Nueva entrada' : POST_STATUSES[post?.status] }}<template v-if="dirty"> · sin guardar</template></p>
        <h1 class="page-title">{{ form.title || 'Sin título' }}</h1>
        <p v-if="post" class="readout">{{ post.path ? `${post.path} · ` : '' }}editada {{ fmtDate(post.updated_at, true) }}</p>
      </div>
      <div class="actions">
        <button v-if="!isNew" class="btn btn-danger" @click="remove"><AppIcon name="trash" :size="16" /></button>
        <button class="btn" :disabled="saving" @click="save('draft')"><AppIcon name="save" :size="16" /> Guardar borrador</button>
        <button class="btn btn-primary" :disabled="saving" @click="save(form.published_at && new Date(form.published_at) > new Date() ? 'scheduled' : 'published')">
          <AppIcon name="sparkle" :size="16" /> {{ form.published_at && new Date(form.published_at) > new Date() ? 'Programar' : 'Publicar' }}
        </button>
      </div>
    </header>

    <div class="split">
      <div style="display: grid; gap: 16px; min-width: 0">
        <input v-model="form.title" class="input title-input" placeholder="Título de la entrada" @input="markDirty" />
        <RichEditor v-model="form.content_html" @update:model-value="markDirty" @json="(j) => (contentJson = j)" />
        <section class="panel panel-pad">
          <h2 class="section-title">Entradilla</h2>
          <textarea v-model="form.description" class="textarea" rows="2" placeholder="Si la dejas vacía se saca del principio del texto." @input="markDirty" />
        </section>
      </div>

      <aside>
        <section class="panel panel-pad" style="display: grid; gap: 12px">
          <h2 class="section-title">Publicación</h2>
          <label class="field"><span>Estado</span>
            <select v-model="form.status" class="select" @change="markDirty"><option v-for="(l, k) in POST_STATUSES" :key="k" :value="k">{{ l }}</option></select>
          </label>
          <label class="field"><span>Fecha y hora</span><input v-model="form.published_at" class="input" type="datetime-local" @input="markDirty" /></label>
          <p class="hint">Con fecha futura, «Publicar» la deja programada y sale sola a esa hora.</p>
          <label class="check"><input v-model="form.allow_comments" type="checkbox" @change="markDirty" /> Admitir comentarios</label>
        </section>

        <section class="panel panel-pad" style="display: grid; gap: 12px">
          <h2 class="section-title">Clasificación</h2>
          <label class="field"><span>Categoría</span><input v-model="form.category" class="input" list="cats" @input="markDirty" /></label>
          <datalist id="cats"><option value="Bitácora" /><option value="Archivo" /><option value="Reseñas" /><option value="Rol" /></datalist>
          <TagInput v-model="form.tags" @update:model-value="markDirty" />
        </section>

        <section class="panel panel-pad" style="display: grid; gap: 10px">
          <h2 class="section-title">Portada</h2>
          <img v-if="form.cover_url" :src="form.cover_url" alt="" class="cover-preview" />
          <input v-model="form.cover_url" class="input" placeholder="URL de la imagen" @input="markDirty" />
          <label class="btn btn-sm"><AppIcon name="upload" :size="14" /> Subir imagen<input type="file" accept="image/*" hidden @change="uploadCover" /></label>
        </section>

        <section class="panel panel-pad" style="display: grid; gap: 10px">
          <h2 class="section-title">Del catálogo</h2>
          <p class="hint" style="margin: 0">Enlaza el libro, la peli o el juego del que habla la entrada.</p>
          <ItemPicker :exclude="items.map((i) => i.id)" @pick="(it) => { items.push(it); markDirty() }" />
          <ul class="linked">
            <li v-for="(it, i) in items" :key="it.id">
              <Cover :item="it" :size="22" />
              <span>{{ it.title }} <small class="muted">· {{ KINDS[it.kind].one }}</small></span>
              <button type="button" class="btn btn-icon btn-ghost btn-sm" aria-label="Quitar" @click="items.splice(i, 1); markDirty()"><AppIcon name="close" :size="12" /></button>
            </li>
          </ul>
        </section>

        <section class="panel panel-pad" style="display: grid; gap: 10px">
          <h2 class="section-title">Direcciones</h2>
          <label class="field"><span>Slug</span><input v-model="form.slug" class="input mono" placeholder="se saca del título" @input="markDirty" /></label>
          <label class="field"><span>URLs antiguas que redirigen aquí (una por línea)</span><textarea v-model="aliasText" class="textarea mono" rows="2" /></label>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.title-input {
  font-family: var(--font-display);
  font-size: 24px;
  letter-spacing: 0.03em;
  padding: 14px 18px;
}
.cover-preview {
  border-radius: 10px;
  border: 1px solid var(--line);
  max-height: 180px;
  object-fit: cover;
  width: 100%;
}
.linked {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 4px;
  font-size: 14px;
}
.linked li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.linked li span {
  flex: 1;
}
</style>
