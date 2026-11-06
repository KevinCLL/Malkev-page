import type { APIRoute } from 'astro';
import { listarEntradas } from '../lib/bitacora';

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

// Mantiene viva la URL del feed de Jekyll (jekyll-feed) para quien esté suscrito.
export const GET: APIRoute = async ({ site }) => {
  const base = site?.origin ?? 'https://malkevnia.com';
  const items = (await listarEntradas()).slice(0, 30).map((e) => `
    <item>
      <title>${esc(e.titulo)}</title>
      <link>${base}/bitacora/${e.slug}</link>
      <guid>${base}/bitacora/${e.slug}</guid>
      <pubDate>${e.fecha.toUTCString()}</pubDate>
      <description>${esc(e.descripcion)}</description>
    </item>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Bitácora de La Malkevnia</title>
  <link>${base}/bitacora</link>
  <description>Notas, pensamientos y comentarios de Malkev</description>
  <language>es</language>${items}
</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
