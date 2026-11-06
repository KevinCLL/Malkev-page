# Catálogo de Malkevnia

La base de datos de la nueva malkevnia.com: el **catálogo** (juegos de mesa, rol, pelis, series, libros, manga y
videojuegos), las **colecciones** que los colocan en la nave (las dos Kallax, la filmoteca, la biblioteca…), las
**etiquetas**, el **historial de notas** y la **bitácora** con sus comentarios. Incluye una API para que la web
(Astro) lo lea y la **consola del capitán**, el panel de administración.

> Paquete independiente dentro del repo del blog. No toca el Jekyll de `master`: `_config.yml` excluye `packages/`.

- **PostgreSQL 16**, propio, sin depender de Goodreads ni Filmaffinity. Esquema en [`db/migrations/`](db/migrations/).
- **API** en Node + Express (`server/`), documentada en [API.md](API.md).
- **Panel** en Vue 3 sin librerías de componentes (`admin/`): todo hecho a mano con la estética de la nave.
  El editor de texto es TipTap en modo headless, con la barra y los estilos nuestros.

## Ponerlo en marcha

Hace falta Node 22 y Docker (o un PostgreSQL 16 cualquiera).

```bash
cd packages/catalogo
cp .env.example .env          # y pon ADMIN_PASSWORD, y TMDB_API_KEY si quieres autocompletar pelis
npm install
npm run db:up                 # PostgreSQL en Docker, en localhost:5432
npm run seed                  # crea las tablas y carga todo lo que ya existe
npm run dev                   # http://localhost:4400/admin
```

`npm run seed` carga:

- los **135 posts** de `_posts/` (100 publicados y 35 en borrador, como en Jekyll), con sus etiquetas, sus URLs de
  siempre y las redirecciones antiguas de WordPress;
- la **colección real** que exportó el POC (`seed/coleccion.json`): 643 pelis, 189 series, 127 libros, 100 manga y
  2.900 videojuegos;
- las **dos Kallax** leídas de las fotos (`seed/kallax-real.js`): 220 juegos de mesa y 90 libros de rol, cada uno en su
  hueco;
- tres colecciones base: filmoteca, biblioteca y lista de deseos.

Se puede repetir sin duplicar nada. `npm run seed -- --reset` vacía catálogo y blog antes de cargar (la cuenta del
capitán se queda) y `--solo=posts|coleccion|kallax` carga solo una parte.

Las portadas de los videojuegos apuntan a `/uploads/videojuegos/…`, que eran imágenes locales de LaunchBox en el POC:
copia esa carpeta (`poc/data/uploads/videojuegos`) dentro de `uploads/` y se verán. Mientras, el panel enseña una tapa
generada.

### La cuenta del capitán

Hay una sola. Se crea con `ADMIN_PASSWORD` en el `.env` la primera vez que arranca el servidor, o en cualquier momento
con `npm run capitan` (también sirve para cambiar la contraseña si se olvida). Desde el panel, en Ajustes.

## Qué hay en el panel

- **Puente**: recuentos, comentarios por revisar, borradores y lo que tienes en curso.
- **Catálogo**: filtros por tipo, estado, etiqueta y visibilidad, búsqueda sin tildes, ordenar por nota o fecha, y
  cambios en bloque (ocultar, destacar, borrar).
- **Ficha**: al añadir algo se busca por título en Open Library, TMDB, AniList o BoardGameGeek y se rellenan portada,
  autoría, año y sinopsis. Tú pones la nota (con historial y reseña), el estado, las fechas, las etiquetas y dónde va.
- **Colecciones**: el mueble hueco a hueco (respeta los huecos dobles de las Kallax), lo que hay dentro, reordenar
  arrastrando y añadir desde el catálogo.
- **Etiquetas**: renombrar, color, fusionar y borrar.
- **Bitácora**: editor con imágenes arrastrando o pegando, borradores, programar la publicación, enlazar cosas del
  catálogo, portada y URLs antiguas. `Ctrl+S` guarda.
- **Comentarios**: aprobar, ocultar, spam y responder como capitán.

## Para Astro (y la nave 3D)

Lee la API pública: [API.md](API.md). Lo básico:

```js
const API = import.meta.env.CATALOGO_URL ?? 'http://localhost:4400/api/v1'
const { posts } = await fetch(`${API}/posts?limit=12`).then((r) => r.json())
const kallax = await fetch(`${API}/collections/kallax-1`).then((r) => r.json())
```

- Rutas de la bitácora: `post.path` es `/blog/AAAA/MM/DD/slug/`, la misma de Jekyll.
- Para URLs desconocidas: `GET /posts/resolve?path=…` dice si hay que redirigir.
- Fichas: `/{kind}/{slug}` → `GET /items/:kind/:slug`.

## Despliegue en el Hetzner

`docker compose --profile api up -d --build` levanta PostgreSQL y este servidor (que aplica las migraciones al
arrancar) en `127.0.0.1:4400`. El proxy inverso que ya tenga el servidor (Caddy, Traefik o Nginx) sirve `/admin`,
`/api` y `/uploads` hacia ahí, con HTTPS: la cookie de sesión se marca `Secure` cuando llega por HTTPS. El seed se
lanza desde fuera del contenedor (necesita `_posts/`), apuntando `DATABASE_URL` a esa base de datos.

El puerto por defecto es el 4400 para no chocar con Astro, que usa el 4321.

Pendiente para producción: copias de seguridad diarias (`pg_dump` + `uploads/`) fuera del servidor, y poner
`POSTGRES_PASSWORD` y `APP_SECRET` propios en el entorno.

## Scripts

| | |
|---|---|
| `npm run db:up` / `db:down` | PostgreSQL en Docker |
| `npm run migrate` | Aplica las migraciones pendientes (cada una en su transacción) |
| `npm run seed` | Carga los datos existentes |
| `npm run capitan` | Crea la cuenta o cambia la contraseña |
| `npm run dev` | API + panel con recarga en caliente |
| `npm run build` / `npm start` | Panel compilado en `dist/` y servidor de producción |
| `npm test` | Pruebas de la API contra `TEST_DATABASE_URL` (una base de datos que se vacía) |

## Esquema

```
items ─┬─ item_ratings      historial de notas (lo rellena un trigger al cambiar items.rating)
       ├─ item_tags ── tags ── post_tags ── posts ─┬─ comments
       ├─ collection_items ── collections          └─ post_items ── items
media · admin_users · admin_sessions · settings · schema_migrations
```

Búsqueda con `tsvector` generado (configuración `spanish` para textos y `simple` para títulos, sin tildes vía
`unaccent`) más trigramas para buscar por trozos de título. La vista `public_posts` es lo que puede ver cualquiera.

Los importadores de Filmaffinity, Goodreads y AniList (hilo aparte, `packages/importadores`) escriben en `items` con
`ON CONFLICT (kind, slug)`: el slug se genera con `slugify()` de `server/lib/text.js`.
