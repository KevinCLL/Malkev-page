import type { APIRoute } from 'astro';
import { salas } from '../lib/salas';
import { listarEntradas } from '../lib/bitacora';

export const GET: APIRoute = async ({ site }) => {
  const base = site?.origin ?? 'https://malkevnia.com';
  const rutas = [
    ...salas.filter((s) => s.slug !== 'consola').map((s) => s.ruta),
    ...(await listarEntradas()).map((e) => `/bitacora/${e.slug}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rutas.map((r) => `<url><loc>${base}${r}</loc></url>`).join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
