// Aplica en orden las migraciones de db/migrations que aún no estén aplicadas.
// Cada fichero va en su propia transacción y queda apuntado en schema_migrations.
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../server/db.js'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

export async function migrate({ log = console.log } = {}) {
  const client = await pool.connect()
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
    // Evita que dos procesos migren a la vez (p. ej. dos contenedores arrancando).
    await client.query('SELECT pg_advisory_lock(727274)')
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    let applied = 0
    for (const file of files) {
      if (done.has(file)) continue
      await client.query('BEGIN')
      try {
        await client.query(readFileSync(join(dir, file), 'utf8'))
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
        log(`  ✓ ${file}`)
        applied++
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`La migración ${file} falló: ${err.message}`)
      }
    }
    log(applied ? `${applied} migración(es) aplicada(s).` : 'La base de datos ya estaba al día.')
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {})
    client.release()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().then(() => pool.end()).catch((err) => { console.error(err.message); process.exit(1) })
}
