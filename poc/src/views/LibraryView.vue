<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api.js'
import { fallbackColor, isLight, seeded, shade } from '../util.js'
import ItemModal from '../components/ItemModal.vue'
import ShelfRows from '../components/ShelfRows.vue'

const items = ref([])
const selected = ref(null)

onMounted(async () => {
  items.value = await api.items('book,manga')
})

const books = computed(() => items.value.filter((i) => i.kind === 'book'))
const manga = computed(() => items.value.filter((i) => i.kind === 'manga'))

// Cada tomo de manga es un lomo independiente que apunta a su serie.
const volumes = computed(() => manga.value.flatMap((series) =>
  Array.from({ length: Math.max(1, series.meta?.volumes_owned || 1) }, (_, i) => ({
    key: `${series.id}-${i + 1}`,
    number: i + 1,
    series,
  }))
))

const bookWidth = (b) => Math.round(Math.min(64, Math.max(22, (b.meta?.pages || 300) / 17)))
const bookHeight = (b) => Math.round(196 + seeded(b.title, 'h') * 56)

function colors(item) {
  const c = item.color || fallbackColor(item.title)
  return {
    '--c': c,
    '--c-dark': shade(c, -0.5),
    '--c-light': shade(c, 0.22),
    color: isLight(c) ? '#1a1030' : '#f6f2ff',
  }
}

const bookStyle = (b) => ({ ...colors(b), width: `${bookWidth(b)}px`, height: `${bookHeight(b)}px` })
const volumeStyle = (v) => colors(v.series)

const totalPages = computed(() => books.value.reduce((s, b) => s + (b.meta?.pages || 0), 0))
</script>

<template>
  <main class="page">
    <header class="page-head">
      <p class="eyebrow">Cubierta 3 · Biblioteca</p>
      <h1 class="page-title">Biblioteca</h1>
      <p class="page-lead">El rincón más silencioso de la nave. {{ books.length }} libros que suman {{ totalPages.toLocaleString('es-ES') }} páginas y {{ volumes.length }} tomos de manga.</p>
    </header>

    <section class="bookcase panel" aria-labelledby="h-books">
      <h2 id="h-books" class="case-label"><span class="eyebrow">Libros</span></h2>
      <ShelfRows :items="books" :width-of="bookWidth" :gap="2" :padding="36">
        <template #row="{ row }">
          <div class="shelf">
            <div class="spines">
              <button v-for="b in row" :key="b.id" class="book" :style="bookStyle(b)" :title="`${b.title} · ${b.creator}`" @click="selected = b">
                <span class="book-band top"></span>
                <span class="book-title">{{ b.title }}</span>
                <span class="book-author">{{ b.creator.split(' ').slice(-1)[0] }}</span>
                <span class="book-band bottom"></span>
              </button>
            </div>
            <div class="plank" aria-hidden="true"></div>
          </div>
        </template>
      </ShelfRows>
    </section>

    <section class="bookcase panel manga-case" aria-labelledby="h-manga">
      <h2 id="h-manga" class="case-label"><span class="eyebrow">Manga</span></h2>
      <ShelfRows :items="volumes" :width-of="() => 19" :gap="1" :padding="36">
        <template #row="{ row }">
          <div class="shelf">
            <div class="spines">
              <button
                v-for="v in row"
                :key="v.key"
                class="volume"
                :class="{ first: v.number === 1 }"
                :style="volumeStyle(v)"
                :title="`${v.series.title}, tomo ${v.number}`"
                @click="selected = v.series"
              >
                <span class="volume-num">{{ v.number }}</span>
                <span class="volume-title">{{ v.series.title }}</span>
                <span class="volume-mark"></span>
              </button>
            </div>
            <div class="plank" aria-hidden="true"></div>
          </div>
        </template>
      </ShelfRows>
    </section>

    <ItemModal :item="selected" @close="selected = null" />
  </main>
</template>

<style scoped>
.bookcase {
  padding: 22px 0 26px;
  margin-bottom: 28px;
  background:
    radial-gradient(70% 40% at 50% 0%, rgba(255, 207, 138, 0.07), transparent 70%),
    rgba(12, 7, 26, 0.75);
}
.case-label {
  margin: 0 36px;
}
.shelf {
  padding: 26px 36px 0;
}
.spines {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  min-height: 252px;
}
.manga-case .spines {
  gap: 1px;
  min-height: 186px;
}
.book {
  position: relative;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0;
  border: none;
  border-radius: 3px 3px 2px 2px;
  cursor: pointer;
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.4) 0%, transparent 20%, rgba(255, 255, 255, 0.16) 42%, transparent 62%, rgba(0, 0, 0, 0.45) 100%),
    linear-gradient(180deg, var(--c-light), var(--c) 20%, var(--c) 80%, var(--c-dark));
  transition: transform 0.45s var(--ease), filter 0.3s;
  transform-origin: bottom left;
}
.book-band {
  width: 100%;
  height: 3px;
  flex: none;
  border-top: 1px solid rgba(255, 220, 160, 0.55);
  border-bottom: 1px solid rgba(255, 220, 160, 0.55);
}
.book-band.top {
  margin: 6px 0 12px;
}
.book-band.bottom {
  margin-top: 10px;
}
.book-title {
  flex: 1;
  writing-mode: vertical-rl;
  rotate: 180deg;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 12.5px;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-height: 170px;
}
.book-author {
  writing-mode: vertical-rl;
  rotate: 180deg;
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.75;
  margin-top: 8px;
  max-height: 60px;
  overflow: hidden;
}
.book:hover,
.book:focus-visible {
  transform: translateY(-10px) rotate(-3deg);
  filter: brightness(1.15) drop-shadow(0 0 12px rgba(255, 207, 138, 0.35));
  z-index: 2;
}
.volume {
  position: relative;
  flex: none;
  width: 18px;
  height: 176px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 0 6px;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.35), transparent 30%, rgba(255, 255, 255, 0.14) 55%, rgba(0, 0, 0, 0.35)),
    linear-gradient(180deg, var(--c-light), var(--c) 40%, var(--c-dark));
  transition: transform 0.4s var(--ease), filter 0.3s;
}
.volume.first {
  margin-left: 6px;
}
.volume-num {
  width: 100%;
  height: 22px;
  flex: none;
  display: grid;
  place-items: center;
  background: #f4f0ff;
  color: #1a1030;
  font-family: var(--font-display);
  font-size: 9px;
  font-weight: 700;
  border-radius: 2px 2px 0 0;
}
.volume-title {
  flex: 1;
  writing-mode: vertical-rl;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-height: 128px;
  margin-top: 8px;
}
.volume-mark {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1px solid currentColor;
  opacity: 0.6;
  flex: none;
}
.volume:hover,
.volume:focus-visible {
  transform: translateY(-10px);
  filter: brightness(1.2) drop-shadow(0 0 10px rgba(161, 132, 255, 0.5));
  z-index: 2;
}
.plank {
  height: 12px;
  margin: 0 -36px;
  background: linear-gradient(180deg, rgba(255, 220, 170, 0.28), rgba(80, 55, 120, 0.6) 40%, rgba(20, 13, 40, 0.92));
  box-shadow: 0 10px 30px -6px rgba(255, 207, 138, 0.25), 0 2px 0 rgba(255, 207, 138, 0.4);
}
@media (max-width: 640px) {
  .shelf {
    padding: 22px 16px 0;
  }
  .plank {
    margin: 0 -16px;
  }
  .case-label {
    margin: 0 16px;
  }
}
</style>
