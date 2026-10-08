<script setup>
// El ordenador de a bordo: un panel de búsqueda que encuentra estancias, entradas de la bitácora,
// etiquetas y cualquier cosa de la colección, y lleva hasta ello.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import { KIND_LABELS, debounce, postUrl } from '../util.js'
import { paletteOpen, openPalette, closePalette } from '../palette.js'
import { itemLink } from '../useItemLink.js'
import AppIcon from './AppIcon.vue'
import GenCover from './GenCover.vue'

const router = useRouter()
const input = ref(null)
const q = ref('')
const found = ref({ posts: [], items: [], tags: [], more: 0 })
const loading = ref(false)
const cursor = ref(0)
let seq = 0

const ROOMS = [
  { to: '/', label: 'Puente', icon: 'ship', hint: 'La portada de la nave' },
  { to: '/blog', label: 'Bitácora', icon: 'log', hint: 'Las entradas del blog' },
  { to: '/sala-de-juegos', label: 'Sala de juegos', icon: 'dice', hint: 'Las Kallax de juegos y libros de rol' },
  { to: '/sala-de-proyeccion', label: 'Sala de proyección', icon: 'film', hint: 'Pelis y series' },
  { to: '/biblioteca', label: 'Biblioteca', icon: 'book', hint: 'Libros y manga' },
  { to: '/sala-recreativa', label: 'Sala recreativa', icon: 'gamepad', hint: 'Videojuegos' },
  { to: '/consola', label: 'Consola', icon: 'console', hint: 'Para pilotar la nave' },
]

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const fetchResults = debounce(async (text) => {
  const mine = ++seq
  try {
    const res = await api.search(text)
    if (mine === seq) found.value = res
  } catch {
    if (mine === seq) found.value = { posts: [], items: [], tags: [], more: 0 }
  } finally {
    if (mine === seq) loading.value = false
  }
}, 160)

watch(q, (text) => {
  cursor.value = 0
  if (text.trim().length < 2) {
    seq++
    loading.value = false
    found.value = { posts: [], items: [], tags: [], more: 0 }
    return
  }
  loading.value = true
  fetchResults(text.trim())
})

// Todo lo que se puede elegir, en el orden en que se ve, para moverse con las flechas.
const groups = computed(() => {
  const text = norm(q.value.trim())
  const out = []
  const rooms = ROOMS.filter((r) => !text || norm(`${r.label} ${r.hint}`).includes(text))
  if (rooms.length) out.push({ label: 'Estancias', entries: rooms.map((r) => ({ kind: 'room', ...r, to: r.to })) })
  if (found.value.posts.length) {
    out.push({ label: 'Bitácora', entries: found.value.posts.map((p) => ({ kind: 'post', label: p.title, hint: p.snippet || p.category, icon: 'log', to: postUrl(p), draft: p.status === 'draft' })) })
  }
  if (found.value.tags.length) {
    out.push({ label: 'Etiquetas', entries: found.value.tags.map((t) => ({ kind: 'tag', label: `#${t.name}`, hint: `${t.n} entradas`, icon: 'tag', to: { path: '/blog', query: { tag: t.name } } })) })
  }
  if (found.value.items.length) {
    const byKind = new Map()
    for (const it of found.value.items) {
      if (!byKind.has(it.kind)) byKind.set(it.kind, [])
      byKind.get(it.kind).push(it)
    }
    for (const [kind, items] of byKind) {
      out.push({
        label: KIND_LABELS[kind] + (items.length > 1 && !KIND_LABELS[kind].endsWith('s') ? 's' : ''),
        entries: items.map((it) => ({ kind: 'item', item: it, label: it.title, hint: [it.creator, it.year, it.platform].filter(Boolean).join(' · '), to: itemLink(it) })),
      })
    }
  }
  if (text.length >= 2) {
    out.push({ label: 'Más', entries: [{ kind: 'more', label: `Buscar «${q.value.trim()}» en toda la bitácora`, icon: 'search', to: { path: '/blog', query: { q: q.value.trim() } } }] })
  }
  return out
})
const flat = computed(() => groups.value.flatMap((g) => g.entries))
const indexOf = (entry) => flat.value.indexOf(entry)

function go(entry) {
  if (!entry) return
  closePalette()
  router.push(entry.to)
}

function onKey(e) {
  if (e.key === 'Escape') { closePalette(); return }
  if (e.key === 'ArrowDown') { e.preventDefault(); cursor.value = (cursor.value + 1) % Math.max(1, flat.value.length) }
  if (e.key === 'ArrowUp') { e.preventDefault(); cursor.value = (cursor.value - 1 + flat.value.length) % Math.max(1, flat.value.length) }
  if (e.key === 'Enter') { e.preventDefault(); go(flat.value[cursor.value]) }
}

watch(cursor, async () => {
  await nextTick()
  document.querySelector('.palette .entry.current')?.scrollIntoView({ block: 'nearest' })
})

watch(paletteOpen, async (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
  if (open) {
    q.value = ''
    await nextTick()
    input.value?.focus()
  }
})

function globalKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    paletteOpen.value ? closePalette() : openPalette()
    return
  }
  if (paletteOpen.value) return
  const tag = document.activeElement?.tagName
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable
  if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    openPalette()
  }
}

onMounted(() => window.addEventListener('keydown', globalKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', globalKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="palette">
      <div v-if="paletteOpen" class="palette-overlay" @click.self="closePalette">
        <div class="palette panel" role="dialog" aria-modal="true" aria-label="Ordenador de a bordo">
          <div class="search-row">
            <AppIcon name="search" :size="18" class="search-icon" />
            <input
              ref="input"
              v-model="q"
              class="search-input"
              type="search"
              placeholder="Buscar en toda la nave: entradas, pelis, libros, cajas, juegos…"
              autocomplete="off"
              spellcheck="false"
              @keydown="onKey"
            />
            <span v-if="loading" class="readout">buscando…</span>
            <kbd v-else class="kbd">Esc</kbd>
          </div>

          <div class="results">
            <section v-for="g in groups" :key="g.label" class="group">
              <p class="group-label">{{ g.label }}</p>
              <button
                v-for="entry in g.entries"
                :key="g.label + (entry.label || '') + (entry.item?.id || '')"
                type="button"
                class="entry"
                :class="{ current: indexOf(entry) === cursor }"
                @mouseenter="cursor = indexOf(entry)"
                @click="go(entry)"
              >
                <span v-if="entry.kind === 'item'" class="thumb" :class="entry.item.kind"><GenCover :item="entry.item" :ratio="entry.item.kind === 'boardgame' ? '1 / 1' : '2 / 3'" :show-text="false" /></span>
                <span v-else class="entry-icon"><AppIcon :name="entry.icon" :size="17" /></span>
                <span class="entry-text">
                  <span class="entry-label">{{ entry.label }} <span v-if="entry.draft" class="pill pill-warn">Borrador</span></span>
                  <span v-if="entry.hint" class="entry-hint">{{ entry.hint }}</span>
                </span>
                <AppIcon name="arrow-right" :size="14" class="entry-arrow" />
              </button>
            </section>
            <p v-if="q.trim().length >= 2 && !loading && !found.posts.length && !found.items.length && !found.tags.length" class="nothing">
              Nada a bordo con «{{ q.trim() }}». Prueba con otra palabra.
            </p>
            <p v-if="found.more" class="nothing">…y {{ found.more }} más de la colección. Afina la búsqueda para verlos.</p>
          </div>

          <footer class="palette-foot readout">
            <span><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> moverse</span>
            <span><kbd class="kbd">↵</kbd> abrir</span>
            <span><kbd class="kbd">Ctrl</kbd><kbd class="kbd">K</kbd> desde cualquier sitio</span>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.palette-overlay {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: min(12vh, 110px) 16px 16px;
  background: rgba(4, 2, 10, 0.72);
  backdrop-filter: blur(8px);
}
.palette {
  width: min(680px, 100%);
  max-height: calc(100vh - min(12vh, 110px) - 16px);
  display: flex;
  flex-direction: column;
  background: rgba(16, 10, 34, 0.96);
  overflow: hidden;
}
.search-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
}
.search-icon {
  color: var(--violet);
}
.search-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  font-size: 17px;
  padding: 6px 0;
  color: var(--text);
}
.search-input:focus {
  outline: none;
}
.search-input::placeholder {
  color: var(--muted);
}
.search-input::-webkit-search-cancel-button {
  display: none;
}
.kbd {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid var(--line-strong);
  color: var(--muted);
  margin-right: 4px;
  text-transform: none;
  letter-spacing: 0;
}
.results {
  overflow-y: auto;
  padding: 8px;
  flex: 1;
}
.group {
  margin-bottom: 6px;
}
.group-label {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 8px 12px 4px;
}
.entry {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: none;
  border-radius: 10px;
  background: none;
  text-align: left;
  cursor: pointer;
  color: var(--text);
}
.entry.current {
  background: rgba(161, 132, 255, 0.16);
}
.entry-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 10px;
  color: var(--lavender);
  background: rgba(161, 132, 255, 0.1);
}
.thumb {
  width: 30px;
  flex: none;
  border-radius: 4px;
  overflow: hidden;
}
.thumb.boardgame {
  width: 36px;
}
.entry-text {
  display: grid;
  gap: 1px;
  min-width: 0;
  flex: 1;
}
.entry-label {
  font-size: 15px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.entry-label .pill {
  font-size: 10px;
  padding: 0 7px;
  margin-left: 6px;
}
.entry-hint {
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.entry-arrow {
  color: var(--muted);
  opacity: 0;
  transition: opacity 0.2s;
}
.entry.current .entry-arrow {
  opacity: 1;
}
.nothing {
  margin: 10px 12px 14px;
  color: var(--muted);
  font-size: 14px;
}
.palette-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  padding: 10px 18px;
  border-top: 1px solid var(--line);
  text-transform: none;
  letter-spacing: 0.04em;
}
.palette-enter-active,
.palette-leave-active {
  transition: opacity 0.2s var(--ease);
}
.palette-enter-active .palette,
.palette-leave-active .palette {
  transition: transform 0.3s var(--ease);
}
.palette-enter-from,
.palette-leave-to {
  opacity: 0;
}
.palette-enter-from .palette {
  transform: translateY(-10px) scale(0.985);
}
@media (max-width: 640px) {
  .palette-overlay {
    padding: 12px;
  }
  .palette-foot {
    display: none;
  }
  .search-input {
    font-size: 16px;
  }
}
</style>
