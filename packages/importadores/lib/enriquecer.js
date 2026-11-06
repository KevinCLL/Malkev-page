// Pasa cada ficha por su fuente de datos: TMDB para pelis y series, Open Library para libros.
// El manga ya trae sus datos de AniList y no se toca.
import { crearTmdb } from './tmdb.js'
import { crearOpenLibrary } from './openlibrary.js'
import { crearFicha } from './modelo.js'

export async function enriquecer(fichas, { cache, sinRed = false, tmdb: usarTmdb = true, openlibrary: usarOl = true, limite = Infinity, correcciones = {}, log = () => {} } = {}) {
  const tmdb = usarTmdb ? crearTmdb({ cache, sinRed }) : null
  const ol = usarOl ? crearOpenLibrary({ cache, sinRed }) : null
  const out = []
  let hechas = 0
  const total = fichas.filter((f) => f.kind !== 'manga').length
  for (const f of fichas) {
    const fix = correccionDe(correcciones, f)
    if (f.kind === 'manga') {
      out.push(f.external_ids.anilist ? { ...f, match: { provider: 'anilist', estado: 'auto', id: f.external_ids.anilist, score: 1 } } : f)
      continue
    }
    const servicio = f.kind === 'book' ? ol : tmdb
    const provider = f.kind === 'book' ? 'openlibrary' : 'tmdb'
    if (!servicio) {
      const motivo = provider === 'tmdb' && usarTmdb ? 'falta TMDB_API_KEY' : 'enriquecimiento desactivado'
      out.push({ ...f, match: { provider, estado: 'pendiente', motivo } })
      continue
    }
    if (hechas >= limite) { out.push({ ...f, match: { provider, estado: 'pendiente', motivo: 'fuera del --limite' } }); continue }
    hechas++
    log(`  ${provider} ${hechas}/${Math.min(total, limite)}  ${f.title}`)
    try {
      out.push(crearFicha(await servicio.enriquecer(f, { forzarId: fix?.[provider] })))
    } catch (err) {
      if (err.status === 401) throw new Error(`${provider} rechaza la clave (401). Revisa TMDB_API_KEY.`)
      out.push({ ...f, match: { provider, estado: 'error', motivo: err.message } })
    }
  }
  return out
}

// correcciones.json: { "film/vertigo": { "tmdb": 10168 }, "filmaffinity:968270": { "año": 2022 }, "book/x": { "ignorar": true } }
export function correccionDe(correcciones, f) {
  const claves = [`${f.kind}/${f.slug}`, ...Object.entries(f.external_ids).map(([k, v]) => `${k}:${v}`)]
  for (const k of claves) if (correcciones[k]) return correcciones[k]
  return null
}

export function aplicarCorrecciones(fichas, correcciones) {
  const out = []
  for (const f of fichas) {
    const c = correccionDe(correcciones, f)
    if (!c) { out.push(f); continue }
    if (c.ignorar) continue
    out.push(crearFicha({
      ...f,
      title: c.titulo ?? c.title ?? f.title,
      original_title: c.titulo_original ?? f.original_title,
      creator: c.autor ?? c.director ?? f.creator,
      year: c['año'] ?? c.year ?? f.year,
      slug: c.slug ?? f.slug,
      kind: c.tipo ?? f.kind,
      status: c.estado ?? f.status,
      hidden: c.oculto ?? f.hidden,
      featured: c.destacado ?? f.featured,
      external_ids: { ...f.external_ids, ...(c.isbn ? { isbn: c.isbn } : {}), ...(c.imdb ? { imdb: c.imdb } : {}) },
    }))
  }
  return out
}
