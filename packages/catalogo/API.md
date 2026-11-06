# API del catálogo · v1

Base: `/api/v1`. Respuestas en JSON. Fechas en ISO 8601 (UTC); las de solo día (`started_on`, `finished_on`) como `AAAA-MM-DD`.
Los errores llegan como `{ "error": "mensaje en castellano" }` con su código HTTP (400, 401, 403, 404, 409, 429…).

La parte **pública** es de solo lectura (más enviar comentarios), no necesita sesión y nunca devuelve lo oculto
(`hidden`), las notas privadas (`notes`), los borradores ni el correo de quien comenta. Se puede cachear: lleva
`Cache-Control: public, max-age=60`. Para llamarla desde el navegador en otro origen, añade ese origen a `CORS_ORIGINS`.
Astro en modo servidor, en el mismo Hetzner, la llama por la red interna y no necesita CORS.

## Tipos y estados

| `kind` | | `status` | |
|---|---|---|---|
| `boardgame` | Juego de mesa | `owned` | En la colección |
| `rpg` | Libro de rol | `wishlist` | Lo quiero |
| `film` | Película | `reading` / `watching` / `playing` | En curso |
| `series` | Serie | `done` | Terminado |
| `book` | Libro | `paused` | Aparcado |
| `manga` | Manga | `dropped` | Abandonado |
| `videogame` | Videojuego | | |

`GET /api/v1` devuelve también estas etiquetas en castellano.

## Item

```json
{
  "id": 628, "kind": "film", "slug": "blade-runner",
  "title": "Blade Runner", "original_title": null, "creator": "Ridley Scott", "year": 1982,
  "synopsis": "", "cover_url": "https://…", "color": "#2a2a2a",
  "rating": 10, "status": "done", "featured": false,
  "started_on": null, "finished_on": "2024-03-02",
  "external_ids": { "filmaffinity": 358476, "tmdb": 78 },
  "meta": { "minutes": 117 },
  "tags": [{ "slug": "ciencia-ficcion", "name": "ciencia ficción", "color": null }],
  "created_at": "…", "updated_at": "…"
}
```

- La URL natural de una ficha es `/{kind}/{slug}`: el slug es único dentro de cada tipo.
- `rating` es la nota actual (0-10, o `null`). El historial va en la ficha (`ratings`).
- `color` es el color dominante, para generar lomos y cajas cuando no hay portada.
- `external_ids`: `tmdb`, `imdb`, `filmaffinity`, `openlibrary`, `isbn`, `goodreads`, `anilist`, `bgg`, `launchbox`…
- `meta` depende del tipo: `pages`, `volumes_owned`, `volumes_total`, `platform`, `players`, `minutes`, `genres`…

## Pública

### `GET /items`
Lista paginada: `{ "total": 643, "items": [Item…] }`.

| Parámetro | |
|---|---|
| `kind` | Uno o varios separados por comas: `kind=book,manga` |
| `status` | Igual: `status=reading,watching,playing` |
| `tag` | Slug de etiqueta (se puede repetir separando por comas: deben tenerlas todas) |
| `collection` | Slug de colección |
| `q` | Búsqueda por título, título original, autoría y sinopsis, sin tildes |
| `featured` | `true` / `false` |
| `rated` | `true`: solo con nota |
| `year` | Año exacto |
| `external` | `fuente:id`, p. ej. `external=tmdb:603` |
| `sort` | `title` (defecto), `-title`, `year`, `-year`, `rating`, `-rating`, `-updated`, `-created`, `-finished` |
| `limit`, `offset` | Por defecto 24, máximo 200 |

### `GET /items/:kind/:slug`
Un Item más:
- `ratings`: `[{ id, score, review, rated_at }]`, la más reciente primero.
- `collections`: dónde está, `[{ slug, name, kind, room, row, col, position, placement }]`.
- `posts`: entradas que hablan de él, `[{ slug, title, path, published_at }]`.

### `GET /collections`
`{ "collections": [{ id, slug, name, kind, description, room, rows, cols, position, item_count, updated_at }] }`

`kind` de colección: `kallax`, `shelf` (estantería), `bookcase` (librería), `list`. `room` es la estancia de la nave
(`sala-recreativa`, `proyeccion`, `biblioteca`…).

Las que crea el seed: `kallax-1`, `kallax-2` (las Kallax reales, hueco a hueco), `filmoteca`, `biblioteca`, `lista-de-deseos`.

### `GET /collections/:slug`
La colección con `total` e `items`: cada Item lleva `slot: { row, col, position, placement, note }` y la lista viene
ordenada por fila, columna y posición. `row` y `col` empiezan en 1 (fila 1 = arriba, columna 1 = izquierda);
`null` es "sin hueco" (encima del mueble, suelto…).

Las Kallax traen además `layout` con la colocación exacta que leímos en las fotos: `{ top: [grupo…], cubes: [cubo…] }`.
Cada cubo es `{ row, col, rows, cols, rods, organizer, tierSizes, tiers: [[grupo…]…], aside }` (`rows`/`cols` > 1 si es
un hueco doble). Cada grupo es `{ type: 'stack'|'row'|'bridge'|'face'|'deco', items: […], above?, on?, groups? }` y cada
caja es `{ item: <id de items>, w, h, color, upright?, face? }`, con `w` y `h` en fracciones del hueco (33 cm).
La decoración (la tele, peluches…) no tiene `item`: `{ deco, label, w, h }`. Es el mismo formato que usa el POC para
dibujar la Kallax.

Admite `limit` y `offset` (por defecto devuelve todo, hasta 5000).

### `GET /tags`
`{ "tags": [{ id, slug, name, color, item_count, post_count }] }`. Las etiquetas son compartidas por items y entradas.

### `GET /posts`
`{ "total": 100, "posts": [Resumen…] }`, de la más nueva a la más antigua.

```json
{
  "id": 135, "slug": "proyecto-arca-trasfondo", "title": "Proyecto Arca — El mundo de Izaro",
  "description": "…", "cover_url": null, "category": "Bitácora", "status": "published",
  "published_at": "2026-05-25T11:00:00.000Z", "updated_at": "…",
  "path": "/blog/2026/05/25/proyecto-arca-trasfondo/",
  "word_count": 5142, "reading_minutes": 26, "comment_count": 0,
  "tags": [{ "slug": "rol", "name": "rol" }]
}
```

Filtros: `tag`, `q` (texto completo en castellano), `year`, `category`, `item` (id de un item enlazado), `limit`
(12 por defecto, máximo 500) y `offset`.

`path` es la URL de siempre de Jekyll (`/blog/AAAA/MM/DD/slug/`), así que los enlaces viejos siguen valiendo. Las
programadas aparecen solas cuando llega su hora.

### `GET /posts/archive`
`{ "years": [{ "year": 2026, "posts": 12 }, …] }`

### `GET /posts/resolve?path=…`
Convierte una URL antigua (de Jekyll o de WordPress, como `/?p=1038/`) en la entrada:
`{ "slug", "path", "redirect": true }`. Si `redirect` es `true`, hay que redirigir (301) a `path`. Recuerda codificar
la ruta: `path=%2F%3Fp%3D1038%2F`.

### `GET /posts/:slug`
El resumen más `content_html`, `allow_comments`, `aliases`, `items` (cosas del catálogo enlazadas), `prev` y `next`
(`{ slug, title, path }` o `null`).

`content_html` viene del editor del panel (o de convertir el Markdown de Jekyll) y es de confianza: se pinta tal cual.

### `GET /posts/:slug/comments`
`{ "allow_comments": true, "comments": [{ id, parent_id, author, website, body, is_captain, created_at }], "token": "…" }`

`body` es texto plano: escápalo al pintarlo y respeta los saltos de línea. `parent_id` apunta al comentario al que
responde; `is_captain` marca las respuestas de Malkev.

### `POST /posts/:slug/comments`
```json
{ "author": "Tripulante", "body": "¡Buen viaje!", "email": "opcional", "website": "opcional", "parent_id": null, "token": "<el de GET>", "url_trampa": "" }
```
Devuelve `201 { id, status: "pending", message }`: todo queda pendiente hasta que el capitán lo aprueba. El `token` se
pide con el `GET` al abrir la entrada y caduca a las 24 horas. `url_trampa` es un campo invisible para personas: si
llega relleno, se descarta en silencio. Límite: 5 comentarios cada 10 minutos por IP.

### `GET /stats`
Recuentos por tipo, por estado, histograma de notas, `now_on_board` (lo que está en curso) y `blog: { published, comments }`.

## Panel (`/admin`)

Todo lo de debajo necesita la cookie de sesión (`POST /auth/login`) y solo acepta peticiones del mismo origen. Lo usa
el panel en `/admin/`; está aquí por si algún script lo necesita.

| | |
|---|---|
| `GET /auth` | `{ configured, captain }` |
| `POST /auth/login` | `{ username, password }` → cookie `malkevnia_capitan` (HttpOnly, SameSite=Strict, 30 días) |
| `POST /auth/logout` | |
| `POST /auth/password` | `{ current, password }`; cierra las demás sesiones |
| `GET /admin/stats` | Como `/stats`, con borradores, programadas y comentarios pendientes |
| `GET /admin/lookup?kind=&q=` | Autocompletado: Open Library (libros, rol), TMDB (pelis, series; necesita `TMDB_API_KEY`), AniList (manga), BoardGameGeek |
| `GET /admin/items` | Como el público, más `hidden=true|false` y con `notes` y `hidden` en cada item (máx. 500) |
| `POST /admin/items` | Crea. Campos de Item más `tags: ["nombre"…]` y `collections: ["slug"…]` |
| `GET/PATCH/DELETE /admin/items/:id` | `PATCH` cambia solo los campos que mandes |
| `POST /admin/items/:id/ratings` | `{ score, review }`: pone nota y la apunta en el historial |
| `DELETE /admin/items/:id/ratings/:ratingId` | |
| `POST /admin/items/bulk` | `{ ids, patch }` o `{ ids, action: "delete" }` |
| `GET/POST /admin/tags`, `PATCH/DELETE /admin/tags/:id` | |
| `POST /admin/tags/:id/merge` | `{ into }`: pasa todo a otra etiqueta y borra esta |
| `GET/POST /admin/collections`, `GET/PATCH/DELETE /admin/collections/:id` | |
| `PUT /admin/collections/:id/items` | `{ items: [{ item_id, position, row, col, placement, note }] }` sustituye el contenido |
| `POST /admin/collections/:id/items` | Un `{ item_id, row, col, placement }` |
| `DELETE /admin/collections/:id/items/:itemId` | |
| `GET/POST /admin/posts`, `GET/PATCH/DELETE /admin/posts/:id` | `status`: `draft`, `scheduled` (con `published_at` futura) o `published`. Admite `tags`, `item_ids`, `aliases`, `content_json` (documento de TipTap) |
| `GET /admin/comments?status=` | `pending`, `visible`, `hidden`, `spam`, con `counts` |
| `PATCH /admin/comments/:id` | `{ status }` o `{ body }` |
| `POST /admin/comments/:id/reply` | `{ body }`: responde como capitán (y aprueba el original) |
| `POST /admin/media?name=` | Cuerpo = la imagen (`Content-Type: image/…`, hasta 15 MB) → `{ url: "/uploads/…" }` |
