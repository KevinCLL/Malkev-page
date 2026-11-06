// Aplica en orden las migraciones de db/migrations/*.sql que aún no se hayan aplicado.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('[migrate] sin DATABASE_URL: nada que migrar.');
  process.exit(0);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
const dir = join(import.meta.dirname, '..', 'db', 'migrations');

try {
  await sql`create table if not exists migraciones (nombre text primary key, aplicada_en timestamptz not null default now())`;
  const hechas = new Set((await sql`select nombre from migraciones`).map((r) => r.nombre));
  const ficheros = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of ficheros) {
    if (hechas.has(f)) continue;
    const contenido = await readFile(join(dir, f), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(contenido);
      await tx`insert into migraciones (nombre) values (${f})`;
    });
    console.log(`[migrate] aplicada ${f}`);
  }
  console.log('[migrate] base de datos al día.');
} finally {
  await sql.end();
}
