<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, COLLECTION_KINDS, fmtDate } from '../api.js'
import { toast } from '../toast.js'
import AppIcon from '../components/AppIcon.vue'

const router = useRouter()
const collections = ref([])
const creating = ref(false)
const form = reactive({ name: '', kind: 'list', room: '', rows: '', cols: '', description: '' })

const load = async () => { try { collections.value = (await api.collections()).collections } catch (e) { toast(e.message, 'error') } }
onMounted(load)

async function create() {
  try {
    const c = await api.createCollection({ ...form, is_public: true, position: collections.value.length })
    router.push(`/colecciones/${c.id}`)
  } catch (e) { toast(e.message, 'error') }
}
const ROOMS = { 'sala-recreativa': 'Sala recreativa', proyeccion: 'Sala de proyección', biblioteca: 'Biblioteca' }
</script>

<template>
  <div>
    <header class="view-head">
      <div>
        <p class="eyebrow">Muebles y listas</p>
        <h1 class="page-title">Colecciones</h1>
        <p class="page-lead">Cada mueble de la nave (las Kallax, la estantería, la librería) o una lista temática, con lo que hay dentro y dónde está.</p>
      </div>
      <div class="actions"><button class="btn btn-primary" @click="creating = !creating"><AppIcon name="plus" :size="16" /> Nueva colección</button></div>
    </header>

    <form v-if="creating" class="panel panel-pad" style="margin-bottom: 16px" @submit.prevent="create">
      <div class="form-grid">
        <label class="field"><span>Nombre</span><input v-model="form.name" class="input" required placeholder="Favoritos de 2026" /></label>
        <label class="field"><span>Tipo</span><select v-model="form.kind" class="select"><option v-for="(l, k) in COLLECTION_KINDS" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="field"><span>Estancia</span><select v-model="form.room" class="select"><option value="">—</option><option v-for="(l, k) in ROOMS" :key="k" :value="k">{{ l }}</option></select></label>
        <template v-if="form.kind !== 'list'">
          <label class="field"><span>Filas</span><input v-model="form.rows" class="input" type="number" min="1" max="50" /></label>
          <label class="field"><span>Columnas</span><input v-model="form.cols" class="input" type="number" min="1" max="50" /></label>
        </template>
        <label class="field wide"><span>Descripción</span><input v-model="form.description" class="input" /></label>
      </div>
      <div style="margin-top: 14px"><button class="btn btn-primary">Crear</button></div>
    </form>

    <section class="grid">
      <RouterLink v-for="c in collections" :key="c.id" :to="`/colecciones/${c.id}`" class="panel card">
        <p class="readout">{{ COLLECTION_KINDS[c.kind] }}<template v-if="c.rows"> · {{ c.rows }}×{{ c.cols }}</template><template v-if="!c.is_public"> · privada</template></p>
        <h2>{{ c.name }}</h2>
        <p class="muted">{{ c.description || ' ' }}</p>
        <p class="foot"><span class="value">{{ c.item_count.toLocaleString('es-ES') }}</span> <span class="muted">cosas · {{ ROOMS[c.room] || 'sin estancia' }} · {{ fmtDate(c.updated_at) }}</span></p>
      </RouterLink>
    </section>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}
.card {
  padding: 18px;
  text-decoration: none;
  color: inherit;
  display: grid;
  gap: 6px;
  transition: border-color 0.2s, transform 0.25s var(--ease);
}
.card:hover {
  border-color: var(--line-strong);
  transform: translateY(-2px);
}
.card h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  letter-spacing: 0.04em;
}
.card p {
  margin: 0;
}
.foot .value {
  font-family: var(--font-display);
  color: var(--lavender);
  font-size: 20px;
}
</style>
