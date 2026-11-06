// SQL para el catálogo de PostgreSQL (packages/catalogo/db/migrations/001_esquema.sql, tabla items).
//
// Todo va en una transacción, en cuatro pasos, para poder repetir la importación sin duplicar:
//   1. Las fichas se cargan en una tabla temporal.
//   2. Las que ya existen (mismo tipo y algún identificador externo en común: Filmaffinity, Goodreads,
//      AniList, TMDB, Open Library o ISBN) se emparejan con ella y se actualizan.
//   3. Las que no, por tipo y slug (el mismo que pone el seed del catálogo), salvo que el año o el id de la
//      fuente digan que es otra obra.
//   4. El resto se inserta. Si su slug está ocupado por otra obra no entra y se lista al final.
//
// Al actualizar, por defecto solo se rellenan huecos: lo que ya hay en la base de datos (lo que se haya
// tocado desde el panel) gana. Con `sobrescribir` mandan los datos importados en nota, estado y portada.
// Las notas propias nunca se pisan si ya hay algo escrito. Lo fijado en correcciones.json (título, año,
// autor, estado, oculto, destacado) manda siempre. El slug de una ficha que ya existe no se toca nunca,
// para no romper sus URLs.

// Ids de la fuente original (uno por entrada) y de las bases de datos de obras (pueden repetirse entre
// ediciones). Se empareja primero por los primeros, y nunca con una ficha que tenga otro id de la misma fuente.
const IDS_PROPIOS = ['filmaffinity', 'goodreads', 'anilist']
const IDS_OBRA = ['tmdb', 'openlibrary', 'isbn']

export function lit(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL'
  // Comillas estándar de SQL; sin barras invertidas especiales (standard_conforming_strings está activo por defecto).
  return `'${String(v).replace(/\u0000/g, '').replace(/'/g, "''")}'`
}

// PostgreSQL no admite \u0000 en jsonb ni en text: se quita de todas las cadenas antes de serializar.
const json = (o) => `${lit(JSON.stringify(o, (_, v) => (typeof v === 'string' ? v.replace(/\u0000/g, '') : v)))}::jsonb`

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
    `ARRAY[${(f.corregido || []).map(lit).join(', ')}]::text[]`,
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
  corregido    text[] NOT NULL DEFAULT '{}',
  item_id      bigint
) ON COMMIT DROP;`, '')
  for (let i = 0; i < fichas.length; i += lote) {
    out.push(`INSERT INTO importacion (${COLS.join(', ')}, corregido) VALUES`)
    out.push(fichas.slice(i, i + lote).map(fila).join(',\n') + ';', '')
  }

  const propios = IDS_PROPIOS.map(lit).join(', ')
  const todos = [...IDS_PROPIOS, ...IDS_OBRA].map(lit).join(', ')
  out.push(`-- 1. Emparejar con lo que ya hay por identificador externo (usa el índice GIN de external_ids).
--    Primero por el id de la fuente (Filmaffinity, Goodreads, AniList) y luego por el de la obra
--    (TMDB, Open Library, ISBN), descartando fichas con otro id de la misma fuente: dos ediciones de un
--    libro en Goodreads son la misma obra en Open Library, pero dos fichas.
UPDATE importacion s SET item_id = (
  SELECT i.id
  FROM jsonb_each(s.external_ids) e
  JOIN items i ON i.kind = s.kind AND i.external_ids @> jsonb_build_object(e.key, e.value)
  WHERE e.key IN (${todos})
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(s.external_ids) p
      WHERE p.key IN (${propios}) AND i.external_ids ? p.key AND i.external_ids -> p.key <> p.value
    )
  ORDER BY (e.key IN (${propios})) DESC, i.id
  LIMIT 1
);
-- 1b. Las que no tienen ids en común, por tipo y slug, si el año no dice que es otra obra
--     (dos «Drácula» de 1931 y 1992 son dos fichas) ni tienen otro id de la misma fuente.
UPDATE importacion s SET item_id = i.id
FROM items i
WHERE s.item_id IS NULL AND i.kind = s.kind AND i.slug = s.slug
  AND (i.year IS NULL OR s.year IS NULL OR abs(i.year - s.year) <= 1)
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_each(s.external_ids) p
    WHERE p.key IN (${propios}) AND i.external_ids ? p.key AND i.external_ids -> p.key <> p.value
  );
-- Si dos filas importadas apuntan a la misma ficha, solo la primera la actualiza.
UPDATE importacion s SET item_id = NULL
WHERE item_id IS NOT NULL AND EXISTS (SELECT 1 FROM importacion o WHERE o.item_id = s.item_id AND o.n < s.n);
`)

  const set = (alias) => {
    const nuevo = (c) => `${alias}.${c}`
    const hueco = (c) => `COALESCE(NULLIF(items.${c}, ''), ${nuevo(c)})`
    const manda = (c) => (sobrescribir ? `COALESCE(${nuevo(c)}, items.${c})` : `COALESCE(items.${c}, ${nuevo(c)})`)
    // La portada se cambia si no había, o si la que hay es la que traía la fuente (meta.cover_url_original:
    // el póster de Filmaffinity que TMDB sustituye); una portada puesta a mano se respeta.
    const portada = sobrescribir
      ? `COALESCE(${nuevo('cover_url')}, items.cover_url)`
      : `CASE WHEN items.cover_url IS NULL OR items.cover_url = ${nuevo('meta')} ->> 'cover_url_original' THEN COALESCE(${nuevo('cover_url')}, items.cover_url) ELSE items.cover_url END`
    // Lo que viene de correcciones.json (columna corregido) gana siempre: es una decisión explícita.
    const corr = (c, normal) => `CASE WHEN '${c}' = ANY(${nuevo('corregido')}) THEN ${nuevo(c)} ELSE ${normal} END`
    return `title        = ${corr('title', 'items.title')},
  original_title = ${corr('original_title', `COALESCE(items.original_title, ${nuevo('original_title')})`)},
  creator      = ${corr('creator', hueco('creator'))},
  year         = ${corr('year', `COALESCE(items.year, ${nuevo('year')})`)},
  featured     = ${corr('featured', 'items.featured')},
  hidden       = ${corr('hidden', 'items.hidden')},
  synopsis     = ${hueco('synopsis')},
  cover_url    = ${portada},
  color        = COALESCE(items.color, ${nuevo('color')}),
  rating       = ${manda('rating')},
  status       = ${corr('status', sobrescribir ? nuevo('status') : `CASE WHEN items.status = 'owned' THEN ${nuevo('status')} ELSE items.status END`)},
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
  out.push(`-- 3. Insertar las nuevas. Las que choquen con un slug ocupado por otra obra no entran y se listan:
--    se arreglan dándoles otro slug en correcciones.json.
WITH nuevas AS (
  INSERT INTO items (${COLS.join(', ')})
  SELECT ${COLS.join(', ')} FROM importacion WHERE item_id IS NULL ORDER BY n
  ON CONFLICT (kind, slug) DO NOTHING
  RETURNING kind, slug
)
SELECT s.kind, s.slug, s.title, s.year AS "año", i.title AS "slug ocupado por", i.year AS "su año"
FROM importacion s
JOIN items i ON i.kind = s.kind AND i.slug = s.slug
WHERE s.item_id IS NULL AND NOT EXISTS (SELECT 1 FROM nuevas n WHERE n.kind = s.kind AND n.slug = s.slug);
`)
  out.push('COMMIT;')
  return out.join('\n') + '\n'
}
