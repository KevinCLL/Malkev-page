// La lista de manga (y manhwa, manhua, novela ligera) de un usuario de AniList, por su API pública.
import { crearFicha } from '../lib/modelo.js'

const QUERY = `query ($name: String) {
  MediaListCollection(userName: $name, type: MANGA) {
    lists { name entries {
      score(format: POINT_10) progress progressVolumes status notes
      completedAt { year month day }
      media { id title { romaji english native } format countryOfOrigin chapters volumes genres description(asHtml: false)
        startDate { year } coverImage { extraLarge large color }
        staff(perPage: 3, sort: RELEVANCE) { edges { role node { name { full } } } } }
    } }
  }
}`
const STATUS = { COMPLETED: 'done', CURRENT: 'reading', REPEATING: 'reading', PLANNING: 'wishlist', PAUSED: 'paused', DROPPED: 'dropped' }
const ORIGIN = { JP: 'manga', KR: 'manhwa', CN: 'manhua', TW: 'manhua' }

export async function leerAnilist(usuario) {
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { name: usuario } }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.errors) throw new Error(`AniList: ${data.errors?.map((e) => e.message).join('; ') || res.status}`)
  const vistos = new Set()
  const out = []
  for (const list of data.data.MediaListCollection.lists) {
    for (const e of list.entries) {
      const m = e.media
      if (vistos.has(m.id)) continue
      vistos.add(m.id)
      const autor = m.staff.edges.find((s) => /story/i.test(s.role)) || m.staff.edges[0]
      const c = e.completedAt
      out.push(crearFicha({
        kind: 'manga',
        title: m.title.english || m.title.romaji || m.title.native,
        original_title: m.title.native || null,
        creator: autor?.node.name.full || '',
        year: m.startDate?.year,
        rating: e.score || null,
        status: STATUS[e.status] || 'owned',
        notes: e.notes || '',
        synopsis: m.description ? m.description.replace(/<[^>]+>/g, '').trim() : null,
        cover_url: m.coverImage?.extraLarge || m.coverImage?.large || null,
        color: m.coverImage?.color || null,
        genres: m.genres || [],
        details: {
          volumes_owned: e.progressVolumes || null,
          volumes_total: m.volumes || null,
          chapters: m.chapters || null,
          chapters_read: e.progress || null,
          origin: ORIGIN[m.countryOfOrigin] || 'manga',
          format: m.format === 'NOVEL' ? 'novela ligera' : m.format === 'ONE_SHOT' ? 'one-shot' : null,
          title_romaji: m.title.romaji || null,
          anilist_list: list.name,
        },
        external_ids: { anilist: m.id },
        finished_on: c?.year ? `${c.year}-${String(c.month || 1).padStart(2, '0')}-${String(c.day || 1).padStart(2, '0')}` : null,
        sources: ['anilist'],
      }))
    }
  }
  return out
}
