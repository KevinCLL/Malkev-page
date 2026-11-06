// La colección exportada por la POC (poc/coleccion.json, con `npm run coleccion:export`).
// Ya trae lo importado de Filmaffinity, Goodreads y AniList; aquí solo se pasa al formato normalizado.
import { readFileSync } from 'node:fs'
import { crearFicha, KINDS } from '../lib/modelo.js'

const IDS = { filmaffinity_id: 'filmaffinity', goodreads_id: 'goodreads', anilist_id: 'anilist', isbn: 'isbn', tmdb: 'tmdb', openlibrary: 'openlibrary', anilist: 'anilist' }

export function leerColeccion(ruta) {
  const data = JSON.parse(readFileSync(ruta, 'utf8'))
  const items = Array.isArray(data) ? data : data.items || []
  return items.filter((it) => KINDS.includes(it.kind)).map(desdePoc)
}

export function desdePoc(it) {
  const meta = { ...(it.meta || {}) }
  const external_ids = {}
  for (const [k, v] of Object.entries(IDS)) if (meta[k] != null) { external_ids[v] = meta[k]; delete meta[k] }
  const source = meta.source || 'poc'
  delete meta.source
  delete meta.seen
  const details = {}
  for (const k of ['pages', 'volumes_owned', 'volumes_total', 'chapters', 'chapters_read', 'origin', 'format', 'title_native', 'shelves', 'anilist_list', 'type']) {
    if (meta[k] != null && !(Array.isArray(meta[k]) && !meta[k].length)) details[k] = meta[k]
    delete meta[k]
  }
  const finished_on = meta.date_read ? fecha(meta.date_read) : null
  delete meta.date_read
  // El autocompletado de la POC guardaba la sinopsis de TMDB en meta.overview.
  const synopsis = meta.overview || null
  delete meta.overview
  Object.assign(details, meta)
  return crearFicha({
    kind: it.kind,
    title: it.title,
    original_title: it.kind === 'manga' ? details.title_native || null : null,
    creator: it.creator,
    year: it.year,
    rating: it.rating,
    synopsis,
    status: it.status,
    notes: it.notes,
    cover_url: it.cover_url,
    color: it.color,
    details,
    external_ids,
    featured: it.featured,
    hidden: it.hidden,
    finished_on,
    sources: [source],
  })
}

// Goodreads escribe «2024/03/15»; se guarda como fecha ISO.
export function fecha(v) {
  const m = String(v || '').match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null
}
