<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '../api.js'
import { formatDate, postUrl, scrollToId, stardate } from '../util.js'
import AppIcon from '../components/AppIcon.vue'
import SpaceScene from '../components/SpaceScene.vue'
import ShipProw from '../components/ShipProw.vue'

const stats = ref(null)
// Si el navegador no tiene WebGL, el ventanal vuelve al planeta plano de CSS y a la proa en SVG.
const flat = ref(false)
const now = ref(new Date())
let timer

onMounted(async () => {
  timer = setInterval(() => { now.value = new Date() }, 1000)
  stats.value = await api.stats()
})
onBeforeUnmount(() => clearInterval(timer))

const shipTime = computed(() => new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now.value))

const rooms = computed(() => {
  const s = stats.value
  const n = (k) => s?.items?.[k] ?? 0
  return [
    {
      to: '/blog', icon: 'log', name: 'Bitácora',
      text: 'El cuaderno del capitán: diarios, relatos, partidas de rol y lo que se cruce por el camino.',
      count: s ? `${s.posts} entradas` : '', accent: '#a184ff',
    },
    {
      to: '/sala-de-juegos', icon: 'dice', name: 'Sala de juegos',
      text: 'Las dos Kallax de los juegos de mesa y los libros de rol, colocadas caja a caja como en casa.',
      count: s ? `${n('boardgame')} cajas · ${n('rpg')} libros de rol` : '', accent: '#e39be0',
    },
    {
      to: '/sala-de-proyeccion', icon: 'film', name: 'Sala de proyección',
      text: 'La estantería de pelis y series para las noches largas entre estrellas.',
      count: s ? `${n('film')} pelis · ${n('series')} series` : '', accent: '#8be3e0',
    },
    {
      to: '/biblioteca', icon: 'book', name: 'Biblioteca',
      text: 'Libros y mangas ordenados por baldas, con sus lomos y sus tomos.',
      count: s ? `${n('book')} libros · ${s.manga_volumes} tomos` : '', accent: '#ffcf8a',
    },
  ]
})

const signals = [
  { href: 'https://boardgamegeek.com/user/lordmalkev', label: 'BoardGameGeek' },
  { href: 'https://dragoncojo.com', label: 'El Dragón Cojo' },
  { href: 'https://steamcommunity.com/id/Malkev', label: 'Steam' },
  { href: 'https://www.youtube.com/channel/UCC4JkcfvUApqaq2hRmJpX0Q', label: 'YouTube' },
  { href: 'https://anilist.co/user/Malkev/', label: 'AniList' },
]
</script>

<template>
  <main class="page home">
    <section class="viewport" aria-label="Ventanal del puente">
      <div class="window" :class="{ flat }">
        <SpaceScene v-if="!flat" @unsupported="flat = true" />
        <template v-else>
          <div class="planet" aria-hidden="true">
            <div class="planet-surface"></div>
            <div class="planet-shadow"></div>
          </div>
          <div class="moon" aria-hidden="true"></div>
        </template>
        <ShipProw v-if="flat" />
        <div class="window-glare" aria-hidden="true"></div>

        <div class="hero">
          <p class="eyebrow"><span class="dot-live"></span>A bordo · navegando en silencio</p>
          <h1 class="hero-title">LA MALKEVNIA</h1>
          <p class="hero-lead">Una nave pequeña, un solo tripulante y muchas cosas que contar. Ponte cómodo, que aquí no hay prisa.</p>
          <div class="hero-actions">
            <RouterLink to="/blog" class="btn btn-primary">
              <AppIcon name="log" :size="16" /> Abrir la bitácora
            </RouterLink>
            <button type="button" class="btn" @click="scrollToId('estancias')">Recorrer la nave</button>
          </div>
        </div>
      </div>

      <div class="hud">
        <div class="readout">Nave <strong>La Malkevnia</strong></div>
        <div class="readout">Rumbo <strong>ninguno en particular</strong></div>
        <div class="readout">Velocidad <strong>de crucero</strong></div>
        <div class="readout">Tripulación <strong>1</strong></div>
        <div class="readout">Fecha estelar <strong>{{ stardate(now) }}</strong></div>
        <div class="readout">Hora de a bordo <strong>{{ shipTime }}</strong></div>
      </div>
    </section>

    <section id="estancias" class="rooms-section">
      <p class="eyebrow">Plano de la nave</p>
      <h2 class="section-title">Estancias</h2>
      <div class="rooms">
        <RouterLink v-for="room in rooms" :key="room.to" :to="room.to" class="room panel" :style="{ '--accent': room.accent }">
          <span class="room-icon"><AppIcon :name="room.icon" :size="24" /></span>
          <span class="room-name">{{ room.name }}</span>
          <span class="room-text">{{ room.text }}</span>
          <span class="room-foot">
            <span class="readout">{{ room.count }}</span>
            <AppIcon name="arrow-right" :size="18" class="room-arrow" />
          </span>
        </RouterLink>
      </div>
    </section>

    <section v-if="stats?.latest?.length" class="latest">
      <div class="latest-head">
        <div>
          <p class="eyebrow">Últimas anotaciones</p>
          <h2 class="section-title">En la bitácora</h2>
        </div>
        <RouterLink to="/blog" class="btn btn-sm">Ver todas <AppIcon name="arrow-right" :size="14" /></RouterLink>
      </div>
      <div class="latest-list">
        <RouterLink v-for="post in stats.latest" :key="post.id" :to="postUrl(post)" class="latest-item panel">
          <span class="readout">{{ formatDate(post.published_at) }} · {{ post.category }}</span>
          <strong>{{ post.title }}</strong>
          <span class="muted">{{ post.excerpt }}</span>
        </RouterLink>
      </div>
    </section>

    <footer class="signals">
      <span class="readout">Señales que llegan de fuera</span>
      <div class="signal-list">
        <a v-for="s in signals" :key="s.href" :href="s.href" target="_blank" rel="noopener noreferrer" class="chip">
          {{ s.label }} <AppIcon name="external" :size="12" />
        </a>
      </div>
    </footer>
  </main>
</template>

<style scoped>
.home {
  padding-top: calc(var(--header-h) + 20px);
}
.viewport {
  margin-bottom: 72px;
}
.window {
  position: relative;
  min-height: min(76vh, 680px);
  border-radius: 48px;
  overflow: hidden;
  display: flex;
  align-items: center;
  padding: clamp(28px, 6vw, 72px);
  border: 1px solid var(--line-strong);
  box-shadow:
    0 0 0 10px rgba(20, 13, 40, 0.85),
    0 0 0 11px var(--line),
    inset 0 0 120px rgba(4, 2, 10, 0.9),
    0 40px 120px -40px rgba(109, 79, 216, 0.5);
  background: radial-gradient(circle at 75% 50%, rgba(109, 79, 216, 0.16), transparent 60%);
}
.window-glare {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(55% 75% at 22% 55%, rgba(4, 2, 10, 0.4), transparent 70%),
    radial-gradient(120% 90% at 50% 120%, rgba(4, 2, 10, 0.5), transparent 60%);
  box-shadow: inset 0 0 90px rgba(4, 2, 10, 0.85);
}
.hero {
  z-index: 1;
}
.planet {
  position: absolute;
  right: -8%;
  top: 50%;
  width: min(58vw, 620px);
  aspect-ratio: 1;
  translate: 0 -50%;
  border-radius: 50%;
  overflow: hidden;
  box-shadow:
    0 0 80px 10px rgba(161, 132, 255, 0.25),
    inset 0 0 40px rgba(212, 196, 255, 0.25);
}
.planet-surface {
  position: absolute;
  inset: 0;
  width: 200%;
  background:
    repeating-linear-gradient(172deg, transparent 0 18px, rgba(255, 255, 255, 0.04) 18px 30px),
    linear-gradient(176deg, #5b3fb0 0%, #7b5bd6 18%, #3a2582 32%, #9b7ae8 44%, #4c2f99 58%, #6c4fc8 72%, #2f1d6b 86%, #5a3dad 100%);
  animation: spin 160s linear infinite;
}
.planet-shadow {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 35%, transparent 0%, transparent 35%, rgba(4, 2, 10, 0.55) 62%, rgba(4, 2, 10, 0.95) 85%);
}
.moon {
  position: absolute;
  right: 44%;
  top: 16%;
  width: 46px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #efe6ff, #a99cc9 55%, #2a1f45 100%);
  box-shadow: 0 0 20px rgba(212, 196, 255, 0.35);
  animation: orbit 60s ease-in-out infinite alternate;
}
@keyframes spin {
  to { transform: translateX(-50%); }
}
@keyframes orbit {
  to { transform: translate(-60px, 26px) scale(0.85); }
}
.hero {
  position: relative;
  max-width: 100%;
}
.hero-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(34px, 6.2vw, 84px);
  letter-spacing: 0.12em;
  width: max-content;
  max-width: 100%;
  padding-bottom: 0.08em;
  line-height: 1;
  margin: 8px 0 20px;
  background: linear-gradient(180deg, #fff 0%, var(--lavender) 55%, var(--violet) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 0 60px rgba(161, 132, 255, 0.35);
  filter: drop-shadow(0 4px 18px rgba(4, 2, 10, 0.9));
}
.hero-lead {
  font-size: clamp(17px, 2vw, 20px);
  font-weight: 300;
  color: var(--text-soft);
  margin: 0 0 28px;
  max-width: 44ch;
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.hud {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px 32px;
  margin-top: 28px;
  padding: 0 12px;
}
.section-title {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: 0.06em;
  font-size: 26px;
  margin: 0 0 24px;
}
.rooms {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 18px;
}
.room {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px;
  min-height: 230px;
  text-decoration: none;
  color: var(--text);
  transition: transform 0.4s var(--ease), border-color 0.3s, box-shadow 0.4s;
  overflow: hidden;
}
.room::after {
  content: '';
  position: absolute;
  inset: auto -30% -60% auto;
  width: 220px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 30%, transparent), transparent);
  transition: transform 0.6s var(--ease);
}
.room:hover {
  transform: translateY(-4px);
  border-color: color-mix(in srgb, var(--accent) 60%, transparent);
  box-shadow: 0 24px 60px -30px color-mix(in srgb, var(--accent) 60%, transparent);
  color: var(--text);
}
.room:hover::after {
  transform: scale(1.3);
}
.room-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
}
.room-name {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-top: 6px;
}
.room-text {
  color: var(--text-soft);
  font-size: 15px;
  font-weight: 300;
  flex: 1;
}
.room-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  z-index: 1;
}
.room-arrow {
  color: var(--accent);
  transition: transform 0.3s var(--ease);
}
.room:hover .room-arrow {
  transform: translateX(4px);
}
.latest {
  margin-top: 72px;
}
.latest-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.latest-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 18px;
}
.latest-item {
  display: grid;
  gap: 8px;
  align-content: start;
  padding: 22px;
  text-decoration: none;
  color: var(--text);
  transition: border-color 0.3s, transform 0.4s var(--ease);
}
.latest-item strong {
  font-size: 18px;
  font-weight: 600;
}
.latest-item .muted {
  font-size: 15px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.latest-item:hover {
  border-color: var(--line-strong);
  transform: translateY(-3px);
  color: var(--text);
}
.signals {
  margin-top: 80px;
  display: grid;
  justify-items: center;
  gap: 14px;
}
.signal-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
@media (max-width: 720px) {
  .window {
    border-radius: 32px;
    min-height: 600px;
    align-items: flex-end;
  }
  .hero {
    padding-bottom: 76px;
  }
  .hero-lead {
    text-shadow: 0 2px 12px rgba(4, 2, 10, 0.9);
  }
  .window-glare {
    background:
      linear-gradient(0deg, rgba(4, 2, 10, 0.85) 0%, rgba(4, 2, 10, 0.45) 40%, transparent 65%);
  }
  .planet {
    width: 110vw;
    right: -45%;
    top: 22%;
  }
  .moon {
    right: 70%;
    top: 8%;
  }
}
</style>
