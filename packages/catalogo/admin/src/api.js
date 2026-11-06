// Cliente de la API v1 para el panel. La sesión va en una cookie HttpOnly: aquí no se toca ningún token.
import { reactive } from 'vue'

export const session = reactive({ loaded: false, configured: true, captain: null })

const BASE = '/api/v1'

async function request(method, url, body) {
  const init = { method, headers: {}, credentials: 'same-origin' }
  if (body instanceof Blob) {
    init.body = body
    init.headers['Content-Type'] = body.type
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(BASE + url, init)
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && !url.startsWith('/auth')) session.captain = null
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
  return data
}

export const qs = (params = {}) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue
    s.set(k, Array.isArray(v) ? v.join(',') : v)
  }
  const out = s.toString()
  return out ? `?${out}` : ''
}

export const api = {
  get: (url) => request('GET', url),
  auth: async () => Object.assign(session, await request('GET', '/auth'), { loaded: true }),
  login: async (username, password) => Object.assign(session, await request('POST', '/auth/login', { username, password })),
  logout: async () => Object.assign(session, await request('POST', '/auth/logout', {})),
  changePassword: (current, password) => request('POST', '/auth/password', { current, password }),

  stats: () => request('GET', '/admin/stats'),
  lookup: (kind, q) => request('GET', `/admin/lookup${qs({ kind, q })}`),

  items: (params) => request('GET', `/admin/items${qs(params)}`),
  item: (id) => request('GET', `/admin/items/${id}`),
  createItem: (data) => request('POST', '/admin/items', data),
  updateItem: (id, data) => request('PATCH', `/admin/items/${id}`, data),
  deleteItem: (id) => request('DELETE', `/admin/items/${id}`),
  rate: (id, score, review) => request('POST', `/admin/items/${id}/ratings`, { score, review }),
  deleteRating: (id, ratingId) => request('DELETE', `/admin/items/${id}/ratings/${ratingId}`),
  bulk: (ids, patch, action) => request('POST', '/admin/items/bulk', { ids, patch, action }),

  tags: () => request('GET', '/admin/tags'),
  createTag: (data) => request('POST', '/admin/tags', data),
  updateTag: (id, data) => request('PATCH', `/admin/tags/${id}`, data),
  mergeTag: (id, into) => request('POST', `/admin/tags/${id}/merge`, { into }),
  deleteTag: (id) => request('DELETE', `/admin/tags/${id}`),

  collections: () => request('GET', '/admin/collections'),
  collection: (id) => request('GET', `/admin/collections/${id}`),
  createCollection: (data) => request('POST', '/admin/collections', data),
  updateCollection: (id, data) => request('PATCH', `/admin/collections/${id}`, data),
  deleteCollection: (id) => request('DELETE', `/admin/collections/${id}`),
  setCollectionItems: (id, items) => request('PUT', `/admin/collections/${id}/items`, { items }),
  placeItem: (id, slot) => request('POST', `/admin/collections/${id}/items`, slot),
  unplaceItem: (id, itemId) => request('DELETE', `/admin/collections/${id}/items/${itemId}`),

  posts: (params) => request('GET', `/admin/posts${qs(params)}`),
  post: (id) => request('GET', `/admin/posts/${id}`),
  createPost: (data) => request('POST', '/admin/posts', data),
  updatePost: (id, data) => request('PATCH', `/admin/posts/${id}`, data),
  deletePost: (id) => request('DELETE', `/admin/posts/${id}`),

  comments: (params) => request('GET', `/admin/comments${qs(params)}`),
  moderate: (id, data) => request('PATCH', `/admin/comments/${id}`, data),
  reply: (id, body) => request('POST', `/admin/comments/${id}/reply`, { body }),
  deleteComment: (id) => request('DELETE', `/admin/comments/${id}`),

  upload: (file) => request('POST', `/admin/media${qs({ name: file.name })}`, file),
}

export const KINDS = {
  boardgame: { label: 'Juegos de mesa', one: 'Juego de mesa', icon: 'dice' },
  rpg: { label: 'Rol', one: 'Libro de rol', icon: 'book' },
  film: { label: 'Películas', one: 'Película', icon: 'film' },
  series: { label: 'Series', one: 'Serie', icon: 'film' },
  book: { label: 'Libros', one: 'Libro', icon: 'book' },
  manga: { label: 'Manga', one: 'Manga', icon: 'book' },
  videogame: { label: 'Videojuegos', one: 'Videojuego', icon: 'gamepad' },
}

export const STATUSES = {
  owned: 'En la colección', wishlist: 'Lo quiero', reading: 'Leyendo', watching: 'Viendo', playing: 'Jugando',
  done: 'Terminado', paused: 'Aparcado', dropped: 'Abandonado',
}

// Estados que tienen sentido para cada tipo (el resto se puede elegir igual, pero no se sugiere).
export const STATUS_FOR = {
  boardgame: ['owned', 'wishlist', 'playing', 'done'],
  rpg: ['owned', 'wishlist', 'reading', 'playing', 'done'],
  film: ['wishlist', 'watching', 'done', 'dropped'],
  series: ['wishlist', 'watching', 'paused', 'done', 'dropped'],
  book: ['owned', 'wishlist', 'reading', 'paused', 'done', 'dropped'],
  manga: ['owned', 'wishlist', 'reading', 'paused', 'done', 'dropped'],
  videogame: ['owned', 'wishlist', 'playing', 'paused', 'done', 'dropped'],
}

export const COLLECTION_KINDS = { kallax: 'Kallax', shelf: 'Estantería', bookcase: 'Librería', list: 'Lista' }
export const POST_STATUSES = { draft: 'Borrador', scheduled: 'Programada', published: 'Publicada' }
export const COMMENT_STATUSES = { pending: 'Pendientes', visible: 'Visibles', hidden: 'Ocultos', spam: 'Spam' }

export const fmtDate = (d, withTime = false) => d
  ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' } : {}) }).format(new Date(d))
  : '—'
