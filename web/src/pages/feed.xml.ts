import type { APIRoute } from 'astro';
import { listarEntradas } from '../lib/bitacora';

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

// Mantiene viva la URL del feed de Jekyll (jekyll-feed) para quien esté suscrito.
export const GET: APIRoute = async ({ site }) => {
  const base = site?.origin ?? 'https://malkevnia.com';
  const entradas = (await listarEntradas()).slice(0, 30);
  const items = entradas.map((e) => `
    <item>
      <title>${esc(e.titulo)}</title>
      <link>${base}/bitacora/${esc(e.slug)}</link>
      <guid isPermaLink="true">${base}/bitacora/${esc(e.slug)}</guid>
      <pubDate>${e.fecha.toUTCString()}</pubDate>
      <dc:creator>Malkev</dc:creator>${e.etiquetas.map((t) => `
      <category>${esc(t)}</category>`).join('')}
      <description>${esc(e.descripcion)}</description>
    </item>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
  <title>Bitácora de La Malkevnia</title>
  <link>${base}/bitacora</link>
  <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml"/>
  <description>Notas, pensamientos y comentarios de Malkev</description>
  <language>es</language>
  <image>
    <url>${base}/iconos/icono-192.png</url>
    <title>Bitácora de La Malkevnia</title>
    <link>${base}/bitacora</link>
  </image>${entradas[0] ? `
  <lastBuildDate>${entradas[0].fecha.toUTCString()}</lastBuildDate>` : ''}${items}
</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' } });
};
