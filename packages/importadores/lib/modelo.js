// El formato normalizado de una ficha. Todas las fuentes producen esto, los enriquecedores lo completan
// y los exportadores lo convierten en JSON o SQL. Ver README para el detalle de cada campo.
import { norm, slugify } from './texto.js'

export const KINDS = ['film', 'series', 'book', 'manga']
// Los mismos valores que el enum item_status del catálogo.
export const STATUSES = ['owned', 'wishlist', 'reading', 'watching', 'playing', 'done', 'paused', 'dropped']

export function crearFicha(f) {
  if (!KINDS.includes(f.kind)) throw new Error(`Tipo no admitido: ${f.kind}`)
  const title = String(f.title ?? '').trim()
  if (!title) throw new Error('Ficha sin título')
  // En pelis y series, «en curso» es watching; en libros y manga, reading.
  let status = STATUSES.includes(f.status) ? f.status : 'owned'
  if (status === 'reading' && (f.kind === 'film' || f.kind === 'series')) status = 'watching'
  if (status === 'watching' && (f.kind === 'book' || f.kind === 'manga')) status = 'reading'
  const year = Number(f.year)
  // El catálogo exige un slug ^[a-z0-9]+(-[a-z0-9]+)*$ y títulos de 1 a 500 caracteres.
  const rating = f.rating === null || f.rating === undefined || f.rating === '' ? null : Math.round(Number(f.rating))
  const ficha = {
    kind: f.kind,
    slug: f.slug && SLUG.test(f.slug) ? f.slug : f.slug ? slugify(f.slug) : null,
    title: title.slice(0, 500),
    original_title: f.original_title || null,
    creator: (f.creator || '').trim(),
    year: Number.isInteger(year) && year >= 1000 && year <= 2200 ? year : null,
    rating: rating !== null && rating >= 0 && rating <= 10 ? rating : null,
    status,
    notes: f.notes || '',
    synopsis: f.synopsis || null,
    cover_url: f.cover_url || null,
    color: /^#[0-9a-f]{6}$/i.test(f.color || '') ? f.color.toLowerCase() : null,
    genres: [...new Set(f.genres || [])],
    // Duración en minutos (pelis), páginas (libros), temporadas/episodios y tomos van aquí.
    details: { ...(f.details || {}) },
    external_ids: limpiarIds(f.external_ids),
    featured: Boolean(f.featured),
    hidden: Boolean(f.hidden),
    started_on: fechaValida(f.started_on),
    finished_on: fechaValida(f.finished_on),
    sources: [...new Set(f.sources || [])],
    match: f.match || null,
  }
  if (f.corregido?.length) ficha.corregido = [...new Set(f.corregido)]
  ficha.slug = ficha.slug || slugFicha(ficha)
  return ficha
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

// Una fecha AAAA-MM-DD que exista de verdad (un 31 de febrero haría fallar todo el SQL).
export function fechaValida(v) {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 1000 ? v : null
}

function limpiarIds(ids = {}) {
  const out = {}
  for (const [k, v] of Object.entries(ids || {})) if (v !== null && v !== undefined && v !== '') out[k] = v
  return out
}

// Como en el catálogo: el título; si choca con otro del mismo tipo, se le añade el año (ver slugsUnicos).
export const slugFicha = (f) => slugify(f.title)

// Dos fichas son la misma si comparten un identificador externo, o el título normalizado y el año
// (sin año, el título y el autor: dos «Poemas» sin fecha de autores distintos no son la misma obra).
export function claves(f) {
  const out = Object.entries(f.external_ids).map(([k, v]) => `${f.kind}:${k}:${v}`)
  out.push(f.year ? `${f.kind}:t:${norm(f.title)}|${f.year}` : `${f.kind}:t:${norm(f.title)}|?|${norm(f.creator.split(',')[0])}`)
  return out
}

// Junta dos fichas de la misma obra: gana lo que ya había, salvo los huecos, que rellena la nueva.
export function fusionar(a, b) {
  const pick = (x, y) => (x === null || x === undefined || x === '' ? y : x)
  return crearFicha({
    ...a,
    original_title: pick(a.original_title, b.original_title),
    creator: pick(a.creator, b.creator),
    year: pick(a.year, b.year),
    rating: pick(a.rating, b.rating),
    status: a.status === 'owned' ? b.status : a.status,
    slug: a.slug,
    notes: pick(a.notes, b.notes),
    synopsis: pick(a.synopsis, b.synopsis),
    cover_url: pick(a.cover_url, b.cover_url),
    color: pick(a.color, b.color),
    genres: [...a.genres, ...b.genres],
    details: { ...b.details, ...a.details },
    external_ids: { ...b.external_ids, ...a.external_ids },
    featured: a.featured || b.featured,
    hidden: a.hidden && b.hidden,
    started_on: pick(a.started_on, b.started_on),
    finished_on: pick(a.finished_on, b.finished_on),
    sources: [...a.sources, ...b.sources],
    corregido: [...(a.corregido || []), ...(b.corregido || [])],
  })
}

// Dos entradas de la misma fuente con ids distintos son dos fichas de verdad (dos ediciones en Goodreads,
// por ejemplo), aunque TMDB u Open Library las lleven a la misma obra.
const IDS_PROPIOS = ['filmaffinity', 'goodreads', 'anilist']
export const distintas = (a, b) =>
  IDS_PROPIOS.some((k) => a.external_ids[k] != null && b.external_ids[k] != null && String(a.external_ids[k]) !== String(b.external_ids[k]))

// Quita duplicados entre fuentes y garantiza slugs únicos por tipo, con la misma regla que el seed del
// catálogo: título; si choca, título-año; si sigue chocando, título-2, -3…
export function deduplicar(fichas) {
  const porClave = new Map()
  const lista = []
  for (const f of fichas) {
    const idx = claves(f).map((k) => porClave.get(k)).find((i) => i !== undefined && !distintas(lista[i], f))
    if (idx === undefined) {
      lista.push(f)
      for (const k of claves(f)) porClave.set(k, lista.length - 1)
    } else {
      lista[idx] = fusionar(lista[idx], f)
      for (const k of claves(lista[idx])) porClave.set(k, idx)
    }
  }
  return slugsUnicos(lista)
}

export function slugsUnicos(lista) {
  const usados = new Set()
  return lista.map((f) => {
    let slug = f.slug
    if (usados.has(`${f.kind}/${slug}`) && f.year) slug = `${f.slug}-${f.year}`
    for (let n = 2; usados.has(`${f.kind}/${slug}`); n++) slug = `${f.slug}-${n}`
    usados.add(`${f.kind}/${slug}`)
    return slug === f.slug ? f : { ...f, slug }
  })
}
