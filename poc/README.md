# Malkevnia · POC

Prueba de concepto de la nueva Malkevnia: una nave pequeña surcando el espacio, sola y en calma.
Todo funciona en local, con una base de datos SQLite que vive en un fichero dentro de `poc/data/`.

- **Puente**: la portada, con el ventanal, el planeta y los indicadores de a bordo.
- **Bitácora**: el blog de verdad, con búsqueda de texto completo, secciones, años, etiquetas y comentarios.
  Trae importadas las 135 entradas de `_posts/` (las 35 con `published: false` entran como borradores).
- **Sala de juegos**: la Kallax 4×4. Los favoritos van de frente y el resto en pilas; toca una caja para ver su ficha.
- **Sala de proyección**: la estantería de pelis y series, con vista de lomos o de carátulas.
- **Biblioteca**: libros con lomos de distinto grosor según sus páginas y mangas tomo a tomo.
- **Consola** (`/consola`): editor de entradas con texto enriquecido, moderación de comentarios y gestión de la colección.

> La colección (juegos, pelis, libros y manga) es de **ejemplo**. Se cambia desde la consola.

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

## Autocompletar la colección

Al añadir algo desde la consola, el botón **Buscar** rellena título, autoría, año y portada:

| Tipo | Servicio | Clave |
|---|---|---|
| Libros | Open Library | No hace falta |
| Manga | AniList | No hace falta |
| Pelis y series | TMDB | `TMDB_API_KEY` (gratis en themoviedb.org) |
| Juegos de mesa | BoardGameGeek | `BGG_TOKEN` si BGG la pide |

Las claves se pasan como variables de entorno al arrancar. En PowerShell:

```powershell
$env:TMDB_API_KEY = "tu-clave"; npm run dev
```

## Cómo está hecha

- **Vue 3 + Vue Router + Vite**, sin librerías de componentes: los estilos, los iconos (SVG) y el fondo de estrellas (canvas) son propios.
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
- Importar la colección real (BGG, CSV de Goodreads, votos de Filmaffinity).
- Moderación de comentarios con antispam de verdad (ahora solo hay un campo trampa).
