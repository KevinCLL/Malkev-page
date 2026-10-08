// Importa la lista de manga de AniList (manga, manhwa, manhua y novelas) usando su API pública.
// Uso: npm run import:anilist -- Malkev
import { upsertAll, report } from './lib/import.js'

const user = process.argv[2] || 'Malkev'

const QUERY = `
query ($name: String) {
  MediaListCollection(userName: $name, type: MANGA) {
    lists {
      name
      entries {
        score(format: POINT_10)
        progress
        progressVolumes
        status
        notes
        media {
          id
          title { romaji english native }
          format
          countryOfOrigin
          chapters
          volumes
          startDate { year }
          coverImage { large color }
          staff(perPage: 3, sort: RELEVANCE) { edges { role node { name { full } } } }
        }
      }
    }
  }
}`

const STATUS = { COMPLETED: 'done', CURRENT: 'reading', REPEATING: 'reading', PLANNING: 'wishlist', PAUSED: 'owned', DROPPED: 'owned' }
const ORIGIN = { JP: 'manga', KR: 'manhwa', CN: 'manhua', TW: 'manhua' }

const res = await fetch('https://graphql.anilist.co', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ query: QUERY, variables: { name: user } }),
})
if (!res.ok) {
  console.error(`AniList ha respondido ${res.status}: ${(await res.text()).slice(0, 200)}`)
  process.exit(1)
}
const data = await res.json()
if (data.errors) {
  console.error('AniList:', data.errors.map((e) => e.message).join('; '))
  process.exit(1)
}

const seen = new Set()
const manga = []
for (const list of data.data.MediaListCollection.lists) {
  for (const e of list.entries) {
    const m = e.media
    if (seen.has(m.id)) continue
    seen.add(m.id)
    const author = m.staff.edges.find((s) => /story/i.test(s.role)) || m.staff.edges[0]
    manga.push({
      title: m.title.english || m.title.romaji || m.title.native,
      creator: author?.node.name.full || '',
      year: m.startDate?.year || null,
      rating: e.score || null,
      status: STATUS[e.status] || 'owned',
      notes: e.notes || '',
      cover_url: m.coverImage?.large || null,
      color: m.coverImage?.color || null,
      meta: {
        volumes_owned: e.progressVolumes || null,
        volumes_total: m.volumes || null,
        chapters: m.chapters || null,
        chapters_read: e.progress || null,
        origin: ORIGIN[m.countryOfOrigin] || 'manga',
        format: m.format === 'NOVEL' ? 'novela ligera' : m.format === 'ONE_SHOT' ? 'one-shot' : null,
        title_native: m.title.native || null,
        anilist_id: m.id,
        anilist_list: list.name,
        source: 'anilist',
      },
    })
  }
}

report(`AniList (${user})`, upsertAll('manga', manga), manga.slice(0, 5))
