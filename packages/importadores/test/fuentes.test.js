import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { leerGoodreads } from '../fuentes/goodreads.js'
import { leerCsv } from '../fuentes/csv.js'
import { parsePagina } from '../fuentes/filmaffinity.js'
import { desdePoc } from '../fuentes/coleccion.js'

const fx = (f) => fileURLToPath(new URL(`./fixtures/${f}`, import.meta.url))

test('Goodreads: ISBN, nota sobre 10, estado, fecha y reseña', () => {
  const [babel, well] = leerGoodreads(fx('goodreads.csv'))
  assert.equal(babel.title, 'La biblioteca de Babel')
  assert.equal(babel.external_ids.isbn, '9788420633114')
  assert.equal(babel.external_ids.goodreads, 22033504)
  assert.equal(babel.rating, 10)
  assert.equal(babel.year, 1941)
  assert.equal(babel.status, 'done')
  assert.equal(babel.finished_on, '2024-03-15')
  assert.equal(babel.notes, 'Laberinto\ninfinito')
  assert.equal(well.rating, null)
  assert.equal(well.status, 'wishlist')
  assert.equal(well.slug, 'the-well-of-ascension-mistborn-2')
})

test('CSV propio con punto y coma, tipos y estados en español', () => {
  const [alien, bebop, dune] = leerCsv(fx('propio.csv'))
  assert.equal(alien.kind, 'film')
  assert.equal(alien.creator, 'Ridley Scott')
  assert.equal(alien.details.format, 'Blu-ray')
  assert.equal(alien.notes, 'La de la caja metálica')
  assert.equal(bebop.kind, 'series')
  assert.equal(bebop.status, 'watching')
  assert.equal(dune.kind, 'book')
  assert.equal(dune.rating, 9) // 8,5 redondeado
  assert.equal(dune.status, 'done')
})

test('Filmaffinity: pelis y series, creador y nota', () => {
  const [vertigo, prison] = parsePagina(readFileSync(fx('filmaffinity.html'), 'utf8'))
  assert.equal(vertigo.kind, 'film')
  assert.equal(vertigo.title, 'Vértigo')
  assert.equal(vertigo.slug, 'vertigo')
  assert.equal(vertigo.year, 2022)
  assert.equal(vertigo.rating, 5)
  assert.equal(vertigo.cover_url, 'https://pics.filmaffinity.com/fall-443075622-large.jpg')
  assert.equal(prison.kind, 'series')
  assert.equal(prison.title, 'Prison Break')
  assert.equal(prison.creator, 'Paul Scheuring')
  assert.equal(prison.external_ids.filmaffinity, 822756)
})

test('coleccion.json de la POC: ids externos fuera de meta', () => {
  const f = desdePoc({ kind: 'manga', title: 'Re:Monster', creator: 'Kogitsune Kanekiru', year: 2014, rating: null, status: 'reading', color: '#E4A15D',
    meta: { anilist_id: 85, chapters_read: 76, title_native: 'Re:Monster', source: 'anilist', origin: 'manga', volumes_owned: null } })
  assert.deepEqual(f.external_ids, { anilist: 85 })
  assert.equal(f.details.chapters_read, 76)
  assert.equal(f.details.volumes_owned, undefined)
  assert.equal(f.color, '#e4a15d')
  assert.equal(f.slug, 're-monster')
  assert.deepEqual(f.sources, ['anilist'])
})
