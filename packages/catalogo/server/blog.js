// Bitácora: posts, sus etiquetas y enlaces al catálogo, y comentarios con moderación.
import { one, many, query, tx } from './db.js'
import { httpError } from './lib/http.js'
import { slugify, wordCount, excerpt } from './lib/text.js'
import { setTags, likeEscape } from './catalog.js'

export const POST_STATUSES = ['draft', 'scheduled', 'published']
export const COMMENT_STATUSES = ['pending', 'visible', 'hidden', 'spam']

const TAGS = `COALESCE((SELECT json_agg(json_build_object('slug', t.slug, 'name', t.name) ORDER BY t.name)
  FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id), '[]'::json)`
const COMMENTS = `(SELECT count(*)::int FROM comments c WHERE c.post_id = p.id AND c.status = 'visible')`
const SUMMARY = `p.id, p.slug, p.title, p.description, p.cover_url, p.category, p.status, p.published_at, p.updated_at,
  p.word_count, GREATEST(1, ceil(p.word_count / 200.0))::int AS reading_minutes, ${TAGS} AS tags, ${COMMENTS} AS comment_count`
// Ruta pública: la de Jekyll si la tiene; si no, /blog/AAAA/MM/DD/slug/ con la fecha de Madrid.
const PATH = `COALESCE(p.legacy_path, '/blog/' || to_char(p.published_at AT TIME ZONE 'Europe/Madrid', 'YYYY/MM/DD') || '/' || p.slug || '/')`

export async function listPosts(f = {}, { admin = false } = {}) {
  const from = admin ? 'posts p' : 'public_posts p'
  const where = []
  const params = []
  const p = (v) => { params.push(v); return `$${params.length}` }
  if (admin && f.status) {
    if (!POST_STATUSES.includes(f.status)) throw httpError(400, 'Estado no válido.')
    where.push(`p.status = ${p(f.status)}::post_status`)
  }
  if (f.tag) where.push(`EXISTS (SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id AND t.slug = ${p(f.tag)})`)
  if (f.category) where.push(`p.category = ${p(f.category)}`)
  if (f.year) where.push(`extract(year FROM p.published_at AT TIME ZONE 'Europe/Madrid') = ${p(Number(f.year))}`)
  if (f.item) where.push(`EXISTS (SELECT 1 FROM post_items pi WHERE pi.post_id = p.id AND pi.item_id = ${p(Number(f.item))})`)
  let rank = ''
  if (f.q) {
    const q = p(String(f.q).slice(0, 200))
    const like = p(`%${likeEscape(String(f.q).trim().slice(0, 200).toLowerCase())}%`)
    where.push(`(p.search @@ websearch_to_tsquery('spanish', f_unaccent(${q})) OR f_unaccent(lower(p.title)) LIKE f_unaccent(${like}))`)
    rank = `ts_rank(p.search, websearch_to_tsquery('spanish', f_unaccent(${q}))) DESC, `
  }
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = (await one(`SELECT count(*)::int AS n FROM ${from} ${sql}`, params)).n
  const order = admin ? 'p.status = \'draft\' DESC, p.published_at DESC NULLS FIRST, p.updated_at DESC' : 'p.published_at DESC'
  const posts = await many(
    `SELECT ${SUMMARY}, ${PATH} AS path FROM ${from} ${sql}
     ORDER BY ${rank}${order} LIMIT ${p(f.limit ?? 12)} OFFSET ${p(f.offset ?? 0)}`, params)
  return { total, posts }
}

export async function getPost(where, { admin = false } = {}) {
  const from = admin ? 'posts p' : 'public_posts p'
  const byId = where.id != null
  const post = await one(
    `SELECT ${SUMMARY}, ${PATH} AS path, p.content_html, p.allow_comments, p.legacy_path, p.aliases
       ${admin ? ', p.content_json, p.created_at' : ''}
     FROM ${from} WHERE ${byId ? 'p.id = $1' : 'p.slug = $1'}`, [byId ? Number(where.id) : where.slug])
  if (!post) throw httpError(404, 'Esa entrada no existe.')
  post.items = await many(
    `SELECT i.id, i.kind, i.slug, i.title, i.creator, i.year, i.cover_url, i.color, i.rating, i.status
     FROM post_items pi JOIN items i ON i.id = pi.item_id WHERE pi.post_id = $1 ${admin ? '' : 'AND NOT i.hidden'}
     ORDER BY i.title`, [post.id])
  if (!admin) {
    const nav = (dir) => one(
      `SELECT p.slug, p.title, ${PATH} AS path FROM public_posts p
       WHERE (p.published_at, p.id) ${dir === 'prev' ? '<' : '>'} ($1, $2)
       ORDER BY p.published_at ${dir === 'prev' ? 'DESC' : 'ASC'}, p.id ${dir === 'prev' ? 'DESC' : 'ASC'} LIMIT 1`,
      [post.published_at, post.id])
    post.prev = await nav('prev')
    post.next = await nav('next')
  }
  return post
}

// Resuelve una URL antigua (Jekyll o WordPress) a la entrada que le corresponde.
export async function resolvePath(path) {
  const clean = '/' + String(path || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '')
  const withSlash = clean.endsWith('/') ? clean : `${clean}/`
  const row = await one(
    `SELECT p.slug, ${PATH} AS path FROM public_posts p
     WHERE ${PATH} = $1 OR p.legacy_path = $1 OR $1 = ANY(p.aliases) OR $2 = ANY(p.aliases) LIMIT 1`, [withSlash, clean])
  if (!row) throw httpError(404, 'Esa dirección no lleva a ninguna entrada.')
  return { ...row, redirect: row.path !== withSlash }
}

export async function archive() {
  return many(
    `SELECT extract(year FROM published_at AT TIME ZONE 'Europe/Madrid')::int AS year, count(*)::int AS posts
     FROM public_posts GROUP BY 1 ORDER BY 1 DESC`)
}

export async function savePost(id, body) {
  const newId = await tx(async (client) => {
    const cur = id == null ? null : (await client.query('SELECT * FROM posts WHERE id = $1', [id])).rows[0]
    if (id != null && !cur) throw httpError(404, 'Esa entrada no existe.')
    const data = {}
    if ('title' in body || !cur) {
      data.title = String(body.title ?? '').trim()
      if (!data.title) throw httpError(400, 'La entrada necesita un título.')
    }
    if ('description' in body) data.description = String(body.description ?? '')
    if ('content_html' in body) {
      data.content_html = String(body.content_html ?? '')
      data.word_count = wordCount(data.content_html)
    }
    // Sin entradilla, se saca del principio del texto.
    if (data.content_html && !(data.description ?? cur?.description)) data.description = excerpt(data.content_html)
    if ('content_json' in body) data.content_json = body.content_json ?? null
    if ('cover_url' in body) data.cover_url = body.cover_url || null
    if ('category' in body) data.category = String(body.category || 'Bitácora')
    if ('allow_comments' in body) data.allow_comments = !!body.allow_comments
    if ('aliases' in body) data.aliases = (body.aliases || []).map(String).filter(Boolean)
    const status = body.status ?? cur?.status ?? 'draft'
    if (!POST_STATUSES.includes(status)) throw httpError(400, 'Estado no válido.')
    data.status = status
    let publishedAt = 'published_at' in body ? (body.published_at ? new Date(body.published_at) : null) : cur?.published_at ?? null
    if (publishedAt && Number.isNaN(publishedAt.getTime())) throw httpError(400, 'Fecha de publicación no válida.')
    if (status === 'published' && !publishedAt) publishedAt = new Date()
    if (status === 'scheduled' && !publishedAt) throw httpError(400, 'Para programarla hace falta fecha y hora.')
    // Programada para una hora que ya pasó = publicada (si no, el panel la enseñaría "programada" para siempre).
    if (status === 'scheduled' && publishedAt <= new Date()) data.status = 'published'
    data.published_at = publishedAt
    if (body.slug || !cur) {
      const base = slugify(body.slug || data.title, 120)
      let slug = base
      for (let i = 2; ; i++) {
        const row = (await client.query('SELECT id FROM posts WHERE slug = $1', [slug])).rows[0]
        if (!row || row.id === cur?.id) break
        slug = `${base}-${i}`
      }
      data.slug = slug
    }
    const keys = Object.keys(data)
    const vals = keys.map((k) => data[k])
    let postId
    if (cur) {
      await client.query(`UPDATE posts SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...vals])
      postId = cur.id
    } else {
      postId = (await client.query(
        `INSERT INTO posts (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, vals)).rows[0].id
    }
    if (Array.isArray(body.tags)) await setTags(client, 'post_tags', 'post_id', postId, body.tags)
    if (Array.isArray(body.item_ids)) {
      await client.query('DELETE FROM post_items WHERE post_id = $1', [postId])
      for (const itemId of body.item_ids) {
        await client.query('INSERT INTO post_items (post_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [postId, Number(itemId)])
      }
    }
    return postId
  })
  return getPost({ id: newId }, { admin: true })
}

export async function deletePost(id) {
  const r = await query('DELETE FROM posts WHERE id = $1', [id])
  if (!r.rowCount) throw httpError(404, 'Esa entrada no existe.')
}

/* ------------------------------------------------------------ comentarios */

const PUBLIC_COMMENT = 'c.id, c.parent_id, c.author, c.website, c.body, c.is_captain, c.created_at'

export async function publicComments(slug) {
  const post = await one('SELECT id, allow_comments FROM public_posts WHERE slug = $1', [slug])
  if (!post) throw httpError(404, 'Esa entrada no existe.')
  const comments = await many(
    `SELECT ${PUBLIC_COMMENT} FROM comments c WHERE c.post_id = $1 AND c.status = 'visible' ORDER BY c.created_at`, [post.id])
  return { allow_comments: post.allow_comments, comments }
}

export async function addComment(slug, { author, email, website, body, parent_id }, { status, ipHash }) {
  const post = await one('SELECT id, allow_comments FROM public_posts WHERE slug = $1', [slug])
  if (!post) throw httpError(404, 'Esa entrada no existe.')
  if (!post.allow_comments) throw httpError(403, 'Los comentarios de esta entrada están cerrados.')
  author = String(author ?? '').trim().slice(0, 80)
  body = String(body ?? '').trim()
  if (!author) throw httpError(400, 'Dinos cómo te llamas.')
  if (!body) throw httpError(400, 'El comentario está vacío.')
  if (body.length > 5000) throw httpError(400, 'El comentario es demasiado largo (máximo 5000 caracteres).')
  website = website ? String(website).trim().slice(0, 300) : null
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`
  let parent = null
  if (parent_id) {
    parent = await one("SELECT id FROM comments WHERE id = $1 AND post_id = $2 AND status = 'visible'", [parent_id, post.id])
    if (!parent) throw httpError(400, 'El comentario al que respondes no existe.')
  }
  return one(
    `INSERT INTO comments (post_id, parent_id, author, email, website, body, status, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, status, created_at`,
    [post.id, parent?.id ?? null, author, email ? String(email).slice(0, 200) : null, website, body, status, ipHash])
}

export async function adminComments({ status, post_id, limit = 50, offset = 0 } = {}) {
  const where = []
  const params = []
  const p = (v) => { params.push(v); return `$${params.length}` }
  if (status) {
    if (!COMMENT_STATUSES.includes(status)) throw httpError(400, 'Estado no válido.')
    where.push(`c.status = ${p(status)}::comment_status`)
  }
  if (post_id) where.push(`c.post_id = ${p(Number(post_id))}`)
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = (await one(`SELECT count(*)::int AS n FROM comments c ${sql}`, params)).n
  const comments = await many(
    `SELECT c.*, p.slug AS post_slug, p.title AS post_title FROM comments c JOIN posts p ON p.id = c.post_id ${sql}
     ORDER BY c.created_at DESC LIMIT ${p(limit)} OFFSET ${p(offset)}`, params)
  const counts = Object.fromEntries((await many('SELECT status, count(*)::int AS n FROM comments GROUP BY status')).map((r) => [r.status, r.n]))
  return { total, comments, counts }
}

export async function moderate(id, { status, body }) {
  const sets = []
  const params = [id]
  if (status) {
    if (!COMMENT_STATUSES.includes(status)) throw httpError(400, 'Estado no válido.')
    params.push(status); sets.push(`status = $${params.length}::comment_status`)
  }
  if (body != null) { params.push(String(body)); sets.push(`body = $${params.length}`) }
  if (!sets.length) throw httpError(400, 'Nada que cambiar.')
  const row = await one(`UPDATE comments SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params)
  if (!row) throw httpError(404, 'Ese comentario no existe.')
  return row
}

export async function captainReply(id, body, author = 'Malkev') {
  const parent = await one('SELECT id, post_id FROM comments WHERE id = $1', [id])
  if (!parent) throw httpError(404, 'Ese comentario no existe.')
  body = String(body ?? '').trim()
  if (!body) throw httpError(400, 'La respuesta está vacía.')
  // Responder a un comentario lo aprueba: no tiene sentido una respuesta visible a algo oculto.
  await query("UPDATE comments SET status = 'visible' WHERE id = $1 AND status = 'pending'", [id])
  return one(
    `INSERT INTO comments (post_id, parent_id, author, body, status, is_captain)
     VALUES ($1, $2, $3, $4, 'visible', true) RETURNING *`, [parent.post_id, parent.id, author, body])
}

export const deleteComment = (id) => query('DELETE FROM comments WHERE id = $1', [id])

export async function blogStats({ admin = false } = {}) {
  return one(
    `SELECT (SELECT count(*)::int FROM public_posts) AS published,
            ${admin ? `(SELECT count(*)::int FROM posts WHERE status = 'draft') AS drafts,
            (SELECT count(*)::int FROM posts WHERE status = 'scheduled' AND published_at > now()) AS scheduled,
            (SELECT count(*)::int FROM comments WHERE status = 'pending') AS pending_comments,` : ''}
            (SELECT count(*)::int FROM comments c JOIN public_posts p ON p.id = c.post_id WHERE c.status = 'visible') AS comments`)
}
