// El ordenador de a bordo: una búsqueda en toda la nave (entradas de la bitácora, etiquetas y toda la
// colección) para el panel que se abre con Ctrl+K.
import { db } from './db.js'

export const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// FTS5: cada palabra se busca como prefijo, para que "drag" encuentre "dragón".
export function ftsQuery(q) {
  return String(q)
    .split(/\s+/)
    .map((w) => w.replace(/["*^:()]/g, ''))
    .filter(Boolean)
    .map((w) => `"${w}"*`)
    .join(' ')
}

// La colección cabe de sobra en memoria; se vuelve a leer solo cuando cambia algo.
let cache = { stamp: '', rows: [] }
function itemsIndex() {
  const stamp = JSON.stringify(db.prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS t, MAX(id) AS m FROM items').get())
  if (stamp !== cache.stamp) {
    const rows = db.prepare(`
      SELECT id, kind, title, creator, year, cover_url, color, status, json_extract(meta, '$.platform') AS platform
      FROM items WHERE hidden = 0
    `).all()
    cache = {
      stamp,
      rows: rows.map((r) => ({ ...r, ntitle: normalize(r.title), text: normalize(`${r.title} ${r.creator} ${r.platform || ''}`) })),
    }
  }
  return cache.rows
}

export function search(q, { admin = false, limit = 18 } = {}) {
  const text = normalize(q).trim()
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return { posts: [], items: [], tags: [] }

  const posts = db.prepare(`
    SELECT p.slug, p.title, p.category, p.status, p.published_at,
      snippet(posts_fts, 2, '', '', '…', 12) AS snippet
    FROM posts_fts JOIN posts p ON p.id = posts_fts.rowid
    WHERE posts_fts MATCH ? ${admin ? '' : "AND p.status = 'published'"}
    ORDER BY bm25(posts_fts, 6.0, 2.0, 1.0)
    LIMIT 8
  `).all(ftsQuery(q))

  const scored = []
  for (const it of itemsIndex()) {
    if (!words.every((w) => it.text.includes(w))) continue
    const score = it.ntitle.startsWith(text) ? 0 : it.ntitle.includes(text) ? 1 : it.ntitle.includes(words[0]) ? 2 : 3
    scored.push([score, it])
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].title.localeCompare(b[1].title, 'es'))
  const items = scored.slice(0, limit).map(([, { ntitle, text: _t, ...rest }]) => rest)

  const tags = db.prepare(`
    SELECT t.name, COUNT(*) AS n FROM tags t
    JOIN post_tags pt ON pt.tag_id = t.id JOIN posts p ON p.id = pt.post_id
    WHERE p.status = 'published' AND t.name LIKE ? GROUP BY t.name ORDER BY n DESC LIMIT 5
  `).all(`%${words[0].replace(/[%_]/g, '')}%`)

  return { posts, items, tags, more: scored.length - items.length }
}
