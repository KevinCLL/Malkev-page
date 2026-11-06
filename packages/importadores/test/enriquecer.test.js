// TMDB y Open Library con fetch simulado: no hace falta red ni clave.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { crearTmdb } from '../lib/tmdb.js'
import { crearOpenLibrary, tituloLimpio } from '../lib/openlibrary.js'
import { crearFicha } from '../lib/modelo.js'
import { enriquecer } from '../lib/enriquecer.js'

let rutas
let pedidas
const realFetch = globalThis.fetch
beforeEach(() => {
  pedidas = []
  globalThis.fetch = async (url) => {
    const u = new URL(url)
    pedidas.push(u)
    const r = rutas.find(([re]) => re.test(u.pathname + u.search))
    if (!r) return new Response('{}', { status: 404 })
    return new Response(JSON.stringify(typeof r[1] === 'function' ? r[1](u) : r[1]), { status: 200 })
  }
})
afterEach(() => { globalThis.fetch = realFetch })

const memoria = () => {
  const m = new Map()
  return { get: (ns, k) => m.get(`${ns}|${k}`), set: (ns, k, v) => m.set(`${ns}|${k}`, v), m }
}

test('TMDB: título y año claros → auto, con director, sinopsis y póster', async () => {
  rutas = [
    [/^\/3\/search\/movie/, { results: [
      { id: 10168, title: 'Vértigo (De entre los muertos)', original_title: 'Vertigo', release_date: '1958-05-09', vote_count: 6000 },
      { id: 985939, title: 'Vértigo', original_title: 'Fall', release_date: '2022-08-11', vote_count: 3000 },
    ] }],
    [/^\/3\/movie\/985939/, { id: 985939, title: 'Vértigo', original_title: 'Fall', overview: 'Dos amigas suben a una torre.', poster_path: '/fall.jpg', runtime: 107,
      genres: [{ name: 'Suspense' }], imdb_id: 'tt15325794', credits: { crew: [{ job: 'Director', name: 'Scott Mann' }] } }],
  ]
  const cache = memoria()
  const tmdb = crearTmdb({ clave: 'abc123', cache })
  const f = await tmdb.enriquecer(crearFicha({ kind: 'film', title: 'Vértigo', year: 2022, external_ids: { filmaffinity: 968270 } }))
  assert.equal(f.match.estado, 'auto')
  assert.equal(f.external_ids.tmdb, 985939)
  assert.equal(f.external_ids.imdb, 'tt15325794')
  assert.equal(f.original_title, 'Fall')
  assert.equal(f.creator, 'Scott Mann')
  assert.equal(f.synopsis, 'Dos amigas suben a una torre.')
  assert.equal(f.cover_url, 'https://image.tmdb.org/t/p/w500/fall.jpg')
  assert.equal(f.details.runtime, 107)
  assert.equal(pedidas[0].searchParams.get('primary_release_year'), '2022')
  // La clave no se guarda en la caché.
  assert.ok([...cache.m.keys()].every((k) => !k.includes('abc123')))
})

test('TMDB: dudoso, se desempata por director', async () => {
  rutas = [
    [/^\/3\/search\/movie/, { results: [
      { id: 1, title: 'La cosa', original_title: 'The Thing', release_date: '2011-10-12' },
      { id: 2, title: 'La cosa', original_title: 'The Thing', release_date: '1982-06-25' },
    ] }],
    [/^\/3\/movie\/1\b/, { id: 1, title: 'La cosa', credits: { crew: [{ job: 'Director', name: 'Matthijs van Heijningen Jr.' }] } }],
    [/^\/3\/movie\/2\b/, { id: 2, title: 'La cosa', overview: 'Antártida.', credits: { crew: [{ job: 'Director', name: 'John Carpenter' }] } }],
  ]
  const tmdb = crearTmdb({ clave: 'k', cache: memoria() })
  const f = await tmdb.enriquecer(crearFicha({ kind: 'film', title: 'La cosa (El enigma de otro mundo)', creator: 'John Carpenter' }))
  assert.equal(f.match.estado, 'auto')
  assert.equal(f.external_ids.tmdb, 2)
})

test('TMDB: sin candidato claro → revisar con candidatos', async () => {
  rutas = [[/^\/3\/search\/tv/, { results: [{ id: 7, name: 'Heroicos', first_air_date: '2006-01-01' }] }]]
  const tmdb = crearTmdb({ clave: 'k', cache: memoria() })
  const f = await tmdb.enriquecer(crearFicha({ kind: 'series', title: 'Héroes', year: 2006 }))
  assert.equal(f.match.estado, 'revisar')
  assert.equal(f.match.candidatos[0].id, 7)
})

test('TMDB: solo candidatos que no se parecen en nada → sin resultado, sin lista que revisar', async () => {
  rutas = [[/^\/3\/search\/movie/, { results: [{ id: 919188, title: '少女灵异日记', release_date: '2013-01-01' }] }]]
  const tmdb = crearTmdb({ clave: 'k', cache: memoria() })
  const f = await tmdb.enriquecer(crearFicha({ kind: 'film', title: 'Black Mirror: Oso blanco', year: 2013 }))
  assert.equal(f.match.estado, 'sin-resultado')
  assert.deepEqual(f.match.candidatos, [])
})

test('sin clave de TMDB, las pelis quedan pendientes y los libros se buscan', async () => {
  const antes = process.env.TMDB_API_KEY
  delete process.env.TMDB_API_KEY
  rutas = [
    [/^\/search\.json\?isbn=/, { docs: [{ key: '/works/OL1W', title: 'La biblioteca de Babel', author_name: ['Jorge Luis Borges'], first_publish_year: 1941, cover_i: 99, subject: ['Ficción'] }] }],
    [/^\/works\/OL1W\.json/, { description: { value: 'Un universo hecho de libros.\n----------\nFuente' } }],
  ]
  const out = await enriquecer([
    crearFicha({ kind: 'film', title: 'Alien', year: 1979 }),
    crearFicha({ kind: 'book', title: 'La biblioteca de Babel', creator: 'Jorge Luis Borges', external_ids: { isbn: '9788420633114' } }),
  ], { cache: memoria() })
  if (antes) process.env.TMDB_API_KEY = antes
  assert.equal(out[0].match.estado, 'pendiente')
  assert.equal(out[0].match.motivo, 'falta TMDB_API_KEY')
  assert.equal(out[1].match.estado, 'auto')
  assert.equal(out[1].external_ids.openlibrary, '/works/OL1W')
  assert.equal(out[1].synopsis, 'Un universo hecho de libros.')
  assert.equal(out[1].cover_url, 'https://covers.openlibrary.org/b/id/99-L.jpg')
})

test('Open Library: títulos de Goodreads limpios', () => {
  assert.equal(tituloLimpio('The Well of Ascension (Mistborn, #2)'), 'The Well of Ascension')
  assert.equal(tituloLimpio('Invariantes (Spanish Edition)'), 'Invariantes')
  assert.equal(tituloLimpio('El nombre del viento'), 'El nombre del viento')
})

test('Open Library: --sin-red sin caché → pendiente', async () => {
  rutas = []
  const ol = crearOpenLibrary({ cache: memoria(), sinRed: true })
  const f = await ol.enriquecer(crearFicha({ kind: 'book', title: 'Dune' }))
  assert.equal(f.match.estado, 'pendiente')
  assert.equal(pedidas.length, 0)
})

test('correcciones: cambian la ficha, se marcan como corregidas y «ignorar» la quita', async () => {
  const { aplicarCorrecciones } = await import('../lib/enriquecer.js')
  const [a, ...resto] = aplicarCorrecciones([
    crearFicha({ kind: 'book', title: 'Invariantes (Spanish Edition)', external_ids: { goodreads: 248060046 } }),
    crearFicha({ kind: 'film', title: 'Basura', external_ids: { filmaffinity: 1 } }),
  ], { 'goodreads:248060046': { titulo: 'Invariantes', estado: 'leído' }, 'film/basura': { ignorar: true } })
  assert.equal(resto.length, 0)
  assert.equal(a.title, 'Invariantes')
  assert.equal(a.slug, 'invariantes-spanish-edition') // el slug no cambia: así casa con la ficha que ya existe
  assert.equal(a.status, 'done')
  assert.deepEqual(a.corregido.sort(), ['status', 'title'])
})
