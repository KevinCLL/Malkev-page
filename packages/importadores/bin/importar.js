#!/usr/bin/env node
// Importa la filmoteca y la biblioteca a JSON normalizado y SQL para el catálogo.
// Uso: node bin/importar.js [fuentes…] [opciones]   (ver README.md o --ayuda)
import { parseArgs } from 'node:util'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { leerColeccion } from '../fuentes/coleccion.js'
import { leerGoodreads } from '../fuentes/goodreads.js'
import { leerFilmaffinity } from '../fuentes/filmaffinity.js'
import { leerAnilist } from '../fuentes/anilist.js'
import { leerCsv } from '../fuentes/csv.js'
import { deduplicar, KINDS } from '../lib/modelo.js'
import { enriquecer, aplicarCorrecciones } from '../lib/enriquecer.js'
import { crearCache } from '../lib/cache.js'
import { generarSql } from '../lib/sql.js'
import { informe } from '../lib/informe.js'

const AYUDA = `Importadores de Malkevnia: filmoteca y biblioteca → JSON + SQL

Fuentes (se pueden repetir y combinar):
  --coleccion <fichero>     coleccion.json exportado por la POC (pelis, series, libros y manga)
  --filmaffinity <id|dir>   valoraciones de Filmaffinity: id de usuario o carpeta de páginas .html
  --goodreads <csv>         goodreads_library_export.csv
  --anilist <usuario>       lista de manga de AniList
  --csv <fichero>           CSV propio (columnas: tipo, titulo, autor, año, nota, estado, isbn…)
  --tipo <peli|serie|libro|manga>   tipo por defecto de las filas del --csv sin columna tipo

Opciones:
  --solo <film,series,book,manga>   quedarse con esos tipos
  --correcciones <fichero>  correcciones.json (por defecto, el de la carpeta actual si existe)
  --sin-tmdb, --sin-openlibrary, --sin-enriquecer
  --sin-red                 usar solo la caché, sin llamar a las APIs
  --limite <n>              enriquecer como mucho n fichas (para probar)
  --sobrescribir            en el SQL, la nota, el estado y la portada importados pisan los de la BDD
  --salida <dir>            carpeta de salida (salida/ por defecto)
  --ayuda
`

const { values: o } = parseArgs({
  options: {
    coleccion: { type: 'string', multiple: true, default: [] },
    filmaffinity: { type: 'string', multiple: true, default: [] },
    goodreads: { type: 'string', multiple: true, default: [] },
    anilist: { type: 'string', multiple: true, default: [] },
    csv: { type: 'string', multiple: true, default: [] },
    tipo: { type: 'string' },
    solo: { type: 'string' },
    correcciones: { type: 'string' },
    'sin-tmdb': { type: 'boolean', default: false },
    'sin-openlibrary': { type: 'boolean', default: false },
    'sin-enriquecer': { type: 'boolean', default: false },
    'sin-red': { type: 'boolean', default: false },
    limite: { type: 'string' },
    sobrescribir: { type: 'boolean', default: false },
    salida: { type: 'string', default: 'salida' },
    ayuda: { type: 'boolean', short: 'h', default: false },
  },
})

const TIPO = { peli: 'film', pelicula: 'film', serie: 'series', libro: 'book', manga: 'manga' }
const log = (m) => process.stderr.write(`${m}\n`)
const fuentes = o.coleccion.length + o.filmaffinity.length + o.goodreads.length + o.anilist.length + o.csv.length
if (o.ayuda || !fuentes) {
  console.log(AYUDA)
  process.exit(o.ayuda ? 0 : 1)
}

let fichas = []
for (const f of o.coleccion) { const l = leerColeccion(f); log(`✦ ${f}: ${l.length} fichas`); fichas.push(...l) }
for (const f of o.filmaffinity) { const l = await leerFilmaffinity(f, { log }); log(`✦ Filmaffinity ${f}: ${l.length} fichas`); fichas.push(...l) }
for (const f of o.goodreads) { const l = leerGoodreads(f); log(`✦ Goodreads ${f}: ${l.length} libros`); fichas.push(...l) }
for (const u of o.anilist) { const l = await leerAnilist(u); log(`✦ AniList ${u}: ${l.length} mangas`); fichas.push(...l) }
for (const f of o.csv) { const l = leerCsv(f, { tipo: TIPO[o.tipo] || o.tipo }); log(`✦ CSV ${f}: ${l.length} fichas`); fichas.push(...l) }

if (o.solo) {
  const solo = o.solo.split(',').map((s) => TIPO[s.trim()] || s.trim())
  for (const s of solo) if (!KINDS.includes(s)) throw new Error(`--solo: tipo desconocido ${s}`)
  fichas = fichas.filter((f) => solo.includes(f.kind))
}

const rutaCorr = o.correcciones || (existsSync('correcciones.json') ? 'correcciones.json' : null)
const correcciones = rutaCorr ? JSON.parse(readFileSync(rutaCorr, 'utf8')) : {}
if (rutaCorr) log(`✦ Correcciones: ${Object.keys(correcciones).length} (${rutaCorr})`)

fichas = deduplicar(aplicarCorrecciones(fichas, correcciones))
log(`✦ ${fichas.length} fichas tras quitar duplicados`)

if (!o['sin-enriquecer']) {
  if (!o['sin-tmdb'] && !process.env.TMDB_API_KEY && !o['sin-red']) log('  Sin TMDB_API_KEY: las pelis y series salen sin enriquecer (marcadas como pendientes).')
  fichas = await enriquecer(fichas, {
    cache: crearCache(),
    sinRed: o['sin-red'],
    tmdb: !o['sin-tmdb'],
    openlibrary: !o['sin-openlibrary'],
    limite: o.limite ? Number(o.limite) : Infinity,
    correcciones,
    log: process.stderr.isTTY ? (m) => process.stderr.write(`\r\x1b[2K${m.slice(0, 100)}`) : () => {},
  })
  if (process.stderr.isTTY) process.stderr.write('\r\x1b[2K')
  // Tras enriquecer pueden aparecer duplicados nuevos (dos títulos distintos que son la misma obra en TMDB).
  fichas = deduplicar(fichas)
}

const dir = resolve(o.salida)
mkdirSync(dir, { recursive: true })
const revisar = fichas.filter((f) => ['revisar', 'sin-resultado', 'error'].includes(f.match?.estado))
writeFileSync(join(dir, 'fichas.json'), JSON.stringify({ generado: new Date().toISOString(), total: fichas.length, fichas }, null, 2))
writeFileSync(join(dir, 'revisar.json'), JSON.stringify(revisar.map((f) => ({
  clave: `${f.kind}/${f.slug}`, titulo: f.title, año: f.year, autor: f.creator, estado: f.match.estado, candidatos: f.match.candidatos || [], motivo: f.match.motivo,
})), null, 2))
writeFileSync(join(dir, 'catalogo.sql'), generarSql(fichas, { sobrescribir: o.sobrescribir, titulo: 'filmoteca y biblioteca' }))
const md = informe(fichas)
writeFileSync(join(dir, 'informe.md'), md)
console.log(md)
console.log(`Salida en ${dir}: fichas.json, catalogo.sql, revisar.json, informe.md`)
