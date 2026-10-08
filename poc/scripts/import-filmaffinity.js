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

// Cada ficha es un bloque <div class="row movie-card …" data-movie-id="NNN">; la nota del usuario
// va en .fa-user-rat-box, a continuación de la tarjeta, así que el bloque llega hasta la ficha siguiente.
function parsePage(html) {
  const starts = [...html.matchAll(/<div class="row movie-card[^"]*" data-movie-id="(\d+)"/g)]
  return starts.map((m, i) => {
    const chunk = html.slice(m.index, starts[i + 1]?.index ?? html.length)
    const title = decode(chunk.match(/class="fs-6 mc-title">\s*<a[^>]*>([\s\S]*?)<\/a>/)?.[1] || '')
    const type = decode(chunk.match(/<span class="type">([^<]+)<\/span>/)?.[1] || '')
    const alt = chunk.match(/<img[^>]+data-srcset="[^"]*"[^>]*alt="([^"]*)"/)?.[1] || ''
    const srcset = chunk.match(/data-srcset="([^"]+)"/)?.[1] || ''
    const poster = srcset.match(/(\S+-large\.jpg)/)?.[1] || srcset.match(/(https:\S+\.jpg)/)?.[1] || null
    // Directores; en las series, solo los creadores (marcados con «(Creador)») si los hay.
    const credits = chunk.match(/class="mt-2 mc-director">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] || ''
    const names = [...credits.matchAll(/<span class="nb">([\s\S]*?)<\/span>/g)].map((n) => n[1])
    const creators = names.filter((n) => /\(Creador\)/.test(n))
    const director = (creators.length ? creators : names.slice(0, 2)).map((n) => decode(n.replace(/<i>[\s\S]*?<\/i>/g, '')).replace(/,$/, '').trim()).join(', ')
    const rating = Number(chunk.match(/class="fa-user-rat-box[^"]*">\s*(\d{1,2})\s*</)?.[1]) || null
    const series = /serie/i.test(type) || /\((?:Mini)?serie de TV\)/i.test(alt)
    return {
      id: m[1],
      kind: series ? 'series' : 'film',
      title: title.replace(/\s*\((?:Mini)?serie de TV\)|\s*\(C\)|\s*\(TV\)/gi, '').trim(),
      creator: director,
      year: Number(chunk.match(/class="mc-year[^"]*">\s*(\d{4})/)?.[1]) || null,
      rating,
      status: 'done',
      cover_url: poster,
      meta: { filmaffinity_id: Number(m[1]), type: type || null, seen: true, source: 'filmaffinity' },
    }
  }).filter((f) => f.title)
}

const films = new Map()
const add = (list) => {
  let fresh = 0
  for (const f of list) if (!films.has(f.id)) { films.set(f.id, f); fresh++ }
  return fresh
}
let pageCount = 0
if (/^\d+$/.test(arg)) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    'Accept-Language': 'es-ES,es;q=0.9',
    Accept: 'text/html,application/xhtml+xml',
  }
  for (let p = 1; p <= 500; p++) {
    // chv=list: la vista de lista trae director y tipo; sin ella Filmaffinity redirige a la cuadrícula.
    const url = `https://www.filmaffinity.com/es/userratings.php?user_id=${arg}&p=${p}&orderby=4&chv=list`
    const res = await fetch(url, { headers })
    if (res.status === 404) break
    if (!res.ok) {
      console.error(`Filmaffinity ha respondido ${res.status} en la página ${p}. Guarda las páginas con Ctrl+S y pásame la carpeta.`)
      break
    }
    // Pasada la última página, devuelve una vacía o repite la última: en ambos casos no hay nada nuevo.
    if (!add(parsePage(await res.text()))) break
    pageCount++
    process.stdout.write(`  página ${p} (${films.size})\r`)
    await new Promise((r) => setTimeout(r, 2000))
  }
} else {
  const files = statSync(arg).isDirectory() ? readdirSync(arg).filter((f) => /\.html?$/i.test(f)).map((f) => join(arg, f)) : [arg]
  for (const f of files) { add(parsePage(readFileSync(f, 'utf8'))); pageCount++ }
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
report(`Filmaffinity (${pageCount} páginas: ${list.filter((f) => f.kind === 'film').length} pelis, ${list.filter((f) => f.kind === 'series').length} series)`, counts, list.slice(0, 6))
