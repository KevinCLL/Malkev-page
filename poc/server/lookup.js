// Autocompletado al añadir cosas a la colección: buscas por título y se rellenan los datos.
// Open Library y AniList no necesitan clave. TMDB necesita TMDB_API_KEY y BGG puede pedir BGG_TOKEN.

const TIMEOUT_MS = 8000

async function getJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${new URL(url).host} respondió ${res.status}`)
  return res.json()
}

async function books(q) {
  const data = await getJson(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8&fields=title,author_name,first_publish_year,cover_i,number_of_pages_median,key`
  )
  return (data.docs || []).map((d) => ({
    title: d.title,
    creator: (d.author_name || [])[0] || '',
    year: d.first_publish_year || null,
    cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
    meta: { pages: d.number_of_pages_median || null, openlibrary: d.key },
  }))
}

async function manga(q) {
  const query = `query ($q: String) {
    Page(perPage: 8) {
      media(search: $q, type: MANGA) {
        id title { romaji english } startDate { year } volumes
        coverImage { large color }
        staff(perPage: 1, sort: RELEVANCE) { nodes { name { full } } }
      }
    }
  }`
  const data = await getJson('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { q } }),
  })
  return (data.data?.Page?.media || []).map((m) => ({
    title: m.title.english || m.title.romaji,
    creator: m.staff?.nodes?.[0]?.name?.full || '',
    year: m.startDate?.year || null,
    cover_url: m.coverImage?.large || null,
    color: m.coverImage?.color || null,
    meta: { volumes_total: m.volumes || null, anilist: m.id },
  }))
}

async function tmdb(kind, q) {
  const key = process.env.TMDB_API_KEY
  if (!key) {
    const err = new Error('Para buscar pelis y series hace falta una clave gratuita de TMDB en TMDB_API_KEY.')
    err.status = 503
    throw err
  }
  const type = kind === 'series' ? 'tv' : 'movie'
  // Admite tanto la clave v3 como el token v4 (que empieza por "eyJ").
  const isBearer = key.startsWith('eyJ')
  const url = `https://api.themoviedb.org/3/search/${type}?query=${encodeURIComponent(q)}&language=es-ES${isBearer ? '' : `&api_key=${key}`}`
  const data = await getJson(url, isBearer ? { headers: { Authorization: `Bearer ${key}` } } : {})
  return (data.results || []).slice(0, 8).map((r) => ({
    title: r.title || r.name,
    creator: '',
    year: Number((r.release_date || r.first_air_date || '').slice(0, 4)) || null,
    cover_url: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : null,
    meta: { tmdb: r.id, overview: r.overview || '' },
  }))
}

function xmlAttr(xml, tag, attr = 'value') {
  const m = xml.match(new RegExp(`<${tag}[^>]*\\b${attr}="([^"]*)"`))
  return m ? decodeXml(m[1]) : null
}

function decodeXml(s) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

async function boardgames(q) {
  const headers = process.env.BGG_TOKEN ? { Authorization: `Bearer ${process.env.BGG_TOKEN}` } : {}
  const get = async (url) => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (res.status === 401 || res.status === 403) {
      const err = new Error('BoardGameGeek pide un token de aplicación: ponlo en BGG_TOKEN.')
      err.status = 503
      throw err
    }
    if (!res.ok) throw new Error(`boardgamegeek.com respondió ${res.status}`)
    return res.text()
  }
  const search = await get(`https://boardgamegeek.com/xmlapi2/search?type=boardgame&query=${encodeURIComponent(q)}`)
  const ids = [...search.matchAll(/<item[^>]*id="(\d+)"/g)].map((m) => m[1]).slice(0, 8)
  if (!ids.length) return []
  const things = await get(`https://boardgamegeek.com/xmlapi2/thing?id=${ids.join(',')}`)
  return things.split('</item>').filter((chunk) => chunk.includes('<item')).map((chunk) => {
    const image = chunk.match(/<image>([^<]*)<\/image>/)
    const designer = chunk.match(/<link type="boardgamedesigner"[^>]*value="([^"]*)"/)
    return {
      title: xmlAttr(chunk, 'name type="primary"'),
      creator: designer ? decodeXml(designer[1]) : '',
      year: Number(xmlAttr(chunk, 'yearpublished')) || null,
      cover_url: image ? image[1].trim() : null,
      meta: {
        players: `${xmlAttr(chunk, 'minplayers')}-${xmlAttr(chunk, 'maxplayers')}`,
        minutes: Number(xmlAttr(chunk, 'playingtime')) || null,
        bgg: Number(chunk.match(/<item[^>]*id="(\d+)"/)?.[1]) || null,
      },
    }
  })
}

export async function lookup(kind, q) {
  switch (kind) {
    case 'book': return books(q)
    case 'manga': return manga(q)
    case 'film':
    case 'series': return tmdb(kind, q)
    case 'boardgame': return boardgames(q)
    default: {
      const err = new Error(`Tipo desconocido: ${kind}`)
      err.status = 400
      throw err
    }
  }
}
