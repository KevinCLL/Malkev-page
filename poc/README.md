# Malkevnia · POC

La nueva Malkevnia: *La Malkevnia* es la nave, pequeña, surcando el espacio sola y en calma.
Todo funciona en local, con una base de datos SQLite que vive en un fichero dentro de `poc/data/`, una consola con contraseña y copias de seguridad de un comando. Es la versión de verdad, solo que todavía sin desplegar.

- **Puente**: la portada. Por el ventanal se ve, como en una foto desde órbita, el mundo al que va la nave: un gigante gaseoso, una roca o un mundo helado, con o sin anillos, con su luna, espacio negro con pocas estrellas, el destello del sol en la lente y, abajo, el morro de la Malkevnia en 3D (chapas, lomo, mástil y luces de posición) iluminado por el mismo sol; todo dibujado en shaders (WebGL, sin texturas ni librerías). **La nave está en ruta**: cada escala dura dos días, el planeta crece según se acerca y el HUD marca rumbo, distancia, llegada y siguiente escala (ver *La travesía*). Debajo, el **plano de la nave** en 2D: cada estancia en su sitio, con lo que hay dentro; se entra pasando por encima o tocando. Y *Ahora mismo a bordo*: lo que el capitán está leyendo, viendo y jugando. Si el navegador no tiene WebGL, quedan el planeta plano de CSS y la proa en SVG.
- **Bitácora**: el blog de verdad, con búsqueda de texto completo, secciones, años, etiquetas y comentarios con antispam.
  Trae importadas las 135 entradas de `_posts/` (las 35 con `published: false` entran como borradores, que solo se ven con la sesión iniciada).
- **Sala de juegos**: las dos Kallax 5×5 de casa, colocadas caja a caja como en las fotos: pilas, filas de pie, organizadores, huecos unidos con su barra y los libros de rol abajo. Toca un cubo para verlo de cerca y una caja para ver su ficha.
- **Sala de proyección**: la estantería de pelis y series, con vista de lomos o de carátulas, buscador, orden y un panel de datos (nota media, décadas, directores más vistos, las mejores).
- **Biblioteca**: libros con lomos de distinto grosor según sus páginas y mangas tomo a tomo, con filtros por estado (leído, leyendo, pendiente) y origen (manga, manhwa, manhua) y su panel de datos.
- **Sala recreativa**: los videojuegos, por máquina (plataforma), con los más jugados, las últimas partidas y los terminados. Se llena desde LaunchBox (ver abajo).
- **Ordenador de a bordo**: `Ctrl+K` (o `/`, o la lupa) abre un buscador global de estancias, entradas, etiquetas y toda la colección; con las flechas y Enter se va directo.
- **Consola** (`/consola`): con contraseña. Editor de entradas con texto enriquecido, moderación de comentarios (los que traen enlaces esperan aprobación), gestión de la colección, copia de seguridad y cambio de contraseña.

> Los **juegos de mesa, los libros de rol, las pelis, las series, los libros y el manga son los de verdad** (las Kallax leídas de las fotos; el resto importado de Filmaffinity, Goodreads y AniList). Los **videojuegos** todavía son de **ejemplo**: se cargan los de verdad desde LaunchBox con el script de abajo.

## Requisitos

- **Node.js 22.13 o superior** (recomendado el 24 LTS). Usa el SQLite que ya trae Node, así que no hay que instalar ninguna base de datos ni compilar nada.

## Arrancarla

```bash
git fetch origin claude/project-thread-6obski
git checkout claude/project-thread-6obski
cd poc
npm install
npm run seed     # crea la base de datos e importa el blog y la colección
npm run dev      # http://localhost:5173
```

La primera vez que entres en `/consola` te pedirá **crear la contraseña** del capitán (o ponla antes en `.env` como `ADMIN_PASSWORD`). Si la olvidas: `npm run consola:clave` la cambia desde el terminal.

`npm run seed` se puede repetir cuando quieras volver al estado inicial: **borra y recrea todo** (entradas, colección, comentarios), aunque conserva la contraseña y las sesiones.

Para probarla como iría en producción: `npm run build` y después `npm start`.

### Ajustes (`.env`)

Copia `.env.example` a `.env` en `poc/` y rellena lo que uses; todo es opcional: `PORT`, `ADMIN_PASSWORD` (solo para la primera vez), `COOKIE_SECURE=1` cuando vaya por HTTPS, `DATA_DIR` para guardar la base de datos en otra carpeta y las claves del botón **Buscar** (`TMDB_API_KEY`, `BGG_TOKEN`).

### Copias de seguridad

`npm run copia` guarda una copia íntegra de la base de datos en `data/copias/` con la fecha en el nombre (también se descarga desde la consola, en *Capitán → Copia de seguridad*). Las imágenes subidas están en `data/uploads/`: con copiar la carpeta `data/` entera está todo.

### Lo que protege la consola

- Contraseña con hash scrypt; sesión en una cookie `HttpOnly` de 30 días; se puede cerrar desde la consola y cambiar la contraseña invalida las demás sesiones.
- Cinco intentos fallidos seguidos y la consola se cierra un rato (cada vez más largo).
- Las escrituras solo aceptan peticiones del propio sitio (comprobación de origen), y las cabeceras de seguridad habituales van puestas.
- Comentarios: campo trampa, un sello firmado que caduca (el formulario tiene que llevar al menos tres segundos abierto), límite de tres por IP cada diez minutos y los que traen enlaces quedan **pendientes** hasta que el capitán los apruebe.

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

### Videojuegos desde LaunchBox

```bash
npm run import:launchbox -- "C:\Users\usuario\LaunchBox"
npm run import:launchbox -- "C:\Users\usuario\LaunchBox" --plataforma="Super Nintendo Entertainment System"
npm run import:launchbox -- "C:\Users\usuario\LaunchBox" --sin-caratulas
```

Lee los XML de `Data/Platforms/` (título, plataforma, año, desarrollador, editor, género, región, jugadores, nota, veces jugado, tiempo de juego, última partida, favorito, completado, oculto) y copia la carátula frontal de `Images/<plataforma>/Box - Front/` (o la reconstruida, la 3D, el fanart o la pantalla de título si no hay) a `data/uploads/videojuegos/`. Se puede repetir: cada juego se reconoce por su ID de LaunchBox, así que actualiza en vez de duplicar. Los favoritos salen como destacados y los ocultos no se enseñan.

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

## La travesía

La nave va de un mundo a otro y todo sale del reloj (`src/travesia.js`), así que dos personas que entren a la vez ven lo mismo y quien vuelva a los tres días la encontrará en otro sitio. Hay diez escalas en bucle (Izaro, Thalassa, Nix Áurea, Brasa Menor, Gélida, Umbra, Verdanza, Carmesí, Ceniza y Lumen), cada una de 48 horas: el planeta se ve lejos al zarpar, crece durante el viaje y el último tramo es en órbita. Cada mundo lleva su paleta, su tipo (gaseoso, rocoso o helado), anillos o no, luna o no y su propio cielo de fondo; el HUD del puente marca rumbo, distancia, llegada y siguiente escala.

Para ver una escala concreta sin esperar: `http://localhost:5173/?destino=3` (y `&tramo=0.95` para verla ya en órbita, o `0.1` recién zarpados).

## Cómo está hecha

- **Vue 3 + Vue Router + Vite**, sin librerías de componentes: los estilos, los iconos (SVG) y el cielo son propios. El cielo (`src/sky.js`) es un shader compartido por el fondo de toda la web y el ventanal del puente: se calcula una vez en una textura (negro profundo, estrellas nítidas de varios colores, la Vía Láctea con su polvo y nebulosas apenas insinuadas, como en una foto de larga exposición) más una galaxia espiral lejana y un cúmulo de estrellas, y cada fotograma solo la desplaza (deriva, scroll, ratón) y añade las estrellas brillantes y alguna estrella fugaz. En el ventanal el mismo cielo va casi sin estrellas, como cuando la cámara está expuesta para el planeta. Sin WebGL quedan los puntos de siempre en un canvas normal.
- **Editor**: TipTap, que solo pone el motor; la barra de herramientas y los estilos son nuestros. Se pueden pegar o arrastrar imágenes, que se guardan en `data/uploads/`. Conserva los vídeos, audios y tablas de las entradas antiguas.
- **Servidor**: Express con una API REST (`server/index.js`) sobre `node:sqlite` (`server/db.js`). SQLite se queda como base de datos de verdad: para un sitio de una persona sobra, es un solo fichero y las copias son triviales. La sesión, la contraseña y el antispam están en `server/auth.js` y `server/guard.js`, sin dependencias; el buscador global en `server/search.js` (FTS5 para las entradas).
- **Sonido ambiente**: el botón del altavoz genera un zumbido de motor suave con Web Audio, sin ficheros.

```
poc/
├── server/          API, base de datos, sesión, antispam, búsqueda y autocompletado
├── scripts/         importación del blog, de la colección y de LaunchBox; copias; contraseña
├── src/
│   ├── components/  estrellas, portadas generadas, editor, fichas…
│   ├── views/       cada estancia de la nave y la consola
│   └── styles/      el tema
└── data/            base de datos, imágenes subidas y copias (no se sube a git)
```

La base de datos es `data/malkevnia.db`; se puede abrir con [DB Browser for SQLite](https://sqlitebrowser.org/) para curiosear.

## Demo sin servidor

`npm run build:demo` genera en `dist-demo/` una versión que funciona sin servidor: copia la base de datos a un JSON dentro de la página (`src/demo/demoApi.js` hace de API) y los cambios se quedan en memoria. Es la que se publicó para enseñarla.

## Lo que falta

- Desplegarla (Docker en el servidor de Hetzner, con `COOKIE_SECURE=1` detrás de HTTPS y `DATA_DIR` en un volumen).
- Importar los videojuegos de verdad desde LaunchBox.
- Mover cajas de sitio desde la consola (ahora se cambia en `scripts/kallax-real.js`).
- Sacar las medidas exactas de las cajas de las versiones de BGG (ahora están estimadas a ojo).
