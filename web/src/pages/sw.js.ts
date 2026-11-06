import type { APIRoute } from 'astro';
import fuente from '../pwa/sw.js?raw';

/**
 * Service worker en /sw.js (alcance: toda la web). Lleva la versión del build, así que
 * cada despliegue lo renueva y vacía las cachés de la versión anterior.
 *
 * Interruptor de emergencia: con la variable de entorno PWA=off se sirve uno que borra
 * sus cachés y se da de baja solo en cuanto los navegadores lo vuelven a pedir.
 */
const VERSION = import.meta.env.VERSION_NAVE ?? 'dev';
const PRECARGA = ['/', '/en/', '/sin-conexion', '/en/sin-conexion', '/favicon.svg', '/iconos/icono-192.png'];

const codigo = fuente.replace("'__VERSION__'", JSON.stringify(VERSION)).replace('/* __PRECARGA__ */ []', JSON.stringify(PRECARGA));

const baja = `// La Malkevnia: modo sin conexión desactivado (PWA=off).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const n of await caches.keys()) if (n.startsWith('malkevnia-')) await caches.delete(n);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));
`;

export const GET: APIRoute = () =>
  new Response(process.env.PWA === 'off' ? baja : codigo, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      // Siempre se comprueba si hay versión nueva.
      'Cache-Control': 'no-cache, max-age=0',
      'Service-Worker-Allowed': '/',
    },
  });
