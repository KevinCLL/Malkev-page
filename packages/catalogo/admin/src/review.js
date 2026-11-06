// «Por revisar»: fichas que el importador no pudo emparejar con seguridad y el capitán aún no ha dado por
// buenas. Es la misma regla que REVIEW_STATES y REVIEW_SQL de server/catalog.js (el filtro ?review=true).
const LABELS = { revisar: 'Revisar emparejado', 'sin-resultado': 'Sin datos externos', error: 'Error al importar' }
const PROVIDERS = { tmdb: 'TMDB', openlibrary: 'Open Library', anilist: 'AniList' }
const HELP = {
  revisar: (p) => `El importador encontró varias obras parecidas en ${p} y no se atrevió a elegir, así que no usó sus datos.`,
  'sin-resultado': (p) => `El importador no encontró esta obra en ${p}: no tiene portada ni sinopsis de fuera.`,
  error: (p) => `La consulta a ${p} falló durante la importación y la ficha se quedó con los datos de origen.`,
}

export function reviewOf(item) {
  const m = item?.meta?.import?.match
  if (!m || !LABELS[m.estado] || item.meta.revisado?.estado === m.estado) return null
  const provider = PROVIDERS[m.provider] || m.provider || 'la fuente'
  return { estado: m.estado, provider, label: LABELS[m.estado], help: HELP[m.estado](provider) }
}

// Lo que se guarda en meta al darla por buena: el veredicto que se aceptó y cuándo.
export const reviewedMark = (review) => ({ estado: review.estado, en: new Date().toISOString() })
