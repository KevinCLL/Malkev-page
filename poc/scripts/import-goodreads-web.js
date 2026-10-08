// Importa la biblioteca de Goodreads sin el CSV, desde el RSS público de las estanterías
// (las páginas HTML de estanterías piden iniciar sesión; el RSS no).
// Dos formas:
//   npm run import:goodreads-web -- 36779615          descarga el RSS del usuario
//   npm run import:goodreads-web -- carpeta/           lee ficheros .xml de RSS guardados en esa carpeta
// Mismos campos que import-goodreads.js (el CSV sigue siendo la fuente más completa).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { stripHtml, decode, upsertAll, report } from './lib/import.js'

const arg = process.argv[2]
if (!arg) {
  console.error('Falta el usuario o la carpeta. Uso: npm run import:goodreads-web -- 36779615  |  -- carpeta-con-rss/')
  process.exit(1)
}

const STATUS = { read: 'done', 'currently-reading': 'reading', 'to-read': 'wishlist' }
const num = (v) => (v && !Number.isNaN(Number(v)) ? Number(v) : null)
const cdata = (s) => String(s ?? '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim()
const tag = (item, name) => cdata(item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1])

function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const shelves = tag(item, 'user_shelves').split(',').map((s) => s.trim()).filter(Boolean)
    // La estantería exclusiva (read, currently-reading, to-read) solo aparece si no es "read".
    const exclusive = shelves.find((s) => STATUS[s]) || 'read'
    const rating = num(tag(item, 'user_rating'))
    const isbn = tag(item, 'isbn') || null
    const image = tag(item, 'book_large_image_url')
    const cover = image && !/nophoto/.test(image) ? image
      : isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false` : null
    return {
      title: decode(tag(item, 'title')),
      creator: decode(tag(item, 'author_name')),
      year: num(tag(item, 'book_published')),
      rating: rating ? rating * 2 : null,
      status: STATUS[exclusive],
      notes: stripHtml(tag(item, 'user_review')),
      cover_url: cover,
      meta: {
        pages: num(item.match(/<num_pages>(\d+)<\/num_pages>/)?.[1]),
        isbn,
        goodreads_id: num(tag(item, 'book_id')),
        date_read: tag(item, 'user_read_at') || null,
        shelves: shelves.length ? shelves : [exclusive],
        source: 'goodreads',
      },
    }
  }).filter((b) => b.title)
}

const books = new Map()
const add = (list) => {
  let fresh = 0
  for (const b of list) if (!books.has(b.meta.goodreads_id)) { books.set(b.meta.goodreads_id, b); fresh++ }
  return fresh
}
if (/^\d+$/.test(arg)) {
  for (let p = 1; p <= 100; p++) {
    const url = `https://www.goodreads.com/review/list_rss/${arg}?shelf=%23ALL%23&per_page=100&page=${p}`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' } })
    if (!res.ok) {
      console.error(`Goodreads ha respondido ${res.status} en la página ${p}. Guarda el RSS en una carpeta y pásamela.`)
      break
    }
    if (!add(parseRss(await res.text()))) break
    await new Promise((r) => setTimeout(r, 1500))
  }
} else {
  const files = statSync(arg).isDirectory() ? readdirSync(arg).filter((f) => /\.(xml|rss)$/i.test(f)).map((f) => join(arg, f)) : [arg]
  for (const f of files) add(parseRss(readFileSync(f, 'utf8')))
}

const list = [...books.values()]
if (!list.length) {
  console.error('No he encontrado ningún libro.')
  process.exit(1)
}
report(`Goodreads RSS (${list.length} libros)`, upsertAll('book', list), list.slice(0, 5))
