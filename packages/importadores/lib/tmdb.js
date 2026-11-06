// Enriquecimiento de pelis y series con TMDB (https://developer.themoviedb.org/).
// Busca por título y año, puntúa los candidatos y, si está claro, completa sinopsis, póster, géneros,
// duración, director o creadores, título original e IDs (TMDB e IMDb). Si no está claro, lo deja para revisar.
import { getJson, limitador } from './cache.js'
import { similar } from './texto.js'

const API = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p/w500'

export function crearTmdb({ clave = process.env.TMDB_API_KEY, idioma = process.env.TMDB_IDIOMA || 'es-ES', cache, sinRed = false } = {}) {
  if (!clave && !sinRed) return null
  const bearer = clave?.startsWith('eyJ')
  const turno = limitador(60) // TMDB admite ~50 peticiones/s; vamos muy por debajo.
  const get = (ruta, params = {}) => {
    const qs = new URLSearchParams({ ...params, language: idioma })
    const sinClave = `${API}${ruta}?${qs}`
    if (clave && !bearer) qs.set('api_key', clave)
    return getJson({
      cache, ns: 'tmdb', url: `${API}${ruta}?${qs}`, claveCache: sinClave, turno, sinRed,
      headers: bearer ? { Authorization: `Bearer ${clave}`, Accept: 'application/json' } : { Accept: 'application/json' },
    })
  }

  async function buscar(f) {
    const tipo = f.kind === 'series' ? 'tv' : 'movie'
    const campoAño = tipo === 'tv' ? 'first_air_date_year' : 'primary_release_year'
    const consultas = []
    for (const titulo of [f.title, f.original_title].filter(Boolean)) {
      if (f.year) consultas.push({ query: titulo, [campoAño]: f.year })
      consultas.push({ query: titulo })
    }
    const vistos = new Map()
    let respuestas = 0
    for (const q of consultas) {
      const data = await get(`/search/${tipo}`, { ...q, include_adult: 'false' })
      if (data !== undefined) respuestas++
      for (const r of data?.results || []) if (!vistos.has(r.id)) vistos.set(r.id, r)
      const mejor = puntuar(f, [...vistos.values()])[0]
      if (mejor && mejor.score >= 0.9) break
    }
    if (!respuestas) return undefined
    return puntuar(f, [...vistos.values()])
  }

  async function detalle(kind, id) {
    return kind === 'series'
      ? get(`/tv/${id}`, { append_to_response: 'external_ids' })
      : get(`/movie/${id}`, { append_to_response: 'credits,external_ids' })
  }

  // Devuelve la ficha completada y el estado del emparejamiento.
  async function enriquecer(f, { forzarId } = {}) {
    if (forzarId) {
      const d = await detalle(f.kind, forzarId)
      if (!d) return { ...f, match: { provider: 'tmdb', estado: 'sin-resultado', id: forzarId, manual: true } }
      return aplicar(f, d, { provider: 'tmdb', estado: 'manual', id: forzarId, score: 1 })
    }
    if (f.external_ids.tmdb) {
      const d = await detalle(f.kind, f.external_ids.tmdb)
      if (d) return aplicar(f, d, { provider: 'tmdb', estado: 'auto', id: d.id, score: 1 })
    }
    const candidatos = await buscar(f)
    if (candidatos === undefined) return { ...f, match: { provider: 'tmdb', estado: 'pendiente', motivo: 'sin caché y sin red' } }
    const resumen = candidatos.slice(0, 3).map((c) => ({ id: c.r.id, titulo: c.r.title || c.r.name, año: año(c.r), score: round(c.score) }))
    if (!candidatos.length) return { ...f, match: { provider: 'tmdb', estado: 'sin-resultado', candidatos: [] } }
    let [mejor, segundo] = candidatos
    let d = null
    // Claro: título casi igual, año que cuadra y sin un segundo candidato igual de bueno.
    let seguro = mejor.score >= 0.85 && (!segundo || mejor.score - segundo.score >= 0.08)
    // Dudoso: se mira el director o creador para desempatar.
    if (!seguro && mejor.score >= 0.55 && f.creator) {
      for (const c of candidatos.slice(0, 3)) {
        const det = await detalle(f.kind, c.r.id)
        if (det && coincideCreador(f.creator, creadores(f.kind, det))) { mejor = c; d = det; seguro = true; break }
      }
    }
    if (!seguro) return { ...f, match: { provider: 'tmdb', estado: 'revisar', candidatos: resumen } }
    d = d || (await detalle(f.kind, mejor.r.id))
    if (!d) return { ...f, match: { provider: 'tmdb', estado: 'revisar', candidatos: resumen } }
    return aplicar(f, d, { provider: 'tmdb', estado: 'auto', id: d.id, score: round(mejor.score), candidatos: resumen })
  }

  return { enriquecer }
}

const año = (r) => Number(String(r.release_date || r.first_air_date || '').slice(0, 4)) || null
const round = (n) => Math.round(n * 100) / 100

export function puntuar(f, resultados) {
  return resultados
    .map((r) => {
      let score = Math.max(similar(f.title, r.title || r.name), similar(f.title, r.original_title || r.original_name),
        f.original_title ? similar(f.original_title, r.original_title || r.original_name) : 0)
      const a = año(r)
      if (f.year && a) {
        const dif = Math.abs(f.year - a)
        score -= dif === 0 ? 0 : dif === 1 ? 0.05 : dif <= 3 ? 0.2 : 0.4
      } else if (f.year && !a) score -= 0.1
      // Ante empate, la más conocida suele ser la buena.
      score += Math.min(0.03, (r.vote_count || 0) / 100000)
      return { r, score }
    })
    .sort((a, b) => b.score - a.score)
}

function creadores(kind, d) {
  if (kind === 'series') return (d.created_by || []).map((c) => c.name)
  return (d.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.name)
}

export function coincideCreador(texto, nombres) {
  const suyos = String(texto).split(/,|\by\b|&/).map((s) => s.trim()).filter(Boolean)
  return suyos.some((a) => nombres.some((b) => similar(a, b) >= 0.8))
}

function aplicar(f, d, match) {
  const nombres = creadores(f.kind, d)
  const series = f.kind === 'series'
  return {
    ...f,
    original_title: f.original_title || d.original_title || d.original_name || null,
    creator: f.creator || nombres.slice(0, 2).join(', '),
    year: f.year || año(d),
    synopsis: f.synopsis || d.overview || null,
    cover_url: d.poster_path ? `${IMG}${d.poster_path}` : f.cover_url,
    genres: [...new Set([...f.genres, ...(d.genres || []).map((g) => g.name)])],
    details: {
      ...f.details,
      ...(series
        ? { seasons: d.number_of_seasons ?? null, episodes: d.number_of_episodes ?? null, ended: d.status ? d.status === 'Ended' || d.status === 'Canceled' : null }
        : { runtime: d.runtime || null }),
      backdrop_url: d.backdrop_path ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}` : null,
      original_language: d.original_language || null,
      ...(f.cover_url && d.poster_path ? { cover_url_original: f.cover_url } : {}),
    },
    external_ids: { ...f.external_ids, tmdb: d.id, imdb: d.imdb_id || d.external_ids?.imdb_id || f.external_ids.imdb },
    sources: [...new Set([...f.sources, 'tmdb'])],
    match,
  }
}
