import postgres from 'postgres';
import { DATABASE_URL } from 'astro:env/server';

/**
 * Conexión a PostgreSQL. Es opcional: si no hay DATABASE_URL, `db` es null y cada
 * sala tira de su plan B (módulos en JSON o colección vacía). Así `npm run dev`
 * funciona sin levantar la base de datos.
 */
export const db = DATABASE_URL ? postgres(DATABASE_URL, { max: 5, idle_timeout: 30 }) : null;

export async function dbViva(): Promise<boolean> {
  if (!db) return false;
  try {
    await db`select 1`;
    return true;
  } catch {
    return false;
  }
}
