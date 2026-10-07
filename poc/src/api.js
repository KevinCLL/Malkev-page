// Cliente mínimo de la API local.
async function request(method, url, body, headers = {}) {
  const init = { method, headers: { ...headers } }
  if (body instanceof Blob) {
    init.body = body
    init.headers['Content-Type'] = body.type
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(url, init)
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
  return data
}

const qs = (params) => {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') search.set(k, v)
  const s = search.toString()
  return s ? `?${s}` : ''
}

export const api = {
  stats: () => request('GET', '/api/stats'),
  posts: (params = {}) => request('GET', `/api/posts${qs(params)}`),
  taxonomy: () => request('GET', '/api/taxonomy'),
  post: (slug, preview) => request('GET', `/api/posts/${encodeURIComponent(slug)}${preview ? '?preview=1' : ''}`),
  adminPost: (id) => request('GET', `/api/admin/posts/${id}`),
  createPost: (data) => request('POST', '/api/posts', data),
  updatePost: (id, data) => request('PUT', `/api/posts/${id}`, data),
  deletePost: (id) => request('DELETE', `/api/posts/${id}`),
  comments: (slug) => request('GET', `/api/posts/${encodeURIComponent(slug)}/comments`),
  addComment: (slug, data) => request('POST', `/api/posts/${encodeURIComponent(slug)}/comments`, data),
  adminComments: () => request('GET', '/api/admin/comments'),
  setCommentStatus: (id, status) => request('PATCH', `/api/comments/${id}`, { status }),
  deleteComment: (id) => request('DELETE', `/api/comments/${id}`),
  items: (kind, all) => request('GET', `/api/items${qs({ kind, all: all ? 1 : '' })}`),
  createItem: (data) => request('POST', '/api/items', data),
  updateItem: (id, data) => request('PUT', `/api/items/${id}`, data),
  deleteItem: (id) => request('DELETE', `/api/items/${id}`),
  lookup: (kind, q) => request('GET', `/api/lookup${qs({ kind, q })}`),
  upload: (file) => request('POST', '/api/uploads', file),
}
