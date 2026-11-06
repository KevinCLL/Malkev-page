# La Malkevnia · nueva malkevnia.com

La web de Malkev como una nave espacial: cada sección es una sala. Astro en modo
servidor (Node) + PostgreSQL, empaquetado en Docker para su servidor Hetzner.

> Estado: **en preparación**. La web en vivo sigue siendo la de Jekyll (raíz del repo,
> GitHub Pages). Esta carpeta está excluida de Jekyll en `_config.yml`.

## Arrancar en local

```bash
cd web
npm install
npm run dev          # http://localhost:4321
```

Sin base de datos ya funciona: la bitácora sale del módulo `modulos/bitacora/posts.json`.
Para probar con PostgreSQL:

```bash
cp .env.example .env               # cambia POSTGRES_PASSWORD
docker compose up -d --build       # web en 127.0.0.1:4321 + PostgreSQL
docker compose exec web node scripts/seed.mjs   # carga la bitácora en la BDD
```

## Salas y rutas

Cada sala monta, por orden: la **nave unificada** abierta en esa sala (cuando exista
`modulos/nave-unificada/`), o su **módulo suelto**, o un marcador "Sala en obras".

| Ruta | Sala | En la nave unificada | Módulo suelto (carpeta · página) |
| --- | --- | --- | --- |
| `/` | Puente de mando (portada) | | página Astro |
| `/nave` | Paseo por la nave en 3D | inicio | `nave-3d` · `index.html` |
| `/bitacora`, `/bitacora/<slug>` | Bitácora del capitán | | páginas Astro (API del catálogo, PostgreSQL o `bitacora/posts.json`) |
| `/sala-de-juegos` | Las Kallax con los juegos de mesa | `#sala=juegos` | `kallax-3d` · `index.html` |
| `/sala-recreativa` | Máquinas recreativas | `#sala=recreativa` | — (solo dentro de la nave) |
| `/sala-de-proyeccion` | Filmoteca | `#sala=proyeccion` | `sala-cine` · `index.html` |
| `/biblioteca` | Libros y manga | `#sala=biblioteca` | `libreria-3d` · `index.html` |
| `/ordenador` | Ordenador de a bordo | `#sala=ordenador` | `ordenador-abordo` · `ordenador-de-a-bordo.html` (sin nada, terminal Vue mínima) |
| `/plano` | Plano de la nave | `#plano` | `mapa-nave` · `demo.html` |
| `/rumbo` | El universo de La Malkevnia | `#modo=universo` | `universo-3d` · `index.html` |
| `/vuelo-libre` | Pilotar la nave | `#modo=vuelo` | `vuelo-libre` · `index.html` |
| `/planetas` | Planetas procedurales | | `planetas-procedurales` · `demo.html` |
| `/museos` | Museos de los hobbies | | `planetas-hobby` · `index.html` |
| `/sala-de-maquinas` | Rendimiento y diagnóstico | `#sala=maquinas` | `rendimiento` · `demo/index.html` |
| `/consola` | Panel de administración (`/admin` del catálogo) | | — |

Con la nave unificada, un fragmento en la URL de la web pasa tal cual a la nave
(`/nave#museo=thalassa`), y cuando el visitante camina a otra sala la nave avisa por
`postMessage` (`{ fuente: 'malkevnia', evento: 'room', detalle: { id } }`) y la URL y el
título de la web cambian a esa sala. Si un módulo navega a una página de la web, esa
página sale del iframe; para incrustarla a propósito, añade `?embebido` a su URL.

Los módulos que solo son librerías (`audio-nave`, `controles-moviles`, `multijugador`,
`civilizaciones`, `sistemas-estelares`) no tienen sala propia: los usan la nave y el universo.

El registro está en [`src/lib/salas.ts`](src/lib/salas.ts) (sin dependencias, se puede
importar desde las pruebas). Cada ruta tiene su página en `src/pages/<ruta>.astro`.
Rutas extra: `/feed.xml` (RSS), `/sitemap.xml`, `/api/salud` (salud para Docker:
`{ estado, baseDeDatos, catalogo }`) y redirecciones 301 desde las URL antiguas
(Jekyll `/blog/AAAA/MM/DD/slug/`, `/blog.html`, `/archivo.html`; WordPress `/?p=…`).

## Módulos

Los demás hilos del proyecto construyen cada sala como un **módulo**: una carpeta
`/mnt/project-files/modulos/<nombre>/` con su página de entrada y sus ficheros, sin
build. Para traerlos:

```bash
npm run modulos:sync     # espejo de /mnt/project-files/modulos/*, nave-3d y universo-3d en web/modulos/
```

La copia deja fuera capturas de pantalla y scripts de generación (`.py`). Se sirven en
`/modulos/<nombre>/…` con ETag (el navegador revalida y recibe 304 si no han cambiado).
La carpeta y la página de cada sala están en `src/lib/salas.ts` (`modulo` y `entrada`):
léelas del README de cada módulo. Las rutas relativas entre módulos que asumen la
estructura de la carpeta del proyecto (`nave-3d/modulos/audio-nave/…`,
`nave-3d/universo-3d/…`) se resuelven solas.
Los módulos de solo datos (como `bitacora/posts.json`) los leen las páginas Astro.

## Seguridad

`src/middleware/` añade a todas las respuestas `Content-Security-Policy: frame-ancestors 'self'`
(solo nuestras salas pueden meter la web en un iframe), `X-Content-Type-Options: nosniff` y
`Referrer-Policy`. Los secretos (`DATABASE_URL`, `CATALOGO_API_URL`) se leen al arrancar con
`astro:env` y nunca quedan dentro de `dist/`.

## Base de datos

La fuente de verdad será la **API del catálogo** (hilo de base de datos y panel, PR #4,
`packages/catalogo`): define `CATALOGO_API_URL` y la bitácora sale de ahí. El esquema
propio de `db/migrations/` es provisional y se retirará cuando el catálogo entre en
el `docker-compose.yml`.

Migraciones SQL en `db/migrations/`, aplicadas en orden por `npm run db:migrate`
(el contenedor lo hace solo al arrancar). Tablas: `entradas` (bitácora),
`comentarios` y `piezas` (juegos de mesa, videojuegos, películas, series, libros, manga).

## Despliegue

Ver [DESPLIEGUE.md](DESPLIEGUE.md).
