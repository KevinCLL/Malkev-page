// Importa la colección de videojuegos de LaunchBox leyendo sus ficheros (no hace falta abrirlo):
//  - Data/Platforms/*.xml: un fichero por plataforma con todos sus juegos,
//  - Images/<Plataforma>/Box - Front: las carátulas, que se copian a data/uploads/videojuegos/.
// Uso: npm run import:launchbox -- "C:\Users\usuario\LaunchBox" [--sin-caratulas] [--plataforma="Sega Genesis"]
// Vale la carpeta de LaunchBox entera, su carpeta Data (o una copia de ella) o directamente la
// carpeta Platforms. Si las imágenes están en otro sitio (otro disco), se indica con
// --imagenes="D:\LaunchBox\Images"; si no se encuentran, se importa sin carátulas y se avisa.
// Se puede repetir: lo que ya estaba se actualiza (por su id de LaunchBox) sin duplicarse ni perder
// las notas escritas en la consola.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { UPLOADS_DIR } from '../server/db.js'
import { upsertAll, report, VIDEOGAME_KEY } from './lib/import.js'

const args = process.argv.slice(2)
const given = args.find((a) => !a.startsWith('--'))
const onlyPlatform = args.find((a) => a.startsWith('--plataforma='))?.slice('--plataforma='.length)
const imagesArg = args.find((a) => a.startsWith('--imagenes='))?.slice('--imagenes='.length)

// Dónde están los XML de las plataformas, se dé la carpeta que se dé.
function findPlatforms(dir) {
  if (!dir || !existsSync(dir)) return null
  for (const candidate of [join(dir, 'Data', 'Platforms'), join(dir, 'Platforms'), dir]) {
    if (existsSync(candidate) && readdirSync(candidate).some((f) => f.toLowerCase().endsWith('.xml'))) return candidate
  }
  return null
}
const platformsDir = findPlatforms(given)
if (!platformsDir) {
  console.error('Indica la carpeta de LaunchBox (la que tiene dentro Data/ e Images/), su carpeta Data o la carpeta Platforms. Por ejemplo:\n  npm run import:launchbox -- "C:\\Users\\usuario\\LaunchBox"')
  process.exit(1)
}

// Dónde están las imágenes: lo que se indique, o Images/ junto a Data/.
function findImages() {
  const candidates = imagesArg
    ? [imagesArg, join(imagesArg, 'Images')]
    : [join(dirname(dirname(platformsDir)), 'Images'), join(given, 'Images')]
  return candidates.find((c) => existsSync(c) && statSync(c).isDirectory()) || null
}
const imagesDir = args.includes('--sin-caratulas') ? null : findImages()
const withImages = Boolean(imagesDir)
if (!args.includes('--sin-caratulas') && !withImages) {
  console.warn(imagesArg
    ? `No se encuentra la carpeta de imágenes ${imagesArg}: se importa sin carátulas.`
    : 'No hay carpeta Images/ junto a los datos: se importa sin carátulas (indícala con --imagenes="D:\\LaunchBox\\Images" si está en otro disco).')
}

/* ---------- XML ---------- */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decodeXml = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTITIES[e])

// Los ficheros de LaunchBox son XML sencillo y plano: cada <Game> tiene sus campos como hijos de texto.
function parseGames(xml) {
  const games = []
  for (const m of xml.matchAll(/<Game>([\s\S]*?)<\/Game>/g)) {
    const g = {}
    for (const f of m[1].matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)) g[f[1]] = decodeXml(f[2].trim())
    games.push(g)
  }
  return games
}

const text = (v) => (v && v.trim() ? v.trim() : null)
const num = (v) => (v && Number.isFinite(Number(v)) ? Number(v) : null)
const flag = (v) => String(v).toLowerCase() === 'true'
function date(v) {
  if (!v || v.startsWith('0001')) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/* ---------- Carátulas ---------- */

const key = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i
const COVERS_DIR = join(UPLOADS_DIR, 'videojuegos')

function walk(dir, visit) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, visit)
    else visit(path)
  }
}

// Índice de carátulas de una plataforma: nombre del fichero (sin "-01" ni extensión) -> ruta.
// LaunchBox nombra las imágenes con el título del juego, cambiando los caracteres que Windows no
// admite por "_": al comparar se ignoran todos los signos.
function coverIndex(platform) {
  const map = new Map()
  if (!imagesDir) return map
  const dir = readdirSync(imagesDir, { withFileTypes: true }).find((d) => d.isDirectory() && key(d.name) === key(platform))
  if (!dir) return map
  for (const sub of ['Box - Front', 'Box - Front - Reconstructed', 'Box - 3D', 'Fanart - Box - Front', 'Screenshot - Game Title']) {
    const base = join(imagesDir, dir.name, sub)
    if (!existsSync(base)) continue
    walk(base, (file) => {
      if (!IMAGE_EXT.test(file)) return
      const k = key(basename(file).replace(IMAGE_EXT, '').replace(/-\d{2,3}$/, ''))
      if (!map.has(k)) map.set(k, file)
    })
  }
  return map
}

function copyCover(file, id) {
  mkdirSync(COVERS_DIR, { recursive: true })
  const name = `${id}${extname(file).toLowerCase()}`
  const dest = join(COVERS_DIR, name)
  if (!existsSync(dest) || statSync(dest).size !== statSync(file).size) copyFileSync(file, dest)
  return `/uploads/videojuegos/${name}`
}

/* ---------- Importación ---------- */

const files = readdirSync(platformsDir).filter((f) => f.toLowerCase().endsWith('.xml')).sort()
console.log(`Plataformas en ${platformsDir}${withImages ? `, carátulas en ${imagesDir}` : ''}`)
const games = []
let covers = 0
let skipped = 0

for (const file of files) {
  const platformName = file.replace(/\.xml$/i, '')
  if (onlyPlatform && key(onlyPlatform) !== key(platformName)) continue
  const parsed = parseGames(readFileSync(join(platformsDir, file), 'utf8'))
  const index = withImages ? coverIndex(platformName) : new Map()
  let found = 0
  for (const g of parsed) {
    if (!text(g.Title) || !text(g.ID)) { skipped++; continue }
    const platform = text(g.Platform) || platformName
    const stars = num(g.StarRatingFloat) ?? num(g.StarRating)
    const cover = index.get(key(g.Title))
    if (cover) found++
    games.push({
      title: text(g.Title),
      creator: text(g.Developer) || '',
      year: num((g.ReleaseDate || '').slice(0, 4)) || num(g.ReleaseYear),
      rating: stars ? Math.min(10, Math.round(stars * 2)) : null,
      status: flag(g.Completed) ? 'done' : 'owned',
      notes: text(g.Notes) || '',
      cover_url: cover ? copyCover(cover, g.ID) : null,
      featured: flag(g.Favorite),
      hidden: flag(g.Hide),
      meta: {
        platform,
        genre: text(g.Genre),
        publisher: text(g.Publisher),
        region: text(g.Region),
        players: text(g.MaxPlayers),
        play_mode: text(g.PlayMode),
        esrb: text(g.Rating),
        series: text(g.Series),
        play_count: num(g.PlayCount) || 0,
        play_time: num(g.PlayTime) || 0,
        last_played: date(g.LastPlayedDate),
        community_rating: num(g.CommunityStarRating),
        database_id: num(g.DatabaseID),
        launchbox_id: g.ID,
        video: text(g.VideoUrl),
        source: 'launchbox',
      },
    })
  }
  covers += found
  console.log(`  ${platformName}: ${parsed.length} juegos${withImages ? `, ${found} con carátula` : ''}`)
}

if (!games.length) {
  console.error('No se ha encontrado ningún juego en esos XML. ¿Es esa la carpeta de LaunchBox (o su Data/Platforms)?')
  process.exit(1)
}
const counts = upsertAll('videogame', games, { key: VIDEOGAME_KEY })
report(`LaunchBox (${files.length} plataformas${withImages ? `, ${covers} carátulas copiadas a data/uploads/videojuegos/` : ', sin carátulas'}${skipped ? `, ${skipped} entradas sin título saltadas` : ''})`, counts, games.slice(0, 5))
