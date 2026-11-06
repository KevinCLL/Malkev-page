// Resumen legible de una importación: cuántas fichas hay de cada tipo y cómo ha ido el emparejamiento.
const NOMBRE = { film: 'Pelis', series: 'Series', book: 'Libros', manga: 'Manga' }
const ESTADOS = ['auto', 'manual', 'revisar', 'sin-resultado', 'pendiente', 'error']

export function informe(fichas) {
  const filas = []
  for (const kind of Object.keys(NOMBRE)) {
    const l = fichas.filter((f) => f.kind === kind)
    if (!l.length) continue
    const c = Object.fromEntries(ESTADOS.map((e) => [e, l.filter((f) => f.match?.estado === e).length]))
    const conSinopsis = l.filter((f) => f.synopsis).length
    const conPortada = l.filter((f) => f.cover_url).length
    filas.push(`| ${NOMBRE[kind]} | ${l.length} | ${c.auto + c.manual} | ${c.revisar} | ${c['sin-resultado'] + c.error} | ${c.pendiente} | ${conSinopsis} | ${conPortada} |`)
  }
  return [
    '# Importación de la filmoteca y la biblioteca',
    '',
    `${fichas.length} fichas · ${new Date().toISOString().slice(0, 10)}`,
    '',
    '| Tipo | Fichas | Emparejadas | Revisar | Sin resultado | Pendientes | Con sinopsis | Con portada |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...filas,
    '',
    '- **Emparejadas**: encontradas en TMDB / Open Library con seguridad (o fijadas en correcciones.json).',
    '- **Revisar**: hay candidatos pero ninguno claro; están en revisar.json con sus IDs para elegir en correcciones.json.',
    '- **Pendientes**: no se han buscado (sin clave de TMDB, sin red o fuera del --limite). El manga viene de AniList y no se busca.',
    '',
  ].join('\n')
}
