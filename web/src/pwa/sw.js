/*
 * La Malkevnia · service worker (lo sirve src/pages/sw.js.ts con la versión del build).
 *
 * - Páginas: red primero; sin red, la copia guardada o la página "sin conexión".
 * - Módulos de la nave (/modulos: HTML, JS, texturas, datos), /_astro e iconos: caché primero.
 *   Solo cambian al desplegar, y cada despliegue trae otra VERSION que vacía estas cachés.
 * - three.js (jsDelivr) y las fuentes de Google: caché primero (URL con versión), se conservan.
 * - Imágenes de la bitácora (/assets): caché primero, con límite.
 * - API, administración, RSS, sitemap y peticiones con Range (audio y vídeo): siempre a la red.
 */
const VERSION = '__VERSION__';
const PREFIJO = 'malkevnia-';
const CACHE = {
  base: `${PREFIJO}base-${VERSION}`,
  paginas: `${PREFIJO}paginas-${VERSION}`,
  estaticos: `${PREFIJO}estaticos-${VERSION}`,
  modulos: `${PREFIJO}modulos-${VERSION}`,
  externos: `${PREFIJO}externos`,
  imagenes: `${PREFIJO}imagenes`,
};
const LIMITE = { paginas: 60, estaticos: 300, modulos: 500, externos: 150, imagenes: 150 };
const PRECARGA = /* __PRECARGA__ */ [];
const SOLO_RED = /^\/(?:api|admin|consola)(?:\/|$)|^\/(?:feed\.xml|sitemap\.xml|sw\.js|robots\.txt)$/;
const ESTATICOS = /^\/(?:_astro\/|iconos\/|favicon\.(?:ico|svg)$|apple-touch-icon\.png$|(?:en\/)?manifest\.webmanifest$)/;
const EXTERNOS = /^https:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const base = await caches.open(CACHE.base);
      const estaticos = await caches.open(CACHE.estaticos);
      await Promise.all(
        PRECARGA.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'reload' });
            if (!res.ok) return;
            await base.put(url, res.clone());
            // El CSS y el JS de Astro que usan estas páginas, para que se vean bien sin red.
            if ((res.headers.get('content-type') || '').includes('text/html')) {
              const recursos = new Set((await res.text()).match(/\/_astro\/[^"'\s)>]+/g) || []);
              await Promise.all([...recursos].map((r) => estaticos.add(r).catch(() => {})));
            }
          } catch {
            /* sin red al instalar: se guardará en la próxima visita */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const vigentes = new Set(Object.values(CACHE));
      for (const nombre of await caches.keys()) {
        if (nombre.startsWith(PREFIJO) && !vigentes.has(nombre)) await caches.delete(nombre);
      }
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.tipo === 'version') event.source?.postMessage({ tipo: 'version', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (SOLO_RED.test(url.pathname)) return;
    if (url.pathname.startsWith('/modulos/')) return event.respondWith(cachePrimero(event, CACHE.modulos, LIMITE.modulos));
    if (req.mode === 'navigate') return event.respondWith(pagina(event));
    if (ESTATICOS.test(url.pathname)) return event.respondWith(cachePrimero(event, CACHE.estaticos, LIMITE.estaticos));
    if (url.pathname.startsWith('/assets/')) return event.respondWith(cachePrimero(event, CACHE.imagenes, LIMITE.imagenes));
    return;
  }
  if (EXTERNOS.test(req.url)) {
    // La hoja de estilos de Google Fonts cambia de vez en cuando: se sirve la guardada y se renueva.
    if (url.hostname === 'fonts.googleapis.com') return event.respondWith(revalidar(event, CACHE.externos));
    return event.respondWith(cachePrimero(event, CACHE.externos, LIMITE.externos));
  }
});

/** Páginas de la web: red primero (con la precarga de navegación), copia guardada si no hay red. */
async function pagina(event) {
  const req = event.request;
  try {
    const res = (await event.preloadResponse) || (await fetch(req));
    if (res.ok && res.type === 'basic' && !res.redirected) {
      const cache = await caches.open(CACHE.paginas);
      event.waitUntil(cache.put(req, res.clone()).then(() => recortar(CACHE.paginas, LIMITE.paginas)));
    }
    return res;
  } catch {
    return (await caches.match(req)) || sinConexion(req);
  }
}

/** Caché primero; si no está, de la red (y se guarda). */
async function cachePrimero(event, nombre, limite) {
  const req = event.request;
  const cache = await caches.open(nombre);
  const guardada = await cache.match(req);
  if (guardada) return guardada;
  try {
    const res = await fetch(req);
    if (res.ok && !res.redirected && (res.type === 'basic' || res.type === 'cors')) {
      event.waitUntil(cache.put(req, res.clone()).then(() => recortar(nombre, limite)));
    }
    return res;
  } catch (e) {
    if (req.mode === 'navigate') return sinConexion(req);
    throw e;
  }
}

/** La copia guardada al momento y, por detrás, se pide otra a la red para la próxima vez. */
async function revalidar(event, nombre) {
  const cache = await caches.open(nombre);
  const guardada = await cache.match(event.request);
  const red = fetch(event.request)
    .then((res) => {
      if (res.ok || res.type === 'opaque') return cache.put(event.request, res.clone()).then(() => res);
      return res;
    })
    .catch(() => null);
  if (guardada) {
    event.waitUntil(red);
    return guardada;
  }
  return (await red) || Response.error();
}

async function sinConexion(req) {
  const url = new URL(req.url);
  const en = url.pathname === '/en' || url.pathname.startsWith('/en/') || url.searchParams.get('lang') === 'en';
  const pagina = await caches.match(en ? '/en/sin-conexion' : '/sin-conexion');
  return (
    pagina ||
    new Response('<!doctype html><meta charset="utf-8"><title>La Malkevnia</title><p>Sin conexión · Offline</p>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  );
}

/** Deja como mucho `limite` entradas (fuera las más antiguas). */
async function recortar(nombre, limite) {
  const cache = await caches.open(nombre);
  const claves = await cache.keys();
  for (let i = 0; i < claves.length - limite; i++) await cache.delete(claves[i]);
}
