// Utilidades comunes de los scripts de importación: guardar sin duplicar y leer CSV.
import { db, transaction } from '../../server/db.js'

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Inserta o actualiza cada objeto. Por defecto se busca por tipo y título (y año, si lo tiene); con
// opts.key se usa otra clave (los videojuegos, por ejemplo, van por su id de LaunchBox).
// Lo que ya estaba conserva sus notas y su color; se actualizan nota, estado, portada y meta.
export const VIDEOGAME_KEY = (it) =>
  it.meta?.launchbox_id ? `lb:${it.meta.launchbox_id}` : `${norm(it.title)}|${norm(it.meta?.platform)}`

export function upsertAll(kind, list, { key = null } = {}) {
  const existing = db.prepare('SELECT id, title, year, meta, notes, color FROM items WHERE kind = ?').all(kind)
  const byKey = new Map()
  for (const row of existing) {
    if (key) {
      const k = key({ ...row, meta: JSON.parse(row.meta || '{}') })
      if (k && !byKey.has(k)) byKey.set(k, row)
    } else {
      byKey.set(`${norm(row.title)}|${row.year ?? ''}`, row)
      if (!byKey.has(norm(row.title))) byKey.set(norm(row.title), row)
    }
  }
  const find = (it) => (key ? byKey.get(key(it)) : byKey.get(`${norm(it.title)}|${it.year ?? ''}`) || byKey.get(norm(it.title)))
  const insert = db.prepare(`
    INSERT INTO items (kind, title, creator, year, cover_url, color, rating, status, notes, position, featured, hidden, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const update = db.prepare(`
    UPDATE items SET title = ?, creator = COALESCE(NULLIF(?, ''), creator), year = COALESCE(?, year), cover_url = COALESCE(?, cover_url),
      color = COALESCE(color, ?), rating = COALESCE(?, rating), status = ?, notes = CASE WHEN notes = '' THEN ? ELSE notes END,
      featured = COALESCE(?, featured), hidden = COALESCE(?, hidden), meta = ?, updated_at = datetime('now')
    WHERE id = ?
  `)
  const flag = (v) => (v === undefined || v === null ? null : v ? 1 : 0)
  let position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM items WHERE kind = ?').get(kind).n
  const counts = { added: 0, updated: 0 }
  transaction(() => {
    for (const it of list) {
      const row = find(it)
      if (row) {
        const meta = { ...JSON.parse(row.meta || '{}'), ...it.meta }
        update.run(it.title, it.creator || '', it.year ?? null, it.cover_url || null, it.color || null, it.rating ?? null,
          it.status || 'owned', it.notes || '', flag(it.featured), flag(it.hidden), JSON.stringify(meta), row.id)
        counts.updated++
      } else {
        insert.run(kind, it.title, it.creator || '', it.year ?? null, it.cover_url || null, it.color || null,
          it.rating ?? null, it.status || 'owned', it.notes || '', position++, it.featured ? 1 : 0, it.hidden ? 1 : 0,
          JSON.stringify(it.meta || {}))
        counts.added++
      }
    }
  })
  return counts
}

// CSV con comillas, comas y saltos de línea dentro de los campos (lo que exporta Goodreads).
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  const [header, ...body] = rows
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

export function stripHtml(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
}

export const decode = (s) => stripHtml(s).replace(/\s+/g, ' ').trim()

export function report(what, counts, sample) {
  console.log(`✦ ${what}: ${counts.added} nuevos, ${counts.updated} actualizados.`)
  if (sample?.length) {
    console.log('  Muestra de lo leído (revisa que tenga sentido):')
    for (const it of sample) console.log(`  - ${it.title}${it.year ? ` (${it.year})` : ''}${it.creator ? ` · ${it.creator}` : ''}${it.rating != null ? ` · nota ${it.rating}` : ''}`)
  }
}
