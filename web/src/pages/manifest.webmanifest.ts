import type { APIRoute } from 'astro';
import { ruta, traductor } from '../i18n';
import { sala } from '../lib/salas';
import { capturasApp } from '../lib/social';

/**
 * Manifiesto de la app (PWA): instalar La Malkevnia en el móvil o el escritorio.
 * Hay uno por idioma (/manifest.webmanifest y /en/manifest.webmanifest) con el mismo id,
 * así que es la misma app y abre en el idioma desde el que se instaló.
 */
export const GET: APIRoute = ({ locals }) => {
  const idioma = locals.idioma;
  const t = traductor(idioma);
  const atajo = (slug: string, icono: string) => {
    const s = sala(slug);
    return {
      name: t(s.nombre),
      short_name: t(s.nombre).split(' ')[0],
      description: t(s.resumen),
      url: ruta(idioma, s.ruta),
      icons: [{ src: `/iconos/atajo-${icono}.png`, sizes: '96x96', type: 'image/png' }],
    };
  };
  const manifiesto = {
    id: '/',
    name: 'La Malkevnia',
    short_name: 'Malkevnia',
    description: t('La web de Malkev convertida en nave espacial: la bitácora del capitán, juegos de mesa, cine, libros y un universo entero para explorar sin prisa.'),
    lang: idioma === 'en' ? 'en-GB' : 'es-ES',
    dir: 'ltr',
    start_url: ruta(idioma, '/'),
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#07050f',
    theme_color: '#07050f',
    categories: ['entertainment', 'lifestyle', 'books'],
    prefer_related_applications: false,
    launch_handler: { client_mode: ['navigate-existing', 'auto'] },
    icons: [
      { src: '/iconos/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/iconos/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/iconos/icono-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/iconos/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/iconos/icono-monocromo.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [atajo('nave', 'nave'), atajo('bitacora', 'bitacora'), atajo('plano', 'plano'), atajo('ordenador', 'ordenador')],
    screenshots: capturasApp().map((c) => ({ ...c, label: t('La Malkevnia por dentro') })),
  };
  return new Response(JSON.stringify(manifiesto, null, 2), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
