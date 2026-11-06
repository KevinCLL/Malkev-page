// Enriquecimiento de libros con Open Library (https://openlibrary.org/developers/api). No necesita clave.
// Busca por ISBN si lo hay y, si no, por título y autor; completa portada, sinopsis, temas, páginas,
// año de primera publicación e id de la obra en Open Library (el ISBN solo si venía de la fuente: el de Open Library puede ser de otra edición).
import { getJson, limitador } from './cache.js'
import { similar } from './texto.js'

const API = 'https://openlibrary.org'
const CAMPOS = 'key,title,subtitle,author_name,first_publish_year,cover_i,number_of_pages_median,isbn,subject,language'
// Open Library pide identificarse y no pasar de ~1 petición por segundo sin registrar la aplicación.
const HEADERS = { 'User-Agent': 'MalkevniaImportadores/0.1 (+https://malkevnia.com)', Accept: 'application/json' }

// «Mistborn (Mistborn, #1)» → «Mistborn»; «Invariantes (Spanish Edition)» → «Invariantes».
export const tituloLimpio = (t) => String(t).replace(/\s*\((?:[^()]*#\s*\d+[^()]*|[^()]*edition|[^()]*edición)\)\s*$/i, '').replace(/\s*\([^()]*#\s*[\d.]+\)\s*/g, ' ').trim()

export function crearOpenLibrary({ cache, sinRed = false, ritmoMs = 1000 } = {}) {
  const turno = limitador(ritmoMs)
  const get = (ruta) => getJson({ cache, ns: 'openlibrary', url: `${API}${ruta}`, headers: HEADERS, turno, sinRed })

  async function buscar(f) {
    const titulo = tituloLimpio(f.title)
    const autor = (f.creator || '').split(',')[0].trim()
    const consultas = []
    if (f.external_ids.isbn) consultas.push(`isbn=${encodeURIComponent(f.external_ids.isbn)}`)
    if (autor) consultas.push(`title=${encodeURIComponent(titulo)}&author=${encodeURIComponent(autor)}`)
    consultas.push(`title=${encodeURIComponent(titulo)}`)
    let respuestas = 0
    const vistos = new Map()
    for (const q of consultas) {
      const data = await get(`/search.json?${q}&limit=5&fields=${CAMPOS}`)
      if (data !== undefined) respuestas++
      for (const d of data?.docs || []) if (!vistos.has(d.key)) vistos.set(d.key, { ...d, porIsbn: q.startsWith('isbn=') })
      const mejor = puntuar(f, [...vistos.values()])[0]
      if (mejor && mejor.score >= 0.9) break
    }
    if (!respuestas) return undefined
    return puntuar(f, [...vistos.values()])
  }

  async function obra(key) {
    return get(`${key}.json`)
  }

  async function enriquecer(f, { forzarId } = {}) {
    if (forzarId) {
      const key = forzarId.startsWith('/works/') ? forzarId : `/works/${forzarId}`
      const data = await get(`/search.json?q=key:${encodeURIComponent(key)}&fields=${CAMPOS}`)
      const d = data?.docs?.[0]
      if (!d) return { ...f, match: { provider: 'openlibrary', estado: 'sin-resultado', id: key, manual: true } }
      return aplicar(f, d, await obra(d.key), { provider: 'openlibrary', estado: 'manual', id: d.key, score: 1 })
    }
    const candidatos = await buscar(f)
    if (candidatos === undefined) return { ...f, match: { provider: 'openlibrary', estado: 'pendiente', motivo: 'sin caché y sin red' } }
    if (!candidatos.length) return { ...f, match: { provider: 'openlibrary', estado: 'sin-resultado', candidatos: [] } }
    const resumen = candidatos.slice(0, 3).map((c) => ({ id: c.d.key, titulo: c.d.title, autor: c.d.author_name?.[0] || null, año: c.d.first_publish_year || null, score: Math.round(c.score * 100) / 100 }))
    const [mejor, segundo] = candidatos
    // Open Library tiene a menudo la misma obra repetida: con título y autor exactos no se duda.
    const seguro = mejor.score >= 0.95 || (mejor.score >= 0.85 && (!segundo || mejor.score - segundo.score >= 0.05))
    if (!seguro) return { ...f, match: { provider: 'openlibrary', estado: 'revisar', candidatos: resumen } }
    return aplicar(f, mejor.d, await obra(mejor.d.key), { provider: 'openlibrary', estado: 'auto', id: mejor.d.key, score: Math.round(mejor.score * 100) / 100, candidatos: resumen })
  }

  return { enriquecer }
}

export function puntuar(f, docs) {
  const titulo = tituloLimpio(f.title)
  return docs
    .map((d) => {
      const t = Math.max(similar(titulo, tituloLimpio(d.title)), d.subtitle ? similar(titulo, `${d.title} ${d.subtitle}`) : 0)
      const autores = d.author_name || []
      const a = f.creator ? Math.max(0, ...autores.map((n) => similar(f.creator.split(',')[0], n))) : 0.5
      let score = 0.7 * t + 0.3 * a
      if (d.porIsbn) score = Math.max(score, 0.95)
      // Las traducciones tienen el año de su edición; la obra, el de la primera publicación: solo resta si es posterior.
      if (f.year && d.first_publish_year && d.first_publish_year > f.year + 1) score -= 0.1
      return { d, score }
    })
    .sort((a, b) => b.score - a.score)
}

function descripcion(w) {
  const d = w?.description
  const texto = typeof d === 'string' ? d : d?.value
  return texto ? texto.replace(/\r\n/g, '\n').split(/\n-{3,}|\n\s*\(\[source\]|\n\s*\*\*\*/)[0].trim() : null
}

function aplicar(f, d, w, match) {
  const portada = d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null
  return {
    ...f,
    creator: f.creator || (d.author_name || []).slice(0, 2).join(', '),
    year: f.year || d.first_publish_year || null,
    synopsis: f.synopsis || descripcion(w),
    cover_url: f.cover_url || portada,
    genres: [...new Set([...f.genres, ...(d.subject || []).slice(0, 6)])],
    details: {
      ...f.details,
      pages: f.details.pages || d.number_of_pages_median || null,
      first_published: d.first_publish_year || null,
      ...(portada && f.cover_url && portada !== f.cover_url ? { cover_url_openlibrary: portada } : {}),
    },
    external_ids: { ...f.external_ids, openlibrary: d.key },
    sources: [...new Set([...f.sources, 'openlibrary'])],
    match,
  }
}
