// La colección real (pelis, series, libros, manga y videojuegos) viaja entre ordenadores en poc/coleccion.json:
// las importaciones (Goodreads, AniList, Filmaffinity, LaunchBox) se hacen donde haya red, se exportan a ese
// fichero, y cualquier otro sitio lo carga con `npm run coleccion:import` o al hacer `npm run seed`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '../../server/db.js'
import { upsertAll, VIDEOGAME_KEY } from './import.js'

const here = dirname(fileURLToPath(import.meta.url))
export const COLECCION = join(here, '..', '..', 'coleccion.json')
export const KINDS = ['film', 'series', 'book', 'manga', 'videogame']

export function readColeccion(file = COLECCION) {
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8'))
}

// Carga el fichero en la base de datos. Los objetos de ejemplo de cada tipo que venga en el fichero
// (los que no proceden de ninguna importación) desaparecen; lo que ya existía se actualiza sin duplicar.
export function importColeccion(file = COLECCION) {
  const data = readColeccion(file)
  if (!data) return null
  const result = {}
  const dropSamples = db.prepare("DELETE FROM items WHERE kind = ? AND json_extract(meta, '$.source') IS NULL")
  for (const kind of KINDS) {
    const list = data.items.filter((it) => it.kind === kind)
    if (!list.length) continue
    dropSamples.run(kind)
    result[kind] = upsertAll(kind, list, kind === 'videogame' ? { key: VIDEOGAME_KEY } : {})
  }
  return result
}

// Escribe en el fichero todo lo importado (lo que tiene meta.source), para llevarlo a otro sitio.
export function exportColeccion(file = COLECCION) {
  const rows = db.prepare(`
    SELECT kind, title, creator, year, cover_url, color, rating, status, notes, featured, hidden, meta FROM items
    WHERE kind IN ('film', 'series', 'book', 'manga', 'videogame') AND json_extract(meta, '$.source') IS NOT NULL
    ORDER BY kind, position, id
  `).all()
  const items = rows.map((r) => ({ ...r, featured: !!r.featured, hidden: !!r.hidden, meta: JSON.parse(r.meta || '{}') }))
  writeFileSync(file, JSON.stringify({ exported_at: new Date().toISOString(), items }, null, 1) + '\n')
  return items
}
