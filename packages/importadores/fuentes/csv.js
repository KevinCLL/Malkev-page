// Un CSV hecho a mano o desde una hoja de cálculo, para lo que no está en ninguna web (la estantería
// física, los DVD, los libros que no pasaron por Goodreads). Separado por comas o punto y coma.
// Columnas (en español o inglés, solo `titulo` es obligatoria):
//   tipo (peli|serie|libro|manga), titulo, titulo_original, autor|director, año, nota (0-10),
//   estado (visto|leido|leyendo|pendiente|tengo), notas, isbn, tmdb, imdb, openlibrary, fecha, formato, estanteria
import { readFileSync } from 'node:fs'
import { crearFicha } from '../lib/modelo.js'
import { parseCsv, norm, num } from '../lib/texto.js'
import { fecha } from './coleccion.js'

const TIPOS = { peli: 'film', pelicula: 'film', film: 'film', movie: 'film', serie: 'series', series: 'series', tv: 'series', libro: 'book', book: 'book', manga: 'manga', manhwa: 'manga', comic: 'book' }
const ESTADOS = { abandonado: 'dropped', dropped: 'dropped', pausado: 'paused', paused: 'paused', visto: 'done', vista: 'done', leido: 'done', leida: 'done', done: 'done', read: 'done', leyendo: 'reading', viendo: 'reading', reading: 'reading', pendiente: 'wishlist', wishlist: 'wishlist', 'to read': 'wishlist', tengo: 'owned', owned: 'owned' }
const ALIAS = {
  tipo: ['tipo', 'type', 'kind'], titulo: ['titulo', 'title', 'nombre'], titulo_original: ['titulo original', 'original title'],
  autor: ['autor', 'autora', 'author', 'director', 'directora', 'creador', 'creator'], año: ['ano', 'anio', 'year'],
  nota: ['nota', 'rating', 'puntuacion'], estado: ['estado', 'status'], notas: ['notas', 'notes', 'comentario'],
  isbn: ['isbn', 'isbn13'], tmdb: ['tmdb', 'tmdb id'], imdb: ['imdb', 'imdb id'], openlibrary: ['openlibrary', 'open library'],
  fecha: ['fecha', 'date', 'visto el', 'leido el'], formato: ['formato', 'format', 'soporte'], estanteria: ['estanteria', 'shelf', 'balda'],
}

export function leerCsv(ruta, { tipo } = {}) {
  return parseCsv(readFileSync(ruta, 'utf8')).map((fila, i) => {
    const col = {}
    for (const [k, v] of Object.entries(fila)) {
      const nk = norm(k)
      const campo = Object.entries(ALIAS).find(([, al]) => al.includes(nk))?.[0]
      if (campo && v !== '') col[campo] = v
    }
    const kind = TIPOS[norm(col.tipo)] || tipo
    if (!kind) throw new Error(`${ruta}, fila ${i + 2}: falta el tipo (columna tipo o --tipo)`)
    return crearFicha({
      kind,
      title: col.titulo,
      original_title: col.titulo_original,
      creator: col.autor,
      year: num(col.año),
      rating: num(String(col.nota ?? '').replace(',', '.')),
      status: ESTADOS[norm(col.estado)] || 'owned',
      notes: col.notas,
      details: { ...(col.formato ? { format: col.formato } : {}), ...(col.estanteria ? { shelf_label: col.estanteria } : {}) },
      external_ids: { isbn: col.isbn?.replace(/[^0-9Xx]/g, ''), tmdb: num(col.tmdb), imdb: col.imdb, openlibrary: col.openlibrary },
      finished_on: fecha(col.fecha),
      sources: ['csv'],
    })
  })
}
