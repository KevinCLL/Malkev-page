import type { APIRoute } from 'astro';
import { salas } from '../lib/salas';
import { listarEntradas } from '../lib/bitacora';
import { IDIOMAS, ruta } from '../i18n';

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Mapa del sitio. Cada sala está en español y en inglés, con sus alternativas hreflang;
 * las entradas de la bitácora solo existen en español (con su fecha).
 */
export const GET: APIRoute = async ({ site }) => {
  const base = site?.origin ?? 'https://malkevnia.com';
  const abs = (r: string) => esc(`${base}${encodeURI(r)}`);
  const alternativas = (r: string) =>
    [...IDIOMAS.map((i) => `<xhtml:link rel="alternate" hreflang="${i}" href="${abs(ruta(i, r))}"/>`), `<xhtml:link rel="alternate" hreflang="x-default" href="${abs(r)}"/>`].join('');
  const urlsSalas = salas
    .filter((s) => s.slug !== 'consola')
    .flatMap((s) => IDIOMAS.map((i) => `<url><loc>${abs(ruta(i, s.ruta))}</loc>${alternativas(s.ruta)}</url>`));
  const urlsEntradas = (await listarEntradas()).map(
    (e) => `<url><loc>${abs(`/bitacora/${e.slug}`)}</loc><lastmod>${e.fecha.toISOString().slice(0, 10)}</lastmod></url>`,
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[...urlsSalas, ...urlsEntradas].join('\n')}
</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
