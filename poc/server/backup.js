// Copias de seguridad: SQLite escribe una copia coherente de la base de datos en un fichero nuevo,
// aunque el servidor esté en marcha (VACUUM INTO). Van a data/copias/.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { BACKUPS_DIR, db } from './db.js'

export function backupName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `malkevnia-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.db`
}

export function backup(file = join(BACKUPS_DIR, backupName())) {
  mkdirSync(BACKUPS_DIR, { recursive: true })
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  return file
}
