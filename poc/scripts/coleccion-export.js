// Exporta la colección importada (pelis, series, libros, manga) a poc/coleccion.json.
// Uso: npm run coleccion:export
import { COLECCION, exportColeccion } from './lib/coleccion.js'

const items = exportColeccion()
const count = {}
for (const it of items) count[it.kind] = (count[it.kind] || 0) + 1
console.log(`✦ ${items.length} objetos exportados a ${COLECCION}: ${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(', ') || 'nada todavía'}.`)
