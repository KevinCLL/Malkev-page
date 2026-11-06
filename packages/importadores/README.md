# Importadores de la filmoteca y la biblioteca

Pasan las pelis, series, libros y manga de Malkev al catálogo de Malkevnia (PostgreSQL, ver
`packages/catalogo/db/migrations/001_esquema.sql` en la rama `claude/bdd-admin-…`), completando los
datos con **TMDB** (pelis y series) y **Open Library** (libros). El manga ya trae sus datos de AniList.

Node 22 o superior, sin dependencias: no hace falta `npm install`.

```bash
cd packages/importadores
cp .env.example .env            # y pon tu TMDB_API_KEY
node bin/importar.js --coleccion ../../poc/coleccion.json
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f salida/catalogo.sql
```

## Fuentes

| Opción | Qué lee | De dónde sale |
|---|---|---|
| `--coleccion poc/coleccion.json` | Todo lo que ya importó la POC (643 pelis, 189 series, 127 libros, 100 mangas) | `npm run coleccion:export` en `poc/` |
| `--filmaffinity 700344` | Valoraciones de Filmaffinity, descargándolas | Tu id de usuario. Filmaffinity suele responder 403 a los scripts. |
| `--filmaffinity carpeta/` | Las mismas páginas guardadas con Ctrl+S | `https://www.filmaffinity.com/es/userratings.php?user_id=ID&p=1&orderby=4&chv=list` (y p=2, 3…) |
| `--goodreads export.csv` | Biblioteca de Goodreads | *My Books → Import and export → Export library* |
| `--anilist Malkev` | Lista de manga, manhwa, manhua y novela ligera | API pública de AniList |
| `--csv mio.csv [--tipo libro]` | Lo que no está en ninguna web (DVD, la estantería física…) | Una hoja de cálculo exportada a CSV |

Las fuentes se combinan: `--coleccion poc/coleccion.json --goodreads export.csv --csv dvds.csv`. Las fichas
repetidas (mismo id de Filmaffinity, Goodreads, AniList, TMDB, Open Library o ISBN, o mismo título y año)
se juntan en una.

El CSV propio admite comas o punto y coma y estas columnas (en español o inglés; solo `titulo` es obligatoria):
`tipo` (peli, serie, libro, manga), `titulo`, `titulo_original`, `autor`/`director`, `año`, `nota` (0-10, admite
`8,5`), `estado` (visto, leído, leyendo, viendo, pendiente, tengo, pausado, abandonado), `notas`, `isbn`, `tmdb`,
`imdb`, `fecha`, `formato` (DVD, Blu-ray, tapa dura…), `estanteria`. Hay un ejemplo en `test/fixtures/propio.csv`.

## Enriquecimiento

- **TMDB** (pelis y series): necesita una clave gratuita en `TMDB_API_KEY` (la *API Key* v3 o el *Read Access
  Token* v4). Busca por título y año en español; si el título y el año cuadran y no hay otro candidato igual de
  bueno, la da por buena. Si duda, compara el director (o el creador, en series) para desempatar. Completa
  sinopsis en español, póster, fondo, géneros, duración o temporadas, título original e ids de TMDB e IMDb.
  Sin clave, las pelis y series salen tal cual, marcadas como *pendientes*.
- **Open Library** (libros): sin clave. Busca por ISBN y, si no, por título y autor (quitando coletillas de
  Goodreads como «(Mistborn, #2)» o «(Spanish Edition)»). Completa sinopsis, temas, páginas, año de primera
  publicación, id de la obra e ISBN. La portada de Goodreads se conserva si ya la había; la de Open Library queda
  en `meta.cover_url_openlibrary`. Va a una petición por segundo, como pide Open Library.

Las respuestas se guardan en `cache/`, así que repetir la importación es casi instantáneo y no gasta peticiones.
`--sin-red` trabaja solo con la caché; `--limite 20` enriquece solo las 20 primeras para probar.

## Salida (`salida/`)

- `fichas.json`: todas las fichas en el formato normalizado (abajo).
- `catalogo.sql`: SQL para el catálogo. Una transacción que se puede ejecutar varias veces sin duplicar:
  1. carga las fichas en una tabla temporal;
  2. actualiza las que ya existen (mismo tipo y algún id externo en común);
  3. inserta el resto con `ON CONFLICT (kind, slug) DO UPDATE`, salvo que el año diga que es otra obra.

  Al actualizar solo rellena huecos: lo que ya está en la base de datos (lo que hayas tocado en el panel) gana, y
  tus notas nunca se pisan. Con `--sobrescribir`, la nota, el estado y la portada importados mandan.
- `revisar.json`: las fichas sin emparejar claro, con sus candidatos (id, título, año y puntuación).
- `informe.md`: el resumen de la importación.

## Correcciones

`correcciones.json` (en la carpeta desde la que se ejecuta, o con `--correcciones`) fija a mano lo que el
emparejamiento automático no resuelve. La clave es `tipo/slug` (como sale en `revisar.json`) o un id externo:

```json
{
  "film/vertigo-1958": { "tmdb": 426 },
  "book/invariantes-spanish-edition": { "titulo": "Invariantes", "slug": "invariantes" },
  "book/el-hobbit": { "openlibrary": "OL262758W" },
  "filmaffinity:123456": { "ignorar": true },
  "series/heroes": { "año": 2006, "oculto": false, "destacado": true }
}
```

Admite `tmdb`, `openlibrary`, `titulo`, `titulo_original`, `autor`, `año`, `slug`, `tipo`, `estado`, `isbn`,
`imdb`, `oculto`, `destacado` e `ignorar`.

## Formato normalizado

```jsonc
{
  "kind": "film",                 // film | series | book | manga
  "slug": "vertigo",              // único por tipo; igual que el que genera el catálogo
  "title": "Vértigo",
  "original_title": "Fall",
  "creator": "Scott Mann",        // director, creadores, autor
  "year": 2022,
  "rating": 5,                    // 0-10
  "status": "done",               // owned | wishlist | reading | watching | done | paused | dropped
  "notes": "",
  "synopsis": "…",
  "cover_url": "https://image.tmdb.org/t/p/w500/….jpg",
  "color": null,                  // #rrggbb
  "genres": ["Suspense"],
  "details": { "runtime": 107 },  // páginas, tomos, temporadas, formato… → meta en la BDD
  "external_ids": { "filmaffinity": 968270, "tmdb": 985939, "imdb": "tt15325794" },
  "featured": false, "hidden": false,
  "started_on": null, "finished_on": null,
  "sources": ["filmaffinity", "tmdb"],
  "match": { "provider": "tmdb", "estado": "auto", "id": 985939, "score": 1 }
}
```

En la base de datos, `genres`, `details`, `sources` y el estado del emparejamiento van a `items.meta`
(`meta.genres`, `meta.import`), y el resto a sus columnas.

## Pruebas

```bash
node --test test/*.test.js
```

Usan ficheros de ejemplo y un `fetch` simulado: no necesitan red ni clave.
