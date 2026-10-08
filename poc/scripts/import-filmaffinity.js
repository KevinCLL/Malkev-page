// Importa las valoraciones de Filmaffinity, que no tiene API ni exportación.
// Dos formas:
//   npm run import:filmaffinity -- 700344            descarga las páginas de valoraciones del usuario
//   npm run import:filmaffinity -- carpeta/           lee páginas guardadas con Ctrl+S (HTML) de esa carpeta
// Filmaffinity cambia su HTML de vez en cuando y bloquea a quien descarga deprisa: si falla la descarga,
// la carpeta con las páginas guardadas es el camino seguro. El script enseña una muestra de lo leído.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { decode, upsertAll, report } from './lib/import.js'

const arg = process.argv[2]
if (!arg) {
  console.error('Falta el usuario o la carpeta. Uso: npm run import:filmaffinity -- 700344  |  -- carpeta-con-html/')
  process.exit(1)
}

const pages = []
if (/^\d+$/.test(arg)) {
  for (let p = 1; p <= 200; p++) {
    const url = `https://www.filmaffinity.com/es/userratings.php?user_id=${arg}&p=${p}&orderby=4`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Malkevnia POC; importación personal)', 'Accept-Language': 'es' } })
    if (res.status === 404) break
    if (!res.ok) {
      console.error(`Filmaffinity ha respondido ${res.status} en la página ${p}. Guarda las páginas con Ctrl+S y pásame la carpeta.`)
      break
    }
    const html = await res.text()
    if (!/film\d+\.html/.test(html)) break
    pages.push(html)
    process.stdout.write(`  página ${p}\r`)
    await new Promise((r) => setTimeout(r, 1500))
  }
} else {
  const files = statSync(arg).isDirectory() ? readdirSync(arg).filter((f) => /\.html?$/i.test(f)).map((f) => join(arg, f)) : [arg]
  for (const f of files) pages.push(readFileSync(f, 'utf8'))
}

// Cada ficha empieza en el enlace a la película (…/es/filmNNNNNN.html) y acaba en el siguiente.
const films = new Map()
for (const html of pages) {
  const anchors = [...html.matchAll(/<a[^>]+href="(?:https?:\/\/www\.filmaffinity\.com)?\/es\/film(\d+)\.html"[^>]*>([\s\S]*?)<\/a>/g)]
  // El cartel va en un enlace sin texto justo antes del título: la ficha empieza en el primero de los dos.
  const firstAnchor = new Map()
  for (let i = 0; i < anchors.length; i++) {
    const [, id, inner] = anchors[i]
    if (!firstAnchor.has(id)) firstAnchor.set(id, anchors[i].index)
    const title = decode(inner)
    if (!title || films.has(id)) continue
    const start = firstAnchor.get(id)
    const end = anchors[i + 1]?.index ?? html.length
    const chunk = html.slice(start, end)
    // Nota del usuario: la clase lleva "rat" (ur-mr-rat, user-rat…); si no, un número solo de 1 a 10.
    const rating = Number(chunk.match(/class="[^"]*(?:user-?rat|ur-mr-rat)[^"]*"[^>]*>\s*(\d{1,2})\s*</)?.[1])
      || Number(chunk.match(/>\s*(10|[1-9])\s*<\/(?:div|span)>/)?.[1]) || null
    const year = Number(chunk.match(/class="[^"]*year[^"]*"[^>]*>\s*\(?(\d{4})\)?/)?.[1] || chunk.match(/\((\d{4})\)/)?.[1]) || null
    const director = decode(chunk.match(/class="[^"]*director[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/)?.[1] || '')
    const poster = chunk.match(/<img[^>]+src="([^"]+\.(?:jpg|jpeg|webp))"/)?.[1] || null
    const kind = /\((?:Mini)?serie de TV\)/i.test(title) ? 'series' : 'film'
    films.set(id, {
      kind,
      title: title.replace(/\s*\((?:Mini)?serie de TV\)|\s*\(C\)|\s*\(TV\)/gi, '').trim(),
      creator: director,
      year,
      rating,
      status: 'done',
      cover_url: poster,
      meta: { filmaffinity_id: Number(id), seen: true, source: 'filmaffinity' },
    })
  }
}

const list = [...films.values()]
if (!list.length) {
  console.error('No he encontrado ninguna película en esas páginas.')
  process.exit(1)
}
const counts = { added: 0, updated: 0 }
for (const kind of ['film', 'series']) {
  const c = upsertAll(kind, list.filter((f) => f.kind === kind))
  counts.added += c.added
  counts.updated += c.updated
}
report(`Filmaffinity (${pages.length} páginas)`, counts, list.slice(0, 6))
