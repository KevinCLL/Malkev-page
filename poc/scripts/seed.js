// Rellena la base de datos local:
//  - importa las entradas del blog actual (../_posts/*.md) convirtiendo el Markdown a HTML,
//  - añade una colección de ejemplo para la Kallax, la estantería y la librería.
// Se puede ejecutar las veces que haga falta: borra y vuelve a crear todo.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'
import { db, setPostTags, indexPost, uniqueSlug, transaction } from '../server/db.js'
import { boardgames, films, series, books, manga } from './sample-collection.js'

const here = dirname(fileURLToPath(import.meta.url))
const POSTS_DIR = join(here, '..', '..', '_posts')

// Front matter de Jekyll: solo los campos que usan estas entradas.
function parseFrontMatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { data: {}, body: raw }
  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/)
    if (!kv) continue
    let [, key, value] = kv
    value = value.trim()
    if (value.startsWith('[')) {
      data[key] = value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
    } else if (value.startsWith('"')) {
      data[key] = JSON.parse(value)
    } else if (value === 'true' || value === 'false') {
      data[key] = value === 'true'
    } else {
      data[key] = value
    }
  }
  return { data, body: match[2] }
}

// Las entradas antiguas solo tienen etiquetas: la categoría se deduce de ellas.
const CATEGORY_BY_TAG = [
  ['proyecto-arca', 'Proyecto Arca'],
  ['izaro', 'Izaro'],
  ['novela', 'Novela'],
  ['rol', 'Rol'],
  ['relatos', 'Relatos'],
  ['poesía', 'Relatos'],
  ['humor', 'Humor'],
  ['cine', 'Cine y series'],
  ['videojuegos', 'Videojuegos'],
  ['diario', 'Diario'],
  ['relaciones', 'Diario'],
  ['meta', 'Malkevnia'],
]

function categoryFor(tags) {
  for (const [tag, category] of CATEGORY_BY_TAG) if (tags.includes(tag)) return category
  return 'Varios'
}

// "2010-02-28 23:35:52 +0100" -> ISO 8601
function toIso(date) {
  const m = String(date).match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?\s*([+-]\d{2}):?(\d{2})?/)
  if (!m) return new Date(date).toISOString()
  const time = m[2] ? (m[2].length === 5 ? `${m[2]}:00` : m[2]) : '12:00:00'
  return new Date(`${m[1]}T${time}${m[3] ? `${m[3]}:${m[4] || '00'}` : 'Z'}`).toISOString()
}

marked.setOptions({ gfm: true, breaks: true })

function importPosts() {
  const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md')).sort()
  const insert = db.prepare(`
    INSERT INTO posts (slug, title, excerpt, content_html, cover, category, status, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const file of files) {
    const { data, body } = parseFrontMatter(readFileSync(join(POSTS_DIR, file), 'utf8'))
    const markdown = body
      .replace(/\{\{\s*'([^']+)'\s*\|\s*relative_url\s*\}\}/g, '$1')
      // Títulos con ancla de kramdown: "## Título {#id}" -> <h2 id="id">
      .replace(/^(#{1,6})\s+(.+?)\s*\{#([\w-]+)\}\s*$/gm, (_, hashes, text, id) =>
        `<h${hashes.length} id="${id}">${marked.parseInline(text)}</h${hashes.length}>`)
    const html = marked.parse(markdown)
    const firstImage = html.match(/<img[^>]+src="([^"]+)"/)
    const tags = data.tags || []
    const published = toIso(data.date || file.slice(0, 10))
    const slug = uniqueSlug(file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, ''))
    const id = Number(insert.run(
      slug,
      data.title || slug,
      data.description || '',
      html,
      firstImage ? firstImage[1] : null,
      categoryFor(tags),
      data.published === false ? 'draft' : 'published',
      published,
      published,
      published,
    ).lastInsertRowid)
    setPostTags(id, tags)
    indexPost({ id, title: data.title || slug, excerpt: data.description || '', content_html: html })
  }
  return files.length
}

function addSampleComments() {
  const latest = db.prepare("SELECT id FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 1").get()
  if (!latest) return
  const add = db.prepare('INSERT INTO comments (post_id, author, body, created_at) VALUES (?, ?, ?, ?)')
  add.run(latest.id, 'Viajera del Dragón', '¡Qué alegría ver Malkevnia de vuelta! Me apunto al RSS.', '2026-05-22 10:14:00')
  add.run(latest.id, 'Malkev', 'Gracias por pasarte. Esto es solo el principio.', '2026-05-22 11:02:00')
}

function importCollection() {
  const insert = db.prepare(`
    INSERT INTO items (kind, title, creator, year, color, rating, status, notes, shelf, position, featured, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const add = (kind, list) => list.forEach((it, i) => insert.run(
    kind, it.title, it.creator || '', it.year ?? null, it.color || null, it.rating ?? null,
    it.status || 'owned', it.notes || '', it.shelf ?? null, it.position ?? i, it.featured ? 1 : 0,
    JSON.stringify(it.meta || {}),
  ))
  add('boardgame', boardgames)
  add('film', films)
  add('series', series)
  add('book', books)
  add('manga', manga)
  return boardgames.length + films.length + series.length + books.length + manga.length
}

const result = transaction(() => {
  db.exec('DELETE FROM comments; DELETE FROM post_tags; DELETE FROM tags; DELETE FROM posts; DELETE FROM posts_fts; DELETE FROM items;')
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('posts', 'tags', 'comments', 'items')")
  const posts = importPosts()
  addSampleComments()
  const items = importCollection()
  return { posts, items }
})

console.log(`✦ Importadas ${result.posts} entradas del blog y ${result.items} objetos de ejemplo de la colección.`)
