<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import GenCover from './GenCover.vue'
import RatingBar from './RatingBar.vue'
import AppIcon from './AppIcon.vue'
import { KIND_LABELS, STATUS_LABELS } from '../util.js'

const props = defineProps({ item: { type: Object, default: null } })
const emit = defineEmits(['close'])
const closeBtn = ref(null)

const FORMAT = { bluray: 'Blu-ray', '4k': '4K UHD', dvd: 'DVD' }

const facts = computed(() => {
  const it = props.item
  if (!it) return []
  const m = it.meta || {}
  const out = []
  if (it.creator) out.push([it.kind === 'boardgame' ? 'Diseño' : it.kind === 'film' ? 'Dirección' : 'Autoría', it.creator])
  if (it.year) out.push(['Año', it.year])
  if (m.players) out.push(['Jugadores', m.players])
  if (m.minutes) out.push(['Duración', `${m.minutes} min`])
  if (m.format) out.push(['Formato', FORMAT[m.format] || m.format])
  if (m.seasons) out.push(['Temporadas', m.seasons])
  if (m.pages) out.push(['Páginas', m.pages])
  if (m.volumes_owned) out.push(['Tomos', m.volumes_total ? `${m.volumes_owned} de ${m.volumes_total}` : m.volumes_owned])
  if (m.location) out.push(['Dónde está', m.location])
  if (m.dot) out.push(['Pegatina', m.dot])
  out.push(['Estado', STATUS_LABELS[it.status] || it.status])
  return out
})

const ratio = computed(() => (props.item?.kind === 'boardgame' ? '1 / 1' : '2 / 3'))

function onKey(e) {
  if (e.key === 'Escape') emit('close')
}

watch(() => props.item, async (it) => {
  if (it) {
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    await nextTick()
    closeBtn.value?.focus()
  } else {
    window.removeEventListener('keydown', onKey)
    document.body.style.overflow = ''
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="item" class="overlay" @click.self="emit('close')">
        <article class="modal panel" role="dialog" aria-modal="true" :aria-label="item.title">
          <button ref="closeBtn" class="btn btn-ghost btn-icon close" @click="emit('close')">
            <AppIcon name="close" />
            <span class="sr-only">Cerrar</span>
          </button>
          <div class="cover-wrap" :class="item.kind">
            <GenCover :item="item" :ratio="ratio" />
          </div>
          <div class="info">
            <p class="eyebrow">{{ KIND_LABELS[item.kind] }}<template v-if="item.featured"> · Favorito</template></p>
            <h2 class="title">{{ item.title }}</h2>
            <RatingBar :value="item.rating" />
            <dl class="facts">
              <template v-for="[k, v] in facts" :key="k">
                <dt>{{ k }}</dt>
                <dd>{{ v }}</dd>
              </template>
            </dl>
            <div v-if="item.meta?.volumes_total" class="volumes" aria-hidden="true">
              <span v-for="i in item.meta.volumes_total" :key="i" :class="{ on: i <= item.meta.volumes_owned }"></span>
            </div>
            <p v-if="item.meta?.postit" class="postit"><span class="readout">Pósit</span>{{ item.meta.postit }}</p>
            <p v-if="item.meta?.doubt" class="doubt"><span class="readout">Duda al leer la foto</span>{{ item.meta.doubt }}</p>
            <p v-if="item.notes" class="notes">{{ item.notes }}</p>
            <p v-else class="notes muted">Todavía no hay notas sobre este. Se pueden añadir desde la consola.</p>
          </div>
        </article>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(4, 2, 10, 0.72);
  backdrop-filter: blur(6px);
}
.modal {
  position: relative;
  width: min(820px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
  display: grid;
  grid-template-columns: minmax(200px, 300px) 1fr;
  gap: 32px;
  padding: 32px;
  background: rgba(18, 11, 38, 0.92);
}
.close {
  position: absolute;
  top: 14px;
  right: 14px;
}
.cover-wrap {
  border-radius: 10px;
  overflow: hidden;
  font-size: 22px;
  box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.9), 0 0 0 1px var(--line);
  align-self: start;
}
.title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 26px;
  letter-spacing: 0.03em;
  line-height: 1.2;
  margin: 0 0 14px;
}
.facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 20px;
  margin: 22px 0;
  font-size: 15px;
}
dt {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  padding-top: 2px;
}
dd {
  margin: 0;
  color: var(--text);
}
.volumes {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-bottom: 18px;
}
.volumes span {
  width: 8px;
  height: 18px;
  border-radius: 2px;
  background: rgba(201, 182, 255, 0.12);
}
.volumes span.on {
  background: var(--violet);
}
.postit,
.doubt {
  display: grid;
  gap: 4px;
  margin: 0 0 16px;
  padding: 12px 14px;
  font-size: 15px;
  line-height: 1.5;
}
.postit {
  width: fit-content;
  max-width: 100%;
  background: #ffe678;
  color: #2a2008;
  rotate: -1deg;
  box-shadow: 0 8px 14px -8px rgba(0, 0, 0, 0.8);
}
.postit .readout {
  color: rgba(42, 32, 8, 0.7);
}
.doubt {
  border: 1px dashed rgba(255, 207, 138, 0.5);
  border-radius: var(--radius-sm);
  color: var(--text-soft);
}
.doubt .readout {
  color: var(--amber);
}
.notes {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-soft);
  border-top: 1px solid var(--line);
  padding-top: 16px;
  margin: 0;
}
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s var(--ease);
}
.modal-enter-active .modal,
.modal-leave-active .modal {
  transition: transform 0.4s var(--ease);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal {
  transform: translateY(20px) scale(0.98);
}
@media (max-width: 680px) {
  .modal {
    grid-template-columns: 1fr;
    padding: 24px;
    gap: 20px;
  }
  .cover-wrap {
    width: min(240px, 70%);
    margin: 0 auto;
  }
  .cover-wrap.boardgame {
    width: min(260px, 80%);
  }
}
</style>
