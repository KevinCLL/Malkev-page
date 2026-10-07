<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api.js'
import { debounce, formatDate, postUrl } from '../util.js'
import AppIcon from '../components/AppIcon.vue'
import GenCover from '../components/GenCover.vue'

const route = useRoute()
const router = useRouter()
const data = ref(null)
const taxonomy = ref({ categories: [], tags: [], years: [] })
const loading = ref(false)
const showTags = ref(false)
const search = ref(route.query.q || '')
const brokenCovers = reactive(new Set())

const filters = computed(() => ({
  q: route.query.q || '',
  tag: route.query.tag || '',
  category: route.query.category || '',
  year: route.query.year || '',
  page: Number(route.query.page) || 1,
}))

const activeFilters = computed(() => ['q', 'tag', 'category', 'year'].some((k) => filters.value[k]))

function setFilter(patch) {
  const query = { ...route.query, ...patch, page: undefined }
  for (const k of Object.keys(query)) if (!query[k]) delete query[k]
  router.replace({ query })
}

const onSearch = debounce((value) => setFilter({ q: value.trim() }), 350)
watch(search, onSearch)

async function load() {
  loading.value = true
  try {
    data.value = await api.posts(filters.value)
  } finally {
    loading.value = false
  }
}

watch(filters, load, { deep: true })
onMounted(async () => {
  load()
  taxonomy.value = await api.taxonomy()
  if (filters.value.tag) showTags.value = true
})

function goPage(page) {
  router.push({ query: { ...route.query, page: page > 1 ? page : undefined } })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function clearAll() {
  search.value = ''
  router.replace({ query: {} })
}
</script>

<template>
  <main class="page">
    <header class="page-head">
      <p class="eyebrow">Cuaderno de a bordo</p>
      <h1 class="page-title">Bitácora</h1>
      <p class="page-lead">Notas, pensamientos y comentarios de Malkev, anotados desde 2010. Algunos con más estrellas que otros.</p>
    </header>

    <section class="controls panel panel-pad">
      <label class="search">
        <AppIcon name="search" class="search-icon" />
        <span class="sr-only">Buscar en la bitácora</span>
        <input v-model="search" class="input" type="search" placeholder="Buscar en la bitácora…" />
      </label>

      <div class="filter-row">
        <span class="label">Secciones</span>
        <div class="chips">
          <button class="chip" :class="{ active: !filters.category }" @click="setFilter({ category: '' })">Todas</button>
          <button
            v-for="c in taxonomy.categories"
            :key="c.name"
            class="chip"
            :class="{ active: filters.category === c.name }"
            @click="setFilter({ category: filters.category === c.name ? '' : c.name })"
          >
            {{ c.name }} <span class="n">{{ c.n }}</span>
          </button>
        </div>
      </div>

      <div class="filter-row">
        <span class="label">Años</span>
        <div class="chips">
          <button
            v-for="y in taxonomy.years"
            :key="y.year"
            class="chip"
            :class="{ active: filters.year === y.year }"
            @click="setFilter({ year: filters.year === y.year ? '' : y.year })"
          >
            {{ y.year }} <span class="n">{{ y.n }}</span>
          </button>
        </div>
      </div>

      <div class="filter-row">
        <button class="label tags-toggle" :aria-expanded="showTags" @click="showTags = !showTags">
          <AppIcon name="tag" :size="14" /> Etiquetas {{ showTags ? '−' : '+' }}
        </button>
        <div v-if="showTags" class="chips">
          <button
            v-for="t in taxonomy.tags"
            :key="t.name"
            class="chip"
            :class="{ active: filters.tag === t.name }"
            @click="setFilter({ tag: filters.tag === t.name ? '' : t.name })"
          >
            #{{ t.name }} <span class="n">{{ t.n }}</span>
          </button>
        </div>
      </div>
    </section>

    <div class="results-bar">
      <span class="readout" v-if="data">
        {{ data.total }} {{ data.total === 1 ? 'entrada' : 'entradas' }}
        <template v-if="activeFilters"> encontradas</template>
      </span>
      <button v-if="activeFilters" class="btn btn-ghost btn-sm" @click="clearAll">Quitar filtros</button>
    </div>

    <section class="posts" :class="{ loading }">
      <RouterLink v-for="post in data?.posts" :key="post.id" :to="postUrl(post)" class="post-card panel">
        <div class="post-cover">
          <img v-if="post.cover && !brokenCovers.has(post.id)" :src="post.cover" alt="" loading="lazy" @error="brokenCovers.add(post.id)" />
          <GenCover v-else :item="{ title: post.title }" ratio="auto" :show-text="false" class="gen-cover" />
        </div>
        <div class="post-body">
          <span class="readout">
            {{ formatDate(post.published_at) }} · {{ post.category }}
          </span>
          <h2 class="post-title">{{ post.title }}</h2>
          <p class="post-excerpt">{{ post.excerpt }}</p>
          <span class="post-meta">
            <span><AppIcon name="clock" :size="14" /> {{ post.reading_minutes }} min</span>
            <span v-if="post.comment_count"><AppIcon name="comment" :size="14" /> {{ post.comment_count }}</span>
            <span class="post-tags">
              <span v-for="t in post.tags.slice(0, 3)" :key="t">#{{ t }}</span>
            </span>
          </span>
        </div>
      </RouterLink>
      <p v-if="data && !data.posts.length" class="empty panel">Nada por aquí. Prueba con otra búsqueda.</p>
    </section>

    <nav v-if="data && data.pages > 1" class="pager" aria-label="Páginas">
      <button class="btn btn-sm" :disabled="data.page <= 1" @click="goPage(data.page - 1)">
        <AppIcon name="arrow-left" :size="14" /> Más recientes
      </button>
      <span class="readout">Página {{ data.page }} de {{ data.pages }}</span>
      <button class="btn btn-sm" :disabled="data.page >= data.pages" @click="goPage(data.page + 1)">
        Más antiguas <AppIcon name="arrow-right" :size="14" />
      </button>
    </nav>
  </main>
</template>

<style scoped>
.controls {
  display: grid;
  gap: 16px;
}
.search {
  position: relative;
  display: block;
}
.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  translate: 0 -50%;
  color: var(--muted);
}
.search .input {
  padding-left: 44px;
  font-size: 16px;
  border-radius: 999px;
}
.filter-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 12px;
  align-items: start;
}
.filter-row .label {
  padding-top: 7px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tags-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 7px 0 0;
  cursor: pointer;
  text-align: left;
}
.results-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 28px 4px 14px;
  min-height: 32px;
}
.posts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 18px;
  transition: opacity 0.3s;
}
.posts.loading {
  opacity: 0.5;
}
.post-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  text-decoration: none;
  color: var(--text);
  transition: transform 0.4s var(--ease), border-color 0.3s, box-shadow 0.4s;
}
.post-card:hover {
  transform: translateY(-4px);
  border-color: var(--line-strong);
  box-shadow: 0 30px 60px -30px rgba(109, 79, 216, 0.6);
  color: var(--text);
}
.post-cover {
  height: 170px;
  overflow: hidden;
  border-bottom: 1px solid var(--line);
}
.post-cover .gen-cover {
  height: 100%;
  opacity: 0.85;
}
.post-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(0.85);
  transition: transform 0.8s var(--ease), filter 0.4s;
}
.post-card:hover .post-cover .gen-cover {
  height: 100%;
  opacity: 0.85;
}
.post-cover img {
  transform: scale(1.04);
  filter: saturate(1);
}
.post-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px 22px 22px;
  flex: 1;
}
.post-title {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.3;
  margin: 2px 0 0;
}
.post-excerpt {
  margin: 0;
  color: var(--text-soft);
  font-size: 15px;
  font-weight: 300;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.post-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--muted);
}
.post-meta > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.post-tags {
  gap: 8px !important;
  color: var(--violet);
}
.empty {
  grid-column: 1 / -1;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-top: 36px;
}
@media (max-width: 640px) {
  .filter-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .filter-row .label {
    padding-top: 0;
  }
  .posts {
    grid-template-columns: 1fr;
  }
  .pager {
    gap: 10px;
  }
}
</style>
