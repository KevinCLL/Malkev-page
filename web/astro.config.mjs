// @ts-check
import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';
import vue from '@astrojs/vue';

// La nave entera se sirve en SSR con Node (modo standalone): un único proceso
// que el contenedor Docker arranca con `node dist/server/entry.mjs`.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://malkevnia.com',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [vue()],
  trailingSlash: 'ignore',
  server: { host: true, port: 4321 },
  // Secretos que se leen al arrancar el servidor (nunca se meten en el build).
  // En local salen de .env; en Docker, de las variables del contenedor.
  env: {
    schema: {
      DATABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      CATALOGO_API_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
