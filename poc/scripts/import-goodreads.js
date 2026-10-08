// Importa la biblioteca de Goodreads desde su CSV ("My Books" → "Import and export" → "Export library").
// Uso: npm run import:goodreads -- ruta/al/goodreads_library_export.csv
import { readFileSync } from 'node:fs'
import { parseCsv, stripHtml, upsertAll, report } from './lib/import.js'

const file = process.argv[2]
if (!file) {
  console.error('Falta el CSV. Uso: npm run import:goodreads -- goodreads_library_export.csv')
  process.exit(1)
}

const STATUS = { read: 'done', 'currently-reading': 'reading', 'to-read': 'wishlist' }
const num = (v) => (v && !Number.isNaN(Number(v)) ? Number(v) : null)
// Goodreads escribe los ISBN como ="0441172717" para que las hojas de cálculo no los rompan.
const isbn = (v) => String(v || '').replace(/[="\s]/g, '') || null

const rows = parseCsv(readFileSync(file, 'utf8'))
const books = rows.map((r) => {
  const code = isbn(r.ISBN13) || isbn(r.ISBN)
  const rating = num(r['My Rating'])
  const shelves = r.Bookshelves.split(',').map((s) => s.trim()).filter(Boolean)
  return {
    title: r.Title,
    creator: r.Author,
    year: num(r['Original Publication Year']) || num(r['Year Published']),
    rating: rating ? rating * 2 : null,
    status: STATUS[r['Exclusive Shelf']] || 'owned',
    notes: stripHtml(r['My Review']),
    cover_url: code ? `https://covers.openlibrary.org/b/isbn/${code}-L.jpg?default=false` : null,
    meta: {
      pages: num(r['Number of Pages']),
      isbn: code,
      goodreads_id: num(r['Book Id']),
      date_read: r['Date Read'] || null,
      shelves,
      source: 'goodreads',
    },
  }
}).filter((b) => b.title)

report('Goodreads', upsertAll('book', books), books.slice(0, 5))
