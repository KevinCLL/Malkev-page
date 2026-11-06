// @ts-check
import { defineConfig, envField } from 'astro/config';
import { loadEnv } from 'vite';
import node from '@astrojs/node';
import vue from '@astrojs/vue';

// En desarrollo, /api/v1 (comentarios) y /admin (panel) se reenvían al catálogo, igual
// que hará el proxy del servidor en producción.
const { CATALOGO_API_URL } = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');
const catalogo = CATALOGO_API_URL ? new URL(CATALOGO_API_URL).origin : null;

// La nave entera se sirve en SSR con Node (modo standalone): un único proceso
// que el contenedor Docker arranca con `node dist/server/entry.mjs`.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://malkevnia.com',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [vue()],
  trailingSlash: 'ignore',
  server: { host: true, port: 4321 },
  vite: {
    // Versión del build: el service worker (src/pages/sw.js.ts) renueva sus cachés con cada una.
    // En Docker/CI se puede fijar con VERSION_NAVE (p. ej. el commit); si no, la fecha del build.
    define: { 'import.meta.env.VERSION_NAVE': JSON.stringify(process.env.VERSION_NAVE || new Date().toISOString()) },
    ...(catalogo
      ? { server: { proxy: { '/api/v1': { target: catalogo, changeOrigin: true }, '/admin': { target: catalogo, changeOrigin: true } } } }
      : {}),
  },
  // Secretos que se leen al arrancar el servidor (nunca se meten en el build).
  // En local salen de .env; en Docker, de las variables del contenedor.
  env: {
    schema: {
      DATABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      CATALOGO_API_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
