// El CSV de Goodreads: My Books → Import and export → Export library.
import { readFileSync } from 'node:fs'
import { crearFicha } from '../lib/modelo.js'
import { parseCsv, stripHtml, num } from '../lib/texto.js'
import { fecha } from './coleccion.js'

const STATUS = { read: 'done', 'currently-reading': 'reading', 'to-read': 'wishlist' }
// Goodreads escribe los ISBN como ="0441172717" para que las hojas de cálculo no los rompan.
const isbn = (v) => String(v || '').replace(/[="\s-]/g, '') || null

export function leerGoodreads(ruta) {
  return parseCsv(readFileSync(ruta, 'utf8'))
    .filter((r) => r.Title)
    .map((r) => {
      const rating = num(r['My Rating'])
      return crearFicha({
        kind: 'book',
        title: r.Title,
        creator: [r.Author, ...String(r['Additional Authors'] || '').split(',')].map((s) => s?.trim()).filter(Boolean).slice(0, 2).join(', '),
        year: num(r['Original Publication Year']) || num(r['Year Published']),
        rating: rating ? rating * 2 : null,
        status: STATUS[r['Exclusive Shelf']] || 'owned',
        notes: stripHtml(r['My Review']),
        details: {
          pages: num(r['Number of Pages']),
          publisher: r.Publisher || null,
          binding: r.Binding || null,
          shelves: String(r.Bookshelves || '').split(',').map((s) => s.trim()).filter(Boolean),
          owned_copies: num(r['Owned Copies']),
        },
        external_ids: { isbn: isbn(r.ISBN13) || isbn(r.ISBN), goodreads: num(r['Book Id']) },
        finished_on: fecha(r['Date Read']),
        sources: ['goodreads'],
      })
    })
}
