// Copia de seguridad de la base de datos (data/copias/malkevnia-fecha.db). Se puede hacer con el
// servidor en marcha. Uso: npm run copia [-- otra/ruta.db]
import { backup } from '../server/backup.js'

const file = backup(process.argv[2])
console.log(`✦ Copia guardada en ${file}`)
