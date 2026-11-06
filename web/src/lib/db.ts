import postgres from 'postgres';

/**
 * Conexión a PostgreSQL. Es opcional: si no hay DATABASE_URL, `db` es null y cada
 * sala tira de su plan B (módulos en JSON o colección vacía). Así `npm run dev`
 * funciona sin levantar la base de datos.
 */
const url = process.env.DATABASE_URL ?? import.meta.env.DATABASE_URL;

export const db = url ? postgres(url, { max: 5, idle_timeout: 30 }) : null;

export async function dbViva(): Promise<boolean> {
  if (!db) return false;
  try {
    await db`select 1`;
    return true;
  } catch {
    return false;
  }
}
