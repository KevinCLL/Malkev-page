// Rutas de la API v1. Pública (solo lectura + enviar comentarios) y /admin (detrás del inicio de sesión).
// Documentación con ejemplos en API.md.
import express from 'express'
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { one, many, query } from './db.js'
import { httpError, page, list, bool } from './lib/http.js'
import * as catalog from './catalog.js'
import * as blog from './blog.js'
import { lookup } from './lookup.js'
import {
  attachCaptain, requireCaptain, verifyPassword, createSession, cookieHeader, destroySession,
  destroyOtherSessions, hashPassword, checkNewPassword, hasCaptain,
} from './auth.js'
import { sameOrigin, tooMany, commentToken, checkCommentToken, looksSpammy, ipHash } from './guard.js'

export function apiRouter({ uploadsDir }) {
  const api = express.Router()
  api.use(express.json({ limit: '5mb' }))
  api.use(attachCaptain)

  // Las respuestas públicas se pueden cachear un poco (Astro, CDN); las del panel nunca.
  const cache = (seconds) => (req, res, next) => {
    res.setHeader('Cache-Control', req.captain ? 'private, no-store' : `public, max-age=${seconds}, stale-while-revalidate=${seconds * 5}`)
    next()
  }

  const itemFilters = (q) => ({
    kinds: list(q.kind), statuses: list(q.status), tags: list(q.tag), q: q.q, featured: bool(q.featured),
    collection: q.collection, year: q.year, sort: q.sort, external: q.external, rated: bool(q.rated),
  })

  /* ------------------------------------------------------------ pública */

  api.get('/', (req, res) => res.json({
    name: 'Malkevnia · catálogo y bitácora', version: 1, docs: 'packages/catalogo/API.md',
    kinds: catalog.KIND_LABELS, statuses: catalog.STATUS_LABELS,
  }))

  api.get('/stats', cache(60), async (req, res) => {
    res.json({ ...(await catalog.catalogStats()), blog: await blog.blogStats() })
  })

  api.get('/items', cache(60), async (req, res) => {
    res.json(await catalog.listItems({ ...itemFilters(req.query), ...page(req.query) }))
  })
  api.get('/items/:kind/:slug', cache(60), async (req, res) => {
    res.json(await catalog.getItem({ kind: req.params.kind, slug: req.params.slug }))
  })

  api.get('/collections', cache(60), async (req, res) => res.json({ collections: await catalog.listCollections() }))
  api.get('/collections/:slug', cache(60), async (req, res) => {
    res.json(await catalog.getCollection({ slug: req.params.slug }, page(req.query, { def: 5000, max: 5000 })))
  })

  api.get('/tags', cache(300), async (req, res) => res.json({ tags: await catalog.listTags() }))

  api.get('/posts', cache(60), async (req, res) => {
    const { tag, q, year, category, item } = req.query
    res.json(await blog.listPosts({ tag, q, year, category, item, ...page(req.query, { def: 12, max: 500 }) }))
  })
  api.get('/posts/archive', cache(300), async (req, res) => res.json({ years: await blog.archive() }))
  api.get('/posts/resolve', cache(300), async (req, res) => res.json(await blog.resolvePath(req.query.path)))
  api.get('/posts/:slug', cache(60), async (req, res) => res.json(await blog.getPost({ slug: req.params.slug })))

  api.get('/posts/:slug/comments', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({ ...(await blog.publicComments(req.params.slug)), token: await commentToken(req.params.slug) })
  })
  api.post('/posts/:slug/comments', async (req, res) => {
    if (tooMany(`comment:${req.ip}`, 5, 10 * 60 * 1000)) throw httpError(429, 'Demasiados comentarios seguidos. Prueba dentro de un rato.')
    // Campo trampa: invisible para personas; si llega relleno es un bot. Se le dice que ha ido bien.
    if (req.body.url_trampa) return res.status(201).json({ status: 'pending' })
    await checkCommentToken(req.params.slug, req.body.token)
    // Con enlaces va a spam (se revisa en el panel); el resto espera moderación. Al visitante se le dice lo mismo.
    const status = looksSpammy(String(req.body.body || '')) ? 'spam' : 'pending'
    const row = await blog.addComment(req.params.slug, req.body, { status, ipHash: await ipHash(req.ip) })
    res.status(201).json({ id: row.id, status: 'pending', message: 'Gracias. Tu comentario aparecerá en cuanto el capitán lo revise.' })
  })

  /* ------------------------------------------------------------- sesión */

  api.use(sameOrigin)

  api.get('/auth', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({ configured: await hasCaptain(), captain: req.captain ? { username: req.captain.username } : null })
  })

  api.post('/auth/login', async (req, res) => {
    if (tooMany(`login:${req.ip}`, 8, 15 * 60 * 1000)) throw httpError(429, 'Demasiados intentos. Espera unos minutos.')
    const user = await one('SELECT id, username, password_hash FROM admin_users WHERE username = $1',
      [String(req.body.username || 'capitan').trim()])
    if (!user || !verifyPassword(req.body.password, user.password_hash)) throw httpError(401, 'Usuario o contraseña incorrectos.')
    const token = await createSession(user.id, req.headers['user-agent'])
    res.setHeader('Set-Cookie', cookieHeader(req, token))
    res.json({ configured: true, captain: { username: user.username } })
  })

  api.post('/auth/logout', async (req, res) => {
    await destroySession(req)
    res.setHeader('Set-Cookie', cookieHeader(req, ''))
    res.json({ captain: null })
  })

  api.post('/auth/password', requireCaptain, async (req, res) => {
    const user = await one('SELECT password_hash FROM admin_users WHERE id = $1', [req.captain.id])
    if (!verifyPassword(req.body.current, user.password_hash)) throw httpError(400, 'La contraseña actual no es correcta.')
    await query('UPDATE admin_users SET password_hash = $2 WHERE id = $1', [req.captain.id, hashPassword(checkNewPassword(req.body.password))])
    await destroyOtherSessions(req)
    res.json({ ok: true })
  })

  /* -------------------------------------------------------------- panel */

  const admin = express.Router()
  api.use('/admin', requireCaptain, (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() }, admin)

  admin.get('/stats', async (req, res) => {
    res.json({ ...(await catalog.catalogStats({ admin: true })), blog: await blog.blogStats({ admin: true }) })
  })

  admin.get('/lookup', async (req, res) => {
    const q = String(req.query.q || '').trim()
    if (q.length < 2) return res.json({ results: [] })
    res.json({ results: await lookup(req.query.kind, q) })
  })

  // Items
  admin.get('/items', async (req, res) => {
    res.json(await catalog.listItems({ ...itemFilters(req.query), hidden: bool(req.query.hidden), ...page(req.query, { def: 50, max: 500 }) }, { admin: true }))
  })
  admin.post('/items', async (req, res) => res.status(201).json(await catalog.saveItem(null, req.body)))
  admin.get('/items/:id', async (req, res) => res.json(await catalog.getItem({ id: req.params.id }, { admin: true })))
  admin.patch('/items/:id', async (req, res) => res.json(await catalog.saveItem(Number(req.params.id), req.body)))
  admin.delete('/items/:id', async (req, res) => { await catalog.deleteItem(req.params.id); res.status(204).end() })
  admin.post('/items/:id/ratings', async (req, res) => res.json(await catalog.rateItem(Number(req.params.id), req.body)))
  admin.delete('/items/:id/ratings/:ratingId', async (req, res) => {
    await catalog.deleteRating(Number(req.params.id), Number(req.params.ratingId))
    res.json(await catalog.getItem({ id: req.params.id }, { admin: true }))
  })
  // Cambios en bloque: [{id, ...campos}] (p. ej. ocultar o etiquetar varios a la vez).
  admin.post('/items/bulk', async (req, res) => {
    const { ids, patch, action } = req.body
    if (!Array.isArray(ids) || !ids.length) throw httpError(400, 'No hay nada seleccionado.')
    if (action === 'delete') await query('DELETE FROM items WHERE id = ANY($1::bigint[])', [ids])
    else for (const id of ids) await catalog.saveItem(Number(id), patch || {})
    res.json({ ok: true, count: ids.length })
  })

  // Etiquetas
  admin.get('/tags', async (req, res) => res.json({ tags: await catalog.listTags({ admin: true }) }))
  admin.post('/tags', async (req, res) => res.status(201).json(await catalog.saveTag(null, req.body)))
  admin.patch('/tags/:id', async (req, res) => res.json(await catalog.saveTag(Number(req.params.id), req.body)))
  admin.post('/tags/:id/merge', async (req, res) => { await catalog.mergeTags(Number(req.params.id), Number(req.body.into)); res.json({ ok: true }) })
  admin.delete('/tags/:id', async (req, res) => { await catalog.deleteTag(req.params.id); res.status(204).end() })

  // Colecciones
  admin.get('/collections', async (req, res) => res.json({ collections: await catalog.listCollections({ admin: true }) }))
  admin.post('/collections', async (req, res) => res.status(201).json(await catalog.saveCollection(null, req.body)))
  admin.get('/collections/:id', async (req, res) => {
    res.json(await catalog.getCollection({ id: req.params.id }, { admin: true, ...page(req.query, { def: 5000, max: 5000 }) }))
  })
  admin.patch('/collections/:id', async (req, res) => res.json(await catalog.saveCollection(Number(req.params.id), req.body)))
  admin.delete('/collections/:id', async (req, res) => { await catalog.deleteCollection(req.params.id); res.status(204).end() })
  admin.put('/collections/:id/items', async (req, res) => {
    await catalog.replaceCollectionItems(Number(req.params.id), req.body.items)
    res.json({ ok: true })
  })
  admin.post('/collections/:id/items', async (req, res) => {
    await catalog.placeItem(Number(req.params.id), req.body)
    res.status(201).json({ ok: true })
  })
  admin.delete('/collections/:id/items/:itemId', async (req, res) => {
    await catalog.unplaceItem(Number(req.params.id), Number(req.params.itemId))
    res.status(204).end()
  })

  // Posts
  admin.get('/posts', async (req, res) => {
    const { status, tag, q, year, category } = req.query
    res.json(await blog.listPosts({ status, tag, q, year, category, ...page(req.query, { def: 30, max: 500 }) }, { admin: true }))
  })
  admin.post('/posts', async (req, res) => res.status(201).json(await blog.savePost(null, req.body)))
  admin.get('/posts/:id', async (req, res) => res.json(await blog.getPost({ id: req.params.id }, { admin: true })))
  admin.patch('/posts/:id', async (req, res) => res.json(await blog.savePost(Number(req.params.id), req.body)))
  admin.delete('/posts/:id', async (req, res) => { await blog.deletePost(req.params.id); res.status(204).end() })

  // Comentarios
  admin.get('/comments', async (req, res) => {
    res.json(await blog.adminComments({ status: req.query.status, post_id: req.query.post_id, ...page(req.query, { def: 50 }) }))
  })
  admin.patch('/comments/:id', async (req, res) => res.json(await blog.moderate(Number(req.params.id), req.body)))
  admin.post('/comments/:id/reply', async (req, res) => res.status(201).json(await blog.captainReply(Number(req.params.id), req.body.body)))
  admin.delete('/comments/:id', async (req, res) => { await blog.deleteComment(req.params.id); res.status(204).end() })

  // Imágenes: el cuerpo es el fichero tal cual (Content-Type: image/…). Devuelve la URL pública.
  const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }
  admin.post('/media', express.raw({ type: Object.keys(IMAGE_EXT), limit: '15mb' }), async (req, res) => {
    const ext = IMAGE_EXT[req.headers['content-type']]
    if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) throw httpError(415, 'Solo se pueden subir imágenes JPG, PNG, WebP, GIF o AVIF.')
    const now = new Date()
    const dir = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`
    mkdirSync(join(uploadsDir, dir), { recursive: true })
    const base = String(req.query.name || 'imagen').replace(/\.[^.]+$/, '').normalize('NFD').replace(/[^\w-]+/g, '-').slice(0, 40)
    const path = `${dir}/${base}-${randomBytes(4).toString('hex')}.${ext}`
    writeFileSync(join(uploadsDir, path), req.body)
    const row = await one('INSERT INTO media (path, mime, bytes, alt) VALUES ($1, $2, $3, $4) RETURNING *',
      [path, req.headers['content-type'], req.body.length, String(req.query.alt || '')])
    res.status(201).json({ ...row, url: `/uploads/${path}` })
  })
  admin.get('/media', async (req, res) => {
    const rows = await many('SELECT * FROM media ORDER BY created_at DESC LIMIT 200')
    res.json({ media: rows.map((m) => ({ ...m, url: `/uploads/${m.path}` })) })
  })

  return api
}
