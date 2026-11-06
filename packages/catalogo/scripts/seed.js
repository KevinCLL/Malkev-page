// Llena la base de datos con lo que ya existe:
//  - los posts de Jekyll (../../_posts), conservando sus URLs y las redirecciones antiguas,
//  - la colección real exportada del POC (seed/coleccion.json: pelis, series, libros, manga, videojuegos),
//  - las dos Kallax leídas de las fotos (seed/kallax-real.js), como colecciones con cada caja en su hueco,
//  - y unas colecciones base: filmoteca, biblioteca y lista de deseos.
//
// Uso: npm run seed                 solo añade lo que falta: nunca pisa lo que hayas cambiado en el panel
//      npm run seed -- --actualizar  vuelve a copiar los datos de las fuentes encima de lo que haya
//                                    (textos de los posts, datos de las fichas, colocación de las Kallax)
//      npm run seed -- --reset       vacía catálogo y blog antes de cargar (la cuenta del capitán se queda)
//      npm run seed -- --solo=posts|coleccion|kallax
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'
import { pool, tx } from '../server/db.js'
import { migrate } from './migrate.js'
import { slugify, wordCount } from '../server/lib/text.js'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..')
const POSTS_DIR = process.env.POSTS_DIR || join(ROOT, '..', '..', '_posts')
const args = process.argv.slice(2)
const RESET = args.includes('--reset')
const UPDATE = args.includes('--actualizar')
const ONLY = args.find((a) => a.startsWith('--solo='))?.split('=')[1]
const want = (part) => !ONLY || ONLY === part

/* ------------------------------------------------------------ posts de Jekyll */

// YAML mínimo: lo que usan los posts de este blog (clave: valor, "comillas", [listas] y listas con guiones).
function frontMatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { data: {}, body: src }
  const data = {}
  let listKey = null
  for (const line of m[1].split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+(.*)$/)
    if (item && listKey) { data[listKey].push(unquote(item[1])); continue }
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (!kv) continue
    const [, key, raw] = kv
    if (raw === '') { data[key] = []; listKey = key; continue }
    listKey = null
    if (raw.startsWith('[') && raw.endsWith(']')) data[key] = raw.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean)
    else if (raw === 'true' || raw === 'false') data[key] = raw === 'true'
    else data[key] = unquote(raw)
  }
  return { data, body: src.slice(m[0].length) }
}
const unquote = (s) => {
  s = String(s).trim()
  if ((s.startsWith('"') && s.endsWith('"'))) return s.slice(1, -1).replace(/\\"/g, '"')
  if ((s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).replace(/''/g, "'")
  return s
}

async function upsertTags(client, names) {
  const ids = []
  for (const name of names) {
    const slug = slugify(name)
    const row = (await client.query(
      `INSERT INTO tags (slug, name) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id`, [slug, name])).rows[0]
    ids.push(row.id)
  }
  return [...new Set(ids)]
}

async function seedPosts(client) {
  if (!existsSync(POSTS_DIR)) { console.log(`  (no encuentro ${POSTS_DIR}; me salto los posts)`); return }
  const files = readdirSync(POSTS_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}-.+\.(md|markdown)$/.test(f)).sort()
  let n = 0
  for (const file of files) {
    const { data, body } = frontMatter(readFileSync(join(POSTS_DIR, file), 'utf8'))
    const [, y, mo, d, name] = file.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)\.(?:md|markdown)$/)
    const slug = slugify(name, 120)
    const date = data.date ? new Date(String(data.date).replace(/^(\S+) (\S+) ([+-]\d{4})$/, '$1T$2$3')) : new Date(`${y}-${mo}-${d}T12:00:00+01:00`)
    // kramdown con hard_wrap: un salto de línea simple también es <br>, como en el blog actual.
    const html = marked.parse(body, { gfm: true, breaks: true })
    const cover = html.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null
    const status = data.published === false ? 'draft' : 'published'
    const aliases = [].concat(data.redirect_from || [])
    const row = (await client.query(
      `INSERT INTO posts (slug, title, description, content_html, cover_url, status, published_at, legacy_path, aliases, word_count, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (slug) DO ${UPDATE ? `UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
         content_html = EXCLUDED.content_html, content_json = NULL, cover_url = EXCLUDED.cover_url, status = EXCLUDED.status,
         published_at = EXCLUDED.published_at, legacy_path = EXCLUDED.legacy_path, aliases = EXCLUDED.aliases,
         word_count = EXCLUDED.word_count` : 'NOTHING'}
       RETURNING id`,
      [slug, data.title || name, data.description || '', html, cover, status, date,
        `/blog/${y}/${mo}/${d}/${name}/`, aliases, wordCount(html), (data.tags || []).includes('archivo') ? 'Archivo' : 'Bitácora'],
    )).rows[0]
    if (!row) continue // ya estaba y no se pidió --actualizar: se respeta lo editado en el panel
    await client.query('DELETE FROM post_tags WHERE post_id = $1', [row.id])
    for (const tagId of await upsertTags(client, data.tags || [])) {
      await client.query('INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [row.id, tagId])
    }
    n++
  }
  console.log(`  ✓ ${n} posts ${UPDATE ? 'cargados o actualizados' : 'nuevos'} (de ${files.length})`)
}

/* --------------------------------------------------- colección real del POC */

// Claves de meta que en realidad son identificadores en otras webs.
const EXTERNAL = {
  goodreads_id: 'goodreads', filmaffinity_id: 'filmaffinity', anilist_id: 'anilist', launchbox_id: 'launchbox',
  database_id: 'launchbox_db', isbn: 'isbn', tmdb: 'tmdb', bgg: 'bgg', openlibrary: 'openlibrary', imdb: 'imdb',
}
const STATUS = new Set(['owned', 'wishlist', 'reading', 'watching', 'playing', 'done', 'paused', 'dropped'])

function splitMeta(meta = {}) {
  const external = {}
  const rest = {}
  for (const [k, v] of Object.entries(meta)) {
    if (v === null || v === '' || (Array.isArray(v) && !v.length)) continue
    if (EXTERNAL[k]) external[EXTERNAL[k]] = typeof v === 'number' ? v : String(v)
    else rest[k] = v
  }
  return { external, rest }
}

const validDate = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null)
const validColor = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null)
const validYear = (y) => (Number.isInteger(y) && y >= 1000 && y <= 2200 ? y : null)

// Slug único por tipo: título, y si choca, título-año, y si no, título-2, -3…
function slugger() {
  const used = new Map()
  return (kind, title, year) => {
    const set = used.get(kind) ?? used.set(kind, new Set()).get(kind)
    let base = slugify(title)
    let slug = base
    if (set.has(slug) && year) slug = `${base}-${year}`
    for (let i = 2; set.has(slug); i++) slug = `${base}-${i}`
    set.add(slug)
    return slug
  }
}

async function insertItem(client, it, slugFor) {
  const { external, rest } = splitMeta(it.meta)
  const kind = it.kind
  const year = validYear(it.year)
  const slug = slugFor(kind, it.title, year)
  const finished = validDate(it.meta?.date_read) || validDate(it.meta?.seen)
  const row = (await client.query(
    `INSERT INTO items (kind, slug, title, original_title, creator, year, synopsis, cover_url, color, rating, status,
                        notes, featured, hidden, finished_on, external_ids, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     ON CONFLICT (kind, slug) DO ${UPDATE ? `UPDATE SET title = EXCLUDED.title, creator = EXCLUDED.creator,
       year = COALESCE(EXCLUDED.year, items.year),
       cover_url = COALESCE(EXCLUDED.cover_url, items.cover_url), color = COALESCE(EXCLUDED.color, items.color),
       rating = COALESCE(EXCLUDED.rating, items.rating),
       status = CASE WHEN $18::boolean THEN EXCLUDED.status ELSE items.status END,
       finished_on = COALESCE(EXCLUDED.finished_on, items.finished_on),
       external_ids = items.external_ids || EXCLUDED.external_ids, meta = items.meta || EXCLUDED.meta` : 'NOTHING'}
     RETURNING id`,
    [kind, slug, it.title, rest.title_native || null, it.creator || '', year, rest.overview || '', it.cover_url || null,
      validColor(it.color), Number.isInteger(it.rating) ? Math.max(0, Math.min(10, it.rating)) : null,
      STATUS.has(it.status) ? it.status : 'owned', it.notes || '', !!it.featured, !!it.hidden, finished, external, rest,
      ...(UPDATE ? [!it.keepStatus] : [])],
  )).rows[0]
  if (row) return row.id
  // Ya existía: solo hace falta su id (para colocarlo en su Kallax).
  return (await client.query('SELECT id FROM items WHERE kind = $1 AND slug = $2', [kind, slug])).rows[0].id
}

async function seedCollection(client, slugFor) {
  const file = join(ROOT, 'seed', 'coleccion.json')
  const { items } = JSON.parse(readFileSync(file, 'utf8'))
  for (const it of items) await insertItem(client, it, slugFor)
  console.log(`  ✓ ${items.length} cosas de la colección revisadas${UPDATE ? ' y actualizadas' : ' (lo que ya estaba no se toca)'}`)
}

/* ------------------------------------------------------------- las Kallax */

// Recorre un mueble de kallax-real.js, crea cada caja como item y cambia el objeto por {item: id, …}
// en el layout. Devuelve las filas de collection_items con su hueco y cómo está colocada.
async function placeFurniture(client, f, slugFor) {
  const placed = []
  const realItem = async (it, row, col, placement) => {
    if (it.deco) return it
    const id = await insertItem(client, {
      kind: it.kind || 'boardgame', title: it.title, color: it.color, status: 'owned', keepStatus: true,
      notes: it.note ? `Pósit: «${it.note}»` : '',
      meta: { ...(it.dot ? { sticker: it.dot } : {}), ...(it.doubt ? { doubt: it.doubt } : {}) },
    }, slugFor)
    placed.push({ id, row, col, placement, position: placed.length })
    const { title, kind, note, doubt, dot, ...shape } = it
    return { item: id, ...shape }
  }
  const visit = async (groups, row, col, where) => {
    const out = []
    for (const g of groups || []) {
      const copy = { ...g }
      if (g.items) copy.items = []
      if (g.type === 'stack') {
        for (const [i, it] of g.items.entries()) copy.items.push(await realItem(it, row, col, `${where}pila, ${i + 1}ª desde abajo`))
        if (g.above) copy.above = await visit(g.above, row, col, `${where}encima de una pila · `)
      } else if (g.type === 'row') {
        for (const [i, it] of g.items.entries()) copy.items.push(await realItem(it, row, col, `${where}de pie, ${i + 1}ª por la izquierda`))
        copy.on = []
        for (const it of g.on || []) copy.on.push(await realItem(it, row, col, `${where}tumbada encima`))
      } else if (g.type === 'bridge') {
        copy.groups = await visit(g.groups, row, col, where)
        copy.on = []
        for (const it of g.on || []) copy.on.push(await realItem(it, row, col, `${where}tumbada por encima de todo`))
      } else {
        for (const it of g.items || []) copy.items.push(await realItem(it, row, col, `${where}${g.type === 'face' ? 'de frente' : ''}`))
      }
      out.push(copy)
    }
    return out
  }
  const layout = { top: await visit(f.top, null, null, 'encima del mueble · '), cubes: [] }
  for (const c of f.cubes) {
    const tiers = []
    for (const [t, tier] of c.tiers.entries()) tiers.push(await visit(tier, c.row, c.col, c.tiers.length > 1 ? `balda ${t + 1} del organizador · ` : ''))
    const aside = c.aside ? (await visit([c.aside], c.row, c.col, 'al lado del organizador · '))[0] : null
    layout.cubes.push({ ...c, tiers, aside })
  }
  return { layout, placed }
}

async function seedKallax(client, slugFor) {
  const { furniture } = await import('../seed/kallax-real.js')
  let total = 0
  let skipped = 0
  for (const [i, f] of furniture.entries()) {
    const slug = slugify(f.key || `kallax-${i + 1}`)
    const existing = (await client.query('SELECT id FROM collections WHERE slug = $1', [slug])).rows[0]
    // Una Kallax que ya está en la base de datos no se toca sin --actualizar: puede haberse reordenado en el panel.
    if (existing && !UPDATE) { skipped++; continue }
    const { layout, placed } = await placeFurniture(client, f, slugFor)
    const col = (await client.query(
      `INSERT INTO collections (slug, name, kind, room, rows, cols, layout, position, description)
       VALUES ($1, $2, 'kallax', 'sala-recreativa', $3, $4, $5, $6, $7)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, rows = EXCLUDED.rows, cols = EXCLUDED.cols, layout = EXCLUDED.layout
       RETURNING id`,
      [slug, f.name, f.rows, f.cols, layout, i, 'Leída de las fotos del 8 de octubre de 2026, cubo a cubo.'],
    )).rows[0]
    await client.query('DELETE FROM collection_items WHERE collection_id = $1', [col.id])
    for (const p of placed) {
      await client.query(
        `INSERT INTO collection_items (collection_id, item_id, position, row, col, placement)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        [col.id, p.id, p.position, p.row, p.col, p.placement],
      )
    }
    total += placed.length
  }
  console.log(`  ✓ ${furniture.length - skipped} Kallax con ${total} cajas y libros de rol colocados${skipped ? ` (${skipped} ya estaban)` : ''}`)
}

/* ------------------------------------------------------ colecciones base */

async function seedBaseCollections(client) {
  const base = [
    { slug: 'filmoteca', name: 'Filmoteca', kind: 'shelf', room: 'proyeccion', where: "kind IN ('film', 'series')", description: 'Todo lo visto en la sala de proyección.' },
    { slug: 'biblioteca', name: 'Biblioteca', kind: 'bookcase', room: 'biblioteca', where: "kind IN ('book', 'manga') AND status <> 'wishlist'", description: 'Libros y manga leídos o en curso.' },
    { slug: 'lista-de-deseos', name: 'Lista de deseos', kind: 'list', room: null, where: "status = 'wishlist'", description: 'Lo que aún no está a bordo.' },
  ]
  let made = 0
  for (const [i, c] of base.entries()) {
    const existing = (await client.query('SELECT id FROM collections WHERE slug = $1', [c.slug])).rows[0]
    if (existing && !UPDATE) continue
    made++
    const col = (await client.query(
      `INSERT INTO collections (slug, name, kind, room, description, position) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [c.slug, c.name, c.kind, c.room, c.description, 10 + i],
    )).rows[0]
    await client.query('DELETE FROM collection_items WHERE collection_id = $1', [col.id])
    await client.query(
      `INSERT INTO collection_items (collection_id, item_id, position)
       SELECT $1, id, row_number() OVER (ORDER BY f_unaccent(lower(title))) FROM items WHERE ${c.where}`, [col.id])
  }
  console.log(`  ✓ ${made} colecciones base nuevas o rehechas (filmoteca, biblioteca, lista de deseos)`)
}

/* ------------------------------------------------------------------ main */

async function main() {
  await migrate({ log: () => {} })
  await tx(async (client) => {
    if (RESET) {
      await client.query('TRUNCATE items, item_ratings, tags, item_tags, collections, collection_items, posts, post_tags, post_items, comments RESTART IDENTITY CASCADE')
      console.log('  · catálogo y blog vaciados')
    }
    // El orden de carga es fijo, así que en cada pasada salen los mismos slugs y ON CONFLICT reconoce lo que ya hay.
    const slugFor = slugger()
    if (want('posts')) await seedPosts(client)
    if (want('coleccion')) await seedCollection(client, slugFor)
    if (want('kallax')) await seedKallax(client, slugFor)
    if (!ONLY) await seedBaseCollections(client)
  })
  const counts = (await pool.query(`SELECT (SELECT count(*) FROM posts) posts, (SELECT count(*) FROM items) items,
    (SELECT count(*) FROM collections) collections, (SELECT count(*) FROM tags) tags`)).rows[0]
  console.log(`Listo: ${counts.posts} posts, ${counts.items} cosas, ${counts.collections} colecciones, ${counts.tags} etiquetas.`)
}

main().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1) })
