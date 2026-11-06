// Pruebas de la API contra un PostgreSQL de verdad. Usa TEST_DATABASE_URL (una base de datos de usar y
// tirar: se vacía entera al empezar). Sin esa variable, las pruebas se saltan.
//   TEST_DATABASE_URL=postgres://malkevnia:malkevnia@localhost:5432/malkevnia_test npm test
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

const URL_ = process.env.TEST_DATABASE_URL
const skip = !URL_ && 'Falta TEST_DATABASE_URL'
let base, server, pool, cookie = ''

before(async () => {
  if (skip) return
  process.env.DATABASE_URL = URL_
  process.env.COMMENT_MIN_AGE_MS = '0'
  ;({ pool } = await import('../server/db.js'))
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
  const { migrate } = await import('../scripts/migrate.js')
  await migrate({ log: () => {} })
  const { upsertCaptain } = await import('../server/auth.js')
  await upsertCaptain('capitan', 'contraseña-de-prueba')
  const { createApp } = await import('../server/index.js')
  const app = await createApp()
  await new Promise((r) => { server = app.listen(0, r) })
  base = `http://127.0.0.1:${server.address().port}/api/v1`
})

after(async () => {
  if (skip) return
  server.close()
  await pool.end()
})

async function call(method, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  const set = res.headers.get('set-cookie')
  if (set) cookie = set.split(';')[0]
  const data = res.status === 204 ? null : await res.json()
  return { status: res.status, data }
}

test('el panel pide sesión y rechaza contraseñas malas', { skip }, async () => {
  assert.equal((await call('GET', '/admin/items')).status, 401)
  assert.equal((await call('POST', '/auth/login', { password: 'mala' })).status, 401)
  const ok = await call('POST', '/auth/login', { username: 'capitan', password: 'contraseña-de-prueba' })
  assert.equal(ok.status, 200)
  assert.equal(ok.data.captain.username, 'capitan')
})

test('crear, puntuar, ocultar y buscar items', { skip }, async () => {
  const a = await call('POST', '/admin/items', { kind: 'book', title: 'La mano izquierda de la oscuridad', creator: 'Ursula K. Le Guin', year: 1969, tags: ['Ciencia ficción'] })
  assert.equal(a.status, 201)
  assert.equal(a.data.slug, 'la-mano-izquierda-de-la-oscuridad')
  const b = await call('POST', '/admin/items', { kind: 'book', title: 'La mano izquierda de la oscuridad' })
  assert.equal(b.data.slug, 'la-mano-izquierda-de-la-oscuridad-2', 'el slug repetido se numera')

  const rated = await call('POST', `/admin/items/${a.data.id}/ratings`, { score: 9, review: 'Preciosa' })
  assert.equal(rated.data.rating, 9)
  assert.equal(rated.data.ratings[0].review, 'Preciosa')

  const pub = await call('GET', '/items/book/la-mano-izquierda-de-la-oscuridad')
  assert.equal(pub.status, 200)
  assert.equal(pub.data.notes, undefined, 'las notas privadas no salen en la API pública')
  assert.deepEqual(pub.data.tags.map((t) => t.slug), ['ciencia-ficcion'])

  const search = await call('GET', '/items?q=le%20guin')
  assert.equal(search.data.total, 1, 'busca también por autoría, sin tildes')

  await call('PATCH', `/admin/items/${b.data.id}`, { hidden: true })
  assert.equal((await call('GET', '/items/book/la-mano-izquierda-de-la-oscuridad-2')).status, 404)
  assert.equal((await call('GET', '/items?kind=book')).data.total, 1)
  assert.equal((await call('GET', '/items?kind=nope')).status, 400)
})

test('colecciones con huecos', { skip }, async () => {
  const col = await call('POST', '/admin/collections', { name: 'Kallax de prueba', kind: 'kallax', rows: 4, cols: 4 })
  assert.equal(col.status, 201)
  const items = (await call('GET', '/admin/items?kind=book')).data.items
  await call('POST', `/admin/collections/${col.data.id}/items`, { item_id: items[0].id, row: 2, col: 3, placement: 'de pie' })
  const pub = await call('GET', '/collections/kallax-de-prueba')
  assert.equal(pub.data.items.length, 1, 'el item oculto no aparece en la colección pública')
  assert.deepEqual({ row: pub.data.items[0].slot.row, col: pub.data.items[0].slot.col }, { row: 2, col: 3 })
})

test('bitácora: borrador, publicación, URL antigua y comentarios moderados', { skip }, async () => {
  const draft = await call('POST', '/admin/posts', { title: 'Cuaderno de bitácora', content_html: '<p>Día uno a bordo.</p>', tags: ['nave'] })
  assert.equal(draft.data.status, 'draft')
  assert.equal(draft.data.description, 'Día uno a bordo.')
  assert.equal((await call('GET', '/posts/cuaderno-de-bitacora')).status, 404, 'un borrador no es público')

  const future = new Date(Date.now() + 86400000).toISOString()
  await call('PATCH', `/admin/posts/${draft.data.id}`, { status: 'scheduled', published_at: future })
  assert.equal((await call('GET', '/posts/cuaderno-de-bitacora')).status, 404, 'programada para mañana: aún no')

  await call('PATCH', `/admin/posts/${draft.data.id}`, { status: 'published', published_at: '2026-05-25T10:00:00Z', aliases: ['/?p=42/'] })
  const post = await call('GET', '/posts/cuaderno-de-bitacora')
  assert.equal(post.data.path, '/blog/2026/05/25/cuaderno-de-bitacora/')
  const resolved = await call('GET', `/posts/resolve?path=${encodeURIComponent('/?p=42/')}`)
  assert.equal(resolved.data.slug, 'cuaderno-de-bitacora')
  assert.equal(resolved.data.redirect, true)

  const { data: { token } } = await call('GET', '/posts/cuaderno-de-bitacora/comments')
  const saved = cookie
  cookie = ''
  const c = await call('POST', '/posts/cuaderno-de-bitacora/comments', { author: 'Tripulante', body: '¡Buen viaje!', token })
  assert.equal(c.status, 201)
  assert.equal((await call('POST', '/posts/cuaderno-de-bitacora/comments', { author: 'Bot', body: 'hola', token: '1.abc' })).status, 400)
  assert.equal((await call('GET', '/posts/cuaderno-de-bitacora/comments')).data.comments.length, 0, 'pendiente hasta moderar')
  cookie = saved
  await call('PATCH', `/admin/comments/${c.data.id}`, { status: 'visible' })
  const list = await call('GET', '/posts/cuaderno-de-bitacora/comments')
  assert.equal(list.data.comments.length, 1)
  assert.equal(list.data.comments[0].email, undefined, 'el correo nunca sale')
})

test('el panel rechaza peticiones de otro origen', { skip }, async () => {
  const r = await call('POST', '/admin/tags', { name: 'x' }, { Origin: 'https://otra-web.example' })
  assert.equal(r.status, 403)
})
