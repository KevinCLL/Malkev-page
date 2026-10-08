// API de la demo publicada: misma interfaz que ../api.js, pero contra una copia de la base de datos
// que viaja dentro de la página. Los cambios viven en memoria y se pierden al recargar.
import snapshot from './snapshot.json'

const state = structuredClone(snapshot)
let nextId = {
  post: Math.max(0, ...state.posts.map((p) => p.id)) + 1,
  comment: Math.max(0, ...state.comments.map((c) => c.id)) + 1,
  item: Math.max(0, ...state.items.map((i) => i.id)) + 1,
}

const PAGE_SIZE = 12
const clone = (v) => structuredClone(v)
const wait = (v) => new Promise((resolve) => setTimeout(() => resolve(clone(v)), 60))
const fail = (message) => Promise.reject(new Error(message))
const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ')
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const strip = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()

function slugify(text) {
  return norm(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'entrada'
}

function uniqueSlug(base, ignoreId) {
  let slug = base
  let n = 2
  while (state.posts.some((p) => p.slug === slug && p.id !== ignoreId)) slug = `${base}-${n++}`
  return slug
}

const visibleComments = (postId) => state.comments.filter((c) => c.post_id === postId && c.status === 'visible')

function summary(p) {
  const { content_html, ...rest } = p
  return {
    ...rest,
    reading_minutes: Math.max(1, Math.ceil(strip(content_html).split(' ').length / 200)),
    comment_count: visibleComments(p.id).length,
  }
}

const byDateDesc = (a, b) => (a.published_at < b.published_at ? 1 : -1)
const published = () => state.posts.filter((p) => p.status === 'published')
const yearOf = (p) => p.published_at.slice(0, 4)

function countBy(list, key) {
  const map = new Map()
  for (const x of list) for (const k of [].concat(key(x))) map.set(k, (map.get(k) || 0) + 1)
  return map
}

function listPosts({ q = '', tag = '', category = '', year = '', all = '', status = '', page = 1 } = {}) {
  let list = all ? [...state.posts] : published()
  if (all && (status === 'draft' || status === 'published')) list = list.filter((p) => p.status === status)
  if (q.trim()) {
    const words = norm(q).split(/\s+/).filter(Boolean)
    list = list.filter((p) => {
      const text = ` ${norm(`${p.title} ${p.excerpt} ${strip(p.content_html)}`)}`
      return words.every((w) => text.includes(` ${w}`) || new RegExp(`[^a-z0-9]${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text))
    })
  }
  if (tag) list = list.filter((p) => p.tags.includes(tag))
  if (category) list = list.filter((p) => p.category === category)
  if (year) list = list.filter((p) => yearOf(p) === String(year))
  list.sort(byDateDesc)
  const pageNum = Math.max(1, Number(page) || 1)
  return {
    total: list.length,
    page: pageNum,
    pages: Math.max(1, Math.ceil(list.length / PAGE_SIZE)),
    posts: list.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE).map(summary),
  }
}

function savePost(data, id = null) {
  const title = String(data.title || '').trim()
  if (!title) return fail('La entrada necesita un título.')
  const content = String(data.content_html || '')
  const fields = {
    title,
    slug: uniqueSlug(slugify(data.slug || title), id),
    excerpt: String(data.excerpt || '').trim() || strip(content).slice(0, 220),
    content_html: content,
    cover: data.cover || null,
    category: String(data.category || 'Varios').trim() || 'Varios',
    status: data.status === 'published' ? 'published' : 'draft',
    published_at: data.published_at || new Date().toISOString(),
    tags: [...new Set((data.tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))].sort(),
    updated_at: nowSql(),
  }
  let post
  if (id) {
    post = state.posts.find((p) => p.id === id)
    if (!post) return fail('Esta entrada no existe.')
    Object.assign(post, fields)
  } else {
    post = { id: nextId.post++, created_at: nowSql(), ...fields }
    state.posts.push(post)
  }
  return wait(summary(post))
}

function itemSort(a, b) {
  const sa = a.shelf ?? 999
  const sb = b.shelf ?? 999
  if (sa !== sb) return sa - sb
  if (a.position !== b.position) return a.position - b.position
  return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' })
}

function saveItem(data, id = null) {
  const title = String(data.title || '').trim()
  if (!title) return fail('Falta el título.')
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
  const rating = num(data.rating)
  const fields = {
    kind: data.kind,
    title,
    creator: String(data.creator || '').trim(),
    year: num(data.year),
    cover_url: data.cover_url || null,
    color: data.color || null,
    rating: rating === null ? null : Math.min(10, Math.max(0, Math.round(rating))),
    status: data.status || 'owned',
    notes: String(data.notes || ''),
    shelf: num(data.shelf),
    position: num(data.position) ?? 0,
    featured: !!data.featured,
    hidden: !!data.hidden,
    meta: clone(data.meta || {}),
    updated_at: nowSql(),
  }
  let item
  if (id) {
    item = state.items.find((i) => i.id === id)
    if (!item) return fail('Ese objeto no existe.')
    Object.assign(item, fields)
  } else {
    item = { id: nextId.item++, created_at: nowSql(), ...fields }
    state.items.push(item)
  }
  return wait(item)
}

// "Ahora mismo": lo que se está leyendo, viendo y jugando, como en el servidor.
const NOW_GROUPS = [
  { key: 'reading', label: 'Leyendo', test: (i) => ['book', 'manga', 'rpg'].includes(i.kind) && i.status === 'reading', order: (a, b) => (a.updated_at < b.updated_at ? 1 : -1) },
  { key: 'watching', label: 'Viendo', test: (i) => ['film', 'series'].includes(i.kind) && i.status === 'watching', order: (a, b) => (a.updated_at < b.updated_at ? 1 : -1) },
  { key: 'playing', label: 'Jugando', test: (i) => ['videogame', 'boardgame', 'rpg'].includes(i.kind) && i.status === 'playing', order: (a, b) => (a.updated_at < b.updated_at ? 1 : -1) },
  { key: 'played', label: 'Última partida', test: (i) => i.kind === 'videogame' && i.meta.last_played, order: (a, b) => (a.meta.last_played < b.meta.last_played ? 1 : -1) },
]
function nowOnBoard() {
  const items = state.items.filter((i) => !i.hidden)
  return NOW_GROUPS.map((g) => {
    const list = items.filter(g.test).sort(g.order)
    return { key: g.key, label: g.label, total: list.length, items: list.slice(0, 6) }
  }).filter((g) => g.total)
}

export const api = {
  // En la demo la consola está abierta: no hay contraseña que crear ni comprobar.
  auth: () => wait({ configured: true, authenticated: true }),
  setup: () => wait({ configured: true, authenticated: true }),
  login: () => wait({ configured: true, authenticated: true }),
  logout: () => wait({ configured: true, authenticated: false }),
  changePassword: () => wait({ configured: true, authenticated: true }),
  backupUrl: '#',
  search(q) {
    const text = norm(q).trim()
    const words = text.split(/\s+/).filter(Boolean)
    if (!words.length) return wait({ posts: [], items: [], tags: [], more: 0 })
    const posts = published()
      .map((p) => ({ p, text: norm(`${p.title} ${p.excerpt} ${strip(p.content_html)}`) }))
      .filter(({ text: t }) => words.every((w) => t.includes(w)))
      .sort((a, b) => (norm(b.p.title).includes(text) ? 1 : 0) - (norm(a.p.title).includes(text) ? 1 : 0) || byDateDesc(a.p, b.p))
      .slice(0, 8)
      .map(({ p, text: t }) => {
        const at = t.indexOf(words[0])
        return { slug: p.slug, title: p.title, category: p.category, status: p.status, published_at: p.published_at, snippet: at >= 0 ? `…${t.slice(Math.max(0, at - 40), at + 60)}…` : p.excerpt }
      })
    const scored = []
    for (const i of state.items) {
      if (i.hidden) continue
      const t = norm(`${i.title} ${i.creator} ${i.meta.platform || ''}`)
      if (!words.every((w) => t.includes(w))) continue
      const nt = norm(i.title)
      scored.push([nt.startsWith(text) ? 0 : nt.includes(text) ? 1 : nt.includes(words[0]) ? 2 : 3, i])
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].title.localeCompare(b[1].title, 'es'))
    const items = scored.slice(0, 18).map(([, i]) => ({ id: i.id, kind: i.kind, title: i.title, creator: i.creator, year: i.year, cover_url: i.cover_url, color: i.color, status: i.status, platform: i.meta.platform || null }))
    const tags = [...countBy(published(), (p) => p.tags)].filter(([name]) => name.includes(words[0])).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).slice(0, 5)
    return wait({ posts, items, tags, more: scored.length - items.length })
  },
  stats() {
    const pub = published()
    const items = state.items.filter((i) => !i.hidden)
    return wait({
      posts: pub.length,
      comments: state.comments.filter((c) => c.status === 'visible').length,
      items: Object.fromEntries(countBy(items, (i) => i.kind)),
      manga_volumes: items.filter((i) => i.kind === 'manga').reduce((s, i) => s + (i.meta.volumes_owned || 1), 0),
      platforms: new Set(items.filter((i) => i.kind === 'videogame').map((i) => i.meta.platform)).size,
      latest: [...pub].sort(byDateDesc).slice(0, 3).map(summary),
      now: nowOnBoard(),
    })
  },
  posts: (params) => wait(listPosts(params)),
  taxonomy() {
    const pub = published()
    const sorted = (map, cmp) => [...map].map(([name, n]) => ({ name, n })).sort(cmp)
    return wait({
      categories: sorted(countBy(pub, (p) => p.category), (a, b) => b.n - a.n),
      tags: sorted(countBy(pub, (p) => p.tags), (a, b) => b.n - a.n || a.name.localeCompare(b.name)),
      years: [...countBy(pub, yearOf)].map(([year, n]) => ({ year, n })).sort((a, b) => (a.year < b.year ? 1 : -1)),
    })
  },
  post(slug, preview) {
    const p = state.posts.find((x) => x.slug === slug)
    if (!p || (p.status !== 'published' && !preview)) return fail('Esta entrada no existe.')
    const pub = published().sort(byDateDesc)
    const pick = (x) => x && { slug: x.slug, title: x.title, published_at: x.published_at }
    return wait({
      ...summary(p),
      content_html: p.content_html,
      previous: pick(pub.find((x) => x.published_at < p.published_at)) || null,
      next: pick([...pub].reverse().find((x) => x.published_at > p.published_at)) || null,
    })
  },
  adminPost(id) {
    const p = state.posts.find((x) => x.id === Number(id))
    return p ? wait({ ...summary(p), content_html: p.content_html }) : fail('Esta entrada no existe.')
  },
  createPost: (data) => savePost(data),
  updatePost: (id, data) => savePost(data, Number(id)),
  deletePost(id) {
    state.posts = state.posts.filter((p) => p.id !== Number(id))
    state.comments = state.comments.filter((c) => c.post_id !== Number(id))
    return wait(null)
  },
  comments(slug) {
    const p = state.posts.find((x) => x.slug === slug)
    return wait(p ? visibleComments(p.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)) : [])
  },
  commentToken: () => wait({ token: 'demo' }),
  addComment(slug, data) {
    if (data.website) return wait({ ok: true })
    const p = state.posts.find((x) => x.slug === slug && x.status === 'published')
    if (!p) return fail('Esta entrada no existe.')
    const author = String(data.author || '').trim().slice(0, 60)
    const body = String(data.body || '').trim().slice(0, 4000)
    if (!author || !body) return fail('Pon tu nombre y un comentario.')
    // Como en el servidor: con enlaces, se queda pendiente de que lo apruebe el capitán.
    const status = /https?:\/\/|www\./i.test(body) ? 'pending' : 'visible'
    const c = { id: nextId.comment++, post_id: p.id, author, body, status, created_at: nowSql() }
    state.comments.push(c)
    return wait({ ...c, pending: status === 'pending' })
  },
  adminComments() {
    return wait(state.comments
      .map((c) => {
        const p = state.posts.find((x) => x.id === c.post_id)
        return { ...c, post_title: p?.title, post_slug: p?.slug, post_date: p?.published_at }
      })
      .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || (a.created_at < b.created_at ? 1 : -1)))
  },
  setCommentStatus(id, status) {
    const c = state.comments.find((x) => x.id === Number(id))
    if (c) c.status = status === 'hidden' ? 'hidden' : 'visible'
    return wait({ ok: true })
  },
  deleteComment(id) {
    state.comments = state.comments.filter((c) => c.id !== Number(id))
    return wait(null)
  },
  items(kind, all) {
    const kinds = String(kind || '').split(',').filter(Boolean)
    return wait(state.items
      .filter((i) => (!kinds.length || kinds.includes(i.kind)) && (all || !i.hidden))
      .sort(itemSort))
  },
  createItem: (data) => saveItem(data),
  updateItem: (id, data) => saveItem(data, Number(id)),
  deleteItem(id) {
    state.items = state.items.filter((i) => i.id !== Number(id))
    return wait(null)
  },
  furniture: () => wait(state.furniture || []),
  lookup: () => fail('En esta demo no hay salida a internet. En la versión local este botón rellena los datos desde Open Library, AniList, TMDB o BoardGameGeek.'),
  upload: (file) => wait({ url: URL.createObjectURL(file) }),
}
