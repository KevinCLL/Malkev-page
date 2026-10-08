# Malkevnia · POC

Prueba de concepto de la nueva Malkevnia: *La Malkevnia* es la nave, pequeña, surcando el espacio sola y en calma.
Todo funciona en local, con una base de datos SQLite que vive en un fichero dentro de `poc/data/`.

- **Puente**: la portada. Por el ventanal se ve, como en una foto desde órbita, un gigante gaseoso con su luna, espacio negro con pocas estrellas, el destello del sol en la lente y, abajo, el morro de la Malkevnia en 3D (chapas, lomo, mástil y luces de posición) iluminado por el mismo sol; todo dibujado en shaders (WebGL, sin texturas ni librerías). Si el navegador no tiene WebGL, quedan el planeta plano de CSS y la proa en SVG.
- **Bitácora**: el blog de verdad, con búsqueda de texto completo, secciones, años, etiquetas y comentarios.
  Trae importadas las 135 entradas de `_posts/` (las 35 con `published: false` entran como borradores).
- **Sala de juegos**: las dos Kallax 5×5 de casa, colocadas caja a caja como en las fotos: pilas, filas de pie, organizadores, huecos unidos con su barra y los libros de rol abajo. Toca un cubo para verlo de cerca y una caja para ver su ficha.
- **Sala de proyección**: la estantería de pelis y series, con vista de lomos o de carátulas.
- **Biblioteca**: libros con lomos de distinto grosor según sus páginas y mangas tomo a tomo.
- **Consola** (`/consola`): editor de entradas con texto enriquecido, moderación de comentarios y gestión de la colección.

> Los **juegos de mesa y los libros de rol son los de verdad**, leídos de las fotos de las Kallax. Las pelis, los libros y el manga todavía son de **ejemplo**: se cargan los de verdad con los scripts de importación de abajo.

## Requisitos

- **Node.js 22.13 o superior** (recomendado el 24 LTS). Usa el SQLite que ya trae Node, así que no hay que instalar ninguna base de datos ni compilar nada.

## Arrancarla

```bash
git fetch origin claude/project-thread-6obski
git checkout claude/project-thread-6obski
cd poc
npm install
npm run seed     # crea la base de datos e importa el blog y la colección de ejemplo
npm run dev      # http://localhost:5173
```

`npm run seed` se puede repetir cuando quieras volver al estado inicial: **borra y recrea todo**, incluidos los cambios hechos en la consola.

Para probarla como iría en producción: `npm run build` y después `npm start`.

## Las Kallax

Todo lo que hay en las dos Kallax está descrito en `scripts/kallax-real.js`: cada cubo con sus pilas (de abajo arriba), lo que está de pie (de izquierda a derecha), los organizadores, las barras de apoyo, los pósits y las pegatinas. Las medidas de cada caja son fracciones del hueco de un cubo, estimadas en las fotos.

- `npm run kallax:lista` escribe `kallax-inventario.md` con la lista cubo a cubo y las dudas numeradas.
- Para corregir algo (una duda, una caja que se ha movido), se edita ese fichero y se vuelve a lanzar `npm run seed`.
- En la sala de juegos, los botones **Con pósit**, **Con pegatina** y **Dudas** iluminan esas cajas en las Kallax.

## Importar pelis, libros y manga

Estos scripts se ejecutan en tu ordenador, con tu propia conexión, y se pueden repetir: lo que ya estaba se actualiza en vez de duplicarse (conservando las notas que hayas escrito en la consola).

| Qué | Cómo | De dónde |
|---|---|---|
| Libros | `npm run import:goodreads -- goodreads_library_export.csv` | Goodreads: *My Books* → *Import and export* → *Export library* |
| Libros (sin el CSV) | `npm run import:goodreads-web -- 36779615` | El RSS público de las estanterías de Goodreads |
| Manga, manhwa, manhua | `npm run import:anilist -- Malkev` | La API pública de AniList (lista de manga) |
| Pelis y series | `npm run import:filmaffinity -- 700344` | Filmaffinity, descargando las páginas de valoraciones del usuario |
| Pelis y series (si lo anterior falla) | `npm run import:filmaffinity -- carpeta/` | Las mismas páginas guardadas en una carpeta (Filmaffinity responde 403 al `fetch` de Node pero no a `curl` con un User-Agent de navegador, añadiendo `&chv=list` a la URL) |

Filmaffinity no tiene API ni exportación y cambia su HTML de vez en cuando: el script enseña una muestra de lo que ha leído para comprobar que tiene sentido.

La colección importada viaja entre ordenadores en `coleccion.json` (está en git): después de importar, `npm run coleccion:export` lo escribe; en otro sitio, `npm run coleccion:import` lo carga, y `npm run seed` también lo carga si existe, sustituyendo a los ejemplos de esos tipos.

## Autocompletar la colección

Al añadir algo desde la consola, el botón **Buscar** rellena título, autoría, año y portada:

| Tipo | Servicio | Clave |
|---|---|---|
| Libros | Open Library | No hace falta |
| Manga | AniList | No hace falta |
| Pelis y series | TMDB | `TMDB_API_KEY` (gratis en themoviedb.org) |
| Juegos de mesa | BoardGameGeek | `BGG_TOKEN` si BGG la pide |
| Libros de rol | Open Library | No hace falta |

Las claves se pasan como variables de entorno al arrancar. En PowerShell:

```powershell
$env:TMDB_API_KEY = "tu-clave"; npm run dev
```

## Cómo está hecha

- **Vue 3 + Vue Router + Vite**, sin librerías de componentes: los estilos, los iconos (SVG) y el cielo son propios. El cielo (`src/sky.js`) es un shader compartido por el fondo de toda la web y el ventanal del puente: se calcula una vez en una textura (negro profundo, estrellas nítidas de varios colores, la Vía Láctea con su polvo y nebulosas apenas insinuadas, como en una foto de larga exposición) más una galaxia espiral lejana y un cúmulo de estrellas, y cada fotograma solo la desplaza (deriva, scroll, ratón) y añade las estrellas brillantes y alguna estrella fugaz. En el ventanal el mismo cielo va casi sin estrellas, como cuando la cámara está expuesta para el planeta. Sin WebGL quedan los puntos de siempre en un canvas normal.
- **Editor**: TipTap, que solo pone el motor; la barra de herramientas y los estilos son nuestros. Se pueden pegar o arrastrar imágenes, que se guardan en `data/uploads/`. Conserva los vídeos, audios y tablas de las entradas antiguas.
- **Servidor**: Express con una API REST (`server/index.js`) sobre `node:sqlite` (`server/db.js`). El esquema es SQL estándar para pasarlo a PostgreSQL sin dolor.
- **Sonido ambiente**: el botón del altavoz genera un zumbido de motor suave con Web Audio, sin ficheros.

```
poc/
├── server/          API, base de datos y autocompletado
├── scripts/         importación del blog y colección de ejemplo
├── src/
│   ├── components/  estrellas, portadas generadas, editor, fichas…
│   ├── views/       cada estancia de la nave y la consola
│   └── styles/      el tema
└── data/            base de datos e imágenes subidas (no se sube a git)
```

La base de datos es `data/malkevnia.db`; se puede abrir con [DB Browser for SQLite](https://sqlitebrowser.org/) para curiosear.

## Demo sin servidor

`npm run build:demo` genera en `dist-demo/` una versión que funciona sin servidor: copia la base de datos a un JSON dentro de la página (`src/demo/demoApi.js` hace de API) y los cambios se quedan en memoria. Es la que se publicó para enseñarla.

## Lo que falta para la versión de verdad

- Inicio de sesión para la consola (ahora está abierta porque es local).
- Pasar de SQLite a PostgreSQL y desplegarlo con Docker en el servidor de Hetzner.
- Mover cajas de sitio desde la consola (ahora se cambia en `scripts/kallax-real.js`).
- Sacar las medidas exactas de las cajas de las versiones de BGG (ahora están estimadas a ojo).
- Importar el resto de la colección real (CSV de Goodreads, votos de Filmaffinity).
- Moderación de comentarios con antispam de verdad (ahora solo hay un campo trampa).
