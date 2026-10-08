// Carga poc/coleccion.json (o el fichero que se indique) en la base de datos local.
// Uso: npm run coleccion:import [-- otro/fichero.json]
import { COLECCION, importColeccion } from './lib/coleccion.js'

const file = process.argv[2] || COLECCION
const result = importColeccion(file)
if (!result) {
  console.error(`No existe ${file}. Primero importa en un sitio con red y ejecuta npm run coleccion:export.`)
  process.exit(1)
}
for (const [kind, c] of Object.entries(result)) console.log(`✦ ${kind}: ${c.added} nuevos, ${c.updated} actualizados.`)
