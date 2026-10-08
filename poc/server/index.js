// Servidor de la POC: API REST sobre SQLite + la app Vue (Vite en desarrollo, dist/ en producción).
import express from 'express'
import { randomBytes } from 'node:crypto'
import { writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, UPLOADS_DIR, slugify, uniqueSlug, setPostTags, indexPost, stripHtml, transaction } from './db.js'
import { lookup } from './lookup.js'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..')
const PROD = process.argv.includes('--prod')
const PORT = Number(process.env.PORT) || 5173

const app = express()
app.use(express.json({ limit: '5mb' }))

// Imágenes del blog actual (../assets) y las que se suben desde el editor.
app.use('/assets', express.static(join(ROOT, '..', 'assets'), { maxAge: '1h' }))
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '1h' }))

const api = express.Router()
app.use('/api', api)

const PAGE_SIZE = 12
const ITEM_KINDS = ['boardgame', 'rpg', 'film', 'series', 'book', 'manga']

function tagsFor(postId) {
  return db.prepare(
    'SELECT t.name FROM tags t JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = ? ORDER BY t.name'
  ).all(postId).map((r) => r.name)
}

function readingMinutes(html) {
  return Math.max(1, Math.ceil(stripHtml(html).split(' ').length / 200))
}

function summary(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    cover: row.cover,
    category: row.category,
    status: row.status,
    published_at: row.published_at,
    updated_at: row.updated_at,
    reading_minutes: readingMinutes(row.content_html),
    comment_count: row.comment_count ?? 0,
    tags: tagsFor(row.id),
  }
}

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// FTS5: cada palabra se busca como prefijo, para que "drag" encuentre "dragón".
function ftsQuery(q) {
  return q
    .split(/\s+/)
    .map((w) => w.replace(/["*^:()]/g, ''))
    .filter(Boolean)
    .map((w) => `"${w}"*`)
    .join(' ')
}

/* ---------- Portada ---------- */

api.get('/stats', (req, res) => {
  const counts = Object.fromEntries(
    db.prepare('SELECT kind, COUNT(*) AS n FROM items WHERE hidden = 0 GROUP BY kind').all().map((r) => [r.kind, r.n])
  )
  const volumes = db.prepare("SELECT meta FROM items WHERE kind = 'manga' AND hidden = 0").all()
    .reduce((sum, r) => sum + (JSON.parse(r.meta).volumes_owned || 1), 0)
  res.json({
    posts: db.prepare("SELECT COUNT(*) AS n FROM posts WHERE status = 'published'").get().n,
    comments: db.prepare("SELECT COUNT(*) AS n FROM comments WHERE status = 'visible'").get().n,
    items: counts,
    manga_volumes: volumes,
    latest: db.prepare(
      "SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 3"
    ).all().map(summary),
  })
})

/* ---------- Blog ---------- */

api.get('/posts', (req, res) => {
  const { q = '', tag = '', category = '', year = '', all = '', status = '' } = req.query
  const page = Math.max(1, Number(req.query.page) || 1)
  const where = []
  const params = []
  if (!all) where.push("p.status = 'published'")
  else if (status === 'draft' || status === 'published') { where.push('p.status = ?'); params.push(status) }
  if (q.trim()) {
    where.push('p.id IN (SELECT rowid FROM posts_fts WHERE posts_fts MATCH ?)')
    params.push(ftsQuery(q))
  }
  if (tag) {
    where.push('p.id IN (SELECT pt.post_id FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.name = ?)')
    params.push(tag)
  }
  if (category) { where.push('p.category = ?'); params.push(category) }
  if (year) { where.push("strftime('%Y', p.published_at) = ?"); params.push(String(year)) }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = db.prepare(`SELECT COUNT(*) AS n FROM posts p ${clause}`).get(...params).n
  const rows = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.status = 'visible') AS comment_count
    FROM posts p ${clause}
    ORDER BY p.published_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE)
  res.json({ total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), posts: rows.map(summary) })
})

api.get('/taxonomy', (req, res) => {
  res.json({
    categories: db.prepare(
      "SELECT category AS name, COUNT(*) AS n FROM posts WHERE status = 'published' GROUP BY category ORDER BY n DESC"
    ).all(),
    tags: db.prepare(`
      SELECT t.name, COUNT(*) AS n FROM tags t
      JOIN post_tags pt ON pt.tag_id = t.id JOIN posts p ON p.id = pt.post_id
      WHERE p.status = 'published' GROUP BY t.name ORDER BY n DESC, t.name
    `).all(),
    years: db.prepare(`
      SELECT strftime('%Y', published_at) AS year, COUNT(*) AS n FROM posts
      WHERE status = 'published' GROUP BY year ORDER BY year DESC
    `).all(),
  })
})

api.get('/posts/:slug', (req, res) => {
  const row = db.prepare('SELECT * FROM posts WHERE slug = ?').get(req.params.slug)
  if (!row || (row.status !== 'published' && !req.query.preview)) throw httpError(404, 'Esta entrada no existe.')
  const neighbours = (op, dir) => db.prepare(`
    SELECT slug, title, published_at FROM posts
    WHERE status = 'published' AND published_at ${op} ? ORDER BY published_at ${dir} LIMIT 1
  `).get(row.published_at) || null
  res.json({
    ...summary(row),
    content_html: row.content_html,
    previous: neighbours('<', 'DESC'),
    next: neighbours('>', 'ASC'),
  })
})

api.get('/admin/posts/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id))
  if (!row) throw httpError(404, 'Esta entrada no existe.')
  res.json({ ...summary(row), content_html: row.content_html })
})

function savePost(body, id = null) {
  const title = String(body.title || '').trim()
  if (!title) throw httpError(400, 'La entrada necesita un título.')
  const content = String(body.content_html || '')
  const fields = {
    title,
    slug: uniqueSlug(slugify(body.slug || title), id),
    excerpt: String(body.excerpt || '').trim() || stripHtml(content).slice(0, 220),
    content_html: content,
    cover: body.cover || null,
    category: String(body.category || 'Varios').trim() || 'Varios',
    status: body.status === 'published' ? 'published' : 'draft',
    published_at: body.published_at || new Date().toISOString(),
  }
  return transaction(() => {
    if (id) {
      const ok = db.prepare(`
        UPDATE posts SET title = ?, slug = ?, excerpt = ?, content_html = ?, cover = ?, category = ?,
          status = ?, published_at = ?, updated_at = datetime('now') WHERE id = ?
      `).run(...Object.values(fields), id)
      if (!ok.changes) throw httpError(404, 'Esta entrada no existe.')
    } else {
      id = Number(db.prepare(`
        INSERT INTO posts (title, slug, excerpt, content_html, cover, category, status, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(...Object.values(fields)).lastInsertRowid)
    }
    setPostTags(id, Array.isArray(body.tags) ? body.tags : [])
    indexPost({ id, ...fields })
    return summary(db.prepare('SELECT * FROM posts WHERE id = ?').get(id))
  })
}

api.post('/posts', (req, res) => res.status(201).json(savePost(req.body)))
api.put('/posts/:id', (req, res) => res.json(savePost(req.body, Number(req.params.id))))
api.delete('/posts/:id', (req, res) => {
  transaction(() => {
    db.prepare('DELETE FROM posts WHERE id = ?').run(Number(req.params.id))
    db.prepare('DELETE FROM posts_fts WHERE rowid = ?').run(Number(req.params.id))
    db.exec('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM post_tags)')
  })
  res.status(204).end()
})

/* ---------- Comentarios ---------- */

api.get('/posts/:slug/comments', (req, res) => {
  res.json(db.prepare(`
    SELECT c.id, c.author, c.body, c.created_at FROM comments c JOIN posts p ON p.id = c.post_id
    WHERE p.slug = ? AND c.status = 'visible' ORDER BY c.created_at
  `).all(req.params.slug))
})

api.post('/posts/:slug/comments', (req, res) => {
  // "website" es un campo trampa invisible: si viene relleno, es un bot.
  if (req.body.website) return res.status(201).json({ ok: true })
  const post = db.prepare("SELECT id FROM posts WHERE slug = ? AND status = 'published'").get(req.params.slug)
  if (!post) throw httpError(404, 'Esta entrada no existe.')
  const author = String(req.body.author || '').trim().slice(0, 60)
  const body = String(req.body.body || '').trim().slice(0, 4000)
  if (!author || !body) throw httpError(400, 'Pon tu nombre y un comentario.')
  const id = db.prepare('INSERT INTO comments (post_id, author, body) VALUES (?, ?, ?)').run(post.id, author, body).lastInsertRowid
  res.status(201).json(db.prepare('SELECT id, author, body, created_at FROM comments WHERE id = ?').get(id))
})

api.get('/admin/comments', (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, p.title AS post_title, p.slug AS post_slug, p.published_at AS post_date
    FROM comments c JOIN posts p ON p.id = c.post_id ORDER BY c.created_at DESC LIMIT 200
  `).all())
})

api.patch('/comments/:id', (req, res) => {
  const status = req.body.status === 'hidden' ? 'hidden' : 'visible'
  db.prepare('UPDATE comments SET status = ? WHERE id = ?').run(status, Number(req.params.id))
  res.json({ ok: true })
})

api.delete('/comments/:id', (req, res) => {
  db.prepare('DELETE FROM comments WHERE id = ?').run(Number(req.params.id))
  res.status(204).end()
})

/* ---------- Colección ---------- */

function itemOut(row) {
  return { ...row, featured: !!row.featured, hidden: !!row.hidden, meta: JSON.parse(row.meta || '{}') }
}

api.get('/items', (req, res) => {
  const kinds = String(req.query.kind || '').split(',').filter((k) => ITEM_KINDS.includes(k))
  const where = []
  if (kinds.length) where.push(`kind IN (${kinds.map(() => '?').join(',')})`)
  if (!req.query.all) where.push('hidden = 0')
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  res.json(db.prepare(`
    SELECT * FROM items ${clause}
    ORDER BY COALESCE(shelf, 999), position, title COLLATE NOCASE
  `).all(...kinds).map(itemOut))
})

function saveItem(body, id = null) {
  if (!ITEM_KINDS.includes(body.kind)) throw httpError(400, 'Tipo de objeto no válido.')
  const title = String(body.title || '').trim()
  if (!title) throw httpError(400, 'Falta el título.')
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
  const rating = num(body.rating)
  const fields = [
    body.kind,
    title,
    String(body.creator || '').trim(),
    num(body.year),
    body.cover_url || null,
    body.color || null,
    rating === null ? null : Math.min(10, Math.max(0, Math.round(rating))),
    body.status || 'owned',
    String(body.notes || ''),
    num(body.shelf),
    num(body.position) ?? 0,
    body.featured ? 1 : 0,
    body.hidden ? 1 : 0,
    JSON.stringify(body.meta || {}),
  ]
  if (id) {
    const ok = db.prepare(`
      UPDATE items SET kind = ?, title = ?, creator = ?, year = ?, cover_url = ?, color = ?, rating = ?, status = ?,
        notes = ?, shelf = ?, position = ?, featured = ?, hidden = ?, meta = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(...fields, id)
    if (!ok.changes) throw httpError(404, 'Ese objeto no existe.')
  } else {
    id = Number(db.prepare(`
      INSERT INTO items (kind, title, creator, year, cover_url, color, rating, status, notes, shelf, position, featured, hidden, meta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...fields).lastInsertRowid)
  }
  return itemOut(db.prepare('SELECT * FROM items WHERE id = ?').get(id))
}

api.post('/items', (req, res) => res.status(201).json(saveItem(req.body)))
/* Muebles de la sala de juegos, con la colocación de cada caja. */
api.get('/furniture', (req, res) => {
  res.json(db.prepare('SELECT * FROM furniture ORDER BY position, id').all()
    .map((f) => ({ ...f, layout: JSON.parse(f.layout || '{}') })))
})

api.put('/items/:id', (req, res) => res.json(saveItem(req.body, Number(req.params.id))))
api.delete('/items/:id', (req, res) => {
  db.prepare('DELETE FROM items WHERE id = ?').run(Number(req.params.id))
  res.status(204).end()
})

api.get('/lookup', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 2) return res.json([])
  try {
    res.json(await lookup(String(req.query.kind), q))
  } catch (err) {
    res.status(err.status || 502).json({ error: err.status ? err.message : `No se pudo consultar el servicio: ${err.message}` })
  }
})

/* ---------- Subida de imágenes ---------- */

const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }
api.post('/uploads', express.raw({ type: Object.keys(IMAGE_TYPES), limit: '15mb' }), (req, res) => {
  const ext = IMAGE_TYPES[req.headers['content-type']]
  if (!ext || !req.body?.length) throw httpError(400, 'Sube una imagen PNG, JPG, WebP, GIF o AVIF.')
  const name = `${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`
  writeFileSync(join(UPLOADS_DIR, name), req.body)
  res.status(201).json({ url: `/uploads/${name}` })
})

api.use((req, res) => res.status(404).json({ error: 'Ruta de la API desconocida.' }))
api.use((err, req, res, next) => {
  if (!err.status) console.error(err)
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Algo ha fallado en el servidor.' })
})

/* ---------- App Vue ---------- */

if (PROD) {
  const dist = join(ROOT, 'dist')
  if (!existsSync(dist)) {
    console.error('No existe dist/. Ejecuta primero: npm run build')
    process.exit(1)
  }
  app.use(express.static(dist))
  app.get('/{*splat}', (req, res) => res.sendFile(join(dist, 'index.html')))
} else {
  const { createServer } = await import('vite')
  const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' })
  app.use(vite.middlewares)
}

const count = db.prepare('SELECT COUNT(*) AS n FROM posts').get().n
app.listen(PORT, () => {
  console.log(`\n  ✦ Malkevnia POC en http://localhost:${PORT}`)
  if (!count) console.log('  ⚠ La base de datos está vacía: ejecuta "npm run seed" para importar el blog y la colección.\n')
})
