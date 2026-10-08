// Prepara la demo publicable: copia la base de datos local a src/demo/snapshot.json
// y apunta qué ficheros de ../assets necesita (src/demo/assets.json).
import { writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '../server/db.js'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = join(here, '..', '..')
const assets = new Set()

function fixHtml(html) {
  return String(html || '')
    // Los vídeos de YouTube no se pueden incrustar en la demo: se cambian por un enlace.
    .replace(/<div class="video-embed">\s*<iframe[^>]*src="https:\/\/www\.youtube\.com\/embed\/([\w-]+)[^"]*"[^>]*><\/iframe>\s*<\/div>/g,
      '<p><a class="video-link" href="https://www.youtube.com/watch?v=$1" target="_blank" rel="noopener noreferrer">▶ Ver el vídeo en YouTube</a></p>')
    // Los PDF se abren en la web actual.
    .replace(/(href|src)="\/assets\/pdf\//g, '$1="https://malkevnia.com/assets/pdf/')
    // Imágenes y audios propios: rutas relativas a la página publicada.
    .replace(/(src|href)="\/assets\/([^"]+)"/g, (_, attr, path) => {
      assets.add(path)
      return `${attr}="assets/${path}"`
    })
    // Enlaces internos del blog: rutas de la demo.
    .replace(/href="\/(?!\/)([^"]*)"/g, 'href="#/$1"')
}

function fixUrl(url) {
  if (!url || !url.startsWith('/assets/')) return url
  assets.add(url.slice('/assets/'.length))
  return url.slice(1)
}

const tagsFor = db.prepare('SELECT t.name FROM tags t JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = ? ORDER BY t.name')
const posts = db.prepare('SELECT * FROM posts ORDER BY id').all().map((p) => ({
  ...p,
  content_html: fixHtml(p.content_html),
  cover: fixUrl(p.cover),
  tags: tagsFor.all(p.id).map((r) => r.name),
}))
const comments = db.prepare('SELECT * FROM comments ORDER BY id').all().map((c) => ({ ...c }))
const items = db.prepare('SELECT * FROM items ORDER BY id').all().map((i) => ({
  ...i,
  featured: !!i.featured,
  hidden: !!i.hidden,
  meta: JSON.parse(i.meta || '{}'),
}))

const furniture = db.prepare('SELECT * FROM furniture ORDER BY position, id').all()
  .map((f) => ({ ...f, layout: JSON.parse(f.layout || '{}') }))

const missing = [...assets].filter((a) => !existsSync(join(REPO, 'assets', decodeURI(a))))
writeFileSync(join(here, '..', 'src', 'demo', 'snapshot.json'), JSON.stringify({ posts, comments, items, furniture }))
writeFileSync(join(here, '..', 'src', 'demo', 'assets.json'), JSON.stringify([...assets].filter((a) => !missing.includes(a)), null, 1))
console.log(`✦ Demo: ${posts.length} entradas, ${items.length} objetos, ${assets.size - missing.length} ficheros de assets${missing.length ? ` (${missing.length} no encontrados)` : ''}.`)
