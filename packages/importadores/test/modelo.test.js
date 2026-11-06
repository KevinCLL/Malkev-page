import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearFicha, deduplicar } from '../lib/modelo.js'
import { slugify, similar, parseCsv, variantes } from '../lib/texto.js'

test('slug igual que el del catálogo', () => {
  assert.equal(slugify('¡El Señor de los Anillos: La Comunidad!'), 'el-senor-de-los-anillos-la-comunidad')
  assert.equal(slugify('Amélie & Nino'), 'amelie-nino')
  assert.equal(slugify('x'.repeat(100)).length, 80)
  assert.match(slugify('a  — b' + '-'.repeat(90)), /^[a-z0-9]+(-[a-z0-9]+)*$/)
})

test('parecido de títulos', () => {
  assert.equal(similar('Vértigo', 'vertigo'), 1)
  assert.ok(similar('Alien', 'Alien, el octavo pasajero') >= 0.9)
  assert.ok(similar('Matrix', 'Amélie') < 0.3)
})

test('CSV con comillas y saltos de línea', () => {
  const rows = parseCsv('a,b\n"x, y","línea 1\nlínea 2"\n')
  assert.deepEqual(rows, [{ a: 'x, y', b: 'línea 1\nlínea 2' }])
})

test('deduplicar fusiona por id externo y rellena huecos', () => {
  const a = crearFicha({ kind: 'film', title: 'Vértigo', year: 2022, rating: 5, external_ids: { filmaffinity: 1 }, sources: ['filmaffinity'] })
  const b = crearFicha({ kind: 'film', title: 'Fall', year: 2022, creator: 'Scott Mann', external_ids: { filmaffinity: 1, tmdb: 985939 }, sources: ['csv'] })
  const [f, ...resto] = deduplicar([a, b])
  assert.equal(resto.length, 0)
  assert.equal(f.title, 'Vértigo')
  assert.equal(f.creator, 'Scott Mann')
  assert.deepEqual(f.external_ids, { filmaffinity: 1, tmdb: 985939 })
  assert.deepEqual(f.sources, ['filmaffinity', 'csv'])
})

test('mismo título y años distintos: dos fichas, la segunda con el año en el slug', () => {
  const l = deduplicar([
    crearFicha({ kind: 'film', title: 'Vértigo', year: 1958 }),
    crearFicha({ kind: 'film', title: 'Vértigo', year: 2022 }),
    crearFicha({ kind: 'book', title: 'Vértigo', year: 2022 }),
  ])
  assert.deepEqual(l.map((f) => `${f.kind}/${f.slug}`), ['film/vertigo', 'film/vertigo-2022', 'book/vertigo'])
})

test('estados y valores fuera de rango', () => {
  const f = crearFicha({ kind: 'series', title: 'X', status: 'reading', rating: 14, year: 99, color: 'rojo' })
  assert.equal(f.status, 'watching')
  assert.equal(f.rating, null)
  assert.equal(f.year, null)
  assert.equal(f.color, null)
})

test('dos ediciones de Goodreads de la misma obra no se juntan', () => {
  const l = deduplicar([
    crearFicha({ kind: 'book', title: 'Ciudad Permutación', external_ids: { goodreads: 1, openlibrary: '/works/OL1W' } }),
    crearFicha({ kind: 'book', title: 'Permutation City', external_ids: { goodreads: 2, openlibrary: '/works/OL1W' } }),
  ])
  assert.equal(l.length, 2)
})

test('«contiene» solo en palabras completas', () => {
  assert.ok(similar('Lava', 'Laval Virtual') < 0.6)
  assert.ok(similar('American Outlaws', 'American Outlaws (Forajidos)') >= 0.9)
  assert.equal(similar('M', 'X'), 0) // sin dividir por cero
})

test('variantes de un título para buscar', () => {
  assert.deepEqual(variantes('Híncame el diente (Vampires Suck)'), ['Híncame el diente (Vampires Suck)', 'Hincame el diente (Vampires Suck)', 'Híncame el diente', 'Vampires Suck'])
  assert.deepEqual(variantes('Alien'), ['Alien'])
})

test('fechas imposibles, slugs inválidos y títulos larguísimos', () => {
  const f = crearFicha({ kind: 'book', title: 'x'.repeat(600), slug: 'Mal Slug!', finished_on: '2024-02-31', started_on: '2024-02-29' })
  assert.equal(f.title.length, 500)
  assert.equal(f.slug, 'mal-slug')
  assert.equal(f.finished_on, null)
  assert.equal(f.started_on, '2024-02-29')
})

test('sin año, el autor distingue obras con el mismo título', () => {
  const l = deduplicar([
    crearFicha({ kind: 'book', title: 'Poemas', creator: 'Ana' }),
    crearFicha({ kind: 'book', title: 'Poemas', creator: 'Luis' }),
    crearFicha({ kind: 'book', title: 'Poemas', creator: 'Ana' }),
  ])
  assert.deepEqual(l.map((f) => f.slug), ['poemas', 'poemas-2'])
})

test('choques de slug como el seed del catálogo: título, título-año, título-2', () => {
  const l = deduplicar([
    crearFicha({ kind: 'film', title: 'Drácula', year: 1931, external_ids: { filmaffinity: 1 } }),
    crearFicha({ kind: 'film', title: 'Drácula', year: 1992, external_ids: { filmaffinity: 2 } }),
    crearFicha({ kind: 'film', title: 'Drácula', year: 1992, external_ids: { filmaffinity: 3 } }),
  ])
  assert.deepEqual(l.map((f) => f.slug), ['dracula', 'dracula-1992', 'dracula-2'])
})
