// Las valoraciones de Filmaffinity, que no tiene API ni exportación: se leen las páginas de
// https://www.filmaffinity.com/es/userratings.php?user_id=ID&p=N&orderby=4&chv=list
// guardadas con Ctrl+S (una carpeta de .html) o descargadas por el propio script (puede dar 403).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { crearFicha } from '../lib/modelo.js'
import { decode } from '../lib/texto.js'

// Cada ficha es un <div class="row movie-card …" data-movie-id="NNN">; la nota del usuario va en
// .fa-user-rat-box a continuación, así que el bloque llega hasta la ficha siguiente.
export function parsePagina(html) {
  const starts = [...html.matchAll(/<div class="row movie-card[^"]*" data-movie-id="(\d+)"/g)]
  return starts
    .map((m, i) => {
      const chunk = html.slice(m.index, starts[i + 1]?.index ?? html.length)
      const title = decode(chunk.match(/class="fs-6 mc-title">\s*<a[^>]*>([\s\S]*?)<\/a>/)?.[1] || '')
      if (!title) return null
      const type = decode(chunk.match(/<span class="type">([^<]+)<\/span>/)?.[1] || '')
      const alt = chunk.match(/<img[^>]+data-srcset="[^"]*"[^>]*alt="([^"]*)"/)?.[1] || ''
      const srcset = chunk.match(/data-srcset="([^"]+)"/)?.[1] || ''
      const poster = srcset.match(/(\S+-large\.jpg)/)?.[1] || srcset.match(/(https:\S+\.jpg)/)?.[1] || null
      const credits = chunk.match(/class="mt-2 mc-director">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] || ''
      const names = [...credits.matchAll(/<span class="nb">([\s\S]*?)<\/span>/g)].map((n) => n[1])
      const creators = names.filter((n) => /\(Creador\)/.test(n))
      const creator = (creators.length ? creators : names.slice(0, 2))
        .map((n) => decode(n.replace(/<i>[\s\S]*?<\/i>/g, '')).replace(/,$/, '').replace(/\s*\(Creador\)/, '').trim())
        .join(', ')
      const series = /serie/i.test(type) || /\((?:Mini)?serie de TV\)/i.test(alt + title)
      return crearFicha({
        kind: series ? 'series' : 'film',
        title: title.replace(/\s*\((?:Mini)?serie de TV\)|\s*\(C\)|\s*\(TV\)/gi, '').trim(),
        creator,
        year: Number(chunk.match(/class="mc-year[^"]*">\s*(\d{4})/)?.[1]) || null,
        rating: Number(chunk.match(/class="fa-user-rat-box[^"]*">\s*(\d{1,2})\s*</)?.[1]) || null,
        status: 'done',
        cover_url: poster,
        details: type ? { type } : {},
        external_ids: { filmaffinity: Number(m[1]) },
        sources: ['filmaffinity'],
      })
    })
    .filter(Boolean)
}

export async function leerFilmaffinity(arg, { log = console.error } = {}) {
  const fichas = new Map()
  const add = (list) => {
    let nuevas = 0
    for (const f of list) if (!fichas.has(f.external_ids.filmaffinity)) { fichas.set(f.external_ids.filmaffinity, f); nuevas++ }
    return nuevas
  }
  if (/^\d+$/.test(arg)) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9',
      Accept: 'text/html,application/xhtml+xml',
    }
    for (let p = 1; p <= 500; p++) {
      const res = await fetch(`https://www.filmaffinity.com/es/userratings.php?user_id=${arg}&p=${p}&orderby=4&chv=list`, { headers })
      if (res.status === 404) break
      if (!res.ok) { log(`Filmaffinity ha respondido ${res.status} en la página ${p}: guarda las páginas con Ctrl+S y pasa la carpeta.`); break }
      if (!add(parsePagina(await res.text()))) break
      await new Promise((r) => setTimeout(r, 2000))
    }
  } else {
    const files = statSync(arg).isDirectory() ? readdirSync(arg).filter((f) => /\.html?$/i.test(f)).map((f) => join(arg, f)) : [arg]
    for (const f of files) add(parsePagina(readFileSync(f, 'utf8')))
  }
  return [...fichas.values()]
}
