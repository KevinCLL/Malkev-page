// Carga la bitácora en PostgreSQL desde el módulo modulos/bitacora/posts.json.
// Es idempotente: actualiza por slug, así que se puede repetir sin duplicar.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[seed] falta DATABASE_URL');
  process.exit(1);
}
const dirModulos = process.env.MODULOS_DIR ?? join(import.meta.dirname, '..', 'modulos');
const { posts } = JSON.parse(await readFile(join(dirModulos, 'bitacora', 'posts.json'), 'utf8'));
const sql = postgres(url, { max: 1 });

const fecha = (p) => new Date(p.datetime ? p.datetime.replace(/^(\S+) (\S+) ([+-]\d{2})(\d{2})$/, '$1T$2$3:$4') : p.date);

try {
  for (const p of posts) {
    await sql`
      insert into entradas (slug, titulo, descripcion, html, etiquetas, portada, minutos, url_antigua, publicado_en)
      values (${p.id}, ${p.title}, ${p.description ?? ''}, ${p.html}, ${p.tags ?? []}, ${p.cover ?? null},
              ${p.readingMinutes ?? null}, ${p.url ?? null}, ${fecha(p)})
      on conflict (slug) do update set
        titulo = excluded.titulo, descripcion = excluded.descripcion, html = excluded.html,
        etiquetas = excluded.etiquetas, portada = excluded.portada, minutos = excluded.minutos,
        url_antigua = excluded.url_antigua, publicado_en = excluded.publicado_en, actualizado_en = now()`;
  }
  console.log(`[seed] ${posts.length} entradas cargadas en la bitácora.`);
} finally {
  await sql.end();
}
