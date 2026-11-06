// SQL para el catálogo de PostgreSQL (packages/catalogo/db/migrations/001_esquema.sql, tabla items).
//
// Todo va en una transacción y en tres pasos, para poder repetir la importación sin duplicar:
//   1. Las fichas se cargan en una tabla temporal.
//   2. Las que ya existen (mismo tipo y algún identificador externo en común: Filmaffinity, Goodreads,
//      AniList, TMDB, Open Library o ISBN) se actualizan.
//   3. El resto se inserta; si el slug ya existe en ese tipo (ON CONFLICT (kind, slug)) se actualiza
//      también, salvo que el año diga que es otra obra.
//
// Al actualizar, por defecto solo se rellenan huecos: lo que ya hay en la base de datos (lo que se haya
// tocado desde el panel) gana. Con `sobrescribir` mandan los datos importados en nota, estado y portada.
// Las notas propias nunca se pisan si ya hay algo escrito.

const IDS_EMPAREJAR = ['filmaffinity', 'goodreads', 'anilist', 'tmdb', 'openlibrary', 'isbn']

export function lit(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL'
  // Comillas estándar de SQL; sin barras invertidas especiales (standard_conforming_strings está activo por defecto).
  return `'${String(v).replace(/\u0000/g, '').replace(/'/g, "''")}'`
}

const json = (o) => `${lit(JSON.stringify(o))}::jsonb`

// Lo que no tiene columna propia va a meta: detalles del tipo, géneros, fuentes y cómo se emparejó.
export function metaDe(f) {
  const meta = { ...f.details }
  for (const [k, v] of Object.entries(meta)) if (v === null || v === undefined) delete meta[k]
  if (f.genres?.length) meta.genres = f.genres
  meta.import = {
    sources: f.sources,
    ...(f.match ? { match: { provider: f.match.provider, estado: f.match.estado, score: f.match.score ?? null } } : {}),
  }
  return meta
}

const COLS = ['kind', 'slug', 'title', 'original_title', 'creator', 'year', 'synopsis', 'cover_url', 'color', 'rating', 'status',
  'notes', 'featured', 'hidden', 'started_on', 'finished_on', 'external_ids', 'meta']

function fila(f) {
  return `(${[
    `${lit(f.kind)}::item_kind`, lit(f.slug), lit(f.title), lit(f.original_title), lit(f.creator || ''), lit(f.year),
    lit(f.synopsis || ''), lit(f.cover_url), lit(f.color), lit(f.rating), `${lit(f.status)}::item_status`, lit(f.notes || ''),
    lit(f.featured), lit(f.hidden), `${lit(f.started_on)}::date`, `${lit(f.finished_on)}::date`, json(f.external_ids), json(metaDe(f)),
  ].join(', ')})`
}

export function generarSql(fichas, { sobrescribir = false, titulo = 'importación', lote = 250 } = {}) {
  const out = []
  out.push(`-- Malkevnia · ${titulo} · ${fichas.length} fichas · generado el ${new Date().toISOString()}`)
  out.push('-- Se puede ejecutar varias veces: actualiza en vez de duplicar. psql -v ON_ERROR_STOP=1 -f este-fichero.sql')
  out.push('BEGIN;', '')
  out.push(`CREATE TEMP TABLE importacion (
  n            serial,
  kind         item_kind NOT NULL,
  slug         text NOT NULL,
  title        text NOT NULL,
  original_title text,
  creator      text NOT NULL,
  year         smallint,
  synopsis     text NOT NULL,
  cover_url    text,
  color        text,
  rating       smallint,
  status       item_status NOT NULL,
  notes        text NOT NULL,
  featured     boolean NOT NULL,
  hidden       boolean NOT NULL,
  started_on   date,
  finished_on  date,
  external_ids jsonb NOT NULL,
  meta         jsonb NOT NULL,
  item_id      bigint
) ON COMMIT DROP;`, '')
  for (let i = 0; i < fichas.length; i += lote) {
    out.push(`INSERT INTO importacion (${COLS.join(', ')}) VALUES`)
    out.push(fichas.slice(i, i + lote).map(fila).join(',\n') + ';', '')
  }

  const ids = IDS_EMPAREJAR.map(lit).join(', ')
  out.push(`-- 1. Emparejar con lo que ya hay por identificador externo.
UPDATE importacion s SET item_id = (
  SELECT i.id FROM items i
  WHERE i.kind = s.kind
    AND EXISTS (SELECT 1 FROM jsonb_each(s.external_ids) e WHERE e.key IN (${ids}) AND i.external_ids -> e.key = e.value)
  ORDER BY i.id LIMIT 1
);
-- Si dos filas importadas apuntan a la misma ficha, solo la primera la actualiza.
UPDATE importacion s SET item_id = NULL
WHERE item_id IS NOT NULL AND EXISTS (SELECT 1 FROM importacion o WHERE o.item_id = s.item_id AND o.n < s.n);
`)

  const set = (alias) => {
    const nuevo = (c) => `${alias}.${c}`
    const hueco = (c) => `COALESCE(NULLIF(items.${c}, ''), ${nuevo(c)})`
    const manda = (c) => (sobrescribir ? `COALESCE(${nuevo(c)}, items.${c})` : `COALESCE(items.${c}, ${nuevo(c)})`)
    return `original_title = COALESCE(items.original_title, ${nuevo('original_title')}),
  creator      = ${hueco('creator')},
  year         = COALESCE(items.year, ${nuevo('year')}),
  synopsis     = ${hueco('synopsis')},
  cover_url    = ${manda('cover_url')},
  color        = COALESCE(items.color, ${nuevo('color')}),
  rating       = ${manda('rating')},
  status       = ${sobrescribir ? nuevo('status') : `CASE WHEN items.status = 'owned' THEN ${nuevo('status')} ELSE items.status END`},
  notes        = CASE WHEN items.notes = '' THEN ${nuevo('notes')} ELSE items.notes END,
  started_on   = COALESCE(items.started_on, ${nuevo('started_on')}),
  finished_on  = COALESCE(items.finished_on, ${nuevo('finished_on')}),
  external_ids = ${nuevo('external_ids')} || items.external_ids,
  meta         = ${nuevo('meta')} || items.meta || jsonb_build_object('import', ${nuevo('meta')} -> 'import')`
  }

  out.push(`-- 2. Actualizar las que ya existían.
UPDATE items SET
  ${set('s')}
FROM importacion s
WHERE s.item_id = items.id;
`)
  out.push(`-- 3. Insertar las nuevas. Si el slug ya está cogido en ese tipo, se actualiza esa ficha solo si
--    el año no dice lo contrario (dos pelis con el mismo título de años distintos son obras distintas).
INSERT INTO items AS items (${COLS.join(', ')})
SELECT ${COLS.join(', ')} FROM importacion WHERE item_id IS NULL ORDER BY n
ON CONFLICT (kind, slug) DO UPDATE SET
  ${set('EXCLUDED')}
WHERE items.year IS NULL OR EXCLUDED.year IS NULL OR abs(items.year - EXCLUDED.year) <= 1;
`)
  out.push(`-- Las que no han entrado (slug ocupado por otra obra): corrige su slug en correcciones.json.
SELECT s.kind, s.slug, s.title, s.year AS "año importado", i.title AS "ocupado por", i.year AS "año"
FROM importacion s JOIN items i ON i.kind = s.kind AND i.slug = s.slug
WHERE s.item_id IS NULL AND i.year IS NOT NULL AND s.year IS NOT NULL AND abs(i.year - s.year) > 1;
`)
  out.push('COMMIT;')
  return out.join('\n') + '\n'
}
