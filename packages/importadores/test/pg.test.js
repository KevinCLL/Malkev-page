// Prueba el SQL generado contra un PostgreSQL de verdad con el esquema del catálogo. Se salta si no se
// le dice dónde: PG_PRUEBAS=postgres://… (una base de datos vacía que se puede machacar) y
// ESQUEMA_SQL=ruta/a/packages/catalogo/db/migrations/001_esquema.sql. Necesita psql.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { generarSql } from '../lib/sql.js'
import { crearFicha, deduplicar } from '../lib/modelo.js'

const url = process.env.PG_PRUEBAS
const esquema = process.env.ESQUEMA_SQL
const psql = (args, input) => execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-qAt', ...args], { input, encoding: 'utf8' })

test('SQL contra PostgreSQL: inserta, no duplica, respeta lo editado y aguanta texto raro', { skip: !url || !esquema }, () => {
  psql(['-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'])
  psql(['-f', esquema])
  const fichas = deduplicar([
    crearFicha({ kind: 'film', title: "L'Odyssée \\ \"x\" \u0000 🚀", year: 2001, notes: 'a\nb', synopsis: 'x\u0000y', genres: ['a\u0000b'], external_ids: { filmaffinity: 1, tmdb: 62 }, cover_url: 'https://tmdb/p.jpg', details: { cover_url_original: 'https://fa/p.jpg' } }),
    crearFicha({ kind: 'book', title: 'Ciudad Permutación', rating: 8, external_ids: { goodreads: 1, openlibrary: '/works/OL1W' } }),
    crearFicha({ kind: 'book', title: 'Permutation City', external_ids: { goodreads: 2, openlibrary: '/works/OL1W' } }),
    crearFicha({ kind: 'series', title: 'Vértigo', year: 1990, status: 'reading', finished_on: '2024-02-30' }),
    // Corregida a mano: el título nuevo pisa el que hubiera.
    crearFicha({ kind: 'book', title: 'Invariantes', slug: 'invariantes-spanish-edition', external_ids: { goodreads: 9 }, corregido: ['title'] }),
    // Mismo slug que otra obra de otro año: no entra y se lista.
    crearFicha({ kind: 'film', title: 'Drácula', year: 1992, slug: 'dracula', external_ids: { filmaffinity: 7 } }),
  ])
  // Como si el seed del catálogo ya la hubiera cargado con el póster de Filmaffinity.
  psql(['-c', `INSERT INTO items (kind, slug, title, cover_url, external_ids) VALUES ('film', 'l-odyssee', 'Antes', 'https://fa/p.jpg', '{"filmaffinity": 1}'),
    ('book', 'invariantes-spanish-edition', 'Invariantes (Spanish Edition)', NULL, '{"goodreads": 9}'),
    ('film', 'dracula', 'Drácula', NULL, '{}')`])
  psql(['-c', "UPDATE items SET year = 1931 WHERE slug = 'dracula'"])
  const sql = generarSql(fichas)
  const salida = psql([], sql)
  assert.match(salida, /film\|dracula\|Drácula\|1992\|Drácula\|1931/, 'avisa del slug ocupado')
  psql(['-c', "UPDATE items SET rating = 3, notes = 'mía', cover_url = 'https://a-mano.jpg' WHERE slug = 'ciudad-permutacion'"])
  const huella = () => psql(['-c', "SELECT md5(string_agg(row(id, slug, title, synopsis, cover_url, rating, notes, status, external_ids, meta)::text, '|' ORDER BY id)) FROM items"])
  const antes = huella()
  psql([], sql)
  assert.equal(huella(), antes, 'repetir la importación no cambia nada')
  const filas = JSON.parse(psql(['-c', 'SELECT json_agg(i ORDER BY id) FROM items i']))
  assert.equal(filas.length, 6)
  const [odisea, invariantes, dracula, ciudad, permutation, vertigo] = filas
  assert.equal(invariantes.title, 'Invariantes')
  assert.equal(dracula.year, 1931)
  assert.equal(odisea.slug, 'l-odyssee') // emparejada por id de Filmaffinity, conserva su slug
  assert.equal(odisea.cover_url, 'https://tmdb/p.jpg') // el póster de la fuente se cambia por el de TMDB
  assert.equal(odisea.synopsis, 'xy')
  assert.equal(ciudad.rating, 3)
  assert.equal(ciudad.notes, 'mía')
  assert.equal(ciudad.cover_url, 'https://a-mano.jpg')
  assert.equal(permutation.external_ids.goodreads, 2) // dos ediciones, dos fichas
  assert.equal(vertigo.status, 'watching')
  assert.equal(vertigo.finished_on, null)
})
