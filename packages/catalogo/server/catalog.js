// Catálogo: items, etiquetas, notas y colecciones. Lo usan tanto la API pública como la del panel;
// la diferencia es `admin`, que deja ver lo oculto y las notas privadas.
import { one, many, query, tx } from './db.js'
import { httpError } from './lib/http.js'
import { slugify } from './lib/text.js'

export const KINDS = ['boardgame', 'rpg', 'film', 'series', 'book', 'manga', 'videogame']
export const STATUSES = ['owned', 'wishlist', 'reading', 'watching', 'playing', 'done', 'paused', 'dropped']
export const COLLECTION_KINDS = ['kallax', 'shelf', 'bookcase', 'list']

export const KIND_LABELS = {
  boardgame: 'Juego de mesa', rpg: 'Libro de rol', film: 'Película', series: 'Serie',
  book: 'Libro', manga: 'Manga', videogame: 'Videojuego',
}
export const STATUS_LABELS = {
  owned: 'En la colección', wishlist: 'Lo quiero', reading: 'Leyendo', watching: 'Viendo', playing: 'Jugando',
  done: 'Terminado', paused: 'Aparcado', dropped: 'Abandonado',
}

// En LIKE, % y _ son comodines: quien busca "100%" quiere el carácter, no "lo que sea".
export const likeEscape = (s) => String(s).replace(/[\\%_]/g, (c) => `\\${c}`)

const TAGS_JSON = (table, fk, alias) => `COALESCE((
  SELECT json_agg(json_build_object('slug', t.slug, 'name', t.name, 'color', t.color) ORDER BY t.name)
  FROM ${table} x JOIN tags t ON t.id = x.tag_id WHERE x.${fk} = ${alias}.id), '[]'::json)`

const PUBLIC_COLS = `i.id, i.kind, i.slug, i.title, i.original_title, i.creator, i.year, i.synopsis, i.cover_url, i.color,
  i.rating, i.status, i.featured, i.started_on, i.finished_on, i.external_ids, i.meta, i.created_at, i.updated_at`
const ADMIN_COLS = `${PUBLIC_COLS}, i.notes, i.hidden`

const SORTS = {
  title: 'f_unaccent(lower(i.title)) ASC, i.id',
  '-title': 'f_unaccent(lower(i.title)) DESC, i.id',
  year: 'i.year ASC NULLS LAST, i.id',
  '-year': 'i.year DESC NULLS LAST, i.id',
  '-rating': 'i.rating DESC NULLS LAST, f_unaccent(lower(i.title))',
  rating: 'i.rating ASC NULLS LAST, f_unaccent(lower(i.title))',
  '-updated': 'i.updated_at DESC, i.id DESC',
  '-created': 'i.created_at DESC, i.id DESC',
  '-finished': 'i.finished_on DESC NULLS LAST, i.id DESC',
}

/* ------------------------------------------------------------------ items */

export async function listItems(f = {}, { admin = false } = {}) {
  const where = []
  const params = []
  const p = (v) => { params.push(v); return `$${params.length}` }
  if (!admin || f.hidden === false) where.push('NOT i.hidden')
  if (admin && f.hidden === true) where.push('i.hidden')
  if (f.kinds?.length) {
    const bad = f.kinds.filter((k) => !KINDS.includes(k))
    if (bad.length) throw httpError(400, `Tipo desconocido: ${bad.join(', ')}`)
    where.push(`i.kind = ANY(${p(f.kinds)}::item_kind[])`)
  }
  if (f.statuses?.length) {
    const bad = f.statuses.filter((s) => !STATUSES.includes(s))
    if (bad.length) throw httpError(400, `Estado desconocido: ${bad.join(', ')}`)
    where.push(`i.status = ANY(${p(f.statuses)}::item_status[])`)
  }
  if (f.featured !== undefined) where.push(`i.featured = ${p(!!f.featured)}`)
  if (f.year) where.push(`i.year = ${p(Number(f.year))}`)
  if (f.rated === true) where.push('i.rating IS NOT NULL')
  for (const tag of f.tags || []) {
    where.push(`EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id AND t.slug = ${p(tag)})`)
  }
  if (f.collection) {
    where.push(`EXISTS (SELECT 1 FROM collection_items ci JOIN collections c ON c.id = ci.collection_id
      WHERE ci.item_id = i.id AND c.slug = ${p(f.collection)}${admin ? '' : ' AND c.is_public'})`)
  }
  if (f.external) {
    // ?external=tmdb:603  → busca por identificador en otra web
    const [key, ...rest] = String(f.external).split(':')
    const value = rest.join(':')
    where.push(`(i.external_ids ->> ${p(key)}) = ${p(value)}`)
  }
  if (f.q) {
    const text = String(f.q).trim().slice(0, 200)
    const q = p(text)
    const like = p(`%${likeEscape(text.toLowerCase())}%`)
    where.push(`(i.search @@ websearch_to_tsquery('simple', f_unaccent(${q}))
      OR f_unaccent(lower(i.title)) LIKE f_unaccent(${like})
      OR f_unaccent(lower(i.creator)) LIKE f_unaccent(${like}))`)
  }
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const order = SORTS[f.sort] || (f.q ? 'i.featured DESC, f_unaccent(lower(i.title))' : SORTS.title)
  const total = (await one(`SELECT count(*)::int AS n FROM items i ${sql}`, params)).n
  const limit = p(f.limit ?? 24)
  const offset = p(f.offset ?? 0)
  const items = await many(
    `SELECT ${admin ? ADMIN_COLS : PUBLIC_COLS}, ${TAGS_JSON('item_tags', 'item_id', 'i')} AS tags
     FROM items i ${sql} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params)
  return { total, items }
}

export async function getItem(where, { admin = false } = {}) {
  const params = []
  let cond
  if (where.id != null) { params.push(Number(where.id)); cond = 'i.id = $1' }
  else { params.push(where.kind, where.slug); cond = 'i.kind = $1::item_kind AND i.slug = $2' }
  if (!admin) cond += ' AND NOT i.hidden'
  const item = await one(
    `SELECT ${admin ? ADMIN_COLS : PUBLIC_COLS}, ${TAGS_JSON('item_tags', 'item_id', 'i')} AS tags FROM items i WHERE ${cond}`,
    params).catch((err) => { if (err.code === '22P02') return null; throw err })
  if (!item) throw httpError(404, 'No encuentro eso en el catálogo.')
  item.ratings = await many(
    'SELECT id, score, review, rated_at FROM item_ratings WHERE item_id = $1 ORDER BY rated_at DESC, id DESC LIMIT 50', [item.id])
  item.collections = await many(
    `SELECT c.slug, c.name, c.kind, c.room, ci.row, ci.col, ci.position, ci.placement
     FROM collection_items ci JOIN collections c ON c.id = ci.collection_id
     WHERE ci.item_id = $1 ${admin ? '' : 'AND c.is_public'} ORDER BY c.position, c.name`, [item.id])
  item.posts = await many(
    `SELECT p.slug, p.title, p.path, p.published_at FROM post_items pi JOIN public_posts p ON p.id = pi.post_id
     WHERE pi.item_id = $1 ORDER BY p.published_at DESC`, [item.id])
  return item
}

const ITEM_FIELDS = {
  kind: (v) => { if (!KINDS.includes(v)) throw httpError(400, 'Tipo no válido.'); return v },
  title: (v) => { v = String(v ?? '').trim(); if (!v) throw httpError(400, 'Falta el título.'); return v.slice(0, 500) },
  slug: (v) => (v ? slugify(v) : undefined),
  original_title: (v) => (v ? String(v).trim() : null),
  creator: (v) => String(v ?? '').trim(),
  year: (v) => (v === '' || v == null ? null : Number.parseInt(v, 10)),
  synopsis: (v) => String(v ?? ''),
  cover_url: (v) => (v ? String(v).trim() : null),
  color: (v) => (v ? String(v).trim().toLowerCase() : null),
  rating: (v) => (v === '' || v == null ? null : Number.parseInt(v, 10)),
  status: (v) => { if (!STATUSES.includes(v)) throw httpError(400, 'Estado no válido.'); return v },
  notes: (v) => String(v ?? ''),
  featured: (v) => !!v,
  hidden: (v) => !!v,
  started_on: (v) => v || null,
  finished_on: (v) => v || null,
  external_ids: (v) => objectOrThrow(v, 'external_ids'),
  meta: (v) => objectOrThrow(v, 'meta'),
}

function objectOrThrow(v, name) {
  if (v == null) return {}
  if (typeof v !== 'object' || Array.isArray(v)) throw httpError(400, `${name} tiene que ser un objeto.`)
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== ''))
}

function pick(body, fields) {
  const out = {}
  for (const [k, fn] of Object.entries(fields)) if (k in body) {
    const v = fn(body[k])
    if (v !== undefined) out[k] = v
  }
  return out
}

async function freeSlug(client, table, base, { kind, ignoreId } = {}) {
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`
    const params = [slug]
    let sql = `SELECT id FROM ${table} WHERE slug = $1`
    if (kind) { params.push(kind); sql += ` AND kind = $2::item_kind` }
    const row = (await client.query(sql, params)).rows[0]
    if (!row || row.id === ignoreId) return slug
  }
}

export async function setTags(client, table, fk, id, names) {
  await client.query(`DELETE FROM ${table} WHERE ${fk} = $1`, [id])
  for (const raw of names || []) {
    const name = String(raw).trim()
    if (!name) continue
    const tag = (await client.query(
      `INSERT INTO tags (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id`,
      [slugify(name), name])).rows[0]
    await client.query(`INSERT INTO ${table} (${fk}, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, tag.id])
  }
}

export async function saveItem(id, body) {
  const data = pick(body, ITEM_FIELDS)
  return tx(async (client) => {
    let current = null
    if (id != null) {
      current = (await client.query('SELECT id, kind, slug, title FROM items WHERE id = $1', [id])).rows[0]
      if (!current) throw httpError(404, 'No encuentro eso en el catálogo.')
    } else {
      if (!data.kind) throw httpError(400, 'Falta el tipo.')
      if (!data.title) throw httpError(400, 'Falta el título.')
    }
    const kind = data.kind || current.kind
    if (data.slug || !current || (data.kind && data.kind !== current.kind)) {
      data.slug = await freeSlug(client, 'items', data.slug || slugify(data.title || current.title), { kind, ignoreId: current?.id })
    }
    const keys = Object.keys(data)
    let row
    if (current) {
      if (keys.length) {
        const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
        await client.query(`UPDATE items SET ${set} WHERE id = $1`, [id, ...keys.map((k) => data[k])])
      }
      row = current
    } else {
      row = (await client.query(
        `INSERT INTO items (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
        keys.map((k) => data[k]))).rows[0]
    }
    if (Array.isArray(body.tags)) await setTags(client, 'item_tags', 'item_id', row.id, body.tags)
    if (Array.isArray(body.collections)) {
      for (const slug of body.collections) {
        await client.query(
          `INSERT INTO collection_items (collection_id, item_id, position)
           SELECT c.id, $2, COALESCE((SELECT max(position) + 1 FROM collection_items WHERE collection_id = c.id), 0)
           FROM collections c WHERE c.slug = $1 ON CONFLICT DO NOTHING`, [slug, row.id])
      }
    }
    return row.id
  }).then((newId) => getItem({ id: newId }, { admin: true }))
}

export async function deleteItems(ids) {
  return (await query('DELETE FROM items WHERE id = ANY($1::bigint[])', [ids.map(Number)])).rowCount
}

// Cambios en bloque: solo los interruptores (visible, destacado) y el estado, en una sola consulta.
export async function bulkUpdate(ids, patch) {
  const sets = []
  const params = [ids.map(Number)]
  for (const key of ['hidden', 'featured']) {
    if (key in patch) { params.push(!!patch[key]); sets.push(`${key} = $${params.length}`) }
  }
  if ('status' in patch) {
    params.push(ITEM_FIELDS.status(patch.status)); sets.push(`status = $${params.length}::item_status`)
  }
  if (!sets.length) throw httpError(400, 'En bloque solo se puede cambiar: oculto, destacado o estado.')
  return (await query(`UPDATE items SET ${sets.join(', ')} WHERE id = ANY($1::bigint[])`, params)).rowCount
}

export async function deleteItem(id) {
  const r = await query('DELETE FROM items WHERE id = $1', [id])
  if (!r.rowCount) throw httpError(404, 'No encuentro eso en el catálogo.')
}

// Poner nota: cambia items.rating (el trigger lo apunta en el historial) y guarda la reseña si la hay.
export async function rateItem(id, { score, review = '' }) {
  score = Number.parseInt(score, 10)
  if (!(score >= 0 && score <= 10)) throw httpError(400, 'La nota va de 0 a 10.')
  await tx(async (client) => {
    const cur = (await client.query('SELECT rating FROM items WHERE id = $1 FOR UPDATE', [id])).rows[0]
    if (!cur) throw httpError(404, 'No encuentro eso en el catálogo.')
    if (cur.rating === score) {
      await client.query('INSERT INTO item_ratings (item_id, score, review) VALUES ($1, $2, $3)', [id, score, review])
    } else {
      await client.query('UPDATE items SET rating = $2 WHERE id = $1', [id, score])
      if (review) {
        await client.query(
          `UPDATE item_ratings SET review = $2 WHERE id = (SELECT max(id) FROM item_ratings WHERE item_id = $1)`, [id, review])
      }
    }
  })
  return getItem({ id }, { admin: true })
}

export async function deleteRating(itemId, ratingId) {
  await query('DELETE FROM item_ratings WHERE id = $1 AND item_id = $2', [ratingId, itemId])
  // La nota actual pasa a ser la última que quede.
  await query(
    `UPDATE items SET rating = (SELECT score FROM item_ratings WHERE item_id = $1 ORDER BY rated_at DESC, id DESC LIMIT 1)
     WHERE id = $1`, [itemId])
}

/* ------------------------------------------------------------- etiquetas */

export async function listTags({ admin = false } = {}) {
  return many(
    `SELECT t.id, t.slug, t.name, t.color,
       (SELECT count(*)::int FROM item_tags it JOIN items i ON i.id = it.item_id WHERE it.tag_id = t.id ${admin ? '' : 'AND NOT i.hidden'}) AS item_count,
       (SELECT count(*)::int FROM post_tags pt JOIN ${admin ? 'posts' : 'public_posts'} p ON p.id = pt.post_id WHERE pt.tag_id = t.id) AS post_count
     FROM tags t ORDER BY t.name`)
}

export async function saveTag(id, body) {
  const name = String(body.name ?? '').trim()
  const slug = body.slug ? slugify(body.slug) : name ? slugify(name) : undefined
  const color = body.color ? String(body.color).toLowerCase() : null
  if (id == null) {
    if (!name) throw httpError(400, 'Falta el nombre.')
    return one('INSERT INTO tags (slug, name, color) VALUES ($1, $2, $3) RETURNING *', [slug, name, color])
  }
  const row = await one(
    `UPDATE tags SET name = COALESCE(NULLIF($2, ''), name), slug = COALESCE($3, slug), color = $4 WHERE id = $1 RETURNING *`,
    [id, name, body.slug ? slug : null, color])
  if (!row) throw httpError(404, 'Esa etiqueta no existe.')
  return row
}

// Fusionar: todo lo que tenía `from` pasa a `into` y `from` desaparece.
export async function mergeTags(fromId, intoId) {
  if (Number(fromId) === Number(intoId)) throw httpError(400, 'No se puede fusionar una etiqueta consigo misma.')
  await tx(async (client) => {
    await client.query('INSERT INTO item_tags (item_id, tag_id) SELECT item_id, $2 FROM item_tags WHERE tag_id = $1 ON CONFLICT DO NOTHING', [fromId, intoId])
    await client.query('INSERT INTO post_tags (post_id, tag_id) SELECT post_id, $2 FROM post_tags WHERE tag_id = $1 ON CONFLICT DO NOTHING', [fromId, intoId])
    await client.query('DELETE FROM tags WHERE id = $1', [fromId])
  })
}

export const deleteTag = (id) => query('DELETE FROM tags WHERE id = $1', [id])

/* ----------------------------------------------------------- colecciones */

export async function listCollections({ admin = false } = {}) {
  return many(
    `SELECT c.id, c.slug, c.name, c.kind, c.description, c.room, c.rows, c.cols, c.position, c.is_public, c.updated_at,
       (SELECT count(*)::int FROM collection_items ci JOIN items i ON i.id = ci.item_id
        WHERE ci.collection_id = c.id ${admin ? '' : 'AND NOT i.hidden'}) AS item_count
     FROM collections c ${admin ? '' : 'WHERE c.is_public'} ORDER BY c.position, c.name`)
}

export async function getCollection(where, { admin = false, limit = 5000, offset = 0 } = {}) {
  const byId = where.id != null
  const col = await one(
    `SELECT * FROM collections WHERE ${byId ? 'id = $1' : 'slug = $1'} ${admin ? '' : 'AND is_public'}`,
    [byId ? Number(where.id) : where.slug])
  if (!col) throw httpError(404, 'Esa colección no existe.')
  const hidden = admin ? '' : 'AND NOT i.hidden'
  col.total = (await one(`SELECT count(*)::int AS n FROM collection_items ci JOIN items i ON i.id = ci.item_id WHERE ci.collection_id = $1 ${hidden}`, [col.id])).n
  col.items = await many(
    `SELECT ${admin ? ADMIN_COLS : PUBLIC_COLS}, ${TAGS_JSON('item_tags', 'item_id', 'i')} AS tags,
       json_build_object('row', ci.row, 'col', ci.col, 'position', ci.position, 'placement', ci.placement, 'note', ci.note) AS slot
     FROM collection_items ci JOIN items i ON i.id = ci.item_id
     WHERE ci.collection_id = $1 ${hidden}
     ORDER BY ci.row NULLS FIRST, ci.col NULLS FIRST, ci.position, f_unaccent(lower(i.title))
     LIMIT $2 OFFSET $3`, [col.id, limit, offset])
  return col
}

const COLLECTION_FIELDS = {
  name: (v) => { v = String(v ?? '').trim(); if (!v) throw httpError(400, 'Falta el nombre.'); return v },
  slug: (v) => (v ? slugify(v) : undefined),
  kind: (v) => { if (!COLLECTION_KINDS.includes(v)) throw httpError(400, 'Tipo de colección no válido.'); return v },
  description: (v) => String(v ?? ''),
  room: (v) => (v ? String(v) : null),
  rows: (v) => (v === '' || v == null ? null : Number.parseInt(v, 10)),
  cols: (v) => (v === '' || v == null ? null : Number.parseInt(v, 10)),
  layout: (v) => objectOrThrow(v, 'layout'),
  position: (v) => Number.parseInt(v, 10) || 0,
  is_public: (v) => !!v,
}

export async function saveCollection(id, body) {
  const data = pick(body, COLLECTION_FIELDS)
  const newId = await tx(async (client) => {
    if (id == null) {
      if (!data.name) throw httpError(400, 'Falta el nombre.')
      data.slug = await freeSlug(client, 'collections', data.slug || slugify(data.name))
      const keys = Object.keys(data)
      return (await client.query(
        `INSERT INTO collections (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
        keys.map((k) => data[k]))).rows[0].id
    }
    if (data.slug) data.slug = await freeSlug(client, 'collections', data.slug, { ignoreId: Number(id) })
    const keys = Object.keys(data)
    if (keys.length) {
      const r = await client.query(`UPDATE collections SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`,
        [id, ...keys.map((k) => data[k])])
      if (!r.rowCount) throw httpError(404, 'Esa colección no existe.')
    }
    return Number(id)
  })
  return getCollection({ id: newId }, { admin: true, limit: 200 })
}

export async function deleteCollection(id) {
  const r = await query('DELETE FROM collections WHERE id = $1', [id])
  if (!r.rowCount) throw httpError(404, 'Esa colección no existe.')
}

const slotOf = (s, i) => ({
  item_id: Number(s.item_id),
  position: Number.isInteger(s.position) ? s.position : i,
  row: s.row === '' || s.row == null ? null : Number(s.row),
  col: s.col === '' || s.col == null ? null : Number(s.col),
  placement: String(s.placement ?? ''),
  note: String(s.note ?? ''),
})

// Añade o recoloca un item en una colección.
export async function placeItem(collectionId, slot) {
  const s = slotOf(slot, null)
  await query(
    `INSERT INTO collection_items (collection_id, item_id, position, row, col, placement, note)
     VALUES ($1, $2, COALESCE($3, (SELECT COALESCE(max(position) + 1, 0) FROM collection_items WHERE collection_id = $1)), $4, $5, $6, $7)
     ON CONFLICT (collection_id, item_id) DO UPDATE SET position = COALESCE($3, collection_items.position),
       row = EXCLUDED.row, col = EXCLUDED.col, placement = EXCLUDED.placement, note = EXCLUDED.note`,
    [collectionId, s.item_id, Number.isInteger(slot.position) ? slot.position : null, s.row, s.col, s.placement, s.note])
}

// Sustituye el contenido entero (para reordenar arrastrando en el panel).
export async function replaceCollectionItems(collectionId, slots) {
  if (!Array.isArray(slots)) throw httpError(400, 'Hace falta una lista de items.')
  if (slots.length > 10000) throw httpError(400, 'Demasiados items para una colección.')
  const s = slots.map(slotOf)
  if (s.some((x) => !Number.isInteger(x.item_id))) throw httpError(400, 'Hay un item sin id válido.')
  await tx(async (client) => {
    const exists = (await client.query('SELECT 1 FROM collections WHERE id = $1 FOR UPDATE', [collectionId])).rowCount
    if (!exists) throw httpError(404, 'Esa colección no existe.')
    await client.query('DELETE FROM collection_items WHERE collection_id = $1', [collectionId])
    // Todo de una vez con unnest: una colección de 800 pelis es una sola consulta, no 800.
    await client.query(
      `INSERT INTO collection_items (collection_id, item_id, position, row, col, placement, note)
       SELECT $1, * FROM unnest($2::bigint[], $3::int[], $4::smallint[], $5::smallint[], $6::text[], $7::text[])
       ON CONFLICT DO NOTHING`,
      [collectionId, s.map((x) => x.item_id), s.map((x) => x.position), s.map((x) => x.row), s.map((x) => x.col),
        s.map((x) => x.placement), s.map((x) => x.note)])
  })
}

export const unplaceItem = (collectionId, itemId) =>
  query('DELETE FROM collection_items WHERE collection_id = $1 AND item_id = $2', [collectionId, itemId])

/* ------------------------------------------------------------ estadísticas */

export async function catalogStats({ admin = false } = {}) {
  const hidden = admin ? '' : 'WHERE NOT hidden'
  const byKind = await many(`SELECT kind, count(*)::int AS n FROM items ${hidden} GROUP BY kind`)
  const byStatus = await many(`SELECT kind, status, count(*)::int AS n FROM items ${hidden} GROUP BY kind, status`)
  const ratings = await many(`SELECT rating, count(*)::int AS n FROM items ${hidden ? `${hidden} AND` : 'WHERE'} rating IS NOT NULL GROUP BY rating ORDER BY rating`)
  const now = await many(
    `SELECT ${PUBLIC_COLS} FROM items i WHERE NOT i.hidden AND i.status IN ('reading', 'watching', 'playing')
     ORDER BY i.updated_at DESC LIMIT 12`)
  return {
    items: Object.fromEntries(KINDS.map((k) => [k, byKind.find((r) => r.kind === k)?.n ?? 0])),
    by_status: byStatus,
    ratings: Object.fromEntries(ratings.map((r) => [r.rating, r.n])),
    now_on_board: now,
  }
}
