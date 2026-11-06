# La Malkevnia · imagen de la web (Astro SSR sobre Node).
# Se construye desde la raíz del repositorio para poder copiar ../assets (imágenes de los posts):
#   docker build -f web/Dockerfile -t malkevnia-web .
# (docker-compose.yml ya lo hace así.)

FROM node:22-alpine AS deps
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci

FROM deps AS build
COPY web/ ./
# Imágenes, audio y PDF que enlazan los posts antiguos (malkevnia.com/assets/...)
COPY assets ./public/assets
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
# TZ: las fechas de la bitácora se agrupan y muestran en hora de Madrid
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321 TZ=Europe/Madrid
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/db ./db
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/modulos ./modulos
USER node
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4321/api/salud >/dev/null || exit 1
# (docker-compose arranca con `init: true` para que las señales lleguen bien al proceso.)
# Aplica las migraciones pendientes y arranca el servidor.
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node dist/server/entry.mjs"]
