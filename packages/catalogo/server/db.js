// Conexión a PostgreSQL: un pool compartido y un par de ayudas para consultas y transacciones.
import pg from 'pg'

// bigint (ids, COUNT) llega como texto por defecto; aquí todos caben de sobra en un Number.
pg.types.setTypeParser(20, (v) => Number(v))
// Las fechas sin hora (date) se devuelven tal cual, "2026-11-06", sin convertir a zona horaria.
pg.types.setTypeParser(1082, (v) => v)

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://malkevnia:malkevnia@localhost:5432/malkevnia',
  max: Number(process.env.PG_POOL_MAX) || 10,
})

export const query = (text, params) => pool.query(text, params)
export const one = async (text, params) => (await pool.query(text, params)).rows[0] ?? null
export const many = async (text, params) => (await pool.query(text, params)).rows

// Ejecuta fn(client) dentro de una transacción; si lanza, se deshace todo.
export async function tx(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
