const TZ = 'Europe/Madrid'

export function postUrl(post) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(post.published_at))
      .map((p) => [p.type, p.value])
  )
  return `/blog/${parts.year}/${parts.month}/${parts.day}/${post.slug}`
}

export function formatDate(iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!iso) return ''
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)
  return new Intl.DateTimeFormat('es-ES', { timeZone: TZ, ...opts }).format(d)
}

// Fecha estelar de broma: año + día del año con decimales.
export function stardate(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const day = (date - start) / 86400000
  return `${date.getUTCFullYear()}.${String(Math.floor(day)).padStart(3, '0')}${(day % 1).toFixed(2).slice(1)}`
}

export function hash(str) {
  let h = 2166136261
  for (const ch of String(str)) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Número pseudoaleatorio estable entre 0 y 1 a partir de un texto.
export function seeded(str, salt = '') {
  return (hash(`${str}${salt}`) % 10000) / 10000
}

export function fallbackColor(title) {
  const hue = 240 + (hash(title) % 90) // violetas, malvas y azules
  return `hsl(${hue} 45% 32%)`
}

function toRgb(color) {
  if (!color) return [60, 40, 110]
  if (color.startsWith('#')) {
    const hex = color.length === 4 ? color.slice(1).split('').map((c) => c + c).join('') : color.slice(1, 7)
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  }
  const m = color.match(/hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/)
  if (m) {
    const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100]
    const k = (n) => (n + h / 30) % 12
    const a = s * Math.min(l, 1 - l)
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
    return [f(0), f(8), f(4)].map((v) => Math.round(v * 255))
  }
  return [60, 40, 110]
}

export function isLight(color, threshold = 0.62) {
  const [r, g, b] = toRgb(color)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > threshold
}

export function shade(color, amount) {
  const [r, g, b] = toRgb(color)
  const mix = (c) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)
  return `rgb(${mix(r)} ${mix(g)} ${mix(b)})`
}

export const KIND_LABELS = {
  boardgame: 'Juego de mesa',
  rpg: 'Libro de rol',
  film: 'Película',
  series: 'Serie',
  book: 'Libro',
  manga: 'Manga',
  videogame: 'Videojuego',
}

// Proporción de la carátula según el tipo (y, en los videojuegos, según la plataforma).
const LANDSCAPE = /super nintendo|nintendo 64|atari|super famicom|intellivision|colecovision/i
const SQUARE = /playstation|dreamcast|saturn|pc engine|turbografx|neo geo cd|sega cd|mega-cd|psp|3do|philips cd-i/i
export function coverRatio(item) {
  if (item.kind === 'boardgame') return '1 / 1'
  if (item.kind !== 'videogame') return '2 / 3'
  const platform = item.meta?.platform || ''
  return LANDSCAPE.test(platform) ? '7 / 5' : SQUARE.test(platform) ? '1 / 1' : '5 / 7'
}

export function formatPlayTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h ? `${h} h ${m ? `${m} min` : ''}`.trim() : `${m} min`
}

export const STATUS_LABELS = {
  owned: 'En la colección',
  wishlist: 'Lo quiero',
  playing: 'Jugando ahora',
  reading: 'Leyendo ahora',
  watching: 'Viéndola ahora',
  done: 'Terminado',
  lent: 'Prestado',
}
export const STATUS_BY_KIND = {
  boardgame: ['owned', 'playing', 'wishlist', 'lent'],
  rpg: ['owned', 'playing', 'reading', 'wishlist', 'lent'],
  film: ['owned', 'watching', 'done', 'wishlist', 'lent'],
  series: ['owned', 'watching', 'done', 'wishlist', 'lent'],
  book: ['owned', 'reading', 'done', 'wishlist', 'lent'],
  manga: ['owned', 'reading', 'done', 'wishlist', 'lent'],
  videogame: ['owned', 'playing', 'done', 'wishlist'],
}

export const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Cuenta cuántos hay de cada valor (la clave puede devolver varios valores a la vez).
export function countBy(list, key) {
  const map = new Map()
  for (const x of list) for (const k of [].concat(key(x))) if (k !== null && k !== undefined && k !== '') map.set(k, (map.get(k) || 0) + 1)
  return map
}

export function debounce(fn, ms = 300) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

export function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

// En la demo publicada los diálogos del navegador no aparecen, así que allí se confirma solo.
export function confirmAction(message) {
  return import.meta.env.MODE === 'demo' ? true : window.confirm(message)
}

export function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
